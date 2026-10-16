// Timeline geometry, entries, and plate shapes

export interface TimelineEntry {
  year: number;
  frame: "centre" | "side";
  align?: "left" | "right";
  copy?: string;
  lead?: string;
  copyWidth?: number;
  alt: string;
  image: string;
}

export const TIMELINE_ENTRIES: readonly TimelineEntry[] = [
  {
    year: 2012,
    frame: "centre",
    lead: "The first kart.",
    copy: "At six, Kimi discovered karting — turning a childhood curiosity into something of his own.",
    copyWidth: 228,
    alt: "Kimi in kart overalls in the paddock, aged six",
    image: "https://storage.getlayers.ai/assets/kimi-04a9449ab2/timeline/2012.webp",
  },
  {
    year: 2015,
    frame: "side",
    align: "right",
    alt: "Kimi holding a karting trophy at sunset",
    image: "https://storage.getlayers.ai/assets/kimi-04a9449ab2/timeline/2015.webp",
  },
  {
    year: 2019,
    frame: "centre",
    lead: "Finding his people.",
    copy: "Kimi joined the Mercedes Junior Programme, marking his first major step into professional motorsport.",
    copyWidth: 272,
    alt: "Kimi signing with the Mercedes junior team",
    image: "https://storage.getlayers.ai/assets/kimi-04a9449ab2/timeline/2019.webp",
  },
  {
    year: 2021,
    frame: "side",
    align: "left",
    alt: "Kimi beside a single-seater in the garage",
    image: "https://storage.getlayers.ai/assets/kimi-04a9449ab2/timeline/2021.webp",
  },
  {
    year: 2024,
    frame: "centre",
    lead: "The year everything changed.",
    copy: "Formula 2 brought Kimi closer to F1, while Mercedes confirmed him as their future race driver.",
    copyWidth: 278,
    alt: "Kimi walking the pit lane in Mercedes kit",
    image: "https://storage.getlayers.ai/assets/kimi-04a9449ab2/timeline/2024.webp",
  },
  {
    year: 2025,
    frame: "side",
    align: "right",
    alt: "Kimi in the Mercedes garage",
    image: "https://storage.getlayers.ai/assets/kimi-04a9449ab2/timeline/2025.webp",
  },
  {
    year: 2026,
    frame: "centre",
    lead: "From karts to f1.",
    copy: "Kimi is now racing at the highest level, with Bologna still his anchor — family, home and life beyond racing.",
    copyWidth: 284,
    alt: "The Mercedes-AMG F1 car on track",
    image: "https://storage.getlayers.ai/assets/kimi-04a9449ab2/timeline/2026.webp",
  },
];

export const ROW_HEIGHT = { side: 217, centre: 462 } as const;
export const PLATE_WIDTH = { side: 333, centre: 710 } as const;
export const TOP_PAD = 169;
export const MARK_RISE = 50;
export const RAIL_START = 0;

export const railHeight = (entries: readonly TimelineEntry[]) =>
  TOP_PAD +
  entries.reduce((total, entry) => total + ROW_HEIGHT[entry.frame], 0) -
  RAIL_START;

export const restingPoint = (entries: readonly TimelineEntry[]) => {
  const heights = entries.map((entry) => ROW_HEIGHT[entry.frame]);
  const lastTop =
    TOP_PAD + heights.slice(0, -1).reduce((total, height) => total + height, 0);
  const rest = lastTop + heights[heights.length - 1] / 2 - MARK_RISE;
  return (rest - RAIL_START) / railHeight(entries);
};

export const PLATE_OUTLINE =
  "M13.6168 0.497469H697.378C700.858 0.497469 704.195 1.38786 706.655 2.97277C709.115 4.55769 710.498 6.70729 710.498 8.94869V411.208C710.498 413.449 709.115 415.599 706.655 417.183C704.195 418.768 700.858 419.659 697.378 419.659H460.249C454.073 419.659 447.976 420.555 442.411 422.281C436.847 424.008 431.958 426.519 428.107 429.63L399.246 452.95C395.559 455.928 390.878 458.333 385.55 459.986C380.223 461.639 374.385 462.497 368.472 462.497H13.6168C10.1373 462.497 6.80038 461.607 4.34003 460.022C1.87968 458.437 0.497469 456.288 0.497469 454.046V8.94869C0.497469 6.70729 1.87968 4.55769 4.34003 2.97277C6.80038 1.38786 10.1373 0.497469 13.6168 0.497469Z";
