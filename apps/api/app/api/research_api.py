from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Annotated
from urllib.parse import urlparse, urlunparse
import threading

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.research_source import ResearchSource
from app.models.task import Task
from app.services.crawler import discover_site_urls, fetch_url
from app.services.task_executor import TaskExecutor

router = APIRouter(prefix="/research", tags=["research"])

MAX_URLS_PER_TASK = 20
MAX_FETCH_WORKERS = 5
MIN_REPORT_TEXT_LEN = 200
MAX_BATCH_JOBS = 10
MAX_SITE_DISCOVERY_PAGES = 30
MAX_REPORT_SOURCE_TEXT_CHARS = 24000


def _normalize_url(raw_url: str) -> str:
    url = raw_url.strip()
    if not url:
        return ""
    parsed = urlparse(url)
    if not parsed.scheme:
        url = "https://" + url
        parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError(f"URL 格式不正确：{raw_url}")
    normalized = parsed._replace(fragment="")
    return urlunparse(normalized)


def _parse_urls(urls_raw) -> list[str]:
    raw_items = urls_raw.splitlines() if isinstance(urls_raw, str) else urls_raw
    if not isinstance(raw_items, list):
        return []

    seen = set()
    urls = []
    for item in raw_items:
        if not isinstance(item, str) or not item.strip():
            continue
        normalized = _normalize_url(item)
        if normalized and normalized not in seen:
            seen.add(normalized)
            urls.append(normalized)
    return urls


def _parse_keywords(raw_keywords) -> list[str]:
    raw_items = raw_keywords.replace("，", "\n").replace(",", "\n").splitlines() if isinstance(raw_keywords, str) else raw_keywords
    if not isinstance(raw_items, list):
        return []
    seen = set()
    keywords = []
    for item in raw_items:
        if not isinstance(item, str):
            continue
        keyword = item.strip()
        if keyword and keyword not in seen:
            seen.add(keyword)
            keywords.append(keyword)
    return keywords


