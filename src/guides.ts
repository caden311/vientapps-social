import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
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

export interface RelatedProduct {
  name: string;
  url?: string;
  description?: string;
  rating?: number;
  position?: number;
}

export interface Guide {
  slug: string;
  title: string;
  description: string;
  quickAnswer: string;
  quickAnswerBullets?: string[];
  relatedProducts?: RelatedProduct[];
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
    // Need at least a quick answer to build a thread from.
    if (!fm.quickAnswer) continue;

    const products = (fm.relatedProducts as RelatedProduct[] | undefined)
      ?.slice()
      .sort((a, b) => (a.position ?? 99) - (b.position ?? 99));

    guides.push({
      slug: file.replace(/\.(mdx|md)$/, ""),
      title: (fm.title as string) || file,
      description: (fm.description as string) || "",
      quickAnswer: fm.quickAnswer as string,
      quickAnswerBullets: fm.quickAnswerBullets as string[] | undefined,
      relatedProducts: products,
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

export type GuideLayout = "listicle" | "summary";

export interface GuideContext {
  layout: GuideLayout;
  context: string;
  url: string;
  /** Ranked option names (listicles only), used to build a deterministic
   * fallback thread if the model fails to produce a valid one. */
  options: string[];
}

/**
 * Builds the full context a guide thread is written from. Guides with a ranked
 * product list become a "Top N" listicle; the rest become a key-facts summary.
 */
export function buildGuideContext(guide: Guide): GuideContext {
  const url = `${SITE_URL}/guides/${guide.slug}`;
  const lines: string[] = [
    `Topic: ${guide.title}`,
    `Guide URL: ${url}`,
    `Quick answer: ${truncate(guide.quickAnswer, 700)}`,
  ];

  const hasProducts = !!(guide.relatedProducts && guide.relatedProducts.length);

  if (hasProducts) {
    const ranked = guide.relatedProducts!
      .slice(0, 8)
      .map((p, i) => {
        const rating = p.rating ? ` (rated ${p.rating})` : "";
        const desc = p.description ? `: ${truncate(p.description, 160)}` : "";
        return `${p.position ?? i + 1}. ${p.name}${rating}${desc}`;
      })
      .join("\n");
    lines.push(
      `Ranked options (${guide.relatedProducts!.length} total, names only, NO @handles):\n${ranked}`
    );
  }

  if (guide.quickAnswerBullets && guide.quickAnswerBullets.length) {
    lines.push(`Key facts:\n- ${guide.quickAnswerBullets.join("\n- ")}`);
  }

  if (guide.faqs.length) {
    const faqs = guide.faqs
      .slice(0, 3)
      .map((f) => `Q: ${f.question}\nA: ${truncate(f.answer, 320)}`)
      .join("\n\n");
    lines.push(`Relevant FAQs:\n${faqs}`);
  }

  return {
    layout: hasProducts ? "listicle" : "summary",
    context: lines.join("\n\n"),
    url,
    options: hasProducts
      ? guide.relatedProducts!.slice(0, 5).map((p) => p.name)
      : [],
  };
}
