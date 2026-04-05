/* ── App Entry Point ── */

const PAGE_RENDERERS = {
  dashboard: renderDashboard,
  workflows:  renderWorkflows,
  builder:    renderBuilder,
  agents:     renderAgents,
  skills:     renderSkills,
  models:     renderModels,
  chat:       renderChat,
  logs:       renderLogs,
  settings:   renderSettings,
};

let _currentPage = null;

// ── Navigation ────────────────────────────────────────────────────────────────

function navigate(page, navEl) {
  // Highlight correct nav item
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  if (navEl) {
    navEl.classList.add('active');
  } else {
    const target = document.querySelector(`[data-page="${page}"]`);
    if (target) target.classList.add('active');
  }

  // Show the correct page div
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add('active');

  _currentPage = page;
  if (PAGE_RENDERERS[page]) PAGE_RENDERERS[page]();
}

// ── LLM status indicator ──────────────────────────────────────────────────────

async function checkLLMStatus() {
  const dot   = document.getElementById('llm-status-dot');
  const label = document.getElementById('llm-status-label');
  if (!dot || !label) return;

  try {
    const sources = await api.get('/models/sources');
    const active  = sources.filter(s => s.is_active);
    if (!active.length) {
      dot.className   = 'status-dot offline';
      label.textContent = 'No sources';
      return;
    }
    // Try to hit the first active source
    const check = await api.get(`/models/sources/${active[0].id}/models`);
    if (check.online) {
      dot.className   = 'status-dot online';
      const totalModels = await api.get('/models');
      label.textContent = `${totalModels.length} model${totalModels.length !== 1 ? 's' : ''} online`;
      // Warm the cache
      _modelCache       = totalModels;
      _modelCacheLoaded = true;
    } else {
      dot.className   = 'status-dot offline';
      label.textContent = `${active.length} source${active.length !== 1 ? 's' : ''} (offline)`;
    }
  } catch {
    dot.className   = 'status-dot offline';
    label.textContent = 'API offline';
  }
}

// ── Agent badge ───────────────────────────────────────────────────────────────

async function refreshAgentBadge() {
  try {
    const agents = await api.get('/agents');
    const badge  = document.getElementById('agents-badge');
    if (badge) badge.textContent = agents.length;
  } catch {}
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Default page
  navigate('dashboard', document.querySelector('[data-page=dashboard]'));

  // Status checks
  checkLLMStatus();
  refreshAgentBadge();

  // Periodic refresh every 30 s
  setInterval(checkLLMStatus, 30_000);
  setInterval(refreshAgentBadge, 60_000);
});

// ── Help / About ──────────────────────────────────────────────────────────────

function openAbout() {
  openModal('About TantraFlow', `
    <div style="text-align:center;padding:8px 0 20px">
      <div style="width:64px;height:64px;border-radius:16px;background:var(--accent);
                  color:#fff;display:flex;align-items:center;justify-content:center;
                  font-size:28px;margin:0 auto 16px;
                  box-shadow:0 4px 16px rgba(230,126,34,0.35)">
        <i class="fa-solid fa-circle-nodes"></i>
      </div>
      <div style="font-family:var(--font-display);font-size:24px;font-weight:600;
                  color:var(--text);letter-spacing:-0.5px;margin-bottom:4px">
        TantraFlow
      </div>
      <div style="font-size:12px;color:var(--muted);font-family:var(--font-mono);
                  background:var(--accent-light);border:1px solid var(--accent-border);
                  display:inline-block;padding:3px 12px;border-radius:99px;
                  margin-bottom:16px">
        v0.108 · Public Beta
      </div>
      <p style="font-size:13.5px;color:var(--text-2);line-height:1.7;max-width:400px;
                margin:0 auto 20px">
        A locally-hosted, privacy-first agentic workflow orchestration platform.
        Build multi-agent pipelines, connect your own LLMs via Ollama or LM Studio,
        and produce real output files — all without sending data to the cloud.
      </p>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">
      ${[
        ['fa-diagram-project','Workflows','10 production-ready library workflows with orchestrator + 3–6 specialist agents'],
        ['fa-robot','Agents','Fully customisable agents with skills.md role definitions and tools.py function stubs'],
        ['fa-puzzle-piece','Skills','8 built-in templates (Research, Writer, PDF, Web Designer…) with one-click agent creation'],
        ['fa-file-export','Import / Export','Share workflows as self-contained JSON bundles — agents, skills, and tools all included'],
      ].map(([icon, title, desc]) => `
        <div style="padding:12px 14px;background:var(--surface-2);border:1px solid var(--border);
                    border-radius:var(--radius)">
          <div style="font-size:13px;font-weight:600;margin-bottom:4px;color:var(--text)">
            <i class="fa-solid ${icon}" style="color:var(--accent);margin-right:6px"></i>${title}
          </div>
          <div style="font-size:12px;color:var(--muted);line-height:1.5">${desc}</div>
        </div>`).join('')}
    </div>

    <div style="border-top:1px solid var(--border-light);padding-top:16px">
      <div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
                  color:var(--muted);margin-bottom:10px">Keyboard Shortcuts</div>
      <div style="display:grid;grid-template-columns:auto 1fr;gap:5px 16px;font-size:12.5px">
        ${[
          ['Click port → click port','Connect two nodes in the Builder'],
          ['Drag palette item','Add a node to the canvas'],
          ['Click node','Select and view properties'],
          ['Delete btn / Remove Node','Remove selected node'],
        ].map(([k, d]) => `
          <span style="font-family:var(--font-mono);background:var(--surface-2);
                       padding:2px 8px;border-radius:4px;border:1px solid var(--border);
                       white-space:nowrap;color:var(--text)">${k}</span>
          <span style="color:var(--text-2);padding-top:2px">${d}</span>`).join('')}
      </div>
    </div>

    <div style="margin-top:16px;padding:12px 14px;background:var(--surface-2);
                border:1px solid var(--border-light);border-radius:var(--radius);
                font-size:12px;color:var(--muted);line-height:1.6">
      <i class="fa-solid fa-circle-info" style="color:var(--accent);margin-right:6px"></i>
      <strong style="color:var(--text-2)">Stack:</strong>
      FastAPI · SQLite · Ollama / LM Studio · IBM Plex · Vanilla JS
      &nbsp;|&nbsp;
      <strong style="color:var(--text-2)">Data:</strong> 100% local — nothing leaves your machine
    </div>
  `,
  `<button class="btn btn-secondary" onclick="closeModal()">Close</button>
   <button class="btn btn-primary" onclick="navigate('workflows',document.querySelector('[data-page=workflows]'));closeModal()">
     <i class="fa-solid fa-diagram-project"></i> Open Workflows
   </button>`
  );
}
