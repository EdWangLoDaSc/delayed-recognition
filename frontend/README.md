# Frontend — Delayed Recognition

Buildless D3 dashboard deliverables, packaged as ES modules so they can be
ported into a Svelte shell later without a toolchain fight.

## Run the demo

```bash
cd project
python3 -m http.server 8000
# open http://localhost:8000/frontend/index.html
```

The demo fetches `../data/papers.json` directly, so the data pipeline must
have been run first (see `../data_pipeline/README.md`).

## Components

### `src/trajectory_chart.js`
`renderTrajectoryChart({ container, papers, contextPapers, onBrush, onSelect, onHover, width, height, spotlight, scoreAccessor })`

- Log-scale citations/year vs. publication year
- Lines colored by corrected recognition-delay score
- Hover/focus a line for a detail panel (title, authors, venue, delay score, peak, sleep)
- Brush the x-axis to inspect a `peak_age` window; `onBrush(filtered)` fires
- Returns `{ node, setSelected(id), reset() }` for external coordination

Draws a ranked spotlight set against an aggregate context band. Swap in a
canvas renderer if the final version needs every per-paper trajectory on screen
at once.

### `src/histogram_panel.js`
`renderHistogramPanel({ container, papers, width, height, bins, clip, onBinClick, activeRange })`

- One facet per field, sharing x-domain for comparability
- Symlog y-axis because delay-score distributions are heavy-tailed
- `clip` (default 34) prevents a few outliers from crushing the bulk of mass
- Hover/focus bars for exact bin counts; click or press Enter/Space to filter

### `src/analysis.js`

Pure helpers for the dashboard data contract:

- recomputes a positive recognition-delay score through the last complete citation year
- preserves raw pipeline fields such as `source_B` for auditability
- defines question-led modes, method cards, filters, search, and field summaries

## Porting into Svelte

Each component takes a plain DOM element and pure data; nothing reaches into
globals beyond `window.d3`. In a Svelte component:

```svelte
<script>
  import { onMount } from "svelte";
  import { renderTrajectoryChart } from "$lib/trajectory_chart.js";
  export let papers;
  let container;
  onMount(() => renderTrajectoryChart({ container, papers }));
</script>
<div bind:this={container}></div>
```
