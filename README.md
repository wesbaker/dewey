# Dewey

A Discord bot for managing a book club rotation. Randomizes who picks the book each month, supports pinning members to specific months, excluding members from months, and sends mid-month reminders.

## Features

- **11-month rotation** (December is always off)
- **Randomization** respecting pinned slots and exclusions
- **Mid-month reminders** on the 15th — nudges the current picker about a location and the next picker about their book
- **Slash commands** for managing the schedule

### Commands

| Command | Description | Admin |
|---|---|---|
| `/schedule` | Show the full year's rotation | |
| `/next` | Show who picks next month | |
| `/randomize` | Re-randomize the rotation | Yes |
| `/pin @user <month>` | Pin a member to a specific month | Yes |
| `/unpin @user` | Remove a pin | Yes |
| `/exclude @user <month>` | Exclude a member from a month | Yes |
| `/unexclude @user <month>` | Remove an exclusion | Yes |
| `/swap @user1 @user2` | Swap two members' months | Yes |
| `/setchannel #channel` | Set the reminder channel | Yes |

## Setup

### 1. Create a Discord Application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application**, name it "Dewey" (or whatever you like)
3. Go to **Bot** in the sidebar
4. Click **Reset Token** and copy it — you'll need this for `DISCORD_TOKEN`
5. Under **Privileged Gateway Intents**, no special intents are needed
6. Go to **General Information** and copy the **Application ID** — this is your `APPLICATION_ID`

### 2. Invite the Bot to Your Server

Go to **OAuth2 > URL Generator** in the developer portal:

- **Scopes**: `bot`, `applications.commands`
- **Bot Permissions**: `Send Messages`

Copy the generated URL and open it in your browser to invite the bot.

### 3. Get Your Guild ID

In Discord, enable **Developer Mode** (User Settings > Advanced > Developer Mode). Then right-click your server name and **Copy Server ID**. This is your `SERVER_ID`.

### 4. Configure Environment

```bash
cp .env.example .env
```

Fill in the values:

```
DISCORD_TOKEN=your_bot_token
APPLICATION_ID=your_application_id
SERVER_ID=your_server_id
REMINDER_HOUR=10
```

### 5. Add Members

Edit `data/schedule.json` and add your book club members. Get each person's Discord user ID by right-clicking them > **Copy User ID** (requires Developer Mode).

```json
{
  "reminderChannelId": null,
  "year": 2026,
  "members": [
    { "discordId": "123456789012345678", "name": "Alice" },
    { "discordId": "234567890123456789", "name": "Bob" }
  ],
  "rotation": [],
  "exclusions": []
}
```

You need exactly 11 members in the rotation (13 total minus 2 pinned, or 11 with no pins — the math just needs to work out to 11 slots).

### 6. Install and Run

```bash
npm install
npm start
```

The bot should come online and register its slash commands. Then in Discord:

```
/setchannel #book-club
/randomize
/schedule
```

## Development

```bash
npm run dev    # watches for changes and restarts
```

## Production (Raspberry Pi / PM2)

```bash
git clone <your-repo> ~/dewey && cd ~/dewey
npm install
cp .env.example .env && nano .env

# Update the cwd path in ecosystem.config.cjs to match your Pi
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup    # follow the printed sudo command
```

Set your Pi's timezone so reminders fire at the right local time:

```bash
sudo timedatectl set-timezone America/Chicago
```

### Updating

```bash
cd ~/dewey
git pull
npm install
pm2 restart dewey
```

## How the Rotation Works

The randomizer uses a Las Vegas algorithm:

1. Pinned members are placed in their assigned months first
2. Remaining members are shuffled into remaining months
3. Exclusions are respected — a member excluded from July will never land there
4. If the constraints are unsatisfiable (too many exclusions), it tells you

Swapping two members clears their pin flags since they're no longer in their pinned slots.
