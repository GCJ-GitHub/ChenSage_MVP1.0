import csv
import json
import re
import time
from io import BytesIO, StringIO
from collections import deque
from urllib.parse import urldefrag, urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from pypdf import PdfReader

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml,application/json,text/plain,application/pdf;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

TIMEOUT = 20
MAX_HTML_CHARS = 16000
MAX_PDF_CHARS = 30000
MAX_STRUCTURED_CHARS = 20000
MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024
MAX_SCRIPT_FETCHES = 12
MAX_DISCOVERY_HTML_CHARS = 300000
MIN_CONTENT_LEN = 200
BAD_CONTENT_MARKERS = (
    "enable javascript",
    "please enable javascript",
    "access denied",
    "captcha",
    "robot check",
    "verify you are human",
)
STATE_MARKERS = (
    "__NEXT_DATA__",
    "__NUXT__",
    "__INITIAL_STATE__",
    "__APOLLO_STATE__",
    "__PRELOADED_STATE__",
    "__REACT_QUERY_STATE__",
    "initialState",
    "pageData",
)
STRUCTURED_KEYS = {
    "@type",
    "abstract",
    "articlebody",
    "author",
    "awayteam",
    "blueside",
    "bout",
    "card",
    "category",
    "cnname",
    "cnsname",
    "cnvname",
    "content",
    "date",
    "datepublished",
    "description",
    "enddate",
    "event",
    "eventstatus",
    "fighter",
    "headline",
    "hometeam",
    "keywords",
    "location",
    "maindate",
    "mainentityofpage",
    "match",
    "name",
    "opponent",
    "platform",
    "published",
    "redside",
    "scheduledtime",
    "starttime",
    "startdate",
    "summary",
    "text",
    "time",
    "title",
    "url",
    "venue",
    "vicedate",
}


def _base_result(url: str) -> dict:
    return {
        "url": url,
        "domain": urlparse(url).netloc,
        "title": "",
        "text": "",
        "fetch_status": "pending",
        "error": None,
        "fetched_at": None,
        "text_length": 0,
        "source_type": "url",
    }


def _clean_text(text: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    cleaned = "\n".join(lines)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _response_text(resp: requests.Response) -> str:
    content_type = resp.headers.get("content-type", "")
    encoding = resp.encoding
    charset_match = re.search(r"charset=([\w.-]+)", content_type, re.I)
    if charset_match:
        encoding = charset_match.group(1)

    head = resp.content[:4096]
    if not encoding or encoding.lower() == "iso-8859-1":
        meta_match = re.search(rb"<meta[^>]+charset=[\"']?\s*([\w.-]+)", head, re.I)
        if meta_match:
            encoding = meta_match.group(1).decode("ascii", errors="ignore")

    if not encoding or encoding.lower() == "iso-8859-1":
        encoding = resp.apparent_encoding or "utf-8"

    try:
        return resp.content.decode(encoding, errors="replace")
    except Exception:
        return resp.text


def _looks_like_blocked_or_empty(text: str) -> str | None:
    lowered = text.lower()
    for marker in BAD_CONTENT_MARKERS:
        if marker in lowered:
            return f"页面可能被反爬或需要浏览器渲染：{marker}"
    if len(text) < MIN_CONTENT_LEN:
        return f"正文内容过短，仅 {len(text)} 字符，可能没有抓到有效正文"
    return None


def _finish_text_result(result: dict, text: str, max_chars: int) -> dict:
    text = _clean_text(text)
    result["text_length"] = len(text)
    quality_error = _looks_like_blocked_or_empty(text)
    if quality_error:
        result["text"] = text[:1000]
        result["fetch_status"] = "failed"
        result["error"] = quality_error
        return result

    if len(text) > max_chars:
        original_len = len(text)
        text = text[:max_chars] + f"\n\n...(已截断，原文共 {original_len} 字符)"

    result["text"] = text
    result["text_length"] = len(text)
    result["fetch_status"] = "succeeded"
    return result


def _scalar_to_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, (str, int, float, bool)):
        text = str(value).strip()
        return text if len(text) <= 500 else text[:500] + "..."
    return ""


def _is_relevant_key(key: str) -> bool:
    normalized = re.sub(r"[^a-z0-9@]", "", key.lower())
    return normalized in STRUCTURED_KEYS


