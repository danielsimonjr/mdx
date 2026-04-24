#!/usr/bin/env python3
"""Fetch open-access arXiv papers and attempt conversion to MDZ.

Per ROADMAP Phase 4.3: "Convert 100 open-access arXiv papers to MDZ as a
benchmark corpus." This script is the first step — automated fetching,
normalization, and conversion so we can measure:

  - Which papers convert cleanly (pandoc → MDZ via mdz-filter.lua).
  - Which fail (and in what way — missing bibliography, exotic LaTeX
    macros, inline raw HTML, etc.).
  - The distribution of archive sizes, cell counts, citation counts.
  - The fraction that validate against the scientific-paper-v1 profile.

Usage:
    python tools/corpus-fetcher/fetch_arxiv.py --count 10 --category cs.LG
    python tools/corpus-fetcher/fetch_arxiv.py --list sample-ids.txt

Ethics:
    - Respects arXiv's rate limit: 1 request / 3 seconds, no concurrent
      fetches. (arXiv API TOS, https://arxiv.org/help/api/user-manual.)
    - Only fetches papers with explicitly permissive licenses (CC-BY-*,
      CC0, arXiv-perpetual — checks the license field before downloading
      the source tarball).
    - Caches downloads under a user-specified --cache-dir so reruns don't
      re-hit arXiv.
    - Does NOT publish converted papers anywhere; the output directory is
      a local benchmark corpus only.

Dependencies:
    - pandoc (3.0+) on PATH
    - Python 3.12+ (required for `tarfile.extractall(..., filter="data")`)
    - urllib.request (stdlib)

Status:
    Alpha. Phase 4.3 goal is 100 papers; this script handles the fetch +
    attempt-conversion loop. Success criteria (what "converts cleanly"
    means in a measurable sense) are defined in the report-summary block
    below.
"""

from __future__ import annotations

import argparse
import io
import json
import shutil
import subprocess
import sys
import tarfile
import time
import uuid
import zipfile
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET

REPO_ROOT = Path(__file__).resolve().parents[2]

if sys.platform == "win32" and hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# arXiv API endpoint + rate-limit policy.
ARXIV_API = "http://export.arxiv.org/api/query"
MIN_INTERVAL_SECONDS = 3  # TOS: "make no more than one request every three seconds"

# Licenses arXiv flags as "permissive enough for downstream redistribution".
# Conservative list; add to it only after verifying the license text.
PERMISSIVE_LICENSES = {
    "http://arxiv.org/licenses/nonexclusive-distrib/1.0/",
    "http://creativecommons.org/licenses/by/4.0/",
    "http://creativecommons.org/licenses/by-sa/4.0/",
    "http://creativecommons.org/licenses/by-nc-sa/4.0/",  # non-commercial OK for local corpus
    "http://creativecommons.org/publicdomain/zero/1.0/",
}


@dataclass
class PaperMeta:
    """Metadata extracted from the arXiv API response for a single paper."""

    arxiv_id: str
    title: str
    abstract: str
    authors: list[str]
    published: str
    updated: str
    categories: list[str]
    license: str
    pdf_url: str
    source_url: str  # arXiv tarball (LaTeX source)


@dataclass
class ConversionResult:
    """Outcome of attempting to convert one arXiv paper to MDZ."""

    arxiv_id: str
    title: str
    succeeded: bool
    mdz_size_bytes: int = 0
    cell_count: int = 0
    citation_count: int = 0
    error_category: str = ""
    error_detail: str = ""
    fidelity_warnings: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# arXiv API interaction (rate-limited)
# ---------------------------------------------------------------------------

_last_request_at: float = 0.0


def _rate_limited_get(url: str) -> bytes:
    """HTTP GET with arXiv's TOS-compliant 3-second interval.

    Returns response bytes. Raises on non-200. Enforced here so callers
    don't have to remember the sleep — the script will unconditionally
    respect the interval even across different endpoints.
    """
    global _last_request_at
    elapsed = time.time() - _last_request_at
    if elapsed < MIN_INTERVAL_SECONDS:
        time.sleep(MIN_INTERVAL_SECONDS - elapsed)
    req = Request(
        url,
        headers={"User-Agent": "mdz-corpus-fetcher/0.1 (https://github.com/danielsimonjr/mdx)"},
    )
    with urlopen(req) as resp:
        _last_request_at = time.time()
        return resp.read()


