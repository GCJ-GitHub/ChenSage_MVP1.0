from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional

from app.core.database import get_db
from app.models.model_config import ModelConfig
from app.schemas.model import ModelConfigCreate, ModelConfigUpdate, ModelConfigResponse
from app.services.model_client import ModelClient

router = APIRouter(prefix="/models", tags=["models"])


@router.get("")
def list_models(
    enabled: Annotated[bool | None, Query()] = None,
    db: Annotated[Session, Depends(get_db)] = None,
):
    query = db.query(ModelConfig)
    if enabled is not None:
        query = query.filter(ModelConfig.is_enabled == enabled)
    items = query.order_by(ModelConfig.updated_at.desc()).all()
    return {
        "success": True,
        "data": {"items": [ModelConfigResponse.model_validate(m).model_dump() for m in items]},
        "message": "ok",
    }


@router.post("")
def create_model(
    body: ModelConfigCreate,
    db: Annotated[Session, Depends(get_db)] = None,
):
    config = ModelConfig(
        provider=body.provider,
        base_url=body.base_url,
        model_name=body.model_name,
        display_name=body.display_name,
        is_default=body.is_default,
        is_enabled=body.is_enabled,
    )
    config.extra_params = {
        "temperature": body.temperature,
        "max_tokens": body.max_tokens,
        "thinking_mode": body.thinking_mode,
    }
    client = ModelClient()
    if body.api_key:
        config.api_key_encrypted = client.encrypt_key(body.api_key)
    if body.is_default:
        db.query(ModelConfig).filter(ModelConfig.is_default == True).update({"is_default": False})
    db.add(config)
    db.commit()
    db.refresh(config)
    return {
        "success": True,
        "data": ModelConfigResponse.model_validate(config).model_dump(),
        "message": "模型配置已创建",
    }


@router.get("/{model_id}")
def get_model(
    model_id: str,
    db: Annotated[Session, Depends(get_db)] = None,
):
    config = db.query(ModelConfig).filter(ModelConfig.id == model_id).first()
    if not config:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "模型配置不存在"})
    return {
        "success": True,
        "data": ModelConfigResponse.model_validate(config).model_dump(),
        "message": "ok",
    }


@router.patch("/{model_id}")
def update_model(
    model_id: str,
    body: ModelConfigUpdate,
    db: Annotated[Session, Depends(get_db)] = None,
):
    config = db.query(ModelConfig).filter(ModelConfig.id == model_id).first()
    if not config:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "模型配置不存在"})
    client = ModelClient()
    update_data = body.model_dump(exclude_unset=True)
    if "api_key" in update_data:
        if update_data["api_key"]:
            update_data["api_key_encrypted"] = client.encrypt_key(update_data.pop("api_key"))
        else:
            update_data.pop("api_key")

    # Build extra_params from temperature/max_tokens/thinking_mode if provided
    eps = (config.extra_params or {}).copy()
    for k in ("temperature", "max_tokens", "thinking_mode", "top_p"):
        if k in update_data and update_data[k] is not None:
            eps[k] = update_data.pop(k)
    if eps:
        update_data["extra_params"] = eps

    if update_data.get("is_default"):
        db.query(ModelConfig).filter(ModelConfig.id != model_id, ModelConfig.is_default == True).update(
            {"is_default": False}
        )
    for key, value in update_data.items():
        setattr(config, key, value)
    db.commit()
    db.refresh(config)
    return {
        "success": True,
        "data": ModelConfigResponse.model_validate(config).model_dump(),
        "message": "模型配置已更新",
    }


@router.delete("/{model_id}")
def delete_model(
    model_id: str,
    db: Annotated[Session, Depends(get_db)] = None,
):
    config = db.query(ModelConfig).filter(ModelConfig.id == model_id).first()
    if not config:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "模型配置不存在"})
    db.delete(config)
    db.commit()
    return {"success": True, "data": None, "message": "模型配置已删除"}


@router.post("/{model_id}/test")
def test_model(
    model_id: str,
    db: Annotated[Session, Depends(get_db)] = None,
):
    config = db.query(ModelConfig).filter(ModelConfig.id == model_id).first()
    if not config:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "模型配置不存在"})
    client = ModelClient()
    result = client.test_connection(config)
    config.last_test_status = result["status"]
    config.last_test_error = None if result["status"] == "success" else result.get("message")
    db.commit()
    return {"success": True, "data": result, "message": "ok"}
