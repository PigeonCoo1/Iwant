// Penny Identifier — client-only (GitHub Pages) edition.
// Calls the Anthropic API directly from your browser.

const SYSTEM_PROMPT = `You are a world-class numismatist and coin-grading expert specializing in United States and world one-cent coins ("pennies"). You have deep knowledge of:

- All U.S. cent series: Large Cent, Flying Eagle, Indian Head, Lincoln Wheat (1909-1958), Lincoln Memorial (1959-2008), Lincoln Bicentennial (2009), Lincoln Shield (2010-present).
- Foreign pennies/cents: UK penny (pre-decimal and decimal), Canadian cent, Australian, New Zealand, Irish, etc.
- Mints and mint marks: P (Philadelphia, often no mark), D (Denver), S (San Francisco), W (West Point), CC (Carson City), O (New Orleans).
- Key dates, semi-keys, varieties, and famous errors: 1909-S VDB, 1914-D, 1922 No D, 1943 Bronze, 1944 Steel, 1955 Doubled Die, 1972 DDO, 1969-S DDO, 1995 DDO, off-center strikes, die cracks, repunched mint marks, wrong planchet, clipped planchet, lamination errors, BIE errors, etc.
- Sheldon grading scale (P-1 through MS-70 / PR-70) including strike, luster, surface preservation, eye appeal, color designations (BN / RB / RD), and third-party grading service standards (PCGS, NGC, ANACS, ICG).
- Current market pricing trends — give realistic value RANGES by grade, not single figures, and flag uncertainty.

Your job: given one or more images (possibly extracted from video frames) of the SAME penny (obverse / reverse / close-ups / angles), identify it and return a single comprehensive JSON object.

RULES:
1. Return ONLY valid JSON. No markdown, no prose outside JSON.
2. If you cannot see a detail clearly, use null and add a note in "uncertainty_notes". Never fabricate.
3. If multiple pennies appear to be shown, populate the top-level object for the MOST clearly visible one, and list the others briefly in "additional_coins_detected".
4. Values must reflect realistic CURRENT retail ranges (USD). Provide low–high for each listed grade.
5. "confidence" fields are 0.0–1.0.
6. Be generous with educational content in "history", "design_notes", and "collector_tips".

JSON SCHEMA (return exactly these keys; use null for unknown):
{
  "identification": { "coin_name": string, "series": string, "country": string, "denomination": string, "year": number|null, "year_confidence": number, "mint_mark": string|null, "mint_location": string|null, "mint_mark_confidence": number, "variety": string|null, "designer": string|null, "overall_confidence": number },
  "physical_specs": { "composition": string|null, "weight_grams": number|null, "diameter_mm": number|null, "thickness_mm": number|null, "edge": string|null },
  "mintage": { "total_struck": number|null, "proof_struck": number|null, "estimated_surviving": string|null, "rarity_tier": string|null },
  "grade": { "estimated_grade": string, "grade_range": [string, string], "color_designation": string|null, "strike_quality": string|null, "luster": string|null, "surface_preservation": string|null, "eye_appeal": string|null, "problems_detected": [string], "grading_notes": string },
  "value_estimates_usd": { "current_estimate_low": number|null, "current_estimate_high": number|null, "by_grade": [ { "grade": string, "low_usd": number, "high_usd": number } ], "melt_value_usd": number|null, "auction_comps_note": string|null, "market_trend": string|null },
  "errors_and_varieties": { "detected": [string], "description": string|null, "premium_if_verified": string|null },
  "history": string,
  "design_notes": { "obverse": string|null, "reverse": string|null, "symbolism": string|null },
  "collector_tips": [string],
  "authentication_flags": [string],
  "recommended_next_steps": [string],
  "additional_coins_detected": [string],
  "uncertainty_notes": string,
  "fun_facts": [string]
}`;

