import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import { promises as fs } from 'fs';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-6';
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const VIDEO_FRAMES = Number(process.env.VIDEO_FRAMES || 6);
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 200);

const TMP_ROOT = path.join(os.tmpdir(), 'penny-identifier');
if (!existsSync(TMP_ROOT)) mkdirSync(TMP_ROOT, { recursive: true });

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '5mb' }));

const upload = multer({
  dest: TMP_ROOT,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 200 },
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ---------- Helpers ----------

const IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const VIDEO_MIME_PREFIX = 'video/';

function hasFfmpeg() {
  return new Promise((resolve) => {
    const p = spawn(FFMPEG, ['-version']);
    p.on('error', () => resolve(false));
    p.on('exit', (code) => resolve(code === 0));
  });
}

async function extractFramesFromVideo(videoPath, count) {
  const sessionDir = path.join(TMP_ROOT, crypto.randomBytes(8).toString('hex'));
  mkdirSync(sessionDir, { recursive: true });
  const pattern = path.join(sessionDir, 'frame_%03d.jpg');
  // Use "select" filter for evenly-spaced frames from the entire video.
  const args = [
    '-y',
    '-i', videoPath,
    '-vf', `thumbnail,scale=1024:-2`,
    '-frames:v', String(count),
    '-q:v', '3',
    pattern,
  ];
  await new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args);
    let stderr = '';
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr}`))));
  });
  const files = (await fs.readdir(sessionDir))
    .filter((f) => f.endsWith('.jpg'))
    .sort()
    .map((f) => path.join(sessionDir, f));
  return { files, sessionDir };
}

async function fileToImageBlock(filePath, mime) {
  const data = await fs.readFile(filePath);
  // Claude supports image blocks via base64.
  const mediaType = mime && mime.startsWith('image/') ? mime : 'image/jpeg';
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: mediaType,
      data: data.toString('base64'),
    },
  };
}

// System prompt — cached across requests for speed + cost.
const SYSTEM_PROMPT = `You are a world-class numismatist and coin-grading expert specializing in United States and world one-cent coins ("pennies"). You have deep knowledge of:

