/* ── Agents Page ── */

let _agents = [];

async function renderAgents() {
  const page = document.getElementById('page-agents');
  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Agents</div>
        <div class="page-subtitle">Configure agents — model changes take effect immediately, even mid-workflow</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-sm" onclick="getModels(true).then(()=>toast('Model list refreshed','success'))">
          <i class="fa-solid fa-arrows-rotate"></i> Refresh Models
        </button>
        <button class="btn btn-primary" onclick="openAgentModal()">
          <i class="fa-solid fa-plus"></i> New Agent
        </button>
      </div>
    </div>
    <div class="content-area">
      <div class="filter-bar">
        <input class="search-input" placeholder="Search agents…" oninput="filterAgents(this.value)" />
      </div>
      <div id="agents-list"></div>
    </div>
  `;
  await loadAgents();
}

async function loadAgents() {
  try {
    _agents = await api.get('/agents');
    document.getElementById('agents-badge').textContent = _agents.length;
    renderAgentsList(_agents);
  } catch { toast('Failed to load agents', 'error'); }
}

function renderAgentsList(agents) {
  const el = document.getElementById('agents-list');
  if (!agents.length) {
    el.innerHTML = `<div class="empty-state">
      <i class="fa-solid fa-robot"></i><h3>No agents yet</h3><p>Create your first agent to get started.</p>
    </div>`;
    return;
  }

  el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px">
    ${agents.map(a => `
      <div class="card" id="agent-card-${a.id}" style="display:flex;flex-direction:column;gap:14px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
          <div style="flex:1;min-width:0">
            <div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:3px">${a.name}</div>
            <div style="font-size:12.5px;color:var(--muted);line-height:1.5">${truncate(a.description, 80)}</div>
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0">
            <button class="btn-icon" title="Chat with agent" onclick="quickChatAgent(${a.id},'${escAttr(a.name)}')">
              <i class="fa-solid fa-comments" style="color:var(--accent)"></i>
            </button>
            <button class="btn-icon" title="Test / preview" onclick="previewAgent(${a.id})">
              <i class="fa-solid fa-eye"></i>
            </button>
            <button class="btn-icon" title="Edit" onclick="openAgentModal(${a.id})">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn-icon" title="Delete" onclick="deleteAgent(${a.id})" style="color:var(--red)">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>

        <!-- Inline model switcher -->
        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--surface-2);border-radius:var(--radius);border:1px solid var(--border-light)">
          <i class="fa-solid fa-microchip" style="color:var(--muted);font-size:12px;flex-shrink:0"></i>
          <select class="form-select"
                  id="model-sel-${a.id}"
                  style="flex:1;font-family:var(--font-mono);font-size:12px;padding:5px 8px;border:none;background:transparent"
                  onchange="quickSwitchModel(${a.id}, this)">
            <option value="${a.llm_model}">${a.llm_model} (current)</option>
          </select>
          <span id="model-saved-${a.id}" style="font-size:11px;color:var(--green);display:none">
            <i class="fa-solid fa-circle-check"></i> Saved
          </span>
        </div>

        <div style="display:flex;gap:8px;align-items:center">
          <span class="badge badge-gray" style="font-size:11px">${a.llm_source || 'ollama'}</span>
          <span style="font-size:11.5px;color:var(--muted)">retries: ${a.autonomy_max_retries}</span>
          <span style="font-size:11.5px;color:var(--muted)">conf: ${a.autonomy_confidence_threshold}</span>
          <button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="quickChatAgent(${a.id},'${escAttr(a.name)}')">
            <i class="fa-solid fa-comments"></i> Chat
          </button>
        </div>
      </div>
    `).join('')}
  </div>`;

  // Populate model selects asynchronously
  agents.forEach(a => {
    const sel = document.getElementById(`model-sel-${a.id}`);
    if (sel) populateModelSelect(sel, a.llm_model);
  });
}

function filterAgents(q = '') {
  const filtered = _agents.filter(a =>
    a.name.toLowerCase().includes(q.toLowerCase()) ||
    (a.description || '').toLowerCase().includes(q.toLowerCase())
  );
  renderAgentsList(filtered);
}

