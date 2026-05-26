import { TwitterApi } from "twitter-api-v2";

/**
 * Posts a single tweet. Returns the id of the posted tweet.
 */
export async function postTweet(content: string): Promise<string> {
  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY!,
    appSecret: process.env.TWITTER_API_SECRET!,
    accessToken: process.env.TWITTER_ACCESS_TOKEN!,
    accessSecret: process.env.TWITTER_ACCESS_SECRET!,
  });

  const result = await client.v2.tweet(content);
  return result.data.id;
}
