import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import { ContentType } from "./types";
import { SITE_URL } from "./constants";

export interface GuideFaq {
  question: string;
  answer: string;
}

export interface GuideHowToStep {
  name: string;
  text: string;
  url?: string;
}

export interface Guide {
  slug: string;
  title: string;
  description: string;
  quickAnswer: string;
  quickAnswerBullets?: string[];
  faqs: GuideFaq[];
  howToSteps?: GuideHowToStep[];
  tags: string[];
  category: string;
}

const GUIDES_DIR =
  process.env.GUIDES_DIR ||
  join(__dirname, "..", "..", "blog", "src", "content", "guides");

function truncate(text: string, maxChars: number): string {
  const clean = (text || "").trim();
  return clean.length > maxChars ? clean.slice(0, maxChars).trim() + "..." : clean;
}

function extractFrontmatter(raw: string): Record<string, unknown> {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  try {
    return (parseYaml(match[1]) as Record<string, unknown>) || {};
  } catch {
    return {};
  }
}

export function loadGuides(): Guide[] {
  if (!existsSync(GUIDES_DIR)) {
    console.warn(`Guides directory not found: ${GUIDES_DIR}`);
    return [];
  }

  const files = readdirSync(GUIDES_DIR).filter(
    (f) => f.endsWith(".mdx") || f.endsWith(".md")
  );
  const guides: Guide[] = [];

  for (const file of files) {
    const raw = readFileSync(join(GUIDES_DIR, file), "utf-8");
    const fm = extractFrontmatter(raw);

    if (fm.draft === true) continue;
    // This is a travel bot, so skip the occasional non-travel guide.
    if (fm.category && fm.category !== "travel") continue;
    // Need at least a quick answer to build a tweet from.
    if (!fm.quickAnswer) continue;

    guides.push({
      slug: file.replace(/\.(mdx|md)$/, ""),
      title: (fm.title as string) || file,
      description: (fm.description as string) || "",
      quickAnswer: fm.quickAnswer as string,
      quickAnswerBullets: fm.quickAnswerBullets as string[] | undefined,
      faqs: (fm.faqs as GuideFaq[]) || [],
      howToSteps: fm.howToSteps as GuideHowToStep[] | undefined,
      tags: (fm.tags as string[]) || [],
      category: (fm.category as string) || "travel",
    });
  }

  return guides.sort((a, b) => (a.slug < b.slug ? -1 : 1));
}

export function pickFreshGuide(
  guides: Guide[],
  recentSlugs: string[]
): Guide | null {
  if (guides.length === 0) return null;
  const fresh = guides.filter((g) => !recentSlugs.includes(g.slug));
  const pool = fresh.length > 0 ? fresh : guides;
  return pool[Math.floor(Math.random() * pool.length)];
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Returns only the slice of a guide relevant to the chosen content type. */
export function extractGuideSlice(guide: Guide, contentType: ContentType): string {
  const header = `Topic: ${guide.title}\nGuide URL: ${SITE_URL}/guides/${guide.slug}`;

  switch (contentType) {
    case "guide_bullet_fact": {
      if (guide.quickAnswerBullets && guide.quickAnswerBullets.length > 0) {
        return `${header}\n\nKey facts:\n- ${guide.quickAnswerBullets.join("\n- ")}`;
      }
      return `${header}\n\nQuick answer: ${truncate(guide.quickAnswer, 600)}`;
    }
    case "guide_faq": {
      if (guide.faqs.length > 0) {
        const faq = pick(guide.faqs);
        return `${header}\n\nQuestion: ${faq.question}\nAnswer: ${truncate(faq.answer, 500)}`;
      }
      return `${header}\n\nQuick answer: ${truncate(guide.quickAnswer, 600)}`;
    }
    case "guide_engagement": {
      return `${header}\n\nWhat this guide covers: ${guide.description}\nQuick answer: ${truncate(guide.quickAnswer, 400)}`;
    }
    case "guide_quick_answer":
    default:
      return `${header}\n\nQuick answer: ${truncate(guide.quickAnswer, 600)}`;
  }
}
