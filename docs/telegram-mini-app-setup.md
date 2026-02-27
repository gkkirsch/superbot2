# Telegram Mini App Setup

## Prerequisites

1. Superbot2 dashboard running at `localhost:3274`
2. Telegram bot already configured (token in `~/.superbot2/config.json`)

## Step 1: Start the Tunnel

The Telegram Mini App requires HTTPS. Use the Cloudflare quick tunnel:

```bash
bash scripts/start-tunnel.sh
```

This will:
- Install `cloudflared` via brew if needed
- Start a tunnel to `localhost:3274`
- Save the tunnel URL to `~/.superbot2/config.json` under `telegram.webAppUrl`
- Print the URL (e.g., `https://something.trycloudflare.com`)

To stop: `bash scripts/stop-tunnel.sh`

Note: Quick tunnel URLs change each time you restart. For a persistent URL, set up a named Cloudflare tunnel.

## Step 2: Register with BotFather

Open Telegram, find @BotFather, and run these commands:

### Set the Menu Button (recommended)

```
/setmenubutton
```

1. Select your bot
2. Send the tunnel URL (e.g., `https://something.trycloudflare.com`)
3. Send a button label (e.g., `Dashboard`)

This adds a persistent button in the chat with your bot that opens the Mini App.

### Create a Web App (optional)

```
/newapp
```

1. Select your bot
2. Send a title (e.g., `Superbot Dashboard`)
3. Send a description
4. Upload an icon (or skip with `/empty`)
5. Send the tunnel URL
6. Choose a short name (e.g., `dashboard`)

This creates a direct link: `https://t.me/YourBotName/dashboard`

## Step 3: Test

1. Open Telegram on mobile or desktop
2. Open your bot chat
3. Either:
   - Tap the menu button (if set in step 2)
   - Send `/dashboard` to get an inline button
   - Open the direct link `https://t.me/YourBotName/dashboard`

The dashboard should load inside Telegram's WebView with:
- A compact tab-based interface (Chat, Escalations, Dashboard)
- Chat as the default view
- Telegram's theme colors applied

## Updating the URL

If you restart the tunnel (getting a new URL), update BotFather:

```
/setmenubutton
```

Select your bot and send the new URL. The `/dashboard` command in the bot reads from config.json automatically.

## Architecture

- `dashboard-ui/index.html` loads the Telegram WebApp SDK
- `dashboard-ui/src/hooks/useTelegram.ts` detects Telegram, calls `ready()` and `expand()`
- `dashboard-ui/src/components/TelegramMiniApp.tsx` renders the mobile-optimized UI
- `dashboard-ui/src/lib/api.ts` sends `X-Telegram-Init-Data` header with all API calls
- `dashboard/server.js` validates the initData HMAC-SHA256 signature
- `scripts/telegram-watcher.mjs` handles the `/dashboard` command
