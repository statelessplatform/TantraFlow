/* ── Logs Page ───────────────────────────────────────────────────────────────
   Shows execution logs with workflow status, trace viewer, and live polling.
   Clicking any workflow card in the Workflow page opens openExecutionMonitor().
   ─────────────────────────────────────────────────────────────────────────── */

let _logRefreshInterval = null;
let _allLogs = [];

async function renderLogs() {
  const page = document.getElementById('page-logs');
  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Logs &amp; Traces</div>
        <div class="page-subtitle">Real-time execution events, per-node status, and full trace viewer</div>
      </div>
      <div class="page-actions">
        <select class="form-select" id="log-level-filter" style="width:auto;min-width:130px"
                onchange="loadLogs()">
          <option value="">All levels</option>
          <option value="INFO">INFO</option>
          <option value="WARNING">WARNING</option>
          <option value="ERROR">ERROR</option>
          <option value="DEBUG">DEBUG</option>
        </select>
        <select class="form-select" id="log-wf-filter" style="width:auto;min-width:170px"
                onchange="loadLogs()">
          <option value="">All workflows</option>
        </select>
        <button class="btn btn-secondary btn-sm" onclick="loadLogs()">
          <i class="fa-solid fa-rotate-right"></i> Refresh
        </button>
        <button class="btn btn-secondary btn-sm" id="auto-refresh-btn" onclick="toggleAutoRefresh()">
          <i class="fa-solid fa-play"></i> Auto
        </button>
        <button class="btn btn-secondary btn-sm" onclick="clearLogs()" style="color:var(--red)">
          <i class="fa-solid fa-trash"></i> Clear
        </button>
      </div>
    </div>

    <div class="content-area">
      <!-- Execution status strip -->
      <div id="execution-strip" style="margin-bottom:20px"></div>

      <div style="display:grid;grid-template-columns:1fr 320px;gap:20px;align-items:start">
        <!-- Left: log stream -->
        <div>
          <div class="filter-bar">
            <input class="search-input" placeholder="Search messages, trace IDs…"
                   oninput="filterLogs(this.value)" />
          </div>
          <div class="log-stream" id="log-stream">
            <div class="empty-state" style="padding:40px">
              <i class="fa-solid fa-circle-notch fa-spin"></i>
            </div>
          </div>
        </div>

        <!-- Right: summary + trace -->
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="card">
            <div class="card-title">Level Summary</div>
            <div id="log-summary"></div>
          </div>
          <div class="card">
            <div class="card-title">
              <i class="fa-solid fa-route" style="color:var(--accent);margin-right:6px"></i>
              Trace Viewer
            </div>
            <div id="trace-panel"
                 style="font-size:12.5px;color:var(--muted);line-height:1.6">
              Click a log line to inspect its trace
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  await loadExecutionStrip();
  await loadWorkflowFilter();
  await loadLogs();
}

// ── Execution status strip ────────────────────────────────────────────────────

async function loadExecutionStrip() {
  try {
    const stats = await api.get('/dashboards/stats');
    const recent = stats.recent_executions || [];
    if (!recent.length) return;

    const statusColor = { success:'var(--green)', failed:'var(--red)', running:'var(--amber)' };
    const statusIcon  = { success:'fa-circle-check', failed:'fa-circle-xmark', running:'fa-circle-notch fa-spin' };

    document.getElementById('execution-strip').innerHTML = `
      <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:4px">
        ${recent.map(e => `
          <div onclick="openExecutionMonitor(${e.id},'${e.workflow_name||'Workflow'}')"
               style="min-width:200px;padding:12px 14px;background:var(--surface);
                      border:1px solid var(--border);border-left:3px solid ${statusColor[e.status]||'var(--muted)'};
                      border-radius:var(--radius);cursor:pointer;flex-shrink:0;
                      transition:box-shadow 0.15s"
               onmouseover="this.style.boxShadow='var(--shadow-md)'"
               onmouseout="this.style.boxShadow=''">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
              <i class="fa-solid ${statusIcon[e.status]||'fa-circle'}"
                 style="color:${statusColor[e.status]||'var(--muted)'};font-size:12px"></i>
              <span style="font-size:12.5px;font-weight:600;color:var(--text);
                           white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px">
                ${e.workflow_name||'Workflow'}
              </span>
            </div>
            <div style="font-size:11px;color:var(--muted)">
              Exec #${e.id} · ${e.total_tokens||0} tok
            </div>
            <div style="font-size:10.5px;color:var(--muted);margin-top:2px">
              ${e.started_at ? e.started_at.slice(0,16).replace('T',' ') : '—'}
            </div>
          </div>`).join('')}
      </div>`;
  } catch { /* strip is non-critical */ }
}