def _create_fetch_task(
    db: Session,
    title: str,
    urls: list[str],
    requirements: str,
    model_config_id: str | None = None,
    template_id: str | None = None,
    description: str = "",
    extra_input: dict | None = None,
) -> Task:
    task_input = {
        "stage": "fetch",
        "urls": urls,
        "requirements": requirements,
        "output_requirements": requirements,
        "template_id": template_id or "",
    }
    if extra_input:
        task_input.update(extra_input)
    task = Task(
        type="research",
        title=title[:256],
        description=description,
        model_config_id=model_config_id,
        input=task_input,
        status="queued",
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    thread = threading.Thread(target=_run_fetch, args=(task.id,), daemon=True)
    thread.start()
    return task


def _source_to_dict(source: ResearchSource) -> dict:
    raw_text = source.raw_text or ""
    created_at = source.created_at
    if created_at and created_at.tzinfo is not None:
        created_at = created_at.astimezone(timezone.utc).replace(tzinfo=None)
    return {
        "id": source.id,
        "url": source.url[:500],
        "title": source.title,
        "source_type": source.source_type,
        "fetch_status": source.fetch_status,
        "summary": source.summary,
        "error_message": source.error_message,
        "raw_text_preview": raw_text[:500],
        "raw_text_length": len(raw_text),
        "created_at": created_at.isoformat() + "Z" if created_at else None,
    }


def _run_fetch(task_id: str):
    from app.core.database import SessionLocal

    db = SessionLocal()
    try:
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            return

        task.status = "running"
        task.started_at = datetime.now(timezone.utc)
        start_ts = datetime.now(timezone.utc)
        db.commit()

        urls = task.input.get("urls", [])
        results = []
        with ThreadPoolExecutor(max_workers=min(MAX_FETCH_WORKERS, max(len(urls), 1))) as executor:
            future_map = {executor.submit(fetch_url, url): url for url in urls}
            for future in as_completed(future_map):
                try:
                    results.append(future.result())
                except Exception as e:
                    url = future_map[future]
                    results.append({
                        "url": url,
                        "title": url,
                        "text": "",
                        "fetch_status": "failed",
                        "error": str(e)[:300],
                    })

        now = datetime.now(timezone.utc)
        sources = []
        for result in results:
            source = ResearchSource(
                task_id=task.id,
                source_type=result.get("source_type") or "url",
                url=result["url"],
                title=result.get("title") or result["url"],
                fetch_status=result["fetch_status"],
                raw_text=result.get("text") or "",
                error_message=result.get("error"),
                fetched_at=now,
                created_at=now,
            )
            db.add(source)
            sources.append(source)

        succeeded = sum(1 for source in sources if source.fetch_status == "succeeded")
        task.finished_at = datetime.now(timezone.utc)
        task.elapsed_ms = int((task.finished_at - start_ts).total_seconds() * 1000)
        if succeeded == 0:
            task.status = "failed"
            task.error_message = "所有来源抓取均失败，未获得可用于生成报告的正文"
        else:
            task.status = "succeeded"
            task.error_message = None
        db.commit()
    except Exception as e:
        try:
            task = db.query(Task).filter(Task.id == task_id).first()
            if task:
                task.status = "failed"
                task.error_message = str(e)[:500]
                task.finished_at = datetime.now(timezone.utc)
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


@router.post("/tasks")
def create_research_task(
    body: dict,
    db: Annotated[Session, Depends(get_db)] = None,
):
    try:
        urls = _parse_urls(body.get("urls", ""))
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"code": "BAD_REQUEST", "message": str(e)})

    if not urls:
        raise HTTPException(status_code=400, detail={"code": "BAD_REQUEST", "message": "请至少输入一个网页 URL。"})

    if len(urls) > MAX_URLS_PER_TASK:
        raise HTTPException(
            status_code=400,
            detail={"code": "TOO_MANY_URLS", "message": f"一次最多支持 {MAX_URLS_PER_TASK} 个 URL。"},
        )

    title = body.get("title", "信息搜集任务")
    requirements = body.get("requirements") or body.get("output_requirements") or "汇总核心内容，生成可读报告"
    task = _create_fetch_task(
        db,
        title=title,
        urls=urls,
        requirements=requirements,
        model_config_id=body.get("model_config_id"),
        template_id=body.get("template_id"),
        description=body.get("description", ""),
    )

    return {
        "success": True,
        "data": {"task_id": task.id, "status": task.status, "url_count": len(urls)},
        "message": f"信息搜集任务已创建，共 {len(urls)} 个来源",
    }


@router.post("/batch")
def create_research_batch(
    body: dict,
    db: Annotated[Session, Depends(get_db)] = None,
):
    jobs_raw = body.get("jobs", [])
    if not isinstance(jobs_raw, list) or not jobs_raw:
        raise HTTPException(status_code=400, detail={"code": "BAD_REQUEST", "message": "请至少配置一个批量任务。"})
    if len(jobs_raw) > MAX_BATCH_JOBS:
        raise HTTPException(status_code=400, detail={"code": "TOO_MANY_JOBS", "message": f"一次最多创建 {MAX_BATCH_JOBS} 个批量任务。"})

    tasks = []
    errors = []
    for idx, job in enumerate(jobs_raw, start=1):
        if not isinstance(job, dict):
            errors.append({"index": idx, "message": "任务格式不正确"})
            continue
        try:
            urls = _parse_urls(job.get("urls", ""))
        except ValueError as e:
            errors.append({"index": idx, "message": str(e)})
            continue
        if not urls:
            errors.append({"index": idx, "message": "未提供 URL"})
            continue
        if len(urls) > MAX_URLS_PER_TASK:
            errors.append({"index": idx, "message": f"单个任务最多支持 {MAX_URLS_PER_TASK} 个 URL"})
            continue

        requirements = job.get("requirements") or body.get("requirements") or "汇总核心内容，生成可读报告"
        title = job.get("title") or f"批量信息搜集 {idx}"
        task = _create_fetch_task(
            db,
            title=title,
            urls=urls,
            requirements=requirements,
            model_config_id=job.get("model_config_id") or body.get("model_config_id"),
            template_id=job.get("template_id") or body.get("template_id"),
            description="批量信息搜集子任务",
            extra_input={"batch_index": idx},
        )
        tasks.append({"task_id": task.id, "title": task.title, "url_count": len(urls)})

    if not tasks:
        raise HTTPException(status_code=400, detail={"code": "BAD_REQUEST", "message": "没有可创建的批量任务。", "errors": errors})

    return {
        "success": True,
        "data": {"tasks": tasks, "errors": errors},
        "message": f"已创建 {len(tasks)} 个批量信息搜集任务",
    }


