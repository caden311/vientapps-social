import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import { DEV_SITE_URL } from "./constants";

export interface PostFaq {
  question: string;
  answer: string;
}

export interface Post {
  slug: string;
  title: string;
  description: string;
  pubDate: string;
  quickAnswer: string;
  quickAnswerBullets?: string[];
  faqs: PostFaq[];
  tags: string[];
}

const POSTS_DIR =
  process.env.POSTS_DIR ||
  join(__dirname, "..", "..", "vient", "src", "content", "blog");

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

export function loadPosts(): Post[] {
  if (!existsSync(POSTS_DIR)) {
    console.warn(`Posts directory not found: ${POSTS_DIR}`);
    return [];
  }

  const files = readdirSync(POSTS_DIR).filter(
    (f) => f.endsWith(".mdx") || f.endsWith(".md")
  );
  const posts: Post[] = [];

  for (const file of files) {
    const raw = readFileSync(join(POSTS_DIR, file), "utf-8");
    const fm = extractFrontmatter(raw);

    if (fm.draft === true) continue;
    // Need a quick answer to build a standalone insight from.
    if (!fm.quickAnswer) continue;

    posts.push({
      slug: file.replace(/\.(mdx|md)$/, ""),
      title: (fm.title as string) || file,
      description: (fm.description as string) || "",
      pubDate: (fm.pubDate as string) || "",
      quickAnswer: fm.quickAnswer as string,
      quickAnswerBullets: fm.quickAnswerBullets as string[] | undefined,
      faqs: (fm.faqs as PostFaq[]) || [],
      tags: (fm.tags as string[]) || [],
    });
  }

  return posts.sort((a, b) => (a.slug < b.slug ? -1 : 1));
}

export function pickFreshPost(posts: Post[], recentSlugs: string[]): Post | null {
  if (posts.length === 0) return null;
  const fresh = posts.filter((p) => !recentSlugs.includes(p.slug));
  const pool = fresh.length > 0 ? fresh : posts;
  return pool[Math.floor(Math.random() * pool.length)];
}

export interface PostContext {
  context: string;
  url: string;
}

/**
 * Builds the context a standalone build-in-public tweet is written from: the
 * post's title, its quick answer (the tweet-grade summary), the key-fact
 * bullets, and a couple of FAQs for extra concrete specifics.
 */
export function buildPostContext(post: Post): PostContext {
  const url = `${DEV_SITE_URL}/blog/${post.slug}`;
  const lines: string[] = [
    `Topic: ${post.title}`,
    `Post URL: ${url}`,
    `Quick answer: ${truncate(post.quickAnswer, 700)}`,
  ];

  if (post.quickAnswerBullets && post.quickAnswerBullets.length) {
    lines.push(`Key points:\n- ${post.quickAnswerBullets.join("\n- ")}`);
  }

  if (post.faqs.length) {
    const faqs = post.faqs
      .slice(0, 3)
      .map((f) => `Q: ${f.question}\nA: ${truncate(f.answer, 320)}`)
      .join("\n\n");
    lines.push(`Relevant FAQs:\n${faqs}`);
  }

  return { context: lines.join("\n\n"), url };
}
