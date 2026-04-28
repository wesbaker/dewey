import { SlashCommandBuilder } from "discord.js";
import { readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Command } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show available commands"),

  async execute(interaction) {
    const member = interaction.member;
    const isAdmin =
      member !== null &&
      "permissions" in member &&
      typeof member.permissions !== "string" &&
      member.permissions.has("Administrator");

    const commandsDir = resolve(__dirname);
    const allCommands: Command[] = [];

    for (const file of readdirSync(commandsDir).filter(
      (f) =>
        (f.endsWith(".ts") || f.endsWith(".js")) &&
        f !== "help.ts" &&
        f !== "help.js"
    )) {
      const mod = await import(pathToFileURL(resolve(commandsDir, file)).href);
      allCommands.push(mod.default as Command);
    }

    const visible = allCommands
      .filter((cmd) => !cmd.adminOnly || isAdmin)
      .sort((a, b) => a.data.name.localeCompare(b.data.name));

    const lines = visible.map(
      (cmd) => `**/${cmd.data.name}** — ${cmd.data.description}`
    );

    await interaction.reply({
      content: `## Available Commands\n${lines.join("\n")}`,
      ephemeral: true,
    });
  },
} satisfies Command;
