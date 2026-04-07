export type ContentType =
  // Roamly bucket (~30%)
  | "roamly_feature"
  | "destination_highlight"
  // Blog bucket (~70%)
  | "blog_new_post"
  | "blog_insight"
  | "blog_tech"
  | "blog_engagement";

export interface TweetRecord {
  id: string;
  content: string;
  contentType: ContentType;
  postedAt: string;
  tweetId?: string;
  destination?: string;
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
  destination?: string;
  blogSlug?: string;
}
