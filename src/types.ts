export type Source = "guide" | "destination";

export type ContentType =
  // Guide bucket (~85%) — practical how-to / "best X for Y" travel guides
  | "guide_quick_answer"
  | "guide_bullet_fact"
  | "guide_faq"
  | "guide_engagement"
  // Destination bucket (~15%) — rich place guides
  | "destination_spotlight"
  | "destination_budget"
  | "destination_best_time"
  | "destination_culture"
  | "destination_logistics"
  | "destination_engagement";

export interface TweetRecord {
  id: string;
  content: string;
  // Persisted history contains legacy content types (e.g. "indie_dev",
  // "seasonal_content") from the old build-in-public bot, so reads stay loose.
  contentType: ContentType | string;
  postedAt: string;
  tweetId?: string;
  /** Slug of the guide or destination this tweet drew from (used for recency dedup). */
  destination?: string;
  source?: Source;
  /** @deprecated Legacy field from the old blog bot. No longer written. */
  blogSlug?: string;
  season: string;
}

export interface TweetHistory {
  tweets: TweetRecord[];
  lastUpdated: string;
}

export interface GeneratedTweet {
  content: string;
  contentType: ContentType;
  source: Source;
  slug?: string;
}
