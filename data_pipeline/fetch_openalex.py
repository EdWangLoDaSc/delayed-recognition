"""
OpenAlex Data Pipeline for Delayed Recognition Project
=======================================================
Fetches a stratified sample of papers across CS, Physics, and Biology
(published 1990–2010), retrieves per-year citation counts, computes the
Beauty Coefficient B, and outputs a static JSON dataset for the frontend.

Usage:
    python fetch_openalex.py [--email YOUR_EMAIL] [--per-field 17000] [--output ../data/papers.json]
"""

import argparse
from datetime import datetime
import json
import math
import os
import time
from pathlib import Path

import requests

# ── Configuration ────────────────────────────────────────────────────────────

OPENALEX_API = "https://api.openalex.org"

# Field IDs in OpenAlex (level-1 fields)
FIELDS = {
    "CS": "fields/17",            # Computer Science
    "Physics": "fields/31",       # Physics and Astronomy
    "Biology": "fields/13",       # Biochemistry, Genetics and Molecular Biology
}

# Publication year range (inclusive)
YEAR_START = 1990
YEAR_END = 2010

# Decade bins for stratification
DECADE_BINS = [(1990, 1999), (2000, 2010)]

# Minimum total citations for a paper to be interesting
MIN_CITATIONS = 5

# ── Beauty Coefficient B ─────────────────────────────────────────────────────

def compute_beauty_coefficient(
    pub_year: int,
    counts_by_year: list[dict],
    max_citation_year: int | None = None,
) -> dict | None:
    """
    Compute Van Raan's Beauty Coefficient B.

    Given a paper published in `pub_year` with yearly citation counts,
    B measures the degree to which the paper's citation trajectory deviates
    from a straight line connecting its initial citation rate to its peak.

    B = sum over t in [0, t_m] of  (ct_line_t - c_t) / max(1, ct_line_t)

    where ct_line_t is the linearly interpolated value at year t between
    (0, c_0) and (t_m, c_max).

    Returns a dict with B, awakening_year, sleep_duration, peak_year, peak_citations,
    or None if data is insufficient.
    """
    # Build a year -> citations mapping
    if max_citation_year is None:
        max_citation_year = datetime.now().year - 1

    year_map = {
        entry["year"]: entry["cited_by_count"]
        for entry in counts_by_year
        if entry["year"] <= max_citation_year
    }

    # OpenAlex counts_by_year only goes back ~10-12 years for most papers.
    # We need to reconstruct the full trajectory from pub_year to the latest year.
    min_year = pub_year
    max_year = max(year_map.keys()) if year_map else pub_year
    if max_year - min_year < 5:
        return None  # not enough trajectory

    # Full trajectory (years with no data default to 0)
    trajectory = []
    for y in range(min_year, max_year + 1):
        trajectory.append(year_map.get(y, 0))

    if not trajectory or max(trajectory) == 0:
        return None

    # Find peak
    c_max = max(trajectory)
    t_m = trajectory.index(c_max)  # index from publication year

    if t_m <= 1:
        # Peak is at or near publication — no delayed recognition
        return {
            "B": 0.0,
            "peak_year": min_year + t_m,
            "peak_citations": c_max,
            "sleep_duration": 0,
            "awakening_year": min_year,
        }

    c_0 = trajectory[0]

    # Compute B. Positive values indicate a trajectory below the line until
    # its peak, which matches the delayed-recognition reading in the README.
    B = 0.0
    largest_gap = float("-inf")
    awakening_t = t_m
    for t in range(0, t_m + 1):
        # Linear interpolation between (0, c_0) and (t_m, c_max)
        ct_line = c_0 + (c_max - c_0) * t / t_m
        denominator = max(1.0, ct_line)
        gap = ct_line - trajectory[t]
        B += gap / denominator
        if 0 < t < t_m and gap > largest_gap:
            largest_gap = gap
            awakening_t = t

    # Sleeping beauty: sleep duration = years before awakening
    # Awakening = year of maximum positive gap from the baseline before peak.
    awakening_year = min_year + awakening_t
    sleep_duration = awakening_year - min_year

    return {
        "B": round(B, 4),
        "peak_year": min_year + t_m,
        "peak_citations": int(c_max),
        "sleep_duration": sleep_duration,
        "awakening_year": awakening_year,
    }


