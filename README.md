# Delayed Recognition in Academic Literature

An interactive atlas of **sleeping beauties** — scientific papers that lie
dormant after publication, then suddenly attract a surge of citations. Built
on top of ~51,000 papers drawn from the [OpenAlex](https://openalex.org) API
in computer science, physics & astronomy, and molecular biology (1990–2010).
Each paper is scored by Van Raan's **Beauty Coefficient B**, a measure of
how sharply the paper's reception awakens from dormancy.

> DATA 31500, Spring 2026 · University of Chicago
> Andrew Kaboski · Eli Amar · Hanyang Wang · Tarun Yadav

---

## Quick start

The frontend is a buildless static site. Anyone who clones the repo can run
it in under a minute — no `npm install`, no toolchain.

```bash
git clone https://github.com/EdWangLoDaSc/delayed-recognition.git
cd delayed-recognition
python3 -m http.server 8000
```

Then open **<http://localhost:8000/frontend/index.html>** in a browser.

The page fetches `data/papers.json` (≈34 MB, tracked with Git LFS) directly.
First load takes a few seconds; after that everything is interactive.

> **Why not just open `index.html` in Finder?** Because the page loads JS
> modules and JSON via `fetch`, browsers block `file://` requests. The
> Python one-liner above is the simplest fix. Any static server works
> (e.g. `npx serve`, `php -S localhost:8000`).

### Requirements

- **Python 3** — only used to serve static files. No pip packages needed to
  view the site.
- A modern browser (Chrome, Firefox, Safari, Edge — 2022+).
- If you also want to regenerate the dataset from OpenAlex, you additionally
  need `pip install requests`. See [`data_pipeline/`](data_pipeline/README.md).

---

## What's in the repo

```
.
├── data/
│   └── papers.json            ← 51k papers with B coefficients (committed, ~34 MB)
├── data_pipeline/
│   ├── fetch_openalex.py      ← Python script to fetch + compute B
│   ├── README.md              ← Pipeline documentation
│   └── cache/                 ← Raw API JSONL cache (gitignored)
├── frontend/
│   ├── index.html             ← Question-led dashboard page
│   ├── src/
│   │   ├── analysis.js          ← Question modes, score recomputation, summaries
│   │   ├── trajectory_chart.js  ← D3 context-and-spotlight trajectory chart
│   │   └── histogram_panel.js   ← D3 small-multiples histogram of delay score
│   └── README.md              ← Component API documentation
├── proposal_2page_final (1).pdf
└── README.md                  ← (this file)
```

---

## What you'll see

The atlas is organized as two ruled sections:

1. **Distribution of Recognition Delay.** A small-multiples histogram of
   the corrected recognition-delay score across the three fields. The score
   is recomputed in the browser through the last complete citation year
   because the committed source `B` field was generated with an inverted sign.

2. **Trajectories in Time.** Papers are aligned to their year of
   publication. A grey interquartile band and median line trace the
   ordinary life of the current field/decade context; the spotlight works
   are drawn as labeled lines on top, each with a dot marking the year it
   peaked. Brush the x-axis to inspect peak timing.

Interactive controls in the toolbar:

| Control | Purpose |
|---|---|
| **Analytical question** | Changes the ranking logic from long-sleep awakenings to late-impact or recent-awakening views. |
| **Field** | Restrict to CS, physics, or molecular biology. |
| **Publication decade** | 1990–1999 or 2000–2010. |
| **Min delay D** | Hide papers below a corrected recognition-delay threshold. |
| **Min peak age** | Require the citation peak to occur at least this many years after publication. |
| **Spotlight lines** | Increase or reduce the number of labeled trajectories on screen. |
| **Search** | Search the local corpus by title, author, venue, topic, or field. |
| **Methods** | Show formulas, sampling scope, denominators, and cautions next to the interface. |

---

## Regenerating the dataset (optional)

The committed `data/papers.json` is the reference dataset. To rebuild it
from scratch against current OpenAlex:

```bash
cd data_pipeline
pip install requests
python fetch_openalex.py --email you@example.edu --per-field 17000 --output ../data/papers.json
```

By default the pipeline excludes the current partial citation year. Override
with `--max-citation-year` only when you know the annual counts are complete.

Registering an email opts you into OpenAlex's polite pool (higher rate
limits). A full rebuild takes roughly 10–15 minutes on a good connection.
Raw API responses are cached under `data_pipeline/cache/`, so re-running
only hits the network for missing bins.

See [`data_pipeline/README.md`](data_pipeline/README.md) for the sampling
strategy, B-coefficient formula, and output schema.

---

## Stack

- **Data pipeline:** Python 3 · `requests` · OpenAlex REST API
- **Frontend:** vanilla HTML + ES modules + D3 v7 (via CDN). No build step.
- **Typography:** Fraunces (display), EB Garamond (body), JetBrains Mono
  (data), loaded from Google Fonts.
- **Planned** (Member 3): port components into a Svelte shell for the
  deployed final version. The D3 modules are framework-free and take a
  plain DOM element + data, so the port is a thin wrapper — see
  [`frontend/README.md`](frontend/README.md).

---

## Team roles

| Member | Responsibilities |
|---|---|
| **1** — Data & Backend / Viz | OpenAlex pipeline; Beauty Coefficient implementation; both D3 components; demo page |
| **2** — Visualization & D3 | Design review; integrate components into Svelte tree; Tool Design section |
| **3** — Frontend, Integration & Writing | Svelte application shell; reactive filter sidebar; deploy; Introduction |
| **4** — Analysis & Evaluation | Cross-field comparative analysis; usability evaluation; Findings & Discussion |

---

## References

- Van Raan, A. F. J. (2004). *Sleeping beauties in science.*
  Scientometrics, 59(3), 467–472.
- Ke, Q., Ferrara, E., Radicchi, F., & Flammini, A. (2015). *Defining and
  identifying Sleeping Beauties in science.* PNAS, 112(24), 7426–7431.
- Priem, J., Piwowar, H., & Orr, R. (2022). *OpenAlex: A fully-open index
  of scholarly works, authors, venues, institutions, and concepts.*
  arXiv:2205.01833.
