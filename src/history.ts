import * as fs from "fs";
import * as path from "path";
import { TweetHistory, TweetRecord, ContentType } from "./types";

const HISTORY_PATH = path.join(__dirname, "..", "data", "tweet-history.json");

export function readHistory(): TweetHistory {
  const raw = fs.readFileSync(HISTORY_PATH, "utf-8");
  return JSON.parse(raw) as TweetHistory;
}

export function writeHistory(history: TweetHistory): void {
  history.lastUpdated = new Date().toISOString();
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2) + "\n");
}

export function addTweet(record: TweetRecord): void {
  const history = readHistory();
  history.tweets.push(record);
  writeHistory(history);
}

export function getRecentTweets(n: number): TweetRecord[] {
  const history = readHistory();
  return history.tweets.slice(-n);
}

export function getContentTypeDistribution(): Record<ContentType, number> {
  const history = readHistory();
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const counts: Record<string, number> = {};
  for (const tweet of history.tweets) {
    if (new Date(tweet.postedAt) >= fourteenDaysAgo) {
      counts[tweet.contentType] = (counts[tweet.contentType] || 0) + 1;
    }
  }
  return counts as Record<ContentType, number>;
}

/**
 * Fraction of the last `n` tweets that carried the guide link. Legacy tweets
 * have no `hasLink` field and are counted as linked (every past tweet had one),
 * so a fresh history reads as ~100% linked and generation steers downward.
 */
export function getRecentLinkRatio(n: number): number {
  const recent = getRecentTweets(n);
  if (recent.length === 0) return 1;
  const linked = recent.filter((t) => t.hasLink !== false).length;
  return linked / recent.length;
}

export function getRecentDestinations(): string[] {
  const history = readHistory();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const destinations: string[] = [];
  for (const tweet of history.tweets) {
    if (
      tweet.destination &&
      new Date(tweet.postedAt) >= thirtyDaysAgo &&
      !destinations.includes(tweet.destination)
    ) {
      destinations.push(tweet.destination);
    }
  }
  return destinations;
}
