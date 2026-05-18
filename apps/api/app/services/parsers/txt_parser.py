import os

ENCODINGS = ["utf-8", "gbk", "gb2312", "latin-1"]


def parse_text(file_path: str) -> tuple[str, str | None]:
    try:
        content = _read_with_fallback_encoding(file_path)
        if not content.strip():
            return "", "文件内容为空"
        return content.strip(), None
    except Exception as e:
        return "", f"文本解析失败: {str(e)[:300]}"


def _read_with_fallback_encoding(file_path: str) -> str:
    for enc in ENCODINGS:
        try:
            with open(file_path, "r", encoding=enc) as f:
                return f.read()
        except (UnicodeDecodeError, LookupError):
            continue
    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        return f.read()
