// Citation trajectory chart — "context + spotlight" editorial design.
//
// Problem with drawing every trajectory: 900 overlapping lines produce noise
// rather than signal. Instead, we separate the two concerns:
//
//   • Context layer — aligns every filtered paper to "years since publication"
//     and renders the median trajectory plus IQR band. This is the shape of
//     an ordinary paper's reception.
//
//   • Spotlight layer — the top N papers by |B|, drawn as individual labeled
//     lines. A dot marks each paper's peak year (its "awakening"). Warm
//     colors for delayed peaks, cool for early peaks.
//
// Brushing on the x-axis (years since publication) filters the spotlight by
// the timing of each paper's peak.
//
// renderTrajectoryChart({ container, papers, onBrush, width, height, spotlight })

const MARGIN = { top: 32, right: 140, bottom: 48, left: 64 };

const PALETTE = {
  paper: "#fbf7ec",
  ink: "#1c1815",
  inkSoft: "#3a332b",
  muted: "#7a6f5d",
  rule: "#c9bfa8",
  warm: "#a33a1f",
  warmSoft: "#c76a43",
  cool: "#2d4a6b",
  coolSoft: "#6a88a8",
  band: "#bfb296",
};

export function renderTrajectoryChart({
  container,
  papers,
  onBrush = () => {},
  width = 1060,
  height = 560,
  spotlight = 16,
}) {
  const d3 = window.d3;
  container.innerHTML = "";
  container.style.position = container.style.position || "relative";

  if (papers.length === 0) {
    container.innerHTML = `<div style="padding:80px;text-align:center;font-style:italic;color:${PALETTE.muted}">No papers match the current filters.</div>`;
    return { node: null, highlight() {}, reset() {} };
  }

  // Build "years-since-publication" trajectories for everything
  const trajectories = papers.map((p) => {
    const years = Object.keys(p.counts_by_year).map(Number);
    const pts = years
      .map((yr) => ({ t: yr - p.publication_year, count: p.counts_by_year[yr] }))
      .filter((d) => d.t >= 0)
      .sort((a, b) => a.t - b.t);
    return { paper: p, pts };
  });

  const tMax = d3.min([d3.max(trajectories, (s) => d3.max(s.pts, (d) => d.t)) || 20, 35]);

  // Context: median + IQR band across all filtered papers, per t
  const context = [];
  for (let t = 0; t <= tMax; t++) {
    const values = trajectories
      .map((s) => s.pts.find((d) => d.t === t)?.count)
      .filter((v) => v !== undefined);
    if (values.length >= 5) {
      values.sort(d3.ascending);
      context.push({
        t,
        q25: d3.quantile(values, 0.25) ?? 0,
        median: d3.quantile(values, 0.5) ?? 0,
        q75: d3.quantile(values, 0.75) ?? 0,
        q90: d3.quantile(values, 0.9) ?? 0,
      });
    }
  }

  // Spotlight: top-|B| papers that actually have a visible peak in range
  const spotlightPapers = [...papers]
    .filter((p) => (p.peak_year - p.publication_year) <= tMax)
    .sort((a, b) => Math.abs(b.B) - Math.abs(a.B))
    .slice(0, spotlight);

  const spotlightTraj = trajectories.filter((s) => spotlightPapers.includes(s.paper));

  const maxCitations = d3.max(
    [...context.map((c) => c.q90), ...spotlightTraj.flatMap((s) => s.pts.map((d) => d.count))]
  ) || 1;

  const x = d3.scaleLinear().domain([0, tMax]).range([MARGIN.left, width - MARGIN.right]);
  const y = d3.scaleLog().domain([1, Math.max(10, maxCitations)]).clamp(true).range([height - MARGIN.bottom, MARGIN.top]);

  const svg = d3
    .create("svg")
    .attr("viewBox", [0, 0, width, height])
    .attr("width", "100%")
    .attr("height", "auto")
    .style("display", "block");

  // ── Subtle grid ────────────────────────────────────────────────────────
  svg
    .append("g")
    .attr("stroke", PALETTE.rule)
    .attr("stroke-width", 0.3)
    .attr("stroke-dasharray", "1 4")
    .selectAll("line")
    .data(y.ticks(5))
    .join("line")
    .attr("x1", MARGIN.left)
    .attr("x2", width - MARGIN.right)
    .attr("y1", (d) => y(d))
    .attr("y2", (d) => y(d));

  // ── Context band (IQR) ─────────────────────────────────────────────────
  const area = d3
    .area()
    .x((d) => x(d.t))
    .y0((d) => y(Math.max(1, d.q25)))
    .y1((d) => y(Math.max(1, d.q75)))
    .curve(d3.curveMonotoneX);

  svg
    .append("path")
    .datum(context)
    .attr("d", area)
    .attr("fill", PALETTE.band)
    .attr("fill-opacity", 0.22);

  // Q90 outline (dashed, very faint) to hint at the upper envelope
  const q90Line = d3.line().x((d) => x(d.t)).y((d) => y(Math.max(1, d.q90))).curve(d3.curveMonotoneX);
  svg
    .append("path")
    .datum(context)
    .attr("d", q90Line)
    .attr("fill", "none")
    .attr("stroke", PALETTE.band)
    .attr("stroke-width", 0.7)
    .attr("stroke-dasharray", "3 4");

  // Median line
  const medianLine = d3.line().x((d) => x(d.t)).y((d) => y(Math.max(1, d.median))).curve(d3.curveMonotoneX);
  svg
    .append("path")
    .datum(context)
    .attr("d", medianLine)
    .attr("fill", "none")
    .attr("stroke", PALETTE.inkSoft)
    .attr("stroke-width", 1.2);

  // Median label — placed near right end of context
  const last = context[context.length - 1];
  if (last) {
    svg
      .append("text")
      .attr("x", x(last.t) + 6)
      .attr("y", y(Math.max(1, last.median)) + 3)
      .attr("fill", PALETTE.inkSoft)
      .style("font-family", "'Fraunces', Georgia, serif")
      .style("font-style", "italic")
      .style("font-size", "11.5px")
      .text("median paper");
  }
  if (last) {
    svg
      .append("text")
      .attr("x", x(last.t) + 6)
      .attr("y", y(Math.max(1, last.q75)) - 4)
      .attr("fill", PALETTE.muted)
      .style("font-family", "'JetBrains Mono', monospace")
      .style("font-size", "9.5px")
      .style("letter-spacing", "0.12em")
      .text("IQR");
  }

  // ── Axes ────────────────────────────────────────────────────────────────
  svg
    .append("g")
    .attr("transform", `translate(0,${height - MARGIN.bottom})`)
    .call(d3.axisBottom(x).ticks(Math.min(tMax, 10)).tickFormat((d) => `${d}`).tickSize(4))
    .call((g) => g.selectAll(".tick line").attr("stroke", PALETTE.ink).attr("stroke-width", 0.5))
    .append("text")
    .attr("class", "axis-label")
    .attr("x", width - MARGIN.right)
    .attr("y", 34)
    .attr("text-anchor", "end")
    .text("years since publication →");

  svg
    .append("g")
    .attr("transform", `translate(${MARGIN.left},0)`)
    .call(d3.axisLeft(y).ticks(5, "~s").tickSize(4))
    .call((g) => g.selectAll(".tick line").attr("stroke", PALETTE.ink).attr("stroke-width", 0.5))
    .append("text")
    .attr("class", "axis-label")
    .attr("x", -MARGIN.left + 4)
    .attr("y", MARGIN.top - 12)
    .attr("text-anchor", "start")
    .text("citations per year (log)");

  // ── Spotlight lines ────────────────────────────────────────────────────
  const spotlightG = svg.append("g");

  const line = d3.line().x((d) => x(d.t)).y((d) => y(Math.max(1, d.count))).curve(d3.curveMonotoneX);

  // Color by sign of B
  const colorFor = (B) => (B >= 0 ? PALETTE.warm : PALETTE.cool);

  // Sort so warm (delayed) draws on top
  spotlightTraj.sort((a, b) => a.paper.B - b.paper.B);

  const groups = spotlightG
    .selectAll("g.spot")
    .data(spotlightTraj, (d) => d.paper.id)
    .join("g")
    .attr("class", "spot");

  // Line
  groups
    .append("path")
    .attr("class", "line")
    .attr("d", (d) => line(d.pts))
    .attr("fill", "none")
    .attr("stroke", (d) => colorFor(d.paper.B))
    .attr("stroke-width", 1.4)
    .attr("stroke-opacity", 0.85);

  // Peak dot (awakening)
  groups
    .append("circle")
    .attr("class", "peak")
    .attr("cx", (d) => x(d.paper.peak_year - d.paper.publication_year))
    .attr("cy", (d) => y(Math.max(1, d.paper.peak_citations)))
    .attr("r", 3.2)
    .attr("fill", (d) => colorFor(d.paper.B))
    .attr("stroke", PALETTE.paper)
    .attr("stroke-width", 1.2);

  // End-of-line label (author · pub year)
  groups
    .append("text")
    .attr("class", "end-label")
    .attr("x", (d) => {
      const lastPt = d.pts[d.pts.length - 1];
      return x(lastPt.t) + 6;
    })
    .attr("y", (d) => {
      const lastPt = d.pts[d.pts.length - 1];
      return y(Math.max(1, lastPt.count)) + 3;
    })
    .attr("fill", (d) => colorFor(d.paper.B))
    .style("font-family", "'Fraunces', Georgia, serif")
    .style("font-style", "italic")
    .style("font-size", "11px")
    .style("font-weight", "500")
    .text((d) => {
      const a = (d.paper.first_author || "?").split(" ").slice(-1)[0];
      return `${a} ’${String(d.paper.publication_year).slice(2)}`;
    })
    .append("title")
    .text((d) => `${d.paper.title} — B=${d.paper.B.toFixed(2)}`);

  // Resolve overlapping labels by a tiny greedy pushdown
  dodgeLabels(groups.selectAll(".end-label").nodes(), 13);

  // ── Hover detail ───────────────────────────────────────────────────────
  const tooltip = d3.select(container).append("div").attr("class", "tooltip");

  groups
    .on("mouseenter", function (event, d) {
      d3.select(this).select(".line").attr("stroke-width", 2.4).attr("stroke-opacity", 1);
      d3.select(this).select(".peak").attr("r", 5);
      const p = d.paper;
      tooltip
        .html(
          `<div class="tt-title">${escapeHtml(p.title)}</div>` +
            `<div class="tt-meta">${escapeHtml(p.first_author || "?")} · ${escapeHtml(p.venue || "")} · ${p.publication_year}</div>` +
            `<div class="tt-meta" style="font-style:italic;margin-top:2px">${escapeHtml(p.field)}</div>` +
            `<div class="tt-stats">B ${p.B >= 0 ? "+" : ""}${p.B.toFixed(2)} · peak at t=${p.peak_year - p.publication_year} (${p.peak_citations} cites) · sleep ${p.sleep_duration}y</div>`
        )
        .style("opacity", 1);
    })
    .on("mousemove", (event) => {
      const rect = container.getBoundingClientRect();
      tooltip
        .style("left", `${event.clientX - rect.left + 14}px`)
        .style("top", `${event.clientY - rect.top + 14}px`);
    })
    .on("mouseleave", function () {
      d3.select(this).select(".line").attr("stroke-width", 1.4).attr("stroke-opacity", 0.85);
      d3.select(this).select(".peak").attr("r", 3.2);
      tooltip.style("opacity", 0);
    });

  // ── Brush: filter spotlight by peak-timing window ──────────────────────
  const brush = d3
    .brushX()
    .extent([
      [MARGIN.left, MARGIN.top],
      [width - MARGIN.right, height - MARGIN.bottom],
    ])
    .on("end", ({ selection }) => {
      if (!selection) {
        groups.attr("opacity", 1);
        onBrush(papers);
        return;
      }
      const [t0, t1] = selection.map(x.invert);
      const filtered = papers.filter((p) => {
        const dt = p.peak_year - p.publication_year;
        return dt >= t0 && dt <= t1;
      });
      const keep = new Set(filtered.map((p) => p.id));
      groups.attr("opacity", (d) => (keep.has(d.paper.id) ? 1 : 0.12));
      onBrush(filtered);
    });

  svg.append("g").attr("class", "brush").call(brush).lower();
  // Keep context + spotlight drawn above the invisible brush overlay
  svg.selectAll("g.brush .overlay").attr("pointer-events", "all");
  // Re-append spotlight so hover beats brush overlay
  spotlightG.raise();

  // ── Legend / caption ───────────────────────────────────────────────────
  const legend = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top - 18})`);
  legend
    .append("text")
    .attr("fill", PALETTE.muted)
    .style("font-family", "'JetBrains Mono', monospace")
    .style("font-size", "9.5px")
    .style("letter-spacing", "0.18em")
    .text(`SPOTLIGHT · TOP ${spotlightTraj.length} BY ∣B∣  ·  n = ${papers.length.toLocaleString()} IN CONTEXT`);

  const swatchG = svg.append("g").attr("transform", `translate(${MARGIN.left + 360},${MARGIN.top - 21})`);
  swatchG.append("line").attr("x1", 0).attr("x2", 22).attr("y1", 4).attr("y2", 4).attr("stroke", PALETTE.warm).attr("stroke-width", 1.6);
  swatchG.append("text").attr("x", 28).attr("y", 7).attr("fill", PALETTE.warm).style("font-family", "'Fraunces', serif").style("font-style", "italic").style("font-size", "11px").text("delayed peak (B > 0)");
  swatchG.append("line").attr("x1", 170).attr("x2", 192).attr("y1", 4).attr("y2", 4).attr("stroke", PALETTE.cool).attr("stroke-width", 1.6);
  swatchG.append("text").attr("x", 198).attr("y", 7).attr("fill", PALETTE.cool).style("font-family", "'Fraunces', serif").style("font-style", "italic").style("font-size", "11px").text("early peak (B < 0)");

  container.appendChild(svg.node());

  return {
    node: svg.node(),
    highlight(ids) {
      const keep = new Set(ids);
      groups.attr("opacity", (d) => (keep.has(d.paper.id) ? 1 : 0.12));
    },
    reset() {
      groups.attr("opacity", 1);
    },
  };
}

// Greedy vertical de-overlap for end-of-line labels
function dodgeLabels(nodes, minGap) {
  const items = nodes
    .map((n) => ({ n, y: +n.getAttribute("y") }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1];
    const cur = items[i];
    if (cur.y - prev.y < minGap) {
      cur.y = prev.y + minGap;
      cur.n.setAttribute("y", cur.y);
    }
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
