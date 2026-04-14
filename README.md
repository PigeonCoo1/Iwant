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

## Disclaimer

AI estimates are educated guesses — not a substitute for in-hand examination or third-party grading (PCGS, NGC, ANACS, ICG). For high-value coins, always get professional authentication.
