/* ── Workflows Page ── */

let _workflows    = [];
let _wfLibrary    = [];   // workflow library metadata from /workflows/library

const WF_CATEGORY_ICONS = {
  business:      'fa-briefcase',
  marketing:     'fa-bullhorn',
  engineering:   'fa-code',
  analytics:     'fa-chart-bar',
  devops:        'fa-server',
  support:       'fa-headset',
  finance:       'fa-coins',
  documentation: 'fa-book',
  general:       'fa-diagram-project',
};

const WF_CATEGORY_COLORS = {
  business:      'var(--accent)',
  marketing:     '#7c3aed',
  engineering:   'var(--green)',
  analytics:     'var(--amber)',
  devops:        '#db2777',
  support:       '#0891b2',
  finance:       '#059669',
  documentation: 'var(--muted)',
  general:       'var(--muted)',
};

// ── Page render ────────────────────────────────────────────────────────────────

async function renderWorkflows() {
  const page = document.getElementById('page-workflows');
  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Workflows</div>
        <div class="page-subtitle">Multi-agent pipelines. Each node calls your LLM; outputs written to <code style="font-family:var(--font-mono);font-size:12px;background:var(--surface-2);padding:2px 6px;border-radius:4px">data/outputs/</code></div>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary" onclick="openImportModal()">
          <i class="fa-solid fa-arrow-down-to-bracket"></i> Import
        </button>
        <button class="btn btn-secondary" onclick="navigate('builder', document.querySelector('[data-page=builder]'))">
          <i class="fa-solid fa-pen-ruler"></i> Builder
        </button>
        <button class="btn btn-primary" onclick="openWorkflowModal()">
          <i class="fa-solid fa-plus"></i> New Workflow
        </button>
      </div>
    </div>
    <div class="content-area">
      <div class="tabs" id="wf-tabs">
        <div class="tab active" onclick="switchWfTab(this,'tab-my-wf')">
          <i class="fa-solid fa-folder-open"></i> My Workflows
          <span id="my-wf-count" class="nav-badge" style="background:var(--accent)">0</span>
        </div>
        <div class="tab" onclick="switchWfTab(this,'tab-library')">
          <i class="fa-solid fa-layer-group"></i> Library
          <span class="nav-badge" style="background:var(--green)">10</span>
        </div>
      </div>

      <!-- My Workflows -->
      <div id="tab-my-wf">
        <div class="filter-bar">
          <input class="search-input" placeholder="Search workflows…" oninput="filterWorkflows(this.value)" />
          <select class="form-select" style="width:auto;min-width:140px" onchange="filterWorkflowsByStatus(this.value)">
            <option value="">All statuses</option>
            <option value="active">active</option>
            <option value="draft">draft</option>
            <option value="paused">paused</option>
          </select>
        </div>
        <div id="workflows-list"></div>
      </div>

      <!-- Library -->
      <div id="tab-library" style="display:none">
        <div style="background:var(--accent-light);border:1px solid #bfdbfe;border-radius:var(--radius);
                    padding:12px 16px;margin-bottom:20px;font-size:13px;color:var(--accent);line-height:1.6">
          <i class="fa-solid fa-circle-info"></i>
          <strong>10 production-ready workflows</strong> auto-seeded into your instance on first run.
          Each has a full orchestrator + 3–6 specialist agents with complete skills and tools.
          Select a model on each agent, then click <strong>Run</strong>.
        </div>
        <div id="library-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px"></div>
      </div>
    </div>
  `;

  // Event delegation for My Workflows card buttons
  document.getElementById('workflows-list').addEventListener('click', e => {
    const btn = e.target.closest('[data-action][data-wf]');
    if (!btn) return;
    const id = parseInt(btn.dataset.wf);
    const wf = _workflows.find(w => w.id === id);
    if (!wf) return;
    const a = btn.dataset.action;
    if (a === 'chat')    quickChatWorkflow(id, wf.name);
    if (a === 'run')     openExecuteModal(id, wf.name);
    if (a === 'edit')    loadWorkflowInBuilder(id);
    if (a === 'history') viewExecutions(id, wf.name);
    if (a === 'export')  exportWorkflow(id, wf.name);
    if (a === 'delete')  deleteWorkflow(id);
    if (a === 'status')  openStatusModal(id, wf.name, wf.status);
    if (a === 'docs')    viewWorkflowDocs(id);
    if (a === 'monitor') openExecutionMonitor(null, wf.name, wf._latest_trace);
  });

  await loadWorkflows();
  await loadLibrary();
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

function switchWfTab(tabEl, showId) {
  document.querySelectorAll('#wf-tabs .tab').forEach(t => t.classList.remove('active'));
  tabEl.classList.add('active');
  ['tab-my-wf','tab-library'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === showId ? 'block' : 'none';
  });
}

// ── My Workflows ──────────────────────────────────────────────────────────────

async function loadWorkflows() {
  try {
    _workflows = await api.get('/workflows');
    document.getElementById('my-wf-count').textContent = _workflows.length;
    renderWorkflowsList(_workflows);
  } catch { toast('Failed to load workflows', 'error'); }
}

function renderWorkflowsList(workflows) {
  const el = document.getElementById('workflows-list');
  if (!workflows.length) {
    el.innerHTML = `<div class="empty-state">
      <i class="fa-solid fa-diagram-project"></i>
      <h3>No workflows yet</h3>
      <p>Check the Library tab — 10 production workflows are pre-built and ready to run.<br>
         Or create one from scratch in the Builder.</p>
      <button class="btn btn-primary" style="margin-top:16px"
              onclick="switchWfTab(document.querySelector('#wf-tabs .tab:nth-child(2)'),'tab-library')">
        <i class="fa-solid fa-layer-group"></i> Browse Library
      </button>
    </div>`;
    return;
  }

  const statusColors = { active:'var(--green)', draft:'var(--muted)', paused:'var(--amber)', archived:'var(--red)' };

  el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px">
    ${workflows.map(w => {
      const def    = w.definition || {};
      const nodes  = (def.nodes || []).length;
      const edges  = (def.edges || []).length;
      const meta   = def.meta || {};
      const cat    = meta.category || 'general';
      const sc     = statusColors[w.status] || 'var(--muted)';
      const catColor = WF_CATEGORY_COLORS[cat] || 'var(--muted)';
      const catIcon  = WF_CATEGORY_ICONS[cat] || 'fa-diagram-project';
      const hasDocs  = !!(meta.docs);
      const tags     = (meta.tags || []).slice(0,3);
      return `<div class="card" data-wf-id="${w.id}">
        <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:12px">
          <div style="width:38px;height:38px;border-radius:var(--radius);
                      background:${catColor}18;color:${catColor};
                      display:flex;align-items:center;justify-content:center;
                      font-size:15px;flex-shrink:0">
            <i class="fa-solid ${catIcon}"></i>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:14.5px;font-weight:600;color:var(--text);margin-bottom:3px">${w.name}</div>
            <div style="font-size:12.5px;color:var(--muted);line-height:1.5">${truncate(w.description, 80)}</div>
          </div>
          <button data-action="status" data-wf="${w.id}"
                  style="border:1px solid ${sc};color:${sc};background:transparent;padding:3px 10px;
                         border-radius:99px;font-size:11px;font-weight:600;cursor:pointer;
                         white-space:nowrap;flex-shrink:0">
            ${w.status || 'draft'}
          </button>
        </div>

        ${tags.length ? `<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px">
          ${tags.map(t => `<span style="font-size:11px;padding:2px 8px;background:var(--surface-2);
            border:1px solid var(--border);border-radius:99px;color:var(--muted)">${t}</span>`).join('')}
        </div>` : ''}

        <div style="display:flex;gap:10px;margin-bottom:14px">
          <div style="flex:1;text-align:center;padding:9px 6px;background:var(--surface-2);border-radius:var(--radius)">
            <div style="font-size:18px;font-weight:700;color:${catColor};font-family:var(--font-display)">${nodes}</div>
            <div style="font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.05em">Nodes</div>
          </div>
          <div style="flex:1;text-align:center;padding:9px 6px;background:var(--surface-2);border-radius:var(--radius)">
            <div style="font-size:18px;font-weight:700;color:var(--text);font-family:var(--font-display)">${edges}</div>
            <div style="font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.05em">Edges</div>
          </div>
          <div style="flex:1;text-align:center;padding:9px 6px;background:var(--surface-2);border-radius:var(--radius)">
            <div style="font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">Updated</div>
            <div style="font-size:11px;color:var(--text-2)">${formatDate(w.updated_at)}</div>
          </div>
        </div>

        <!-- Primary actions row: always a single line -->
        <div style="display:flex;gap:7px;align-items:center;margin-bottom:7px">
          <button class="btn btn-primary btn-sm" data-action="run" data-wf="${w.id}"
                  style="flex:1;justify-content:center">
            <i class="fa-solid fa-play"></i> Run
          </button>
          <button class="btn btn-secondary btn-sm" data-action="chat" data-wf="${w.id}"
                  style="flex:1;justify-content:center">
            <i class="fa-solid fa-comments"></i> Chat
          </button>
          <button class="btn btn-secondary btn-sm" data-action="monitor" data-wf="${w.id}"
                  title="Live monitor" style="flex:1;justify-content:center">
            <i class="fa-solid fa-satellite-dish"></i> Monitor
          </button>
        </div>
        <!-- Secondary icon-only row -->
        <div style="display:flex;gap:5px;align-items:center">
          <button class="btn btn-secondary btn-sm" data-action="edit" data-wf="${w.id}"
                  title="Open in Builder"
                  style="flex:1;justify-content:center">
            <i class="fa-solid fa-pen-ruler"></i> Edit
          </button>
          ${hasDocs ? `
          <button class="btn-icon" data-action="docs" data-wf="${w.id}" title="Documentation">
            <i class="fa-solid fa-book"></i>
          </button>` : ''}
          <button class="btn-icon" data-action="export" data-wf="${w.id}"
                  title="Export as JSON">
            <i class="fa-solid fa-arrow-up-from-bracket"></i>
          </button>
          <button class="btn-icon" data-action="history" data-wf="${w.id}"
                  title="Execution history">
            <i class="fa-solid fa-clock-rotate-left"></i>
          </button>
          <button class="btn-icon" data-action="delete" data-wf="${w.id}"
                  title="Delete workflow"
                  style="margin-left:auto;color:var(--red)">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function filterWorkflows(q = '') {
  const f = _workflows.filter(w =>
    w.name.toLowerCase().includes(q.toLowerCase()) ||
    (w.description||'').toLowerCase().includes(q.toLowerCase())
  );
  renderWorkflowsList(f);
}

function filterWorkflowsByStatus(status) {
  renderWorkflowsList(status ? _workflows.filter(w => w.status === status) : _workflows);
}

// ── Library ───────────────────────────────────────────────────────────────────

async function loadLibrary() {
  try {
    _wfLibrary = await api.get('/workflows/library');
    renderLibrary();
  } catch { /* library endpoint may not be available */ }
}

function renderLibrary() {
  const el = document.getElementById('library-grid');
  if (!el || !_wfLibrary.length) return;

  el.innerHTML = _wfLibrary.map((w, i) => {
    const cat      = w.category || 'general';
    const catColor = WF_CATEGORY_COLORS[cat] || 'var(--muted)';
    const catIcon  = WF_CATEGORY_ICONS[cat]  || 'fa-diagram-project';
    const tags     = (w.tags || []).slice(0, 4);
    // Output types visible from tags
    const outputTypes = tags.filter(t =>
      ['pdf','html','python','shell','batch','csv','email','txt','json','py','sh','bat'].includes(t.toLowerCase())
    );
    return `<div class="card" style="border-left:3px solid ${catColor}">
      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px">
        <div style="width:36px;height:36px;border-radius:var(--radius);background:${catColor}18;
                    color:${catColor};display:flex;align-items:center;justify-content:center;
                    font-size:14px;flex-shrink:0;margin-top:2px">
          <i class="fa-solid ${catIcon}"></i>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:2px">${i+1}. ${w.name}</div>
          <div style="font-size:12px;color:var(--muted)">${w.node_count} nodes · ${cat}</div>
        </div>
        <span class="badge badge-green" style="flex-shrink:0;font-size:10.5px">library</span>
      </div>

      <p style="font-size:12.5px;color:var(--text-2);line-height:1.6;margin-bottom:10px">
        ${w.description}
      </p>

      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:12px">
        ${tags.map(t => {
          const isOutput = ['pdf','html','py','sh','bat','csv','email','json'].includes(t.toLowerCase());
          return `<span style="font-size:11px;padding:2px 8px;
            background:${isOutput ? catColor+'18' : 'var(--surface-2)'};
            border:1px solid ${isOutput ? catColor+'40' : 'var(--border)'};
            color:${isOutput ? catColor : 'var(--muted)'};
            border-radius:99px;font-weight:${isOutput?'600':'400'}">${t}</span>`;
        }).join('')}
      </div>

      <div style="display:flex;gap:7px">
        <button class="btn btn-primary btn-sm" onclick="runLibraryWorkflow('${escAttr(w.name)}')">
          <i class="fa-solid fa-play"></i> Run
        </button>
        <button class="btn btn-secondary btn-sm" onclick="viewLibraryDocs('${escAttr(w.name)}')">
          <i class="fa-solid fa-book"></i> Docs
        </button>
        <button class="btn btn-secondary btn-sm" onclick="chatLibraryWorkflow('${escAttr(w.name)}')">
          <i class="fa-solid fa-comments"></i> Chat
        </button>
      </div>
    </div>`;
  }).join('');
}

async function runLibraryWorkflow(name) {
  // Find in My Workflows (should be seeded there)
  const wf = _workflows.find(w => w.name === name);
  if (wf) { openExecuteModal(wf.id, wf.name); return; }
  toast(`Workflow "${name}" not found in My Workflows. It may not have been seeded yet — restart the server.`, 'error');
}

async function chatLibraryWorkflow(name) {
  const wf = _workflows.find(w => w.name === name);
  if (wf) { quickChatWorkflow(wf.id, wf.name); return; }
  toast('Workflow not found in My Workflows', 'error');
}

function viewLibraryDocs(name) {
  const lib = _wfLibrary.find(w => w.name === name);
  if (!lib?.docs) { toast('No documentation for this workflow', 'info'); return; }
  const body = `
    <div style="font-size:13px;color:var(--text-2);line-height:1.7">
      <pre style="white-space:pre-wrap;font-family:var(--font);font-size:13px;line-height:1.7;
                  background:none;border:none;padding:0">${lib.docs}</pre>
    </div>
    <div style="margin-top:14px;padding:12px 14px;background:var(--surface-2);
                border-radius:var(--radius);font-size:12.5px;color:var(--muted)">
      <i class="fa-solid fa-tag"></i> Tags: ${(lib.tags||[]).join(' · ')}
      &nbsp;&nbsp; <i class="fa-solid fa-circle-nodes"></i> ${lib.node_count} nodes
    </div>`;
  openModal(`Documentation — ${name}`, body,
    `<button class="btn btn-secondary" onclick="closeModal()">Close</button>
     <button class="btn btn-primary" onclick="runLibraryWorkflow('${escAttr(name)}');closeModal()">
       <i class="fa-solid fa-play"></i> Run This Workflow
     </button>`);
}

function viewWorkflowDocs(id) {
  const wf = _workflows.find(w => w.id === id);
  if (!wf) return;
  const meta = wf.definition?.meta || {};
  const docs = meta.docs || '';
  if (!docs) { toast('No documentation embedded in this workflow', 'info'); return; }
  const body = `<pre style="white-space:pre-wrap;font-family:var(--font);font-size:13px;
                             line-height:1.7;background:none;border:none;padding:0">${docs}</pre>`;
  openModal(`Documentation — ${wf.name}`, body,
    `<button class="btn btn-secondary" onclick="closeModal()">Close</button>`);
}

// ── Status modal ──────────────────────────────────────────────────────────────

function openStatusModal(id, name, currentStatus) {
  const statuses = ['draft','active','paused','archived'];
  const descriptions = {
    draft:    'Work in progress. Will not appear in Run suggestions.',
    active:   'Ready to execute. Chat, Run, and scheduling are live.',
    paused:   'Temporarily suspended — no new executions started.',
    archived: 'Retired. Kept for history but hidden from active views.',
  };
  const body = `
    <p style="font-size:13.5px;color:var(--text-2);margin-bottom:14px">
      Change status of <strong>${name}</strong>:
    </p>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${statuses.map(s => `
        <label style="display:flex;align-items:center;gap:12px;padding:11px 14px;
               border:1px solid ${s===currentStatus?'var(--accent)':'var(--border)'};
               border-radius:var(--radius);cursor:pointer;
               background:${s===currentStatus?'var(--accent-light)':'var(--surface)'}">
          <input type="radio" name="wf-status" value="${s}" ${s===currentStatus?'checked':''} />
          <div>
            <div style="font-size:13.5px;font-weight:600">${s}</div>
            <div style="font-size:12px;color:var(--muted)">${descriptions[s]}</div>
          </div>
        </label>`).join('')}
    </div>`;
  openModal(`Status — ${name}`, body, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="applyStatus(${id})">Apply</button>`);
}

async function applyStatus(id) {
  const status = document.querySelector('input[name="wf-status"]:checked')?.value;
  if (!status) return;
  try {
    await api.patch(`/workflows/${id}/status`, { status });
    toast(`Status → ${status}`, 'success');
    closeModal();
    await loadWorkflows();
  } catch { toast('Failed to update status', 'error'); }
}

// ── Execute modal ─────────────────────────────────────────────────────────────

function openExecuteModal(id, name) {
  const wf      = _workflows.find(w => w.id === id);
  const meta    = wf?.definition?.meta || {};
  const docs    = meta.docs ? `<details style="margin-bottom:14px">
    <summary style="cursor:pointer;font-size:12.5px;color:var(--accent);user-select:none">
      <i class="fa-solid fa-book"></i> View workflow documentation
    </summary>
    <pre style="white-space:pre-wrap;font-size:12px;line-height:1.6;
                background:var(--surface-2);border:1px solid var(--border);
                border-radius:var(--radius);padding:12px;margin-top:8px;
                font-family:var(--font);max-height:180px;overflow-y:auto">${meta.docs}</pre>
  </details>` : '';
  const nodes   = wf?.definition?.nodes || [];
  const nodeList = nodes.length ? `
    <div style="margin-bottom:14px;padding:10px 14px;background:var(--surface-2);
                border-radius:var(--radius);border:1px solid var(--border-light)">
      <div style="font-size:12px;font-weight:600;color:var(--text-2);margin-bottom:6px">
        <i class="fa-solid fa-circle-nodes" style="color:var(--accent)"></i>
        Pipeline: ${nodes.length} nodes
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        ${nodes.map((n,i) => `
          <span style="font-size:12px;padding:3px 10px;background:var(--surface);
                       border:1px solid var(--border);border-radius:var(--radius);color:var(--text-2)">
            ${i+1}. ${n.label || 'Node'}
            <span style="font-size:10px;color:var(--muted);margin-left:4px">.${n.output_type||'txt'}</span>
          </span>
          ${i < nodes.length-1 ? '<i class="fa-solid fa-arrow-right" style="color:var(--muted);font-size:10px"></i>' : ''}`
        ).join('')}
      </div>
    </div>` : '';

  const body = `
    ${docs}
    ${nodeList}
    <div style="background:var(--accent-light);border:1px solid #bfdbfe;border-radius:var(--radius);
                padding:10px 14px;margin-bottom:14px;font-size:12.5px;color:var(--accent);line-height:1.6">
      <i class="fa-solid fa-circle-info"></i>
      Each node calls your LLM in sequence. The only input you provide is the task description below.
      Each agent's model is set via the <strong>Agents page</strong> (inline model switcher).
      Outputs are saved to <code style="font-family:var(--font-mono)">data/outputs/&lt;trace_id&gt;/</code>.
    </div>
    <div class="form-group">
      <label class="form-label">Task / Input *</label>
      <textarea class="form-textarea" id="exec-input" style="min-height:100px"
        placeholder="Describe the task for this workflow…"></textarea>
    </div>
    <div id="exec-result"></div>`;

  openModal(`Run — ${name}`, body, `
    <button class="btn btn-secondary" id="exec-cancel-btn" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" id="exec-btn" onclick="runExecution(${id})">
      <i class="fa-solid fa-play"></i> Execute Now
    </button>`);

  // Pre-fill example input from first library doc
  const lib = _wfLibrary.find(w => w.name === name);
  if (lib && !document.getElementById('exec-input').value) {
    document.getElementById('exec-input').value =
      `Run the "${name}" workflow with your best judgment on scope and detail.`;
  }
}

async function runExecution(wfId) {
  const input   = document.getElementById('exec-input')?.value.trim();
  const resultEl = document.getElementById('exec-result');
  if (!input) { toast('Please enter a task', 'error'); return; }

  const setButtons = (running) => {
    const btn = document.getElementById('exec-btn');
    const can = document.getElementById('exec-cancel-btn');
    if (btn) {
      btn.disabled = running;
      btn.innerHTML = running
        ? '<i class="fa-solid fa-circle-notch fa-spin"></i> Running…'
        : '<i class="fa-solid fa-rotate-right"></i> Run Again';
    }
    if (can) can.textContent = running ? 'Running…' : 'Close';
  };

  setButtons(true);
  resultEl.innerHTML = '';

  let result;
  try {
    result = await api.post(`/workflows/${wfId}/execute`, { input });
  } catch (e) {
    resultEl.innerHTML = `<div style="color:var(--red);margin-top:12px;padding:12px;
      background:var(--red-light);border:1px solid #fca5a5;border-radius:var(--radius);font-size:13px">
      <i class="fa-solid fa-triangle-exclamation"></i> <strong>Failed to start:</strong> ${e.message}
    </div>`;
    setButtons(false);
    return;
  }

  resultEl.innerHTML = `
    <div style="margin-top:14px;border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden">
      <div style="background:var(--surface-2);padding:12px 16px;border-bottom:1px solid var(--border);
                  display:flex;align-items:center;gap:10px">
        <i class="fa-solid fa-circle-nodes" style="color:var(--accent)"></i>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600">Execution #${result.execution_id}</div>
          <div style="font-family:var(--font-mono);font-size:10.5px;color:var(--muted);margin-top:1px">${result.trace_id}</div>
        </div>
        <span id="exec-status-badge" style="font-size:11.5px;font-weight:600;padding:3px 10px;
              border-radius:99px;background:var(--amber-light);color:var(--amber)">
          <i class="fa-solid fa-circle-notch fa-spin"></i> running
        </span>
      </div>
      <div style="padding:14px 16px">
        <div id="exec-poll-status" style="font-size:13px;color:var(--muted);margin-bottom:12px">
          <i class="fa-solid fa-circle-notch fa-spin"></i> Calling LLM nodes in sequence…
        </div>
        <div id="exec-node-progress" style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px"></div>
        <div id="exec-files"></div>
      </div>
    </div>`;

  await pollExecution(result.execution_id, result.trace_id, setButtons);
}

async function pollExecution(execId, traceId, onDone) {
  let attempts = 0;
  const check = async () => {
    attempts++;
    const statusEl   = document.getElementById('exec-poll-status');
    const badgeEl    = document.getElementById('exec-status-badge');
    const progressEl = document.getElementById('exec-node-progress');
    const filesEl    = document.getElementById('exec-files');
    if (!statusEl) return; // modal closed

    let exec;
    try { exec = await api.get(`/executions/${execId}`); }
    catch { setTimeout(check, 3000); return; }

    if (exec.status === 'running') {
      statusEl.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Running — ${attempts*2}s elapsed. LLM is working…`;
      if (exec.trace?.spans?.length) renderNodeProgress(progressEl, exec.trace.spans);
      if (attempts < 150) setTimeout(check, 2000);
      else { statusEl.innerHTML = 'Still running after 5 min — check Logs page.'; if (onDone) onDone(false); }
      return;
    }

    // Finished
    const ok = exec.status === 'success';
    const elapsed = exec.finished_at && exec.started_at
      ? Math.round((new Date(exec.finished_at) - new Date(exec.started_at)) / 1000) : attempts * 2;

    if (badgeEl) {
      badgeEl.style.background = ok ? 'var(--green-light)' : 'var(--red-light)';
      badgeEl.style.color      = ok ? 'var(--green)'       : 'var(--red)';
      badgeEl.innerHTML        = ok ? '<i class="fa-solid fa-circle-check"></i> completed'
                                    : '<i class="fa-solid fa-circle-xmark"></i> failed';
    }
    if (statusEl) {
      statusEl.innerHTML = ok
        ? `<i class="fa-solid fa-circle-check" style="color:var(--green)"></i>
           <strong>Done</strong> — ${elapsed}s · ${exec.total_tokens||0} tokens · $${(exec.total_cost||0).toFixed(4)}`
        : `<i class="fa-solid fa-circle-xmark" style="color:var(--red)"></i>
           <strong>Failed</strong> — ${(exec.output||'').slice(0,200)}
           <br><a href="#" onclick="navigate('logs',document.querySelector('[data-page=logs]'))"
                style="font-size:12px;color:var(--accent)">View Logs</a>`;
    }

    if (exec.trace?.spans?.length && progressEl) renderNodeProgress(progressEl, exec.trace.spans);

    // LLM error warning
    const errNodes = (exec.trace?.spans||[]).filter(s => (s.output||'').startsWith('[LLM ERROR]'));
    if (errNodes.length && statusEl) {
      statusEl.innerHTML += `<div style="margin-top:8px;padding:10px 12px;background:var(--amber-light);
        border:1px solid #fcd34d;border-radius:var(--radius);font-size:12.5px;color:#92400e">
        <i class="fa-solid fa-triangle-exclamation"></i>
        ${errNodes.length} node(s) could not reach the LLM.
        Run <code>ollama serve</code> and ensure the model is pulled
        (<code>ollama pull ${errNodes[0]?.model||'llama3.2'}</code>).
        Set the model on each agent in the <strong>Agents</strong> page.
      </div>`;
    }

    // Output files
    if (ok && filesEl) {
      try {
        const files = await api.get(`/outputs/${traceId}/files`);
        if (files.files?.length) {
          filesEl.innerHTML = `
            <div style="font-size:12px;font-weight:600;color:var(--text-2);margin-bottom:8px">
              <i class="fa-solid fa-folder-open" style="color:var(--accent)"></i> Output files
              <span style="font-family:var(--font-mono);font-size:10.5px;color:var(--muted);
                           font-weight:400;margin-left:6px">
                …/${traceId.slice(0,12)}/
              </span>
            </div>
            <div style="display:flex;flex-direction:column;gap:5px">
              ${files.files.map(f => `
                <a href="${f.url}" download="${f.name}" target="_blank"
                   style="display:flex;align-items:center;gap:10px;padding:9px 12px;
                          background:var(--surface-2);border:1px solid var(--border);
                          border-radius:var(--radius);text-decoration:none;color:var(--text)">
                  <i class="fa-solid ${fileIcon(f.name)}" style="color:var(--accent);font-size:14px;flex-shrink:0"></i>
                  <span style="flex:1;font-weight:500;font-size:13px">${f.name}</span>
                  <span style="font-size:11.5px;color:var(--muted)">${formatBytes(f.size)}</span>
                  <i class="fa-solid fa-download" style="color:var(--muted);font-size:12px"></i>
                </a>`).join('')}
            </div>`;
        }
      } catch {}
    }
    if (onDone) onDone(false);
  };
  check();
}