@router.post("/site-search")
def create_site_search_task(
    body: dict,
    db: Annotated[Session, Depends(get_db)] = None,
):
    try:
        start_url = _normalize_url(body.get("start_url") or body.get("url") or "")
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"code": "BAD_REQUEST", "message": str(e)})

    keywords = _parse_keywords(body.get("keywords", ""))

    max_depth = int(body.get("max_depth") or 1)
    max_pages = min(int(body.get("max_pages") or 10), MAX_SITE_DISCOVERY_PAGES)
    discovered = discover_site_urls(start_url, keywords, max_depth=max_depth, max_pages=max_pages)
    urls = [item["url"] for item in discovered]
    if not urls:
        raise HTTPException(status_code=400, detail={"code": "NO_MATCHED_URLS", "message": "没有发现与关键词相关的站内页面。"})

    default_focus = f"围绕关键词 {', '.join(keywords)} 汇总站内相关信息" if keywords else "从站内页面中提取关键、有用、可验证的信息"
    requirements = body.get("requirements") or body.get("output_requirements") or f"{default_focus}，生成可读报告"
    title = body.get("title") or (f"站内关键词搜集 - {', '.join(keywords[:3])}" if keywords else "站内重点信息搜集")
    task = _create_fetch_task(
        db,
        title=title,
        urls=urls,
        requirements=requirements,
        model_config_id=body.get("model_config_id"),
        template_id=body.get("template_id"),
        description=f"从 {start_url} 出发，按关键词站内探索",
        extra_input={
            "stage": "site_search_fetch",
            "start_url": start_url,
            "keywords": keywords,
            "max_depth": max_depth,
            "max_pages": max_pages,
            "discovered": discovered,
        },
    )

    return {
        "success": True,
        "data": {"task_id": task.id, "url_count": len(urls), "discovered": discovered},
        "message": f"站内搜集任务已创建，发现 {len(urls)} 个相关页面",
    }


@router.get("/tasks/{task_id}/sources")
def get_sources(
    task_id: str,
    db: Annotated[Session, Depends(get_db)] = None,
):
    task = db.query(Task).filter(Task.id == task_id, Task.deleted_at == None).first()
    if not task:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "任务不存在"})

    sources = (
        db.query(ResearchSource)
        .filter(ResearchSource.task_id == task_id)
        .order_by(ResearchSource.created_at)
        .all()
    )
    return {
        "success": True,
        "data": {
            "task_status": task.status,
            "task_error": task.error_message,
            "sources": [_source_to_dict(source) for source in sources],
        },
        "message": "ok",
    }


