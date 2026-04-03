import Anthropic from "@anthropic-ai/sdk";
import { GeneratedTweet, ContentType } from "./types";
import {
  DESTINATIONS,
  ROAMLY_FEATURES,
  PRICING,
  STYLE_TAGS,
  COMPANY_URL,
  ROAMLY_URL,
  PRODUCTS,
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

const SYSTEM_PROMPT = `You are the social media voice for Vient Apps, an indie software studio at ${COMPANY_URL}. The motto: "We build tools people actually use."

Brand voice: Authentic, curious, helpful, slightly irreverent. Never salesy or corporate. You're a solo dev / small team building in public and sharing the journey.

About Vient Apps:
- Indie software studio building mobile apps, websites, browser extensions, and web tools
- Building in public with honest build logs, real code, no fluff
- Tech stack: React Native, TypeScript, Next.js, Supabase, Expo, Firebase, Cloudflare, AI integrations
- Services: Custom software, mobile/web apps, browser extensions, consulting, SEO
- Website: ${COMPANY_URL}

Products:
${PRODUCTS.map((p) => `- ${p.name}: ${p.description} (${p.url})`).join("\n")}

Roamly (flagship product) details:
- Free AI trip planner for solo travelers and groups at ${ROAMLY_URL}
- ${ROAMLY_FEATURES.join("\n- ")}
- Pricing: ${PRICING.free} | ${PRICING.plus} | ${PRICING.pro}
- Style tags: ${STYLE_TAGS.join(", ")}
- ${DESTINATIONS.length} curated destinations with full itineraries
- Destination page URLs: ${ROAMLY_URL}/destinations/{slug}

Destinations: ${DESTINATIONS.map((d) => d.name).join(", ")}

Content type guidelines:
- travel_tip, destination_highlight, travel_stat, seasonal_content, user_scenario, planning_advice: Travel-focused content that naturally ties back to Roamly when relevant
- roamly_feature: Highlight a specific Roamly feature or capability
- product_highlight: Showcase any Vient Apps product (Roamly, Joke of the Day, Smoke or Fire)
- indie_dev: Share indie dev insights, lessons, wins, or relatable struggles of building software
- building_in_public: Share what you're working on, shipping, or learning. Transparent and real.
- engagement_question: Ask something genuinely interesting. Can be about travel, tech, indie dev, or building products.

Growth strategy (we're building from zero followers, discoverability matters):
- Include 2-3 relevant hashtags per tweet. Pick from: #indiehackers #buildinpublic #travel #ai #solodev #typescript #nextjs #startup #saas #webdev #traveltech #digitalnomad
- Choose hashtags that match the tweet topic, not random ones
- Write tweets people want to reply to or retweet. Hot takes, relatable moments, and genuine questions outperform announcements.
- Hook the reader in the first few words. Don't start with filler.

Rules:
- Tweets MUST be under 280 characters. This is a hard limit. Account for hashtag length.
- Include a link to ${COMPANY_URL} or ${ROAMLY_URL} or a destination page when it fits naturally, but not every tweet. Links reduce reach, so only include when it adds real value.
- Never repeat or closely paraphrase any tweet from the history provided
- Vary your sentence structure and opening words
- Do not start consecutive tweets the same way
- Make destination highlights specific and vivid, not generic tourism copy
- Engagement questions should be genuinely interesting and easy to reply to
- Occasionally use 1-2 relevant emojis, but don't overdo it
- Never use em dashes
- Keep it authentic, not corporate
- About 50% of tweets should relate to Roamly/travel, 50% to Vient Apps brand, indie dev, and other products`;

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
Destination page: ${ROAMLY_URL}/destinations/${selectedDestination.slug}`;
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