async function quickSwitchModel(agentId, selectEl) {
  const model = selectEl.value;
  if (!model) return;
  const selectedOpt = selectEl.options[selectEl.selectedIndex];
  const source = selectedOpt.dataset.sourceName || '';
  try {
    await api.patch(`/agents/${agentId}/model`, { llm_model: model, llm_source: source });
    const ind = document.getElementById(`model-saved-${agentId}`);
    if (ind) { ind.style.display = 'inline'; setTimeout(() => ind.style.display = 'none', 2000); }
    // Update local cache
    const a = _agents.find(x => x.id === agentId);
    if (a) { a.llm_model = model; if (source) a.llm_source = source; }
    toast(`${_agents.find(x=>x.id===agentId)?.name}: model → ${model}`, 'success');
  } catch { toast('Model update failed', 'error'); }
}

async function openAgentModal(agentId = null) {
  const agent = agentId ? _agents.find(a => a.id === agentId) : null;
  const title = agent ? `Edit Agent — ${agent.name}` : 'New Agent';

  const body = `
    <div class="form-group">
      <label class="form-label">Agent Name *</label>
      <input class="form-input" id="a-name" placeholder="e.g. Research Agent" value="${agent?.name || ''}" />
    </div>
    <div class="form-group">
      <label class="form-label">Description</label>
      <input class="form-input" id="a-desc" placeholder="What does this agent do?" value="${agent?.description || ''}" />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">LLM Model</label>
        <select class="form-select" id="a-model"></select>
        <div style="font-size:11px;color:var(--muted);margin-top:4px">
          Live models from your configured sources.
          <a href="#" onclick="navigate('models',document.querySelector('[data-page=models]'));closeModal()" style="color:var(--accent)">Manage sources</a>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Source</label>
        <select class="form-select" id="a-source" disabled>
          <option>auto-detected from model</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Max Retries</label>
        <input class="form-input" id="a-retries" type="number" min="1" max="20" value="${agent?.autonomy_max_retries ?? 3}" />
      </div>
      <div class="form-group">
        <label class="form-label">Confidence Threshold</label>
        <input class="form-input" id="a-conf" type="number" step="0.05" min="0" max="1" value="${agent?.autonomy_confidence_threshold ?? 0.7}" />
      </div>
    </div>
    <div class="tabs" style="margin-bottom:12px">
      <div class="tab active" onclick="switchAgentTab(this,'skills-tab')">skills.md</div>
      <div class="tab" onclick="switchAgentTab(this,'tools-tab')">tools.py</div>
    </div>
    <div id="skills-tab">
      <label class="form-label">Skills Definition (Markdown)</label>
      <textarea class="form-textarea" id="a-skills" style="min-height:200px"></textarea>
    </div>
    <div id="tools-tab" style="display:none">
      <label class="form-label">Tools (Python)</label>
      <textarea class="form-textarea" id="a-tools" style="min-height:200px"></textarea>
    </div>
  `;

  const footer = `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="saveAgent(${agentId})">
      <i class="fa-solid fa-floppy-disk"></i> ${agentId ? 'Update' : 'Create'} Agent
    </button>
  `;
  openModal(title, body, footer);

  // Safe DOM assignment for textarea content (avoids XSS / broken HTML)
  const skillsTA = document.getElementById('a-skills');
  const toolsTA  = document.getElementById('a-tools');
  if (skillsTA) skillsTA.value = agent?.skills_md ||
    '# Agent Name\n\n## Role\nDescribe the agent\'s role.\n\n## Capabilities\n- Capability 1\n\n## Behavioral Guidelines\n- Guideline 1';
  if (toolsTA)  toolsTA.value  = agent?.tools_py  ||
    'def tool_name(param: str) -> str:\n    """Tool description."""\n    return f"Result: {param}"';

  // Populate model select after modal is in DOM
  setTimeout(async () => {
    const sel = document.getElementById('a-model');
    const srcSel = document.getElementById('a-source');
    if (!sel) return;
    await populateModelSelect(sel, agent?.llm_model || '');
    // Sync source select when model changes
    sel.addEventListener('change', () => {
      const opt = sel.options[sel.selectedIndex];
      const src = opt.dataset.sourceName || '';
      if (srcSel && src) { srcSel.innerHTML = `<option>${src}</option>`; }
    });
    sel.dispatchEvent(new Event('change'));
  }, 50);
}

function switchAgentTab(tabEl, showId) {
  document.querySelectorAll('.modal .tab').forEach(t => t.classList.remove('active'));
  tabEl.classList.add('active');
  ['skills-tab','tools-tab'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === showId ? 'block' : 'none';
  });
}

