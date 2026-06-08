import { ContentType } from "./types";

// Public site where the travel guides and destination pages live.
export const SITE_URL = "https://travelvient.com";

// Share of tweets drawn from the practical travel guides vs. destination pages.
export const GUIDE_SOURCE_WEIGHT = 0.85;

// Most tweets stand alone with no link (X downranks outbound links). Only a
// minority carry the guide link. We steer the long-run rate toward this target.
export const LINK_INCLUSION_RATE = 0.25;

// Fraction of value-only tweets that close with a genuine, specific question to
// invite replies (a strong ranking signal). Skipped when a tweet carries a link.
export const REPLY_INVITE_RATE = 0.3;

// Link-steering control loop. We look at the last LINK_RATIO_WINDOW tweets, then
// nudge the per-tweet link probability toward LINK_INCLUSION_RATE: a fraction
// LINK_CORRECTION_GAIN of the gap is corrected each draw, clamped to
// [LINK_PROB_MIN, LINK_PROB_MAX] so we never fully stall or saturate.
export const LINK_RATIO_WINDOW = 12;
export const LINK_CORRECTION_GAIN = 0.5;
export const LINK_PROB_MIN = 0.1;
export const LINK_PROB_MAX = 0.6;

// Travel-growth hashtags. The model picks 2-3 per tweet, matched to the topic.
export const TRAVEL_HASHTAGS = [
  "#travel",
  "#traveltips",
  "#budgettravel",
  "#solotravel",
  "#wanderlust",
  "#carryon",
  "#packinglight",
  "#airtravel",
  "#cruise",
  "#digitalnomad",
  "#travelhacks",
  "#bucketlist",
  "#travelgram",
  "#familytravel",
];

// The three thread layouts. A guide's layout is determined by its data
// (ranked product list -> listicle, otherwise summary); destinations always
// use the destination layout. Used for the distribution block shown to the model.
export const CONTENT_TYPES: ContentType[] = [
  "guide_listicle",
  "guide_summary",
  "destination_summary",
];

export function getSeason(date: Date): string {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "fall";
  return "winter";
}

export function getSeasonalContext(season: string): string {
  switch (season) {
    case "spring":
      return "Spring break and shoulder-season travel, cherry blossoms and festivals, milder weather and thinner crowds, outdoor trips warming up";
    case "summer":
      return "Peak travel season, beach and family getaways, long daylight for sightseeing, higher prices and bigger crowds, tropical dry seasons";
    case "fall":
      return "Fall foliage trips, off-season deals as crowds thin, harvest and food festivals, comfortable hiking weather, shoulder-season savings";
    case "winter":
      return "Holiday and New Year travel, ski and snow trips, tropical escapes from the cold, cozy city breaks, festive markets";
    default:
      return "";
  }
}
