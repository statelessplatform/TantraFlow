/* ── Models Page ── */

let _modelSources = [];

async function renderModels() {
  const page = document.getElementById('page-models');
  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Models</div>
        <div class="page-subtitle">Manage LLM sources — models are fetched live from Ollama, LM Studio, or any OpenAI-compatible endpoint</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-sm" onclick="refreshAllModels()">
          <i class="fa-solid fa-arrows-rotate"></i> Refresh All
        </button>
        <button class="btn btn-primary" onclick="openAddSourceModal()">
          <i class="fa-solid fa-plus"></i> Add Source
        </button>
      </div>
    </div>
    <div class="content-area">
      <div id="sources-grid" class="models-grid"></div>

      <div class="section-divider"></div>

      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <div class="card-title" style="margin-bottom:0">All Available Models</div>
          <div style="font-size:12px;color:var(--muted)" id="models-total"></div>
        </div>
        <div id="all-models-list">
          <div style="color:var(--muted);font-size:13px;padding:12px">
            <i class="fa-solid fa-circle-notch fa-spin"></i> Fetching models from sources…
          </div>
        </div>
      </div>
    </div>
  `;
  await loadModelSources();
  await loadAllModels();
}

async function loadModelSources() {
  try {
    _modelSources = await api.get('/models/sources');
    renderSourcesGrid();
  } catch { toast('Failed to load model sources', 'error'); }
}

function renderSourcesGrid() {
  const el = document.getElementById('sources-grid');
  if (!_modelSources.length) {
    el.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <i class="fa-solid fa-microchip"></i>
      <h3>No sources configured</h3>
      <p>Add Ollama or LM Studio to load live models into agents and workflows.</p>
    </div>`;
    return;
  }

  const typeIcons = { ollama: 'fa-server', lmstudio: 'fa-desktop', openai_compat: 'fa-cloud' };
  const typeColors = { ollama: 'var(--green)', lmstudio: 'var(--accent)', openai_compat: 'var(--amber)' };
  const typeLabels = { ollama: 'Ollama', lmstudio: 'LM Studio', openai_compat: 'OpenAI-compat' };

  el.innerHTML = _modelSources.map(s => `
    <div class="model-source-card">
      <div class="source-header">
        <div class="source-icon" style="background:${typeColors[s.type] || 'var(--muted)'}20;color:${typeColors[s.type] || 'var(--muted)'}">
          <i class="fa-solid ${typeIcons[s.type] || 'fa-server'}"></i>
        </div>
        <div style="flex:1;min-width:0">
          <div class="source-name">${s.name}</div>
          <div class="source-url">${s.base_url}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          ${s.is_active
            ? `<span class="badge badge-green">Active</span>`
            : `<span class="badge badge-gray">Inactive</span>`}
          <span class="badge badge-gray" style="font-size:10.5px">${typeLabels[s.type] || s.type}</span>
        </div>
      </div>

      <div id="models-for-${s.id}" style="margin-bottom:10px">
        <button class="btn btn-secondary btn-sm" onclick="fetchLiveModels(${s.id})">
          <i class="fa-solid fa-arrows-rotate"></i> Check live models
        </button>
      </div>

      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" onclick="openEditSourceModal(${s.id})">
          <i class="fa-solid fa-pen"></i> Edit
        </button>
        <button class="btn btn-secondary btn-sm" onclick="fetchLiveModels(${s.id})">
          <i class="fa-solid fa-plug"></i> Test
        </button>
        <button class="btn-icon" style="color:var(--red);margin-left:auto" title="Delete source" onclick="deleteSource(${s.id})">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');

  // Auto-fetch models for all active sources
  _modelSources.filter(s => s.is_active).forEach(s => fetchLiveModels(s.id));
}

async function fetchLiveModels(sourceId) {
  const el = document.getElementById(`models-for-${sourceId}`);
  if (!el) return;
  el.innerHTML = `<span style="font-size:12px;color:var(--muted)"><i class="fa-solid fa-circle-notch fa-spin"></i> Connecting…</span>`;
  try {
    const data = await api.get(`/models/sources/${sourceId}/models`);
    if (data.online && data.models.length) {
      el.innerHTML = `
        <div style="font-size:11px;color:var(--green);font-weight:600;margin-bottom:6px">
          <i class="fa-solid fa-circle-check"></i> Online · ${data.models.length} model${data.models.length!==1?'s':''}
        </div>
        <div class="model-chips">${data.models.map(m =>
          `<span class="model-chip">${m}</span>`
        ).join('')}</div>`;
      // Invalidate global model cache so dropdowns refresh
      _modelCacheLoaded = false;
    } else {
      el.innerHTML = `<div style="font-size:12px;color:var(--red)">
        <i class="fa-solid fa-triangle-exclamation"></i>
        Offline — no models returned. Is the server running at <code>${_modelSources.find(s=>s.id===sourceId)?.base_url}</code>?
      </div>`;
    }
  } catch {
    el.innerHTML = `<div style="font-size:12px;color:var(--red)">
      <i class="fa-solid fa-triangle-exclamation"></i> Connection failed
    </div>`;
  }
}

async function loadAllModels() {
  const el = document.getElementById('all-models-list');
  const total = document.getElementById('models-total');
  try {
    const models = await api.get('/models');
    if (!models.length) {
      el.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:12px">
        No models available. Add a source and make sure the LLM server is running.
      </div>`;
      if (total) total.textContent = '';
      return;
    }
    if (total) total.textContent = `${models.length} model${models.length!==1?'s':''} across ${new Set(models.map(m=>m.source_id)).size} source${new Set(models.map(m=>m.source_id)).size!==1?'s':''}`;
    el.innerHTML = `<div class="table-wrap" style="border:none">
      <table>
        <thead><tr>
          <th>Model</th><th>Source</th><th>Type</th><th>Endpoint</th>
        </tr></thead>
        <tbody>
          ${models.map(m => `<tr>
            <td style="font-family:var(--font-mono);font-weight:500">${m.model}</td>
            <td>${m.source}</td>
            <td><span class="badge badge-gray">${m.source_type}</span></td>
            <td style="font-family:var(--font-mono);font-size:11.5px;color:var(--muted)">${m.base_url}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  } catch {
    el.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:12px">Failed to load models.</div>`;
  }
}