// ---------- Key management ----------
const apiKeyEl = document.getElementById('apiKey');
const modelSel = document.getElementById('modelSel');
const saveKeyBtn = document.getElementById('saveKey');
const clearKeyBtn = document.getElementById('clearKey');
const keyStatus = document.getElementById('keyStatus');

const LS_KEY = 'anthropic_api_key';
const LS_MODEL = 'anthropic_model';

(function restoreKey() {
  const saved = localStorage.getItem(LS_KEY);
  if (saved) {
    apiKeyEl.value = saved;
    keyStatus.className = 'status ok';
    keyStatus.textContent = '✅ Key loaded from this browser.';
  }
  const m = localStorage.getItem(LS_MODEL);
  if (m) modelSel.value = m;
})();

saveKeyBtn.addEventListener('click', () => {
  const k = apiKeyEl.value.trim();
  if (!k.startsWith('sk-ant-')) {
    keyStatus.className = 'status err';
    keyStatus.textContent = '❌ That does not look like an Anthropic key (should start with sk-ant-).';
    return;
  }
  localStorage.setItem(LS_KEY, k);
  localStorage.setItem(LS_MODEL, modelSel.value);
  keyStatus.className = 'status ok';
  keyStatus.textContent = '✅ Saved in this browser only.';
});
modelSel.addEventListener('change', () => localStorage.setItem(LS_MODEL, modelSel.value));
clearKeyBtn.addEventListener('click', () => {
  localStorage.removeItem(LS_KEY);
  apiKeyEl.value = '';
  keyStatus.className = 'status';
  keyStatus.textContent = '🗑️ Key forgotten.';
});

// ---------- File handling ----------
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const analyzeBtn = document.getElementById('analyzeBtn');
const clearBtn = document.getElementById('clearBtn');
const statusEl = document.getElementById('status');
const modeEl = document.getElementById('mode');
const hintEl = document.getElementById('hint');
const frameCountEl = document.getElementById('frameCount');
const resultsEl = document.getElementById('results');
const resultTpl = document.getElementById('resultTemplate');

let pendingFiles = [];

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault(); dropzone.classList.remove('drag'); addFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', (e) => addFiles(e.target.files));

function addFiles(fl) {
  for (const f of fl) {
    if (!f.type.startsWith('image/') && !f.type.startsWith('video/')) continue;
    pendingFiles.push(f);
    renderThumb(f);
  }
  updateAnalyzeBtn();
}

function renderThumb(file) {
  const wrap = document.createElement('div');
  wrap.className = 'thumb';
  const isVideo = file.type.startsWith('video/');
  const media = document.createElement(isVideo ? 'video' : 'img');
  media.src = URL.createObjectURL(file);
  if (isVideo) { media.muted = true; media.playsInline = true; }
  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.textContent = isVideo ? '🎞 Video' : '📷 Photo';
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = file.name;
  const rm = document.createElement('button');
  rm.className = 'rm';
  rm.innerHTML = '&times;';
  rm.addEventListener('click', (e) => {
    e.stopPropagation();
    pendingFiles = pendingFiles.filter((f) => f !== file);
    wrap.remove();
    updateAnalyzeBtn();
  });
  wrap.append(media, tag, name, rm);
  fileList.appendChild(wrap);
}

function updateAnalyzeBtn() { analyzeBtn.disabled = pendingFiles.length === 0; }

clearBtn.addEventListener('click', () => {
  pendingFiles = [];
  fileList.innerHTML = '';
  resultsEl.innerHTML = '';
  statusEl.textContent = '';
  statusEl.className = 'status';
  updateAnalyzeBtn();
});

