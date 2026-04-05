/* ── Settings Page ── */

function renderSettings() {
  const page = document.getElementById('page-settings');
  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Settings</div>
        <div class="page-subtitle">System preferences, limits, and governance controls</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" onclick="saveSettings()">
          <i class="fa-solid fa-floppy-disk"></i> Save Changes
        </button>
      </div>
    </div>
    <div class="content-area">
      <div style="max-width:680px">

        <div class="card settings-section" style="margin-bottom:20px">
          <div class="settings-section-title">
            <i class="fa-solid fa-sliders" style="margin-right:8px;color:var(--accent)"></i>
            General
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Platform Name</div>
              <div class="setting-desc">Displayed in the browser tab</div>
            </div>
            <input class="form-input" id="s-platform-name" value="Agentic Platform" style="width:200px" />
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Default LLM Model</div>
              <div class="setting-desc">Fallback when no agent or node override is set. Live models from your configured sources.</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
              <select class="form-select" id="s-default-model" style="width:220px;font-family:var(--font-mono);font-size:12.5px">
                <option value="">Loading…</option>
              </select>
              <div style="font-size:11px;color:var(--muted)">
                <a href="#" onclick="navigate('models',document.querySelector('[data-page=models]'))" style="color:var(--accent)">Manage sources</a>
              </div>
            </div>
          </div>
        </div>

        <div class="card settings-section" style="margin-bottom:20px">
          <div class="settings-section-title">
            <i class="fa-solid fa-shield-halved" style="margin-right:8px;color:var(--green)"></i>
            Governance &amp; Safety
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Human-in-the-Loop (HITL)</div>
              <div class="setting-desc">Pause execution when confidence drops below threshold</div>
            </div>
            <label class="toggle"><input type="checkbox" id="s-hitl" checked /><div class="toggle-track"></div><div class="toggle-thumb"></div></label>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Trajectory Monitoring</div>
              <div class="setting-desc">Alert when execution deviates from expected sequences</div>
            </div>
            <label class="toggle"><input type="checkbox" id="s-trajectory" checked /><div class="toggle-track"></div><div class="toggle-thumb"></div></label>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Audit Logging</div>
              <div class="setting-desc">Record all CRUD operations and escalations</div>
            </div>
            <label class="toggle"><input type="checkbox" id="s-audit" checked /><div class="toggle-track"></div><div class="toggle-thumb"></div></label>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Global Max Tool Calls</div>
              <div class="setting-desc">Maximum tool calls per agent per execution</div>
            </div>
            <input class="form-input" type="number" id="s-max-tools" value="20" min="1" max="100" style="width:100px" />
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Max Execution Time (s)</div>
              <div class="setting-desc">Timeout for entire workflow execution</div>
            </div>
            <input class="form-input" type="number" id="s-max-time" value="300" min="10" style="width:100px" />
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Max Cost per Workflow ($)</div>
              <div class="setting-desc">Halt execution if cost exceeds this amount</div>
            </div>
            <input class="form-input" type="number" id="s-max-cost" value="5.00" step="0.50" min="0" style="width:100px" />
          </div>
        </div>

        <div class="card settings-section" style="margin-bottom:20px">
          <div class="settings-section-title">
            <i class="fa-solid fa-terminal" style="margin-right:8px;color:var(--amber)"></i>
            Observability
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Log Retention Days</div>
              <div class="setting-desc">Logs older than this will be pruned</div>
            </div>
            <input class="form-input" type="number" id="s-log-days" value="30" min="1" style="width:100px" />
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Real-time Log Streaming</div>
              <div class="setting-desc">Push log events via Server-Sent Events</div>
            </div>
            <label class="toggle"><input type="checkbox" id="s-sse" checked /><div class="toggle-track"></div><div class="toggle-thumb"></div></label>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Cost Tracking</div>
              <div class="setting-desc">Track token usage and estimated cost per workflow</div>
            </div>
            <label class="toggle"><input type="checkbox" id="s-cost" checked /><div class="toggle-track"></div><div class="toggle-thumb"></div></label>
          </div>
        </div>

        <div class="card settings-section" style="margin-bottom:20px">
          <div class="settings-section-title">
            <i class="fa-solid fa-database" style="margin-right:8px;color:var(--muted)"></i>
            Database
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Database Path</div>
              <div class="setting-desc">SQLite file location on disk</div>
            </div>
            <span style="font-family:var(--font-mono);font-size:12px;color:var(--muted)">data/platform.db</span>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Clear All Logs</div>
              <div class="setting-desc">Permanently delete all log and trace entries</div>
            </div>
            <button class="btn btn-danger btn-sm" onclick="clearAllLogs()">
              <i class="fa-solid fa-trash"></i> Clear Logs
            </button>
          </div>
        </div>

        <div class="card" style="background:var(--surface-2)">
          <div class="card-title">About</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div><div style="font-size:12px;color:var(--muted);margin-bottom:4px">Version</div><div style="font-size:13.5px;font-weight:600">2.0.0</div></div>
            <div><div style="font-size:12px;color:var(--muted);margin-bottom:4px">Backend</div><div style="font-size:13.5px;font-weight:600">FastAPI + SQLite</div></div>
            <div><div style="font-size:12px;color:var(--muted);margin-bottom:4px">Frontend</div><div style="font-size:13.5px;font-weight:600">Vanilla HTML/CSS/JS</div></div>
            <div>
              <div style="font-size:12px;color:var(--muted);margin-bottom:4px">API Docs</div>
              <a href="/docs" target="_blank" class="btn btn-secondary btn-sm">
                <i class="fa-solid fa-arrow-up-right-from-square"></i> /docs
              </a>
            </div>
          </div>
        </div>

      </div>
    </div>
  `;

  // Load persisted settings and populate model dropdown
  loadSettingsFromApi();
}

async function loadSettingsFromApi() {
  try {
    const s = await api.get('/settings');
    if (s.platform_name) document.getElementById('s-platform-name').value = s.platform_name;
    if (s.max_tool_calls) document.getElementById('s-max-tools').value = s.max_tool_calls;
    if (s.max_exec_time) document.getElementById('s-max-time').value = s.max_exec_time;
    if (s.max_cost) document.getElementById('s-max-cost').value = s.max_cost;
    if (s.log_retention_days) document.getElementById('s-log-days').value = s.log_retention_days;
    if (s.hitl === 'false') document.getElementById('s-hitl').checked = false;
    if (s.sse === 'false') document.getElementById('s-sse').checked = false;
    if (s.cost_tracking === 'false') document.getElementById('s-cost').checked = false;

    // Populate default model live from sources
    const sel = document.getElementById('s-default-model');
    await populateModelSelect(sel, s.default_model || '', true);
  } catch {
    // populate model dropdown even if settings load fails
    const sel = document.getElementById('s-default-model');
    if (sel) await populateModelSelect(sel, '', true);
  }
}

async function saveSettings() {
  const modelSel = document.getElementById('s-default-model');
  const settings = {
    platform_name: document.getElementById('s-platform-name').value,
    default_model: modelSel?.value || '',
    max_tool_calls: document.getElementById('s-max-tools').value,
    max_exec_time: document.getElementById('s-max-time').value,
    max_cost: document.getElementById('s-max-cost').value,
    log_retention_days: document.getElementById('s-log-days').value,
    hitl: document.getElementById('s-hitl').checked ? 'true' : 'false',
    sse: document.getElementById('s-sse').checked ? 'true' : 'false',
    cost_tracking: document.getElementById('s-cost').checked ? 'true' : 'false',
  };
  try {
    await api.put('/settings', settings);
    // Bust model cache if default model changed
    _modelCacheLoaded = false;
    toast('Settings saved', 'success');
  } catch { toast('Failed to save settings', 'error'); }
}

async function clearAllLogs() {
  openModal('Clear Logs & Traces',
    '<div style="text-align:center;padding:8px 0 16px">' +
    '<i class="fa-solid fa-triangle-exclamation" style="font-size:32px;color:var(--red);margin-bottom:12px;display:block"></i>' +
    '<p style="font-size:14px;color:var(--text)">Permanently delete all logs and traces?</p>' +
    '<p style="font-size:13px;color:var(--muted);margin-top:6px">This cannot be undone.</p>' +
    '</div>',
    '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-danger" onclick="closeModal();_doClearLogs()"><i class="fa-solid fa-trash"></i> Clear All</button>'
  );
}

async function _doClearLogs() {
  try {
    await api.post('/logs/clear', {});
    toast('Logs cleared', 'success');
  } catch { toast('Failed to clear logs', 'error'); }
}
