from datetime import datetime, timezone
from app.core.database import SessionLocal
from app.core.config import get_settings
from app.models.task import Task
from app.models.task_file import TaskFile
from app.models.file import File
from app.models.model_config import ModelConfig
from app.services.model_client import ModelClient
from app.services.prompt_service import PromptService
import json
import os
import re


def _safe_filename_part(value, fallback="未命名", max_len=48):
    text = str(value or fallback)
    text = re.sub(r'[\\/:*?"<>|\r\n\t]+', " ", text)
    text = re.sub(r"\s+", " ", text).strip(" .")
    if not text:
        text = fallback
    return text[:max_len].strip()


class TaskExecutor:

    def __init__(self):
        self.model_client = ModelClient()
        self.prompt_service = PromptService()

    @staticmethod
    def mark_stale_tasks(db, timeout_minutes: int | None = None) -> int:
        settings = get_settings()
        timeout = timeout_minutes or settings.task_run_timeout_minutes
        now = datetime.now(timezone.utc)
        stale = []

        tasks = db.query(Task).filter(
            Task.deleted_at == None,
            Task.status.in_(("queued", "running")),
        ).all()

        for task in tasks:
            ref = task.started_at or task.updated_at or task.created_at
            if ref is None:
                stale.append(task)
                continue
            if ref.tzinfo is None:
                ref = ref.replace(tzinfo=timezone.utc)
            age_minutes = (now - ref).total_seconds() / 60
            if age_minutes >= timeout:
                stale.append(task)

        for task in stale:
            task.status = "failed"
            task.error_message = f"任务执行超过 {timeout} 分钟未完成，已自动标记为失败，可检查模型服务后重试。"
            task.finished_at = now
            if task.started_at:
                started = task.started_at if task.started_at.tzinfo else task.started_at.replace(tzinfo=timezone.utc)
                task.elapsed_ms = int((now - started).total_seconds() * 1000)

        if stale:
            db.commit()
        return len(stale)

    def execute(self, task_id: str) -> dict:
        db = SessionLocal()
        try:
            self.mark_stale_tasks(db)
            task = db.query(Task).filter(Task.id == task_id).first()
            if not task:
                return {"success": False, "error": "任务不存在"}

            if task.status == "failed" and task.error_message and "执行超过" in task.error_message:
                return {"success": False, "error": task.error_message}

            config = db.query(ModelConfig).filter(ModelConfig.id == task.model_config_id).first()
            if not config:
                config = db.query(ModelConfig).filter(ModelConfig.is_default == True, ModelConfig.is_enabled == True).first()
            if not config:
                task.status = "failed"
                task.error_message = "没有可用的模型配置，请先在模型设置中配置并测试模型"
                db.commit()
                return {"success": False, "error": task.error_message}

            task.status = "running"
            task.started_at = datetime.now(timezone.utc)
            task.model_name = config.display_name or config.model_name
            start_ts = datetime.now(timezone.utc)
            db.commit()

            variables = dict(task.input)
            variables["input"] = variables.get("input", variables.get("_raw_input", ""))
            variables["context"] = self._load_context(db, task_id)

            template_name = self._pick_template(task.type, variables)
            messages = self._build_messages(db, task, variables, template_name)

            # arXiv 日报 / 研究汇总等长报告，允许任务级别覆盖 max_tokens
            kwargs = {}
            if variables.get("override_max_tokens"):
                kwargs["max_tokens"] = variables["override_max_tokens"]

            result = self.model_client.generate(config, messages, **kwargs)
            elapsed = int((datetime.now(timezone.utc) - start_ts).total_seconds() * 1000)
            if result["success"]:
                task.status = "succeeded"
                task.output = result["content"]
                task.error_message = None
            else:
                task.status = "failed"
                task.output = None
                task.error_message = result.get("error", "模型调用失败")

            task.elapsed_ms = elapsed
            task.finished_at = datetime.now(timezone.utc)
            db.commit()

            if result["success"]:
                if task.type == "arxiv_daily":
                    self._save_arxiv_daily_report(db, task)
                self._save_result_md(task)

            self._log_model_call(db, task_id, config, result)
            return result

        except Exception as e:
            try:
                task = db.query(Task).filter(Task.id == task_id).first()
                if task:
                    task.status = "failed"
                    task.error_message = str(e)
                    task.finished_at = datetime.now(timezone.utc)
                    db.commit()
            except Exception:
                pass
            return {"success": False, "error": str(e)}
        finally:
            db.close()

    def _save_arxiv_daily_report(self, db, task):
        try:
            from datetime import date
            from app.models.arxiv_daily_report import ArxivDailyReport

            variables = task.input or {}
            direction_id = variables.get("direction_id")
            if not direction_id:
                return

            raw_date = variables.get("report_date") or date.today().isoformat()
            report_date = date.fromisoformat(raw_date) if isinstance(raw_date, str) else raw_date
            title = variables.get("report_title") or task.title or f"arXiv 日报 - {raw_date}"
            paper_count = int(variables.get("paper_count") or 0)

            db.add(ArxivDailyReport(
                direction_id=direction_id,
                report_date=report_date,
                title=title,
                content=task.output or "",
                paper_count=paper_count,
                recommended_count=paper_count,
                status="generated",
            ))
            db.commit()
        except Exception as e:
            print(f"[WARN] save arxiv daily report failed: {e}")

    def execute_stream(self, task_id: str):
        db = SessionLocal()
        task = None
        config = None
        try:
            self.mark_stale_tasks(db)
            task = db.query(Task).filter(Task.id == task_id).first()
            if not task:
                yield "ERROR: 任务不存在"
                return
            if task.status == "failed" and task.error_message and "执行超过" in task.error_message:
                yield "ERROR: " + task.error_message
                return

            config = db.query(ModelConfig).filter(ModelConfig.id == task.model_config_id).first()
            if not config:
                config = db.query(ModelConfig).filter(ModelConfig.is_default == True, ModelConfig.is_enabled == True).first()
            if not config:
                task.status = "failed"
                task.error_message = "没有可用的模型配置"
                db.commit()
                yield "ERROR: " + task.error_message
                return

            task.status = "running"
            task.started_at = datetime.now(timezone.utc)
            task.model_name = config.display_name or config.model_name
            start_ts = datetime.now(timezone.utc)
            db.commit()
            variables = dict(task.input)
            variables["input"] = variables.get("input", variables.get("_raw_input", ""))
            variables["context"] = self._load_context(db, task_id)

            template_name = self._pick_template(task.type, variables)
            messages = self._build_messages(db, task, variables, template_name)

            full_text = ""
            result = None
            for chunk in self.model_client.stream(config, messages):
                if isinstance(chunk, str) and chunk.startswith("ERROR:"):
                    task.status = "failed"
                    task.output = full_text if full_text else None
                    task.error_message = chunk[6:].strip() or "模型调用失败"
                    task.elapsed_ms = int((datetime.now(timezone.utc) - start_ts).total_seconds() * 1000)
                    task.finished_at = datetime.now(timezone.utc)
                    db.commit()
                    yield chunk
                    return
                result = chunk  # last yield is the final result dict
                if isinstance(chunk, str):
                    full_text += chunk
                    yield chunk

            if result and isinstance(result, dict) and result.get("success"):
                task.status = "succeeded"
                task.output = full_text
                task.error_message = None
            else:
                task.status = "failed"
                task.output = full_text if full_text else None
                task.error_message = str(result) if result else "未知错误"

            elapsed = int((datetime.now(timezone.utc) - start_ts).total_seconds() * 1000)
            task.elapsed_ms = elapsed
            task.finished_at = datetime.now(timezone.utc)
            db.commit()

            if result and isinstance(result, dict) and result.get("success"):
                if task.type == "arxiv_daily":
                    self._save_arxiv_daily_report(db, task)
                self._save_result_md(task)
            if result and isinstance(result, dict) and config:
                self._log_model_call(db, task_id, config, result)
            db.commit()

        except Exception as e:
            try:
                if task:
                    task.status = "failed"
                    task.error_message = str(e)
                    task.finished_at = datetime.now(timezone.utc)
                    db.commit()
            except Exception:
                pass
            yield f"ERROR: {str(e)}"
        finally:
            db.close()

    def _load_context(self, db, task_id: str) -> str:
        refs = db.query(TaskFile).filter(TaskFile.task_id == task_id).all()
        if not refs:
            return ""
        parts = []
        for ref in refs:
            f = db.query(File).filter(File.id == ref.file_id).first()
            if f and f.parsed_text:
                parts.append(f"### {f.original_name}\n\n{f.parsed_text[:3000]}")
            elif f:
                parts.append(f"### {f.original_name}\n\n（文件尚未解析，未提取文本内容）")
        return "\n\n".join(parts)

    def _pick_template(self, task_type: str, variables: dict) -> str:
        if variables.get("template_id"):
            return "__custom__"

        sub = variables.get("content_type", "")
        if task_type == "interview":
            sub = variables.get("stage", "")
        try:
            from app.models.prompt_template import PromptTemplate
            db = SessionLocal()
            q = db.query(PromptTemplate).filter(
                PromptTemplate.task_type == task_type,
                PromptTemplate.is_default == True,
                PromptTemplate.is_active == True,
            )
            tpl = None
            if sub:
                tpl = q.filter(PromptTemplate.sub_type == sub).first()
                tpl = tpl or q.filter(PromptTemplate.sub_type == "").first() or q.filter(PromptTemplate.sub_type == None).first()
            if not tpl:
                tpl = q.first()
            db.close()
            if tpl:
                variables["template_id"] = tpl.id
                return "__custom__"
        except Exception as e:
            print(f"[WARN] _pick_template DB lookup failed: {e}")

        if task_type == "content" and variables.get("stage") == "outline":
            return "content_outline"
        if task_type == "content" and variables.get("stage") == "rewrite":
            return "content_rewrite"
        if task_type == "content":
            return "content_draft"
        if task_type == "interview" and variables.get("stage") == "questions":
            return "interview_questions"
        if task_type == "interview" and variables.get("stage") == "review":
            return "interview_review"
        if task_type == "interview":
            return "interview_analyze"
        if task_type == "research":
            return "research_summarize"
        if task_type == "arxiv_daily":
            return "arxiv_daily"
        return "generic"

    def _build_messages(self, db, task, variables: dict, template_name: str) -> list[dict]:
        if template_name == "__custom__":
            from app.models.prompt_template import PromptTemplate
            tid = variables.get("template_id")
            if tid:
                tpl = db.query(PromptTemplate).filter(PromptTemplate.id == tid).first()
                if tpl:
                    from app.services.prompt_service import render_prompt_text
                    system = render_prompt_text(tpl.system_prompt or "", variables)
                    user = render_prompt_text(tpl.user_prompt_template, variables)
                    if task.type == "research":
                        requirements = variables.get("requirements") or variables.get("output_requirements") or variables.get("input") or ""
                        sources = variables.get("sources") or ""
                        if requirements and str(requirements) not in user:
                            user += f"\n\n## 搜集要求\n\n{requirements}"
                        if sources and str(sources) not in user:
                            user += f"\n\n## 来源内容\n\n{sources}"
                    msgs = []
                    if system.strip():
                        msgs.append({"role": "system", "content": system})
                    msgs.append({"role": "user", "content": user})
                    return msgs
        return self.prompt_service.build_messages(template_name, variables)

    def _save_result_md(self, task):
        try:
            settings = get_settings()
            type_cn = {
                "generic": "通用任务", "content": "内容创作", "interview": "简历面试",
                "research": "信息搜集", "arxiv_daily": "arXiv日报", "stock_research": "股票研究",
            }.get(task.type, task.type)
            dir_path = os.path.join(settings.export_dir, type_cn)
            os.makedirs(dir_path, exist_ok=True)

            created = task.created_at or datetime.now(timezone.utc)
            ts = created.strftime("%Y%m%d-%H%M")
            topic = task.title
            if task.type == "content":
                topic = (task.input or {}).get("topic") or task.title
            elif task.type == "research":
                topic = (task.input or {}).get("requirements") or task.title
            elif task.type == "interview":
                topic = (task.input or {}).get("stage") or task.title
            filename = " - ".join([
                _safe_filename_part("晨枢AI", max_len=16),
                _safe_filename_part(type_cn, max_len=16),
                _safe_filename_part(topic, max_len=36),
                ts,
                task.id[:8],
            ]) + ".md"
            file_path = os.path.join(dir_path, filename)

            elapsed_str = f"{(task.elapsed_ms or 0) / 1000:.1f}s" if task.elapsed_ms else "N/A"
            input_json = json.dumps(task.input or {}, ensure_ascii=False, indent=2)

            content = f"""# {task.title}

- **任务 ID**: {task.id}
- **类型**: {type_cn}
- **状态**: {task.status}
- **模型**: {task.model_name or "未知"}
- **耗时**: {elapsed_str}
- **创建时间**: {task.created_at.isoformat() if task.created_at else "N/A"}
- **完成时间**: {task.finished_at.isoformat() if task.finished_at else "N/A"}

---

## 输入

```json
{input_json}
```

---

## 输出

{task.output or ""}
"""
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)
        except Exception as e:
            print(f"[WARN] _save_result_md failed for task {task.id[:8]}: {e}")

    def _log_model_call(self, db, task_id: str, config: ModelConfig, result: dict):
        try:
            from app.models.model_call_log import ModelCallLog
            usage = result.get("usage", {})
            log = ModelCallLog(
                task_id=task_id,
                model_config_id=config.id,
                provider=config.provider,
                model_name=config.model_name,
                request_type="generate",
                status="success" if result.get("success") else "failed",
                prompt_tokens=usage.get("prompt_tokens"),
                completion_tokens=usage.get("completion_tokens"),
                total_tokens=usage.get("total_tokens"),
                latency_ms=result.get("latency_ms"),
                error_message=result.get("error"),
            )
            db.add(log)
            db.commit()
        except Exception:
            pass
