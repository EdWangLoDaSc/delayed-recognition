# Frontend — Delayed Recognition

Member 1's D3 deliverables, packaged as buildless ES modules so Member 3 can
drop them into the Svelte shell without a toolchain fight.

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
`renderTrajectoryChart({ container, papers, onBrush, width, height, maxLines })`

- Log-scale citations/year vs. publication year
- Lines colored by Beauty Coefficient B on a diverging Red–Yellow–Blue scale
- Hover a line for a detail panel (title, authors, venue, B, peak, sleep)
- Brush the x-axis to filter by `peak_year` window; `onBrush(filtered)` fires
- Returns `{ node, highlight(ids), reset() }` for external coordination

Downsamples to `maxLines` (default 800) by always keeping the highest-|B|
papers and randomly filling the remainder — trades completeness for
interactivity. Swap in a canvas renderer if Member 3 needs full 50k lines.

### `src/histogram_panel.js`
`renderHistogramPanel({ container, papers, width, height, bins, clip })`

- One facet per field, sharing x-domain for comparability
- Symlog y-axis because B distributions are heavy-tailed
- `clip` (default ±60) prevents a few outliers from crushing the bulk of mass
- Hover bars for exact bin counts

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
