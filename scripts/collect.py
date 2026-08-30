#!/usr/bin/env python3
"""Fetch AI news RSS feeds and write a static data file for the site."""

import argparse
import email.utils
import hashlib
import html
import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path


CONTENT_NS = "http://purl.org/rss/1.0/modules/content/"
DC_NS = "http://purl.org/dc/elements/1.1/"
MEDIA_NS = "http://search.yahoo.com/mrss/"
ATOM_NS = "http://www.w3.org/2005/Atom"

USER_AGENT = (
    "Mozilla/5.0 (compatible; DailyAINewsCollector/1.0; "
    "+https://github.com/daily-ai-news)"
)

CATEGORY_KEYWORDS = {
    "research": [
        "research", "paper", "arxiv", "benchmark", "dataset", "study",
        "open source model", "reasoning", "multimodal", "training",
        "alignment", "openai o", "claude ", "gemini ", "llama ", "gpt-",
        "diffusion", "agent", "neural", "model card", "evals",
    ],
    "policy": [
        "regulation", "policy", "law", "lawsuit", "court", "senate",
        "congress", "fcc", "eu", "ban", "safety", "ai act", "executive order",
        "copyright", "ip", "privacy", "governance", "audit",
    ],
    "products": [
        "launch", "releases", "introducing", "announces", "announced",
        "app", "api", "chatgpt", "copilot", "assistant", "update",
        "now available", "new feature", "product", "search", "camera",
    ],
    "industry": [
        "funding", "startup", "raises", "acquisition", "merger", "valuation",
        "company", "partners", "deal", "enterprise", "revenue", "hiring",
        "ceo", "ipo", "invests", "investment",
    ],
    "tools": [
        "open source", "tool", "framework", "sdk", "library", "github",
        "developer", "code", "plugin", "workflow", "automation",
    ],
}


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.images = []

    def handle_data(self, data):
        if data.strip():
            self.parts.append(data)

    def handle_starttag(self, tag, attrs):
        if tag.lower() == "img":
            for key, value in attrs:
                if key.lower() in ("src", "data-src", "data-lazy-src"):
                    self.images.append(value)

    def text(self):
        return re.sub(r"\s+", " ", " ".join(self.parts)).strip()


def local_name(tag):
    return tag.rsplit("}", 1)[-1]


def find_child(node, names):
    for child in node:
        if local_name(child.tag) in names:
            return child
    return None


def find_children(node, names):
    return [child for child in node if local_name(child.tag) in names]


def text_of(node):
    if node is None:
        return ""
    return re.sub(r"\s+", " ", "".join(node.itertext())).strip()


def clean_html(value):
    if not value:
        return ""
    parser = TextExtractor()
    try:
        parser.feed(value)
        return parser.text()
    except Exception:
        return re.sub(r"<[^>]+>", " ", value).strip()


def images_from_html(value, limit=3):
    if not value:
        return []
    parser = TextExtractor()
    try:
        parser.feed(value[:60000])
    except Exception:
        pass
    urls = []
    for src in parser.images:
        src = html.unescape(src.strip())
        if src.startswith(("http://", "https://")) and src not in urls:
            urls.append(src)
    return urls[:limit]


def parse_datetime(value):
    if not value:
        return None
    value = value.strip()
    try:
        return email.utils.parsedate_to_datetime(value)
    except (TypeError, ValueError):
        pass
    iso = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(iso)
    except ValueError:
        pass
    for fmt in (
        "%Y-%m-%d %H:%M:%S %z",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d",
    ):
        try:
            parsed = datetime.strptime(value, fmt)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed
        except ValueError:
            continue
    return None


def entry_link(entry, is_atom):
    if is_atom:
        for child in entry:
            if local_name(child.tag) == "link":
                href = child.attrib.get("href")
                rel = child.attrib.get("rel", "alternate")
                if href and rel == "alternate":
                    return href.strip()
        for child in entry:
            if local_name(child.tag) == "link":
                href = child.attrib.get("href")
                if href:
                    return href.strip()
        return ""
    link = entry.findtext("link")
    return (link or "").strip()


def entry_image(entry):
    def images_in_child(child):
        if child.text and local_name(child.tag) in (
            "content", "encoded", "summary", "description"
        ):
            return images_from_html(child.text)
        return []

    for child in entry:
        tag = local_name(child.tag)
        if tag in ("content", "thumbnail") and child.attrib.get("url"):
            return child.attrib["url"].strip()
    for child in entry:
        urls = images_in_child(child)
        if urls:
            return urls[0]
    enclosure = entry.find("enclosure")
    if enclosure is not None:
        url = (enclosure.attrib.get("url") or "").strip()
        media_type = (enclosure.attrib.get("type") or "").lower()
        if url and (media_type.startswith("image") or not media_type):
            return url
    return ""


def entry_text(entry, is_atom):
    fields = []
    for name in ("title", "description", "summary"):
        node = entry.find(name)
        if node is None and is_atom:
            node = find_child(entry, {name})
        if node is not None:
            fields.append(text_of(node))
    content = entry.find(f"{{{CONTENT_NS}}}encoded")
    if content is None and is_atom:
        content = find_child(entry, {"content"})
    if content is not None:
        fields.append(clean_html(content.text or ""))
    return " ".join(fields).strip()


