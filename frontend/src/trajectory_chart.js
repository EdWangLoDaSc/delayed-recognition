// Citation trajectory chart — "context + spotlight" editorial design.
//
// Two separate paper sets:
//   • contextPapers  — ideally the field+decade filtered universe (NOT
//     filtered by |B|). Drives the median and IQR band so the reference
//     shape is always the ordinary paper, not a subset of outliers.
//   • papers         — the fully filtered set (field + decade + min|B| +
//     optional bRange from a histogram bar click). Spotlight is drawn
//     from the top ∣B∣ × log(peak_citations) of this set.
//
// Callbacks:
//   • onBrush(filtered, [t0, t1])  — invoked on x-brush end (years-since-
//     publication window). `filtered` = papers whose peak falls in window.
//   • onSelect(paper | null)       — invoked on click of a spotlight line
//     or empty area. Caller renders a detail card.
//   • onHover(paper | null)        — live hover signal for a sidebar card.

const MARGIN = { top: 32, right: 148, bottom: 48, left: 64 };

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
  highlight: "#c9891b",
};

export function renderTrajectoryChart({
  container,
  papers,
  contextPapers = null,
  onBrush = () => {},
  onSelect = () => {},
  onHover = () => {},
  width = 1060,
  height = 560,
  spotlight = 16,
  selectedId = null,
}) {
  const d3 = window.d3;
  container.innerHTML = "";
  container.style.position = container.style.position || "relative";

  if (!contextPapers || contextPapers.length === 0) contextPapers = papers;

  if (papers.length === 0 && contextPapers.length === 0) {
    container.innerHTML = `<div style="padding:80px;text-align:center;font-style:italic;color:${PALETTE.muted}">No papers match the current filters.</div>`;
    return { node: null, highlight() {}, reset() {}, setSelected() {} };
  }

  // Years-since-publication trajectories for the CONTEXT set
  const ctxTraj = contextPapers.map((p) => {
    const years = Object.keys(p.counts_by_year).map(Number);
    return years
      .map((yr) => ({ t: yr - p.publication_year, count: p.counts_by_year[yr] }))
      .filter((d) => d.t >= 0)
      .sort((a, b) => a.t - b.t);
  });
  const tMax = d3.min([d3.max(ctxTraj, (pts) => d3.max(pts, (d) => d.t)) || 20, 35]);

  // Context: median + IQR per t from the UNFILTERED-by-B universe
  const context = [];
  for (let t = 0; t <= tMax; t++) {
    const values = ctxTraj
      .map((pts) => pts.find((d) => d.t === t)?.count)
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

  // Spotlight score: ∣B∣ weighted by log(peak_citations), so tiny-peak noise
  // can't crowd out actual sleeping beauties with high B alone.
  const spotScore = (p) => Math.abs(p.B) * Math.log10(Math.max(2, p.peak_citations));
  const spotlightPapers = [...papers]
    .filter((p) => (p.peak_year - p.publication_year) <= tMax)
    .sort((a, b) => spotScore(b) - spotScore(a))
    .slice(0, spotlight);

  const spotlightTraj = spotlightPapers.map((p) => {
    const years = Object.keys(p.counts_by_year).map(Number);
    const pts = years
      .map((yr) => ({ t: yr - p.publication_year, count: p.counts_by_year[yr] }))
      .filter((d) => d.t >= 0)
      .sort((a, b) => a.t - b.t);
    return { paper: p, pts };
  });

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

  // Grid
  svg
    .append("g")
    .attr("stroke", PALETTE.rule).attr("stroke-width", 0.3).attr("stroke-dasharray", "1 4")
    .selectAll("line")
    .data(y.ticks(5))
    .join("line")
    .attr("x1", MARGIN.left).attr("x2", width - MARGIN.right)
    .attr("y1", (d) => y(d)).attr("y2", (d) => y(d));

  // IQR band
  const area = d3.area()
    .x((d) => x(d.t))
    .y0((d) => y(Math.max(1, d.q25)))
    .y1((d) => y(Math.max(1, d.q75)))
    .curve(d3.curveMonotoneX);
  svg.append("path").datum(context).attr("d", area).attr("fill", PALETTE.band).attr("fill-opacity", 0.22);

  const q90Line = d3.line().x((d) => x(d.t)).y((d) => y(Math.max(1, d.q90))).curve(d3.curveMonotoneX);
  svg.append("path").datum(context).attr("d", q90Line)
    .attr("fill", "none").attr("stroke", PALETTE.band).attr("stroke-width", 0.7).attr("stroke-dasharray", "3 4");

  const medianLine = d3.line().x((d) => x(d.t)).y((d) => y(Math.max(1, d.median))).curve(d3.curveMonotoneX);
  svg.append("path").datum(context).attr("d", medianLine).attr("fill", "none").attr("stroke", PALETTE.inkSoft).attr("stroke-width", 1.2);

  const last = context[context.length - 1];
  if (last) {
    svg.append("text")
      .attr("x", x(last.t) + 6).attr("y", y(Math.max(1, last.median)) + 3)
      .attr("fill", PALETTE.inkSoft)
      .style("font-family", "'Fraunces', Georgia, serif").style("font-style", "italic").style("font-size", "11.5px")
      .text("median paper");
    svg.append("text")
      .attr("x", x(last.t) + 6).attr("y", y(Math.max(1, last.q75)) - 4)
      .attr("fill", PALETTE.muted)
      .style("font-family", "'JetBrains Mono', monospace").style("font-size", "9.5px").style("letter-spacing", "0.12em")
      .text("IQR");
  }

  // Axes
  svg.append("g")
    .attr("transform", `translate(0,${height - MARGIN.bottom})`)
    .call(d3.axisBottom(x).ticks(Math.min(tMax, 10)).tickFormat((d) => `${d}`).tickSize(4))
    .call((g) => g.selectAll(".tick line").attr("stroke", PALETTE.ink).attr("stroke-width", 0.5))
    .append("text").attr("class", "axis-label")
    .attr("x", width - MARGIN.right).attr("y", 34).attr("text-anchor", "end")
    .text("years since publication →");
  svg.append("g")
    .attr("transform", `translate(${MARGIN.left},0)`)
    .call(d3.axisLeft(y).ticks(5, "~s").tickSize(4))
    .call((g) => g.selectAll(".tick line").attr("stroke", PALETTE.ink).attr("stroke-width", 0.5))
    .append("text").attr("class", "axis-label")
    .attr("x", -MARGIN.left + 4).attr("y", MARGIN.top - 12).attr("text-anchor", "start")
    .text("citations per year (log)");

  // Spotlight
  const spotlightG = svg.append("g");
  const line = d3.line().x((d) => x(d.t)).y((d) => y(Math.max(1, d.count))).curve(d3.curveMonotoneX);
  const colorFor = (B) => (B >= 0 ? PALETTE.warm : PALETTE.cool);
  const widthFor = (B) => {
    const s = Math.min(1, Math.abs(B) / 40);
    return 1.1 + s * 1.2;
  };

  spotlightTraj.sort((a, b) => a.paper.B - b.paper.B);

  const groups = spotlightG.selectAll("g.spot").data(spotlightTraj, (d) => d.paper.id).join("g").attr("class", "spot").style("cursor", "pointer");

  groups.append("path").attr("class", "line")
    .attr("d", (d) => line(d.pts))
    .attr("fill", "none")
    .attr("stroke", (d) => colorFor(d.paper.B))
    .attr("stroke-width", (d) => widthFor(d.paper.B))
    .attr("stroke-opacity", 0.85);

  groups.append("circle").attr("class", "peak")
    .attr("cx", (d) => x(d.paper.peak_year - d.paper.publication_year))
    .attr("cy", (d) => y(Math.max(1, d.paper.peak_citations)))
    .attr("r", 3.2)
    .attr("fill", (d) => colorFor(d.paper.B))
    .attr("stroke", PALETTE.paper).attr("stroke-width", 1.2);

  groups.append("text").attr("class", "end-label")
    .attr("x", (d) => x(d.pts[d.pts.length - 1].t) + 6)
    .attr("y", (d) => y(Math.max(1, d.pts[d.pts.length - 1].count)) + 3)
    .attr("fill", (d) => colorFor(d.paper.B))
    .style("font-family", "'Fraunces', Georgia, serif").style("font-style", "italic").style("font-size", "11px").style("font-weight", "500")
    .text((d) => {
      const a = (d.paper.first_author || "?").split(" ").slice(-1)[0];
      return `${a} ’${String(d.paper.publication_year).slice(2)}`;
    });
  dodgeLabels(groups.selectAll(".end-label").nodes(), 13);

  // Selection styling helper
  function applySelection(id) {
    groups.select(".line")
      .attr("stroke-opacity", (d) => (id && d.paper.id !== id ? 0.25 : 0.85))
      .attr("stroke-width", (d) => (d.paper.id === id ? widthFor(d.paper.B) + 1.4 : widthFor(d.paper.B)));
    groups.select(".peak").attr("r", (d) => (d.paper.id === id ? 5 : 3.2));
    groups.select(".end-label").attr("font-weight", (d) => (d.paper.id === id ? 700 : 500));
  }

  // Hover + click
  groups
    .on("mouseenter", function (event, d) {
      d3.select(this).select(".line").attr("stroke-opacity", 1).attr("stroke-width", widthFor(d.paper.B) + 0.8);
      d3.select(this).select(".peak").attr("r", 5);
      onHover(d.paper);
    })
    .on("mouseleave", function (event, d) {
      if (d.paper.id !== currentSelection) {
        d3.select(this).select(".line").attr("stroke-opacity", currentSelection ? 0.25 : 0.85).attr("stroke-width", widthFor(d.paper.B));
        d3.select(this).select(".peak").attr("r", 3.2);
      }
      onHover(null);
    })
    .on("click", function (event, d) {
      event.stopPropagation();
      currentSelection = currentSelection === d.paper.id ? null : d.paper.id;
      applySelection(currentSelection);
      onSelect(currentSelection ? d.paper : null);
    });

  let currentSelection = selectedId;
  applySelection(currentSelection);

  // Brush
  const brush = d3.brushX()
    .extent([[MARGIN.left, MARGIN.top], [width - MARGIN.right, height - MARGIN.bottom]])
    .on("end", ({ selection }) => {
      if (!selection) {
        groups.attr("opacity", 1);
        onBrush(papers, null);
        return;
      }
      const [t0, t1] = selection.map(x.invert);
      const filtered = papers.filter((p) => {
        const dt = p.peak_year - p.publication_year;
        return dt >= t0 && dt <= t1;
      });
      const keep = new Set(filtered.map((p) => p.id));
      groups.attr("opacity", (d) => (keep.has(d.paper.id) ? 1 : 0.12));
      onBrush(filtered, [t0, t1]);
    });

  svg.append("g").attr("class", "brush").call(brush).lower();
  spotlightG.raise();

  // Background click clears selection
  svg.on("click", () => {
    if (currentSelection) {
      currentSelection = null;
      applySelection(null);
      onSelect(null);
    }
  });

  // Caption
  const legend = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top - 18})`);
  legend.append("text")
    .attr("fill", PALETTE.muted)
    .style("font-family", "'JetBrains Mono', monospace").style("font-size", "9.5px").style("letter-spacing", "0.18em")
    .text(`SPOTLIGHT · TOP ${spotlightTraj.length} BY ∣B∣·log(PEAK)  ·  n = ${contextPapers.length.toLocaleString()} IN CONTEXT`);

  const swatchG = svg.append("g").attr("transform", `translate(${MARGIN.left + 410},${MARGIN.top - 21})`);
  swatchG.append("line").attr("x1", 0).attr("x2", 22).attr("y1", 4).attr("y2", 4).attr("stroke", PALETTE.warm).attr("stroke-width", 1.6);
  swatchG.append("text").attr("x", 28).attr("y", 7).attr("fill", PALETTE.warm).style("font-family", "'Fraunces', serif").style("font-style", "italic").style("font-size", "11px").text("delayed peak");
  swatchG.append("line").attr("x1", 140).attr("x2", 162).attr("y1", 4).attr("y2", 4).attr("stroke", PALETTE.cool).attr("stroke-width", 1.6);
  swatchG.append("text").attr("x", 168).attr("y", 7).attr("fill", PALETTE.cool).style("font-family", "'Fraunces', serif").style("font-style", "italic").style("font-size", "11px").text("early peak");

  container.appendChild(svg.node());

  return {
    node: svg.node(),
    setSelected(id) { currentSelection = id; applySelection(id); },
    reset() { groups.attr("opacity", 1); currentSelection = null; applySelection(null); },
  };
}

function dodgeLabels(nodes, minGap) {
  const items = nodes.map((n) => ({ n, y: +n.getAttribute("y") })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1], cur = items[i];
    if (cur.y - prev.y < minGap) { cur.y = prev.y + minGap; cur.n.setAttribute("y", cur.y); }
  }
}
