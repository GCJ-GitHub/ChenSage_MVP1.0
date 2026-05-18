#!/bin/bash
# ============================================
# 晨枢 AI (ChenSage) — 一键启动脚本
# 用法: bash start.sh
# ============================================
set +e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
VENV="$PROJECT_ROOT/.venv"
API_DIR="$PROJECT_ROOT/apps/api"
WEB_DIR="$PROJECT_ROOT/apps/web"
LOG_DIR="$PROJECT_ROOT/logs"

# 检测是否在 Windows CMD 下运行（WSL 通过 wsl.exe 调用）
# 如果 stdout 不是终端，关闭颜色输出
if [ -z "$WSL_DISTRO_NAME" ] || [ ! -t 1 ]; then
    PLAIN=true
else
    PLAIN=false
fi

if [ "$PLAIN" = true ]; then
    log()  { echo "[ChenSage] $1"; }
    ok()   { echo "[OK] $1"; }
    warn() { echo "[WARN] $1"; }
    err()  { echo "[ERR] $1"; }
else
    RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
    log()  { echo -e "${CYAN}[ChenSage]${NC} $1"; }
    ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
    warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
    err()  { echo -e "${RED}[ERR]${NC} $1"; }
fi

cleanup() {
    log "正在关闭服务..."
    bash "$SCRIPT_DIR/stop.sh" --no-prompt
    exit 0
}
trap cleanup SIGINT SIGTERM

port_pids() {
    local port="$1"
    {
        if command -v ss >/dev/null 2>&1; then
            ss -tlnp 2>/dev/null | grep ":$port " | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p'
        fi
        if command -v lsof >/dev/null 2>&1; then
            lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null
        fi
        if command -v fuser >/dev/null 2>&1; then
            fuser "$port/tcp" 2>/dev/null | tr ' ' '\n'
        fi
    } | sort -u
}

release_port() {
    local port="$1"
    local name="$2"
    local pids
    pids=$(port_pids "$port")

    if [ -z "$pids" ]; then
        return 0
    fi

    warn "$name port $port is already in use, releasing it before startup..."
    for pid in $pids; do
        local children
        children=$(pgrep -P "$pid" 2>/dev/null)
        if [ -n "$children" ]; then
            echo "$children" | xargs kill 2>/dev/null
        fi
        kill "$pid" 2>/dev/null
    done

    sleep 2
    pids=$(port_pids "$port")
    if [ -n "$pids" ]; then
        echo "$pids" | xargs kill -9 2>/dev/null
        sleep 1
    fi

    pids=$(port_pids "$port")
    if [ -n "$pids" ]; then
        err "$name port $port is still busy. Please run: ss -ltnp | grep ':$port'"
        exit 1
    fi
}

# ---------- 加载 nvm ----------
ensure_web_deps() {
    cd "$WEB_DIR" || exit 1

    if [ ! -d "node_modules" ]; then
        warn "Frontend node_modules not found, running npm install..."
        if ! npm install >> "$LOG_DIR/web/npm-install.log" 2>&1; then
            err "Frontend npm install failed. See $LOG_DIR/web/npm-install.log"
            exit 1
        fi
        return 0
    fi

    node -e 'require("lightningcss"); require("next/package.json")' >/dev/null 2>&1
    if [ $? -ne 0 ]; then
        warn "Frontend native packages do not match the current OS, running npm install..."
        if ! npm install >> "$LOG_DIR/web/npm-install.log" 2>&1; then
            err "Frontend npm install failed. See $LOG_DIR/web/npm-install.log"
            exit 1
        fi
    fi
}

export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    \. "$NVM_DIR/nvm.sh"
fi

# ---------- 准备目录 ----------
mkdir -p "$LOG_DIR/api" "$LOG_DIR/web" "$LOG_DIR/worker"
mkdir -p "$PROJECT_ROOT/data/uploads" "$PROJECT_ROOT/data/exports" "$PROJECT_ROOT/data/sqlite"

# ---------- 清理旧缓存 ----------
log "清理 Python 缓存..."
find "$PROJECT_ROOT/apps/api" -name "__pycache__" -exec rm -rf {} + 2>/dev/null
rm -f "$PROJECT_ROOT/data/sqlite/chenshu_ai.db-journal" "$PROJECT_ROOT/data/sqlite/chenshu_ai.db-wal"