def normalize_title(title):
    value = re.sub(r"[^a-z0-9]+", " ", title.lower())
    return re.sub(r"\s+", " ", value).strip()


def categorize(title, summary, default_category):
    text = f"{title} {summary}".lower()
    best_category = default_category
    best_score = 0
    for category, keywords in CATEGORY_KEYWORDS.items():
        score = sum(1 for word in keywords if word in text)
        if score > best_score:
            best_category = category
            best_score = score
    return best_category


def parse_feed(source, xml_text):
    root = ET.fromstring(xml_text)
    is_atom = local_name(root.tag) == "feed"
    entries = []
    if is_atom:
        entries = [node for node in root if local_name(node.tag) == "entry"]
    else:
        entries = root.findall(".//item")

    parsed = []
    for entry in entries:
        title = text_of(find_child(entry, {"title"}))
        link = entry_link(entry, is_atom)
        if not title and not link:
            continue
        published = parse_datetime(text_of(find_child(entry, {"pubDate", "published", "updated"})))
        summary_node = find_child(entry, {"summary", "description"})
        summary = clean_html(text_of(summary_node)) if summary_node is not None else ""
        if not summary:
            summary = entry_text(entry, is_atom)[:320]
        category = categorize(title, summary, source.get("default_category", "industry"))
        parsed.append(
            {
                "title": title,
                "url": link,
                "summary": summary[:340],
                "image": entry_image(entry),
                "published": published,
                "category": category,
                "source_id": source["id"],
                "source": source["name"],
                "site": source["site"],
            }
        )
    return parsed


def fetch_feed(source, cache_dir, offline, timeout):
    cache_path = Path(cache_dir) / f"{source['id']}.xml" if cache_dir else None
    if offline and cache_path and cache_path.exists():
        return cache_path.read_text(encoding="utf-8", errors="replace")
    if offline:
        return None
    request = urllib.request.Request(
        source["feed"],
        headers={"User-Agent": USER_AGENT, "Accept": "application/rss+xml, application/xml, text/xml"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read().decode("utf-8", errors="replace")
    except Exception as exc:
        print(f"  warn: {source['name']} fetch failed: {exc}", file=sys.stderr)
        if cache_path and cache_path.exists():
            return cache_path.read_text(encoding="utf-8", errors="replace")
        return None


def make_id(title, url):
    raw = normalize_title(title) or url or ""
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:14]


def write_outputs(data, out_dir):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    json_text = json.dumps(data, ensure_ascii=False, indent=2)
    safe_json = json_text.replace("</", "<\\/")
    (out_dir / "news.json").write_text(json_text + "\n", encoding="utf-8")
    (out_dir / "news.js").write_text(f"window.AI_NEWS = {safe_json};\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Collect AI news from RSS feeds.")
    parser.add_argument("--sources", default=str(Path(__file__).parent / "sources.json"))
    parser.add_argument("--out", default=str(Path(__file__).parent.parent / "data"))
    parser.add_argument("--limit", type=int, default=180)
    parser.add_argument("--max-per-source", type=int, default=80)
    parser.add_argument("--timeout", type=int, default=20)
    parser.add_argument("--cache-dir", default=None, help="Read cached {id}.xml files when available.")
    parser.add_argument("--offline", action="store_true", help="Only use cached feed files.")
    args = parser.parse_args()

    sources = json.loads(Path(args.sources).read_text(encoding="utf-8"))
    all_items = []
    source_meta = []

    for source in sources:
        print(f"collecting: {source['name']}")
        xml_text = fetch_feed(source, args.cache_dir, args.offline, args.timeout)
        if not xml_text:
            print(f"  skip: no feed content", file=sys.stderr)
            continue
        try:
            entries = parse_feed(source, xml_text)
        except ET.ParseError as exc:
            print(f"  skip: malformed feed: {exc}", file=sys.stderr)
            continue
        entries.sort(key=lambda item: item["published"] or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
        entries = entries[: args.max_per_source]
        all_items.extend(entries)
        source_meta.append(
            {
                "id": source["id"],
                "name": source["name"],
                "site": source["site"],
                "feed": source["feed"],
            }
        )
        print(f"  ok: {len(entries)} items")

    deduped = {}
    for item in all_items:
        key = normalize_title(item["title"]) or item["url"]
        existing = deduped.get(key)
        if existing is None:
            deduped[key] = item
        elif not existing.get("image") and item.get("image"):
            deduped[key] = item

    items = list(deduped.values())
    items.sort(key=lambda item: item["published"] or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    items = items[: args.limit]

    for item in items:
        item["id"] = make_id(item["title"], item["url"])
        item["published"] = item["published"].isoformat() if item["published"] else None

    now = datetime.now(timezone.utc)
    data = {
        "generated_at": now.isoformat(),
        "updated_label": now.strftime("%Y-%m-%d %H:%M UTC"),
        "sources": source_meta,
        "items": items,
    }
    write_outputs(data, args.out)
    print(f"\nwrote {len(items)} items to {args.out}")


if __name__ == "__main__":
    main()
