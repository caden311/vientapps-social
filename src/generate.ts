import Anthropic from "@anthropic-ai/sdk";
import { GeneratedTweet, ContentType } from "./types";
import {
  DESTINATIONS,
  FEATURES,
  PRICING,
  STYLE_TAGS,
  SITE_URL,
  CONTENT_TYPES,
  getSeason,
  getSeasonalContext,
} from "./constants";
import {
  getRecentTweets,
  getContentTypeDistribution,
  getRecentDestinations,
} from "./history";

const client = new Anthropic();

function pickContentType(): ContentType {
  const dist = getContentTypeDistribution();
  const totalRecent = Object.values(dist).reduce((a, b) => a + b, 0);

  if (totalRecent === 0) {
    return CONTENT_TYPES[Math.floor(Math.random() * CONTENT_TYPES.length)];
  }

  // Weight toward underrepresented types
  const weights = CONTENT_TYPES.map((type) => {
    const count = dist[type] || 0;
    return Math.max(1, totalRecent - count * 2);
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let rand = Math.random() * totalWeight;

  for (let i = 0; i < CONTENT_TYPES.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return CONTENT_TYPES[i];
  }
  return CONTENT_TYPES[0];
}

function pickFreshDestination(): (typeof DESTINATIONS)[0] | null {
  const recent = getRecentDestinations();
  const fresh = DESTINATIONS.filter((d) => !recent.includes(d.slug));
  const pool = fresh.length > 0 ? fresh : DESTINATIONS;
  return pool[Math.floor(Math.random() * pool.length)];
}

const SYSTEM_PROMPT = `You are the social media voice for Roamly, a free AI-powered trip planner at ${SITE_URL}.

Brand voice: Friendly, adventurous, helpful, concise. Never salesy or pushy. Casual but smart.

About Roamly:
- Free AI trip planner for solo travelers and groups
- ${FEATURES.join("\n- ")}
- Pricing: ${PRICING.free} | ${PRICING.plus} | ${PRICING.pro}
- Style tags travelers can choose: ${STYLE_TAGS.join(", ")}
- ${DESTINATIONS.length} curated destinations with full itineraries

Destinations: ${DESTINATIONS.map((d) => d.name).join(", ")}

Rules:
- Tweets MUST be under 280 characters. This is a hard limit.
- Include a link to ${SITE_URL} or a destination page when it fits naturally, but not every tweet
- Destination page URLs follow this pattern: ${SITE_URL}/destinations/{slug}
- Never repeat or closely paraphrase any tweet from the history provided
- Use 0-2 hashtags max, only well-known ones like #travel
- Vary your sentence structure and opening words
- Do not start consecutive tweets the same way
- Make destination highlights specific and vivid, not generic tourism copy
- Engagement questions should be genuinely interesting and easy to reply to
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

  let destinationContext = "";
  let selectedDestination: (typeof DESTINATIONS)[0] | null = null;

  if (contentType === "destination_highlight") {
    selectedDestination = pickFreshDestination();
    if (selectedDestination) {
      destinationContext = `Suggested destination: ${selectedDestination.name}
Destination page: ${SITE_URL}/destinations/${selectedDestination.slug}`;
    }
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

  const userPrompt = `Today is ${now.toISOString().split("T")[0]}. Season: ${season}.
Seasonal context: ${seasonalContext}

Content type to generate: ${contentType}
${destinationContext}

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
  };
}