function renderNodeProgress(el, spans) {
  if (!el) return;
  el.innerHTML = spans.map((s, i) => {
    const isErr = s.status === 'error' || (s.output||'').startsWith('[LLM ERROR]');
    const color = isErr ? 'var(--red)' : 'var(--green)';
    const icon  = isErr ? 'fa-circle-xmark' : 'fa-circle-check';
    const extBadge = s.file ? `<span style="font-family:var(--font-mono);font-size:10.5px;
      color:var(--accent);background:var(--accent-light);padding:2px 7px;border-radius:4px">.${s.file.split('.').pop()}</span>` : '';
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;
                background:var(--surface-2);border-radius:var(--radius);border:1px solid var(--border-light)">
      <i class="fa-solid ${icon}" style="color:${color};font-size:13px;flex-shrink:0"></i>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500">${i+1}. ${s.name}</div>
        <div style="font-size:11.5px;color:var(--muted);font-family:var(--font-mono)">
          ${s.model||'?'} · ${s.latency_ms||0}ms · ${s.tokens||0} tok
        </div>
      </div>
      ${extBadge}
      <span style="font-size:10.5px;padding:2px 7px;border-radius:99px;font-weight:600;
                   background:${isErr?'var(--red-light)':'var(--green-light)'};
                   color:${isErr?'var(--red)':'var(--green)'}">${isErr?'error':'ok'}</span>
    </div>`;
  }).join('');
}

// ── Export / Import ───────────────────────────────────────────────────────────

async function exportWorkflow(id, name) {
  try {
    toast(`Exporting "${name}"…`, 'info');
    const resp = await fetch(`/api/v1/workflows/${id}/export`);
    if (!resp.ok) throw new Error(await resp.text());
    const blob = await resp.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${name.replace(/[^a-z0-9]/gi,'_')}_workflow.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exported "${name}" as JSON bundle`, 'success');
  } catch (e) { toast('Export failed: ' + e.message, 'error'); }
}