async function saveAgent(agentId) {
  const modelSel = document.getElementById('a-model');
  const selectedOpt = modelSel?.options[modelSel.selectedIndex];
  const data = {
    name: document.getElementById('a-name').value.trim(),
    description: document.getElementById('a-desc').value.trim(),
    llm_model: modelSel?.value || 'llama3.2',
    llm_source: selectedOpt?.dataset.sourceName || 'ollama',
    autonomy_max_retries: parseInt(document.getElementById('a-retries').value),
    autonomy_confidence_threshold: parseFloat(document.getElementById('a-conf').value),
    autonomy_max_steps: 10,
    skills_md: document.getElementById('a-skills').value,
    tools_py: document.getElementById('a-tools').value,
  };
  if (!data.name) { toast('Name is required', 'error'); return; }
  try {
    if (agentId) {
      await api.put(`/agents/${agentId}`, data);
      toast('Agent updated', 'success');
    } else {
      await api.post('/agents', data);
      toast('Agent created', 'success');
    }
    closeModal();
    await loadAgents();
  } catch { toast('Failed to save agent', 'error'); }
}

async function deleteAgent(id) {
  // Use modal instead of browser confirm
  openModal('Delete Agent',
    '<div style="text-align:center;padding:8px 0 16px">' +
    '<i class="fa-solid fa-triangle-exclamation" style="font-size:32px;color:var(--red);margin-bottom:12px;display:block"></i>' +
    '<p style="font-size:14px;color:var(--text)">Delete this agent?</p>' +
    '<p style="font-size:13px;color:var(--muted);margin-top:6px">All associated data will be removed. This cannot be undone.</p>' +
    '</div>',
    '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-danger" onclick="closeModal();_doDeleteAgent(' + id + ')"><i class="fa-solid fa-trash"></i> Delete</button>'
  );
}

async function _doDeleteAgent(id) {
  try {
    await api.del(`/agents/${id}`);
    toast('Agent deleted', 'success');
    await loadAgents();
  } catch { toast('Failed to delete', 'error'); }
}

/* ── Quick chat: open a dedicated session for this agent ── */
async function quickChatAgent(agentId, agentName) {
  try {
    const session = await api.post('/chat/sessions', {
      name: `Chat with ${agentName}`,
      agent_id: agentId
    });
    // Navigate to chat page and select this session
    navigate('chat', document.querySelector('[data-page=chat]'));
    setTimeout(() => selectSession(session.id), 200);
  } catch { toast('Could not open chat', 'error'); }
}

/* ── Preview / test agent inline ── */
async function previewAgent(id) {
  const agent = _agents.find(a => a.id === id);
  if (!agent) return;
  const body = `
    <div style="margin-bottom:16px">
      <div class="form-label">Test prompt for <strong>${agent.name}</strong></div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:8px">
        Using model: <code style="font-family:var(--font-mono)">${agent.llm_model}</code>
      </div>
      <textarea class="form-textarea" id="test-prompt" style="min-height:80px" placeholder="Enter a test message…">What can you help me with?</textarea>
    </div>
    <div id="test-response"></div>
  `;
  const footer = `
    <button class="btn btn-secondary" onclick="closeModal()">Close</button>
    <button class="btn btn-secondary" onclick="quickChatAgent(${id},'${escAttr(agent.name)}');closeModal()">
      <i class="fa-solid fa-comments"></i> Open Full Chat
    </button>
    <button class="btn btn-primary" onclick="runAgentTest(${id})">
      <i class="fa-solid fa-play"></i> Run Test
    </button>
  `;
  openModal(`Preview — ${agent.name}`, body, footer);
}

async function runAgentTest(id) {
  const prompt = document.getElementById('test-prompt')?.value;
  const resp = document.getElementById('test-response');
  if (!resp) return;
  resp.innerHTML = `<div style="color:var(--muted);font-size:12.5px"><i class="fa-solid fa-circle-notch fa-spin"></i> Running…</div>`;
  try {
    const result = await api.post(`/agents/${id}/test`, { prompt });
    resp.innerHTML = `
      <div class="card" style="margin-top:12px">
        <div style="font-size:13px;line-height:1.7;color:var(--text);white-space:pre-wrap">${result.response}</div>
        <div style="margin-top:10px;font-size:11.5px;color:var(--muted);font-family:var(--font-mono)">
          ${result.tokens} tokens · ${result.latency_ms}ms · model: ${_agents.find(a=>a.id===id)?.llm_model}
        </div>
      </div>`;
  } catch { resp.innerHTML = `<div style="color:var(--red)">Test failed — check backend logs</div>`; }
}

function escAttr(s) {
  return (s || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
