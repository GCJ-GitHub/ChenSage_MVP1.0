from pydantic import BaseModel, Field
from typing import Optional


class ContentOutlineRequest(BaseModel):
    content_type: str = Field(..., min_length=1, max_length=64, description="论文草稿/专利草稿/小说/剧本/歌词/小红书/知乎/公众号")
    topic: str = Field(..., min_length=1, max_length=2000)
    style: str = Field(default="专业")
    length: str = Field(default="medium", pattern="^(short|medium|long)$")
    materials: str = Field(default="")
    file_ids: list[str] = Field(default_factory=list)
    model_config_id: Optional[str] = None
    template_id: Optional[str] = None


class ContentDraftRequest(BaseModel):
    content_type: str = Field(..., min_length=1, max_length=64)
    topic: str = Field(..., min_length=1, max_length=2000)
    outline: str = Field(default="")
    style: str = Field(default="专业")
    length: str = Field(default="medium", pattern="^(short|medium|long)$")
    materials: str = Field(default="")
    file_ids: list[str] = Field(default_factory=list)
    model_config_id: Optional[str] = None
    template_id: Optional[str] = None


class ContentRewriteRequest(BaseModel):
    source_content: str = Field(..., min_length=1)
    rewrite_type: str = Field(default="polish", pattern="^(polish|expand|shorten|change_style|platform_adapt)$")
    target_style: str = Field(default="")
    content_type: str = Field(default="generic")
    model_config_id: Optional[str] = None
    template_id: Optional[str] = None
