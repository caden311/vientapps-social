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

  console.log("Generating tweet...");
  const generated = await generateTweet(slug);
  console.log(`Source: ${generated.source}`);
  console.log(`Layout: ${generated.contentType}`);
  console.log(`Link: ${generated.includeLink ? "yes" : "no (value-only)"}`);
  if (generated.slug) console.log(`Guide/destination: ${generated.slug}`);
  console.log(`\n--- Tweet (${weightedLen(generated.content)}/280) ---\n${generated.content}`);

  if (dryRun) {
    console.log("\nDry run, skipping post and history update.");
    return;
  }

  console.log("\nPosting to X...");
  const tweetId = await postTweet(generated.content);
  console.log(`Posted! Tweet ID: ${tweetId}`);
  console.log(`https://x.com/i/status/${tweetId}`);

  addTweet({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    content: generated.content,
    contentType: generated.contentType,
    postedAt: new Date().toISOString(),
    tweetId,
    destination: generated.slug,
    source: generated.source,
    hasLink: generated.includeLink,
    season: getSeason(new Date()),
  });

  console.log("Tweet history updated.");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