function openImportModal() {
  const body = `
    <div style="background:var(--accent-light);border:1px solid #bfdbfe;border-radius:var(--radius);
                padding:12px 14px;margin-bottom:16px;font-size:13px;color:var(--accent);line-height:1.6">
      <i class="fa-solid fa-circle-info"></i>
      Import a workflow bundle exported from this platform (or another instance).
      The bundle includes the workflow <strong>and all its agents</strong> with their skills and tools.
      Agents are matched by name — existing agents are updated, new ones are created.
    </div>
    <div class="form-group">
      <label class="form-label">Paste JSON bundle *</label>
      <textarea class="form-textarea" id="import-json" style="min-height:200px;font-family:var(--font-mono);font-size:12px"
        placeholder='{"format":"agentic-platform-workflow","version":"1.0","workflow":{...},"agents":[...]}'></textarea>
    </div>
    <div style="font-size:12px;color:var(--muted)">
      Or drag a .json file onto the text area above — it will be read automatically.
    </div>
    <div id="import-result"></div>`;

  openModal('Import Workflow Bundle', body, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="importWorkflow()">
      <i class="fa-solid fa-arrow-down-to-bracket"></i> Import
    </button>`);

  // Drag-and-drop file reader
  setTimeout(() => {
    const ta = document.getElementById('import-json');
    if (!ta) return;
    ta.addEventListener('dragover', e => e.preventDefault());
    ta.addEventListener('drop', e => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => { ta.value = ev.target.result; };
      reader.readAsText(file);
    });
  }, 50);
}

async function importWorkflow() {
  const jsonText = document.getElementById('import-json')?.value.trim();
  const resultEl = document.getElementById('import-result');
  if (!jsonText) { toast('Paste a JSON bundle first', 'error'); return; }

  let bundle;
  try { bundle = JSON.parse(jsonText); }
  catch { toast('Invalid JSON', 'error'); return; }

  try {
    const result = await api.post('/workflows/import', bundle);
    if (resultEl) {
      resultEl.innerHTML = `
        <div style="margin-top:12px;padding:12px 14px;background:var(--green-light);
                    border:1px solid #6ee7b7;border-radius:var(--radius);font-size:13px">
          <div style="font-weight:600;color:var(--green);margin-bottom:6px">
            <i class="fa-solid fa-circle-check"></i> Imported successfully
          </div>
          <div style="color:var(--text-2)">
            Workflow: <strong>${result.workflow_name}</strong> (ID: ${result.workflow_id})<br>
            Agents created: ${result.agents_created} · updated: ${result.agents_updated}
          </div>
          <div style="margin-top:8px;font-size:12px;color:var(--muted)">
            Set the LLM model for each agent in the <strong>Agents</strong> page before running.
          </div>
        </div>`;
    }
    toast(`Imported "${result.workflow_name}"`, 'success');
    await loadWorkflows();
  } catch (e) { toast('Import failed: ' + e.message, 'error'); }
}

// ── Other actions ─────────────────────────────────────────────────────────────

function openWorkflowModal(wf = null) {
  const body = `
    <div class="form-group">
      <label class="form-label">Workflow Name *</label>
      <input class="form-input" id="wf-name" value="${wf?.name||''}" placeholder="e.g. Article → PDF Pipeline" />
    </div>
    <div class="form-group">
      <label class="form-label">Description</label>
      <textarea class="form-textarea" id="wf-desc" style="min-height:80px"
        placeholder="What does this workflow accomplish?">${wf?.description||''}</textarea>
    </div>
    <div style="font-size:13px;color:var(--text-2);padding:12px;background:var(--surface-2);border-radius:var(--radius)">
      <i class="fa-solid fa-circle-info" style="color:var(--accent)"></i>
      After creating, open the <strong>Builder</strong> to drag agents onto the canvas.
      Each node's output feeds into the next as context.
    </div>`;
  openModal(wf ? `Edit — ${wf.name}` : 'New Workflow', body, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="saveWorkflow(${wf?.id||null})">
      <i class="fa-solid fa-floppy-disk"></i> ${wf ? 'Update' : 'Create'}
    </button>`);
}

