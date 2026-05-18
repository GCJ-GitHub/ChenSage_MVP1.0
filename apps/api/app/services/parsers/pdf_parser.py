import os
from pypdf import PdfReader


def parse_pdf(file_path: str) -> tuple[str, str | None]:
    try:
        reader = PdfReader(file_path)
        parts = []
        for i, page in enumerate(reader.pages):
            text = page.extract_text()
            if text:
                parts.append(text)
        full_text = "\n\n".join(parts)
        if not full_text.strip():
            return "", "PDF 页面未能提取到文本（可能是扫描件或图片型 PDF）"
        return full_text.strip(), None
    except Exception as e:
        return "", f"PDF 解析失败: {str(e)[:300]}"
