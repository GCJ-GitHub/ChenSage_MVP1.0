import requests
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Optional

ARXIV_API = "https://export.arxiv.org/api/query"
NAMESPACES = {
    "atom": "http://www.w3.org/2005/Atom",
    "arxiv": "http://arxiv.org/schemas/atom",
}


def build_query(keywords: list[str], categories: list[str], exclude_keywords: list[str]) -> str:
    include_parts = []
    if categories:
        cat_term = "+OR+".join(f"cat:{c}" for c in categories)
        include_parts.append(f"({cat_term})")
    if keywords:
        kw_term = "+AND+".join(f'all:"{k}"' for k in keywords)
        include_parts.append(f"({kw_term})")
    if not include_parts:
        include_parts.append("all:artificial+intelligence")

    query = "+AND+".join(include_parts)
    for keyword in exclude_keywords:
        if keyword:
            query += f'+ANDNOT+all:"{keyword}"'
    if not query:
        return "all:artificial+intelligence"
    return query


def fetch_papers(query: str, max_results: int = 20, start: int = 0) -> list[dict]:
    params = {
        "search_query": query,
        "start": start,
        "max_results": max_results,
        "sortBy": "submittedDate",
        "sortOrder": "descending",
    }
    resp = requests.get(ARXIV_API, params=params, timeout=30)
    if resp.status_code != 200:
        raise RuntimeError(f"arXiv API returned {resp.status_code}")

    root = ET.fromstring(resp.text)
    papers = []
    for entry in root.findall("atom:entry", NAMESPACES):
        paper = _parse_entry(entry)
        if paper:
            papers.append(paper)
    return papers


def _parse_entry(entry) -> Optional[dict]:
    def text(tag: str) -> str:
        el = entry.find(f"atom:{tag}", NAMESPACES)
        return (el.text or "").strip().replace("\n", " ") if el is not None else ""

    def authors() -> list[str]:
        result = []
        for author in entry.findall("atom:author", NAMESPACES):
            name_el = author.find("atom:name", NAMESPACES)
            if name_el is not None and name_el.text:
                result.append(name_el.text.strip())
        return result

    arxiv_id = text("id")
    if not arxiv_id:
        return None
    # 提取 arXiv ID（去掉 http://arxiv.org/abs/ 前缀）
    raw_id = arxiv_id.split("/abs/")[-1] if "/abs/" in arxiv_id else arxiv_id

    categories_el = entry.findall("atom:category", NAMESPACES)
    categories = [c.get("term", "") for c in categories_el if c.get("term")]

    published = text("published")
    updated = text("updated")

    pdf_link = ""
    for link in entry.findall("atom:link", NAMESPACES):
        if link.get("title") == "pdf":
            pdf_link = link.get("href", "")
            break

    return {
        "arxiv_id": raw_id,
        "title": text("title"),
        "authors": authors(),
        "abstract": text("summary"),
        "pdf_url": pdf_link,
        "abs_url": f"https://arxiv.org/abs/{raw_id}",
        "published_at": published,
        "updated_at_arxiv": updated,
        "categories": categories,
    }
