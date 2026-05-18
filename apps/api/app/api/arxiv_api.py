from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, date, time, timedelta, timezone
import threading, json

from app.core.database import get_db
from app.models.arxiv_direction import ArxivDirection
from app.models.arxiv_paper import ArxivPaper
from app.models.arxiv_daily_report import ArxivDailyReport
from app.models.task import Task
from app.models.model_config import ModelConfig
from app.schemas.arxiv import (
    ArxivDirectionCreate, ArxivDirectionUpdate, ArxivDirectionResponse,
    DailyReportRequest, ArxivPaperBrief, ArxivReportResponse,
)
from app.services.arxiv_service import build_query, fetch_papers
from app.services.task_executor import TaskExecutor

router = APIRouter(prefix="/arxiv", tags=["arxiv"])


# ────── Directions CRUD ──────

@router.get("/directions")
def list_directions(
    enabled: Annotated[bool | None, Query()] = None,
    db: Annotated[Session, Depends(get_db)] = None,
):
    q = db.query(ArxivDirection)
    if enabled is not None:
        q = q.filter(ArxivDirection.is_enabled == enabled)
    items = q.order_by(ArxivDirection.updated_at.desc()).all()
    return {
        "success": True,
        "data": {"directions": [ArxivDirectionResponse.model_validate(d).model_dump() for d in items]},
        "message": "ok",
    }


@router.post("/directions")
def create_direction(
    body: ArxivDirectionCreate,
    db: Annotated[Session, Depends(get_db)] = None,
):
    d = ArxivDirection(
        name=body.name,
        keywords=body.keywords,
        exclude_keywords=body.exclude_keywords,
        categories=body.categories,
        is_enabled=body.is_enabled,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return {
        "success": True,
        "data": ArxivDirectionResponse.model_validate(d).model_dump(),
        "message": "研究方向已创建",
    }


@router.patch("/directions/{direction_id}")
def update_direction(
    direction_id: str, body: ArxivDirectionUpdate,
    db: Annotated[Session, Depends(get_db)] = None,
):
    d = db.query(ArxivDirection).filter(ArxivDirection.id == direction_id).first()
    if not d:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "研究方向不存在"})
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(d, k, v)
    db.commit()
    db.refresh(d)
    return {
        "success": True,
        "data": ArxivDirectionResponse.model_validate(d).model_dump(),
        "message": "已更新",
    }


@router.delete("/directions/{direction_id}")
def delete_direction(
    direction_id: str,
    db: Annotated[Session, Depends(get_db)] = None,
):
    d = db.query(ArxivDirection).filter(ArxivDirection.id == direction_id).first()
    if not d:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "研究方向不存在"})
    db.delete(d)
    db.commit()
    return {"success": True, "data": None, "message": "已删除"}


# ────── Fetch papers ──────

@router.post("/directions/{direction_id}/fetch")
def fetch_papers_for_direction(
    direction_id: str,
    db: Annotated[Session, Depends(get_db)] = None,
):
    d = db.query(ArxivDirection).filter(ArxivDirection.id == direction_id).first()
    if not d:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "研究方向不存在"})

    try:
        query = build_query(
            d.keywords or [],
            d.categories or [],
            d.exclude_keywords or [],
        )
        papers = fetch_papers(query, max_results=20)
    except Exception as e:
        raise HTTPException(502, detail={"code": "ARXIV_FETCH_FAILED", "message": f"arXiv 拉取失败: {str(e)[:200]}"})

    new_count = 0
    for p in papers:
        existing = db.query(ArxivPaper).filter(
            ArxivPaper.direction_id == direction_id,
            ArxivPaper.arxiv_id == p["arxiv_id"],
        ).first()
        if not existing:
            db.add(ArxivPaper(
                direction_id=direction_id,
                arxiv_id=p["arxiv_id"],
                title=p["title"],
                authors=p["authors"],
                abstract=p["abstract"],
                pdf_url=p["pdf_url"],
                abs_url=p["abs_url"],
                published_at=_parse_dt(p["published_at"]),
                updated_at_arxiv=_parse_dt(p["updated_at_arxiv"]),
                categories=p["categories"],
            ))
            new_count += 1

    d.last_run_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "success": True,
        "data": {"direction_id": direction_id, "fetched_count": len(papers), "new_count": new_count},
        "message": f"拉取完成，共 {len(papers)} 篇（{new_count} 篇新增）",
    }


# ────── List papers ──────

