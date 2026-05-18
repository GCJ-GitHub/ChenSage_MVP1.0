from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import threading, json

from app.core.database import get_db
from app.models.task import Task
from app.models.task_file import TaskFile
from app.models.file import File
from app.schemas.interview import (
    InterviewAnalyzeRequest,
    InterviewQuestionsRequest,
    InterviewAnswerRequest,
    InterviewReviewRequest,
)
from app.services.task_executor import TaskExecutor

router = APIRouter(prefix="/interview", tags=["interview"])


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
            tf = TaskFile(task_id=task.id, file_id=fid, usage_type="resume" if task_type == "interview" else "context")
            db.add(tf)
        db.commit()

    executor = TaskExecutor()
    thread = threading.Thread(target=executor.execute, args=(task.id,), daemon=True)
    thread.start()

    return task


@router.post("/analyze")
def analyze_resume(
    body: InterviewAnalyzeRequest,
    db: Annotated[Session, Depends(get_db)] = None,
):
    # 验证文件存在
    file = db.query(File).filter(File.id == body.resume_file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "文件不存在"})

    resume_text = file.parsed_text or "文件尚未解析完成"
    title = f"简历分析 - {file.original_name}"

    task = _create_and_run(
        db, "interview",
        title,
        f"分析简历与岗位匹配度",
        {
            "stage": "analyze",
            "job_description": body.job_description,
            "resume": resume_text[:8000],
        },
        [], body.model_config_id, body.template_id,
    )

    return {
        "success": True,
        "data": {
            "task_id": task.id,
            "status": task.status,
            "resume_file": {"id": file.id, "name": file.original_name, "parse_status": file.parse_status},
        },
        "message": "简历分析任务已提交",
    }


@router.post("/{task_id}/questions")
def generate_questions(
    task_id: str,
    body: InterviewQuestionsRequest,
    db: Annotated[Session, Depends(get_db)] = None,
):
    parent = db.query(Task).filter(Task.id == task_id).first()
    if not parent:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "任务不存在"})

    resume = parent.input.get("resume", "")
    jd = parent.input.get("job_description", "")

    task = _create_and_run(
        db, "interview",
        f"面试出题",
        f"生成 {body.question_count} 道面试题，难度 {body.difficulty}",
        {
            "stage": "questions",
            "resume": resume[:8000],
            "job_description": jd,
            "question_count": body.question_count,
            "difficulty": body.difficulty,
            "focus_areas": body.focus_areas,
            "_raw_input": f"岗位: {jd[:500]}\n考察重点: {', '.join(body.focus_areas)}",
        },
        [], body.model_config_id, body.template_id,
    )

    return {
        "success": True,
        "data": {"task_id": task.id, "status": task.status, "parent_task_id": task_id},
        "message": "面试题生成任务已提交",
    }


@router.post("/{task_id}/answers")
def submit_answer(
    task_id: str,
    body: InterviewAnswerRequest,
    db: Annotated[Session, Depends(get_db)] = None,
):
    parent = db.query(Task).filter(Task.id == task_id).first()
    if not parent:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "任务不存在"})

    jd = parent.input.get("job_description", "")

    task = _create_and_run(
        db, "interview",
        f"回答评价 - Q{body.question_id[-4:]}",
        f"评价面试回答",
        {
            "stage": "answer",
            "question": body.question,
            "answer": body.answer,
            "job_description": jd,
            "_raw_input": f"问题: {body.question}\n回答: {body.answer[:1000]}",
        },
        [], body.model_config_id, body.template_id,
    )

    return {
        "success": True,
        "data": {"task_id": task.id, "status": task.status, "parent_task_id": task_id},
        "message": "回答评价任务已提交",
    }


@router.post("/{task_id}/review")
def generate_review(
    task_id: str,
    body: InterviewReviewRequest,
    db: Annotated[Session, Depends(get_db)] = None,
):
    parent = db.query(Task).filter(Task.id == task_id).first()
    if not parent:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "任务不存在"})

    jd = parent.input.get("job_description", "")
    resume = parent.input.get("resume", "")

    # Collect all answers and evaluations for this interview session
    # The frontend will pass the accumulated results
    results_text = parent.input.get("interview_results", "")

    task = _create_and_run(
        db, "interview",
        "面试复盘报告",
        "生成面试完整复盘报告",
        {
            "stage": "review",
            "resume": resume[:8000],
            "job_description": jd,
            "results": results_text,
            "_raw_input": f"岗位: {jd[:500]}",
        },
        [], body.model_config_id, body.template_id,
    )

    return {
        "success": True,
        "data": {"task_id": task.id, "status": task.status, "parent_task_id": task_id},
        "message": "复盘报告生成任务已提交",
    }


@router.post("/{task_id}/save-result")
def save_interview_result(
    task_id: str,
    body: dict,
    db: Annotated[Session, Depends(get_db)] = None,
):
    """Accumulate interview answers+evaluations into the parent task"""
    parent = db.query(Task).filter(Task.id == task_id).first()
    if not parent:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "任务不存在"})

    current = (parent.input or {}).copy()
    results = current.get("interview_results", "")
    incoming = body.get("result", "")
    if body.get("replace"):
        results = incoming
    else:
        results += incoming
    current["interview_results"] = results
    parent.input = current
    db.commit()

    return {"success": True, "data": {"task_id": task_id}, "message": "结果已保存"}