// ---------- Image / video → base64 blocks ----------

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function shrinkImage(file, maxDim = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
    const buf = await blob.arrayBuffer();
    return { mediaType: 'image/jpeg', base64: arrayBufferToBase64(buf) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function extractVideoFrames(file, count) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url; video.muted = true; video.playsInline = true; video.preload = 'auto';
  await new Promise((res, rej) => {
    video.addEventListener('loadedmetadata', res, { once: true });
    video.addEventListener('error', rej, { once: true });
  });
  const duration = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  const w = Math.min(1280, video.videoWidth || 1280);
  const h = Math.round((video.videoHeight || 720) * (w / (video.videoWidth || w)));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const out = [];
  try {
    for (let i = 0; i < count; i++) {
      const t = duration ? (duration * (i + 0.5)) / count : 0;
      await seekTo(video, t);
      ctx.drawImage(video, 0, 0, w, h);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
      const buf = await blob.arrayBuffer();
      out.push({ mediaType: 'image/jpeg', base64: arrayBufferToBase64(buf) });
    }
  } finally {
    URL.revokeObjectURL(url);
  }
  return out;
}

function seekTo(video, t) {
  return new Promise((resolve) => {
    const onSeek = () => { video.removeEventListener('seeked', onSeek); resolve(); };
    video.addEventListener('seeked', onSeek);
    try { video.currentTime = t; } catch { resolve(); }
  });
}

function arrayBufferToBase64(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// ---------- Anthropic API call ----------

async function callClaude(imageBlocks, hint) {
  const apiKey = localStorage.getItem(LS_KEY);
  if (!apiKey) throw new Error('Save your Anthropic API key first.');
  const model = modelSel.value || 'claude-sonnet-4-6';

  const body = {
    model,
    max_tokens: 4096,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: [
        ...imageBlocks.map((b) => ({
          type: 'image',
          source: { type: 'base64', media_type: b.mediaType, data: b.base64 },
        })),
        { type: 'text', text: `Please identify the penny in these ${imageBlocks.length} image(s) and return the full JSON per the schema.${hint ? ' User notes: ' + hint : ''}` },
      ],
    }],
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err.slice(0, 300)}`);
  }
  const json = await res.json();
  const textBlock = (json.content || []).find((b) => b.type === 'text');
  if (!textBlock) throw new Error('No text in response.');
  let t = textBlock.text.trim();
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i >= 0 && j > i) t = t.slice(i, j + 1);
  return JSON.parse(t);
}

// ---------- Gallery (persisted in localStorage) ----------
const GAL_KEY = 'penny_gallery_v1';

function loadGallery() {
  try { return JSON.parse(localStorage.getItem(GAL_KEY) || '[]'); }
  catch { return []; }
}
function saveGallery(items) {
  try {
    localStorage.setItem(GAL_KEY, JSON.stringify(items));
    return true;
  } catch (e) {
    alert('Gallery storage is full. Export your gallery and remove some entries.');
    return false;
  }
}
function addToGallery(entry) {
  const items = loadGallery();
  items.unshift(entry);
  if (!saveGallery(items)) return false;
  renderGallery();
  return true;
}
function removeFromGallery(id) {
  const items = loadGallery().filter((x) => x.id !== id);
  saveGallery(items);
  renderGallery();
}

function midValue(data) {
  const v = (data && data.value_estimates_usd) || {};
  if (v.current_estimate_low != null && v.current_estimate_high != null) {
    return (Number(v.current_estimate_low) + Number(v.current_estimate_high)) / 2;
  }
  if (v.current_estimate_low != null) return Number(v.current_estimate_low);
  if (v.current_estimate_high != null) return Number(v.current_estimate_high);
  return 0;
}

function renderGallery() {
  const grid = document.getElementById('galleryGrid');
  const empty = document.getElementById('galleryEmpty');
  const totals = document.getElementById('galleryTotals');
  const countChip = document.getElementById('galleryCount');
  const items = loadGallery();
  grid.innerHTML = '';
  totals.innerHTML = '';
  countChip.textContent = items.length ? `${items.length} coin${items.length === 1 ? '' : 's'}` : '';

  if (items.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  let low = 0, high = 0, mid = 0;
  for (const it of items) {
    const v = it.data.value_estimates_usd || {};
    if (v.current_estimate_low != null) low += Number(v.current_estimate_low);
    if (v.current_estimate_high != null) high += Number(v.current_estimate_high);
    mid += midValue(it.data);
  }
  totals.innerHTML = `
    <div class="total-tile"><div class="label">Low estimate</div><div class="value">${fmtMoney(low)}</div></div>
    <div class="total-tile mid"><div class="label">Mid estimate</div><div class="value">${fmtMoney(mid)}</div></div>
    <div class="total-tile"><div class="label">High estimate</div><div class="value">${fmtMoney(high)}</div></div>
    <div class="total-tile count"><div class="label">Coins</div><div class="value">${items.length}</div></div>
  `;

  for (const it of items) {
    const id = it.data.identification || {};
    const v = it.data.value_estimates_usd || {};
    const title = [id.year, id.mint_mark, id.coin_name].filter(Boolean).join(' ') || id.coin_name || 'Unknown coin';
    const grade = (it.data.grade || {}).estimated_grade || '';
    const valStr = (v.current_estimate_low != null || v.current_estimate_high != null)
      ? `${fmtMoney(v.current_estimate_low)} – ${fmtMoney(v.current_estimate_high)}` : '';
    const el = document.createElement('div');
    el.className = 'gallery-item';
    el.innerHTML = `
      <img src="${it.thumb || ''}" alt="" loading="lazy" />
      <div class="gi-body">
        <div class="gi-title">${escapeHtml(title)}</div>
        <div class="gi-meta">${escapeHtml(grade)}${grade && it.savedAt ? ' · ' : ''}${new Date(it.savedAt).toLocaleDateString()}</div>
        <div class="gi-val">${valStr}</div>
      </div>
    `;
    el.addEventListener('click', () => openDetail(it));
    grid.appendChild(el);
  }
}

function openDetail(item) {
  const overlay = document.getElementById('detailOverlay');
  const body = document.getElementById('detailBody');
  body.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'results';
  body.appendChild(wrap);
  const prevResults = resultsEl;
  // temporarily target overlay
  const article = buildResultNode({ data: item.data, thumb: item.thumb });
  // No "save" button in detail view — already saved. Swap it.
  const btn = article.querySelector('.save-btn');
  if (btn) btn.remove();
  wrap.appendChild(article);
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';

  const del = document.getElementById('deleteItem');
  del.onclick = () => {
    if (confirm('Remove this penny from your gallery?')) {
      removeFromGallery(item.id);
      closeDetail();
    }
  };
}
function closeDetail() {
  document.getElementById('detailOverlay').hidden = true;
  document.body.style.overflow = '';
}
document.getElementById('overlayClose').addEventListener('click', closeDetail);
document.getElementById('detailOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'detailOverlay') closeDetail();
});

// Export / Import
document.getElementById('exportGallery').addEventListener('click', () => {
  const items = loadGallery();
  if (items.length === 0) { alert('Gallery is empty.'); return; }
  const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `penny-gallery-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});
