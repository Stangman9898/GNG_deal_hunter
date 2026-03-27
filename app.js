/*
  Price Guard — app.js
  The Good Neighbor Guard · Truth · Safety · We Got Your Back
*/

// ─── STATE ────────────────────────────────────────────────
let currentFile = null;
let lastExtracted = null;
let editMode = false;

// ─── DOM REFS ─────────────────────────────────────────────
const fileInput     = document.getElementById('file-input');
const dropZone      = document.getElementById('drop-zone');
const previewWrap   = document.getElementById('preview-wrap');
const previewImg    = document.getElementById('preview-img');
const btnAnalyze    = document.getElementById('btn-analyze');
const btnText       = document.getElementById('btn-text');
const btnSpinner    = document.getElementById('btn-spinner');
const errorBox      = document.getElementById('error-box');
const resultsDiv    = document.getElementById('results');

// ─── FILE HANDLING ────────────────────────────────────────
fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) setFile(file);
});

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));

dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) setFile(file);
});

function setFile(file) {
  currentFile = file;
  const url = URL.createObjectURL(file);
  previewImg.src = url;
  previewWrap.style.display = 'block';
  dropZone.style.display = 'none';
  btnAnalyze.disabled = false;
  hideError();
  setStep('extract');
}

function clearImage() {
  currentFile = null;
  previewImg.src = '';
  previewWrap.style.display = 'none';
  dropZone.style.display = '';
  fileInput.value = '';
  btnAnalyze.disabled = true;
  hideError();
  resultsDiv.style.display = 'none';
  setStep('upload');
}

// ─── PIPELINE ─────────────────────────────────────────────
function setStep(step) {
  const order = ['upload', 'extract', 'compare', 'verdict'];
  const idx = order.indexOf(step);
  order.forEach((s, i) => {
    const el = document.getElementById('ps-' + s);
    if (!el) return;
    el.classList.remove('active', 'done');
    if (i < idx) el.classList.add('done');
    else if (i === idx) el.classList.add('active');
  });
}

// ─── ANALYZE ──────────────────────────────────────────────
async function runAnalysis() {
  if (!currentFile) return;

  setLoading(true);
  hideError();
  resultsDiv.style.display = 'none';
  setStep('extract');

  const formData = new FormData();
  formData.append('image', currentFile);

  try {
    const res = await fetch('/api/analyze-listing', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      showError(data.error || 'Something went wrong. Please try again.');
      setStep('upload');
      return;
    }

    setStep('compare');
    await sleep(400);
    setStep('verdict');

    lastExtracted = data.extracted;
    renderResults(data.extracted, data.valuation);

  } catch (err) {
    showError('Network error — check your connection and try again.');
    setStep('upload');
  } finally {
    setLoading(false);
  }
}

