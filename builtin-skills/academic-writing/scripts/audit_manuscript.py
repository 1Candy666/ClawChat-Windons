#!/usr/bin/env python3
"""Advisory manuscript text checks; no scientific or layout validation."""
from __future__ import annotations
import argparse
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET
SECTION_NAMES = {
    "abstract": r"abstract",
    "keywords": r"key\s*words?",
    "introduction": r"(?:\d+\.?\s*)?introduction",
    "methods": r"(?:\d+\.?\s*)?(?:materials\s+and\s+methods|methods|methodology)",
    "results": r"(?:\d+\.?\s*)?(?:results|results\s+and\s+analysis)",
    "discussion": r"(?:\d+\.?\s*)?discussion",
    "conclusions": r"(?:\d+\.?\s*)?conclusions?",
}

def read_docx(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        xml = archive.read("word/document.xml")
    root = ET.fromstring(xml)
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paragraphs = []
    for para in root.findall(".//w:p", ns):
        text = "".join(node.text or "" for node in para.findall(".//w:t", ns))
        if text.strip():
            style = para.find("./w:pPr/w:pStyle", ns)
            style_id = style.get(f"{{{ns['w']}}}val", "") if style is not None else ""
            heading = re.fullmatch(r"Heading([1-6])", style_id, flags=re.I)
            prefix = "#" * int(heading.group(1)) + " " if heading else ""
            paragraphs.append(prefix + text.strip())
    return "\n".join(paragraphs)


def read_input(path: Path) -> str:
    if path.suffix.lower() == ".docx":
        return read_docx(path)
    return path.read_text(encoding="utf-8-sig")


def normalized_lines(text: str) -> list[str]:
    return [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]


def is_heading(line: str, pattern: str) -> bool:
    plain = re.sub(r"^#{1,6}\s*", "", line).strip().rstrip(".: ")
    return re.fullmatch(pattern, plain, flags=re.I) is not None


def locate_sections(lines: list[str]) -> dict[str, int]:
    found: dict[str, int] = {}
    for index, line in enumerate(lines):
        for name, pattern in SECTION_NAMES.items():
            if name not in found and is_heading(line, pattern):
                found[name] = index
    return found


def section_text(lines: list[str], sections: dict[str, int], name: str) -> str:
    if name not in sections:
        return ""
    start = sections[name] + 1
    later = [position for position in sections.values() if position > sections[name]]
    end = min(later) if later else len(lines)
    return "\n".join(lines[start:end]).strip()


def word_count(text: str) -> int:
    return len(re.findall(r"\b[A-Za-z0-9]+(?:[’'-][A-Za-z0-9]+)*\b", text))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manuscript", type=Path)
    parser.add_argument("--abstract-max", type=int, default=None)
    args = parser.parse_args()
    if not args.manuscript.is_file() or args.manuscript.suffix.lower() not in {".md", ".txt", ".docx"}:
        parser.error("Provide an existing .md, .txt or .docx file")
    if args.abstract_max is not None and args.abstract_max <= 0:
        parser.error("--abstract-max must be positive")
    try:
        text = read_input(args.manuscript)
    except (OSError, UnicodeError, zipfile.BadZipFile, ET.ParseError, KeyError) as error:
        print(f"Cannot read manuscript: {error}", file=sys.stderr)
        return 2
    lines = normalized_lines(text)
    sections = locate_sections(lines)
    print("Academic manuscript text audit")
    print("English heading detection only; manual review remains necessary.")
    print("Detected headings:", ", ".join(sections) or "none")
    abstract = section_text(lines, sections, "abstract")
    warnings = []
    if abstract:
        count = word_count(abstract)
        print("Abstract words:", count)
        if args.abstract_max is not None and count > args.abstract_max:
            warnings.append(f"Abstract exceeds supplied limit: {count} > {args.abstract_max}")
    else:
        print("Abstract not detected; this is not a format error.")
    for label, pattern in [("Figure", r"\b(?:Fig\.|Figure)\s*(\d+)\b"),
                           ("Table", r"\bTable\s*(\d+)\b")]:
        first = list(dict.fromkeys(int(n) for n in re.findall(pattern, text, flags=re.I)))
        print(f"{label} first mentions: {first}")
        if first and first != list(range(1, max(first) + 1)):
            warnings.append(f"Review {label.lower()} order; excerpts, captions and supplements may explain gaps.")
    pending = re.findall(r"\[(?:DATA NEEDED|CITATION NEEDED)\]", text)
    if pending:
        warnings.append(f"Unresolved evidence markers: {len(pending)}")
    for warning in warnings:
        print("REVIEW:", warning)
    if not warnings:
        print("No issues found by these limited checks; not a submission clearance.")
    return 1 if warnings else 0

if __name__ == "__main__":
    raise SystemExit(main())