document.getElementById('importGallery').addEventListener('click', () => {
  document.getElementById('importFile').click();
});
document.getElementById('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const incoming = JSON.parse(text);
    if (!Array.isArray(incoming)) throw new Error('Invalid gallery file');
    const merged = [...incoming, ...loadGallery()];
    // dedupe by id
    const seen = new Set(), out = [];
    for (const it of merged) { if (!seen.has(it.id)) { seen.add(it.id); out.push(it); } }
    saveGallery(out);
    renderGallery();
    alert(`Imported ${incoming.length} entries.`);
  } catch (err) {
    alert('Import failed: ' + err.message);
  } finally {
    e.target.value = '';
  }
});

async function makeThumbnail(file) {
  if (file.type.startsWith('image/')) {
    const s = await shrinkImage(file, 400);
    return `data:${s.mediaType};base64,${s.base64}`;
  }
  const frames = await extractVideoFrames(file, 1);
  if (frames[0]) return `data:${frames[0].mediaType};base64,${frames[0].base64}`;
  return '';
}

// ---------- Submit flow ----------

analyzeBtn.addEventListener('click', async () => {
  if (pendingFiles.length === 0) return;
  analyzeBtn.disabled = true; clearBtn.disabled = true;
  resultsEl.innerHTML = '';

  const frames = Math.max(1, Math.min(12, Number(frameCountEl.value) || 4));
  const mode = modeEl.value;

  try {
    const groups = [];
    if (mode === 'separate') {
      for (const f of pendingFiles) {
        statusEl.className = 'status';
        statusEl.innerHTML = `<span class="spinner"></span>Preparing ${f.name}…`;
        const blocks = [];
        if (f.type.startsWith('image/')) {
          blocks.push(await shrinkImage(f));
        } else {
          blocks.push(...await extractVideoFrames(f, frames));
        }
        const thumb = await makeThumbnail(f);
        if (blocks.length) groups.push({ label: f.name, blocks, thumb });
      }
    } else {
      const combined = [];
      let firstThumb = '';
      for (const f of pendingFiles) {
        statusEl.className = 'status';
        statusEl.innerHTML = `<span class="spinner"></span>Preparing ${f.name}…`;
        if (f.type.startsWith('image/')) {
          combined.push(await shrinkImage(f));
        } else {
          combined.push(...await extractVideoFrames(f, frames));
        }
        if (!firstThumb) firstThumb = await makeThumbnail(f);
      }
      groups.push({ label: 'Combined submission', blocks: combined.slice(0, 20), thumb: firstThumb });
    }

    let i = 0;
    for (const g of groups) {
      i++;
      statusEl.innerHTML = `<span class="spinner"></span>Analyzing ${i}/${groups.length} (${g.blocks.length} images) with ${modelSel.value}…`;
      const data = await callClaude(g.blocks, hintEl.value);
      const node = buildResultNode({ data, thumb: g.thumb });
      resultsEl.appendChild(node);
    }
    statusEl.className = 'status ok';
    statusEl.textContent = `✅ Done — ${groups.length} coin(s) analyzed.`;
  } catch (err) {
    console.error(err);
    statusEl.className = 'status err';
    statusEl.textContent = '❌ ' + err.message;
  } finally {
    analyzeBtn.disabled = false; clearBtn.disabled = false;
  }
});