def _json_to_lines(data, max_lines: int = 500) -> list[str]:
    lines: list[str] = []

    def walk(value, path: str = "", depth: int = 0):
        if len(lines) >= max_lines or depth > 8:
            return
        if isinstance(value, dict):
            relevant_pairs = []
            for key, item in value.items():
                if _is_relevant_key(str(key)):
                    text = _scalar_to_text(item)
                    if text:
                        relevant_pairs.append(f"{key}: {text}")
            if relevant_pairs:
                lines.append(" | ".join(relevant_pairs))
            for key, item in value.items():
                if isinstance(item, (dict, list)):
                    walk(item, f"{path}.{key}" if path else str(key), depth + 1)
        elif isinstance(value, list):
            for item in value[:80]:
                walk(item, path, depth + 1)

    walk(data)
    return lines


def _safe_json_loads(raw: str):
    raw = raw.strip()
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


def _decode_json_from(raw: str, start: int):
    decoder = json.JSONDecoder()
    for idx in range(start, min(len(raw), start + 300)):
        if raw[idx] in "{[":
            try:
                return decoder.raw_decode(raw[idx:])[0]
            except Exception:
                return None
    return None


def _extract_json_from_script(script_text: str):
    candidates = []
    stripped = script_text.strip()
    direct = _safe_json_loads(stripped)
    if direct is not None:
        candidates.append(direct)

    for marker in STATE_MARKERS:
        pos = script_text.find(marker)
        if pos >= 0:
            parsed = _decode_json_from(script_text, pos + len(marker))
            if parsed is not None:
                candidates.append(parsed)
    return candidates


def _extract_metadata(soup: BeautifulSoup, fallback_title: str) -> tuple[str, list[str]]:
    title_tag = soup.find("title")
    title = title_tag.get_text(strip=True) if title_tag else fallback_title
    lines = []

    for selector in [
        ("meta", {"property": "og:title"}),
        ("meta", {"name": "twitter:title"}),
        ("meta", {"name": "description"}),
        ("meta", {"property": "og:description"}),
        ("meta", {"name": "keywords"}),
        ("meta", {"property": "article:published_time"}),
    ]:
        tag = soup.find(*selector)
        content = tag.get("content", "").strip() if tag else ""
        if content:
            lines.append(content)

    for heading in soup.find_all(["h1", "h2"], limit=12):
        text = heading.get_text(" ", strip=True)
        if text:
            lines.append(text)

    return title, lines


def _extract_tables(soup: BeautifulSoup, max_rows: int = 120) -> list[str]:
    lines = []
    for table_idx, table in enumerate(soup.find_all("table"), start=1):
        lines.append(f"## 表格 {table_idx}")
        for row in table.find_all("tr"):
            cells = [cell.get_text(" ", strip=True) for cell in row.find_all(["th", "td"])]
            cells = [cell for cell in cells if cell]
            if cells:
                lines.append(" | ".join(cells))
            if len(lines) >= max_rows:
                return lines
    return lines


def _extract_structured_html(soup: BeautifulSoup) -> list[str]:
    lines = []
    lines.extend(_extract_tables(soup))

    for script in soup.find_all("script"):
        script_type = (script.get("type") or "").lower()
        script_id = script.get("id") or ""
        script_text = script.string or script.get_text() or ""
        should_try = (
            "json" in script_type
            or script_id in STATE_MARKERS
            or any(marker in script_text for marker in STATE_MARKERS)
        )
        if not should_try:
            continue
        for data in _extract_json_from_script(script_text):
            lines.extend(_json_to_lines(data))
            if sum(len(line) for line in lines) >= MAX_STRUCTURED_CHARS:
                return lines

    return lines


def _same_site_url(base_url: str, raw_url: str) -> str | None:
    if not raw_url or raw_url.startswith(("data:", "mailto:", "tel:")):
        return None
    resolved = urljoin(base_url, raw_url)
    base_host = urlparse(base_url).netloc
    resolved_host = urlparse(resolved).netloc
    if not resolved_host or resolved_host != base_host:
        return None
    return resolved


