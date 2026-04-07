import Anthropic from "@anthropic-ai/sdk";
import { GeneratedTweet, ContentType } from "./types";
import {
  DESTINATIONS,
  ROAMLY_FEATURES,
  PRICING,
  STYLE_TAGS,
  COMPANY_URL,
  ROAMLY_URL,
  ROAMLY_CONTENT_TYPES,
  BLOG_CONTENT_TYPES,
  CONTENT_TYPES,
  getSeason,
  getSeasonalContext,
} from "./constants";
import {
  getRecentTweets,
  getContentTypeDistribution,
  getRecentDestinations,
} from "./history";
import { loadBlogPosts, formatPostsForPrompt, BlogPost } from "./blog";

const client = new Anthropic();

function pickContentType(): ContentType {
  const dist = getContentTypeDistribution();

  // 70% chance blog, 30% chance roamly
  const useBlog = Math.random() < 0.7;
  const pool = useBlog ? BLOG_CONTENT_TYPES : ROAMLY_CONTENT_TYPES;

  const totalRecent = pool.reduce((sum, t) => sum + (dist[t] || 0), 0);

  if (totalRecent === 0) {
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Weight toward underrepresented types within the chosen bucket
  const weights = pool.map((type) => {
    const count = dist[type] || 0;
    return Math.max(1, totalRecent - count * 2);
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let rand = Math.random() * totalWeight;

  for (let i = 0; i < pool.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return pool[i];
  }
  return pool[0];
}

function pickFreshDestination(): (typeof DESTINATIONS)[0] | null {
  const recent = getRecentDestinations();
  const fresh = DESTINATIONS.filter((d) => !recent.includes(d.slug));
  const pool = fresh.length > 0 ? fresh : DESTINATIONS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickBlogPost(posts: BlogPost[], recentTweets: ReturnType<typeof getRecentTweets>): BlogPost | null {
  if (posts.length === 0) return null;

  // Extract slugs recently tweeted about to avoid repetition
  const recentlyCovered = new Set(
    recentTweets
      .filter((t) => t.blogSlug)
      .map((t) => t.blogSlug)
  );

  const fresh = posts.filter((p) => !recentlyCovered.has(p.slug));
  const pool = fresh.length > 0 ? fresh : posts;

  // Weight newer posts more heavily
  const weights = pool.map((_, i) => Math.max(1, pool.length - i));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let rand = Math.random() * totalWeight;

  for (let i = 0; i < pool.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return pool[i];
  }
  return pool[0];
}

const SYSTEM_PROMPT = `You are the social media voice for Caden Sorenson, an indie developer at ${COMPANY_URL}. The motto: "We build tools people actually use."

Brand voice: Authentic, curious, helpful, slightly irreverent. Never salesy or corporate. You're a solo dev building in public and sharing the journey — the code decisions, the weird bugs, the real lessons.

About Vient Apps:
- Indie software studio building mobile apps, websites, browser extensions, and web tools
- Building in public with honest build logs, real code, no fluff
- Tech stack: React Native, TypeScript, Next.js, Supabase, Expo, Firebase, Cloudflare, AI integrations
- Website: ${COMPANY_URL}

Products:
- Roamly: Free AI-powered group trip planner at ${ROAMLY_URL}
- Joke of the Day: Chrome extension with 4,600 installs delivering daily humor
- Smoke or Fire: React Native multiplayer card game
- SumTrails: Daily number-path puzzle game (React Native + Expo)

Roamly details (for Roamly tweets):
- ${ROAMLY_FEATURES.join("\n- ")}
- Pricing: ${PRICING.free} | ${PRICING.plus} | ${PRICING.pro}
- Style tags: ${STYLE_TAGS.join(", ")}
- ${DESTINATIONS.length} curated destinations with full itineraries
- Destination URLs: ${ROAMLY_URL}/destinations/{slug}

Content type guidelines:
- roamly_feature: Highlight a specific Roamly feature or capability. Concrete, specific, not generic.
- destination_highlight: Vivid take on a specific destination Roamly covers. Make it feel real, not tourism copy.
- blog_new_post: Drive traffic to a specific blog post. Lead with the most interesting hook from the post, not just the title.
- blog_insight: Share a specific insight, decision, or lesson from a blog post. Could be a technical choice, a failure, a surprising result.
- blog_tech: Highlight a specific technical thing discussed in a post — a library, a pattern, a trick, a problem that took too long to solve.
- blog_engagement: Ask a genuine question inspired by something from the blog. Easy to reply to. Not rhetorical.

Growth strategy (building from zero followers, discoverability matters):
- Include 2-3 relevant hashtags per tweet. Pick from: #indiehackers #buildinpublic #webdev #typescript #reactnative #nextjs #ai #solodev #saas #devlog #gamedev #chromeextension #indiedev
- Choose hashtags that match the tweet topic
- Hook the reader in the first few words. Don't start with filler.
- Hot takes, specific numbers, relatable dev moments, and genuine questions outperform announcements.

Rules:
- Tweets MUST be under 280 characters. This is a hard limit. Account for hashtag length.
- Include a link to the blog post URL (vientapps.com/blog/{slug}) for blog_new_post tweets. For others, only link when it adds real value.
- Never repeat or closely paraphrase any tweet from the history provided
- Vary your sentence structure and opening words
- Make it specific. Vague = boring. Specific = shareable.
- Occasionally use 1-2 relevant emojis, but don't overdo it
- Never use em dashes
- Keep it authentic, not corporate`;

export async function generateTweet(): Promise<GeneratedTweet> {
  const contentType = pickContentType();
  const now = new Date();
  const season = getSeason(now);
  const seasonalContext = getSeasonalContext(season);
  const recentTweets = getRecentTweets(30);
  const dist = getContentTypeDistribution();
  const blogPosts = loadBlogPosts();

  let destinationContext = "";
  let selectedDestination: (typeof DESTINATIONS)[0] | null = null;
  let selectedPost: BlogPost | null = null;

  if (contentType === "destination_highlight") {
    selectedDestination = pickFreshDestination();
    if (selectedDestination) {
      destinationContext = `Destination: ${selectedDestination.name}\nDestination page: ${ROAMLY_URL}/destinations/${selectedDestination.slug}`;
    }
  }

  const isBlogType = (BLOG_CONTENT_TYPES as ContentType[]).includes(contentType);
  if (isBlogType) {
    selectedPost = pickBlogPost(blogPosts, recentTweets);
  }

  const historyBlock =
    recentTweets.length > 0
      ? recentTweets
          .map(
            (t) =>
              `[${t.postedAt.split("T")[0]} | ${t.contentType}] ${t.content}`
          )
          .join("\n")
      : "(No tweets posted yet)";

  const distBlock = CONTENT_TYPES.map(
    (type) => `${type}: ${dist[type] || 0}`
  ).join(", ");

  let blogContext = "";
  if (selectedPost) {
    blogContext = `\nBlog post to draw from:\nTitle: "${selectedPost.title}"\nURL: https://vientapps.com/blog/${selectedPost.slug}\nPublished: ${selectedPost.pubDate}\nTags: ${selectedPost.tags.join(", ")}\nDescription: ${selectedPost.description}\n\nPost content:\n${selectedPost.excerpt}`;
  } else if (isBlogType && blogPosts.length > 0) {
    // Fallback: give all posts for context if no post was selected
    blogContext = `\nAvailable blog posts:\n${formatPostsForPrompt(blogPosts)}`;
  }

  const userPrompt = `Today is ${now.toISOString().split("T")[0]}. Season: ${season}.
Seasonal context: ${seasonalContext}

Content type to generate: ${contentType}
${destinationContext}${blogContext}

Recent tweet history (DO NOT repeat or closely paraphrase any of these):
${historyBlock}

Content types posted in last 14 days: ${distBlock}

Generate exactly one tweet. Return ONLY the tweet text, nothing else. No quotes around it.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  let tweet =
    response.content[0].type === "text" ? response.content[0].text.trim() : "";

  // Remove surrounding quotes if Claude added them
  if (
    (tweet.startsWith('"') && tweet.endsWith('"')) ||
    (tweet.startsWith("'") && tweet.endsWith("'"))
  ) {
    tweet = tweet.slice(1, -1);
  }

  // Retry if too long
  if (tweet.length > 280) {
    const retryResponse = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: userPrompt },
        { role: "assistant", content: tweet },
        {
          role: "user",
          content:
            "That tweet is over 280 characters. Rewrite it shorter. Return ONLY the tweet text.",
        },
      ],
    });

    tweet =
      retryResponse.content[0].type === "text"
        ? retryResponse.content[0].text.trim()
        : tweet;

    if (
      (tweet.startsWith('"') && tweet.endsWith('"')) ||
      (tweet.startsWith("'") && tweet.endsWith("'"))
    ) {
      tweet = tweet.slice(1, -1);
    }
  }

  // Hard truncate as final fallback
  if (tweet.length > 280) {
    const sentences = tweet.split(/(?<=[.!?])\s+/);
    let truncated = "";
    for (const sentence of sentences) {
      if ((truncated + " " + sentence).trim().length <= 280) {
        truncated = (truncated + " " + sentence).trim();
      } else {
        break;
      }
    }
    tweet = truncated || tweet.slice(0, 277) + "...";
  }

  return {
    content: tweet,
    contentType,
    destination: selectedDestination?.slug,
    blogSlug: selectedPost?.slug,
  };
}
