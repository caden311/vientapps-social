import Anthropic from "@anthropic-ai/sdk";
import { GeneratedTweet, ContentType, Source } from "./types";
import {
  TRAVEL_HASHTAGS,
  GUIDE_SOURCE_WEIGHT,
  GUIDE_CONTENT_TYPES,
  DESTINATION_CONTENT_TYPES,
  CONTENT_TYPES,
  getSeason,
  getSeasonalContext,
} from "./constants";
import {
  getRecentTweets,
  getContentTypeDistribution,
  getRecentDestinations,
} from "./history";
import { loadGuides, pickFreshGuide, extractGuideSlice } from "./guides";
import {
  loadDestinations,
  pickFreshDestination,
  extractDestinationSlice,
} from "./destinations";

const client = new Anthropic();

function pickSource(): Source {
  return Math.random() < GUIDE_SOURCE_WEIGHT ? "guide" : "destination";
}

function pickContentType(pool: ContentType[]): ContentType {
  const dist = getContentTypeDistribution();
  const totalRecent = pool.reduce((sum, t) => sum + (dist[t] || 0), 0);

  if (totalRecent === 0) {
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Weight toward underrepresented types within the chosen pool.
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

const SYSTEM_PROMPT = `You are a sharp, friendly travel advisor running a Twitter/X account. You share concrete, genuinely useful travel advice drawn from a library of travel guides and destination pages at travelvient.com. Think experienced traveler who actually knows the costs, the routes, the fare rules, and the local quirks, not a tourism brochure.

Voice: practical, specific, a little opinionated. You give real recommendations and real numbers. You are NOT a brand mascot and you never talk about software, apps, "building in public," or any company. Naming third-party travel brands, airlines, cruise lines, gear, or products when the guide recommends them is encouraged, that is the actual advice.

Content type guidelines:
- guide_quick_answer: Distill the guide's quick answer into one punchy, specific tip the reader can use today.
- guide_bullet_fact: Surface one striking fact, number, or rule from the guide (e.g. a fee, a size limit, a fare difference).
- guide_faq: Answer one real traveler question crisply and specifically. The question can be implicit.
- guide_engagement: Ask a pointed, non-rhetorical question seeded with a specific detail from the guide so people reply with their own take.
- destination_spotlight: Give one vivid, specific reason this place is worth a trip. A concrete detail, not generic copy.
- destination_budget: Lead with a real dollar figure or price gap, then one money-saving move.
- destination_best_time: Name the best or worst window with a why (weather, crowds, an event), and make it timely to the season.
- destination_culture: Share one non-obvious local custom or faux-pas to avoid, framed as practical respect.
- destination_logistics: Give one practical hack: transport, where to stay, or a visa/water/safety fact.
- destination_engagement: Ask a pointed question seeded with a specific detail about the destination.

Growth strategy (discoverability matters):
- Include 2-3 relevant hashtags per tweet. Pick from: ${TRAVEL_HASHTAGS.join(" ")}
- Choose hashtags that match the tweet topic and destination.
- Hook the reader in the first few words. No filler openings.
- Specific numbers, surprising facts, strong recommendations, and genuine questions outperform vague tips.

Rules:
- Tweets MUST be under 280 characters. This is a hard limit. Account for hashtag and URL length.
- Only include the guide URL when instructed to, and use it exactly as given.
- Never mention Roamly, Vient Apps, software, or "building in public." You are purely a travel advisor.
- Never repeat or closely paraphrase any tweet from the history provided.
- Vary your sentence structure and opening words.
- Make it specific. Vague = boring. Specific = shareable.
- Occasionally use 1-2 relevant emojis, but don't overdo it.
- Never use em dashes.
- Keep it authentic and useful, never salesy or corporate.`;

export async function generateTweet(): Promise<GeneratedTweet> {
  const now = new Date();
  const season = getSeason(now);
  const seasonalContext = getSeasonalContext(season);
  const recentTweets = getRecentTweets(30);
  const dist = getContentTypeDistribution();
  const recentSlugs = getRecentDestinations();

  const guides = loadGuides();
  const destinations = loadDestinations();

  // Choose source, falling back if the preferred one has no content.
  let source = pickSource();
  if (source === "guide" && guides.length === 0 && destinations.length > 0) {
    source = "destination";
  } else if (
    source === "destination" &&
    destinations.length === 0 &&
    guides.length > 0
  ) {
    source = "guide";
  }

  const pool =
    source === "guide" ? GUIDE_CONTENT_TYPES : DESTINATION_CONTENT_TYPES;
  const contentType = pickContentType(pool);

  let slug: string | undefined;
  let sliceContext = "";

  if (source === "guide") {
    const guide = pickFreshGuide(guides, recentSlugs);
    if (guide) {
      slug = guide.slug;
      sliceContext = extractGuideSlice(guide, contentType);
    }
  } else {
    const dest = pickFreshDestination(destinations, recentSlugs);
    if (dest) {
      slug = dest.slug;
      sliceContext = extractDestinationSlice(dest, contentType, season);
    }
  }

  const includeLink = Math.random() < 0.5 && !!slug;
  const linkInstruction = includeLink
    ? "Include the guide URL above in the tweet (it adds value here)."
    : "Do not include any URL in this tweet.";

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
${sliceContext}

${linkInstruction}

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
    source,
    slug,
  };
}
