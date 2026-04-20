# Data Pipeline — Delayed Recognition Project

Fetches a stratified sample of papers from the [OpenAlex](https://openalex.org) API,
computes Van Raan's **Beauty Coefficient B**, and emits a static JSON dataset
consumed by the frontend.

## Quick start

```bash
pip install requests
python fetch_openalex.py --email you@uchicago.edu --per-field 17000 --output ../data/papers.json
```

Raw API responses are cached under `cache/` as JSONL, one line per work.
Re-running the script is safe: cached decade bins are skipped.

## CLI

| Flag | Default | Description |
|---|---|---|
| `--email` | `None` | Registers you into OpenAlex's polite pool (higher rate limits). Recommended. |
| `--per-field` | `17000` | Target paper count per field (split across decade bins). |
| `--output` | `../data/papers.json` | Output JSON path. |

## Sampling strategy

- **Fields** (OpenAlex level-1): Computer Science (`fields/17`), Physics & Astronomy (`fields/31`), Biochemistry / Genetics / Molecular Biology (`fields/13`).
- **Years**: 1990–2010 (pre-1990 coverage is sparse; post-2010 papers lack the 10+ year trajectory required for B).
- **Stratification**: two decade bins `[1990–1999]` and `[2000–2010]`, roughly equal draw per bin per field.
- **Filters**: `type:article`, `has_doi:true`, `cited_by_count:>5`. Sorted by `cited_by_count:desc` so each bin draws the most-cited papers first — tractable scope, and ensures enough citation signal to compute B meaningfully.

Current output: **50,998 papers** across the three fields (≈17k each).

## Beauty Coefficient B

Implemented in `compute_beauty_coefficient()` following Van Raan (2004):

$$B = \sum_{t=0}^{t_m} \frac{c_t^{\mathrm{line}} - c_t}{\max(1, c_t^{\mathrm{line}})}$$

where $t_m$ is the year of peak citations $c_{\max}$, and $c_t^{\mathrm{line}}$ is the linear interpolation between $(0, c_0)$ and $(t_m, c_{\max})$.

Sign convention here: a paper that stays flat then spikes has **positive** B (area above the line, below the trajectory at peak).

Also returned per paper:
- `peak_year`, `peak_citations`
- `awakening_year` — first year the trajectory exceeds the baseline by ≥50% (and is > 2 citations)
- `sleep_duration = awakening_year − publication_year`

Papers with fewer than 5 years of trajectory after publication are dropped.

## Output schema (`papers.json`)

Array of objects:

```json
{
  "id": "W1997084402",
  "doi": "https://doi.org/10.1103/physrevb.81.161104",
  "title": "Van der Waals density functional: An appropriate exchange functional",
  "first_author": "Valentino R. Cooper",
  "venue": "Physical Review B",
  "publication_year": 2010,
  "cited_by_count": 511,
  "field": "Physics and Astronomy",
  "topic": "Advanced Chemical Physics Studies",
  "counts_by_year": { "2012": 32, "2013": 38, "...": "..." },
  "B": 12.8346,
  "peak_year": 2025,
  "peak_citations": 43,
  "sleep_duration": 2,
  "awakening_year": 2012
}
```

Records are sorted by `B` descending, so the head of the file is the candidate sleeping beauties.

## Known limitations

- OpenAlex `counts_by_year` only reports years with at least one citation. Missing years are treated as zero in trajectory reconstruction.
- Van Raan's B is sensitive to peak position. A paper with a late, small peak can score high despite negligible impact — downstream filters on `cited_by_count` or `peak_citations` are advised when interpreting.
- Field boundaries use OpenAlex's primary-topic taxonomy, which is imperfect for interdisciplinary work.

## References

- Van Raan, A. F. J. (2004). *Sleeping beauties in science.* Scientometrics, 59(3), 467–472.
- Ke, Q., Ferrara, E., Radicchi, F., & Flammini, A. (2015). *Defining and identifying Sleeping Beauties in science.* PNAS, 112(24), 7426–7431.
- Priem, J., Piwowar, H., & Orr, R. (2022). *OpenAlex: A fully-open index of scholarly works, authors, venues, institutions, and concepts.* arXiv:2205.01833.
