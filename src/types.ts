export type ContentType =
  | "travel_tip"
  | "destination_highlight"
  | "feature_announcement"
  | "engagement_question"
  | "travel_stat"
  | "seasonal_content"
  | "user_scenario"
  | "planning_advice";

export interface TweetRecord {
  id: string;
  content: string;
  contentType: ContentType;
  postedAt: string;
  tweetId?: string;
  destination?: string;
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
}