// ── Workflow filter dropdown ───────────────────────────────────────────────────

async function loadWorkflowFilter() {
  try {
    const workflows = await api.get('/workflows');
    const sel = document.getElementById('log-wf-filter');
    if (!sel) return;
    workflows.forEach(w => {
      const opt = document.createElement('option');
      opt.value = w.name;
      opt.textContent = w.name;
      sel.appendChild(opt);
    });
  } catch {}
}

// ── Load + render logs ────────────────────────────────────────────────────────

async function loadLogs() {
  const level  = document.getElementById('log-level-filter')?.value || '';
  const wfName = document.getElementById('log-wf-filter')?.value    || '';
  try {
    let url = `/logs?limit=200`;
    if (level) url += `&level=${encodeURIComponent(level)}`;
    _allLogs = await api.get(url);

    // Client-side workflow filter (logs don't have workflow_id, filter by message content)
    const filtered = wfName
      ? _allLogs.filter(l => l.message?.includes(wfName) || l.trace_id)
      : _allLogs;

    renderLogStream(filtered);
    updateLogSummary(filtered);
  } catch { toast('Failed to load logs', 'error'); }
}

function renderLogStream(logs) {
  const el = document.getElementById('log-stream');
  if (!el) return;
  if (!logs.length) {
    el.innerHTML = `<div class="empty-state" style="padding:40px">
      <i class="fa-solid fa-inbox"></i><p>No log entries</p>
    </div>`;
    return;
  }

  const levelColor = { INFO:'var(--accent)', WARNING:'var(--amber)', ERROR:'var(--red)', DEBUG:'var(--muted)' };

  el.innerHTML = logs.map(l => {
    const isNode = l.message?.includes('Executing node') || l.message?.includes('completed in');
    const isErr  = l.level === 'ERROR';
    const isWarn = l.level === 'WARNING';
    const rowBg  = isErr ? 'background:var(--red-light);' : isWarn ? 'background:#fffbeb;' : '';

    return `
      <div class="log-line ${l.trace_id ? 'clickable' : ''}"
           onclick="${l.trace_id ? `viewTrace('${l.trace_id}')` : ''}"
           style="${rowBg}${l.trace_id ? 'cursor:pointer;' : ''}">
        <span class="log-time">${(l.timestamp||'').slice(0,19).replace('T',' ')}</span>
        <span class="log-level ${l.level||''}"
              style="color:${levelColor[l.level]||'var(--muted)'}">
          ${l.level||'—'}
        </span>
        <span class="log-msg" style="${isNode?'font-weight:500;':''}">${escapeHtml(l.message||'')}</span>
        ${l.trace_id
          ? `<span style="font-size:10px;color:var(--accent);margin-left:auto;flex-shrink:0;
                          font-family:var(--font-mono);cursor:pointer"
                  title="${l.trace_id}">
               trace↗
             </span>`
          : ''}
      </div>`;
  }).join('');
}

function filterLogs(q) {
  if (!q) { renderLogStream(_allLogs); return; }
  const lq = q.toLowerCase();
  renderLogStream(_allLogs.filter(l =>
    (l.message||'').toLowerCase().includes(lq) ||
    (l.trace_id||'').toLowerCase().includes(lq) ||
    (l.level||'').toLowerCase().includes(lq)
  ));
}

function updateLogSummary(logs) {
  const counts = { INFO: 0, WARNING: 0, ERROR: 0, DEBUG: 0 };
  logs.forEach(l => { if (counts[l.level] !== undefined) counts[l.level]++; });
  const colors = { INFO:'var(--accent)', WARNING:'var(--amber)', ERROR:'var(--red)', DEBUG:'var(--muted)' };
  const el = document.getElementById('log-summary');
  if (!el) return;
  el.innerHTML = Object.entries(counts).map(([lvl, cnt]) => `
    <div style="display:flex;justify-content:space-between;align-items:center;
                padding:8px 0;border-bottom:1px solid var(--border-light)">
      <span style="font-size:12.5px;font-weight:600;color:${colors[lvl]}">${lvl}</span>
      <span style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:var(--text)">${cnt}</span>
    </div>`).join('');
}

