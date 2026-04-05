/* ── API Client ── */
const API_BASE = '/api/v1';

const api = {
  async get(path) {
    const r = await fetch(API_BASE + path);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async post(path, data) {
    const r = await fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async put(path, data) {
    const r = await fetch(API_BASE + path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async patch(path, data) {
    const r = await fetch(API_BASE + path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async del(path) {
    const r = await fetch(API_BASE + path, { method: 'DELETE' });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },

  /**
   * Stream an SSE endpoint.
   * onMeta(meta)  — called with the first 'meta' event (responder, model, etc.)
   * onToken(str)  — called for each text token
   * onDone(meta)  — called when stream ends
   */
  async stream(path, data, { onMeta, onToken, onDone } = {}) {
    const resp = await fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!resp.ok) throw new Error(await resp.text());

    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const chunk = JSON.parse(line.slice(6));
          if (chunk.type === 'meta' && onMeta) onMeta(chunk);
          if (chunk.type === 'token' && onToken) onToken(chunk.content);
          if (chunk.type === 'done' && onDone) onDone(chunk);
        } catch {}
      }
    }
  }
};

/* ── Shared model cache ──────────────────────────────────────────────────── */
/* Loaded once per page session; refreshed on demand via refreshModelCache() */
let _modelCache = [];   // [{model, label, source, source_type, source_id, base_url}]
let _modelCacheLoaded = false;

async function getModels(forceRefresh = false) {
  if (_modelCacheLoaded && !forceRefresh) return _modelCache;
  try {
    _modelCache = await api.get('/models');
    _modelCacheLoaded = true;
  } catch {
    _modelCache = [];
  }
  return _modelCache;
}

/**
 * Populate a <select> element with live models from all sources.
 * selectedModel: currently saved model name to pre-select.
 * includeEmpty: whether to add a "— inherit default —" option.
 */
async function populateModelSelect(selectEl, selectedModel = '', includeEmpty = false) {
  if (!selectEl) return;
  selectEl.innerHTML = '<option value="">Loading models…</option>';
  selectEl.disabled = true;

  const models = await getModels();

  selectEl.innerHTML = '';
  if (includeEmpty) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '— inherit global default —';
    selectEl.appendChild(opt);
  }

  if (!models.length) {
    const opt = document.createElement('option');
    opt.value = selectedModel || 'llama3.2';
    opt.textContent = selectedModel || 'llama3.2 (no sources configured)';
    selectEl.appendChild(opt);
    selectEl.disabled = false;
    return;
  }

  // Group by source
  const bySource = {};
  for (const m of models) {
    if (!bySource[m.source]) bySource[m.source] = [];
    bySource[m.source].push(m);
  }

  for (const [sourceName, items] of Object.entries(bySource)) {
    const grp = document.createElement('optgroup');
    grp.label = sourceName;
    for (const m of items) {
      const opt = document.createElement('option');
      opt.value = m.model;
      opt.dataset.sourceId = m.source_id;
      opt.dataset.sourceName = m.source;
      opt.dataset.sourceType = m.source_type;
      opt.textContent = m.model;
      if (m.model === selectedModel) opt.selected = true;
      grp.appendChild(opt);
    }
    selectEl.appendChild(grp);
  }

  // If nothing matched the selected model (it may have been saved before a source change),
  // add it as a standalone option so data isn't lost.
  if (selectedModel && !models.find(m => m.model === selectedModel)) {
    const opt = document.createElement('option');
    opt.value = selectedModel;
    opt.textContent = `${selectedModel} (saved — source may be offline)`;
    opt.selected = true;
    selectEl.insertBefore(opt, selectEl.firstChild);
  }

  selectEl.disabled = false;
}
