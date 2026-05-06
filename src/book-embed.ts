import { EmbedBuilder } from "discord.js";
import type { RotationSlot, Member } from "./types.js";
import { buildBookSourceLinks } from "./book-links.js";

export function buildBookEmbed(params: {
  slot: RotationSlot;
  member: Member | undefined;
  label: string;
  embedTitle: string;
}): EmbedBuilder {
  const { slot, member, label, embedTitle } = params;
  const name = member?.name ?? `<@${slot.memberId}>`;

  const lines = [
    `**${name}** (<@${slot.memberId}>) is picking the book for **${label}**.`,
  ];
  if (slot.pin) lines.push("📌 *(pinned slot)*");
  if (slot.bookUrl) {
    const bookDisplay = slot.bookTitle ?? slot.bookUrl;
    lines.push(`\n📖 **Book:** ${bookDisplay}`);
    if (slot.bookTitle) {
      const sourceLinks = buildBookSourceLinks({
        bookUrl: slot.bookUrl,
        bookTitle: slot.bookTitle,
      });
      lines.push(
        `🔗 **Sources:**\n${sourceLinks
          .map((l) => `- [${l.label}](${l.url})`)
          .join("\n")}`
      );
    }
  } else {
    lines.push(`\n*No book picked yet — use \`/pick\` to set one.*`);
  }

  return new EmbedBuilder({
    title: embedTitle,
    description: lines.join("\n"),
    color: 0x5865f2,
  });
}
