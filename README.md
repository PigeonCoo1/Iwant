# 🪙 Penny Identifier AI

Upload as many photos and videos as you want of any penny — the AI identifies the coin name, mint mark, mintage, grade, value ranges, errors, varieties, history, design symbolism, authentication flags, collector tips, fun facts, and more.

## Features

- **Unlimited multi-file upload** — photos (JPG/PNG/WEBP/HEIC) and videos (MP4/MOV/WEBM). Drag & drop or click to browse.
- **Video frame extraction** — videos are automatically sampled into multiple frames (requires `ffmpeg`).
- **Two grouping modes** — treat all uploads as the same coin (combine for better accuracy) OR analyze each file as a different coin.
- **Deep AI analysis** powered by Claude's vision model, returns structured JSON with:
  - Identification: name, series, country, year, mint mark & location, designer, variety
  - Physical specs: composition, weight, diameter, thickness, edge
  - Mintage & rarity tier
  - Grade estimate (Sheldon scale) + strike/luster/surface/eye appeal, color designation (BN/RB/RD), problems detected
  - Value estimates in USD — low/high ranges per major grade tier, melt value, market trend, auction comp notes
  - Errors & varieties detected (DDO, RPM, off-center, clipped, wrong planchet, BIE, etc.)
  - Brief history, design notes (obverse/reverse/symbolism)
  - Authentication red-flags, collector tips, recommended next steps, fun facts
- **Polished dark UI** with confidence bar, chips, grade tables, and raw-JSON viewer for power users.
- **Prompt caching** on the expert numismatist system prompt for speed and cost efficiency.

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Configure your API key
cp .env.example .env
# then edit .env and paste your key from https://console.anthropic.com/

# 3. (Optional but recommended) Install ffmpeg so videos can be analyzed.
#    macOS: brew install ffmpeg
#    Ubuntu/Debian: sudo apt install ffmpeg
#    Windows: https://ffmpeg.org/download.html

# 4. Run the server
npm start

# 5. Open http://localhost:3000
```

## Configuration

All via `.env` (see `.env.example`):

| Var | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | — | **Required.** Your Anthropic API key. |
| `ANTHROPIC_MODEL` | `claude-opus-4-6` | `claude-opus-4-6` (best), `claude-sonnet-4-6` (faster), `claude-haiku-4-5-20251001` (cheapest). |
| `PORT` | `3000` | HTTP port. |
| `FFMPEG_PATH` | `ffmpeg` | Path to ffmpeg binary. |
| `VIDEO_FRAMES` | `6` | Frames sampled per uploaded video. |
| `MAX_UPLOAD_MB` | `200` | Max size per uploaded file. |

## How it works

1. Frontend (`public/`) lets you drop/select any number of photos and videos.
2. Backend (`server.js`) extracts frames from videos via `ffmpeg`, bundles everything into base64 image blocks, and calls the Claude Messages API with a cached expert numismatist system prompt.
3. Claude returns a strict JSON object; the frontend renders it into digestible panels: identification, specs, mintage, grade, value table, errors, history, design, tips, next steps, fun facts, and raw JSON.

## Tips for best results

- Include both the obverse (Lincoln side) and reverse clearly.
- Shoot in soft, even light — avoid harsh glare that hides detail.
- Add close-ups of the date, mint mark, and any suspected error.
- For a possible 1943 bronze / 1944 steel / 1982 transitional cent, weigh it and paste the weight into the **notes** field — it makes a huge difference.
- For videos, a slow 360° rotation works great.

## 📲 Hosting it (iPhone / GitHub Pages / server)

There are **two builds** in this repo:

- **`docs/`** → fully static, runs entirely in the browser, perfect for GitHub Pages & iPhone.
- **`public/` + `server.js`** → Node backend, hides the API key, supports real video frame extraction with `ffmpeg`.

### A. GitHub Pages (easiest, free, iPhone-friendly) ⭐

1. Push this repo to GitHub.
2. In the repo → **Settings → Pages** → *Source*: `Deploy from a branch` → *Branch*: `main` → *Folder*: `/docs`. Save.
3. Wait ~1 min — your site is live at `https://<you>.github.io/<repo>/`.
4. Open the URL on your **iPhone 16 in Safari**.
5. Paste your Anthropic key (stored only in your browser via `localStorage`) and hit **Save**.
6. Tap the **Share** button → **Add to Home Screen** to get a full-screen app icon that looks like a native app.
7. Tap the penny icon → upload photos (camera or library) or record/select videos → **Analyze**. Video frames are extracted inside Safari using `<canvas>`.

> ⚠️ In this mode your API key sits in your browser. Fine for personal use, **don't share a page with your own key saved**.

### B. Render.com (backend, free tier, key hidden) ⭐ for sharing

1. Push the repo to GitHub.
2. Go to [render.com](https://render.com) → **New → Web Service** → connect your repo.
3. Build command: `npm install` · Start command: `npm start` · Environment: Node.
4. Add env var `ANTHROPIC_API_KEY` = your key.
5. Under **Advanced → Build command** you can prepend `apt-get update && apt-get install -y ffmpeg &&` to get video support, or use a Dockerfile. (Free tier includes ffmpeg on their default image for most plans.)
6. Deploy. Open the URL on your iPhone.

### C. Railway / Fly.io / Heroku-likes

Same pattern — repo-based deploy, set `ANTHROPIC_API_KEY`, they'll run `npm start`. These give you full Node + `ffmpeg` for video support.

### D. Run on your Mac/PC and hit it from your iPhone on Wi-Fi

```bash
npm install && cp .env.example .env   # add key
npm start                              # listens on :3000
```
Find your Mac's LAN IP (e.g. `192.168.1.42`) and open `http://192.168.1.42:3000` in Safari on your iPhone. Both devices must be on the same Wi-Fi.

### E. Running on the iPhone itself

Not really practical — iOS doesn't support Node servers. Options like **a-Shell** or **iSH** technically work but are slow and clunky. Use option **A** instead — the static build runs 100% inside Safari with no server needed.

### Which should I pick?

| You want… | Use |
|---|---|
| Easiest, free, personal use on my iPhone | **A. GitHub Pages** |
| Share with friends without giving out my key | **B. Render** |
| Best video analysis with ffmpeg | **B / C / D** |
| Offline / no API calls | not possible — you need Claude's vision API |

## Disclaimer

AI estimates are educated guesses — not a substitute for in-hand examination or third-party grading (PCGS, NGC, ANACS, ICG). For high-value coins, always get professional authentication.
