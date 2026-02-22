# Dewey

A Discord bot for managing a book club rotation. Randomizes who picks the book each month, supports pinning and assigning members to specific months, excluding members from months, and sends mid-month reminders.

## Features

- **Rolling schedule** across years (December is always off)
- **Randomization** that fills empty slots without overwriting existing assignments
- **Pin and assign** members to specific year+month slots
- **Mid-month reminders** on the 15th — nudges the current picker about a location and the next picker about their book
- **Slash commands** for managing the schedule

### Commands

| Command | Description | Admin |
|---|---|---|
| `/schedule` | Show current and upcoming rotation | |
| `/next` | Show who picks next month | |
| `/randomize` | Fill empty upcoming slots with randomized assignments | Yes |
| `/assign @user <month> <year>` | Assign a member to a specific month | Yes |
| `/pin @user <month> <year>` | Pin a member to a month (protected from randomize) | Yes |
| `/unpin @user` | Remove a pin | Yes |
| `/exclude @user <month>` | Exclude a member from a calendar month | Yes |
| `/unexclude @user <month>` | Remove an exclusion | Yes |
| `/swap @user1 @user2` | Swap two members' months | Yes |
| `/setchannel #channel` | Set the reminder channel | Yes |

### Assign vs Pin

- **`/assign`** places someone in a slot. If you later run `/randomize`, it treats that slot as filled and won't touch it.
- **`/pin`** does the same thing but marks the slot as protected. Use this when someone must have a specific month.

Both respect the rolling model — you specify a month *and* a year.

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

### 3. Get Your Server ID

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
  "members": [
    { "discordId": "123456789012345678", "name": "Alice" },
    { "discordId": "234567890123456789", "name": "Bob" }
  ],
  "rotation": [],
  "exclusions": []
}
```

The member count doesn't need to match any particular number. When you `/randomize`, the bot creates a window of N upcoming months (where N = member count), and fills any empty slots in that window.

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

The schedule is rolling — it spans across years rather than resetting each January.

When you run `/randomize`:

1. It looks at the next N active months starting from next month (where N = member count), skipping December
2. Slots that already have someone assigned (via `/assign`, `/pin`, or a previous `/randomize`) are left alone
3. Members already assigned in that window are excluded from the randomization
4. Remaining members are shuffled into remaining empty slots, respecting exclusions
5. If the constraints are unsatisfiable (too many exclusions), it tells you

Swapping two members clears their pin flags since they're no longer in their pinned slots.
