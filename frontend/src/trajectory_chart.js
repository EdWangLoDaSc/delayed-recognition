// Citation trajectory chart: field/decade context plus an interactive
// spotlight set ranked by the current analytical question.

const MARGIN = { top: 62, right: 182, bottom: 54, left: 66 };

const PALETTE = {
  paper: "#f7f5f0",
  ink: "#17201c",
  inkSoft: "#34423c",
  muted: "#64706a",
  rule: "#d8ddd6",
  band: "#aebbb2",
  warm: "#b34724",
  warmSoft: "#d9794a",
  cool: "#25606d",
  selection: "#2d6b55",
};

export function renderTrajectoryChart({
  container,
  papers,
  contextPapers = null,
  onBrush = () => {},
  onSelect = () => {},
  onHover = () => {},
  width = 1060,
  height = 570,
  spotlight = 16,
  selectedId = null,
  modeLabel = "spotlight",
  scoreAccessor = spotlightScore,
}) {
  const d3 = window.d3;
  container.innerHTML = "";
  container.style.position = container.style.position || "relative";

  if (!contextPapers || contextPapers.length === 0) contextPapers = papers;
  if (papers.length === 0 && contextPapers.length === 0) {
    container.innerHTML =
      '<div class="empty-chart">No papers match the current filters.</div>';
    return { node: null, reset() {}, setSelected() {} };
  }

  const ctxTraj = contextPapers.map((paper) => toTrajectory(paper));
  const tMax = Math.min(35, d3.max(ctxTraj, (points) => d3.max(points, (point) => point.t)) || 20);

  const context = [];
  for (let t = 0; t <= tMax; t++) {
    const values = ctxTraj
      .map((points) => points.find((point) => point.t === t)?.count)
      .filter((value) => value !== undefined);
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

  const spotlightPapers = [...papers]
    .filter((paper) => paper.peak_age <= tMax)
    .sort((a, b) => scoreAccessor(b) - scoreAccessor(a))
    .slice(0, spotlight);

  const spotlightTraj = spotlightPapers.map((paper) => ({
    paper,
    pts: toTrajectory(paper).filter((point) => point.t <= tMax),
  }));
  const labelIds = new Set(spotlightPapers.slice(0, Math.min(16, spotlightPapers.length)).map((paper) => paper.id));

  const maxCitations =
    d3.max([
      ...context.map((point) => point.q90),
      ...spotlightTraj.flatMap((series) => series.pts.map((point) => point.count)),
    ]) || 1;

  const x = d3.scaleLinear().domain([0, tMax]).range([MARGIN.left, width - MARGIN.right]);
  const y = d3
    .scaleLog()
    .domain([1, Math.max(10, maxCitations)])
    .clamp(true)
    .range([height - MARGIN.bottom, MARGIN.top]);

  const delayMax = Math.max(24, d3.max(spotlightPapers, (paper) => paper.recognition_delay) || 24);
  const color = d3.scaleSequential([0, delayMax], d3.interpolateRgb(PALETTE.cool, PALETTE.warm));

  const svg = d3
    .create("svg")
    .attr("viewBox", [0, 0, width, height])
    .attr("width", "100%")
    .attr("role", "img")
    .attr("aria-label", "Citation trajectories aligned to publication year")
    .style("display", "block");

  svg
    .append("g")
    .attr("stroke", PALETTE.rule)
    .attr("stroke-width", 0.45)
    .attr("stroke-dasharray", "1 4")
    .selectAll("line")
    .data(y.ticks(5))
    .join("line")
    .attr("x1", MARGIN.left)
    .attr("x2", width - MARGIN.right)
    .attr("y1", (tick) => y(tick))
    .attr("y2", (tick) => y(tick));

  const area = d3
    .area()
    .x((point) => x(point.t))
    .y0((point) => y(Math.max(1, point.q25)))
    .y1((point) => y(Math.max(1, point.q75)))
    .curve(d3.curveMonotoneX);

  svg
    .append("path")
    .datum(context)
    .attr("d", area)
    .attr("fill", PALETTE.band)
    .attr("fill-opacity", 0.2);

  const lineForContext = (accessor) =>
    d3
      .line()
      .x((point) => x(point.t))
      .y((point) => y(Math.max(1, accessor(point))))
      .curve(d3.curveMonotoneX);

  svg
    .append("path")
    .datum(context)
    .attr("d", lineForContext((point) => point.q90))
    .attr("fill", "none")
    .attr("stroke", PALETTE.band)
    .attr("stroke-width", 0.8)
    .attr("stroke-dasharray", "3 4");

  svg
    .append("path")
    .datum(context)
    .attr("d", lineForContext((point) => point.median))
    .attr("fill", "none")
    .attr("stroke", PALETTE.inkSoft)
    .attr("stroke-width", 1.3);

  const last = context[context.length - 1];
  if (last) {
    svg
      .append("text")
      .attr("x", x(last.t) + 7)
      .attr("y", y(Math.max(1, last.median)) + 3)
      .attr("fill", PALETTE.inkSoft)
      .style("font-family", "'Fraunces', Georgia, serif")
      .style("font-style", "italic")
      .style("font-size", "11.5px")
      .text("median paper");
    svg
      .append("text")
      .attr("x", x(last.t) + 7)
      .attr("y", y(Math.max(1, last.q75)) - 4)
      .attr("fill", PALETTE.muted)
      .style("font-family", "'JetBrains Mono', monospace")
      .style("font-size", "9.5px")
      .style("letter-spacing", "0.1em")
      .text("IQR");
  }

  svg
    .append("g")
    .attr("transform", `translate(0,${height - MARGIN.bottom})`)
    .call(d3.axisBottom(x).ticks(Math.min(tMax, 10)).tickFormat((tick) => `${tick}`).tickSize(4))
    .call((group) => group.selectAll(".tick line").attr("stroke", PALETTE.ink))
    .append("text")
    .attr("class", "axis-label")
    .attr("x", width - MARGIN.right)
    .attr("y", 38)
    .attr("text-anchor", "end")
    .text("years since publication");

  svg
    .append("g")
    .attr("transform", `translate(${MARGIN.left},0)`)
    .call(d3.axisLeft(y).ticks(5, "~s").tickSize(4))
    .call((group) => group.selectAll(".tick line").attr("stroke", PALETTE.ink))
    .append("text")
    .attr("class", "axis-label")
    .attr("x", -MARGIN.left + 4)
    .attr("y", MARGIN.top - 14)
    .attr("text-anchor", "start")
    .text("citations per year (log)");

  const spotlightG = svg.append("g");
  const line = d3
    .line()
    .x((point) => x(point.t))
    .y((point) => y(Math.max(1, point.count)))
    .curve(d3.curveMonotoneX);

  spotlightTraj.sort((a, b) => a.paper.recognition_delay - b.paper.recognition_delay);

  const groups = spotlightG
    .selectAll("g.spot")
    .data(spotlightTraj, (series) => series.paper.id)
    .join("g")
    .attr("class", "spot")
    .attr("tabindex", 0)
    .attr("role", "button")
    .attr("aria-pressed", (series) => String(series.paper.id === selectedId))
    .attr("aria-label", (series) => paperLabel(series.paper))
    .style("cursor", "pointer");

  groups
    .filter((series) => {
      const firstPoint = series.pts[0];
      return firstPoint && firstPoint.t > 1;
    })
    .append("line")
    .attr("class", "lead-gap")
    .attr("x1", x(0))
    .attr("x2", (series) => x(series.pts[0].t))
    .attr("y1", y(1))
    .attr("y2", y(1))
    .attr("stroke", (series) => color(series.paper.recognition_delay))
    .attr("stroke-width", 0.8)
    .attr("stroke-dasharray", "2 4")
    .attr("stroke-opacity", 0.32);

  groups
    .filter((series) => {
      const firstPoint = series.pts[0];
      return firstPoint && firstPoint.t > 1;
    })
    .append("circle")
    .attr("class", "observed-start")
    .attr("cx", (series) => x(series.pts[0].t))
    .attr("cy", (series) => y(Math.max(1, series.pts[0].count)))
    .attr("r", 2.4)
    .attr("fill", PALETTE.paper)
    .attr("stroke", (series) => color(series.paper.recognition_delay))
    .attr("stroke-width", 1);

  groups
    .append("path")
    .attr("class", "line")
    .attr("d", (series) => line(series.pts))
    .attr("fill", "none")
    .attr("stroke", (series) => color(series.paper.recognition_delay))
    .attr("stroke-width", (series) => widthFor(series.paper.recognition_delay))
    .attr("stroke-opacity", 0.86);

  groups
    .append("circle")
    .attr("class", "peak")
    .attr("cx", (series) => x(series.paper.peak_age))
    .attr("cy", (series) => y(Math.max(1, series.paper.peak_citations)))
    .attr("r", 3.5)
    .attr("fill", (series) => color(series.paper.recognition_delay))
    .attr("stroke", PALETTE.paper)
    .attr("stroke-width", 1.4);

  groups
    .filter((series) => labelIds.has(series.paper.id))
    .append("text")
    .attr("class", "end-label")
    .attr("x", width - MARGIN.right + 14)
    .attr("y", (series) => y(Math.max(1, series.paper.peak_citations)) + 3)
    .attr("fill", (series) => color(series.paper.recognition_delay))
    .style("font-family", "'Fraunces', Georgia, serif")
    .style("font-style", "italic")
    .style("font-size", "11px")
    .style("font-weight", "500")
    .text((series) => {
      const author = (series.paper.first_author || "?").split(" ").slice(-1)[0];
      return `${author} '${String(series.paper.publication_year).slice(2)}`;
    });

  dodgeLabels(groups.selectAll(".end-label").nodes(), 13, MARGIN.top + 4, height - MARGIN.bottom - 5);

  let currentSelection = selectedId;
  applySelection(currentSelection);

  groups
    .on("mouseenter focus", function (event, series) {
      d3.select(this)
        .select(".line")
        .attr("stroke-opacity", 1)
        .attr("stroke-width", widthFor(series.paper.recognition_delay) + 0.9);
      d3.select(this).select(".peak").attr("r", 5);
      onHover(series.paper);
    })
    .on("mouseleave blur", function (event, series) {
      if (series.paper.id !== currentSelection) {
        d3.select(this)
          .select(".line")
          .attr("stroke-opacity", currentSelection ? 0.25 : 0.86)
          .attr("stroke-width", widthFor(series.paper.recognition_delay));
        d3.select(this).select(".peak").attr("r", 3.5);
      }
      onHover(null);
    })
    .on("click", function (event, series) {
      event.stopPropagation();
      toggleSelection(series.paper);
    })
    .on("keydown", function (event, series) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        toggleSelection(series.paper);
      }
    });

  const brush = d3
    .brushX()
    .extent([
      [MARGIN.left, MARGIN.top],
      [width - MARGIN.right, height - MARGIN.bottom],
    ])
    .on("end", ({ selection }) => {
      if (!selection) {
        groups.attr("opacity", 1);
        onBrush(papers, null);
        return;
      }
      const [t0, t1] = selection.map(x.invert);
      const filtered = papers.filter((paper) => paper.peak_age >= t0 && paper.peak_age <= t1);
      const keep = new Set(filtered.map((paper) => paper.id));
      groups.attr("opacity", (series) => (keep.has(series.paper.id) ? 1 : 0.14));
      onBrush(filtered, [t0, t1]);
    });

  svg.append("g").attr("class", "brush").call(brush).lower();
  spotlightG.raise();

  svg.on("click", () => {
    if (currentSelection) {
      currentSelection = null;
      applySelection(null);
      onSelect(null);
    }
  });

  const legend = svg.append("g").attr("transform", `translate(${MARGIN.left},24)`);
  legend
    .append("text")
    .attr("fill", PALETTE.muted)
    .style("font-family", "'JetBrains Mono', monospace")
    .style("font-size", "9.5px")
    .style("letter-spacing", "0.14em")
    .text(
      `${modeLabel.toUpperCase()} · TOP ${spotlightTraj.length} · n = ${contextPapers.length.toLocaleString()} CONTEXT PAPERS`
    );

  const swatchG = svg.append("g").attr("transform", `translate(${MARGIN.left + 468},21)`);
  swatchG
    .append("line")
    .attr("x1", 0)
    .attr("x2", 26)
    .attr("y1", 5)
    .attr("y2", 5)
    .attr("stroke", PALETTE.cool)
    .attr("stroke-width", 1.8);
  swatchG
    .append("text")
    .attr("x", 32)
    .attr("y", 8)
    .attr("fill", PALETTE.cool)
    .style("font-family", "'Fraunces', serif")
    .style("font-style", "italic")
    .style("font-size", "11px")
    .text("low delay");
  swatchG
    .append("line")
    .attr("x1", 122)
    .attr("x2", 148)
    .attr("y1", 5)
    .attr("y2", 5)
    .attr("stroke", PALETTE.warm)
    .attr("stroke-width", 1.8);
  swatchG
    .append("text")
    .attr("x", 154)
    .attr("y", 8)
    .attr("fill", PALETTE.warm)
    .style("font-family", "'Fraunces', serif")
    .style("font-style", "italic")
    .style("font-size", "11px")
    .text("high delay");

  const gapLegend = svg.append("g").attr("transform", `translate(${MARGIN.left},${height - 16})`);
  gapLegend
    .append("line")
    .attr("x1", 0)
    .attr("x2", 26)
    .attr("y1", 0)
    .attr("y2", 0)
    .attr("stroke", PALETTE.muted)
    .attr("stroke-width", 0.8)
    .attr("stroke-dasharray", "2 4");
  gapLegend
    .append("text")
    .attr("x", 34)
    .attr("y", 3)
    .attr("fill", PALETTE.muted)
    .style("font-family", "'JetBrains Mono', monospace")
    .style("font-size", "9px")
    .style("letter-spacing", "0.08em")
    .text("dashed lead = years before OpenAlex annual bins begin");

  container.appendChild(svg.node());

  return {
    node: svg.node(),
    setSelected(id) {
      currentSelection = id;
      applySelection(id);
    },
    reset() {
      groups.attr("opacity", 1);
      currentSelection = null;
      applySelection(null);
    },
  };

  function toggleSelection(paper) {
    currentSelection = currentSelection === paper.id ? null : paper.id;
    applySelection(currentSelection);
    onSelect(currentSelection ? paper : null);
  }

  function applySelection(id) {
    groups.attr("aria-pressed", (series) => String(series.paper.id === id));
    groups
      .select(".line")
      .attr("stroke-opacity", (series) => (id && series.paper.id !== id ? 0.25 : 0.86))
      .attr("stroke-width", (series) =>
        series.paper.id === id
          ? widthFor(series.paper.recognition_delay) + 1.5
          : widthFor(series.paper.recognition_delay)
      );
    groups.select(".peak").attr("r", (series) => (series.paper.id === id ? 5.2 : 3.5));
    groups.select(".end-label").attr("font-weight", (series) => (series.paper.id === id ? 700 : 500));
  }
}

