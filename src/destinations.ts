import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { SITE_URL } from "./constants";

// Loose interface — only the fields the bot consumes. The real JSON has more.
export interface Destination {
  slug: string;
  destination: string;
  city: string;
  country: string;
  overview: string;
  quickAnswer: string;
  essentials: {
    currency: string;
    language: string[];
    visaSummary: string;
    tapWaterSafe: boolean;
    emergencyNumber: string;
    tippingNorms: string;
    drivingSide: string;
  };
  bestTimeToVisit: {
    recommended: string;
    peakSeason: string;
    budgetSeason: string;
    weatherSummary: string;
    avoidPeriod?: string;
    avoidReason?: string;
  };
  seasons: {
    season: string;
    label: string;
    months: string;
    tempRangeF: string;
    crowdLevel: string;
    notableEvents: string[];
  }[];
  gettingAround: {
    overview: string;
    options: {
      name: string;
      description: string;
      costIndicator: string;
      tip?: string;
      recommended: boolean;
    }[];
  };
  typicalCosts: {
    budgetPerDayUsd: number | null;
    midrangePerDayUsd: number | null;
    luxuryPerDayUsd: number | null;
    costNotes: string;
    breakdown: {
      category: string;
      budgetUsd: string;
      midrangeUsd: string;
      luxuryUsd: string;
      notes?: string;
    }[];
  };
  culturalTips: string[];
  neighborhoods: {
    name: string;
    description: string;
    bestFor: string[];
    stayHere: boolean;
    vibeTag: string;
  }[];
  faqs: { question: string; answer: string }[];
}

const DESTINATIONS_DIR =
  process.env.DESTINATIONS_DIR ||
  join(__dirname, "..", "..", "blog", "src", "data", "destinations");

function truncate(text: string, maxChars: number): string {
  const clean = (text || "").trim();
  return clean.length > maxChars ? clean.slice(0, maxChars).trim() + "..." : clean;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function loadDestinations(): Destination[] {
  if (!existsSync(DESTINATIONS_DIR)) {
    console.warn(`Destinations directory not found: ${DESTINATIONS_DIR}`);
    return [];
  }

  const files = readdirSync(DESTINATIONS_DIR).filter((f) => f.endsWith(".json"));
  const destinations: Destination[] = [];

  for (const file of files) {
    try {
      const raw = readFileSync(join(DESTINATIONS_DIR, file), "utf-8");
      destinations.push(JSON.parse(raw) as Destination);
    } catch {
      // Skip anything that isn't a valid destination JSON (e.g. index files).
    }
  }

  return destinations.sort((a, b) => (a.slug < b.slug ? -1 : 1));
}

export function pickFreshDestination(
  destinations: Destination[],
  recentSlugs: string[]
): Destination | null {
  if (destinations.length === 0) return null;
  const fresh = destinations.filter((d) => !recentSlugs.includes(d.slug));
  const pool = fresh.length > 0 ? fresh : destinations;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Builds the full context a destination thread is written from: a season-aware
 * "things to know before you visit" brief covering the vibe, best time, a real
 * cost figure, a cultural tip, and how to get around.
 */
export function buildDestinationContext(
  dest: Destination,
  season?: string
): { context: string; url: string } {
  const url = `${SITE_URL}/destinations/${dest.slug}`;
  const lines: string[] = [
    `Destination: ${dest.destination} (${dest.city}, ${dest.country})`,
    `Guide URL: ${url}`,
  ];

  const firstPara = (dest.overview || "").split(/\n\n+/)[0];
  lines.push(`Overview: ${truncate(firstPara || dest.quickAnswer, 450)}`);

  // Best time, biased to the current season when we have a match.
  const b = dest.bestTimeToVisit;
  if (b) {
    const match =
      (season &&
        dest.seasons?.find(
          (s) => s.season?.toLowerCase() === season.toLowerCase()
        )) ||
      dest.seasons?.[0];
    const seasonBlock = match
      ? ` Current season (${match.label}, ${match.months}): ${match.tempRangeF}, crowds ${match.crowdLevel}.${(match.notableEvents || []).length ? ` Events: ${(match.notableEvents || []).slice(0, 2).join("; ")}.` : ""}`
      : "";
    lines.push(
      `Best time: recommended ${b.recommended}; peak ${b.peakSeason}; cheapest ${b.budgetSeason}.${b.avoidPeriod ? ` Avoid ${b.avoidPeriod} (${b.avoidReason || ""}).` : ""}${seasonBlock}`
    );
  }

  // A concrete cost figure.
  const c = dest.typicalCosts;
  if (c) {
    lines.push(
      `Typical cost per day (USD): budget $${c.budgetPerDayUsd ?? "?"}, midrange $${c.midrangePerDayUsd ?? "?"}, luxury $${c.luxuryPerDayUsd ?? "?"}. ${truncate(c.costNotes || "", 220)}`
    );
  }

  // One cultural tip.
  if (dest.culturalTips?.length) {
    lines.push(`Cultural tip: ${pick(dest.culturalTips)}`);
  }

  // One recommended way to get around.
  if (dest.gettingAround?.options?.length) {
    const opts = dest.gettingAround.options.filter((o) => o.recommended);
    const o = pick(opts.length ? opts : dest.gettingAround.options);
    lines.push(`Getting around: ${o.name} (${o.costIndicator}): ${o.tip || o.description}`);
  }

  // One essential fact.
  const e = dest.essentials;
  if (e) {
    lines.push(
      `Essentials: ${e.currency}; tap water ${e.tapWaterSafe ? "safe" : "not safe"}; visa: ${truncate(e.visaSummary || "", 160)}`
    );
  }

  return { context: lines.join("\n\n"), url };
}
