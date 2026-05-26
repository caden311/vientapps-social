export type Source = "guide" | "destination";

export type ContentType =
  // Guides with a ranked product list -> "Top N" listicle thread
  | "guide_listicle"
  // Guides without products -> key-facts summary thread
  | "guide_summary"
  // Destination pages -> "things to know before you visit" thread
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
  /** @deprecated Legacy field from the old blog bot. No longer written. */
  blogSlug?: string;
  season: string;
}

export interface TweetHistory {
  tweets: TweetRecord[];
  lastUpdated: string;
}

export interface GeneratedTweet {
  /** A single tweet under 280 chars that summarizes the guide and links to it. */
  content: string;
  contentType: ContentType;
  source: Source;
  slug?: string;
}
