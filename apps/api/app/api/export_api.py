from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import json
import os
import re
from datetime import datetime

from app.core.database import get_db
from app.core.config import get_settings
from app.models.task import Task
from app.models.export_record import Export

router = APIRouter(prefix="/export", tags=["export"])


TYPE_LABELS = {
    "generic": "通用任务",
    "content": "内容创作",
    "interview": "简历面试",
    "research": "信息搜集",
    "arxiv_daily": "arXiv 日报",
    "stock_research": "股票研究",
}


def safe_filename_part(value: str | None, fallback: str = "未命名", max_length: int = 48) -> str:
    text = (value or fallback).strip()
    text = re.sub(r'[\\/:*?"<>|\r\n\t]+', " ", text)
    text = re.sub(r"\s+", " ", text).strip(" .")
    if not text:
        text = fallback
    return text[:max_length].strip()


@router.post("/tasks/{task_id}")
def export_task(
    task_id: str,
    db: Annotated[Session, Depends(get_db)] = None,
):
    task = db.query(Task).filter(Task.id == task_id, Task.deleted_at == None).first()
    if not task:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "任务不存在"})

    if task.status != "succeeded" or not task.output:
        raise HTTPException(status_code=400, detail={"code": "BAD_REQUEST", "message": "任务未完成或没有输出，无法导出"})

    settings = get_settings()
    os.makedirs(settings.export_dir, exist_ok=True)

    elapsed_str = f"{(task.elapsed_ms or 0) / 1000:.1f}s" if task.elapsed_ms else "N/A"
    type_cn = TYPE_LABELS.get(task.type, task.type)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    safe_type = safe_filename_part(type_cn, max_length=24)
    safe_title = safe_filename_part(task.title, max_length=48)
    file_name = f"晨枢AI - {safe_type} - {safe_title} - {timestamp}.md"
    file_path = os.path.join(settings.export_dir, file_name)
    input_json = json.dumps(task.input or {}, ensure_ascii=False, indent=2)

    content = f"""# {task.title}

- **任务 ID**: `{task.id}`
- **类型**: {type_cn}
- **状态**: {task.status}
- **模型**: {task.model_name or "未知"}
- **耗时**: {elapsed_str}
- **创建时间**: {task.created_at.isoformat() if task.created_at else "N/A"}
- **完成时间**: {task.finished_at.isoformat() if task.finished_at else "N/A"}

{'- **错误信息**: ' + task.error_message if task.error_message else ''}
---

## 输入

```json
{input_json}
```

---

## 输出

{task.output or '*（无输出）*'}
"""
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

    export = Export(
        task_id=task.id,
        export_type="markdown",
        file_path=file_path,
        file_name=file_name,
    )
    db.add(export)
    db.commit()
    db.refresh(export)

    return {
        "success": True,
        "data": {
            "export_id": export.id,
            "file_name": export.file_name,
            "download_url": f"/export/{export.id}/download",
        },
        "message": "导出成功",
    }


@router.get("/{export_id}/download")
def download_export(
    export_id: str,
    db: Annotated[Session, Depends(get_db)] = None,
):
    export = db.query(Export).filter(Export.id == export_id).first()
    if not export:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "导出记录不存在"})

    if not os.path.exists(export.file_path):
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "导出文件已被删除"})

    return FileResponse(
        path=export.file_path,
        filename=export.file_name,
        media_type="text/markdown; charset=utf-8",
    )
