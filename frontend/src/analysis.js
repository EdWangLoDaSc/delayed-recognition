const FIELD_LABELS = new Map([
  ["Biochemistry, Genetics and Molecular Biology", "Molecular Biology"],
  ["Physics and Astronomy", "Physics & Astronomy"],
  ["Computer Science", "Computer Science"],
]);

export const COMPLETE_CITATION_YEAR = 2025;

export const QUESTION_MODES = [
  {
    key: "sleepers",
    label: "Long-sleep awakenings",
    question: "Which papers stayed quiet longest before a citation peak?",
    copy:
      "Uses Beauty score B to surface dormant papers whose citation peak arrives late and intensely.",
    predicate: (paper) => paper.recognition_delay >= 8,
    score: (paper) =>
      paper.recognition_delay * Math.log10(Math.max(2, paper.peak_citations)) +
      paper.sleep_duration * 0.18,
  },
  {
    key: "impact",
    label: "Late impact",
    question: "Which delayed papers also reached substantial attention?",
    copy:
      "Pairs Beauty score B with peak and lifetime citations so tiny late spikes do not dominate.",
    predicate: (paper) => paper.recognition_delay >= 6 && paper.peak_citations >= 25,
    score: (paper) =>
      paper.recognition_delay * Math.log10(Math.max(2, paper.cited_by_count)),
  },
  {
    key: "recent",
    label: "Recent awakenings",
    question: "Which older papers awakened in the most recent citation window?",
    copy:
      "Highlights peaks after 2020; interpret this as an observed-window view because OpenAlex annual bins are recent-heavy.",
    predicate: (paper) => paper.peak_year >= 2021 && paper.recognition_delay >= 6,
    score: (paper) =>
      (paper.peak_year - 2020) * 2 +
      paper.recognition_delay +
      Math.log10(Math.max(2, paper.peak_citations)),
  },
  {
    key: "contrast",
    label: "Early attention contrast",
    question: "Which papers look least like delayed-recognition cases?",
    copy:
      "Ranks toward early or steady attention so the dormant-before-peak pattern has a visible comparison group.",
    predicate: () => true,
    score: (paper) =>
      -paper.recognition_delay - paper.sleep_duration * 0.08 + Math.log10(Math.max(2, paper.cited_by_count)),
  },
];

export const METHOD_CARDS = [
  {
    label: "Beauty score B",
    definition:
      "A Van Raan-style delayed-recognition score computed from each annual citation trajectory through the last complete citation year.",
    formula:
      "B = sum((baseline_t - citations_t) / max(1, baseline_t)) from publication to peak, clipped at zero for filtering.",
    source: "OpenAlex work metadata plus the local Python Beauty Coefficient calculation.",
    caution:
      "The dashboard uses B through 2025 consistently for ranking, filtering, and color.",
  },
  {
    label: "Annual citation trajectory",
    definition:
      "Per-year citation counts supplied in each OpenAlex work record and aligned to publication age.",
    formula:
      "counts_by_year[year] plotted as citations per year; missing years inside the observed window are treated as zero.",
    source: "OpenAlex Works counts_by_year field.",
    caution:
      "OpenAlex exposes recent annual citation bins, not a complete life-history series for older works. Lifetime cited_by_count is separate.",
  },
  {
    label: "Sleep duration",
    definition:
      "The local pipeline's first year where annual citations exceed the baseline threshold before the peak.",
    formula:
      "awakening_year - publication_year, using the reconstructed local trajectory.",
    source: "data_pipeline/fetch_openalex.py",
    caution:
      "Because annual counts begin around the recent OpenAlex window for many records, long sleeps can be partly an artifact of truncated early history.",
  },
  {
    label: "Comparable corpus",
    definition:
      "Highly cited articles with DOI, grouped by OpenAlex primary field and publication year.",
    formula:
      "type:article, has_doi:true, cited_by_count > 5, publication years 1990-2010, sorted by cited_by_count.",
    source: "OpenAlex Works API sampling script.",
    caution:
      "This is a tractable high-citation sample, not a random sample of all papers in each field.",
  },
];

export function normalizeCorpus(rawPapers) {
  const papers = rawPapers.map((paper) => {
    const metrics = computeDelayMetrics(
      Number(paper.publication_year),
      paper.counts_by_year || {},
      COMPLETE_CITATION_YEAR
    );
    const observedYears = Object.keys(metrics.counts_by_year).map(Number);
    const normalized = {
      ...paper,
      source_B: Number(paper.B) || 0,
      source_peak_year: Number(paper.peak_year),
      source_peak_citations: Number(paper.peak_citations),
      source_sleep_duration: Number(paper.sleep_duration),
      source_awakening_year: Number(paper.awakening_year),
      B: metrics.B,
      recognition_delay_raw: metrics.B,
      recognition_delay: Math.max(0, metrics.B),
      peak_year: metrics.peak_year,
      peak_citations: metrics.peak_citations,
      awakening_year: metrics.awakening_year,
      sleep_duration: metrics.sleep_duration,
      peak_age: metrics.peak_year - Number(paper.publication_year),
      counts_by_year: metrics.counts_by_year,
      observed_years: observedYears.length,
      first_observed_year: d3Min(observedYears),
      last_observed_year: d3Max(observedYears),
      cutoff_year: COMPLETE_CITATION_YEAR,
      field_label: FIELD_LABELS.get(paper.field) || paper.field || "Unknown field",
    };
    normalized.delay_class = classifyDelay(normalized);
    return normalized;
  });

  return { papers, sign: 1, cutoffYear: COMPLETE_CITATION_YEAR };
}

