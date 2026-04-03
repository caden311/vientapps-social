export type ContentType =
  | "travel_tip"
  | "destination_highlight"
  | "roamly_feature"
  | "engagement_question"
  | "travel_stat"
  | "seasonal_content"
  | "user_scenario"
  | "planning_advice"
  | "indie_dev"
  | "product_highlight"
  | "building_in_public";

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
