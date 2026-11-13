#!/usr/bin/env python3
"""
Pets & Friends Archive - maintenance helper.

Run this on YOUR computer (it needs Python 3, nothing else). Do not upload the
tools/ folder to Neocities.

    python tools/archive.py new      Create a new publication page and add it to
                                     data/documents.json (asks you questions).
    python tools/archive.py check    Check documents.json against the files on disk.

Optional arguments for "new" (anything you leave out is asked for):
    python tools/archive.py new --title "My Title" --category stories \
        --description "One or two sentences." --tags "cats, sea" --date 2026-11-13
"""

import argparse
import datetime
import html
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "documents.json"
TEMPLATE = ROOT / "tools" / "document-template.html"
DOCS_DIR = ROOT / "documents"


def load():
    return json.loads(DATA.read_text(encoding="utf-8"))


def save(data):
    DATA.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def slugify(text):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return text[:80].strip("-") or "untitled"


def slug_of(path):
    return Path(path).stem.lower()


def ask(prompt, default=""):
    suffix = f" [{default}]" if default else ""
    answer = input(f"{prompt}{suffix}: ").strip()
    return answer or default


def cmd_new(args):
    data = load()
    categories = {c["id"]: c for c in data.get("categories", [])}

    title = args.title or ask("Title")
    if not title:
        sys.exit("A title is required.")

    category = args.category
    while category not in categories:
        if category:
            print(f"Unknown category '{category}'.")
        print("Categories:")
        for cid, cat in categories.items():
            print(f"  {cid:<14} {cat.get('name', cid)}")
        if args.category and not sys.stdin.isatty():
            sys.exit("Add the category to data/documents.json first, or pick an existing one.")
        category = ask("Category id")

    description = args.description if args.description is not None else ask("Description (1-2 sentences)")
    tags_raw = args.tags if args.tags is not None else ask("Tags, separated by commas (optional)")
    tags = [t.strip() for t in tags_raw.split(",") if t.strip()]

    date = args.date or ask("Date (YYYY-MM-DD)", datetime.date.today().isoformat())
    try:
        datetime.date.fromisoformat(date)
    except ValueError:
        sys.exit(f"'{date}' is not a valid date. Use YYYY-MM-DD, e.g. 2026-11-13.")

    # Pick a file name that is not already used.
    used = {slug_of(d.get("file", "")) for d in data.get("documents", [])}
    base = slugify(title)
    slug, n = base, 2
    while slug in used or (DOCS_DIR / f"{slug}.html").exists():
        slug = f"{base}-{n}"
        n += 1

    DOCS_DIR.mkdir(exist_ok=True)
    page = TEMPLATE.read_text(encoding="utf-8").replace("{{TITLE}}", html.escape(title, quote=False))
    (DOCS_DIR / f"{slug}.html").write_text(page, encoding="utf-8")

    entry = {"title": title, "description": description, "category": category,
             "date": date, "file": f"documents/{slug}.html"}
    if tags:
        entry["tags"] = tags
    data.setdefault("documents", []).append(entry)
    save(data)

    print(f"\nCreated documents/{slug}.html and added it to data/documents.json.")
    print("Now open that file, write your text inside the <article>, and upload both files.")


def cmd_check(_args):
    data = load()
    problems, warnings = [], []
    categories = {c.get("id") for c in data.get("categories", [])}
    seen, listed = {}, set()

    for i, d in enumerate(data.get("documents", []), 1):
        label = f"#{i} '{d.get('title', '?')}'"
        for field in ("title", "file", "category", "date"):
            if not d.get(field):
                problems.append(f"{label}: missing '{field}'")
        if d.get("category") and d["category"] not in categories:
            problems.append(f"{label}: category '{d['category']}' is not in the categories list")
        if d.get("date"):
            try:
                datetime.date.fromisoformat(d["date"])
            except ValueError:
                problems.append(f"{label}: date '{d['date']}' is not YYYY-MM-DD")
        if d.get("file"):
            listed.add((ROOT / d["file"]).resolve())
            if not (ROOT / d["file"]).is_file():
                problems.append(f"{label}: file '{d['file']}' does not exist")
            slug = slug_of(d["file"])
            if slug in seen:
                problems.append(f"{label}: file name '{slug}' is also used by {seen[slug]}")
            seen[slug] = label
        if not d.get("description"):
            warnings.append(f"{label}: no description")

    for path in sorted(DOCS_DIR.glob("*.html")):
        if path.resolve() not in listed:
            warnings.append(f"documents/{path.name} is not listed in documents.json")

    for w in warnings:
        print("warning:", w)
    for p in problems:
        print("ERROR:  ", p)
    count = len(data.get("documents", []))
    print(f"\n{count} publications, {len(problems)} errors, {len(warnings)} warnings.")
    sys.exit(1 if problems else 0)


def main():
    parser = argparse.ArgumentParser(description="Pets & Friends Archive helper")
    sub = parser.add_subparsers(dest="command", required=True)

    new = sub.add_parser("new", help="create a new publication")
    new.add_argument("--title")
    new.add_argument("--category")
    new.add_argument("--description")
    new.add_argument("--tags")
    new.add_argument("--date")
    new.set_defaults(func=cmd_new)

    check = sub.add_parser("check", help="validate documents.json")
    check.set_defaults(func=cmd_check)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
