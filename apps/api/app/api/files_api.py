from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File as FastAPIFile, Form
from sqlalchemy.orm import Session
from datetime import datetime, timezone
import os, uuid, threading

from app.core.database import get_db
from app.core.config import get_settings
from app.models.file import File
from app.schemas.file import FileResponse
from app.services.parsers.registry import parse_file, supported_extensions

router = APIRouter(prefix="/files", tags=["files"])

ALLOWED_EXTENSIONS = supported_extensions()
MAX_FILE_SIZE = 20 * 1024 * 1024


@router.post("")
async def upload_file(
    file: Annotated[UploadFile, FastAPIFile()],
    usage_hint: str = Form(""),
    db: Session = Depends(get_db),
):
    settings = get_settings()
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail={"code": "FILE_TYPE_UNSUPPORTED", "message": f"不支持 {ext} 格式，请上传 {', '.join(ALLOWED_EXTENSIONS)}"},
        )

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail={"code": "BAD_REQUEST", "message": f"文件大小超过 20MB 限制"})

    os.makedirs(settings.upload_dir, exist_ok=True)
    storage_name = f"{uuid.uuid4().hex}{ext}"
    storage_path = os.path.join(settings.upload_dir, storage_name)

    with open(storage_path, "wb") as f:
        f.write(contents)

    db_file = File(
        original_name=file.filename or "unknown",
        storage_name=storage_name,
        storage_path=storage_path,
        mime_type=file.content_type,
        extension=ext,
        size_bytes=len(contents),
        parse_status="uploaded",
    )
    db.add(db_file)
    db.commit()
    db.refresh(db_file)

    # 后台解析
    threading.Thread(target=_parse_file_bg, args=(db_file.id,), daemon=True).start()

    return {
        "success": True,
        "data": {"id": db_file.id, "original_name": db_file.original_name, "size_bytes": db_file.size_bytes, "parse_status": db_file.parse_status},
        "message": "文件已上传，正在解析...",
    }


def _parse_file_bg(file_id: str):
    from app.core.database import SessionLocal
    db = SessionLocal()
    try:
        db_file = db.query(File).filter(File.id == file_id).first()
        if not db_file:
            return

        db_file.parse_status = "parsing"
        db.commit()

        text, error = parse_file(db_file.storage_path, db_file.extension or ".txt")

        db_file.parsed_text = text
        db_file.parse_error = error
        db_file.parse_status = "parsed" if not error else "failed"
        db_file.updated_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as e:
        try:
            db_file = db.query(File).filter(File.id == file_id).first()
            if db_file:
                db_file.parse_status = "failed"
                db_file.parse_error = str(e)[:500]
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


@router.get("")
def list_files(
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    parse_status: Annotated[str | None, Query()] = None,
    db: Annotated[Session, Depends(get_db)] = None,
):
    query = db.query(File).filter(File.deleted_at == None)
    if parse_status:
        query = query.filter(File.parse_status == parse_status)

    total = query.count()
    items = query.order_by(File.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    return {
        "success": True,
        "data": {
            "items": [FileResponse.model_validate(f).model_dump() for f in items],
            "page": page, "page_size": page_size, "total": total,
            "has_next": (page * page_size) < total,
        },
        "message": "ok",
    }


@router.get("/{file_id}")
def get_file(
    file_id: str,
    db: Annotated[Session, Depends(get_db)] = None,
):
    f = db.query(File).filter(File.id == file_id, File.deleted_at == None).first()
    if not f:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "文件不存在"})
    return {
        "success": True,
        "data": FileResponse.model_validate(f).model_dump(),
        "message": "ok",
    }


@router.post("/{file_id}/parse")
def reparse_file(
    file_id: str,
    db: Annotated[Session, Depends(get_db)] = None,
):
    f = db.query(File).filter(File.id == file_id, File.deleted_at == None).first()
    if not f:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "文件不存在"})

    f.parse_status = "uploaded"
    db.commit()
    threading.Thread(target=_parse_file_bg, args=(file_id,), daemon=True).start()

    return {"success": True, "data": {"parse_status": "uploaded"}, "message": "已触发重新解析"}


@router.delete("/{file_id}")
def delete_file(
    file_id: str,
    db: Annotated[Session, Depends(get_db)] = None,
):
    f = db.query(File).filter(File.id == file_id, File.deleted_at == None).first()
    if not f:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "文件不存在"})
    f.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return {"success": True, "data": None, "message": "文件已删除"}
