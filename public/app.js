// Penny Identifier front-end

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const analyzeBtn = document.getElementById('analyzeBtn');
const clearBtn = document.getElementById('clearBtn');
const statusEl = document.getElementById('status');
const modeEl = document.getElementById('mode');
const hintEl = document.getElementById('hint');
const resultsEl = document.getElementById('results');
const resultTpl = document.getElementById('resultTemplate');

/** @type {File[]} */
let pendingFiles = [];

// ---- Drag & drop / browse ----
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') fileInput.click();
});
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('drag');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('drag');
  addFiles(e.dataTransfer.files);
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
  const id = Math.random().toString(36).slice(2);
  const wrap = document.createElement('div');
  wrap.className = 'thumb';
  wrap.dataset.id = id;
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
  rm.title = 'Remove';
  rm.addEventListener('click', (e) => {
    e.stopPropagation();
    pendingFiles = pendingFiles.filter((f) => f !== file);
    wrap.remove();
    updateAnalyzeBtn();
  });
  wrap.append(media, tag, name, rm);
  fileList.appendChild(wrap);
}

function updateAnalyzeBtn() {
  analyzeBtn.disabled = pendingFiles.length === 0;
}

clearBtn.addEventListener('click', () => {
  pendingFiles = [];
  fileList.innerHTML = '';
  resultsEl.innerHTML = '';
  statusEl.textContent = '';
  statusEl.className = 'status';
  updateAnalyzeBtn();
});

// ---- Submit ----
analyzeBtn.addEventListener('click', async () => {
  if (pendingFiles.length === 0) return;
  analyzeBtn.disabled = true;
  clearBtn.disabled = true;
  statusEl.className = 'status';
  statusEl.innerHTML = '<span class="spinner"></span>Uploading & analyzing… this can take 15–60 seconds depending on file size.';
  resultsEl.innerHTML = '';

  const fd = new FormData();
  for (const f of pendingFiles) fd.append('files', f, f.name);
  fd.append('mode', modeEl.value);
  fd.append('hint', hintEl.value);

  try {
    const res = await fetch('/api/analyze', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || 'Analysis failed');

    statusEl.className = 'status ok';
    statusEl.textContent = `✅ Done — ${json.results.length} coin(s) analyzed with ${json.model}.${json.ffmpegAvailable ? '' : ' (ffmpeg not installed — videos skipped)'}`;

    for (const r of json.results) renderResult(r);
  } catch (err) {
    statusEl.className = 'status err';
    statusEl.textContent = '❌ ' + err.message;
  } finally {
    analyzeBtn.disabled = false;
    clearBtn.disabled = false;
  }
});

// ---- Rendering ----

function fmtMoney(n) {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1000) return '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 1) return '$' + Number(n).toFixed(2);
  return '$' + Number(n).toFixed(3);
}
function fmtNum(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString();
}
function humanize(k) {
  return k.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}