def search_papers(category: str, count: int) -> list[PaperMeta]:
    """Query the arXiv API for `count` recent open-access papers in `category`.

    Returns a list of PaperMeta. Papers with non-permissive licenses are
    dropped from the result (not included in the count); caller may need
    to search with a higher count to get the target number.
    """
    q = urlencode({
        "search_query": f"cat:{category}",
        "sortBy": "submittedDate",
        "sortOrder": "descending",
        "start": 0,
        "max_results": count * 2,  # over-fetch; license filter drops some
    })
    url = f"{ARXIV_API}?{q}"
    print(f"  GET {url}")
    xml_bytes = _rate_limited_get(url)

    ns = {"atom": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}
    root = ET.fromstring(xml_bytes)

    def _text(el: ET.Element | None, path: str) -> str:
        if el is None:
            return ""
        node = el.find(path, ns)
        return (node.text or "").strip() if node is not None else ""

    papers: list[PaperMeta] = []
    for entry in root.findall("atom:entry", ns):
        license_el = entry.find("atom:rights", ns) or entry.find("arxiv:license", ns)
        license_url = (license_el.text or "").strip() if license_el is not None else ""
        # Reject both missing licenses and non-permissive ones. A missing
        # license on arXiv means "all rights reserved" — not a safe default.
        if license_url not in PERMISSIVE_LICENSES:
            continue
        arxiv_id_raw = _text(entry, "atom:id")
        if not arxiv_id_raw:
            # Malformed feed entry (outage-response, etc.) — skip rather than
            # crash the whole batch.
            continue
        arxiv_id = arxiv_id_raw.rsplit("/", 1)[-1]
        title = _text(entry, "atom:title")
        summary = _text(entry, "atom:summary")
        authors = [
            (a.find("atom:name", ns).text or "").strip()
            for a in entry.findall("atom:author", ns)
            if a.find("atom:name", ns) is not None
        ]
        published = _text(entry, "atom:published")
        updated = _text(entry, "atom:updated")
        categories = [
            c.attrib.get("term", "") for c in entry.findall("atom:category", ns)
        ]
        pdf_url = next(
            (link.attrib.get("href", "")
             for link in entry.findall("atom:link", ns)
             if link.attrib.get("title") == "pdf"),
            "",
        )
        # arXiv source tarball is at arxiv.org/e-print/{id}
        source_url = f"http://arxiv.org/e-print/{arxiv_id}"

        papers.append(
            PaperMeta(
                arxiv_id=arxiv_id,
                title=title,
                abstract=summary,
                authors=authors,
                published=published,
                updated=updated,
                categories=categories,
                license=license_url,
                pdf_url=pdf_url,
                source_url=source_url,
            )
        )
        if len(papers) >= count:
            break

    return papers


