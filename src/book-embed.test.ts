import { describe, it, expect } from "vitest";
import { buildBookEmbed } from "./book-embed.js";
import type { RotationSlot, Member } from "./types.js";

const member: Member = { discordId: "111", name: "Alice" };

const baseSlot: RotationSlot = {
  year: 2026,
  month: 5,
  memberId: "111",
  pin: false,
};

describe("buildBookEmbed", () => {
  it("uses the provided embedTitle", () => {
    const embed = buildBookEmbed({ slot: baseSlot, member, label: "May 2026", embedTitle: "📚 This Month: May 2026" });
    expect(embed.data.title).toBe("📚 This Month: May 2026");
  });

  it("shows picker name and no-book prompt when bookUrl is absent", () => {
    const embed = buildBookEmbed({ slot: baseSlot, member, label: "May 2026", embedTitle: "T" });
    expect(embed.data.description).toContain("Alice");
    expect(embed.data.description).toContain("No book picked yet");
  });

  it("shows bookUrl when present but no title scraped", () => {
    const slot: RotationSlot = { ...baseSlot, bookUrl: "https://goodreads.com/book/123" };
    const embed = buildBookEmbed({ slot, member, label: "May 2026", embedTitle: "T" });
    expect(embed.data.description).toContain("https://goodreads.com/book/123");
    expect(embed.data.description).not.toContain("Sources");
  });

  it("shows title and source links when bookTitle is present", () => {
    const slot: RotationSlot = {
      ...baseSlot,
      bookUrl: "https://goodreads.com/book/123",
      bookTitle: "The Left Hand of Darkness",
    };
    const embed = buildBookEmbed({ slot, member, label: "May 2026", embedTitle: "T" });
    expect(embed.data.description).toContain("The Left Hand of Darkness");
    expect(embed.data.description).toContain("Sources");
    expect(embed.data.description).toContain("Goodreads");
    expect(embed.data.description).toContain("Amazon");
  });

  it("shows pin indicator for pinned slots", () => {
    const slot: RotationSlot = { ...baseSlot, pin: true };
    const embed = buildBookEmbed({ slot, member, label: "May 2026", embedTitle: "T" });
    expect(embed.data.description).toContain("pinned slot");
  });

  it("falls back to mention when member is undefined", () => {
    const embed = buildBookEmbed({ slot: baseSlot, member: undefined, label: "May 2026", embedTitle: "T" });
    expect(embed.data.description).toContain("<@111>");
  });
});
