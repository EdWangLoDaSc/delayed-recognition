// Small-multiples histogram of Beauty Coefficient B by field.
//
// Editorial aesthetic + cross-view linking:
//   • Each bar is clickable; clicking fires onBinClick(x0, x1) so the
//     trajectory spotlight can restrict to that slice of B.
//   • `highlightedRange` outlines the bars that fall within a given B
//     range — used to mirror the trajectory chart's brush.

const MARGIN = { top: 42, right: 16, bottom: 44, left: 52 };

const PALETTE = {
  paper: "#fbf7ec",
  ink: "#1c1815",
  rule: "#c9bfa8",
  muted: "#7a6f5d",
  warm: "#a33a1f",
  cool: "#2d4a6b",
  highlight: "#c9891b",
};

export function renderHistogramPanel({
  container,
  papers,
  width = 1060,
  height = 280,
  bins = 46,
  clip = 60,
  onBinClick = () => {},
  highlightedRange = null, // [lo, hi] inclusive
  activeRange = null,      // [lo, hi] from a previous bar click
}) {
  const d3 = window.d3;
  container.innerHTML = "";

  const byField = d3.group(papers, (p) => p.field);
  const fields = Array.from(byField.keys()).sort();
  if (fields.length === 0) return { node: null };
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

  const inRange = (bin, r) => r && ((bin.x0 + bin.x1) / 2 >= r[0] && (bin.x0 + bin.x1) / 2 <= r[1]);

  fields.forEach((field, i) => {
    const facet = svg.append("g").attr("transform", `translate(${i * facetW},0)`);
    const binned = allBinned[i];

    if (i > 0) {
      facet
        .append("line")
        .attr("x1", 0).attr("x2", 0)
        .attr("y1", MARGIN.top - 18).attr("y2", height - MARGIN.bottom)
        .attr("stroke", PALETTE.rule)
        .attr("stroke-width", 0.5);
    }

    // Zero rule
    facet
      .append("line")
      .attr("x1", x(0)).attr("x2", x(0))
      .attr("y1", MARGIN.top).attr("y2", height - MARGIN.bottom)
      .attr("stroke", PALETTE.ink)
      .attr("stroke-width", 0.5)
      .attr("stroke-dasharray", "2 4")
      .attr("opacity", 0.5);

    // Brush highlight band (from trajectory → histogram linkage)
    if (highlightedRange) {
      const [lo, hi] = highlightedRange;
      const bx0 = x(Math.max(-clip, lo));
      const bx1 = x(Math.min(clip, hi));
      facet
        .append("rect")
        .attr("x", bx0)
        .attr("width", Math.max(0, bx1 - bx0))
        .attr("y", MARGIN.top)
        .attr("height", y(0) - MARGIN.top)
        .attr("fill", PALETTE.highlight)
        .attr("fill-opacity", 0.12)
        .attr("pointer-events", "none");
    }

    // Bars
    facet
      .append("g")
      .selectAll("rect.bar")
      .data(binned)
      .join("rect")
      .attr("class", "bar")
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
        const base = Math.min(1, 0.35 + Math.abs(mid) / clip * 0.55);
        if (activeRange && !inRange(d, activeRange)) return base * 0.25;
        return base;
      })
      .attr("stroke", (d) => (activeRange && inRange(d, activeRange) ? PALETTE.ink : "none"))
      .attr("stroke-width", 0.6)
      .style("cursor", "pointer")
      .on("mouseenter", function () { d3.select(this).attr("fill-opacity", 1); })
      .on("mouseleave", function (event, d) {
        const mid = (d.x0 + d.x1) / 2;
        const base = Math.min(1, 0.35 + Math.abs(mid) / clip * 0.55);
        d3.select(this).attr("fill-opacity", activeRange && !inRange(d, activeRange) ? base * 0.25 : base);
      })
      .on("click", (event, d) => onBinClick(d.x0, d.x1))
      .append("title")
      .text((d) => `B ∈ [${d.x0.toFixed(1)}, ${d.x1.toFixed(1)}]  ·  ${d.length} papers  ·  click to spotlight`);

    // Baseline
    facet
      .append("line")
      .attr("x1", MARGIN.left)
      .attr("x2", facetW - MARGIN.right)
      .attr("y1", y(0))
      .attr("y2", y(0))
      .attr("stroke", PALETTE.ink)
      .attr("stroke-width", 0.7);

    // X axis
    facet
      .append("g")
      .attr("transform", `translate(0,${height - MARGIN.bottom})`)
      .call(d3.axisBottom(x).tickValues([-clip, -clip/2, 0, clip/2, clip]).tickSize(4))
      .call((g) => g.select(".domain").remove())
      .call((g) => g.selectAll(".tick line").attr("stroke", PALETTE.ink).attr("stroke-width", 0.5));

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

    facet
      .append("text")
      .attr("x", MARGIN.left).attr("y", 14)
      .attr("fill", PALETTE.muted)
      .style("font-size", "9.5px").style("letter-spacing", "0.2em")
      .text(`PLATE ${toRoman(i + 1)}`);
    facet
      .append("text")
      .attr("class", "facet-title")
      .attr("x", MARGIN.left).attr("y", 32)
      .text(shortenField(field));
    facet
      .append("text")
      .attr("x", MARGIN.left).attr("y", 46)
      .attr("fill", PALETTE.muted)
      .style("font-size", "10px").style("letter-spacing", "0.08em")
      .text(`n = ${byField.get(field).length.toLocaleString()}`);

    if (i === fields.length - 1) {
      facet
        .append("text")
        .attr("class", "axis-label")
        .attr("x", facetW - MARGIN.right).attr("y", height - 6)
        .attr("text-anchor", "end")
        .text(`B, clipped to ±${clip} · click a bar to spotlight`);
    }

    facet
      .append("text")
      .attr("x", x(-clip * 0.75)).attr("y", height - MARGIN.bottom + 28)
      .attr("text-anchor", "middle")
      .attr("fill", PALETTE.cool)
      .style("font-size", "9.5px").style("letter-spacing", "0.14em")
      .text("EARLY PEAK");
    facet
      .append("text")
      .attr("x", x(clip * 0.75)).attr("y", height - MARGIN.bottom + 28)
      .attr("text-anchor", "middle")
      .attr("fill", PALETTE.warm)
      .style("font-size", "9.5px").style("letter-spacing", "0.14em")
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
function toRoman(n) { return ["I","II","III","IV","V","VI"][n - 1] || String(n); }
