#!/usr/bin/env python3
"""Translate collected AI news titles and summaries from English to Chinese."""

import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path


API_URL = "https://api.mymemory.translated.net/get"
CJK_RE = re.compile(r"[\u3400-\u9fff\uf900-\ufaff]")
MAX_PAYLOAD = 450
SUMMARY_LENGTH = 160


def has_chinese(text):
    return bool(CJK_RE.search(text or ""))


def call_api(text, email, timeout=25):
    params = {"q": text, "langpair": "en|zh-CN"}
    if email:
        params["de"] = email
    url = API_URL + "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"User-Agent": "DailyAINews/1.0"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        data = json.loads(response.read().decode("utf-8"))
    if data.get("responseStatus") != 200 or data.get("quotaFinished"):
        raise RuntimeError(data.get("responseDetails") or "translation quota finished")
    translated = data.get("responseData", {}).get("translatedText", "").strip()
    if not translated:
        raise RuntimeError("empty translation response")
    return translated


def summary_for(item, max_len=SUMMARY_LENGTH):
    return (item.get("summary") or "").strip()[:max_len]


def build_block(item, summary_len=SUMMARY_LENGTH):
    title = (item.get("title") or "").strip()
    summary = summary_for(item, summary_len)
    if has_chinese(title) and has_chinese(summary):
        return ""
    return f"{title}\n{summary}"


def make_batches(items, max_len=MAX_PAYLOAD):
    batches = []
    current = []
    payload = ""
    for item in items:
        block = build_block(item)
        if len(block) > max_len:
            if current:
                batches.append(current)
                current = []
                payload = ""
            batches.append([item])
            continue
        if payload and len(payload) + 2 + len(block) > max_len:
            batches.append(current)
            current = []
            payload = ""
        current.append(item)
        payload = f"{payload}\n\n{block}" if payload else block
    if current:
        batches.append(current)
    return batches


def split_translated(translated, items):
    blocks = translated.split("\n\n")
    if len(blocks) != len(items):
        return None
    results = []
    for block, item in zip(blocks, items):
        lines = [line.strip() for line in block.split("\n") if line.strip()]
        title_zh = lines[0] if lines else (item.get("title") or "")
        summary_zh = " ".join(lines[1:]) if len(lines) > 1 else summary_for(item)
        results.append((title_zh, summary_zh))
    return results


def set_fallback(item):
    if not item.get("title_zh"):
        item["title_zh"] = item.get("title") or ""
    if not item.get("summary_zh"):
        item["summary_zh"] = summary_for(item)
    item["translated"] = False


def translate_items(items, email, sleep=0.15, force=False):
    pending = [item for item in items if force or not item.get("translated")]
    stats = {"ok": 0, "fallback": 0}
    to_translate = []
    for item in pending:
        title = (item.get("title") or "").strip()
        summary = summary_for(item)
        if has_chinese(title) and has_chinese(summary):
            item["title_zh"] = title
            item["summary_zh"] = summary
            item["translated"] = True
            stats["ok"] += 1
        else:
            to_translate.append(item)

    for batch in make_batches(to_translate):
        payload = "\n\n".join(build_block(item) for item in batch)
        try:
            translated = call_api(payload, email)
            pairs = split_translated(translated, batch)
            if pairs is None:
                raise RuntimeError("batch line split mismatch")
            for item, (title_zh, summary_zh) in zip(batch, pairs):
                item["title_zh"] = title_zh
                item["summary_zh"] = summary_zh
                item["translated"] = True
                stats["ok"] += 1
        except Exception as exc:
            print(f"  warn: batch failed ({exc}); translating items individually", file=sys.stderr)
            for item in batch:
                try:
                    block = build_block(item, 120)
                    if not block:
                        item["title_zh"] = item.get("title") or ""
                        item["summary_zh"] = summary_for(item)
                        item["translated"] = True
                        stats["ok"] += 1
                        continue
                    translated = call_api(block, email)
                    pairs = split_translated(translated, [item])
                    if pairs:
                        item["title_zh"], item["summary_zh"] = pairs[0]
                        item["translated"] = True
                        stats["ok"] += 1
                    else:
                        raise RuntimeError("single item split mismatch")
                except Exception as single_exc:
                    set_fallback(item)
                    stats["fallback"] += 1
                    print(f"  warn: {item.get('title', '')[:50]} not translated ({single_exc})", file=sys.stderr)
        time.sleep(sleep)

    return stats


def write_data(data, out_dir):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    json_text = json.dumps(data, ensure_ascii=False, indent=2)
    safe_json = json_text.replace("</", "<\\/")
    (out_dir / "news.json").write_text(json_text + "\n", encoding="utf-8")
    (out_dir / "news.js").write_text(f"window.AI_NEWS = {safe_json};\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Translate AI news data to Chinese.")
    parser.add_argument("--data", default=str(Path(__file__).parent.parent / "data" / "news.json"))
    parser.add_argument("--email", default=os.environ.get("MYMEMORY_EMAIL"))
    parser.add_argument("--sleep", type=float, default=0.15)
    parser.add_argument("--force", action="store_true", help="Retranslate already translated items.")
    args = parser.parse_args()

    data_path = Path(args.data)
    if not data_path.exists():
        print(f"error: {data_path} does not exist", file=sys.stderr)
        sys.exit(1)

    data = json.loads(data_path.read_text(encoding="utf-8"))
    items = data.get("items", [])
    print(f"translating: {len(items)} items")
    stats = translate_items(items, args.email, sleep=args.sleep, force=args.force)

    out_dir = data_path.parent
    write_data(data, out_dir)
    print(
        f"done: {stats['ok']} translated, {stats['fallback']} kept original, "
        f"wrote {out_dir}"
    )


if __name__ == "__main__":
    main()