// ── Trace viewer (sidebar) ────────────────────────────────────────────────────

async function viewTrace(traceId) {
  const panel = document.getElementById('trace-panel');
  if (!panel) return;
  panel.innerHTML = `<div style="color:var(--muted);font-size:12px">
    <i class="fa-solid fa-circle-notch fa-spin"></i> Loading trace…
  </div>`;

  try {
    const trace  = await api.get(`/traces/${traceId}`);
    const data   = trace.data || {};
    const spans  = data.spans || [];
    const status = data.status || '—';
    const statusC = { success:'var(--green)', failed:'var(--red)', running:'var(--amber)' }[status] || 'var(--muted)';

    panel.innerHTML = `
      <div style="font-family:var(--font-mono);font-size:10.5px;color:var(--muted);
                  word-break:break-all;margin-bottom:8px">${traceId}</div>
      <div style="font-size:13px;font-weight:600;margin-bottom:4px">${data.workflow||'Workflow'}</div>
      <div style="margin-bottom:12px">
        <span style="font-size:11.5px;font-weight:600;color:${statusC};
                     background:${statusC}18;padding:2px 8px;border-radius:99px">
          ${status}
        </span>
        ${data.elapsed_ms ? `<span style="font-size:11px;color:var(--muted);margin-left:8px">
          ${(data.elapsed_ms/1000).toFixed(1)}s
        </span>` : ''}
      </div>

      ${spans.length ? `<div style="display:flex;flex-direction:column;gap:6px">
        ${spans.map((s, i) => {
          const ok = s.status === 'ok';
          const nodeColor = ok ? 'var(--green)' : 'var(--red)';
          const nodeIcon  = ok ? 'fa-circle-check' : 'fa-circle-xmark';
          return `
            <div style="padding:8px 10px;background:var(--surface-2);border-radius:var(--radius);
                        border:1px solid var(--border-light)">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
                <i class="fa-solid ${nodeIcon}" style="color:${nodeColor};font-size:11px;flex-shrink:0"></i>
                <span style="font-size:12.5px;font-weight:500;flex:1;min-width:0;
                             overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                  ${i+1}. ${s.name}
                </span>
                <span style="font-size:10.5px;color:var(--muted);flex-shrink:0">${s.latency_ms||0}ms</span>
              </div>
              <div style="font-size:11px;color:var(--muted);font-family:var(--font-mono)">
                ${s.model||'?'} · ${s.tokens||0} tok
                ${s.file ? ` · <span style="color:var(--accent)">${s.file}</span>` : ''}
              </div>
              ${s.status !== 'ok' ? `<div style="font-size:11px;color:var(--red);margin-top:4px;
                word-break:break-word">${(s.output||'').slice(0,120)}</div>` : ''}
            </div>`;
        }).join('')}
      </div>` : `<div style="font-size:12px;color:var(--muted)">No spans recorded yet.</div>`}

      <button class="btn btn-secondary btn-sm" style="margin-top:12px;width:100%"
              onclick="openExecutionMonitor(null,'',\`${traceId}\`)">
        <i class="fa-solid fa-magnifying-glass"></i> Full Monitor
      </button>`;
  } catch {
    panel.innerHTML = `<div style="color:var(--red);font-size:12px">
      <i class="fa-solid fa-triangle-exclamation"></i> Failed to load trace
    </div>`;
  }
}

// ── Execution live monitor modal ──────────────────────────────────────────────
// Called from: workflow card click, execution strip click, trace viewer button

async function openExecutionMonitor(execId, wfName, traceId) {
  // Resolve execution record
  let exec = null;
  let resolvedTraceId = traceId;

  if (execId) {
    try { exec = await api.get(`/executions/${execId}`); resolvedTraceId = exec.trace_id; }
    catch {}
  }

  const title = `Execution Monitor — ${wfName || exec?.workflow_name || 'Workflow'}`;

  openModal(title, `
    <div id="em-status-bar" style="display:flex;align-items:center;gap:12px;padding:10px 14px;
         background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);
         margin-bottom:16px">
      <span id="em-badge" style="font-size:11.5px;font-weight:600;padding:3px 10px;
            border-radius:99px;background:var(--amber-light);color:var(--amber)">
        <i class="fa-solid fa-circle-notch fa-spin"></i> loading…
      </span>
      <span id="em-meta" style="font-size:12px;color:var(--muted)">
        ${resolvedTraceId ? `Trace: <code style="font-family:var(--font-mono);font-size:10.5px">${resolvedTraceId.slice(0,24)}…</code>` : ''}
      </span>
      <button class="btn btn-secondary btn-sm" style="margin-left:auto"
              onclick="refreshMonitor(${execId},'${wfName}','${resolvedTraceId||''}')">
        <i class="fa-solid fa-rotate-right"></i> Refresh
      </button>
    </div>

    <div id="em-input" style="display:none;margin-bottom:14px;padding:10px 14px;
         background:var(--surface-2);border-radius:var(--radius);font-size:12.5px;color:var(--text-2)">
    </div>

    <!-- Node progress list -->
    <div style="font-size:12px;font-weight:600;color:var(--text-2);margin-bottom:8px;
                text-transform:uppercase;letter-spacing:.05em">
      <i class="fa-solid fa-circle-nodes" style="color:var(--accent);margin-right:6px"></i>
      Node Pipeline
    </div>
    <div id="em-nodes" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
      <div style="color:var(--muted);font-size:13px">
        <i class="fa-solid fa-circle-notch fa-spin"></i> Loading node status…
      </div>
    </div>

    <!-- Recent log lines for this trace -->
    <div style="font-size:12px;font-weight:600;color:var(--text-2);margin-bottom:8px;
                text-transform:uppercase;letter-spacing:.05em">
      <i class="fa-solid fa-scroll" style="color:var(--accent);margin-right:6px"></i>
      Live Logs
    </div>
    <div id="em-logs" style="max-height:180px;overflow-y:auto;background:var(--surface-2);
         border:1px solid var(--border);border-radius:var(--radius);font-size:12px">
      <div style="padding:12px;color:var(--muted)">Waiting for log entries…</div>
    </div>

    <!-- Output files -->
    <div id="em-files" style="margin-top:14px"></div>
  `,
  `<button class="btn btn-secondary" onclick="closeModal()">Close</button>
   ${resolvedTraceId ? `<button class="btn btn-secondary"
     onclick="window.open('/api/v1/outputs/${resolvedTraceId}/files','_blank')">
     <i class="fa-solid fa-folder-open"></i> Output Dir
   </button>` : ''}
   ${execId ? `<button class="btn btn-primary" id="em-rerun-btn" style="display:none"
     onclick="rerunExecution(${execId})">
     <i class="fa-solid fa-rotate-right"></i> Re-run
   </button>` : ''}`
  );

  await refreshMonitor(execId, wfName, resolvedTraceId);

  // Auto-refresh while running
  if (exec?.status === 'running' || !exec) {
    const interval = setInterval(async () => {
      const badge = document.getElementById('em-badge');
      if (!badge) { clearInterval(interval); return; } // modal closed
      await refreshMonitor(execId, wfName, resolvedTraceId);
      const updatedBadge = document.getElementById('em-badge');
      if (updatedBadge && !updatedBadge.querySelector('.fa-spin')) {
        clearInterval(interval); // finished
        const rerunBtn = document.getElementById('em-rerun-btn');
        if (rerunBtn) rerunBtn.style.display = 'inline-flex';
      }
    }, 3000);
  }
}

async function refreshMonitor(execId, wfName, traceId) {
  let exec = null;
  let spans = [];
  let status = 'unknown';

  // Load execution record
  if (execId) {
    try {
      exec = await api.get(`/executions/${execId}`);
      status = exec.status;
      spans  = exec.trace?.spans || [];
      const tid = exec.trace_id || traceId;
      if (tid) traceId = tid;
    } catch {}
  }

  // Load trace if we have trace_id but no execId
  if (!spans.length && traceId) {
    try {
      const t = await api.get(`/traces/${traceId}`);
      spans  = t.data?.spans || [];
      status = t.data?.status || status;
    } catch {}
  }

  // Update badge
  const badge = document.getElementById('em-badge');
  if (badge) {
    const colors = { success:'var(--green)', failed:'var(--red)', running:'var(--amber)', unknown:'var(--muted)' };
    const icons  = { success:'fa-circle-check', failed:'fa-circle-xmark', running:'fa-circle-notch fa-spin', unknown:'fa-circle' };
    const c = colors[status] || 'var(--muted)';
    badge.style.background = c + '18';
    badge.style.color      = c;
    badge.innerHTML = `<i class="fa-solid ${icons[status]||'fa-circle'}" style="margin-right:4px"></i>${status}`;
  }

  // Update input preview
  if (exec?.input) {
    const inputEl = document.getElementById('em-input');
    if (inputEl) {
      inputEl.style.display = 'block';
      inputEl.innerHTML = `<strong style="color:var(--text)">Input:</strong> ${(exec.input||'').slice(0,200)}${exec.input?.length > 200 ? '…' : ''}`;
    }
  }

  // Render node pipeline
  const nodesEl = document.getElementById('em-nodes');
  if (nodesEl) {
    if (!spans.length) {
      nodesEl.innerHTML = status === 'running'
        ? `<div style="color:var(--amber);font-size:13px"><i class="fa-solid fa-circle-notch fa-spin"></i> Warming up model and starting node 1…</div>`
        : `<div style="color:var(--muted);font-size:13px">No node data yet.</div>`;
    } else {
      nodesEl.innerHTML = spans.map((s, i) => {
        const ok = s.status === 'ok';
        const nodeColor = ok ? 'var(--green)' : 'var(--red)';
        const nodeIcon  = ok ? 'fa-circle-check' : 'fa-circle-xmark';
        const extBadge  = s.output_type
          ? `<span style="font-size:10.5px;font-family:var(--font-mono);
               background:var(--accent)18;color:var(--accent);padding:2px 6px;
               border-radius:4px;flex-shrink:0">.${s.output_type}</span>`
          : '';
        return `
          <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;
                      background:var(--surface-2);border-radius:var(--radius);
                      border:1px solid ${ok ? 'var(--border-light)' : '#fca5a5'}">
            <i class="fa-solid ${nodeIcon}"
               style="color:${nodeColor};font-size:14px;flex-shrink:0"></i>
            <div style="flex:1;min-width:0">
              <div style="font-size:13.5px;font-weight:600;margin-bottom:2px">
                ${i+1}. ${s.name}
              </div>
              <div style="font-size:11.5px;color:var(--muted);font-family:var(--font-mono)">
                ${s.model||'?'} · ${(s.latency_ms||0).toLocaleString()}ms · ${s.tokens||0} tokens
                ${s.file ? ` · <span style="color:var(--accent)">${s.file}</span>` : ''}
              </div>
              ${!ok && s.output
                ? `<div style="font-size:11.5px;color:var(--red);margin-top:4px;word-break:break-word">
                     ${(s.output||'').slice(0,140)}
                   </div>`
                : ''}
            </div>
            ${extBadge}
            <span style="font-size:11px;padding:2px 8px;border-radius:99px;font-weight:600;
                         background:${ok?'var(--green-light)':'var(--red-light)'};
                         color:${ok?'var(--green)':'var(--red)'}">
              ${ok ? 'done' : 'error'}
            </span>
          </div>`;
      }).join('');

      // Append "running" indicator if still going
      if (status === 'running') {
        const nextIdx = spans.length;
        nodesEl.innerHTML += `
          <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;
                      background:var(--amber-light);border-radius:var(--radius);
                      border:1px solid #fcd34d">
            <i class="fa-solid fa-circle-notch fa-spin"
               style="color:var(--amber);font-size:14px;flex-shrink:0"></i>
            <div style="font-size:13.5px;font-weight:600;color:var(--amber)">
              Node ${nextIdx+1} — currently processing…
            </div>
          </div>`;
      }
    }
  }

  // Load live log lines for this trace
  if (traceId) {
    try {
      const allLogs = await api.get('/logs?limit=200');
      const traceLogs = allLogs.filter(l => l.trace_id === traceId);
      const logsEl = document.getElementById('em-logs');
      if (logsEl) {
        if (!traceLogs.length) {
          logsEl.innerHTML = `<div style="padding:12px;color:var(--muted)">No log entries for this trace yet.</div>`;
        } else {
          const lvlC = { INFO:'var(--accent)', WARNING:'var(--amber)', ERROR:'var(--red)', DEBUG:'var(--muted)' };
          logsEl.innerHTML = traceLogs.map(l => `
            <div style="display:flex;gap:10px;padding:6px 12px;border-bottom:1px solid var(--border-light);
                        ${l.level==='ERROR'?'background:var(--red-light);':''}">
              <span style="font-size:10.5px;color:var(--muted);white-space:nowrap;flex-shrink:0;
                           font-family:var(--font-mono)">
                ${(l.timestamp||'').slice(11,19)}
              </span>
              <span style="font-size:10.5px;font-weight:600;color:${lvlC[l.level]||'var(--muted)'};
                           flex-shrink:0;width:52px">${l.level}</span>
              <span style="font-size:11.5px;color:var(--text-2);word-break:break-word">
                ${escapeHtml(l.message||'')}
              </span>
            </div>`).join('');
          // Auto-scroll to bottom
          logsEl.scrollTop = logsEl.scrollHeight;
        }
      }
    } catch {}
  }

  // Show output files if finished
  if ((status === 'success' || status === 'failed') && traceId) {
    const filesEl = document.getElementById('em-files');
    if (filesEl && !filesEl.innerHTML) {
      try {
        const files = await api.get(`/outputs/${traceId}/files`);
        if (files.files?.length) {
          filesEl.innerHTML = `
            <div style="font-size:12px;font-weight:600;color:var(--text-2);margin-bottom:8px;
                        text-transform:uppercase;letter-spacing:.05em">
              <i class="fa-solid fa-folder-open" style="color:var(--accent);margin-right:6px"></i>
              Output Files
            </div>
            <div style="display:flex;flex-direction:column;gap:5px">
              ${files.files.map(f => `
                <a href="${f.url}" download="${f.name}" target="_blank"
                   style="display:flex;align-items:center;gap:10px;padding:9px 12px;
                          background:var(--surface-2);border:1px solid var(--border);
                          border-radius:var(--radius);text-decoration:none;color:var(--text)">
                  <i class="fa-solid ${fileIconForLog(f.name)}"
                     style="color:var(--accent);font-size:14px;flex-shrink:0"></i>
                  <span style="flex:1;font-size:13px;font-weight:500">${f.name}</span>
                  <span style="font-size:11.5px;color:var(--muted)">${formatBytesLog(f.size)}</span>
                  <i class="fa-solid fa-download" style="color:var(--muted);font-size:12px"></i>
                </a>`).join('')}
            </div>`;
        }
      } catch {}
    }
  }
}

