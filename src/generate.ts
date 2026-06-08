import Anthropic from "@anthropic-ai/sdk";
import { GeneratedTweet, ContentType, Source } from "./types";
import {
  TRAVEL_HASHTAGS,
  GUIDE_SOURCE_WEIGHT,
  CONTENT_TYPES,
  LINK_INCLUSION_RATE,
  REPLY_INVITE_RATE,
  LINK_RATIO_WINDOW,
  LINK_CORRECTION_GAIN,
  LINK_PROB_MIN,
  LINK_PROB_MAX,
  getSeason,
  getSeasonalContext,
} from "./constants";
import {
  getRecentTweets,
  getContentTypeDistribution,
  getRecentDestinations,
  getRecentLinkRatio,
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

/**
 * Decide whether this tweet carries the guide link. We gently correct the coin
 * toward LINK_INCLUSION_RATE using the recent link ratio: if we've been
 * over-linking the chance drops (and vice versa), so the long-run rate holds
 * near the target. A half-strength gain plus a floor avoids a long dead period
 * when migrating from an all-linked history (it ramps down instead of snapping
 * to zero), and at steady state (ratio ≈ target) the coin sits at the target.
 */
function pickIncludeLink(): boolean {
  const recentRatio = getRecentLinkRatio(LINK_RATIO_WINDOW);
  const corrected =
    LINK_INCLUSION_RATE + LINK_CORRECTION_GAIN * (LINK_INCLUSION_RATE - recentRatio);
  const p = Math.max(LINK_PROB_MIN, Math.min(LINK_PROB_MAX, corrected));
  return Math.random() < p;
}

/** Length of a tweet as X counts it: every URL collapses to ~23 chars. */
function weightedLen(text: string): number {
  return text.replace(/https?:\/\/[^\s]+/g, "x".repeat(URL_WEIGHT)).length;
}

const SYSTEM_PROMPT = `You are a sharp, friendly travel advisor running a Twitter/X account. You share concrete, genuinely useful travel advice drawn from deep knowledge of costs, routes, fare rules, and local quirks, not a tourism brochure.

Your job: write ONE tweet that delivers a genuinely useful travel insight that stands completely on its own. The reader should get the full payoff right there in the tweet, no clicking required. Think "the single most useful thing I know about this," packed with real numbers and specifics, in the spirit of this example:

UK261 pays you £220 to £520 in CASH when a UK flight lands 3+ hours late. Same rules as EU261, just in pounds, enforced by the CAA.
£220 short-haul, £350 mid, up to £520 long-haul. Weather and strikes don't count.
You have 6 years to claim, direct, no fee.
#travel #airtravel

Voice: practical, specific, a little opinionated. Real recommendations and real numbers. You are NOT a brand mascot and never talk about software, apps, "building in public," or any company. Naming the third-party travel brands, airlines, gear, or products is encouraged, that is the actual advice.

Hard rules:
- Output EXACTLY ONE tweet. Not a thread.
- The tweet must be UNDER 280 characters. A URL counts as 23 characters. This is a hard limit.
- Hook the reader in the first few words: lead with a number, a surprising fact, a cost shock, a myth-bust, or a strong claim. Then deliver the actual answer, not a teaser. NEVER write "read more to find out," "full guide," or anything that withholds the payoff unless explicitly told to add a link.
- Deliver complete, standalone value. A reader who never clicks anything should still walk away with something they can use or save.
- Pick hashtags from: ${TRAVEL_HASHTAGS.join(" ")}. Match them to the topic.
- When you reference testing or ranking, say "we tested" or "we researched". NEVER use a brand name as a handle, "@vientapps", or any @handle. List option NAMES only, never invent Twitter handles or links.
- Make it specific. Vague = boring. Specific = shareable.
- Use at most 1 relevant emoji.
- Never mention Roamly, Vient Apps, software, or "building in public." You are purely a travel advisor.
- Never repeat or closely paraphrase any tweet from the history provided.
- Never use em dashes.

Output format: return ONLY the tweet text. No quotes, no JSON, no markdown fences, no preamble.`;

/** The closing-line instruction, which depends on whether this tweet links out
 * and whether it should invite replies. */
function closeGuidance(includeLink: boolean, inviteReply: boolean): string {
  if (includeLink) {
    return `- Close with a short call to action and the URL given, exactly as given (e.g. "Full breakdown 👉 <url>"), then 2 to 3 hashtags. Do NOT end with a question.`;
  }
  const tail = inviteReply
    ? `- Do NOT include any link or URL. End with ONE genuine, specific question that invites the reader to share their own experience (not a generic "what's your favorite?"), then 2 to 3 hashtags.`
    : `- Do NOT include any link or URL. End on the insight itself, then 2 to 3 hashtags.`;
  return tail;
}

function layoutGuidance(
  contentType: ContentType,
  includeLink: boolean,
  inviteReply: boolean
): string {
  const close = closeGuidance(includeLink, inviteReply);
  switch (contentType) {
    case "guide_listicle":
      return `Layout: ranked list, full value inline. Keep the WHOLE tweet to about 230 characters, never over 280. Counting matters here; favor fewer words.
- One tight hook line with 1 emoji (a number or surprising fact). Skip "after testing X on Y" if it costs space.
- Then the top 3 option NAMES, comma-separated. A 2 to 3 word reason per name is nice-to-have, include it ONLY if the whole tweet still fits comfortably; otherwise list the bare names. This IS the answer, not a teaser.
- Do not write "full ranked list" or any teaser.
${close}`;
    case "guide_summary":
      return `Layout: key facts, full value inline.
- Open with a strong hook and 1 emoji: a number, a cost shock, or a myth-bust.
- Give the core answer plus the 1 or 2 most surprising or specific facts (real numbers, rules, gotchas). The reader should not need to click anything.
${close}`;
    case "destination_summary":
    default:
      return `Layout: "things to know before you visit," full value inline.
- Open with a hook and 1 emoji capturing the vibe / why go.
- Pack in 2 or 3 concrete facts: a real cost number, the best time to visit, and one insider or cultural tip.
${close}`;
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

function isValidTweet(text: string, url: string, includeLink: boolean): boolean {
  if (text.length === 0 || weightedLen(text) > TWEET_LIMIT) return false;
  // Every tweet must close with hashtags; nothing else enforces this.
  if (!/#\w/.test(text)) return false;
  if (includeLink) return text.includes(url);
  // Value-only tweets must not sneak a link back in.
  return !/https?:\/\//.test(text) && !text.toLowerCase().includes("travelvient.com");
}

/**
 * Last-resort deterministic single tweet, used only when the model repeatedly
 * fails to return a valid one. For a ranked listicle we rebuild a clean tweet
 * from the guide's own option names; otherwise we trim the model's text. The
 * tail carries the CTA link (when linking) or just hashtags.
 */
function buildTweetFallback(
  modelText: string,
  contentType: ContentType,
  options: string[],
  url: string,
  includeLink: boolean
): string {
  const linkTail = `\n\nFull guide 👉 ${url} #travel #traveltips`;
  // A canned question would be generic by definition, which is exactly what the
  // prompt tells the model to avoid, so the value-only fallback just ends on
  // hashtags. inviteReply only shapes the model prompt, not this last resort.
  const valueTail = `\n\n#travel #traveltips`;
  const tail = includeLink ? linkTail : valueTail;
  const room = TWEET_LIMIT - weightedLen(tail);

  if (contentType === "guide_listicle" && options.length >= 2) {
    const picks = options.slice(0, 3).join(", ");
    const body = `Top 3 after testing: ${picks}.`;
    // Use the model's opening line as a hook: strip any URL and any trailing
    // "Top 3 / Top picks" restatement (so we don't name the picks twice), then
    // trim to whole words if it's too long. No mid-word cuts, no dimension-paren
    // false splits.
    let hook = (modelText.split("\n")[0] || "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\btop\s*(?:picks|\d+)\b.*$/i, "")
      .replace(/[\s:,\-]+$/, "")
      .trim();
    const hookRoom = room - body.length - 2;
    if (hook.length > hookRoom) {
      hook = hook.slice(0, Math.max(0, hookRoom)).replace(/\s+\S*$/, "").trim();
    }
    const lead = hook ? `${hook}. ` : "";
    return `${lead}${body}${tail}`;
  }

  // The model's text minus any URL it already placed and minus a dangling CTA.
  let lead = modelText
    .split("\n")
    .filter((line) => !/^https?:\/\//.test(line.trim()))
    .join(" ")
    .replace(/\b(full (guide|ranked list|breakdown)|read more)\b.*$/i, "")
    .trim();

  if (!lead) lead = "A practical, no-fluff travel tip worth knowing.";
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

  // Most tweets stand alone (no link); a question only closes value-only tweets.
  const includeLink = pickIncludeLink();
  const inviteReply = !includeLink && Math.random() < REPLY_INVITE_RATE;

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

  const closeRule = includeLink
    ? `It MUST end with the URL exactly as ${url} plus 2 to 3 hashtags.`
    : `It MUST NOT contain any link or URL. End with ${inviteReply ? "one genuine, specific question then" : "the insight then"} 2 to 3 hashtags.`;

  const userPrompt = `Today is ${now.toISOString().split("T")[0]}. Season: ${season}.
Seasonal context: ${seasonalContext}

${layoutGuidance(contentType, includeLink, inviteReply)}

Source material:
${context}

Recent tweets (DO NOT repeat or closely paraphrase any of these):
${historyBlock}

Layout counts in recent history: ${distBlock}

Write the single tweet now. It MUST be under 280 characters (URLs count as 23). ${closeRule} Deliver the full payoff inline, no teasing. Return ONLY the tweet text.`;

  let tweet = await requestTweet(userPrompt);

  // Corrective retries if the model returned an invalid tweet (too long, or the
  // link rule was broken). Re-issuing a fresh, stronger prompt works far better
  // than feeding the model its own bad reply, which just anchors it.
  const correction = `${userPrompt}

Your previous attempt was not valid. Return ONLY the tweet text, UNDER 280 characters (URLs count as 23). ${closeRule}`;

  for (let attempt = 0; attempt < 3 && !isValidTweet(tweet, url, includeLink); attempt++) {
    tweet = await requestTweet(correction);
  }

  // Final deterministic fallback if the model never produced a valid tweet.
  if (!isValidTweet(tweet, url, includeLink)) {
    tweet = buildTweetFallback(tweet, contentType, options, url, includeLink);
  }

  return { content: tweet, contentType, source, slug, includeLink };
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
