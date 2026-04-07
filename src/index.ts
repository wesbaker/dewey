import "dotenv/config";
import {
  Client,
  Collection,
  GatewayIntentBits,
  REST,
  Routes,
} from "discord.js";
import { readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Command } from "./types.js";
import { config } from "./config.js";
import { initScheduler } from "./scheduler.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load all command files dynamically
const commands = new Collection<string, Command>();
const commandData: unknown[] = [];
const commandsDir = resolve(__dirname, "commands");

for (const file of readdirSync(commandsDir).filter(
  (f) => f.endsWith(".ts") || f.endsWith(".js")
)) {
  const filePath = resolve(commandsDir, file);
  const mod = await import(pathToFileURL(filePath).href);
  const command: Command = mod.default;
  commands.set(command.data.name, command);
  commandData.push(command.data.toJSON());
}

// Register slash commands with Discord (guild-scoped = instant)
const rest = new REST().setToken(config.discordToken);
await rest.put(
  Routes.applicationGuildCommands(config.applicationId, config.serverId),
  {
  body: commandData,
  }
);
console.log(`[dewey] Registered ${commandData.length} slash commands`);

// Create the bot client (only needs Guilds intent for slash commands)
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("clientReady", () => {
  console.log(`[dewey] Online as ${client.user?.tag}`);
  initScheduler(client);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  // Admin gate
  if (command.adminOnly) {
    const member = interaction.member;
    const hasAdmin =
      member &&
      "permissions" in member &&
      typeof member.permissions !== "string" &&
      member.permissions.has("Administrator");

    if (!hasAdmin) {
      await interaction.reply({
        content: "This command requires the Administrator permission.",
        ephemeral: true,
      });
      return;
    }
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`[dewey] Error in /${interaction.commandName}:`, err);
    try {
      const msg = {
        content: "Something went wrong. Check the bot logs.",
        ephemeral: true,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg);
      } else {
        await interaction.reply(msg);
      }
    } catch {
      // Interaction expired before we could reply — nothing to do
    }
  }
});

client.on("error", (err) => {
  console.error("[dewey] Client error:", err);
});

await client.login(config.discordToken);