# ---------- 初始化数据库 ----------
log "初始化数据库..."
"$VENV/bin/python3" -c "
import sys, os
sys.path.insert(0, '$API_DIR')
from app.core.database import engine
from app.db.base import Base
Base.metadata.create_all(bind=engine)
" 2>/dev/null && ok "数据库就绪"

# ---------- 启动后端 ----------
log "启动 FastAPI 后端 (port 8000)..."

# 清理旧进程和端口
OLD_PIDS=$(pgrep -f "uvicorn app.main:app" 2>/dev/null)
if [ -n "$OLD_PIDS" ]; then
    warn "发现旧的后端进程，正在关闭..."
    echo "$OLD_PIDS" | xargs kill 2>/dev/null
    sleep 1
    echo "$OLD_PIDS" | xargs kill -9 2>/dev/null
fi
rm -f "$LOG_DIR/api.pid"
release_port 8000 "FastAPI"

cd "$API_DIR"
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY
"$VENV/bin/uvicorn" app.main:app \
    --host 127.0.0.1 \
    --port 8000 \
    --reload \
    > "$LOG_DIR/api/server.log" 2>&1 &
API_PID=$!
echo "$API_PID" > "$LOG_DIR/api.pid"

# 等待后端就绪
for i in $(seq 1 30); do
    sleep 1
    if "$VENV/bin/python3" -c "
import urllib.request, os
os.environ.pop('http_proxy',None); os.environ.pop('https_proxy',None)
h = urllib.request.HTTPHandler(); o = urllib.request.build_opener(h)
r = o.open('http://127.0.0.1:8000/api/v1/health', timeout=2)
print('ok')
" 2>/dev/null | grep -q ok; then
        ok "后端已启动 (PID: $API_PID)"
        break
    fi
    if [ $i -eq 30 ]; then
        err "后端启动失败，查看日志: $LOG_DIR/api/server.log"
        tail -10 "$LOG_DIR/api/server.log"
        exit 1
    fi
done

# ---------- 启动前端 ----------
log "启动 Next.js 前端 (port 3000)..."

# 清理旧进程和端口
OLD_PIDS=$(pgrep -f "next dev" 2>/dev/null)
if [ -n "$OLD_PIDS" ]; then
    warn "发现旧的前端进程，正在关闭..."
    echo "$OLD_PIDS" | xargs kill 2>/dev/null
    sleep 1
    echo "$OLD_PIDS" | xargs kill -9 2>/dev/null
fi
rm -f "$LOG_DIR/web.pid"
release_port 3000 "Next.js"

cd "$WEB_DIR"
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY
ensure_web_deps
npm run dev > "$LOG_DIR/web/server.log" 2>&1 &
WEB_PID=$!
echo "$WEB_PID" > "$LOG_DIR/web.pid"

# 等待前端就绪
for i in $(seq 1 30); do
    sleep 1
    if "$VENV/bin/python3" -c "
import urllib.request, os
os.environ.pop('http_proxy',None); os.environ.pop('https_proxy',None)
h = urllib.request.HTTPHandler(); o = urllib.request.build_opener(h)
r = o.open('http://127.0.0.1:3000', timeout=2)
" 2>/dev/null; then
        ok "前端已启动 (PID: $WEB_PID)"
        break
    fi
    if [ $i -eq 30 ]; then
        warn "前端可能仍在编译中，请稍后刷新浏览器"
    fi
done

# ---------- 输出信息 ----------
API_URL="http://127.0.0.1:8000"
WEB_URL="http://localhost:3000"

echo ""
echo "========================================"
echo "  晨枢 AI (ChenSage) 已启动"
echo "========================================"
echo ""
echo "  API 文档:  $API_URL/docs"
echo "  API 接口:  $API_URL/api/v1"
echo "  前端页面:  $WEB_URL"
echo ""
echo "  后端日志:  $LOG_DIR/api/server.log"
echo "  前端日志:  $LOG_DIR/web/server.log"
echo ""
echo "  按 Ctrl+C 或运行 'bash stop.sh' 关闭"
echo ""

# 打开浏览器 (仅 WSL2 且可从 Windows 调用)
if command -v wslview &>/dev/null; then
    wslview "$WEB_URL" 2>/dev/null
elif command -v cmd.exe &>/dev/null; then
    cmd.exe /c start "$WEB_URL" 2>/dev/null
fi

# ---------- 保持前台 ----------
wait