function rerunExecution(execId) {
  toast('Re-run: open the workflow and click Run again', 'info');
}

// ── Auto-refresh ──────────────────────────────────────────────────────────────

let _autoRefresh = false;
function toggleAutoRefresh() {
  _autoRefresh = !_autoRefresh;
  const btn = document.getElementById('auto-refresh-btn');
  if (_autoRefresh) {
    btn.innerHTML = '<i class="fa-solid fa-pause"></i> Auto';
    btn.style.background = 'var(--accent-light)';
    btn.style.color      = 'var(--accent)';
    _logRefreshInterval  = setInterval(loadLogs, 4000);
  } else {
    btn.innerHTML = '<i class="fa-solid fa-play"></i> Auto';
    btn.style.background = '';
    btn.style.color      = '';
    clearInterval(_logRefreshInterval);
  }
}

async function clearLogs() {
  openModal('Clear Logs',
    '<div style="text-align:center;padding:8px 0 16px">' +
    '<i class="fa-solid fa-triangle-exclamation" style="font-size:32px;color:var(--red);margin-bottom:12px;display:block"></i>' +
    '<p style="font-size:14px;color:var(--text)">Clear all logs and traces?</p>' +
    '<p style="font-size:13px;color:var(--muted);margin-top:6px">This cannot be undone.</p>' +
    '</div>',
    '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-danger" onclick="closeModal();_doClearAllLogs()"><i class="fa-solid fa-trash"></i> Clear All</button>'
  );
}

async function _doClearAllLogs() {
  try {
    await api.post('/logs/clear', {});
    toast('Logs cleared', 'success');
    _allLogs = [];
    renderLogStream([]);
    updateLogSummary([]);
  } catch { toast('Failed to clear logs', 'error'); }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fileIconForLog(name) {
  const ext = (name||'').split('.').pop().toLowerCase();
  if (ext === 'pdf')  return 'fa-file-pdf';
  if (ext === 'html') return 'fa-file-code';
  if (ext === 'json') return 'fa-file-lines';
  if (ext === 'py')   return 'fa-file-code';
  if (ext === 'sh')   return 'fa-terminal';
  if (ext === 'bat')  return 'fa-terminal';
  if (ext === 'csv')  return 'fa-table';
  return 'fa-file-alt';
}

function formatBytesLog(b) {
  if (!b || b < 1024)   return `${b||0} B`;
  if (b < 1024 * 1024)  return `${(b/1024).toFixed(1)} KB`;
  return `${(b/(1024*1024)).toFixed(1)} MB`;
}

function escapeHtml(str) {
  return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