@router.post("/tasks/{task_id}/report")
def generate_report(
    task_id: str,
    body: dict,
    db: Annotated[Session, Depends(get_db)] = None,
):
    fetch_task = db.query(Task).filter(Task.id == task_id, Task.deleted_at == None).first()
    if not fetch_task:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "任务不存在"})

    sources = (
        db.query(ResearchSource)
        .filter(ResearchSource.task_id == task_id, ResearchSource.fetch_status == "succeeded")
        .all()
    )
    source_ids = body.get("source_ids") or []
    if source_ids:
        source_id_set = {str(source_id) for source_id in source_ids}
        sources = [source for source in sources if source.id in source_id_set]
    valid_sources = [source for source in sources if len(source.raw_text or "") >= MIN_REPORT_TEXT_LEN]
    if not valid_sources:
        raise HTTPException(
            status_code=400,
            detail={"code": "BAD_REQUEST", "message": "没有足够正文内容可用于生成报告，请检查来源预览或重新抓取。"},
        )

    per_source_limit = max(1200, min(5000, MAX_REPORT_SOURCE_TEXT_CHARS // max(len(valid_sources), 1)))
    source_text = "\n\n---\n\n".join([
        f"### 来源 {idx}: [{source.title or '无标题'}]({source.url})\n"
        f"- 原文长度：{len(source.raw_text or '')} 字\n\n"
        f"{(source.raw_text or '')[:per_source_limit]}"
        for idx, source in enumerate(valid_sources, start=1)
    ])
    if len(source_text) > MAX_REPORT_SOURCE_TEXT_CHARS:
        source_text = source_text[:MAX_REPORT_SOURCE_TEXT_CHARS] + "\n\n...(来源内容已截断)"
    requirements = body.get("requirements") or body.get("output_requirements") or fetch_task.input.get("requirements") or "汇总核心内容"

    first_source_title = valid_sources[0].title or valid_sources[0].url

    report_task = Task(
        type="research",
        title=f"信息搜集报告 - {first_source_title}"[:256],
        description=f"基于信息搜集任务 {fetch_task.id} 生成报告",
        model_config_id=body.get("model_config_id") or fetch_task.model_config_id,
        input={
            "stage": "report",
            "parent_task_id": fetch_task.id,
            "source_ids": [source.id for source in valid_sources],
            "source_count": len(valid_sources),
            "source_text_chars": len(source_text),
            "per_source_limit": per_source_limit,
            "requirements": requirements,
            "output_requirements": requirements,
            "sources": source_text,
            "input": requirements,
            "template_id": body.get("template_id") or fetch_task.input.get("template_id") or "",
            "override_max_tokens": 8192,
        },
        status="queued",
    )
    db.add(report_task)
    db.commit()
    db.refresh(report_task)

    executor = TaskExecutor()
    thread = threading.Thread(target=executor.execute, args=(report_task.id,), daemon=True)
    thread.start()

    return {
        "success": True,
        "data": {"task_id": report_task.id, "source_count": len(valid_sources), "source_text_chars": len(source_text)},
        "message": f"报告生成任务已提交，共 {len(valid_sources)} 个来源",
    }


@router.post("/sources/{source_id}/refetch")
def refetch_source(
    source_id: str,
    db: Annotated[Session, Depends(get_db)] = None,
):
    source = db.query(ResearchSource).filter(ResearchSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "来源不存在"})

    result = fetch_url(source.url)
    source.fetch_status = result["fetch_status"]
    source.source_type = result.get("source_type") or source.source_type
    source.title = result["title"] or source.title
    source.raw_text = result["text"]
    source.error_message = result["error"]
    source.fetched_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "success": True,
        "data": {"status": result["fetch_status"], "error": result["error"]},
        "message": "重新抓取完成",
    }


@router.get("/sources/{source_id}")
def get_source_detail(
    source_id: str,
    db: Annotated[Session, Depends(get_db)] = None,
):
    source = db.query(ResearchSource).filter(ResearchSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "来源不存在"})
    fetched_at = source.fetched_at
    if fetched_at and fetched_at.tzinfo is not None:
        fetched_at = fetched_at.astimezone(timezone.utc).replace(tzinfo=None)
    return {
        "success": True,
        "data": {
            **_source_to_dict(source),
            "raw_text": source.raw_text or "",
            "fetched_at": fetched_at.isoformat() + "Z" if fetched_at else None,
        },
        "message": "ok",
    }
