// Small-multiples histogram of corrected recognition-delay score by field.
//
// The histogram is intentionally linked on the same variable it displays:
// clicking a bar sets a recognition-delay range for the trajectory spotlight.

const MARGIN = { top: 58, right: 16, bottom: 48, left: 58 };

const PALETTE = {
  ink: "#17201c",
  rule: "#d8ddd6",
  muted: "#64706a",
  warm: "#b34724",
  warmSoft: "#d9794a",
  cool: "#25606d",
  selection: "#2d6b55",
};

export function renderHistogramPanel({
  container,
  papers,
  width = 1060,
  height = 286,
  bins = 36,
  clip = 34,
  onBinClick = () => {},
  activeRange = null,
}) {
  const d3 = window.d3;
  container.innerHTML = "";

  const byField = d3.group(papers, (paper) => paper.field);
  const fields = Array.from(byField.keys()).sort();
  if (fields.length === 0) {
    container.innerHTML =
      '<div class="empty-chart">No papers match the current filters.</div>';
    return { node: null };
  }

  const facetW = width / fields.length;
  const xDomain = [0, clip];
  const x = d3.scaleLinear().domain(xDomain).range([MARGIN.left, facetW - MARGIN.right]);
  const color = d3.scaleSequential([0, clip], d3.interpolateRgb(PALETTE.cool, PALETTE.warm));

  const histogram = d3
    .bin()
    .domain(xDomain)
    .thresholds(x.ticks(bins))
    .value((paper) => Math.max(xDomain[0], Math.min(xDomain[1], paper.recognition_delay)));

  const allBinned = fields.map((field) => histogram(byField.get(field)));
  const yMax = d3.max(allBinned, (fieldBins) => d3.max(fieldBins, (bin) => bin.length)) || 1;
  const y = d3
    .scaleSymlog()
    .domain([0, yMax])
    .range([height - MARGIN.bottom, MARGIN.top])
    .constant(1);

  const svg = d3
    .create("svg")
    .attr("viewBox", [0, 0, width, height])
    .attr("width", "100%")
    .attr("role", "img")
    .attr("aria-label", "Distribution of corrected recognition-delay scores by field")
    .style("display", "block");

  const inRange = (bin, range) =>
    range && (bin.x0 + bin.x1) / 2 >= range[0] && (bin.x0 + bin.x1) / 2 <= range[1];

  fields.forEach((field, index) => {
    const facet = svg.append("g").attr("transform", `translate(${index * facetW},0)`);
    const binned = allBinned[index];

    if (index > 0) {
      facet
        .append("line")
        .attr("x1", 0)
        .attr("x2", 0)
        .attr("y1", MARGIN.top - 18)
        .attr("y2", height - MARGIN.bottom)
        .attr("stroke", PALETTE.rule)
        .attr("stroke-width", 0.8);
    }

    facet
      .append("g")
      .selectAll("rect.bar")
      .data(binned)
      .join("rect")
      .attr("class", "bar")
      .attr("x", (bin) => x(bin.x0) + 0.5)
      .attr("width", (bin) => Math.max(0, x(bin.x1) - x(bin.x0) - 1))
      .attr("y", (bin) => y(bin.length))
      .attr("height", (bin) => y(0) - y(bin.length))
      .attr("fill", (bin) => color((bin.x0 + bin.x1) / 2))
      .attr("fill-opacity", (bin) => {
        const base = 0.34 + ((bin.x0 + bin.x1) / 2 / clip) * 0.56;
        return activeRange && !inRange(bin, activeRange) ? base * 0.25 : base;
      })
      .attr("stroke", (bin) => (activeRange && inRange(bin, activeRange) ? PALETTE.selection : "none"))
      .attr("stroke-width", 1.2)
      .attr("tabindex", 0)
      .attr("role", "button")
      .attr("aria-pressed", (bin) => String(Boolean(activeRange && inRange(bin, activeRange))))
      .attr(
        "aria-label",
        (bin) =>
          `Recognition delay ${bin.x0.toFixed(1)} to ${bin.x1.toFixed(1)}, ${bin.length} papers. Activate to filter.`
      )
      .style("cursor", "pointer")
      .on("mouseenter focus", function () {
        d3.select(this).attr("fill-opacity", 1);
      })
      .on("mouseleave blur", function (event, bin) {
        const base = 0.34 + ((bin.x0 + bin.x1) / 2 / clip) * 0.56;
        d3.select(this).attr(
          "fill-opacity",
          activeRange && !inRange(bin, activeRange) ? base * 0.25 : base
        );
      })
      .on("click", (event, bin) => onBinClick(bin.x0, bin.x1))
      .on("keydown", (event, bin) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onBinClick(bin.x0, bin.x1);
        }
      })
      .append("title")
      .text(
        (bin) =>
          `D in [${bin.x0.toFixed(1)}, ${bin.x1.toFixed(1)}] · ${bin.length} papers · click to filter`
      );

    facet
      .append("line")
      .attr("x1", MARGIN.left)
      .attr("x2", facetW - MARGIN.right)
      .attr("y1", y(0))
      .attr("y2", y(0))
      .attr("stroke", PALETTE.ink)
      .attr("stroke-width", 0.8);

    facet
      .append("g")
      .attr("transform", `translate(0,${height - MARGIN.bottom})`)
      .call(d3.axisBottom(x).tickValues([0, 8, 16, 24, 32]).tickSize(4))
      .call((group) => group.select(".domain").remove())
      .call((group) => group.selectAll(".tick line").attr("stroke", PALETTE.ink));

    if (index === 0) {
      facet
        .append("g")
        .attr("transform", `translate(${MARGIN.left},0)`)
        .call(d3.axisLeft(y).ticks(4, "~s").tickSize(4))
        .call((group) => group.select(".domain").remove())
        .call((group) => group.selectAll(".tick line").attr("stroke", PALETTE.ink))
        .append("text")
        .attr("class", "axis-label")
        .attr("x", -MARGIN.left + 4)
        .attr("y", MARGIN.top - 32)
        .attr("text-anchor", "start")
        .text("papers (symlog)");
    }

    facet
      .append("text")
      .attr("x", MARGIN.left)
      .attr("y", 18)
      .attr("fill", PALETTE.muted)
      .style("font-size", "9.5px")
      .style("letter-spacing", "0.14em")
      .text(`FIELD ${index + 1}`);

    facet
      .append("text")
      .attr("class", "facet-title")
      .attr("x", MARGIN.left)
      .attr("y", 38)
      .text(shortenField(field));

    facet
      .append("text")
      .attr("x", MARGIN.left)
      .attr("y", 54)
      .attr("fill", PALETTE.muted)
      .style("font-size", "10px")
      .style("letter-spacing", "0.08em")
      .text(`n = ${byField.get(field).length.toLocaleString()}`);

    facet
      .append("text")
      .attr("x", x(5))
      .attr("y", height - MARGIN.bottom + 30)
      .attr("text-anchor", "middle")
      .attr("fill", PALETTE.cool)
      .style("font-size", "9.5px")
      .style("letter-spacing", "0.12em")
      .text("LOW");

    facet
      .append("text")
      .attr("x", x(28))
      .attr("y", height - MARGIN.bottom + 30)
      .attr("text-anchor", "middle")
      .attr("fill", PALETTE.warm)
      .style("font-size", "9.5px")
      .style("letter-spacing", "0.12em")
      .text("HIGH DELAY");
  });

  svg
    .append("text")
    .attr("class", "axis-label")
    .attr("x", width - 18)
    .attr("y", height - 8)
    .attr("text-anchor", "end")
    .text(`corrected recognition-delay score D, clipped at ${clip}`);

  container.appendChild(svg.node());
  return { node: svg.node() };
}

function shortenField(field) {
  if (field.startsWith("Biochemistry")) return "Molecular Biology";
  if (field.startsWith("Physics")) return "Physics & Astronomy";
  return field;
}
