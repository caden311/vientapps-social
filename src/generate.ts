import Anthropic from "@anthropic-ai/sdk";
import { GeneratedTweet, ContentType, Source } from "./types";
import {
  TRAVEL_HASHTAGS,
  GUIDE_SOURCE_WEIGHT,
  CONTENT_TYPES,
  getSeason,
  getSeasonalContext,
} from "./constants";
import {
  getRecentTweets,
  getContentTypeDistribution,
  getRecentDestinations,
} from "./history";
import { loadGuides, pickFreshGuide, buildGuideContext } from "./guides";
import { loadDestinations, pickFreshDestination, buildDestinationContext } from "./destinations";

const client = new Anthropic();

const MODEL = "claude-sonnet-4-20250514";
const MAX_TWEETS = 3;
const TWEET_LIMIT = 280;
// X wraps every link to a fixed-length t.co URL, so links count as ~23 chars.
const URL_WEIGHT = 23;

function pickSource(): Source {
  return Math.random() < GUIDE_SOURCE_WEIGHT ? "guide" : "destination";
}

/** Length of a tweet as X counts it: every URL collapses to ~23 chars. */
function weightedLen(text: string): number {
  return text.replace(/https?:\/\/[^\s]+/g, "x".repeat(URL_WEIGHT)).length;
}

const SYSTEM_PROMPT = `You are a sharp, friendly travel advisor running a Twitter/X account. You share concrete, genuinely useful travel advice drawn from a library of travel guides and destination pages at travelvient.com. Think experienced traveler who actually knows the costs, the routes, the fare rules, and the local quirks, not a tourism brochure.

Your job: turn ONE guide or destination into a short thread (1 to 3 tweets) that summarizes it usefully, in the spirit of this example:

Best eSIM Apps for Nomads in 2026 📞
eSIM became essential because it lets you stay connected after landing, skip roaming fees, and manage multiple countries from one app.
We tested dozens of options and ranked them on coverage, price per GB, flexibility, and real user sentiment.
Top picks:
1. Airalo
2. Holafly
3. Saily
4. Nomad
Quick take: Airalo for global coverage, Holafly for unlimited data, Saily for budget. Which would you pick?

Voice: practical, specific, a little opinionated. Real recommendations and real numbers. You are NOT a brand mascot and never talk about software, apps, "building in public," or any company. Naming the third-party travel brands, airlines, gear, or products the guide recommends is encouraged, that is the actual advice.

Hard rules:
- Output a thread of 1 to 3 tweets. Use only as many as the content needs: a single strong tweet is fine for a simple guide, but a ranked "Top N" list usually needs 2 or 3.
- EVERY tweet must be UNDER 280 characters. A URL counts as 23 characters. This is a hard limit per tweet.
- Put 2 to 3 relevant hashtags AND the guide/destination URL on the LAST tweet only. Use the URL exactly as given.
- Pick hashtags from: ${TRAVEL_HASHTAGS.join(" ")}. Match them to the topic.
- When you reference testing or ranking, say "we tested" or "we researched". NEVER use a brand name, "@vientapps", or any @handle. List option NAMES only, never invent Twitter handles or links.
- Hook the reader in the first few words of tweet 1. Lead with a number, a surprising fact, or a strong claim.
- Make it specific. Vague = boring. Specific = shareable.
- Use 1 to 2 relevant emojis across the thread, not more.
- Never mention Roamly, Vient Apps, software, or "building in public." You are purely a travel advisor.
- Never repeat or closely paraphrase any tweet from the history provided.
- Never use em dashes.
- End the thread with a genuine, non-rhetorical engagement question.

Output format: return ONLY a JSON array of strings, one string per tweet, in order. No prose, no keys, no markdown fences. Example: ["first tweet text", "second tweet text"]`;

function layoutGuidance(contentType: ContentType): string {
  switch (contentType) {
    case "guide_listicle":
      return `Layout: ranked listicle thread (2 to 3 tweets).
- Tweet 1: a hook title with 1 emoji, then 1 or 2 short lines on why this matters, then "We tested/researched the options on <2-3 criteria>:".
- Then a numbered "Top picks:" list of the option NAMES only (no handles, no links). Condense to the top ~5 if needed so each tweet stays under 280.
- Last tweet: a short "Quick take:" with 2 to 3 best-for one-liners (Name -> best for X), then the engagement question, then 2 to 3 hashtags and the URL.`;
    case "guide_summary":
      return `Layout: key-facts summary thread (1 to 3 tweets).
- Tweet 1: a hook with 1 emoji, then the core answer in plain language.
- Optional middle tweet: 2 to 4 key facts as short lines (use -> or -).
- Last tweet: a one-line takeaway, the engagement question, then 2 to 3 hashtags and the URL.`;
    case "destination_summary":
    default:
      return `Layout: "things to know before you visit" thread (1 to 3 tweets).
- Tweet 1: a hook with 1 emoji and the vibe / why go.
- Optional middle tweet: best time to visit, a real cost number, a cultural tip, and how to get around (short lines).
- Last tweet: a one-line takeaway, the engagement question, then 2 to 3 hashtags and the URL.`;
  }
}

