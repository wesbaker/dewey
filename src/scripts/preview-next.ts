import { buildNextPreview } from "../next-preview.js";

const preview = buildNextPreview();

console.log("Reply payload:");
console.log(JSON.stringify(preview.reply, null, 2));

const embed = preview.reply.embeds?.[0];
if (embed) {
  console.log("\nEmbed preview:\n");
  console.log(embed.title ?? "");
  console.log(embed.description ?? "");
} else if (preview.reply.content) {
  console.log("\nMessage preview:\n");
  console.log(preview.reply.content);
}
