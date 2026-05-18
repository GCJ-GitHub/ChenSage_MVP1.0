# 晨枢 AI - 产品类 - 部署运行文档

## 清单

### 7 个步骤

- [x] 立项与产品定位
- [x] 需求分析
- [x] 原型与交互设计
- [x] 技术架构设计
- [x] 开发与工程化
- [x] 测试与上线准备
- [ ] 迭代与产品化

### 12 份文档

- [x] 项目立项文档
- [x] 产品定位与范围说明
- [x] PRD 产品需求文档
- [x] MVP 功能清单与优先级
- [x] 页面原型说明
- [x] 用户流程图 / 任务流程图
- [x] 技术架构设计文档
- [x] 数据库设计文档
- [x] API 接口设计文档
- [x] 开发规范文档
- [x] 部署运行文档
- [x] 测试用例与上线检查清单

---

## 1. 文档目的

本文档用于说明晨枢 AI 的部署、启动、运行、配置、备份、恢复、日志排查和后续上线方案。

本文档优先服务 MVP 阶段的个人本地使用，同时为后续服务器部署、Docker Compose 部署、PostgreSQL 迁移、本地模型接入和公网访问预留路径。

## 2. 部署目标

### 2.1 MVP 阶段

MVP 阶段目标：

- 可以在个人电脑本地运行。
- 可以通过浏览器访问前端页面。
- 可以通过 FastAPI 提供后端接口。
- 可以使用 SQLite 保存数据。
- 可以使用本地目录保存上传文件和导出文件。
- 可以配置云端模型 API。

### 2.2 后续上线阶段

后续上线目标：

- 部署到云服务器或本地服务器。
- 使用 PostgreSQL。
- 使用 Nginx 和 HTTPS。
- 支持后台任务 Worker。
- 支持对象存储或独立文件目录。
- 支持日志、备份、监控和恢复。

## 3. 部署架构总览

```mermaid
flowchart TD
    subgraph LOCAL[本地 MVP 部署]
        B1[浏览器] --> W1[Next.js 前端]
        W1 --> A1[FastAPI 后端]
        A1 --> D1[(SQLite)]
        A1 --> F1[本地 uploads / exports]
        A1 --> L1[云端模型 API]
    end

    subgraph SERVER[服务器部署]
        U[用户浏览器] --> N[Nginx / HTTPS]
        N --> W2[前端服务]
        N --> A2[FastAPI API]
        A2 --> P[(PostgreSQL)]
        A2 --> R[(Redis)]
        A2 --> O[对象存储或文件目录]
        A2 --> WK[Worker]
        WK --> L2[云端模型 API / 本地模型]
    end
```

## 4. 推荐运行环境

### 4.1 本地开发环境

| 项目 | 建议版本 |
| --- | --- |
| 操作系统 | Windows 10/11、macOS、Linux |
| Node.js | 20 LTS 或以上 |
| Python | 3.11 或以上 |
| 包管理 | pnpm / npm，Python venv / uv |
| 数据库 | SQLite |
| 浏览器 | Chrome / Edge |

### 4.2 服务器环境

| 项目 | 建议 |
| --- | --- |
| 系统 | Ubuntu 22.04 LTS 或以上 |
| CPU | 2 核起步 |
| 内存 | 4GB 起步，建议 8GB |
| 磁盘 | 40GB 起步 |
| 数据库 | PostgreSQL 15+ |
| 反向代理 | Nginx |
| 进程管理 | systemd / Docker Compose |

## 5. 目录结构约定

```text
chenshu-ai/
  apps/
    web/
    api/
  data/
    uploads/
    exports/
    sqlite/
    backups/
  logs/
    api/
    worker/
    web/
  docs/
  scripts/
  .env.example
  README.md
```

运行时目录说明：

- `data/uploads`：上传文件。
- `data/exports`：导出文件。
- `data/sqlite`：SQLite 数据库文件。
- `data/backups`：备份文件。
- `logs/api`：后端日志。
- `logs/worker`：后台任务日志。
- `logs/web`：前端服务日志。

## 6. 环境变量配置

建议提供 `.env.example`，由用户复制为 `.env.local` 或 `.env`。

### 6.1 后端环境变量

```text
APP_ENV=development
APP_NAME=chenshu-ai
API_HOST=127.0.0.1
API_PORT=8000

DATABASE_URL=sqlite:///./data/sqlite/chenshu_ai.db
UPLOAD_DIR=./data/uploads
EXPORT_DIR=./data/exports
LOG_DIR=./logs/api

DEFAULT_MODEL_PROVIDER=openai_compatible
DEFAULT_MODEL_BASE_URL=
DEFAULT_MODEL_NAME=
DEFAULT_MODEL_API_KEY=

SECRET_KEY=change-me
ENABLE_AUTH=false
```

### 6.2 前端环境变量