async function saveWorkflow(id) {
  const name        = document.getElementById('wf-name').value.trim();
  const description = document.getElementById('wf-desc').value.trim();
  if (!name) { toast('Name required', 'error'); return; }
  try {
    if (id) {
      const wf = _workflows.find(w => w.id === id);
      await api.put(`/workflows/${id}`, { name, description, definition: wf?.definition||{}, status: wf?.status||'draft' });
      toast('Updated', 'success');
    } else {
      await api.post('/workflows', { name, description, definition: { nodes:[], edges:[] } });
      toast('Created — open Builder to add nodes', 'success');
    }
    closeModal();
    await loadWorkflows();
  } catch { toast('Failed to save', 'error'); }
}

async function deleteWorkflow(id) {
  const wf = _workflows.find(w => w.id === id);
  openModal('Delete Workflow',
    '<div style="text-align:center;padding:8px 0 16px">' +
    '<i class="fa-solid fa-triangle-exclamation" style="font-size:32px;color:var(--red);margin-bottom:12px;display:block"></i>' +
    '<p style="font-size:14px;color:var(--text)">Delete <strong>' + (wf?.name||'this workflow') + '</strong>?</p>' +
    '<p style="font-size:13px;color:var(--muted);margin-top:6px">All execution history will be lost. This cannot be undone.</p>' +
    '</div>',
    '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-danger" onclick="closeModal();_doDeleteWorkflow(' + id + ')"><i class="fa-solid fa-trash"></i> Delete</button>'
  );
}