- All U.S. cent series: Large Cent, Flying Eagle, Indian Head, Lincoln Wheat (1909-1958), Lincoln Memorial (1959-2008), Lincoln Bicentennial (2009), Lincoln Shield (2010-present).
- Foreign pennies/cents: UK penny (pre-decimal and decimal), Canadian cent, Australian, New Zealand, Irish, etc.
- Mints and mint marks: P (Philadelphia, often no mark), D (Denver), S (San Francisco), W (West Point), CC (Carson City), O (New Orleans).
- Key dates, semi-keys, varieties, and famous errors: 1909-S VDB, 1914-D, 1922 No D, 1943 Bronze, 1944 Steel, 1955 Doubled Die, 1972 DDO, 1969-S DDO, 1995 DDO, off-center strikes, die cracks, repunched mint marks, wrong planchet, clipped planchet, lamination errors, BIE errors, etc.
- Sheldon grading scale (P-1 through MS-70 / PR-70) including strike, luster, surface preservation, eye appeal, color designations (BN / RB / RD), and third-party grading service standards (PCGS, NGC, ANACS, ICG).
- Current market pricing trends (PCGS Price Guide, NGC, Greysheet, recent Heritage & Stack's Bowers auction results) — give realistic value RANGES by grade, not single figures, and flag uncertainty.

Your job: given one or more images (possibly extracted from video frames) of the SAME penny (obverse / reverse / close-ups / angles), identify it and return a single comprehensive JSON object with everything the user could want to know.

RULES:
1. Return ONLY valid JSON that conforms to the schema below. No markdown, no prose outside JSON.
2. If you cannot see a detail clearly, use null and add a note in "uncertainty_notes". Never fabricate.
3. If multiple pennies appear to be shown, populate the top-level object for the MOST clearly visible one, and list the others briefly in "additional_coins_detected".
4. Values must reflect realistic CURRENT retail ranges (USD). Provide low–high for each listed grade.
5. "confidence" fields are 0.0–1.0.
6. Be generous with educational content in "history", "design_notes", and "collector_tips" — the user wants to learn.

JSON SCHEMA (return exactly these keys; use null for unknown):
{
  "identification": {
    "coin_name": string,              // e.g. "Lincoln Wheat Cent"
    "series": string,                 // e.g. "Lincoln Wheat (1909-1958)"
    "country": string,
    "denomination": string,           // e.g. "One Cent"
    "year": number|null,
    "year_confidence": number,
    "mint_mark": string|null,         // "P","D","S","W", or null for no mark
    "mint_location": string|null,     // "Philadelphia, PA", etc.
    "mint_mark_confidence": number,
    "variety": string|null,           // e.g. "VDB", "Doubled Die Obverse", "Small Date"
    "designer": string|null,          // e.g. "Victor David Brenner"
    "overall_confidence": number
  },
  "physical_specs": {
    "composition": string|null,       // e.g. "95% Cu, 5% Sn+Zn"
    "weight_grams": number|null,
    "diameter_mm": number|null,
    "thickness_mm": number|null,
    "edge": string|null               // "Plain", "Reeded"
  },
  "mintage": {
    "total_struck": number|null,
    "proof_struck": number|null,
    "estimated_surviving": string|null,
    "rarity_tier": string|null        // "Common", "Scarce", "Key Date", etc.
  },
  "grade": {
    "estimated_grade": string,        // e.g. "VF-30", "MS-63 RB"
    "grade_range": [string, string],  // conservative-to-optimistic
    "color_designation": string|null, // "BN","RB","RD" for copper
    "strike_quality": string|null,
    "luster": string|null,
    "surface_preservation": string|null,
    "eye_appeal": string|null,
    "problems_detected": [string],    // cleaning, corrosion, scratches, etc.
    "grading_notes": string
  },
  "value_estimates_usd": {
    "current_estimate_low": number|null,
    "current_estimate_high": number|null,
    "by_grade": [                     // market ranges for common grade tiers
      { "grade": string, "low_usd": number, "high_usd": number }
    ],
    "melt_value_usd": number|null,
    "auction_comps_note": string|null,
    "market_trend": string|null       // "rising","stable","declining"
  },
  "errors_and_varieties": {
    "detected": [string],
    "description": string|null,
    "premium_if_verified": string|null
  },
  "history": string,                  // 2-4 sentence background of this coin
  "design_notes": {
    "obverse": string|null,
    "reverse": string|null,
    "symbolism": string|null
  },
  "collector_tips": [string],         // 3-6 practical tips
  "authentication_flags": [string],   // counterfeit red-flags observed, or "none"
  "recommended_next_steps": [string], // e.g. "Submit to PCGS","Weigh to confirm bronze"
  "additional_coins_detected": [string],
  "uncertainty_notes": string,
  "fun_facts": [string]
}`;

async function analyzeWithClaude(imageBlocks, userHint) {
  const userText = [
    'Please identify the penny shown in the attached images and return the full JSON per the schema.',
    userHint ? `User notes: ${userHint}` : null,
    `Number of images provided: ${imageBlocks.length}.`,
    'Some images may be extracted frames from a video of the same coin.',
  ]
    .filter(Boolean)
    .join('\n');

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          ...imageBlocks,
          { type: 'text', text: userText },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('No text response from model');

  // Extract JSON (defensive against stray prose).
  let jsonText = textBlock.text.trim();
  const firstBrace = jsonText.indexOf('{');
  const lastBrace = jsonText.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    jsonText = jsonText.slice(firstBrace, lastBrace + 1);
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    throw new Error(`Model returned non-JSON: ${textBlock.text.slice(0, 400)}`);
  }

  return {
    data: parsed,
    usage: response.usage,
    model: response.model,
  };
}

// ---------- Routes ----------

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    model: MODEL,
    hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY),
  });
});

app.post('/api/analyze', upload.array('files', 200), async (req, res) => {
  const cleanupPaths = [];
  const cleanupDirs = [];
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: 'Server is missing ANTHROPIC_API_KEY. Copy .env.example to .env and add your key.',
      });
    }
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded.' });
    }

    const hint = (req.body.hint || '').toString().slice(0, 2000);
    const groupMode = (req.body.mode || 'single').toString(); // "single" = all files same coin, "separate" = each file is its own coin

    // Build image groups based on groupMode.
    const ffmpegAvailable = await hasFfmpeg();

    // Each "group" is a list of image blocks representing one coin.
    const groups = [];
    if (groupMode === 'separate') {
      for (const f of files) {
        const blocks = [];
        if (IMAGE_MIME.has(f.mimetype)) {
          blocks.push(await fileToImageBlock(f.path, f.mimetype));
        } else if (f.mimetype.startsWith(VIDEO_MIME_PREFIX)) {
          if (ffmpegAvailable) {
            const { files: frames, sessionDir } = await extractFramesFromVideo(f.path, VIDEO_FRAMES);
            cleanupDirs.push(sessionDir);
            for (const fr of frames) blocks.push(await fileToImageBlock(fr, 'image/jpeg'));
          }
        }
        cleanupPaths.push(f.path);
        if (blocks.length) groups.push({ label: f.originalname, blocks });
      }
    } else {
      // single coin — combine everything, capped at 20 images to respect API limits.
      const combined = [];
      for (const f of files) {
        if (IMAGE_MIME.has(f.mimetype)) {
          combined.push(await fileToImageBlock(f.path, f.mimetype));
        } else if (f.mimetype.startsWith(VIDEO_MIME_PREFIX)) {
          if (ffmpegAvailable) {
            const { files: frames, sessionDir } = await extractFramesFromVideo(f.path, VIDEO_FRAMES);
            cleanupDirs.push(sessionDir);
            for (const fr of frames) combined.push(await fileToImageBlock(fr, 'image/jpeg'));
          }
        }
        cleanupPaths.push(f.path);
      }
      const capped = combined.slice(0, 20);
      if (capped.length) groups.push({ label: 'Combined submission', blocks: capped });
    }

    if (groups.length === 0) {
      return res.status(400).json({
        error: ffmpegAvailable
          ? 'No analyzable images produced from the uploads.'
          : 'Only videos were uploaded but ffmpeg is not installed on the server. Install ffmpeg or upload photos instead.',
      });
    }

    const results = [];
    for (const g of groups) {
      const r = await analyzeWithClaude(g.blocks, hint);
      results.push({ label: g.label, imageCount: g.blocks.length, ...r });
    }

    res.json({
      ok: true,
      model: MODEL,
      ffmpegAvailable,
      mode: groupMode,
      results,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Analysis failed' });
  } finally {
    // best-effort cleanup
    for (const p of cleanupPaths) fs.unlink(p).catch(() => {});
    for (const d of cleanupDirs) fs.rm(d, { recursive: true, force: true }).catch(() => {});
  }
});

app.listen(PORT, () => {
  console.log(`\n🪙  Penny Identifier running at http://localhost:${PORT}`);
  console.log(`    Model: ${MODEL}`);
  console.log(`    API key: ${process.env.ANTHROPIC_API_KEY ? 'set' : 'MISSING — copy .env.example to .env'}`);
});