```text
NEXT_PUBLIC_APP_NAME=晨枢 AI
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api/v1
```

### 6.3 安全要求

- `.env` 不提交到 Git。
- API Key 不写入日志。
- 服务器部署时必须修改 `SECRET_KEY`。
- 公网部署时建议开启认证。

## 7. 本地开发运行

### 7.1 安装依赖

前端：

```powershell
cd apps\web
npm install
```

后端：

```powershell
cd apps\api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 7.2 初始化目录

```powershell
mkdir data\uploads
mkdir data\exports
mkdir data\sqlite
mkdir logs\api
mkdir logs\web
mkdir logs\worker
```

### 7.3 初始化数据库

```powershell
cd apps\api
alembic upgrade head
```

如果 MVP 阶段暂未接入 Alembic，可以提供初始化脚本：

```powershell
python scripts\init_db.py
```

### 7.4 启动后端

```powershell
cd apps\api
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 7.5 启动前端

```powershell
cd apps\web
npm run dev
```

访问地址：

```text
http://localhost:3000
```

API 文档地址：

```text
http://127.0.0.1:8000/docs
```

## 8. 本地运行流程图

```mermaid
flowchart TD
    A[安装 Node.js 和 Python] --> B[安装前端依赖]
    B --> C[安装后端依赖]
    C --> D[配置 .env]
    D --> E[初始化数据库]
    E --> F[启动 FastAPI]
    F --> G[启动 Next.js]
    G --> H[浏览器访问 localhost:3000]
    H --> I[配置模型 API]
    I --> J[创建并执行任务]
```

## 9. Docker Compose 部署方案

MVP 后期或服务器阶段建议提供 Docker Compose。

### 9.1 服务组成

```mermaid
flowchart TD
    N[Nginx] --> WEB[web]
    N --> API[api]
    API --> PG[(postgres)]
    API --> REDIS[(redis)]
    API --> V1[uploads volume]
    API --> V2[exports volume]
    WORKER[worker] --> PG
    WORKER --> REDIS
    WORKER --> LLM[模型 API]
```

### 9.2 docker-compose 服务建议

服务：

- `web`：Next.js 前端。
- `api`：FastAPI 后端。
- `worker`：后台任务执行器。
- `postgres`：PostgreSQL。
- `redis`：任务队列或缓存。
- `nginx`：反向代理和 HTTPS。

### 9.3 适用场景

- 需要部署到服务器。
- 需要和他人试用。
- 需要长期运行后台任务。
- 需要更稳定的数据库和日志管理。

## 10. 服务器部署步骤

### 10.1 准备服务器

建议：

- Ubuntu 22.04 LTS。
- 创建独立部署用户。
- 配置防火墙。
- 安装 Docker 和 Docker Compose。
- 配置域名解析。

### 10.2 配置环境变量

服务器需配置：

```text
APP_ENV=production
DATABASE_URL=postgresql://user:password@postgres:5432/chenshu_ai
ENABLE_AUTH=true
SECRET_KEY=replace-with-strong-secret
NEXT_PUBLIC_API_BASE_URL=https://your-domain.com/api/v1
```

### 10.3 启动服务

```bash
docker compose pull
docker compose up -d
docker compose ps
```

### 10.4 执行迁移

```bash
docker compose exec api alembic upgrade head
```

### 10.5 检查服务

检查项：

- 前端首页是否可访问。
- `/api/v1/health` 是否正常。
- 数据库连接是否正常。
- 上传目录是否可写。
- 模型连接测试是否成功。

## 11. Nginx 与 HTTPS

### 11.1 反向代理规则

建议：

- `/` 转发到前端服务。
- `/api/` 转发到 FastAPI。
- `/uploads/` 不直接暴露，文件下载走鉴权接口。

### 11.2 HTTPS

建议使用：

- Let's Encrypt。
- 服务器厂商证书。
- Cloudflare 代理证书。

公网部署要求：

- 强制 HTTPS。
- 禁止明文 API Key 传输。
- 开启认证。

## 12. 数据备份

### 12.1 本地 SQLite 备份

需要备份：

- SQLite 数据库文件。
- `data/uploads`。
- `data/exports`。

建议频率：

- 手动阶段：每次重要修改后备份。
- 长期使用：每日备份一次。

备份目录：

```text
data/backups/YYYY-MM-DD/
```

### 12.2 PostgreSQL 备份

建议使用：

```bash
pg_dump -Fc chenshu_ai > backups/chenshu_ai_YYYYMMDD.dump
```

恢复：

```bash
pg_restore -d chenshu_ai backups/chenshu_ai_YYYYMMDD.dump
```

### 12.3 文件备份

上传文件和导出文件必须和数据库一起备份，否则任务记录可能找不到文件。

## 13. 备份恢复流程图