// ─── RENDER RESULTS ───────────────────────────────────────
function renderResults(ext, val) {
  // Verdict banner
  const banner = document.getElementById('verdict-banner');
  const verdictLabel = document.getElementById('verdict-label');
  const verdictSub   = document.getElementById('verdict-sub');
  const verdictIcon  = document.getElementById('verdict-icon');
  const confBadge    = document.getElementById('confidence-badge');

  const verdictMap = {
    'FAIR':        { cls: 'fair',       icon: '✅', sub: 'This listing looks reasonably priced.' },
    'UNDERPRICED': { cls: 'underpriced', icon: '⚠️', sub: 'This is priced below expected range.' },
    'OVERPRICED':  { cls: 'overpriced',  icon: '🚫', sub: 'This is priced above expected range.' },
    null:          { cls: 'unknown',     icon: '❓', sub: 'Enter the price below to get a verdict.' }
  };

  const v = verdictMap[val.verdict] || verdictMap[null];
  banner.className = 'verdict-banner ' + v.cls;
  verdictIcon.textContent = v.icon;
  verdictLabel.textContent = val.verdict || 'NEEDS PRICE';
  verdictSub.textContent   = v.sub;

  confBadge.textContent = val.confidence ? val.confidence.toUpperCase() + ' CONFIDENCE' : '';
  confBadge.className   = 'confidence-badge conf-' + (val.confidence || 'low');

  // Price row
  const listedPrice = ext.listed_price;
  document.getElementById('res-listed').textContent =
    listedPrice != null ? '$' + Number(listedPrice).toLocaleString() : 'Not detected';
  document.getElementById('res-range').textContent =
    '$' + val.low.toLocaleString() + ' – $' + val.high.toLocaleString();

  // Extracted view
  document.getElementById('view-name').textContent  = ext.item_name || '—';
  document.getElementById('view-cat').textContent   = capitalize(ext.category || '—');
  document.getElementById('view-cond').textContent  = capitalize(ext.condition || '—');
  document.getElementById('view-price').textContent =
    listedPrice != null ? '$' + Number(listedPrice).toLocaleString() : 'Not found — enter manually';

  document.getElementById('view-desc').textContent = ext.short_description || '';

  // Signals
  const signalsWrap = document.getElementById('signals-wrap');
  signalsWrap.innerHTML = '';
  if (ext.visible_signals && ext.visible_signals.length) {
    ext.visible_signals.forEach(s => {
      const tag = document.createElement('span');
      tag.className = 'signal-tag';
      tag.textContent = s;
      signalsWrap.appendChild(tag);
    });
  }

  // Pre-fill edit fields
  document.getElementById('edit-price').value = listedPrice != null ? listedPrice : '';
  document.getElementById('edit-cat').value   = ext.category || 'other';
  document.getElementById('edit-cond').value  = (ext.condition === 'unknown' || !ext.condition) ? 'fair' : ext.condition;

  // Risk note
  renderRiskNote(val.verdict, val.risk_note);

  // Show results
  resultsDiv.style.display = 'block';

  // Auto-open edit if price is missing
  if (listedPrice == null) {
    openEdit();
  } else {
    closeEdit();
  }

  resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderRiskNote(verdict, text) {
  const note = document.getElementById('risk-note');
  const icon = document.getElementById('risk-icon');
  const msg  = document.getElementById('risk-text');

  const riskMap = {
    'FAIR':        { cls: 'safe',   icon: '✓' },
    'OVERPRICED':  { cls: 'warn',   icon: '💬' },
    'UNDERPRICED': { cls: 'danger', icon: '🚨' },
    null:          { cls: 'info',   icon: 'ℹ️' }
  };

  const r = riskMap[verdict] || riskMap[null];
  note.className = 'risk-note ' + r.cls;
  icon.textContent = r.icon;
  msg.textContent = text;
}

// ─── EDIT / RE-VALUATION ──────────────────────────────────
function toggleEdit() {
  if (editMode) closeEdit(); else openEdit();
}

function openEdit() {
  editMode = true;
  document.getElementById('extracted-edit').style.display = 'block';
  document.getElementById('edit-toggle').textContent = '✕ Cancel';
}

function closeEdit() {
  editMode = false;
  document.getElementById('extracted-edit').style.display = 'none';
  document.getElementById('edit-toggle').textContent = '✏️ Edit';
}

async function applyEdits() {
  const price = document.getElementById('edit-price').value;
  const cat   = document.getElementById('edit-cat').value;
  const cond  = document.getElementById('edit-cond').value;

  try {
    const res = await fetch('/api/revalue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listed_price: price ? parseFloat(price) : null,
        category: cat,
        condition: cond
      })
    });

    const data = await res.json();

    if (!data.success) {
      showError(data.error || 'Re-valuation failed.');
      return;
    }

    // Update displayed values
    document.getElementById('view-cat').textContent  = capitalize(cat);
    document.getElementById('view-cond').textContent = capitalize(cond);
    document.getElementById('view-price').textContent =
      price ? '$' + parseFloat(price).toLocaleString() : 'Not entered';
    document.getElementById('res-listed').textContent =
      price ? '$' + parseFloat(price).toLocaleString() : 'Not entered';

    const val = data.valuation;
    document.getElementById('res-range').textContent =
      '$' + val.low.toLocaleString() + ' – $' + val.high.toLocaleString();

    const banner = document.getElementById('verdict-banner');
    const v = {
      'FAIR':        { cls: 'fair',        icon: '✅', sub: 'This listing looks reasonably priced.' },
      'UNDERPRICED': { cls: 'underpriced', icon: '⚠️', sub: 'This is priced below expected range.' },
      'OVERPRICED':  { cls: 'overpriced',  icon: '🚫', sub: 'This is priced above expected range.' }
    }[val.verdict] || { cls: 'unknown', icon: '❓', sub: 'No verdict yet.' };

    banner.className = 'verdict-banner ' + v.cls;
    document.getElementById('verdict-icon').textContent  = v.icon;
    document.getElementById('verdict-label').textContent = val.verdict || 'NEEDS PRICE';
    document.getElementById('verdict-sub').textContent   = v.sub;

    const confBadge = document.getElementById('confidence-badge');
    confBadge.textContent = val.confidence.toUpperCase() + ' CONFIDENCE';
    confBadge.className   = 'confidence-badge conf-' + val.confidence;

    renderRiskNote(val.verdict, val.risk_note);
    closeEdit();
    hideError();

  } catch (err) {
    showError('Re-valuation failed. Check your connection.');
  }
}

// ─── RESET ────────────────────────────────────────────────
function resetApp() {
  clearImage();
  resultsDiv.style.display = 'none';
  lastExtracted = null;
  closeEdit();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── UTILS ────────────────────────────────────────────────
function setLoading(loading) {
  btnAnalyze.disabled = loading;
  btnText.style.display    = loading ? 'none' : 'inline';
  btnSpinner.style.display = loading ? 'inline-block' : 'none';
  if (loading) btnText.textContent = '⚡ Analyze Listing';
}

function showError(msg) {
  errorBox.textContent = '⚠️ ' + msg;
  errorBox.style.display = 'block';
}

function hideError() {
  errorBox.style.display = 'none';
  errorBox.textContent = '';
}

function capitalize(str) {
  if (!str) return '—';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
