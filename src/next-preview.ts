import type { APIEmbed } from "discord.js";
import { formatSlot } from "./types.js";
import { readSchedule } from "./data.js";
import { buildBookSourceLinks } from "./book-links.js";
import { getSlotForYearMonth, nextActiveFromNow } from "./rotation.js";

export interface NextPreviewResult {
  missing: boolean;
  reply: {
    content?: string;
    ephemeral?: boolean;
    embeds?: APIEmbed[];
  };
}

export function buildNextPreview(): NextPreviewResult {
  const schedule = readSchedule();

  if (schedule.rotation.length === 0) {
    return {
      missing: true,
      reply: {
        content:
          "No rotation set yet. An admin can use `/randomize` to generate one.",
        ephemeral: true,
      },
    };
  }

  const { year, month } = nextActiveFromNow();
  const slot = getSlotForYearMonth(schedule.rotation, year, month);

  if (!slot) {
    return {
      missing: true,
      reply: {
        content: `No one is assigned to ${formatSlot(year, month)} yet. An admin can use \`/randomize\` to fill it in.`,
        ephemeral: true,
      },
    };
  }

  const member = schedule.members.find((m) => m.discordId === slot.memberId);
  const name = member?.name ?? `<@${slot.memberId}>`;
  const label = formatSlot(year, month);

  const lines = [
    `**${name}** (<@${slot.memberId}>) is picking the book for **${label}**.`,
  ];
  if (slot.pin) lines.push("📌 *(pinned slot)*");
  if (slot.bookUrl) {
    const bookDisplay = slot.bookTitle ?? slot.bookUrl;
    lines.push(`\n📖 **Book picked:** ${bookDisplay}`);

    if (slot.bookTitle) {
      const sourceLinks = buildBookSourceLinks({
        bookUrl: slot.bookUrl,
        bookTitle: slot.bookTitle,
      });
      lines.push(
        `🔗 **Sources:**\n${sourceLinks
          .map((link) => `[${link.label}](${link.url})`)
          .map((link) => `- ${link}`)
          .join("\n")}`
      );
    }
  } else {
    lines.push(`\n*No book picked yet — use \`/pick\` to set one.*`);
  }

  return {
    missing: false,
    reply: {
      embeds: [
        {
          title: `📚 Next Up: ${label}`,
          description: lines.join("\n"),
          color: 0x57f287,
        },
      ],
    },
  };
}
