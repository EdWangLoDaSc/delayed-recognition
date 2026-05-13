# Frontend — Delayed Recognition

Buildless D3 dashboard deliverables, packaged as ES modules so they can be
ported into a Svelte shell later without a toolchain fight. The current page
also includes the Member 3 integration work: a reactive filter dock, linked
view state, first-visit guided tutorial, and deployment notes.

## Run the demo

```bash
cd project
python3 -m http.server 8000
# open http://localhost:8000/frontend/index.html
```

The demo fetches `../data/papers.json` directly, so the data pipeline must
have been run first (see `../data_pipeline/README.md`).

## Guided tutorial

`index.html` launches a first-visit guided tour after the data loads. The tour
uses the existing visual language: a small fixed card, warm highlight outline,
automatic scroll positioning, and Next / Back / Skip to end controls. Several
steps temporarily change the question, filters, histogram range, and selected
paper so users can see what changed across the metrics, charts, active filter
chips, and ranked table. When the tour ends, the dashboard restores the state
the user had before the tutorial started.

## Components

### `src/trajectory_chart.js`
`renderTrajectoryChart({ container, papers, contextPapers, onBrush, onSelect, onHover, width, height, spotlight, scoreAccessor })`

- Log-scale citations/year vs. publication year
- Lines colored by Beauty score B
- Hover/focus a line for paper metadata and peak timing
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

- computes Beauty score B through the last complete citation year
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

For a full Svelte port, keep the existing styles and make the current filter
values a shared store. The route shell can expose `/` for the dashboard and
`/methods` for the methods text, while the filter bar dispatches updates to the
same D3 render functions shown above.

## Deployment

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for the Vercel settings, public URL route,
Git LFS note, and cross-browser test checklist.
