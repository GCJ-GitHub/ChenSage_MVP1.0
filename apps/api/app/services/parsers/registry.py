from app.services.parsers.pdf_parser import parse_pdf
from app.services.parsers.docx_parser import parse_docx
from app.services.parsers.txt_parser import parse_text

PARSERS = {
    ".pdf": parse_pdf,
    ".docx": parse_docx,
    ".md": parse_text,
    ".txt": parse_text,
}


def parse_file(file_path: str, extension: str) -> tuple[str, str | None]:
    ext = extension.lower()
    parser = PARSERS.get(ext)
    if not parser:
        return "", f"不支持的文件格式: {ext}"
    return parser(file_path)


def supported_extensions() -> set[str]:
    return set(PARSERS.keys())