# ── OpenAlex API helpers ─────────────────────────────────────────────────────

def build_session(email: str | None) -> requests.Session:
    session = requests.Session()
    session.headers["User-Agent"] = "DelayedRecognitionProject/1.0"
    if email:
        session.params = {"mailto": email}  # type: ignore[assignment]
    return session


def fetch_works_page(
    session: requests.Session,
    field_id: str,
    year_lo: int,
    year_hi: int,
    cursor: str = "*",
    per_page: int = 200,
) -> dict:
    """Fetch one page of works from OpenAlex with cursor pagination."""
    params = {
        "filter": (
            f"primary_topic.field.id:{field_id},"
            f"publication_year:{year_lo}-{year_hi},"
            f"type:article,"
            f"cited_by_count:>{MIN_CITATIONS},"
            f"has_doi:true"
        ),
        "select": (
            "id,doi,display_name,publication_year,cited_by_count,"
            "counts_by_year,authorships,primary_location,primary_topic"
        ),
        "per_page": per_page,
        "cursor": cursor,
        "sort": "cited_by_count:desc",
    }
    resp = session.get(f"{OPENALEX_API}/works", params=params)
    resp.raise_for_status()
    return resp.json()


def fetch_field_sample(
    session: requests.Session,
    field_name: str,
    field_id: str,
    target_per_decade: int,
    cache_dir: Path,
) -> list[dict]:
    """
    Fetch a stratified sample for one field across decade bins.
    Caches raw API responses to avoid re-fetching.
    """
    all_papers = []

    for year_lo, year_hi in DECADE_BINS:
        cache_file = cache_dir / f"{field_name}_{year_lo}_{year_hi}.jsonl"
        papers_this_bin = []

        # Load from cache if exists
        if cache_file.exists():
            print(f"  Loading cached {field_name} {year_lo}-{year_hi} ...")
            with open(cache_file) as f:
                for line in f:
                    papers_this_bin.append(json.loads(line))
            print(f"  Loaded {len(papers_this_bin)} papers from cache")
            all_papers.extend(papers_this_bin)
            continue

        print(f"  Fetching {field_name} {year_lo}-{year_hi} (target: {target_per_decade}) ...")
        cursor = "*"
        fetched = 0

        with open(cache_file, "w") as f:
            while fetched < target_per_decade:
                try:
                    data = fetch_works_page(session, field_id, year_lo, year_hi, cursor=cursor)
                except requests.exceptions.HTTPError as e:
                    print(f"  HTTP error: {e}. Waiting 5s and retrying...")
                    time.sleep(5)
                    continue
                except requests.exceptions.ConnectionError:
                    print("  Connection error. Waiting 10s...")
                    time.sleep(10)
                    continue

                results = data.get("results", [])
                if not results:
                    break

                for work in results:
                    f.write(json.dumps(work) + "\n")
                    papers_this_bin.append(work)
                    fetched += 1
                    if fetched >= target_per_decade:
                        break

                next_cursor = data["meta"].get("next_cursor")
                if not next_cursor:
                    break
                cursor = next_cursor

                # Rate limiting: ~10 req/s is fine for polite pool
                time.sleep(0.15)

                if fetched % 1000 == 0:
                    print(f"    ... {fetched}/{target_per_decade}")

        print(f"  Fetched {len(papers_this_bin)} papers for {field_name} {year_lo}-{year_hi}")
        all_papers.extend(papers_this_bin)

    return all_papers


# ── Transform & Export ───────────────────────────────────────────────────────