async function _doDeleteWorkflow(id) {
  try {
    await api.del(`/workflows/${id}`);
    toast('Workflow deleted', 'success');
    await loadWorkflows();
  } catch { toast('Failed to delete', 'error'); }
}

async function viewExecutions(id, name) {
  let execs = [];
  try { execs = await api.get(`/workflows/${id}/executions`); } catch {}
  const body = execs.length ? `
    <div style="display:flex;flex-direction:column;gap:8px">
      ${execs.map(e => `
        <div style="border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
            ${statusBadge(e.status)}
            <span style="font-size:12px;color:var(--muted)">${formatDate(e.started_at)}</span>
            <span style="font-size:12px;color:var(--muted);margin-left:auto">
              ${e.total_tokens} tok · $${(e.total_cost||0).toFixed(4)}
            </span>
          </div>
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--muted)">
            ${e.trace_id?.slice(0,28)}…
          </div>
          ${e.status==='success' ? `
            <button class="btn btn-secondary btn-sm" style="margin-top:8px"
                    onclick="viewOutputFiles('${e.trace_id}')">
              <i class="fa-solid fa-folder-open"></i> Output Files
            </button>` : ''}
        </div>`).join('')}
    </div>
  ` : `<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>No executions yet</p></div>`;

  openModal(`Execution History — ${name}`, body,
    `<button class="btn btn-secondary" onclick="closeModal()">Close</button>`);
}

