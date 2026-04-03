import { ContentType } from "./types";

export const COMPANY_URL = "https://vientapps.com";
export const ROAMLY_URL = "https://roamly.vientapps.com";

export const PRODUCTS = [
  {
    name: "Roamly",
    description: "Free AI-powered trip planner for solo travelers and groups",
    url: "https://roamly.vientapps.com",
  },
  {
    name: "Joke of the Day",
    description: "Browser extension delivering daily humor",
    url: "https://vientapps.com",
  },
  {
    name: "Smoke or Fire",
    description: "Mobile card game playable across devices",
    url: "https://vientapps.com",
  },
];

export const DESTINATIONS = [
  { name: "Las Vegas, Nevada", slug: "las-vegas-nevada" },
  { name: "Oaxaca, Mexico", slug: "oaxaca-mexico" },
  { name: "Tbilisi, Georgia", slug: "tbilisi-georgia" },
  { name: "Medellin, Colombia", slug: "medellin-colombia" },
  { name: "Lisbon, Portugal", slug: "lisbon-portugal" },
  { name: "Marrakech, Morocco", slug: "marrakech-morocco" },
  { name: "Kyoto, Japan", slug: "kyoto-japan" },
  { name: "Nashville, Tennessee", slug: "nashville-tennessee" },
  { name: "Savannah, Georgia", slug: "savannah-georgia" },
  { name: "Asheville, North Carolina", slug: "asheville-north-carolina" },
  { name: "Scottsdale, Arizona", slug: "scottsdale-arizona" },
  { name: "Park City, Utah", slug: "park-city-utah" },
  { name: "New Orleans, Louisiana", slug: "new-orleans-louisiana" },
  { name: "Cartagena, Colombia", slug: "cartagena-colombia" },
  { name: "San Diego, California", slug: "san-diego-california" },
  { name: "Sedona, Arizona", slug: "sedona-arizona" },
  { name: "Tulum, Mexico", slug: "tulum-mexico" },
  { name: "Porto, Portugal", slug: "porto-portugal" },
  { name: "Seville, Spain", slug: "seville-spain" },
  { name: "Budapest, Hungary", slug: "budapest-hungary" },
  { name: "Dubrovnik, Croatia", slug: "dubrovnik-croatia" },
  { name: "Mexico City, Mexico", slug: "mexico-city-mexico" },
  { name: "Chiang Mai, Thailand", slug: "chiang-mai-thailand" },
  { name: "Bali, Indonesia", slug: "bali-indonesia" },
  { name: "Cape Town, South Africa", slug: "cape-town-south-africa" },
  { name: "Charleston, South Carolina", slug: "charleston-south-carolina" },
  { name: "Buenos Aires, Argentina", slug: "buenos-aires-argentina" },
];

export const STYLE_TAGS = [
  "Beach",
  "Cultural",
  "Nightlife",
  "Nature",
  "Food & Culinary",
  "Shopping",
  "Historical",
  "Wellness & Spa",
  "Active Sports",
];

export const ROAMLY_FEATURES = [
  "AI-powered day-by-day itineraries tailored to your group",
  "Private preference collection so everyone can be honest",
  "Date coordination that finds windows working for everyone",
  "Budget-aware planning that fits the whole group's range",
  "No-go zones to automatically exclude places you don't want",
  "Real-time collaboration to see preferences update live",
  "Style preferences like Beach, Cultural, Nightlife, Nature, and more",
];

export const PRICING = {
  free: "Free tier with AI Basic (Claude Haiku)",
  plus: "AI+ at $5/month with Claude Sonnet",
  pro: "AI Pro+ at $15/month with Claude Opus",
};

export const CONTENT_TYPES: ContentType[] = [
  "travel_tip",
  "destination_highlight",
  "roamly_feature",
  "engagement_question",
  "travel_stat",
  "seasonal_content",
  "user_scenario",
  "planning_advice",
  "indie_dev",
  "product_highlight",
  "building_in_public",
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
      return "Spring break trips, cherry blossoms in Kyoto, shoulder season in Europe, outdoor adventures warming up, festival season starting";
    case "summer":
      return "Beach getaways, family vacations, peak travel season, long days for sightseeing, tropical destinations in dry season";
    case "fall":
      return "Fall foliage trips, off-season deals in Europe, harvest festivals, cooler weather hiking, shoulder season savings";
    case "winter":
      return "Holiday travel, ski trips to Park City, tropical escapes from the cold, New Year getaways, cozy cultural city trips";
    default:
      return "";
  }
}