def transform_paper(work: dict, max_citation_year: int | None = None) -> dict | None:
    """Transform a raw OpenAlex work into a slim record with Beauty Coefficient."""
    pub_year = work.get("publication_year")
    counts = work.get("counts_by_year", [])

    if not pub_year or not counts:
        return None

    beauty = compute_beauty_coefficient(pub_year, counts, max_citation_year=max_citation_year)
    if beauty is None:
        return None

    # Extract first author
    authorships = work.get("authorships", [])
    first_author = ""
    if authorships:
        first_author = authorships[0].get("author", {}).get("display_name", "")

    # Extract venue
    venue = ""
    primary_loc = work.get("primary_location") or {}
    source = primary_loc.get("source") or {}
    venue = source.get("display_name", "")

    # Extract field from primary_topic
    primary_topic = work.get("primary_topic") or {}
    field_info = primary_topic.get("field") or {}
    field_name = field_info.get("display_name", "")
    topic_name = primary_topic.get("display_name", "")

    return {
        "id": work["id"].replace("https://openalex.org/", ""),
        "doi": work.get("doi", ""),
        "title": work.get("display_name", ""),
        "first_author": first_author,
        "venue": venue,
        "publication_year": pub_year,
        "cited_by_count": work.get("cited_by_count", 0),
        "field": field_name,
        "topic": topic_name,
        "counts_by_year": {e["year"]: e["cited_by_count"] for e in counts},
        **beauty,
    }


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Fetch OpenAlex data for Delayed Recognition project")
    parser.add_argument("--email", type=str, default=None,
                        help="Email for OpenAlex polite pool (faster rate limits)")
    parser.add_argument("--per-field", type=int, default=17000,
                        help="Target papers per field (~50k total across 3 fields)")
    parser.add_argument("--output", type=str, default="../data/papers.json",
                        help="Output JSON file path")
    parser.add_argument("--max-citation-year", type=int, default=datetime.now().year - 1,
                        help="Last complete citation year to include (default: previous calendar year)")
    args = parser.parse_args()

    # Setup
    cache_dir = Path(__file__).parent / "cache"
    cache_dir.mkdir(exist_ok=True)

    output_path = Path(args.output)
    if not output_path.is_absolute():
        output_path = Path(__file__).parent / output_path
    output_path.parent.mkdir(parents=True, exist_ok=True)

    session = build_session(args.email)
    target_per_decade = math.ceil(args.per_field / len(DECADE_BINS))

    # Fetch
    all_raw = []
    for field_name, field_id in FIELDS.items():
        print(f"\n{'='*60}")
        print(f"Field: {field_name} ({field_id})")
        print(f"{'='*60}")
        papers = fetch_field_sample(session, field_name, field_id, target_per_decade, cache_dir)
        all_raw.extend(papers)

    print(f"\nTotal raw papers fetched: {len(all_raw)}")

    # Transform
    print("Computing Beauty Coefficients ...")
    transformed = []
    for work in all_raw:
        record = transform_paper(work, max_citation_year=args.max_citation_year)
        if record:
            transformed.append(record)

    print(f"Papers with valid Beauty Coefficient: {len(transformed)}")

    # Sort by B descending
    transformed.sort(key=lambda x: x["B"], reverse=True)

    # Summary stats
    fields_count = {}
    for p in transformed:
        fields_count[p["field"]] = fields_count.get(p["field"], 0) + 1
    print("\nPapers per field:")
    for f, c in sorted(fields_count.items()):
        print(f"  {f}: {c}")

    b_values = [p["B"] for p in transformed]
    if b_values:
        print(f"\nBeauty Coefficient B stats:")
        print(f"  Mean:   {sum(b_values)/len(b_values):.2f}")
        print(f"  Median: {sorted(b_values)[len(b_values)//2]:.2f}")
        print(f"  Max:    {max(b_values):.2f}")
        print(f"  Min:    {min(b_values):.2f}")

    # Top sleeping beauties
    print(f"\nTop 10 Sleeping Beauties:")
    for p in transformed[:10]:
        print(f"  B={p['B']:.1f} | {p['publication_year']} | {p['title'][:70]}...")

    # Export
    with open(output_path, "w") as f:
        json.dump(transformed, f)
    print(f"\nDataset written to {output_path}")
    print(f"File size: {output_path.stat().st_size / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
