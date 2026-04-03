import "dotenv/config";
import { generateTweet } from "./generate";
import { postTweet } from "./post";
import { addTweet } from "./history";
import { getSeason } from "./constants";

async function main() {
  console.log("Generating tweet...");
  const generated = await generateTweet();
  console.log(`Content type: ${generated.contentType}`);
  console.log(`Tweet: ${generated.content}`);
  console.log(`Length: ${generated.content.length}/280`);

  console.log("Posting to X...");
  const tweetId = await postTweet(generated.content);
  console.log(`Posted! Tweet ID: ${tweetId}`);
  console.log(`https://x.com/i/status/${tweetId}`);

  addTweet({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    content: generated.content,
    contentType: generated.contentType,
    postedAt: new Date().toISOString(),
    tweetId,
    destination: generated.destination,
    season: getSeason(new Date()),
  });

  console.log("Tweet history updated.");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
