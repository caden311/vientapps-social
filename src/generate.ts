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

Your job: turn ONE guide or destination into a SINGLE concise tweet that summarizes it usefully and points the reader to the full guide for more, in the spirit of this example:

Best eSIM apps for nomads in 2026 📞
We tested dozens on price, coverage & flexibility. Top 3: Airalo, Holafly, Saily.
Full ranked list 👉 https://travelvient.com/guides/esim-apps-nomads
#travel #digitalnomad

Voice: practical, specific, a little opinionated. Real recommendations and real numbers. You are NOT a brand mascot and never talk about software, apps, "building in public," or any company. Naming the third-party travel brands, airlines, gear, or products the guide recommends is encouraged, that is the actual advice.

Hard rules:
- Output EXACTLY ONE tweet. Not a thread.
- The tweet must be UNDER 280 characters. A URL counts as 23 characters. This is a hard limit.
- Hook the reader in the first few words. Lead with a number, a surprising fact, or a strong claim, then summarize the guide in plain language.
- Always end with a short "full guide" call to action and the URL given, exactly as given, then 2 to 3 relevant hashtags. Do NOT end with an engagement question.
- Pick hashtags from: ${TRAVEL_HASHTAGS.join(" ")}. Match them to the topic.
- When you reference testing or ranking, say "we tested" or "we researched". NEVER use a brand name, "@vientapps", or any @handle. List option NAMES only, never invent Twitter handles or links.
- Make it specific. Vague = boring. Specific = shareable.
- Use at most 1 relevant emoji.
- Never mention Roamly, Vient Apps, software, or "building in public." You are purely a travel advisor.
- Never repeat or closely paraphrase any tweet from the history provided.
- Never use em dashes.

Output format: return ONLY the tweet text. No quotes, no JSON, no markdown fences, no preamble.`;

function layoutGuidance(contentType: ContentType): string {
  switch (contentType) {
    case "guide_listicle":
      return `Layout: ranked-list summary.
- Open with a hook title and 1 emoji.
- One short line on what was compared (e.g. "We tested dozens on price, coverage & flexibility.").
- Tease the top 2 or 3 option NAMES inline (e.g. "Top 3: Airalo, Holafly, Saily.") so readers get a taste of the answer.
- Close with "Full ranked list 👉 <url>" and 2 to 3 hashtags.`;
    case "guide_summary":
      return `Layout: key-facts summary.
- Open with a hook and 1 emoji.
- Give the core answer in one or two plain-language lines.
- Close with "Full guide 👉 <url>" and 2 to 3 hashtags.`;
    case "destination_summary":
    default:
      return `Layout: "things to know before you visit" summary.
- Open with a hook and 1 emoji, capturing the vibe / why go.
- Include one concrete fact: a real cost number or the best time to visit.
- Close with "Full guide 👉 <url>" and 2 to 3 hashtags.`;
  }
}

/** Strips surrounding quotes, markdown fences, and whitespace from the model's reply. */
function cleanTweet(raw: string): string {
  let text = raw.trim();
  // Remove a wrapping markdown code fence if the model added one.
  text = text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();
  // Strip a single pair of wrapping quotes.
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

function isValidTweet(text: string, url: string): boolean {
  return text.length > 0 && weightedLen(text) <= TWEET_LIMIT && text.includes(url);
}

/**
 * Last-resort deterministic single tweet, used only when the model repeatedly
 * fails to return a valid one. For a ranked listicle we rebuild a clean tweet
 * from the guide's own option names; otherwise we trim the model's text and
 * guarantee the CTA link and hashtags land on the end.
 */
function buildTweetFallback(
  modelText: string,
  contentType: ContentType,
  options: string[],
  url: string
): string {
  const tail = `\n\nFull guide 👉 ${url} #travel #traveltips`;
  const room = TWEET_LIMIT - weightedLen(tail);

  // The model's text minus any URL it already placed and minus a dangling CTA.
  let lead = modelText
    .split("\n")
    .filter((line) => !/^https?:\/\//.test(line.trim()))
    .join(" ")
    .replace(/\b(full (guide|ranked list)|read more)\b.*$/i, "")
    .trim();

  if (contentType === "guide_listicle" && options.length >= 2) {
    const picks = options.slice(0, 3).join(", ");
    const teaser = `Top picks: ${picks}.`;
    if (!lead) lead = "We compared the options so you don't have to.";
    // Trim the lead so lead + teaser + tail all fit.
    const fixed = ` ${teaser}`;
    const leadRoom = room - fixed.length;
    if (lead.length > leadRoom) lead = lead.slice(0, Math.max(0, leadRoom - 3)).trim() + "...";
    return `${lead}${fixed}${tail}`;
  }

  if (!lead) lead = "A practical, no-fluff travel guide worth a read.";
  if (lead.length > room) lead = lead.slice(0, Math.max(0, room - 3)).trim() + "...";
  return `${lead}${tail}`;
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
  let url = "";
  let options: string[] = [];

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
    if (!guide) throw new Error("No guides available to build a tweet from.");
    slug = guide.slug;
    const built = buildGuideContext(guide);
    context = built.context;
    url = built.url;
    options = built.options;
    contentType = built.layout === "listicle" ? "guide_listicle" : "guide_summary";
  } else {
    const dest = overrideDest || pickFreshDestination(destinations, recentSlugs);
    if (!dest) throw new Error("No destinations available to build a tweet from.");
    slug = dest.slug;
    const built = buildDestinationContext(dest, season);
    context = built.context;
    url = built.url;
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

Recent tweets (DO NOT repeat or closely paraphrase any of these):
${historyBlock}

Layout counts in recent history: ${distBlock}

Write the single tweet now. It MUST be under 280 characters (URLs count as 23) and MUST end with the URL exactly as ${url} plus 2 to 3 hashtags. Return ONLY the tweet text.`;

  let tweet = await requestTweet(userPrompt);

  // Corrective retries if the model returned an invalid tweet (too long, or
  // missing the link). Re-issuing a fresh, stronger prompt works far better than
  // feeding the model its own bad reply, which just anchors it.
  const correction = `${userPrompt}

Your previous attempt was not valid. Return ONLY the tweet text, UNDER 280 characters (URLs count as 23), ending with the URL exactly as ${url} plus 2 to 3 hashtags. No engagement question.`;

  for (let attempt = 0; attempt < 3 && !isValidTweet(tweet, url); attempt++) {
    tweet = await requestTweet(correction);
  }

  // Final deterministic fallback if the model never produced a valid tweet.
  if (!isValidTweet(tweet, url)) {
    tweet = buildTweetFallback(tweet, contentType, options, url);
  }

  return { content: tweet, contentType, source, slug };
}

async function requestTweet(userPrompt: string): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return cleanTweet(text);
}
