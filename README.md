# Dewey

A Discord bot for managing a book club rotation. Randomizes who picks the book each month, tracks book picks with Goodreads integration, and sends mid-month reminders.

## Features

- **Rolling schedule** across years (December is always off)
- **Randomization** that fills empty slots without overwriting existing assignments
- **Pin and assign** members to specific year+month slots
- **Book tracking** — members set their pick with a Goodreads URL, title is scraped automatically
- **Mid-month reminders** on the 15th — nudges the current picker about a location, the next picker about their book, and the admin if the next 3 active months are not fully assigned
- **Book source links** in `/next` — shows Goodreads plus Amazon, Audible, Libby, and Hoopla links for picked books
- **Slash commands** for managing the schedule

### Commands

| Command | Description | Admin |
|---|---|---|
| `/help` | Show available commands (only visible to you) | |
| `/schedule` | Show current and upcoming rotation | |
| `/current` | Show who is picking this month (with book and source links if picked) | |
| `/next` | Show who picks next month (with book and source links if picked) | |
| `/history` | Show past months and book picks | |
| `/pick <url>` | Set your book pick (Goodreads URL) | |
| `/pick <url> <month> <year>` | Set a book pick for a specific slot | Yes |
| `/randomize` | Fill empty upcoming slots with randomized assignments | Yes |
| `/randomize <month> <year>` | Same, but starting from a specific month | Yes |
| `/assign @user <month> <year>` | Assign a member to a specific month | Yes |
| `/pin @user <month> <year>` | Pin a member to a month (protected from randomize) | Yes |
| `/unpin @user` | Remove a pin | Yes |
| `/exclude @user <month>` | Exclude a member from a calendar month | Yes |
| `/unexclude @user <month>` | Remove an exclusion | Yes |
| `/swap @user1 @user2` | Swap two members' months | Yes |
| `/addmember @user [name]` | Add a member to the book club | Yes |
| `/setchannel #channel` | Set the reminder channel | Yes |

### Assign vs Pin

- **`/assign`** places someone in a slot. If you later run `/randomize`, it treats that slot as filled and won't touch it.
- **`/pin`** does the same thing but marks the slot as protected. Use this when someone must have a specific month.

Both respect the rolling model — you specify a month *and* a year.

### Book Picks

When a member runs `/pick` with a Goodreads URL, the bot scrapes the book title from the page and stores both the URL and title. The title appears as a clickable link in `/schedule`, `/next`, and `/history`. If the scrape fails, it falls back to showing just the URL.

Members can only set the pick for their own upcoming slot. Admins can specify a month and year to set it for any slot.

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
ADMIN_DISCORD_ID=your_discord_user_id
REMINDER_HOUR=10
```

### 5. Add Members

You can add members via the `/addmember` slash command, or edit `data/schedule.json` directly.

On first run, if `data/schedule.json` doesn't exist, it's automatically created from `data/schedule.example.json`:

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

`data/schedule.json` is gitignored — your live data won't conflict with pulls.

Get Discord user IDs by right-clicking a user > **Copy User ID** (requires Developer Mode).

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
npm run preview:next   # prints the current /next reply payload from local schedule data
```

## Production (Raspberry Pi / PM2)

```bash
git clone <your-repo> ~/dewey && cd ~/dewey
npm ci
cp .env.example .env && nano .env

# Update the cwd path in ecosystem.config.cjs to match your Pi
npm run build
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup    # follow the printed sudo command
```

Set your Pi's timezone so reminders fire at the right local time:

```bash
sudo timedatectl set-timezone America/Chicago
```

### Automatic Deploys from GitHub

```bash
cd ~/actions-runner
# install a GitHub Actions self-hosted runner here and register it to the repo
```

Then make sure:

- the runner service is running on the Raspberry Pi
- the app repo lives at `/home/wesbaker/dewey` (or update the workflow and PM2 `cwd`)
- PM2 already manages the `dewey` process at least once

On every push to `main`, `.github/workflows/deploy.yml` will:

1. `git pull --ff-only origin main` in `/home/wesbaker/dewey`
2. `npm ci`
3. `npm run build`
4. `pm2 restart dewey --update-env`

If the process does not exist yet, the workflow starts it with `ecosystem.config.cjs`.

### Manual Updating

```bash
cd ~/dewey
git pull --ff-only origin main
npm ci
npm run build
pm2 restart dewey --update-env
```

## How the Rotation Works

The schedule is rolling — it spans across years rather than resetting each January.

When you run `/randomize`:

1. It looks at the next N active months starting from next month (where N = member count), skipping December. You can optionally specify a start month and year.
2. Slots that are **pinned** or have a **book pick** are kept as-is. All other slots in the window are cleared and reshuffled.
3. Remaining members are shuffled into the open slots, respecting:
   - Calendar month exclusions (via `/exclude`)
   - **3-month spacing** — no member will be assigned within 3 active months of another pick (including picks outside the window, like the prior cycle)
4. If the constraints are unsatisfiable (too many exclusions + spacing), it tells you

Re-running `/randomize` produces a different result each time (unless constraints force only one valid arrangement).

Swapping two members clears their pin flags since they're no longer in their pinned slots.