def download_source_tarball(meta: PaperMeta, cache_dir: Path) -> Path | None:
    """Download the arXiv source tarball; returns local path or None on error."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    out_path = cache_dir / f"{meta.arxiv_id}.tar.gz"
    if out_path.exists() and out_path.stat().st_size > 0:
        return out_path
    try:
        bytes_ = _rate_limited_get(meta.source_url)
    except Exception as e:
        print(f"    [SKIP] {meta.arxiv_id}: download failed — {e}")
        return None
    out_path.write_bytes(bytes_)
    return out_path


# ---------------------------------------------------------------------------
# Conversion via pandoc + mdz-filter.lua
# ---------------------------------------------------------------------------


def convert_paper(meta: PaperMeta, tarball: Path, out_dir: Path) -> ConversionResult:
    """Attempt to convert one arXiv source to MDZ.

    Returns ConversionResult with categorized error info on failure —
    the benchmark cares about WHY conversion fails, not just that it did.
    """
    result = ConversionResult(arxiv_id=meta.arxiv_id, title=meta.title, succeeded=False)

    # Extract source tarball.
    work_dir = out_dir / meta.arxiv_id
    work_dir.mkdir(parents=True, exist_ok=True)

    # Fast-path: some arXiv /e-print URLs return a PDF (withdrawn LaTeX
    # source). tarfile.open raises a cryptic ReadError in that case, so
    # sniff the magic bytes first.
    try:
        with open(tarball, "rb") as f:
            head = f.read(4)
    except OSError as e:
        result.error_category = "tarball-read"
        result.error_detail = str(e)
        return result
    if head == b"%PDF":
        result.error_category = "source-is-pdf"
        result.error_detail = "arXiv /e-print returned a PDF (no LaTeX source)"
        return result

    # Python 3.12's `filter="data"` enforces the safe-extraction policy
    # (reject absolute paths, .. segments, device files, symlinks escaping
    # the destination, etc.) at extract time. See: PEP 706 / CVE-2007-4559.
    unsafe_tar_errs = (
        tarfile.FilterError, tarfile.AbsolutePathError,
        tarfile.OutsideDestinationError, tarfile.SpecialFileError,
        tarfile.LinkOutsideDestinationError,
    )
    try:
        with tarfile.open(tarball, "r:*") as tf:
            tf.extractall(work_dir, filter="data")
    except unsafe_tar_errs as e:
        result.error_category = "unsafe-tarball"
        result.error_detail = str(e)
        return result
    except Exception as e:  # noqa: BLE001 — covers ReadError + unexpected extract failures
        result.error_category = "tarball-extract"
        result.error_detail = f"{type(e).__name__}: {e}"
        return result

    # Find the main .tex file. Heuristic: the one with `\documentclass` and
    # (if multiple) the shortest path (usually the root, not a subfile).
    tex_files = list(work_dir.rglob("*.tex"))
    mains = [f for f in tex_files if b"\\documentclass" in f.read_bytes()[:4000]]
    if not mains:
        result.error_category = "no-main-tex"
        result.error_detail = f"no .tex file with \\documentclass found in {len(tex_files)} files"
        return result
    main_tex = min(mains, key=lambda p: (len(p.parts), len(p.name)))

    # Convert via pandoc → markdown.
    md_path = work_dir / "document.md"
    filter_path = REPO_ROOT / "integrations" / "pandoc" / "mdz-filter.lua"
    try:
        proc = subprocess.run(
            [
                "pandoc",
                str(main_tex),
                "-o",
                str(md_path),
                "--wrap=none",
                "--from=latex+raw_tex",
                "--to=markdown+attributes",
                f"--lua-filter={filter_path}",
            ],
            capture_output=True,
            timeout=120,
            encoding="utf-8",
            errors="replace",
        )
        if proc.returncode != 0:
            result.error_category = "pandoc-failed"
            # Categorize common failure modes for trend analysis.
            stderr = (proc.stderr or "")[:500]
            if "bibliography" in stderr.lower():
                result.error_category = "pandoc-bibliography"
            elif "unknown" in stderr.lower() and "macro" in stderr.lower():
                result.error_category = "pandoc-unknown-macro"
            elif "file not found" in stderr.lower():
                result.error_category = "pandoc-missing-include"
            result.error_detail = stderr
            return result
    except subprocess.TimeoutExpired:
        result.error_category = "pandoc-timeout"
        return result
    except FileNotFoundError:
        result.error_category = "pandoc-not-installed"
        result.error_detail = "pandoc not on PATH — install from pandoc.org"
        return result

    # Count cells + citations as a rough complexity / fidelity indicator.
    md_text = md_path.read_text(encoding="utf-8", errors="replace")
    result.cell_count = md_text.count("::cell{")
    result.citation_count = md_text.count("::cite[")

    # Package into MDZ directly via zipfile. The `mdz create` CLI is
    # currently interactive and unsuitable for batch; a non-interactive
    # `mdz create --from-markdown <path>` is a Phase 2 follow-up.
    mdz_path = work_dir / f"{meta.arxiv_id}.mdz"
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    manifest = {
        "mdx_version": "2.0.0",
        "document": {
            "id": str(uuid.uuid4()),
            "title": meta.title,
            "created": now,
            "modified": now,
            "language": "en-US",
            "authors": [{"name": a} for a in meta.authors],
            "keywords": meta.categories,
            "license": meta.license or "arxiv-perpetual",
        },
        "content": {
            "entry_point": "document.md",
            "encoding": "UTF-8",
            "markdown_variant": "CommonMark",
            "extensions": ["tables", "attributes", "cite", "cross-reference"],
        },
        "custom": {
            "import_source": {
                "kind": "arxiv",
                "arxiv_id": meta.arxiv_id,
                "source_url": meta.source_url,
                "converted_at": now,
                "tool": "mdz-corpus-fetcher/0.1",
            },
        },
    }
    try:
        with zipfile.ZipFile(mdz_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False))
            zf.writestr("document.md", md_text)
    except OSError as e:
        result.error_category = "mdz-packaging"
        result.error_detail = str(e)
        return result
    result.mdz_size_bytes = mdz_path.stat().st_size
    result.succeeded = True
    return result


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------


def write_report(results: list[ConversionResult], out_path: Path) -> None:
    """Write a JSON report + a Markdown summary."""
    out_path.write_text(
        json.dumps([asdict(r) for r in results], indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    # Summary stats — Markdown so humans can read it at a glance.
    succeeded = [r for r in results if r.succeeded]
    failed = [r for r in results if not r.succeeded]
    by_error: dict[str, int] = {}
    for r in failed:
        by_error[r.error_category] = by_error.get(r.error_category, 0) + 1

    total = max(len(results), 1)
    lines = [
        "# arXiv corpus conversion summary",
        "",
        f"- Papers attempted: **{len(results)}**",
        f"- Succeeded: **{len(succeeded)}** ({len(succeeded) * 100 // total}%)",
        f"- Failed: **{len(failed)}**",
        "",
        "## Failure breakdown",
        "",
    ]
    lines += [f"- `{cat}`: {n}" for cat, n in sorted(by_error.items(), key=lambda kv: -kv[1])]
    if succeeded:
        n = len(succeeded)
        avg_size_kb = sum(r.mdz_size_bytes for r in succeeded) // n // 1024
        avg_cells = sum(r.cell_count for r in succeeded) / n
        avg_cites = sum(r.citation_count for r in succeeded) / n
        lines += [
            "",
            "## Successful conversions — distribution",
            "",
            f"- Average MDZ size: {avg_size_kb} KB",
            f"- Average `::cell` count: {avg_cells:.1f}",
            f"- Average `::cite` count: {avg_cites:.1f}",
        ]
    out_path.with_suffix(".md").write_text("\n".join(lines), encoding="utf-8")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--count", type=int, default=10, help="Number of papers to fetch")
    ap.add_argument(
        "--category",
        default="cs.LG",
        help="arXiv category (e.g., cs.LG, stat.ML, physics.flu-dyn)",
    )
    ap.add_argument(
        "--cache-dir",
        type=Path,
        default=Path.home() / ".cache" / "mdz-corpus" / "raw",
        help="Local cache directory for downloaded tarballs",
    )
    ap.add_argument(
        "--out-dir",
        type=Path,
        default=Path.home() / ".cache" / "mdz-corpus" / "converted",
        help="Output directory for converted MDZ archives",
    )
    ap.add_argument(
        "--report",
        type=Path,
        default=Path.home() / ".cache" / "mdz-corpus" / "report.json",
        help="Path for the conversion-result report",
    )
    args = ap.parse_args()

    # Preflight: pandoc must be on PATH before we spend arXiv quota.
    if shutil.which("pandoc") is None:
        print(
            "ERROR: pandoc not on PATH. Install from https://pandoc.org/installing.html "
            "and retry.",
            file=sys.stderr,
        )
        return 2

    # Create report directory up-front so a crash mid-loop can still persist
    # whatever partial progress we have.
    args.report.parent.mkdir(parents=True, exist_ok=True)

    print(f"Fetching {args.count} papers from category {args.category}...")
    papers = search_papers(args.category, args.count)
    print(f"Got {len(papers)} papers after license filter.")

    results: list[ConversionResult] = []
    try:
        for i, paper in enumerate(papers, 1):
            print(f"[{i}/{len(papers)}] {paper.arxiv_id} — {paper.title[:60]}")
            tarball = download_source_tarball(paper, args.cache_dir)
            if not tarball:
                results.append(
                    ConversionResult(
                        arxiv_id=paper.arxiv_id,
                        title=paper.title,
                        succeeded=False,
                        error_category="download-failed",
                    )
                )
                continue
            result = convert_paper(paper, tarball, args.out_dir)
            status = "OK" if result.succeeded else f"FAIL ({result.error_category})"
            print(f"    {status}")
            results.append(result)
    finally:
        # Always persist whatever results we have — arXiv rate-limit means a
        # crashed run without this finally block wastes 3s × N of quota.
        write_report(results, args.report)
        print(f"\nReport: {args.report}")
        print(f"Summary: {args.report.with_suffix('.md')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