export function corpusSummary(papers) {
  const fields = Array.from(new Set(papers.map((paper) => paper.field))).sort();
  const delays = papers.map((paper) => paper.recognition_delay).sort((a, b) => a - b);
  const observed = papers.map((paper) => paper.first_observed_year).filter(Number.isFinite);
  const candidates = papers.filter((paper) => paper.recognition_delay >= 20);
  const publicationYears = papers.map((paper) => paper.publication_year).filter(Number.isFinite);
  return {
    total: papers.length,
    fields,
    medianDelay: quantile(delays, 0.5),
    p90Delay: quantile(delays, 0.9),
    candidates: candidates.length,
    firstPublication: d3Min(publicationYears),
    lastPublication: d3Max(publicationYears),
    firstObserved: d3Min(observed),
    lastObserved: d3Max(papers.map((paper) => paper.last_observed_year).filter(Number.isFinite)),
  };
}

export function filterPapers(papers, filters) {
  const mode = QUESTION_MODES.find((item) => item.key === filters.modeKey) || QUESTION_MODES[0];
  const query = normalizeText(filters.query || "");
  return papers.filter((paper) => {
    if (filters.field && paper.field !== filters.field) return false;
    if (filters.topic && paper.topic !== filters.topic) return false;
    if (filters.venue && paper.venue !== filters.venue) return false;
    if (filters.yearRange) {
      const [lo, hi] = filters.yearRange.map(Number);
      if (paper.publication_year < lo || paper.publication_year > hi) return false;
    }
    if (paper.recognition_delay < filters.minDelay) return false;
    if (filters.peakAge && paper.peak_age < filters.peakAge) return false;
    if (filters.delayRange) {
      const [lo, hi] = filters.delayRange;
      if (paper.recognition_delay < lo || paper.recognition_delay > hi) return false;
    }
    if (query && !paperSearchText(paper).includes(query)) return false;
    return true;
  });
}

export function rankPapers(papers, modeKey, limit = 24) {
  const mode = QUESTION_MODES.find((item) => item.key === modeKey) || QUESTION_MODES[0];
  return [...papers]
    .sort((a, b) => {
      const diff = mode.score(b) - mode.score(a);
      if (Math.abs(diff) > 1e-9) return diff;
      return b.recognition_delay - a.recognition_delay;
    })
    .slice(0, limit);
}

export function fieldSummaries(papers) {
  const groups = new Map();
  for (const paper of papers) {
    if (!groups.has(paper.field)) groups.set(paper.field, []);
    groups.get(paper.field).push(paper);
  }
  return Array.from(groups, ([field, rows]) => {
    const delays = rows.map((paper) => paper.recognition_delay).sort((a, b) => a - b);
    return {
      field,
      label: FIELD_LABELS.get(field) || field,
      count: rows.length,
      medianDelay: quantile(delays, 0.5),
      p90Delay: quantile(delays, 0.9),
      candidateShare: rows.filter((paper) => paper.recognition_delay >= 20).length / rows.length,
    };
  }).sort((a, b) => b.p90Delay - a.p90Delay);
}

export function topicSummaries(papers, limit = 8) {
  const groups = new Map();
  for (const paper of papers) {
    const topic = paper.topic || "Unlabeled topic";
    if (!groups.has(topic)) groups.set(topic, []);
    groups.get(topic).push(paper);
  }
  return Array.from(groups, ([topic, rows]) => {
    const delays = rows.map((paper) => paper.recognition_delay).sort((a, b) => a - b);
    const fields = new Set(rows.map((paper) => paper.field));
    return {
      topic,
      count: rows.length,
      fields: fields.size,
      medianDelay: quantile(delays, 0.5),
      p90Delay: quantile(delays, 0.9),
    };
  })
    .sort((a, b) => b.count - a.count || b.p90Delay - a.p90Delay)
    .slice(0, limit);
}

export function venueSummaries(papers, limit = 8) {
  const groups = new Map();
  for (const paper of papers) {
    const venue = paper.venue || "";
    if (!venue) continue;
    if (!groups.has(venue)) groups.set(venue, []);
    groups.get(venue).push(paper);
  }
  return Array.from(groups, ([venue, rows]) => {
    const delays = rows.map((paper) => paper.recognition_delay).sort((a, b) => a - b);
    const fields = new Set(rows.map((paper) => paper.field));
    const peakAges = rows.map((paper) => paper.peak_age).filter(Number.isFinite).sort((a, b) => a - b);
    const highShare = rows.filter((paper) => paper.recognition_delay >= 20).length / rows.length;
    const p90Delay = quantile(delays, 0.9);
    return {
      venue,
      count: rows.length,
      fields: fields.size,
      medianDelay: quantile(delays, 0.5),
      p90Delay,
      medianPeakAge: quantile(peakAges, 0.5),
      highShare,
      salience: Math.log10(rows.length + 1) * (0.65 + highShare) + (p90Delay / 34) * 0.55,
    };
  })
    .sort((a, b) => b.salience - a.salience || b.count - a.count)
    .slice(0, limit);
}