async function refreshAllModels() {
  _modelCacheLoaded = false;   // bust shared cache
  await loadModelSources();
  await loadAllModels();
  toast('Model list refreshed', 'success');
}

/* ── Add / Edit source modal ── */
function openAddSourceModal(source = null) {
  const isEdit = !!source;
  const body = `
    <div class="form-group">
      <label class="form-label">Source Name *</label>
      <input class="form-input" id="src-name" placeholder="e.g. Local Ollama" value="${source?.name || ''}" />
    </div>
    <div class="form-group">
      <label class="form-label">Type *</label>
      <select class="form-select" id="src-type" onchange="updateDefaultUrl()">
        <option value="ollama" ${source?.type==='ollama'?'selected':''}>Ollama</option>
        <option value="lmstudio" ${source?.type==='lmstudio'?'selected':''}>LM Studio</option>
        <option value="openai_compat" ${source?.type==='openai_compat'?'selected':''}>OpenAI-compatible</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Base URL *</label>
      <input class="form-input" id="src-url" value="${source?.base_url || 'http://localhost:11434'}" />
    </div>
    <div class="form-group">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" id="src-active" ${!source || source.is_active ? 'checked' : ''} />
        <span class="form-label" style="margin:0">Active</span>
      </label>
    </div>
    <div style="background:var(--accent-light);border:1px solid #bfdbfe;border-radius:var(--radius);padding:12px;font-size:12.5px;color:var(--accent)">
      <i class="fa-solid fa-circle-info"></i>
      Models are fetched live from the server — no hardcoded lists. Make sure the LLM server is running.
    </div>
  `;
  openModal(isEdit ? `Edit Source — ${source.name}` : 'Add Model Source', body, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="${isEdit ? `updateModelSource(${source.id})` : 'addModelSource()'}">
      <i class="fa-solid ${isEdit ? 'fa-floppy-disk' : 'fa-plus'}"></i> ${isEdit ? 'Save' : 'Add Source'}
    </button>
  `);
}

function openEditSourceModal(sourceId) {
  const source = _modelSources.find(s => s.id === sourceId);
  if (source) openAddSourceModal(source);
}

function updateDefaultUrl() {
  const type = document.getElementById('src-type').value;
  const urls = { ollama: 'http://localhost:11434', lmstudio: 'http://localhost:1234', openai_compat: 'https://api.openai.com/v1' };
  document.getElementById('src-url').value = urls[type] || '';
}

async function addModelSource() {
  const name = document.getElementById('src-name').value.trim();
  const type = document.getElementById('src-type').value;
  const base_url = document.getElementById('src-url').value.trim();
  const is_active = document.getElementById('src-active').checked ? 1 : 0;
  if (!name || !base_url) { toast('Name and URL are required', 'error'); return; }
  try {
    await api.post('/models/sources', { name, type, base_url, is_active });
    _modelCacheLoaded = false;
    toast('Source added', 'success');
    closeModal();
    await loadModelSources();
    await loadAllModels();
  } catch { toast('Failed to add source', 'error'); }
}

async function updateModelSource(id) {
  const name = document.getElementById('src-name').value.trim();
  const type = document.getElementById('src-type').value;
  const base_url = document.getElementById('src-url').value.trim();
  const is_active = document.getElementById('src-active').checked ? 1 : 0;
  if (!name || !base_url) { toast('Name and URL are required', 'error'); return; }
  try {
    await api.put(`/models/sources/${id}`, { name, type, base_url, is_active });
    _modelCacheLoaded = false;
    toast('Source updated', 'success');
    closeModal();
    await loadModelSources();
    await loadAllModels();
  } catch { toast('Failed to update source', 'error'); }
}

async function deleteSource(id) {
  openModal('Remove Model Source',
    '<div style="text-align:center;padding:8px 0 16px">' +
    '<i class="fa-solid fa-triangle-exclamation" style="font-size:32px;color:var(--amber);margin-bottom:12px;display:block"></i>' +
    '<p style="font-size:14px;color:var(--text)">Remove this model source?</p>' +
    '<p style="font-size:13px;color:var(--muted);margin-top:6px">Agents using its models will keep their model name but it won\'t be selectable until re-added.</p>' +
    '</div>',
    '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-danger" onclick="closeModal();_doDeleteSource(' + id + ')"><i class="fa-solid fa-trash"></i> Remove</button>'
  );
}

async function _doDeleteSource(id) {
  try {
    await api.del(`/models/sources/${id}`);
    toast('Source removed', 'success');
    renderModels();
  } catch { toast('Failed to remove source', 'error'); }
}
