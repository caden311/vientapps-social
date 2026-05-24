import { ContentType } from "./types";

// Public site where the travel guides and destination pages live.
export const SITE_URL = "https://travelvient.com";

// Share of tweets drawn from the practical travel guides vs. destination pages.
export const GUIDE_SOURCE_WEIGHT = 0.85;

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

// Guide bucket (~85% of tweets), sourced from the MDX travel guides.
export const GUIDE_CONTENT_TYPES: ContentType[] = [
  "guide_quick_answer",
  "guide_bullet_fact",
  "guide_faq",
  "guide_engagement",
];

// Destination bucket (~15% of tweets), sourced from the destination JSON.
export const DESTINATION_CONTENT_TYPES: ContentType[] = [
  "destination_spotlight",
  "destination_budget",
  "destination_best_time",
  "destination_culture",
  "destination_logistics",
  "destination_engagement",
];

// Full set, used only for the distribution block shown to the model.
export const CONTENT_TYPES: ContentType[] = [
  ...GUIDE_CONTENT_TYPES,
  ...DESTINATION_CONTENT_TYPES,
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
