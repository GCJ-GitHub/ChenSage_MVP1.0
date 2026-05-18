from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.prompt_template import PromptTemplate
from app.schemas.prompt import PromptTemplateCreate, PromptTemplateUpdate, PromptTemplateResponse

router = APIRouter(prefix="/prompts", tags=["prompts"])


@router.get("")
def list_prompts(
    task_type: Annotated[str | None, Query()] = None,
    sub_type: Annotated[str | None, Query()] = None,
    is_active: Annotated[bool | None, Query()] = None,
    db: Annotated[Session, Depends(get_db)] = None,
):
    q = db.query(PromptTemplate)
    if task_type:
        q = q.filter(PromptTemplate.task_type == task_type)
    if sub_type:
        q = q.filter(PromptTemplate.sub_type == sub_type)
    if is_active is not None:
        q = q.filter(PromptTemplate.is_active == is_active)
    items = q.order_by(PromptTemplate.task_type, PromptTemplate.updated_at.desc()).all()
    return {
        "success": True,
        "data": {"items": [PromptTemplateResponse.model_validate(t).model_dump() for t in items]},
        "message": "ok",
    }


@router.post("")
def create_prompt(
    body: PromptTemplateCreate,
    db: Annotated[Session, Depends(get_db)] = None,
):
    if body.is_default:
        db.query(PromptTemplate).filter(
            PromptTemplate.task_type == body.task_type,
            PromptTemplate.sub_type == body.sub_type,
            PromptTemplate.is_default == True,
        ).update({"is_default": False})

    tpl = PromptTemplate(
        task_type=body.task_type,
        sub_type=body.sub_type,
        name=body.name,
        system_prompt=body.system_prompt,
        user_prompt_template=body.user_prompt_template,
        description=body.description,
        is_default=body.is_default,
        is_active=body.is_active,
    )
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return {
        "success": True,
        "data": PromptTemplateResponse.model_validate(tpl).model_dump(),
        "message": "提示词模板已创建",
    }


@router.get("/{template_id}")
def get_prompt(
    template_id: str,
    db: Annotated[Session, Depends(get_db)] = None,
):
    tpl = db.query(PromptTemplate).filter(PromptTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "模板不存在"})
    return {
        "success": True,
        "data": PromptTemplateResponse.model_validate(tpl).model_dump(),
        "message": "ok",
    }


@router.patch("/{template_id}")
def update_prompt(
    template_id: str, body: PromptTemplateUpdate,
    db: Annotated[Session, Depends(get_db)] = None,
):
    tpl = db.query(PromptTemplate).filter(PromptTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "模板不存在"})

    data = body.model_dump(exclude_unset=True)
    if data.get("is_default"):
        next_task_type = data.get("task_type") or tpl.task_type
        next_sub_type = data.get("sub_type") if "sub_type" in data else tpl.sub_type
        db.query(PromptTemplate).filter(
            PromptTemplate.task_type == next_task_type,
            PromptTemplate.sub_type == next_sub_type,
            PromptTemplate.id != template_id,
            PromptTemplate.is_default == True,
        ).update({"is_default": False})

    for k, v in data.items():
        setattr(tpl, k, v)

    db.commit()
    db.refresh(tpl)
    return {
        "success": True,
        "data": PromptTemplateResponse.model_validate(tpl).model_dump(),
        "message": "模板已更新",
    }


@router.delete("/{template_id}")
def delete_prompt(
    template_id: str,
    db: Annotated[Session, Depends(get_db)] = None,
):
    tpl = db.query(PromptTemplate).filter(PromptTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "模板不存在"})
    db.delete(tpl)
    db.commit()
    return {"success": True, "data": None, "message": "模板已删除"}