// ---------- Rendering (same as server edition) ----------

function fmtMoney(n) {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1000) return '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 1) return '$' + Number(n).toFixed(2);
  return '$' + Number(n).toFixed(3);
}
function humanize(k) { return k.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()); }
function val(v) {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function buildResultNode({ data, thumb }) {
  const node = resultTpl.content.cloneNode(true);
  const article = node.querySelector('.result');

  const saveBtn = article.querySelector('.save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      if (saveBtn.classList.contains('saved')) return;
      const entry = {
        id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        savedAt: Date.now(),
        data,
        thumb: thumb || '',
      };
      if (addToGallery(entry)) {
        saveBtn.classList.add('saved');
        saveBtn.textContent = '✅ Saved';
        saveBtn.disabled = true;
      }
    });
  }
  const id = data.identification || {};
  const grade = data.grade || {};
  const value = data.value_estimates_usd || {};
  const mintage = data.mintage || {};
  const physical = data.physical_specs || {};
  const errors = data.errors_and_varieties || {};
  const design = data.design_notes || {};

  const title = [id.year, id.mint_mark, id.coin_name].filter(Boolean).join(' ');
  article.querySelector('.coin-title').textContent = title || id.coin_name || 'Unidentified coin';
  article.querySelector('.chip-year').textContent = id.year ? `Year: ${id.year}` : '';
  article.querySelector('.chip-mint').textContent = id.mint_mark ? `Mint: ${id.mint_mark}` : (id.mint_location ? `Mint: ${id.mint_location}` : '');
  article.querySelector('.chip-grade').textContent = grade.estimated_grade ? `Grade: ${grade.estimated_grade}` : '';
  if (value.current_estimate_low != null || value.current_estimate_high != null) {
    article.querySelector('.chip-value').textContent = `Value: ${fmtMoney(value.current_estimate_low)} – ${fmtMoney(value.current_estimate_high)}`;
  }

  const conf = id.overall_confidence ?? 0;
  article.querySelector('.bar-fill').style.width = Math.round(conf * 100) + '%';
  article.querySelector('.conf-pct').textContent = Math.round(conf * 100) + '%';

  fillKV(article.querySelector('[data-section="identification"]'), id);
  fillKV(article.querySelector('[data-section="physical_specs"]'), physical);
  fillKV(article.querySelector('[data-section="mintage"]'), mintage);
  fillKV(article.querySelector('[data-section="grade"]'), grade);
  fillKV(article.querySelector('[data-section="design_notes"]'), design);

  const vs = article.querySelector('.value-summary');
  vs.textContent = (value.current_estimate_low != null || value.current_estimate_high != null)
    ? `${fmtMoney(value.current_estimate_low)} – ${fmtMoney(value.current_estimate_high)}` : '—';

  const tbody = article.querySelector('.grade-table tbody');
  if (Array.isArray(value.by_grade) && value.by_grade.length) {
    for (const row of value.by_grade) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${row.grade ?? '—'}</td><td>${fmtMoney(row.low_usd)}</td><td>${fmtMoney(row.high_usd)}</td>`;
      tbody.appendChild(tr);
    }
  } else { article.querySelector('.grade-table').style.display = 'none'; }
  const vn = article.querySelector('.value-notes');
  const parts = [];
  if (value.melt_value_usd != null) parts.push(`<strong>Melt value:</strong> ${fmtMoney(value.melt_value_usd)}`);
  if (value.market_trend) parts.push(`<strong>Trend:</strong> ${value.market_trend}`);
  if (value.auction_comps_note) parts.push(value.auction_comps_note);
  vn.innerHTML = parts.join(' · ');

  const eb = article.querySelector('.errors-body');
  if ((errors.detected && errors.detected.length) || errors.description) {
    const list = (errors.detected || []).map((d) => `<span>${escapeHtml(d)}</span>`).join('');
    eb.innerHTML = (list ? `<div class="detected-list">${list}</div>` : '') +
      (errors.description ? `<p>${escapeHtml(errors.description)}</p>` : '') +
      (errors.premium_if_verified ? `<p><strong>Premium if verified:</strong> ${escapeHtml(errors.premium_if_verified)}</p>` : '');
  } else { eb.textContent = 'No significant errors or varieties detected.'; }

  article.querySelector('.history-text').textContent = data.history || '—';
  fillList(article.querySelector('.tips'), data.collector_tips);
  fillList(article.querySelector('.next-steps'), data.recommended_next_steps);
  fillList(article.querySelector('.fun-facts'), data.fun_facts);
  fillList(article.querySelector('.auth-flags'), data.authentication_flags);
  article.querySelector('.uncertainty').textContent = data.uncertainty_notes || 'None.';
  article.querySelector('.raw-json').textContent = JSON.stringify(data, null, 2);
  return article;
}

function fillKV(dl, obj) {
  dl.innerHTML = '';
  if (!obj || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    if (k.endsWith('_confidence')) continue;
    const dt = document.createElement('dt'); dt.textContent = humanize(k);
    const dd = document.createElement('dd'); dd.textContent = val(v);
    dl.append(dt, dd);
  }
}
function fillList(ul, arr) {
  ul.innerHTML = '';
  if (!Array.isArray(arr) || arr.length === 0) {
    const li = document.createElement('li'); li.textContent = '—'; li.style.color = 'var(--muted)';
    ul.appendChild(li); return;
  }
  for (const item of arr) { const li = document.createElement('li'); li.textContent = item; ul.appendChild(li); }
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Initial paint of gallery on page load
renderGallery();