export function paperProfile(paper, comparisonSet) {
  if (!paper || !Array.isArray(comparisonSet) || !comparisonSet.length) return [];
  return [
    {
      label: "Beauty B",
      value: formatNumber(paper.recognition_delay, 1),
      percentile: percentileRank(paper.recognition_delay, comparisonSet.map((item) => item.recognition_delay)),
    },
    {
      label: "Peak age",
      value: `${paper.peak_age}y`,
      percentile: percentileRank(paper.peak_age, comparisonSet.map((item) => item.peak_age)),
    },
    {
      label: "Peak cites",
      value: formatNumber(paper.peak_citations),
      percentile: percentileRank(paper.peak_citations, comparisonSet.map((item) => item.peak_citations)),
    },
    {
      label: "Lifetime cites",
      value: formatNumber(paper.cited_by_count),
      percentile: percentileRank(paper.cited_by_count, comparisonSet.map((item) => item.cited_by_count)),
    },
  ];
}

export function searchPapers(papers, query, limit = 8) {
  const q = normalizeText(query || "");
  if (!q) return [];
  return papers
    .filter((paper) => paperSearchText(paper).includes(q))
    .sort((a, b) => b.recognition_delay - a.recognition_delay)
    .slice(0, limit);
}

export function formatNumber(value, digits = 0) {
  if (!Number.isFinite(value)) return "n/a";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

export function shortField(field) {
  return FIELD_LABELS.get(field) || field || "Unknown";
}

function classifyDelay(paper) {
  if (paper.recognition_delay >= 24) return "extreme";
  if (paper.recognition_delay >= 18) return "strong";
  if (paper.recognition_delay >= 10) return "moderate";
  return "low";
}

function paperSearchText(paper) {
  return normalizeText(
    `${paper.title} ${paper.first_author} ${paper.venue} ${paper.topic} ${paper.field} ${paper.publication_year}`
  );
}

function normalizeText(value) {
  return String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function quantile(sortedValues, q) {
  if (!sortedValues.length) return 0;
  const pos = (sortedValues.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedValues[lo];
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * (pos - lo);
}

function percentileRank(value, values) {
  if (!Number.isFinite(value)) return 0;
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return 0;
  const atOrBelow = clean.filter((item) => item <= value).length;
  return (atOrBelow / clean.length) * 100;
}

function d3Min(values) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? Math.min(...clean) : null;
}

function d3Max(values) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? Math.max(...clean) : null;
}

function computeDelayMetrics(publicationYear, countsByYear, cutoffYear) {
  const sourceYears = Object.keys(countsByYear).map(Number).filter((year) => year <= cutoffYear);
  const maxObservedYear = d3Max(sourceYears) || Math.min(cutoffYear, publicationYear);
  const endYear = Math.min(cutoffYear, maxObservedYear);
  const trajectory = [];
  const filteredCounts = {};

  for (let year = publicationYear; year <= endYear; year++) {
    const count = Number(countsByYear[year] || 0);
    trajectory.push(count);
    if (count > 0 || countsByYear[year] !== undefined) filteredCounts[year] = count;
  }

  if (trajectory.length < 2 || Math.max(...trajectory) <= 0) {
    return {
      B: 0,
      peak_year: publicationYear,
      peak_citations: 0,
      awakening_year: publicationYear,
      sleep_duration: 0,
      counts_by_year: filteredCounts,
    };
  }

  const peakCitations = Math.max(...trajectory);
  const peakIndex = trajectory.indexOf(peakCitations);
  const peakYear = publicationYear + peakIndex;
  if (peakIndex <= 1) {
    return {
      B: 0,
      peak_year: peakYear,
      peak_citations: peakCitations,
      awakening_year: publicationYear,
      sleep_duration: 0,
      counts_by_year: filteredCounts,
    };
  }

  const firstCount = trajectory[0];
  let beauty = 0;
  let largestGap = -Infinity;
  let awakeningIndex = peakIndex;

  for (let t = 0; t <= peakIndex; t++) {
    const baseline = firstCount + ((peakCitations - firstCount) * t) / peakIndex;
    const gap = baseline - trajectory[t];
    beauty += gap / Math.max(1, baseline);
    if (t > 0 && t < peakIndex && gap > largestGap) {
      largestGap = gap;
      awakeningIndex = t;
    }
  }

  return {
    B: round(beauty, 4),
    peak_year: peakYear,
    peak_citations: peakCitations,
    awakening_year: publicationYear + awakeningIndex,
    sleep_duration: awakeningIndex,
    counts_by_year: filteredCounts,
  };
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