@router.get("/papers")
def list_papers(
    direction_id: Annotated[str | None, Query()] = None,
    date_from: Annotated[str | None, Query()] = None,
    starred: Annotated[bool | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    db: Annotated[Session, Depends(get_db)] = None,
):
    q = db.query(ArxivPaper)
    if direction_id:
        q = q.filter(ArxivPaper.direction_id == direction_id)
    if date_from:
        try:
            q = q.filter(ArxivPaper.published_at >= datetime.combine(date.fromisoformat(date_from), time.min))
        except ValueError:
            raise HTTPException(400, detail={"code": "BAD_REQUEST", "message": "date_from 格式应为 YYYY-MM-DD"})
    if starred is not None:
        q = q.filter(ArxivPaper.is_starred == starred)

    total = q.count()
    items = q.order_by(ArxivPaper.published_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    return {
        "success": True,
        "data": {
            "items": [ArxivPaperBrief.model_validate(p).model_dump() for p in items],
            "page": page, "page_size": page_size, "total": total,
            "has_next": (page * page_size) < total,
        },
        "message": "ok",
    }


@router.patch("/papers/{paper_id}")
def update_paper(
    paper_id: str, body: dict,
    db: Annotated[Session, Depends(get_db)] = None,
):
    p = db.query(ArxivPaper).filter(ArxivPaper.id == paper_id).first()
    if not p:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "论文不存在"})
    for k, v in body.items():
        if hasattr(p, k):
            setattr(p, k, v)
    db.commit()
    return {"success": True, "data": None, "message": "已更新"}


# ────── Daily Report ──────

@router.post("/directions/{direction_id}/daily-report")
def generate_daily_report(
    direction_id: str,
    body: DailyReportRequest,
    db: Annotated[Session, Depends(get_db)] = None,
):
    d = db.query(ArxivDirection).filter(ArxivDirection.id == direction_id).first()
    if not d:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "研究方向不存在"})

    report_date = body.report_date or date.today().isoformat()
    try:
        report_day = date.fromisoformat(report_date)
    except ValueError:
        raise HTTPException(400, detail={"code": "BAD_REQUEST", "message": "report_date 格式应为 YYYY-MM-DD"})

    start_dt = datetime.combine(report_day, time.min)
    end_dt = start_dt + timedelta(days=1)
    papers = (
        db.query(ArxivPaper)
        .filter(ArxivPaper.direction_id == direction_id)
        .filter(ArxivPaper.published_at >= start_dt, ArxivPaper.published_at < end_dt)
        .order_by(ArxivPaper.published_at.desc())
        .limit(body.max_papers)
        .all()
    )
    if not papers:
        raise HTTPException(400, detail={"code": "BAD_REQUEST", "message": f"该方向在 {report_date} 没有已拉取论文，请先拉取或选择有论文的日期"})

    paper_text = "\n\n---\n\n".join([
        f"### {i+1}. {p.title}\n"
        f"- **arXiv ID**: {p.arxiv_id}\n"
        f"- **作者**: {', '.join((p.authors or ['未知'])[:3])}\n"
        f"- **发布时间**: {str(p.published_at)[:19]}\n"
        f"- **链接**: {p.abs_url}\n"
        f"- **摘要**: {(p.abstract or '无')[:500]}"
        for i, p in enumerate(papers)
    ])
    # 总长度超 12000 字符时强制截断
    if len(paper_text) > 12000:
        paper_text = paper_text[:12000] + "\n\n...(论文列表已截断)"

    config_id = body.model_config_id
    if not config_id:
        default_model = db.query(ModelConfig).filter(ModelConfig.is_default == True, ModelConfig.is_enabled == True).first()
        if default_model:
            config_id = default_model.id

    report_task = Task(
        type="arxiv_daily",
        title=f"arXiv 日报 - {d.name} ({report_date})",
        description=f"研究方向「{d.name}」的每日论文简报",
        model_config_id=config_id,
        input={
            "stage": "report",
            "direction": d.name,
            "papers": paper_text,
            "direction_id": direction_id,
            "report_date": report_date,
            "paper_count": len(papers),
            "template_id": body.template_id or "",
            "override_max_tokens": 16384,
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
        "data": {"task_id": report_task.id, "report_date": report_date, "paper_count": len(papers)},
        "message": f"报告生成任务已提交（{len(papers)} 篇论文）",
    }


@router.get("/reports")
def list_reports(
    direction_id: Annotated[str | None, Query()] = None,
    date_from: Annotated[str | None, Query()] = None,
    db: Annotated[Session, Depends(get_db)] = None,
):
    q = db.query(ArxivDailyReport)
    if direction_id:
        q = q.filter(ArxivDailyReport.direction_id == direction_id)
    if date_from:
        q = q.filter(ArxivDailyReport.report_date >= date_from)
    items = q.order_by(ArxivDailyReport.report_date.desc()).limit(30).all()
    return {
        "success": True,
        "data": {"reports": [ArxivReportResponse.model_validate(r).model_dump() for r in items]},
        "message": "ok",
    }


# ────── Helpers ──────

def _parse_dt(val: str | None) -> datetime | None:
    if not val:
        return None
    try:
        return datetime.fromisoformat(val.replace("Z", "+00:00"))
    except Exception:
        return None
