#!/bin/bash
# ============================================
# 晨枢 AI (ChenSage) — 一键关闭脚本
# 用法: bash stop.sh
# ============================================
set +e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"

# 检测是否在 Windows CMD 下运行
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

NO_PROMPT=false
if [ "$1" = "--no-prompt" ]; then
    NO_PROMPT=true
fi

log "正在关闭晨枢 AI 所有服务..."

# ---------- 按 PID 文件停止 ----------
stop_by_pid() {
    local pidfile="$1"
    local name="$2"
    if [ -f "$pidfile" ]; then
        local pid
        pid=$(cat "$pidfile")
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            # 先杀子进程，再杀父进程
            local children
            children=$(pgrep -P "$pid" 2>/dev/null)
            if [ -n "$children" ]; then
                echo "$children" | xargs kill 2>/dev/null
            fi
            kill "$pid" 2>/dev/null
            sleep 2
            if kill -0 "$pid" 2>/dev/null; then
                kill -9 "$pid" 2>/dev/null
                ok "已强制停止 $name (PID: $pid)"
            else
                ok "已停止 $name (PID: $pid)"
            fi
        fi
        rm -f "$pidfile"
    fi
}

stop_by_pid "$LOG_DIR/api.pid" "后端 (FastAPI:8000)"
stop_by_pid "$LOG_DIR/web.pid" "前端 (Next.js:3000)"

# ---------- 兜底：按进程名清理 ----------
clean_by_pattern() {
    local pattern="$1"
    local name="$2"
    local pids
    pids=$(pgrep -f "$pattern" 2>/dev/null)
    if [ -n "$pids" ]; then
        echo "$pids" | xargs kill 2>/dev/null
        sleep 1
        pids=$(pgrep -f "$pattern" 2>/dev/null)
        if [ -n "$pids" ]; then
            echo "$pids" | xargs kill -9 2>/dev/null
        fi
        ok "已清理残留的 $name 进程"
    fi
}

clean_by_pattern "uvicorn app.main:app" "后端"
clean_by_pattern "next dev" "前端"

# ---------- 确认端口 ----------
check_port() {
    local port="$1"
    sleep 1
    if ss -tlnp 2>/dev/null | grep -q ":$port "; then
        warn "端口 $port 仍被占用，强制释放中..."
        local pid
        pid=$(ss -tlnp 2>/dev/null | grep ":$port " | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1)
        if [ -n "$pid" ]; then
            kill -9 "$pid" 2>/dev/null
            ok "已强制释放端口 $port"
        fi
    else
        ok "端口 $port 已释放"
    fi
}

check_port 8000
check_port 3000

echo ""
echo "========================================"
echo "  晨枢 AI (ChenSage) 已关闭"
echo "========================================"
