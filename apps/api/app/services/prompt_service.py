from pathlib import Path
import re

from jinja2 import Template

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"

LEGACY_VAR_PATTERN = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}")


def render_prompt_text(text: str, variables: dict) -> str:
    rendered = Template(text or "").render(**variables)

    def replace(match: re.Match) -> str:
        key = match.group(1)
        value = variables.get(key)
        return str(value) if value is not None else match.group(0)

    return LEGACY_VAR_PATTERN.sub(replace, rendered)

DEFAULT_TEMPLATES = {
    "generic": {
        "system": "你是一个智能助手，帮助用户高效完成任务。请用 Markdown 格式输出。",
        "user": "## 任务\n\n{input}\n\n{% if context %}## 参考资料\n\n{context}{% endif %}",
    },
    "content_outline": {
        "system": "你是一位专业的内容创作者。请根据用户需求生成结构化大纲。用 Markdown 格式输出。",
        "user": "## 创作类型\n\n{content_type}\n\n## 主题\n\n{topic}\n\n## 风格\n\n{style}\n\n## 篇幅\n\n{length}\n\n## 补充素材\n\n{materials}",
    },
    "content_draft": {
        "system": "你是一位专业的内容创作者。请根据大纲生成高质量正文。用 Markdown 格式输出，结构清晰。",
        "user": "## 创作类型\n\n{content_type}\n\n## 主题\n\n{topic}\n\n## 大纲\n\n{outline}\n\n## 风格\n\n{style}",
    },
    "content_rewrite": {
        "system": "你是一位专业的文字编辑。请对以下内容进行{rewrite_type}。保持原意，提升表达质量。",
        "user": "## 原文\n\n{source_content}\n\n## 目标风格\n\n{target_style}",
    },
    "interview_analyze": {
        "system": "你是一位资深职业规划师和招聘专家。请分析简历与目标岗位的匹配度，并给出具体修改建议。用 Markdown 格式输出。",
        "user": "## 岗位描述\n\n{job_description}\n\n## 简历内容\n\n{resume}",
    },
    "interview_questions": {
        "system": "你是一位资深面试官。根据岗位要求和候选人简历，生成有针对性的面试问题。每个问题标注考察维度。",
        "user": "## 岗位描述\n\n{job_description}\n\n## 简历内容\n\n{resume}\n\n## 问题数量\n\n{question_count}\n\n## 考察重点\n\n{focus_areas}",
    },
    "interview_review": {
        "system": "你是一位资深面试教练。根据面试全过程记录，给出复盘报告，包括优势、不足、改进建议和下一步准备计划。",
        "user": "## 岗位描述\n\n{job_description}\n\n## 面试记录\n\n{results}",
    },
    "research_summarize": {
        "system": (
            "你是一位严谨的研究助理。只能基于用户提供的来源内容生成报告，不得编造事实、数据、标题、人物、日期或链接。"
            "如果来源中没有信息，请明确写“来源中未找到”。每个关键结论都要标注对应来源链接。请用 Markdown 格式输出。"
        ),
        "user": (
            "## 搜集要求\n\n{requirements}\n\n"
            "## 来源内容\n\n{sources}\n\n"
            "## 输出约束\n\n"
            "- 只能引用上方来源内容。\n"
            "- 不要使用外部知识补全缺失信息。\n"
            "- 不确定的内容必须标注为“来源中未找到”。\n"
            "- 报告末尾列出实际使用的来源链接。"
        ),
    },
    "arxiv_daily": {
        "system": "你是一位学术研究助理。请根据 arXiv 最新论文列表，生成中文论文简报。对每篇论文生成中文摘要、核心贡献、方法概述和推荐理由。",
        "user": "## 研究方向\n\n{direction}\n\n## 论文列表\n\n{papers}",
    },
}


class PromptService:

    def __init__(self):
        self.templates = self._load_templates()

    def _load_templates(self) -> dict:
        templates = dict(DEFAULT_TEMPLATES)
        if PROMPTS_DIR.exists():
            for f in PROMPTS_DIR.glob("*.json"):
                import json
                try:
                    data = json.loads(f.read_text(encoding="utf-8"))
                    templates[data["name"]] = data
                except Exception:
                    pass
        return templates

    def render(self, template_name: str, variables: dict) -> tuple[str, str]:
        tpl = self.templates.get(template_name, self.templates["generic"])
        system = render_prompt_text(tpl.get("system", ""), variables)
        user = render_prompt_text(tpl.get("user", ""), variables)
        return system, user

    def build_messages(self, template_name: str, variables: dict) -> list[dict]:
        system, user = self.render(template_name, variables)
        messages = []
        if system.strip():
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": user})
        return messages