function toTrajectory(paper) {
  return Object.keys(paper.counts_by_year || {})
    .map(Number)
    .map((year) => ({
      t: year - paper.publication_year,
      count: Number(paper.counts_by_year[year] || 0),
    }))
    .filter((point) => point.t >= 0)
    .sort((a, b) => a.t - b.t);
}

function spotlightScore(paper) {
  return (
    paper.recognition_delay * Math.log10(Math.max(2, paper.peak_citations)) +
    paper.sleep_duration * 0.12
  );
}

function widthFor(delay) {
  const scaled = Math.min(1, delay / 28);
  return 1.15 + scaled * 1.35;
}

function paperLabel(paper) {
  return `${paper.title || "Untitled"}; ${paper.first_author || "unknown author"}; recognition delay ${paper.recognition_delay.toFixed(1)}; peak ${paper.peak_year}`;
}

function dodgeLabels(nodes, minGap, minY, maxY) {
  const items = nodes.map((node) => ({ node, y: +node.getAttribute("y") })).sort((a, b) => a.y - b.y);
  if (!items.length) return;
  items[0].y = Math.max(minY, items[0].y);
  items[0].node.setAttribute("y", items[0].y);
  for (let index = 1; index < items.length; index++) {
    const previous = items[index - 1];
    const current = items[index];
    if (current.y - previous.y < minGap) {
      current.y = previous.y + minGap;
      current.node.setAttribute("y", current.y);
    }
  }
  const overflow = items[items.length - 1].y - maxY;
  if (overflow > 0) {
    for (let index = items.length - 1; index >= 0; index--) {
      const next = items[index + 1];
      items[index].y = Math.min(items[index].y - overflow, next ? next.y - minGap : maxY);
      items[index].y = Math.max(minY, items[index].y);
      items[index].node.setAttribute("y", items[index].y);
    }
  }
}