function val(v) {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function renderResult({ data, label, imageCount, usage }) {
  const node = resultTpl.content.cloneNode(true);
  const article = node.querySelector('.result');

  const id = data.identification || {};
  const grade = data.grade || {};
  const value = data.value_estimates_usd || {};
  const mintage = data.mintage || {};
  const physical = data.physical_specs || {};
  const errors = data.errors_and_varieties || {};
  const design = data.design_notes || {};

  // Title & chips
  const title = [id.year, id.mint_mark, id.coin_name].filter(Boolean).join(' ');
  article.querySelector('.coin-title').textContent = title || id.coin_name || 'Unidentified coin';
  article.querySelector('.chip-year').textContent = id.year ? `Year: ${id.year}` : '';
  article.querySelector('.chip-mint').textContent = id.mint_mark ? `Mint: ${id.mint_mark}` : (id.mint_location ? `Mint: ${id.mint_location}` : '');
  article.querySelector('.chip-grade').textContent = grade.estimated_grade ? `Grade: ${grade.estimated_grade}` : '';
  if (value.current_estimate_low != null || value.current_estimate_high != null) {
    article.querySelector('.chip-value').textContent =
      `Value: ${fmtMoney(value.current_estimate_low)} – ${fmtMoney(value.current_estimate_high)}`;
  }

  // Confidence bar
  const conf = id.overall_confidence ?? 0;
  article.querySelector('.bar-fill').style.width = Math.round(conf * 100) + '%';
  article.querySelector('.conf-pct').textContent = Math.round(conf * 100) + '%';

  // Key-value panels
  fillKV(article.querySelector('[data-section="identification"]'), id);
  fillKV(article.querySelector('[data-section="physical_specs"]'), physical);
  fillKV(article.querySelector('[data-section="mintage"]'), mintage);
  fillKV(article.querySelector('[data-section="grade"]'), grade);
  fillKV(article.querySelector('[data-section="design_notes"]'), design);

  // Value summary
  const vs = article.querySelector('.value-summary');
  if (value.current_estimate_low != null || value.current_estimate_high != null) {
    vs.textContent = `${fmtMoney(value.current_estimate_low)} – ${fmtMoney(value.current_estimate_high)}`;
  } else vs.textContent = '—';

  const tbody = article.querySelector('.grade-table tbody');
  if (Array.isArray(value.by_grade) && value.by_grade.length) {
    for (const row of value.by_grade) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${row.grade ?? '—'}</td><td>${fmtMoney(row.low_usd)}</td><td>${fmtMoney(row.high_usd)}</td>`;
      tbody.appendChild(tr);
    }
  } else {
    article.querySelector('.grade-table').style.display = 'none';
  }
  const vn = article.querySelector('.value-notes');
  const parts = [];
  if (value.melt_value_usd != null) parts.push(`<strong>Melt value:</strong> ${fmtMoney(value.melt_value_usd)}`);
  if (value.market_trend) parts.push(`<strong>Trend:</strong> ${value.market_trend}`);
  if (value.auction_comps_note) parts.push(value.auction_comps_note);
  vn.innerHTML = parts.join(' · ');

  // Errors
  const eb = article.querySelector('.errors-body');
  if ((errors.detected && errors.detected.length) || errors.description) {
    const list = (errors.detected || []).map((d) => `<span>${escapeHtml(d)}</span>`).join('');
    eb.innerHTML =
      (list ? `<div class="detected-list">${list}</div>` : '') +
      (errors.description ? `<p>${escapeHtml(errors.description)}</p>` : '') +
      (errors.premium_if_verified ? `<p><strong>Premium if verified:</strong> ${escapeHtml(errors.premium_if_verified)}</p>` : '');
  } else {
    eb.textContent = 'No significant errors or varieties detected.';
  }

  // Lists
  article.querySelector('.history-text').textContent = data.history || '—';
  fillList(article.querySelector('.tips'), data.collector_tips);
  fillList(article.querySelector('.next-steps'), data.recommended_next_steps);
  fillList(article.querySelector('.fun-facts'), data.fun_facts);
  fillList(article.querySelector('.auth-flags'), data.authentication_flags);
  article.querySelector('.uncertainty').textContent = data.uncertainty_notes || 'None.';

  // Raw JSON
  article.querySelector('.raw-json').textContent = JSON.stringify(data, null, 2);

  resultsEl.appendChild(article);
}

function fillKV(dl, obj) {
  dl.innerHTML = '';
  if (!obj || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    if (k === 'overall_confidence' || k.endsWith('_confidence')) continue; // shown in bar
    const dt = document.createElement('dt');
    dt.textContent = humanize(k);
    const dd = document.createElement('dd');
    dd.textContent = val(v);
    dl.append(dt, dd);
  }
  if (!dl.children.length) {
    const dt = document.createElement('dt');
    dt.textContent = '—';
    const dd = document.createElement('dd');
    dd.textContent = 'no data';
    dl.append(dt, dd);
  }
}

function fillList(ul, arr) {
  ul.innerHTML = '';
  if (!Array.isArray(arr) || arr.length === 0) {
    const li = document.createElement('li');
    li.textContent = '—';
    li.style.color = 'var(--muted)';
    ul.appendChild(li);
    return;
  }
  for (const item of arr) {
    const li = document.createElement('li');
    li.textContent = item;
    ul.appendChild(li);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}
