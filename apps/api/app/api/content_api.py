from typing import Annotated
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
import threading

from app.core.database import get_db
from app.models.task import Task
from app.models.task_file import TaskFile
from app.schemas.content import ContentOutlineRequest, ContentDraftRequest, ContentRewriteRequest
from app.services.task_executor import TaskExecutor

router = APIRouter(prefix="/content", tags=["content"])

REWRITE_LABELS = {
    "polish": "润色",
    "expand": "扩写",
    "shorten": "缩写",
    "change_style": "改风格",
    "platform_adapt": "平台适配",
}


def _create_and_run(db, task_type, title, description, input_data, file_ids, model_config_id, template_id=None):
    task = Task(
        type=task_type, title=title, description=description,
        input=input_data, model_config_id=model_config_id, status="draft",
    )
    if template_id:
        task.input["template_id"] = template_id
    db.add(task)
    db.commit()
    db.refresh(task)

    if file_ids:
        for fid in file_ids:
            tf = TaskFile(task_id=task.id, file_id=fid, usage_type="context")
            db.add(tf)
        db.commit()

    return {"task_id": task.id, "status": "draft"}


@router.post("/outline")
def generate_outline(
    body: ContentOutlineRequest,
    db: Annotated[Session, Depends(get_db)] = None,
):
    result = _create_and_run(
        db, "content",
        f"{body.content_type} - 大纲",
        f"为「{body.topic}」生成{body.content_type}大纲",
        {
            "stage": "outline",
            "content_type": body.content_type,
            "topic": body.topic,
            "style": body.style,
            "length": body.length,
            "materials": body.materials,
            "_raw_input": body.topic,
        },
        body.file_ids, body.model_config_id, body.template_id,
    )

    executor = TaskExecutor()
    thread = threading.Thread(target=executor.execute, args=(result["task_id"],), daemon=True)
    thread.start()

    return {"success": True, "data": result, "message": "大纲生成任务已提交"}


@router.post("/draft")
def generate_draft(
    body: ContentDraftRequest,
    db: Annotated[Session, Depends(get_db)] = None,
):
    result = _create_and_run(
        db, "content",
        f"{body.content_type} - 正文",
        f"为「{body.topic}」生成{body.content_type}正文",
        {
            "stage": "draft",
            "content_type": body.content_type,
            "topic": body.topic,
            "outline": body.outline,
            "style": body.style,
            "length": body.length,
            "materials": body.materials,
            "_raw_input": body.topic,
        },
        body.file_ids, body.model_config_id, body.template_id,
    )

    executor = TaskExecutor()
    thread = threading.Thread(target=executor.execute, args=(result["task_id"],), daemon=True)
    thread.start()

    return {"success": True, "data": result, "message": "正文生成任务已提交"}


@router.post("/rewrite")
def rewrite_content(
    body: ContentRewriteRequest,
    db: Annotated[Session, Depends(get_db)] = None,
):
    rewrite_label = REWRITE_LABELS.get(body.rewrite_type, body.rewrite_type)
    result = _create_and_run(
        db, "content",
        f"改写 - {rewrite_label}",
        f"对{body.content_type}内容进行{rewrite_label}",
        {
            "stage": "rewrite",
            "rewrite_type": body.rewrite_type,
            "source_content": body.source_content,
            "target_style": body.target_style,
            "content_type": body.content_type,
            "_raw_input": body.source_content[:500],
        },
        [], body.model_config_id, body.template_id,
    )

    executor = TaskExecutor()
    thread = threading.Thread(target=executor.execute, args=(result["task_id"],), daemon=True)
    thread.start()

    return {"success": True, "data": result, "message": f"{rewrite_label}任务已提交"}
