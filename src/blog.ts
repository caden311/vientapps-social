import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  pubDate: string;
  tags: string[];
  draft: boolean;
  excerpt: string;
}

const BLOG_DIR =
  process.env.BLOG_DIR || join(__dirname, "..", "..", "blog", "src", "content", "blog");

function parseFrontmatter(raw: string): Record<string, string | string[] | boolean> {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const result: Record<string, string | string[] | boolean> = {};
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim();

    if (val === "true") result[key] = true;
    else if (val === "false") result[key] = false;
    else if (val.startsWith("[") && val.endsWith("]")) {
      result[key] = val
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^"|"$/g, ""));
    } else {
      result[key] = val.replace(/^"|"$/g, "");
    }
  }
  return result;
}

function extractExcerpt(raw: string, maxChars = 600): string {
  // Strip frontmatter
  const body = raw.replace(/^---[\s\S]*?---\n/, "").trim();
  // Strip MDX imports and code blocks for cleaner text
  const cleaned = body
    .replace(/^import .+$/gm, "")
    .replace(/```[\s\S]*?```/g, "[code block]")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/\*\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned.length > maxChars
    ? cleaned.slice(0, maxChars) + "..."
    : cleaned;
}

export function loadBlogPosts(): BlogPost[] {
  if (!existsSync(BLOG_DIR)) {
    console.warn(`Blog directory not found: ${BLOG_DIR}`);
    return [];
  }

  const files = readdirSync(BLOG_DIR).filter((f) => f.endsWith(".mdx") || f.endsWith(".md"));
  const posts: BlogPost[] = [];

  for (const file of files) {
    const raw = readFileSync(join(BLOG_DIR, file), "utf-8");
    const fm = parseFrontmatter(raw);

    if (fm.draft === true) continue;

    posts.push({
      slug: file.replace(/\.(mdx|md)$/, ""),
      title: (fm.title as string) || file,
      description: (fm.description as string) || "",
      pubDate: (fm.pubDate as string) || "",
      tags: (fm.tags as string[]) || [],
      draft: (fm.draft as boolean) || false,
      excerpt: extractExcerpt(raw),
    });
  }

  // Sort by pubDate descending
  return posts.sort((a, b) => (a.pubDate > b.pubDate ? -1 : 1));
}

export function formatPostsForPrompt(posts: BlogPost[]): string {
  return posts
    .map(
      (p, i) =>
        `[Post ${i + 1}] "${p.title}" (${p.pubDate})\nTags: ${p.tags.join(", ")}\nDescription: ${p.description}\nExcerpt:\n${p.excerpt}`
    )
    .join("\n\n---\n\n");
}
