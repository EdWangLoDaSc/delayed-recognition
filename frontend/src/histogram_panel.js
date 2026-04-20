// Small-multiples histogram of Beauty Coefficient B by field.
//
// Editorial aesthetic: each facet framed with a ruled baseline, title set
// in italic display serif (inherits .facet-title CSS from the page), and
// bars drawn with a warm/cool split around zero so the direction of B is
// legible at a glance.

const MARGIN = { top: 42, right: 16, bottom: 44, left: 52 };

const PALETTE = {
  paper: "#fbf7ec",
  ink: "#1c1815",
  rule: "#c9bfa8",
  muted: "#7a6f5d",
  warm: "#a33a1f",
  cool: "#2d4a6b",
};

export function renderHistogramPanel({
  container,
  papers,
  width = 1060,
  height = 280,
  bins = 46,
  clip = 60,
}) {
  const d3 = window.d3;
  container.innerHTML = "";

  const byField = d3.group(papers, (p) => p.field);
  const fields = Array.from(byField.keys()).sort();
  const facetW = width / fields.length;

  const xDomain = [-clip, clip];
  const x = d3.scaleLinear().domain(xDomain).range([MARGIN.left, facetW - MARGIN.right]);

  const histogram = d3
    .bin()
    .domain(xDomain)
    .thresholds(x.ticks(bins))
    .value((p) => Math.max(xDomain[0], Math.min(xDomain[1], p.B)));

  const allBinned = fields.map((f) => histogram(byField.get(f)));
  const yMax = d3.max(allBinned, (bs) => d3.max(bs, (b) => b.length)) || 1;
  const y = d3.scaleSymlog().domain([0, yMax]).range([height - MARGIN.bottom, MARGIN.top]).constant(1);

  const svg = d3
    .create("svg")
    .attr("viewBox", [0, 0, width, height])
    .attr("width", "100%")
    .attr("height", "auto")
    .style("display", "block");

  fields.forEach((field, i) => {
    const facet = svg.append("g").attr("transform", `translate(${i * facetW},0)`);
    const binned = allBinned[i];

    // Hairline separator between facets
    if (i > 0) {
      facet
        .append("line")
        .attr("x1", 0).attr("x2", 0)
        .attr("y1", MARGIN.top - 18).attr("y2", height - MARGIN.bottom)
        .attr("stroke", PALETTE.rule)
        .attr("stroke-width", 0.5);
    }

    // Zero rule (dashed) — reference for "no delay"
    facet
      .append("line")
      .attr("x1", x(0)).attr("x2", x(0))
      .attr("y1", MARGIN.top).attr("y2", height - MARGIN.bottom)
      .attr("stroke", PALETTE.ink)
      .attr("stroke-width", 0.5)
      .attr("stroke-dasharray", "2 4")
      .attr("opacity", 0.5);

    // Bars — color split at zero
    facet
      .append("g")
      .selectAll("rect")
      .data(binned)
      .join("rect")
      .attr("x", (d) => x(d.x0) + 0.5)
      .attr("width", (d) => Math.max(0, x(d.x1) - x(d.x0) - 1))
      .attr("y", (d) => y(d.length))
      .attr("height", (d) => y(0) - y(d.length))
      .attr("fill", (d) => {
        const mid = (d.x0 + d.x1) / 2;
        return mid < 0 ? PALETTE.cool : PALETTE.warm;
      })
      .attr("fill-opacity", (d) => {
        const mid = (d.x0 + d.x1) / 2;
        return Math.min(1, 0.35 + Math.abs(mid) / clip * 0.55);
      })
      .append("title")
      .text((d) => `B ∈ [${d.x0.toFixed(1)}, ${d.x1.toFixed(1)}]  ·  ${d.length} papers`);

    // Baseline
    facet
      .append("line")
      .attr("x1", MARGIN.left)
      .attr("x2", facetW - MARGIN.right)
      .attr("y1", y(0))
      .attr("y2", y(0))
      .attr("stroke", PALETTE.ink)
      .attr("stroke-width", 0.7);

    // X axis — just ticks, no domain line (we have our own baseline)
    facet
      .append("g")
      .attr("transform", `translate(0,${height - MARGIN.bottom})`)
      .call(d3.axisBottom(x).tickValues([-clip, -clip/2, 0, clip/2, clip]).tickSize(4))
      .call((g) => g.select(".domain").remove())
      .call((g) => g.selectAll(".tick line").attr("stroke", PALETTE.ink).attr("stroke-width", 0.5));

    // Y axis — only on first facet
    if (i === 0) {
      facet
        .append("g")
        .attr("transform", `translate(${MARGIN.left},0)`)
        .call(d3.axisLeft(y).ticks(4, "~s").tickSize(4))
        .call((g) => g.select(".domain").remove())
        .call((g) => g.selectAll(".tick line").attr("stroke", PALETTE.ink).attr("stroke-width", 0.5))
        .append("text")
        .attr("class", "axis-label")
        .attr("x", -MARGIN.left + 4)
        .attr("y", MARGIN.top - 24)
        .attr("text-anchor", "start")
        .text("count (symlog)");
    }

    // Facet number + title
    const shortField = shortenField(field);
    facet
      .append("text")
      .attr("x", MARGIN.left)
      .attr("y", 14)
      .attr("fill", PALETTE.muted)
      .style("font-size", "9.5px")
      .style("letter-spacing", "0.2em")
      .text(`PLATE ${toRoman(i + 1)}`);
    facet
      .append("text")
      .attr("class", "facet-title")
      .attr("x", MARGIN.left)
      .attr("y", 32)
      .text(shortField);
    facet
      .append("text")
      .attr("x", MARGIN.left)
      .attr("y", 46)
      .attr("fill", PALETTE.muted)
      .style("font-size", "10px")
      .style("letter-spacing", "0.08em")
      .text(`n = ${byField.get(field).length.toLocaleString()}`);

    // Bottom label on last facet
    if (i === fields.length - 1) {
      facet
        .append("text")
        .attr("class", "axis-label")
        .attr("x", facetW - MARGIN.right)
        .attr("y", height - 6)
        .attr("text-anchor", "end")
        .text(`B, clipped to ±${clip}`);
    }

    // Directional labels under axis
    facet
      .append("text")
      .attr("x", x(-clip * 0.75))
      .attr("y", height - MARGIN.bottom + 28)
      .attr("text-anchor", "middle")
      .attr("fill", PALETTE.cool)
      .style("font-size", "9.5px")
      .style("letter-spacing", "0.14em")
      .text("EARLY PEAK");
    facet
      .append("text")
      .attr("x", x(clip * 0.75))
      .attr("y", height - MARGIN.bottom + 28)
      .attr("text-anchor", "middle")
      .attr("fill", PALETTE.warm)
      .style("font-size", "9.5px")
      .style("letter-spacing", "0.14em")
      .text("DELAYED PEAK");
  });

  container.appendChild(svg.node());
  return { node: svg.node() };
}

function shortenField(f) {
  if (f.startsWith("Biochemistry")) return "Molecular Biology";
  if (f.startsWith("Physics")) return "Physics & Astronomy";
  return f;
}

function toRoman(n) {
  return ["I","II","III","IV","V","VI"][n - 1] || String(n);
}
