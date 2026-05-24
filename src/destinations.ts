import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { ContentType } from "./types";
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

/** Returns only the slice of a destination guide relevant to the content type. */
export function extractDestinationSlice(
  dest: Destination,
  contentType: ContentType,
  season?: string
): string {
  const header = `Destination: ${dest.destination}\nGuide URL: ${SITE_URL}/destinations/${dest.slug}`;

  switch (contentType) {
    case "destination_budget": {
      const c = dest.typicalCosts;
      const perDay = `Per day (USD): budget $${c.budgetPerDayUsd ?? "?"}, midrange $${c.midrangePerDayUsd ?? "?"}, luxury $${c.luxuryPerDayUsd ?? "?"}`;
      const rows = (c.breakdown || [])
        .slice(0, 3)
        .map((b) => `${b.category}: budget ${b.budgetUsd} / mid ${b.midrangeUsd} / luxury ${b.luxuryUsd}`)
        .join("\n");
      return `${header}\n\n${perDay}\nNotes: ${truncate(c.costNotes, 300)}\n${rows}`;
    }
    case "destination_best_time": {
      const b = dest.bestTimeToVisit;
      const match =
        (season && dest.seasons?.find((s) => s.season?.toLowerCase() === season.toLowerCase())) ||
        dest.seasons?.[0];
      const seasonBlock = match
        ? `\nCurrent season (${match.label}, ${match.months}): ${match.tempRangeF}, crowds ${match.crowdLevel}. Events: ${(match.notableEvents || []).slice(0, 2).join("; ")}`
        : "";
      return `${header}\n\nRecommended: ${b.recommended}\nPeak: ${b.peakSeason}\nBudget season: ${b.budgetSeason}${b.avoidPeriod ? `\nAvoid: ${b.avoidPeriod} (${b.avoidReason || ""})` : ""}${seasonBlock}`;
    }
    case "destination_culture": {
      const tips = (dest.culturalTips || []).slice();
      const chosen: string[] = [];
      while (chosen.length < 2 && tips.length > 0) {
        chosen.push(tips.splice(Math.floor(Math.random() * tips.length), 1)[0]);
      }
      return `${header}\n\nCultural tips:\n- ${chosen.join("\n- ")}\nTipping: ${truncate(dest.essentials?.tippingNorms || "", 200)}`;
    }
    case "destination_logistics": {
      const angle = pick(["transport", "neighborhood", "essentials"]);
      if (angle === "transport" && dest.gettingAround) {
        const opts = (dest.gettingAround.options || [])
          .filter((o) => o.recommended)
          .slice(0, 2)
          .map((o) => `${o.name} (${o.costIndicator}): ${o.tip || o.description}`)
          .join("\n");
        return `${header}\n\nGetting around: ${truncate(dest.gettingAround.overview, 250)}\n${opts}`;
      }
      if (angle === "neighborhood" && dest.neighborhoods?.length) {
        const stay = dest.neighborhoods.filter((n) => n.stayHere);
        const n = pick(stay.length ? stay : dest.neighborhoods);
        return `${header}\n\nNeighborhood: ${n.name} (${n.vibeTag}). Best for: ${(n.bestFor || []).join(", ")}.\n${truncate(n.description, 250)}`;
      }
      const e = dest.essentials;
      return `${header}\n\nEssentials: visa — ${truncate(e?.visaSummary || "", 200)}\nTap water safe: ${e?.tapWaterSafe}. Emergency: ${e?.emergencyNumber}. Drives on the ${e?.drivingSide}.`;
    }
    case "destination_engagement": {
      const tip = dest.culturalTips?.length ? pick(dest.culturalTips) : "";
      return `${header}\n\nQuick answer: ${truncate(dest.quickAnswer, 300)}\nCost notes: ${truncate(dest.typicalCosts?.costNotes || "", 200)}${tip ? `\nCultural note: ${tip}` : ""}`;
    }
    case "destination_spotlight":
    default: {
      const firstPara = (dest.overview || "").split(/\n\n+/)[0];
      return `${header}\n\nOverview: ${truncate(firstPara, 500)}\nQuick answer: ${truncate(dest.quickAnswer, 300)}`;
    }
  }
}