async function viewOutputFiles(traceId) {
  try {
    const files = await api.get(`/outputs/${traceId}/files`);
    const body = files.files?.length ? `
      <div style="font-family:var(--font-mono);font-size:11px;color:var(--muted);
                  word-break:break-all;margin-bottom:12px">${files.output_dir}</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${files.files.map(f => `
          <a href="${f.url}" download="${f.name}" target="_blank"
             style="display:flex;align-items:center;gap:10px;padding:10px 12px;
                    background:var(--surface-2);border:1px solid var(--border);
                    border-radius:var(--radius);text-decoration:none;color:var(--text)">
            <i class="fa-solid ${fileIcon(f.name)}" style="color:var(--accent)"></i>
            <span style="flex:1;font-size:13.5px">${f.name}</span>
            <span style="font-size:11.5px;color:var(--muted)">${formatBytes(f.size)}</span>
            <i class="fa-solid fa-download" style="color:var(--muted);font-size:12px"></i>
          </a>`).join('')}
      </div>` : `<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>No files found</p></div>`;

    openModal('Output Files', body,
      `<button class="btn btn-secondary" onclick="closeModal()">Close</button>`);
  } catch { toast('Could not load files', 'error'); }
}

async function quickChatWorkflow(workflowId, workflowName) {
  try {
    const session = await api.post('/chat/sessions', {
      name: `Chat — ${workflowName}`,
      workflow_id: workflowId
    });
    navigate('chat', document.querySelector('[data-page=chat]'));
    setTimeout(() => selectSession(session.id), 200);
  } catch { toast('Could not open chat', 'error'); }
}

async function loadWorkflowInBuilder(id) {
  navigate('builder', document.querySelector('[data-page=builder]'));
  setTimeout(async () => {
    try {
      const wf = await api.get(`/workflows/${id}`);
      if (window._builderLoadWorkflow) window._builderLoadWorkflow(wf);
    } catch {}
  }, 100);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (ext === 'pdf')  return 'fa-file-pdf';
  if (ext === 'html') return 'fa-file-code';
  if (ext === 'json') return 'fa-file-lines';
  if (ext === 'md')   return 'fa-file-lines';
  if (ext === 'py')   return 'fa-file-code';
  if (ext === 'sh')   return 'fa-terminal';
  if (ext === 'bat')  return 'fa-terminal';
  if (ext === 'csv')  return 'fa-table';
  return 'fa-file-alt';
}

function formatBytes(b) {
  if (!b || b < 1024) return `${b||0} B`;
  if (b < 1024*1024)  return `${(b/1024).toFixed(1)} KB`;
  return `${(b/(1024*1024)).toFixed(1)} MB`;
}

function escAttr(s) {
  return (s||'').replace(/'/g,"\\'").replace(/"/g,'&quot;');
}