def _normalize_discovered_url(base_url: str, raw_url: str) -> str | None:
    resolved = _same_site_url(base_url, raw_url)
    if not resolved:
        return None
    resolved, _fragment = urldefrag(resolved)
    parsed = urlparse(resolved)
    if parsed.scheme not in ("http", "https"):
        return None
    path = parsed.path.lower()
    if path.endswith((".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".ico", ".css", ".js", ".woff", ".woff2", ".ttf", ".mp4", ".mp3", ".zip", ".rar")):
        return None
    return resolved


def _keyword_score(*values: str, keywords: list[str]) -> int:
    haystack = "\n".join(value for value in values if value).lower()
    return sum(1 for keyword in keywords if keyword and keyword.lower() in haystack)


def discover_site_urls(start_url: str, keywords: list[str], max_depth: int = 1, max_pages: int = 10) -> list[dict]:
    """Discover same-site pages related to keywords without executing browser JavaScript."""
    normalized_keywords = [keyword.strip() for keyword in keywords if keyword and keyword.strip()]
    max_depth = max(0, min(int(max_depth), 3))
    max_pages = max(1, min(int(max_pages), 50))

    start_url, _fragment = urldefrag(start_url)
    queue = deque([(start_url, 0, "起始页面")])
    seen = {start_url}
    candidates: list[dict] = []

    while queue and len(seen) <= max_pages * 8:
        url, depth, anchor_hint = queue.popleft()
        try:
            resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True)
        except Exception:
            continue
        if resp.status_code != 200:
            continue
        content_type = resp.headers.get("content-type", "").lower()
        if "text/html" not in content_type and "application/xhtml" not in content_type and content_type:
            continue

        soup = BeautifulSoup(_response_text(resp)[:MAX_DISCOVERY_HTML_CHARS], "html.parser")
        title_tag = soup.find("title")
        title = title_tag.get_text(" ", strip=True) if title_tag else resp.url
        body_text = soup.get_text(" ", strip=True)[:20000]
        page_score = _keyword_score(title, anchor_hint, url, body_text, keywords=normalized_keywords)
        if not normalized_keywords or page_score > 0 or depth == 0:
            candidates.append({
                "url": resp.url,
                "title": title,
                "depth": depth,
                "score": page_score,
                "matched_hint": anchor_hint,
            })

        if depth >= max_depth:
            continue

        links = []
        for link in soup.find_all("a", href=True):
            href = link.get("href") or ""
            next_url = _normalize_discovered_url(resp.url, href)
            if not next_url or next_url in seen:
                continue
            anchor_text = link.get_text(" ", strip=True)
            link_score = _keyword_score(anchor_text, next_url, keywords=normalized_keywords)
            if normalized_keywords and depth > 0 and link_score == 0:
                continue
            links.append((link_score, next_url, anchor_text or next_url))

        links.sort(key=lambda item: item[0], reverse=True)
        for _score, next_url, anchor_text in links[: max_pages * 2]:
            if next_url in seen:
                continue
            seen.add(next_url)
            queue.append((next_url, depth + 1, anchor_text))

        if len(candidates) >= max_pages:
            break

    deduped = []
    added = set()
    for item in sorted(candidates, key=lambda row: (row["score"], -row["depth"]), reverse=True):
        if item["url"] in added:
            continue
        added.add(item["url"])
        deduped.append(item)
        if len(deduped) >= max_pages:
            break
    return deduped


def _extract_ajax_endpoints(script_text: str, page_url: str) -> list[str]:
    endpoints = []
    patterns = [
        r"url\s*:\s*(?:[A-Za-z0-9_$]+\s*\+\s*)?[\"']([^\"']+)[\"']",
        r"[\"']([^\"']+\.(?:ashx|json|xml|rss|atom)(?:\?[^\"']*)?)[\"']",
        r"[\"'](/[^\"']*(?:api|Api|handler|Handler)[^\"']*)[\"']",
    ]
    for pattern in patterns:
        for match in re.findall(pattern, script_text):
            url = _same_site_url(page_url, match)
            if url and url not in endpoints:
                endpoints.append(url)
    return endpoints[:8]


def _extract_method_candidates(script_text: str) -> list[str]:
    methods = []
    for pattern in [r"Data\.([A-Za-z0-9_]+)\s*\(", r"Data\([\"']([A-Za-z0-9_]+)[\"']"]:
        for method in re.findall(pattern, script_text):
            if method not in methods:
                methods.append(method)
    return methods[:20]


def _prioritize_methods(methods: list[str], page_url: str) -> list[str]:
    page_hint = urlparse(page_url).path.lower()
    priority = []
    rest = []
    for method in methods:
        if method.lower() in page_hint:
            priority.append(method)
        else:
            rest.append(method)
    return priority + rest


def _fetch_json_endpoint(url: str, method: str | None = None):
    try:
        if method:
            resp = requests.post(url, headers=HEADERS, data={"method": method}, timeout=TIMEOUT)
        else:
            resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        if resp.status_code != 200:
            return None
        content_type = resp.headers.get("content-type", "").lower()
        if "json" not in content_type and not resp.text.strip().startswith(("{", "[")):
            return None
        return resp.json()
    except Exception:
        return None


def _extract_linked_script_data(page_url: str, soup: BeautifulSoup) -> list[str]:
    script_urls = []
    inline_scripts = []
    for script in soup.find_all("script"):
        src = script.get("src")
        if src:
            url = _same_site_url(page_url, src)
            if url and url not in script_urls:
                script_urls.append(url)
        else:
            text = script.string or script.get_text() or ""
            if text:
                inline_scripts.append(text)

    script_texts = inline_scripts
    for script_url in script_urls[:MAX_SCRIPT_FETCHES]:
        try:
            resp = requests.get(script_url, headers=HEADERS, timeout=TIMEOUT)
            if resp.status_code == 200:
                script_texts.append(_response_text(resp)[:300000])
        except Exception:
            continue

    endpoints = []
    methods = []
    for script_text in script_texts:
        for endpoint in _extract_ajax_endpoints(script_text, page_url):
            if endpoint not in endpoints:
                endpoints.append(endpoint)
        for method in _extract_method_candidates(script_text):
            if method not in methods:
                methods.append(method)
    methods = _prioritize_methods(methods, page_url)

    lines = []
    for endpoint in endpoints[:4]:
        if methods:
            for method in methods[:8]:
                data = _fetch_json_endpoint(endpoint, method)
                if data is None:
                    continue
                extracted = _json_to_lines(data)
                if extracted:
                    lines.append(f"## 接口 {endpoint} method={method}")
                    lines.extend(extracted)
                    break
        else:
            data = _fetch_json_endpoint(endpoint)
            if data is None:
                continue
            extracted = _json_to_lines(data)
            if extracted:
                lines.append(f"## 接口 {endpoint}")
                lines.extend(extracted)

        if sum(len(line) for line in lines) >= MAX_STRUCTURED_CHARS:
            break
    return lines


def _extract_pdf(resp: requests.Response, result: dict) -> dict:
    content = resp.content
    if len(content) > MAX_DOWNLOAD_BYTES:
        result["fetch_status"] = "failed"
        result["error"] = f"PDF 文件过大，超过 {MAX_DOWNLOAD_BYTES // 1024 // 1024}MB 限制"
        return result

    reader = PdfReader(BytesIO(content))
    meta_title = ""
    try:
        meta_title = (reader.metadata.title or "").strip() if reader.metadata else ""
    except Exception:
        meta_title = ""
    result["title"] = meta_title or urlparse(resp.url).path.rsplit("/", 1)[-1] or resp.url
    result["source_type"] = "pdf"

    pages = []
    for idx, page in enumerate(reader.pages):
        try:
            pages.append(f"## Page {idx + 1}\n{page.extract_text() or ''}")
        except Exception:
            continue
        if sum(len(p) for p in pages) >= MAX_PDF_CHARS:
            break

    text = "\n\n".join(pages)
    if not text.strip():
        result["fetch_status"] = "failed"
        result["error"] = "PDF 未提取到可用文本，可能是扫描版或加密文档。"
        return result
    return _finish_text_result(result, text, MAX_PDF_CHARS)


def _extract_json_response(resp: requests.Response, result: dict) -> dict:
    data = resp.json()
    result["title"] = urlparse(resp.url).path.rsplit("/", 1)[-1] or resp.url
    result["source_type"] = "json"
    lines = _json_to_lines(data)
    if not lines:
        pretty = json.dumps(data, ensure_ascii=False, indent=2)
        lines = [pretty[:MAX_STRUCTURED_CHARS]]
    return _finish_text_result(result, "\n".join(lines), MAX_STRUCTURED_CHARS)


def _extract_xml(resp: requests.Response, result: dict) -> dict:
    soup = BeautifulSoup(resp.content, "xml")
    title = soup.find("title")
    result["title"] = title.get_text(strip=True) if title else resp.url
    result["source_type"] = "rss"

    lines = []
    for item in soup.find_all(["item", "entry"])[:80]:
        parts = []
        for tag_name in ["title", "published", "pubDate", "updated", "link", "summary", "description", "content"]:
            tag = item.find(tag_name)
            if not tag:
                continue
            if tag_name == "link":
                value = tag.get("href") or tag.get_text(" ", strip=True)
            else:
                value = tag.get_text(" ", strip=True)
            if value:
                parts.append(f"{tag_name}: {value}")
        if parts:
            lines.append(" | ".join(parts))

    if not lines:
        lines.append(soup.get_text("\n", strip=True))
    return _finish_text_result(result, "\n".join(lines), MAX_STRUCTURED_CHARS)


def _extract_plain_text(resp: requests.Response, result: dict) -> dict:
    result["title"] = urlparse(resp.url).path.rsplit("/", 1)[-1] or resp.url
    result["source_type"] = "text"
    return _finish_text_result(result, _response_text(resp), MAX_STRUCTURED_CHARS)


def _extract_csv(resp: requests.Response, result: dict) -> dict:
    result["title"] = urlparse(resp.url).path.rsplit("/", 1)[-1] or resp.url
    result["source_type"] = "csv"
    rows = []
    reader = csv.reader(StringIO(_response_text(resp)))
    for idx, row in enumerate(reader):
        rows.append(" | ".join(cell.strip() for cell in row if cell.strip()))
        if idx >= 200:
            break
    return _finish_text_result(result, "\n".join(rows), MAX_STRUCTURED_CHARS)


def _extract_html(resp: requests.Response, result: dict) -> dict:
    html = _response_text(resp)[:800000]
    soup = BeautifulSoup(html, "html.parser")

    title, meta_lines = _extract_metadata(soup, resp.url)
    result["title"] = title
    result["source_type"] = "url"

    structured_lines = _extract_structured_html(soup)
    linked_data_lines = _extract_linked_script_data(resp.url, soup)

    for tag in soup.find_all(["script", "style", "nav", "footer", "header", "aside", "noscript", "svg"]):
        tag.decompose()

    main = (
        soup.find("article")
        or soup.find("main")
        or soup.find(attrs={"role": "main"})
        or soup.find("body")
        or soup
    )
    visible_text = main.get_text(separator="\n", strip=True)

    sections = []
    if meta_lines:
        sections.append("## 页面元信息\n" + "\n".join(dict.fromkeys(meta_lines)))
    if visible_text:
        sections.append("## 页面正文\n" + visible_text)
    if structured_lines:
        sections.append("## 页面结构化数据\n" + "\n".join(dict.fromkeys(structured_lines)))
    if linked_data_lines:
        sections.append("## 页面接口数据\n" + "\n".join(dict.fromkeys(linked_data_lines)))

    text = "\n\n".join(sections)
    if len(_clean_text(text)) < MIN_CONTENT_LEN and (structured_lines or linked_data_lines):
        text = "\n".join(structured_lines + linked_data_lines)
    return _finish_text_result(result, text, MAX_HTML_CHARS)


def fetch_url(url: str) -> dict:
    result = _base_result(url)
    start = time.time()
    try:
        resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True)
        result["url"] = resp.url
        result["domain"] = urlparse(resp.url).netloc
        result["fetched_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(start))
        if resp.status_code != 200:
            result["fetch_status"] = "failed"
            result["error"] = f"HTTP {resp.status_code}"
            return result

        content_type = resp.headers.get("content-type", "").lower()
        path = urlparse(resp.url).path.lower()
        if "application/pdf" in content_type or path.endswith(".pdf") or "/pdf/" in path:
            return _extract_pdf(resp, result)

        if "json" in content_type or path.endswith(".json"):
            return _extract_json_response(resp, result)

        if "csv" in content_type or path.endswith(".csv"):
            return _extract_csv(resp, result)

        if "xml" in content_type or path.endswith((".xml", ".rss", ".atom")):
            return _extract_xml(resp, result)

        if "text/plain" in content_type or path.endswith((".txt", ".md")):
            return _extract_plain_text(resp, result)

        if "text/html" in content_type or "application/xhtml" in content_type or not content_type:
            return _extract_html(resp, result)

        result["fetch_status"] = "failed"
        result["error"] = f"暂不支持的内容类型：{content_type.split(';')[0]}"
        return result
    except requests.exceptions.Timeout:
        result["fetch_status"] = "failed"
        result["error"] = "抓取超时"
    except requests.exceptions.ConnectionError:
        result["fetch_status"] = "failed"
        result["error"] = "无法连接到服务器"
    except Exception as e:
        result["fetch_status"] = "failed"
        result["error"] = str(e)[:300]

    return result
