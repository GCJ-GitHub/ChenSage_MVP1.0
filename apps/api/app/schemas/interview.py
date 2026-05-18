from pydantic import BaseModel, Field
from typing import Optional


class InterviewAnalyzeRequest(BaseModel):
    resume_file_id: str = Field(..., min_length=1)
    job_description: str = Field(..., min_length=1, max_length=5000)
    model_config_id: Optional[str] = None
    template_id: Optional[str] = None


class InterviewQuestionsRequest(BaseModel):
    question_count: int = Field(default=8, ge=1, le=20)
    difficulty: str = Field(default="medium", pattern="^(easy|medium|hard)$")
    focus_areas: list[str] = Field(default_factory=lambda: ["项目经历", "技术能力", "岗位匹配"])
    model_config_id: Optional[str] = None
    template_id: Optional[str] = None


class InterviewAnswerRequest(BaseModel):
    question_id: str = Field(..., min_length=1)
    question: str = Field(..., min_length=1)
    answer: str = Field(..., min_length=1, max_length=5000)
    model_config_id: Optional[str] = None
    template_id: Optional[str] = None


class InterviewReviewRequest(BaseModel):
    model_config_id: Optional[str] = None
    template_id: Optional[str] = None