```mermaid
flowchart TD
    A[开始备份] --> B[停止或冻结写入]
    B --> C[备份数据库]
    C --> D[备份 uploads]
    D --> E[备份 exports]
    E --> F[记录备份时间和版本]
    F --> G[恢复演练]
    G --> H{恢复是否成功}
    H -- 是 --> I[备份有效]
    H -- 否 --> J[修复备份脚本]
```

## 14. 日志与排查

### 14.1 日志位置

- 后端日志：`logs/api`。
- 前端日志：`logs/web`。
- Worker 日志：`logs/worker`。
- Nginx 日志：服务器 `/var/log/nginx` 或容器日志。

### 14.2 常用排查顺序

1. 检查服务是否启动。
2. 检查 `/api/v1/health`。
3. 检查数据库连接。
4. 检查环境变量。
5. 检查上传目录权限。
6. 检查模型 API Key。
7. 查看任务执行日志。
8. 查看模型调用日志。

### 14.3 常见问题

| 问题 | 可能原因 | 处理方式 |
| --- | --- | --- |
| 前端打不开 | 前端服务未启动或端口错误 | 检查 `npm run dev` 和端口 |
| API 访问失败 | 后端未启动或 CORS 配置错误 | 检查 FastAPI 和 API Base URL |
| 数据库初始化失败 | 迁移未执行或路径错误 | 检查 `DATABASE_URL` |
| 文件上传失败 | 目录不存在或无权限 | 检查 `UPLOAD_DIR` |
| 模型测试失败 | API Key、Base URL 或模型名错误 | 在模型设置页重新测试 |
| arXiv 拉取失败 | 网络或接口错误 | 稍后重试并查看日志 |
| 网页抓取失败 | 反爬、超时、页面动态渲染 | 跳过来源或使用 Playwright |

## 15. 运行监控

MVP 阶段可先人工检查：

- 服务是否能访问。
- 任务是否正常执行。
- 日志是否持续增长。
- 磁盘空间是否充足。
- API 调用是否异常失败。

服务器阶段建议监控：

- CPU。
- 内存。
- 磁盘。
- API 错误率。
- 任务失败率。
- 模型调用成本。
- 队列积压。

## 16. 升级流程

### 16.1 本地升级

步骤：

1. 备份数据库和文件。
2. 拉取或更新代码。
3. 安装新增依赖。
4. 执行数据库迁移。
5. 启动后端。
6. 启动前端。
7. 执行核心功能自测。

### 16.2 服务器升级

步骤：

1. 备份数据库和文件。
2. 拉取新镜像或新代码。
3. 停止旧服务。
4. 执行数据库迁移。
5. 启动新服务。
6. 检查健康接口。
7. 检查核心任务。
8. 保留回滚方案。

## 17. 回滚方案

回滚触发场景：

- 新版本无法启动。
- 数据库迁移失败。
- 核心任务无法执行。
- 文件上传或模型调用严重异常。

回滚步骤：

1. 停止新版本服务。
2. 恢复旧版本代码或镜像。
3. 如有必要，恢复数据库备份。
4. 恢复上传文件目录。
5. 启动旧版本。
6. 验证核心功能。

## 18. 本地模型部署预留

后续接入本地模型时，建议部署方式：

- Ollama 本地服务。
- LM Studio 本地 OpenAI 兼容接口。
- vLLM 独立服务。
- llama.cpp server。

接入方式：

```text
MODEL_PROVIDER=openai_compatible
MODEL_BASE_URL=http://127.0.0.1:11434/v1
MODEL_NAME=local-model-name
```

架构图：

```mermaid
flowchart LR
    API[FastAPI] --> ROUTER[模型路由]
    ROUTER --> CLOUD[云端模型 API]
    ROUTER --> OLLAMA[Ollama / 本地模型]
    ROUTER --> VLLM[vLLM 服务]
```

## 19. 上线前检查

部署到公网前至少确认：

- 开启 HTTPS。
- 开启登录认证。
- 修改默认 `SECRET_KEY`。
- API Key 不出现在日志中。
- 上传文件大小有限制。
- 数据库有备份。
- 错误页不暴露内部路径。
- CORS 配置不允许任意来源。
- 删除操作有确认。
- 股票、论文、专利等高风险模块有提示。

## 20. MVP 部署验收标准

本部署文档对应的验收标准：

1. 本地可以启动前端和后端。
2. 浏览器可以访问工作台。
3. `/api/v1/health` 返回正常。
4. 可以初始化数据库。
5. 可以上传文件并保存到本地目录。
6. 可以配置模型 API 并测试连接。
7. 可以创建并执行一个任务。
8. 可以查看任务历史。
9. 可以导出 Markdown。
10. 可以完成一次备份和恢复演练。

## 21. 后续文档衔接

本部署运行文档完成后，建议继续编写：

1. 《测试用例与上线检查清单》。