function parseTweetArray(raw: string): string[] | null {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(parsed)) return null;
    const tweets = parsed
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    return tweets.length ? tweets : null;
  } catch {
    return null;
  }
}

function isValidThread(tweets: string[] | null): tweets is string[] {
  return (
    !!tweets &&
    tweets.length >= 1 &&
    tweets.length <= MAX_TWEETS &&
    tweets.every((t) => weightedLen(t) <= TWEET_LIMIT)
  );
}

export async function generateTweet(slugOverride?: string): Promise<GeneratedTweet> {
  const now = new Date();
  const season = getSeason(now);
  const seasonalContext = getSeasonalContext(season);
  const recentTweets = getRecentTweets(20);
  const dist = getContentTypeDistribution();
  const recentSlugs = getRecentDestinations();

  const guides = loadGuides();
  const destinations = loadDestinations();

  // Resolve source + the specific guide/destination.
  let source: Source = pickSource();
  let slug: string | undefined;
  let contentType: ContentType;
  let context = "";

  // A --slug override (local testing) wins over the random pick.
  const overrideGuide = slugOverride
    ? guides.find((g) => g.slug === slugOverride)
    : undefined;
  const overrideDest = slugOverride
    ? destinations.find((d) => d.slug === slugOverride)
    : undefined;

  if (overrideGuide) {
    source = "guide";
  } else if (overrideDest) {
    source = "destination";
  } else {
    // Fall back if the preferred source has no content.
    if (source === "guide" && guides.length === 0 && destinations.length > 0) {
      source = "destination";
    } else if (
      source === "destination" &&
      destinations.length === 0 &&
      guides.length > 0
    ) {
      source = "guide";
    }
  }

  if (source === "guide") {
    const guide = overrideGuide || pickFreshGuide(guides, recentSlugs);
    if (!guide) throw new Error("No guides available to build a thread from.");
    slug = guide.slug;
    const built = buildGuideContext(guide);
    context = built.context;
    contentType = built.layout === "listicle" ? "guide_listicle" : "guide_summary";
  } else {
    const dest = overrideDest || pickFreshDestination(destinations, recentSlugs);
    if (!dest) throw new Error("No destinations available to build a thread from.");
    slug = dest.slug;
    context = buildDestinationContext(dest, season);
    contentType = "destination_summary";
  }

  const historyBlock =
    recentTweets.length > 0
      ? recentTweets
          .map((t) => `[${t.postedAt.split("T")[0]} | ${t.contentType}] ${t.content.split("\n")[0]}`)
          .join("\n")
      : "(No tweets posted yet)";

  const distBlock = CONTENT_TYPES.map((type) => `${type}: ${dist[type] || 0}`).join(", ");

  const userPrompt = `Today is ${now.toISOString().split("T")[0]}. Season: ${season}.
Seasonal context: ${seasonalContext}

${layoutGuidance(contentType)}

Source material:
${context}

Recent threads (DO NOT repeat or closely paraphrase any of these openers):
${historyBlock}

Layout counts in recent history: ${distBlock}

Write the thread now. Return ONLY a JSON array of tweet strings.`;

  let tweets = await requestThread(userPrompt);

  // One corrective retry if the model returned an invalid thread.
  if (!isValidThread(tweets)) {
    tweets = await requestThread(
      userPrompt,
      `Your previous reply was not a valid thread. Return ONLY a JSON array of 1 to ${MAX_TWEETS} strings, each UNDER 280 characters (URLs count as 23). Put the hashtags and the URL on the last string.`,
      tweets ? JSON.stringify(tweets) : "(no parseable output)"
    );
  }

  // Final fallback: keep only the tweets that fit, capped at MAX_TWEETS.
  if (!isValidThread(tweets)) {
    const safe = (tweets || [])
      .filter((t) => weightedLen(t) <= TWEET_LIMIT)
      .slice(0, MAX_TWEETS);
    tweets = safe.length ? safe : [(tweets?.[0] || "").slice(0, 277).trim() + "..."];
  }

  return { tweets, contentType, source, slug };
}

async function requestThread(
  userPrompt: string,
  correction?: string,
  priorReply?: string
): Promise<string[] | null> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];
  if (correction && priorReply) {
    messages.push({ role: "assistant", content: priorReply });
    messages.push({ role: "user", content: correction });
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages,
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return parseTweetArray(text);
}
