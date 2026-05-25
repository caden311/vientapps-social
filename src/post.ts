import { TwitterApi } from "twitter-api-v2";

/**
 * Posts a thread of 1-3 tweets as a reply chain. Returns the id of the first
 * tweet (the head of the thread).
 */
export async function postTweet(tweets: string[]): Promise<string> {
  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY!,
    appSecret: process.env.TWITTER_API_SECRET!,
    accessToken: process.env.TWITTER_ACCESS_TOKEN!,
    accessSecret: process.env.TWITTER_ACCESS_SECRET!,
  });

  if (tweets.length === 1) {
    const result = await client.v2.tweet(tweets[0]);
    return result.data.id;
  }

  const results = await client.v2.tweetThread(tweets);
  return results[0].data.id;
}
