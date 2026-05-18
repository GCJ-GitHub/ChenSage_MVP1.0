from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import threading

from app.core.database import get_db
from app.models.task import Task
from app.schemas.task import TaskCreate, TaskUpdate, TaskRunRequest, TaskResponse
from app.services.task_executor import TaskExecutor

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("")
def list_tasks(
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    type: Annotated[str | None, Query()] = None,
    status: Annotated[str | None, Query()] = None,
    keyword: Annotated[str | None, Query()] = None,
    db: Annotated[Session, Depends(get_db)] = None,
):
    TaskExecutor.mark_stale_tasks(db)
    query = db.query(Task).filter(Task.deleted_at == None)
    if type:
        query = query.filter(Task.type == type)
    if status:
        query = query.filter(Task.status == status)
    if keyword:
        query = query.filter(
            (Task.title.ilike(f"%{keyword}%")) | (Task.description.ilike(f"%{keyword}%"))
        )
    total = query.count()
    items = query.order_by(Task.updated_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "success": True,
        "data": {
            "items": [TaskResponse.model_validate(t).model_dump() for t in items],
            "page": page, "page_size": page_size, "total": total,
            "has_next": (page * page_size) < total,
        },
        "message": "ok",
    }


@router.post("")
def create_task(
    body: TaskCreate,
    db: Annotated[Session, Depends(get_db)] = None,
):
    task = Task(
        type=body.type,
        title=body.title,
        description=body.description,
        model_config_id=body.model_config_id,
        input=body.input,
        output_format=body.output_format,
        status="draft",
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    if body.file_ids:
        from app.models.task_file import TaskFile
        for file_id in body.file_ids:
            tf = TaskFile(task_id=task.id, file_id=file_id, usage_type="context")
            db.add(tf)
        db.commit()

    return {
        "success": True,
        "data": TaskResponse.model_validate(task).model_dump(),
        "message": "任务已创建",
    }


@router.get("/{task_id}")
def get_task(
    task_id: str,
    db: Annotated[Session, Depends(get_db)] = None,
):
    TaskExecutor.mark_stale_tasks(db)
    task = db.query(Task).filter(Task.id == task_id, Task.deleted_at == None).first()
    if not task:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "任务不存在"})
    # 同时加载关联文件
    from app.models.task_file import TaskFile
    from app.models.file import File
    refs = db.query(TaskFile).filter(TaskFile.task_id == task_id).all()
    files = []
    for ref in refs:
        f = db.query(File).filter(File.id == ref.file_id).first()
        if f:
            files.append({"id": f.id, "name": f.original_name, "parse_status": f.parse_status})
    data = TaskResponse.model_validate(task).model_dump()
    data["files"] = files
    return {"success": True, "data": data, "message": "ok"}


@router.patch("/{task_id}")
def update_task(
    task_id: str, body: TaskUpdate,
    db: Annotated[Session, Depends(get_db)] = None,
):
    task = db.query(Task).filter(Task.id == task_id, Task.deleted_at == None).first()
    if not task:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "任务不存在"})
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(task, key, value)
    db.commit()
    db.refresh(task)
    return {"success": True, "data": TaskResponse.model_validate(task).model_dump(), "message": "任务已更新"}


@router.post("/{task_id}/run")
def run_task(
    task_id: str, body: TaskRunRequest,
    db: Annotated[Session, Depends(get_db)] = None,
):
    task = db.query(Task).filter(Task.id == task_id, Task.deleted_at == None).first()
    if not task:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "任务不存在"})
    if task.status in ("running", "queued"):
        raise HTTPException(status_code=400, detail={"code": "TASK_NOT_EXECUTABLE", "message": "任务正在执行中"})

    task.status = "queued"
    db.commit()

    if not body.stream:
        executor = TaskExecutor()
        thread = threading.Thread(target=executor.execute, args=(task_id,), daemon=True)
        thread.start()

    return {"success": True, "data": {"task_id": task.id, "status": "queued"}, "message": "任务已提交执行"}


@router.get("/{task_id}/events")
def task_events(
    task_id: str,
    db: Annotated[Session, Depends(get_db)] = None,
):
    TaskExecutor.mark_stale_tasks(db)
    task = db.query(Task).filter(Task.id == task_id, Task.deleted_at == None).first()
    if not task:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "任务不存在"})

    def event_stream():
        import json
        executor = TaskExecutor()
        yield f"data: {json.dumps({'event': 'status', 'status': 'running'})}\n\n"
        for chunk in executor.execute_stream(task_id):
            if isinstance(chunk, str) and chunk.startswith("ERROR:"):
                yield f"data: {json.dumps({'event': 'error', 'message': chunk[6:]})}\n\n"
                yield "data: {\"event\": \"done\", \"status\": \"failed\"}\n\n"
                return
            elif isinstance(chunk, str):
                yield f"data: {json.dumps({'event': 'delta', 'text': chunk})}\n\n"
            else:
                pass
        yield f"data: {json.dumps({'event': 'done', 'status': 'succeeded'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{task_id}/retry")
def retry_task(
    task_id: str,
    db: Annotated[Session, Depends(get_db)] = None,
):
    task = db.query(Task).filter(Task.id == task_id, Task.deleted_at == None).first()
    if not task:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "任务不存在"})
    if task.status not in ("failed", "succeeded"):
        raise HTTPException(status_code=400, detail={"code": "TASK_NOT_EXECUTABLE", "message": "仅失败或已完成的任务可以重试"})

    task.status = "queued"
    task.error_message = None
    db.commit()

    executor = TaskExecutor()
    thread = threading.Thread(target=executor.execute, args=(task_id,), daemon=True)
    thread.start()

    return {"success": True, "data": {"task_id": task.id, "status": "queued"}, "message": "任务已提交重试"}


@router.delete("/{task_id}")
def delete_task(
    task_id: str,
    db: Annotated[Session, Depends(get_db)] = None,
):
    task = db.query(Task).filter(Task.id == task_id, Task.deleted_at == None).first()
    if not task:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "任务不存在"})
    from datetime import timezone
    task.deleted_at = __import__("datetime").datetime.now(timezone.utc)
    db.commit()
    return {"success": True, "data": None, "message": "任务已删除"}
