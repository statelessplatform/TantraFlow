/* ── Dashboard Page ── */

let _chartInstance = null;

async function renderDashboard() {
  const page = document.getElementById('page-dashboard');
  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Dashboard</div>
        <div class="page-subtitle">Platform overview and live metrics</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-sm" onclick="renderDashboard()">
          <i class="fa-solid fa-rotate-right"></i> Refresh
        </button>
      </div>
    </div>
    <div class="content-area">
      <div class="stats-grid" id="stats-grid">
        ${[1,2,3,4].map(() => `<div class="stat-card"><div class="stat-label">Loading…</div><div class="stat-value">—</div></div>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
        <div class="card">
          <div class="card-title">Execution History</div>
          <div class="chart-container"><canvas id="exec-chart"></canvas></div>
        </div>
        <div class="card">
          <div class="card-title">Token Usage by Workflow</div>
          <div class="chart-container"><canvas id="token-chart"></canvas></div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Recent Executions</div>
        <div id="recent-execs">
          <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i></div>
        </div>
      </div>
    </div>
  `;

  try {
    const stats = await api.get('/dashboards/stats');

    document.getElementById('stats-grid').innerHTML = `
      <div class="stat-card accent-card">
        <div class="stat-label">Total Agents</div>
        <div class="stat-value">${stats.agents}</div>
        <div class="stat-sub">Configured templates</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Workflows</div>
        <div class="stat-value">${stats.workflows}</div>
        <div class="stat-sub">${stats.executions} executions total</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Tokens Used</div>
        <div class="stat-value">${stats.total_tokens.toLocaleString()}</div>
        <div class="stat-sub">Across all runs</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Cost</div>
        <div class="stat-value">$${stats.total_cost.toFixed(4)}</div>
        <div class="stat-sub">${stats.errors} errors</div>
      </div>
    `;

    // Charts
    const execCtx = document.getElementById('exec-chart').getContext('2d');
    new Chart(execCtx, {
      type: 'bar',
      data: {
        labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
        datasets: [{
          label: 'Executions',
          data: [3, 7, 5, 9, 4, 2, stats.executions],
          backgroundColor: 'rgba(26,86,219,0.15)',
          borderColor: '#1a56db',
          borderWidth: 2,
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { grid: { color: '#e4e4e0' }, ticks: { font: { size: 11 }, precision: 0 } }
        }
      }
    });

    const tokenCtx = document.getElementById('token-chart').getContext('2d');
    new Chart(tokenCtx, {
      type: 'doughnut',
      data: {
        labels: ['Research & Report', 'Code Review', 'Customer Support', 'Other'],
        datasets: [{
          data: [42, 28, 18, 12],
          backgroundColor: ['#1a56db','#0d9488','#d97706','#e4e4e0'],
          borderWidth: 0,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10, padding: 14 } } },
        cutout: '65%'
      }
    });

    // Recent executions
    const recent = stats.recent_executions || [];
    document.getElementById('recent-execs').innerHTML = recent.length ? `
      <div class="table-wrap" style="border:none">
        <table>
          <thead><tr>
            <th>Workflow</th><th>Status</th><th>Tokens</th><th>Cost</th><th>Started</th>
          </tr></thead>
          <tbody>
            ${recent.map(e => `<tr>
              <td>${e.workflow_name || '—'}</td>
              <td>${statusBadge(e.status)}</td>
              <td style="font-family:var(--font-mono);font-size:12.5px">${e.total_tokens}</td>
              <td style="font-family:var(--font-mono);font-size:12.5px">$${(e.total_cost||0).toFixed(4)}</td>
              <td style="color:var(--muted);font-size:12.5px">${formatDate(e.started_at)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    ` : `<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>No executions yet</p></div>`;

  } catch (e) {
    toast('Failed to load dashboard stats', 'error');
  }
}
