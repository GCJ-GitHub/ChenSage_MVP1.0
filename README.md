# ChenSage_MVP1.0

晨枢 AI（ChenSage_MVP1.0）是一个个人 AI 任务中枢 MVP，用于把内容创作、模拟面试、信息搜集、arXiv 论文日报、模型配置、提示词模板、文件解析、历史任务与统一导出整合到一个本地工作台中。

当前状态：MVP 初步完成，适合本地个人使用、功能验证和后续云原生化改造；暂不建议直接作为公开生产服务部署。

## 主要功能

- 内容创作：支持论文、专利、小说、剧本、歌词、小红书、知乎、公众号等内容生成与改写。
- 模拟面试：基于简历和岗位描述生成简历分析、面试问题、回答评价和复盘报告。
- 信息搜集：支持单 URL/PDF/JSON/RSS、批量多任务、站内信息发现与汇总报告。
- arXiv 日报：支持研究方向管理、关键词/分类配置、按日期和篇数拉取论文、收藏论文、按范围生成日报。
- 模型设置：支持 OpenAI-compatible API 配置、默认模型、连通性测试。
- 提示词模板：支持按任务类型维护模板，并在信息搜集、arXiv 日报等功能中复用。
- 文件管理：支持上传并解析 PDF、DOCX、TXT、MD。
- 历史任务与导出：支持统一查看任务、重试、导出 Markdown。

## 技术栈

前端：

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS

后端：

- FastAPI
- SQLAlchemy
- SQLite（MVP 默认）
- Pydantic Settings
- requests / BeautifulSoup / pypdf / python-docx

当前运行方式：

- Windows + WSL 脚本启动
- FastAPI 默认端口：`8000`
- Next.js 默认端口：`3000`
- 本地运行数据位于 `data/`
- 运行日志位于 `logs/`

## 目录结构

```text
ChenSage_MVP1.0/
  apps/
    api/                 FastAPI 后端
      app/
        api/             API 路由
        core/            配置、数据库、安全工具
        models/          SQLAlchemy 数据模型
        schemas/         Pydantic 请求/响应模型
        services/        模型调用、任务执行、爬虫、解析器
    web/                 Next.js 前端
      app/               页面路由
      components/        通用组件和布局
      lib/               API 客户端、主题、导出工具
  data/                  本地运行数据，不提交 Git
  logs/                  运行日志，不提交 Git
  晨枢 AI/               产品文档与过程文档
  start.sh               WSL 一键启动脚本
  stop.sh                WSL 一键关闭脚本
  启动.bat               Windows 启动入口
  关闭.bat               Windows 关闭入口
```

## 环境要求

推荐环境：

- Windows 10/11
- WSL2
- Python 3.11+
- Node.js 20+
- npm

注意：

- `.env.local` 包含本地敏感配置，不提交 GitHub。
- `data/`、`logs/`、`.venv/`、`node_modules/`、`.next/` 不提交 GitHub。
- 通过 Windows 和 WSL 交替运行前端时，`node_modules` 需要匹配当前系统平台；`start.sh` 已加入依赖自检，会在 WSL 侧自动补齐 Linux 原生依赖。
- 当前 MVP 默认使用 SQLite；后续云原生阶段建议迁移到 PostgreSQL + Redis + Worker。

## 安装依赖

后端：

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

前端：

```bash
cd apps/web
npm install
```

## 本地启动

### Windows 启动

在项目根目录双击：

```text
启动.bat
```

关闭服务：

```text
关闭.bat
```

### WSL 启动

```bash
cd /mnt/d/Desktop/ChenSage_MVP1.0
bash start.sh
```

关闭：

```bash
cd /mnt/d/Desktop/ChenSage_MVP1.0
bash stop.sh --no-prompt
```

启动成功后访问：

- 前端页面：http://localhost:3000
- API 文档：http://127.0.0.1:8000/docs
- API 健康检查：http://127.0.0.1:8000/api/v1/health

## 使用流程

1. 进入「模型设置」，配置 OpenAI-compatible 模型、Base URL、模型名和 API Key。
2. 进入「提示词模板」，维护内容创作、信息搜集、arXiv 日报等任务模板。
3. 进入「文件管理」，上传并解析 PDF、DOCX、TXT、MD。
4. 按需使用「内容创作」「模拟面试」「信息搜集」「arXiv 论文日报」。
5. 在「历史任务」查看任务状态、结果、错误信息并统一导出。

## arXiv 日报说明

arXiv 日报当前支持：

- 新建和维护研究方向。
- 配置关键词、排除词和 arXiv 分类。
- 拉取论文时选择日期；不填则按 arXiv 最新排序拉取。
- 拉取论文时指定篇数。
- 收藏重点论文。
- 生成日报时选择范围：`本次拉取`、`仅收藏`、`全部`。
- `全部` 模式可指定数量，例如从该方向全部论文中取最新 10 篇。
- 同一天同一方向可生成多份日报；每份日报都会保留独立历史记录，不再覆盖旧日报。
- 历史日报按日期和创建时间倒序展示。

## 信息搜集说明

信息搜集当前支持：

- 单组来源：输入一个 URL/PDF/JSON/RSS 来源，抓取后生成报告。
- 批量多任务：每个任务单独配置来源、模型、提示词，并行抓取后合并生成报告。
- 站内搜集：给定门户网站或站点入口，可选关键词和深度，自动发现相关页面并抓取。
- 抓取与总结分离：先检查来源摘要和正文长度，再选择来源生成报告。

## MVP 限制

- 默认 SQLite，不适合多人并发或生产部署。
- 后台长任务仍以本地进程为主，后续建议升级为 Redis 队列 + Worker。
- 文件存储仍是本地目录，后续建议抽象 StorageService，并支持 MinIO/S3。
- 当前没有正式登录鉴权，`ENABLE_AUTH=false` 仅适合本地个人使用。
- 尚无完整自动化测试和 CI/CD。
- 部分复杂网页仍可能受反爬、JS 渲染或登录限制影响。

## 后续规划

建议下一阶段进入本地云原生化：

1. Docker Compose 本地服务编排。
2. API / Web / Worker 服务拆分。
3. SQLite 迁移 PostgreSQL。
4. Redis 任务队列。
5. MinIO 本地对象存储。
6. Alembic 数据库迁移。
7. 结构化日志和任务运行日志。
8. 可观测性与模型调用成本统计。

## GitHub 提交注意事项

不要提交：

- `.env.local`
- `.venv/`
- `data/`
- `logs/`
- `node_modules/`
- `.next/`
- 上传文件、导出报告、SQLite 数据库

项目根目录已提供 `.gitignore` 用于排除上述文件。
