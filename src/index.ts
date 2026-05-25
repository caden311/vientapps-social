import "dotenv/config";
import { generateTweet } from "./generate";
import { postTweet } from "./post";
import { addTweet } from "./history";
import { getSeason } from "./constants";

function weightedLen(text: string): number {
  return text.replace(/https?:\/\/[^\s]+/g, "x".repeat(23)).length;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const slugArg = process.argv.find((a) => a.startsWith("--slug="));
  const slug = slugArg ? slugArg.split("=")[1] : undefined;

  console.log("Generating thread...");
  const generated = await generateTweet(slug);
  console.log(`Source: ${generated.source}`);
  console.log(`Layout: ${generated.contentType}`);
  if (generated.slug) console.log(`Guide/destination: ${generated.slug}`);
  console.log(`Tweets: ${generated.tweets.length}`);
  generated.tweets.forEach((t, i) => {
    console.log(`\n--- Tweet ${i + 1} (${weightedLen(t)}/280) ---\n${t}`);
  });

  if (dryRun) {
    console.log("\nDry run, skipping post and history update.");
    return;
  }

  console.log("\nPosting to X...");
  const tweetId = await postTweet(generated.tweets);
  console.log(`Posted! First tweet ID: ${tweetId}`);
  console.log(`https://x.com/i/status/${tweetId}`);

  addTweet({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    content: generated.tweets.join("\n\n---\n\n"),
    contentType: generated.contentType,
    postedAt: new Date().toISOString(),
    tweetId,
    tweetCount: generated.tweets.length,
    destination: generated.slug,
    source: generated.source,
    season: getSeason(new Date()),
  });

  console.log("Tweet history updated.");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
