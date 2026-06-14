export type Source = "post" | "guide" | "destination";

export type ContentType =
  // Vient build-log posts -> standalone build-in-public insight tweet
  | "dev_insight"
  // Guides with a ranked product list -> "Top N" ranked-list tweet
  | "guide_listicle"
  // Guides without products -> key-facts tweet
  | "guide_summary"
  // Destination pages -> "things to know before you visit" tweet
  | "destination_summary";

export interface TweetRecord {
  id: string;
  /** The full thread, joined for storage and de-dup display. */
  content: string;
  // Persisted history contains legacy content types (e.g. "guide_faq",
  // "indie_dev") from older versions of the bot, so reads stay loose.
  contentType: ContentType | string;
  postedAt: string;
  /** Id of the first tweet in the thread. */
  tweetId?: string;
  /** Number of tweets in the posted thread. */
  tweetCount?: number;
  /** Slug of the guide or destination this thread drew from (used for recency dedup). */
  destination?: string;
  source?: Source;
  /** Whether this tweet carried the guide link. Missing/legacy tweets all had one. */
  hasLink?: boolean;
  /** @deprecated Legacy field from the old blog bot. No longer written. */
  blogSlug?: string;
  season: string;
}

export interface TweetHistory {
  tweets: TweetRecord[];
  lastUpdated: string;
}

export interface GeneratedTweet {
  /** A single self-contained tweet under 280 chars; carries the guide link only when includeLink. */
  content: string;
  contentType: ContentType;
  source: Source;
  slug?: string;
  /** Whether this tweet ended with the guide link (vs. value-only). */
  includeLink: boolean;
}
