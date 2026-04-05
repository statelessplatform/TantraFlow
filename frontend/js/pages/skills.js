/* ── Skills & Tools Page ─────────────────────────────────────────────────────
   Tab switching uses CSS classes (.active-pane) on .skills-tab-pane elements.
   The CSS rule ".skills-tab-pane { display:none }" hides all panes by default;
   ".skills-tab-pane.active-pane { display:block }" shows the active one.
   This avoids any inline-style vs CSS specificity fight.
   ─────────────────────────────────────────────────────────────────────────── */

const SKILL_TEMPLATES = {
  research: {
    name: 'Research Agent', category: 'content',
    description: 'Searches, evaluates, and synthesises information into structured reports with citations.',
    skills_md: `# Research Agent\n\n## Role\nYou are an expert research assistant. Find, analyse, and synthesise information from multiple sources into clear, structured reports.\n\n## Capabilities\n- Web search and information retrieval\n- Source credibility evaluation\n- Structured report generation with citations\n- Competitive and market intelligence\n\n## Behavioral Guidelines\n- Verify facts from at least two independent sources\n- Cite every claim: [Source: URL]\n- Structure: Executive Summary → Key Findings → Evidence → Sources\n- If unavailable, say so explicitly — never hallucinate`,
    tools_py: `def web_search(query: str, num_results: int = 5) -> list:\n    """Search the web for the given query. Returns ranked results."""\n    return [{"title": f"Result for {query}", "url": "https://example.com", "snippet": "..."}]\n\ndef fetch_page(url: str) -> str:\n    """Fetch the full text content of a web page."""\n    return f"[Content from {url}]"\n\ndef summarise(text: str, max_words: int = 200) -> str:\n    """Condense a long text into a concise paragraph."""\n    return f"[Summary of {len(text.split())} words]"`
  },
  writer: {
    name: 'Writer Agent', category: 'content',
    description: 'Transforms research into polished, publication-ready prose — articles, reports, copy.',
    skills_md: `# Writer Agent\n\n## Role\nSenior professional writer. Transform research and data into compelling, clear, publication-ready prose.\n\n## Capabilities\n- Long-form articles and whitepapers\n- Executive reports and board-level summaries\n- Marketing copy and product descriptions\n- Technical documentation\n\n## Behavioral Guidelines\n- Match tone to audience: formal for C-suite, conversational for blogs\n- Use active voice; avoid jargon unless writing for technical readers\n- Never truncate — produce the complete document\n- State word count at the end`,
    tools_py: `def check_readability(text: str) -> dict:\n    """Calculate readability score and flag complex sentences."""\n    words = len(text.split())\n    return {"words": words, "flesch_score": 68, "avg_sentence_len": 18}\n\ndef format_markdown(content: str, style: str = "article") -> str:\n    """Format content into clean Markdown. style: article|report|email|whitepaper"""\n    return content`
  },
  web_designer: {
    name: 'Web Designer Agent', category: 'engineering',
    description: 'Creates complete, self-contained HTML/CSS/JS webpages — landing pages, dashboards, presentations.',
    skills_md: `# Web Designer Agent\n\n## Role\nSenior frontend engineer. Produce COMPLETE, self-contained single-file HTML with embedded CSS and JavaScript.\n\n## CRITICAL OUTPUT RULES\n- Output ONLY raw HTML — start your response with <!DOCTYPE html>\n- NO markdown fences (no \`\`\`html), NO explanation text before or after the HTML\n- Never truncate — produce the complete file\n\n## Code Standards\n- Single file: <style> and <script> embedded\n- CSS custom properties for theming\n- Semantic HTML5, responsive layout\n- Accessible: aria-labels, contrast ≥ 4.5:1`,
    tools_py: `def validate_html(html: str) -> dict:\n    """Check HTML for common errors and accessibility issues."""\n    errors = []\n    if "<title>" not in html: errors.append("Missing <title>")\n    if "viewport" not in html: errors.append("Missing viewport meta")\n    return {"valid": len(errors) == 0, "errors": errors}`
  },
  pdf_formatter: {
    name: 'PDF Formatter Agent', category: 'content',
    description: 'Enterprise-grade HTML for PDF export — cover page, TOC, branded headers/footers.',
    skills_md: `# PDF Formatter Agent\n\n## Role\nFormat content as print-optimised HTML for PDF export via WeasyPrint.\n\n## CRITICAL OUTPUT RULES\n- Output ONLY raw HTML starting with <!DOCTYPE html>\n- NO markdown fences, NO explanation before or after\n- Every output MUST include: cover page, table of contents, numbered sections, footer\n\n## Styling Standards\n- Primary: #0a2342, Accent: #0066cc\n- Font: Helvetica Neue 10.5pt, line-height 1.65\n- Use @page CSS for print margins`,
    tools_py: `def render_pdf(html_content: str, output_path: str) -> str:\n    """Render HTML to PDF using WeasyPrint. Returns path to output file."""\n    try:\n        from weasyprint import HTML\n        HTML(string=html_content).write_pdf(output_path)\n        return output_path\n    except ImportError:\n        path = output_path.replace(".pdf", "_print.html")\n        open(path, "w").write(html_content)\n        return path`
  },
  code_reviewer: {
    name: 'Code Reviewer', category: 'engineering',
    description: 'Static analysis, security scanning, and best-practice review for Python, JS, TypeScript.',
    skills_md: `# Code Reviewer\n\n## Role\nSenior software engineer — code review, security auditing, best practices.\n\n## Review Order\n1. Security — OWASP Top 10, injection, auth bypass\n2. Correctness — logic errors, null checks, race conditions\n3. Performance — N+1 queries, blocking I/O, memory leaks\n4. Readability — naming, function length (max 40 lines)\n5. Test coverage — missing edge cases\n\n## Output Format\nRate each category and give an overall score 0-100.\nAlways include: file:line, issue, exact fix.`,
    tools_py: `def run_linter(code: str, language: str = "python") -> dict:\n    """Run static linting. Returns errors, warnings, overall score."""\n    return {"errors": [], "warnings": [], "score": 100, "language": language}\n\ndef check_security(code: str, language: str = "python") -> list:\n    """Scan for OWASP Top 10 and common security vulnerabilities."""\n    return []`
  },
  data_analyst: {
    name: 'Data Analyst', category: 'analytics',
    description: 'Analyses datasets, extracts insights, produces Chart.js visualisations and executive summaries.',
    skills_md: `# Data Analyst\n\n## Role\nData scientist specialising in business analytics. Analyse datasets, extract insights, visualise findings.\n\n## Analysis Framework\n1. Data quality audit (nulls, duplicates, outliers, date ranges)\n2. Descriptive statistics (min, max, mean, median, std)\n3. Trend analysis and anomaly detection (>2σ)\n4. "So what?" insight: what should the business DO?\n\n## Behavioral Guidelines\n- Never invent data — if unavailable, say so\n- Flag small samples (n < 30)\n- Distinguish correlation from causation`,
    tools_py: `def compute_stats(numbers: list) -> dict:\n    """Descriptive statistics for a numeric list."""\n    if not numbers: return {}\n    n = sorted(numbers)\n    mean = sum(n)/len(n)\n    mid = len(n)//2\n    median = n[mid] if len(n)%2 else (n[mid-1]+n[mid])/2\n    return {"count":len(n),"min":n[0],"max":n[-1],"mean":round(mean,2),"median":median}\n\ndef chart_js(labels: list, datasets: list, chart_type: str = "bar", title: str = "") -> dict:\n    """Build a Chart.js config object for the given data."""\n    return {"type":chart_type,"data":{"labels":labels,"datasets":datasets},"options":{"responsive":True}}`
  },
  email_agent: {
    name: 'Email Agent', category: 'communication',
    description: 'Drafts, personalises, and dispatches emails via SMTP. Supports templates and attachments.',
    skills_md: `# Email Agent\n\n## Role\nCommunications specialist. Draft professional emails, personalise per recipient, dispatch via SMTP.\n\n## Email Standards\n- Subject: ≤ 50 chars, benefit-led, no spam triggers\n- Opening: first name + one sentence context\n- Body: 3 paragraphs max for transactional\n- CTA: single clear action per email\n- Always include plain-text fallback\n\n## Behavioral Guidelines\n- Never fabricate recipient data\n- Log every dispatch: to, subject, timestamp, status\n- If SMTP not configured, save as .eml file`,
    tools_py: `def send_email(to: str, subject: str, html_body: str, attachments: list = None) -> dict:\n    """Send HTML email via SMTP. Requires SMTP_HOST/PORT/USER/PASS env vars."""\n    import os, smtplib\n    from email.mime.multipart import MIMEMultipart\n    from email.mime.text import MIMEText\n    host = os.getenv("SMTP_HOST", "")\n    if not host:\n        return {"status": "no_smtp", "note": "Set SMTP_HOST env var to enable sending"}\n    msg = MIMEMultipart("alternative")\n    msg["Subject"] = subject\n    msg["To"] = to\n    msg.attach(MIMEText(html_body, "html"))\n    try:\n        with smtplib.SMTP(host, int(os.getenv("SMTP_PORT","587"))) as s:\n            s.starttls()\n            s.login(os.getenv("SMTP_USER",""), os.getenv("SMTP_PASS",""))\n            s.send_message(msg)\n        return {"status": "sent", "to": to}\n    except Exception as e:\n        return {"status": "error", "error": str(e)}`
  },
  customer_support: {
    name: 'Customer Support', category: 'support',
    description: 'Classifies intent, retrieves KB answers, handles escalation routing for customer chat.',
    skills_md: `# Customer Support Agent\n\n## Role\nFriendly, patient, knowledgeable support specialist. Resolve issues efficiently.\n\n## Resolution Flow\n1. Greet and acknowledge the issue\n2. Classify intent (billing/technical/account/general)\n3. Search knowledge base (confidence threshold: 80%)\n4. If confident: provide answer + confirm resolution\n5. If not: create ticket + escalate with full context\n\n## Tone Guidelines\n- Warm, professional, never robotic\n- Acknowledge frustration before problem-solving\n- Never say "I cannot" — say "Let me find another way"`,
    tools_py: `def classify_intent(message: str) -> dict:\n    """Classify customer message into intent categories."""\n    return {"intent": "general", "confidence": 0.85, "entities": {}}\n\ndef lookup_kb(query: str, top_k: int = 3) -> list:\n    """Search the knowledge base for relevant articles."""\n    return [{"title": "FAQ Item", "content": "...", "confidence": 0.9}]\n\ndef create_ticket(customer_id: str, subject: str, description: str, priority: str = "normal") -> dict:\n    """Create a support ticket. Returns ticket_id and status."""\n    return {"ticket_id": "TKT-001", "status": "open", "priority": priority}`
  }
};

const CATEGORY_ICONS  = { content:'fa-pen-nib', engineering:'fa-code', analytics:'fa-chart-bar', communication:'fa-envelope', support:'fa-headset', general:'fa-puzzle-piece' };
const CATEGORY_COLORS = { content:'var(--accent)', engineering:'var(--green)', analytics:'var(--amber)', communication:'#7c3aed', support:'#db2777', general:'var(--muted)' };

let _skills = [];

// ── Page render ────────────────────────────────────────────────────────────────

async function renderSkills() {
  const page = document.getElementById('page-skills');
  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Skills &amp; Tools</div>
        <div class="page-subtitle">Reusable agent capability templates. One click to create a runnable agent.</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary" onclick="switchSkillsTab('tab-import')">
          <i class="fa-solid fa-book-open"></i> Import Guide
        </button>
        <button class="btn btn-primary" onclick="openSkillModal()">
          <i class="fa-solid fa-plus"></i> New Skill
        </button>
      </div>
    </div>

    <div class="content-area">
      <!-- Tab strip: data-tab links each header to its pane id -->
      <div class="tabs" id="skills-tabs">
        <div class="tab active" data-tab="tab-library" onclick="switchSkillsTab('tab-library')">
          <i class="fa-solid fa-layer-group"></i> Template Library
          <span id="lib-count" class="nav-badge" style="background:var(--accent)">8</span>
        </div>
        <div class="tab" data-tab="tab-saved" onclick="switchSkillsTab('tab-saved')">
          <i class="fa-solid fa-floppy-disk"></i> Saved Skills
          <span id="saved-count" class="nav-badge" style="background:var(--green)">0</span>
        </div>
        <div class="tab" data-tab="tab-tools" onclick="switchSkillsTab('tab-tools')">
          <i class="fa-solid fa-terminal"></i> Tools in Use
        </div>
        <div class="tab" data-tab="tab-import" onclick="switchSkillsTab('tab-import')">
          <i class="fa-solid fa-arrow-down-to-bracket"></i> Import Guide
        </div>
      </div>

      <!-- Pane 1: Template Library -->
      <div id="tab-library" class="skills-tab-pane active-pane">
        <div class="filter-bar">
          <input class="search-input" placeholder="Search templates…" oninput="filterTemplates(this.value)" />
          <select class="form-select" style="width:auto;min-width:150px" onchange="filterByCategory(this.value)">
            <option value="">All categories</option>
            <option value="content">Content</option>
            <option value="engineering">Engineering</option>
            <option value="analytics">Analytics</option>
            <option value="communication">Communication</option>
            <option value="support">Support</option>
          </select>
        </div>
        <div class="skills-grid" id="template-grid"></div>
      </div>

      <!-- Pane 2: Saved Skills -->
      <div id="tab-saved" class="skills-tab-pane">
        <div id="saved-skills-list">
          <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><p>Loading…</p></div>
        </div>
      </div>

      <!-- Pane 3: Tools in Use -->
      <div id="tab-tools" class="skills-tab-pane">
        <div id="all-tools-list">
          <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><p>Loading…</p></div>
        </div>
      </div>

      <!-- Pane 4: Import Guide -->
      <div id="tab-import" class="skills-tab-pane">
        <div id="import-guide-content"></div>
      </div>
    </div>
  `;

  // Render initial content for visible pane only
  renderTemplateGrid(Object.values(SKILL_TEMPLATES));
  renderImportGuide();
  await loadSavedSkills();
}

// ── Tab switching ─────────────────────────────────────────────────────────────
// Uses CSS classes — avoids any inline style vs stylesheet specificity fight.

function switchSkillsTab(showId) {
  // 1. Update tab header active state
  document.querySelectorAll('#skills-tabs .tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === showId);
  });

  // 2. Show/hide panes via CSS class — ONLY within #page-skills
  const page = document.getElementById('page-skills');
  page.querySelectorAll('.skills-tab-pane').forEach(pane => {
    if (pane.id === showId) {
      pane.classList.add('active-pane');
    } else {
      pane.classList.remove('active-pane');
    }
  });

  // 3. Lazy-load tools tab content when first opened
  if (showId === 'tab-tools') renderAllTools();
}

// ── Template grid ─────────────────────────────────────────────────────────────

function renderTemplateGrid(templates) {
  const grid = document.getElementById('template-grid');
  if (!grid) return;
  if (!templates.length) {
    grid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-search"></i><p>No templates match that filter.</p></div>`;
    return;
  }
  grid.innerHTML = templates.map(t => {
    const key   = Object.keys(SKILL_TEMPLATES).find(k => SKILL_TEMPLATES[k] === t) || 'general';
    const cat   = t.category || 'general';
    const icon  = CATEGORY_ICONS[cat]  || 'fa-puzzle-piece';
    const color = CATEGORY_COLORS[cat] || 'var(--muted)';
    const toolLines = (t.tools_py || '').split('\n').filter(l => l.trim().startsWith('def '));
    return `
      <div class="skill-card" onclick="viewTemplate('${key}')">
        <div class="skill-card-header">
          <div class="skill-icon" style="background:${color}18;color:${color}">
            <i class="fa-solid ${icon}"></i>
          </div>
          <div style="flex:1;min-width:0">
            <div class="skill-name">${t.name}</div>
            <div class="skill-meta">${toolLines.length} tool${toolLines.length !== 1 ? 's' : ''} · ${cat}</div>
          </div>
          <span class="badge badge-gray" style="flex-shrink:0">template</span>
        </div>
        <div class="skill-card-body">
          <p class="skill-desc">${t.description}</p>
          <div class="tool-list">
            ${toolLines.slice(0, 3).map(fn =>
              `<div class="tool-item">
                <i class="fa-solid fa-terminal" style="margin-right:6px;color:var(--muted);font-size:10px"></i>
                ${fn.trim().replace('def ', '').replace(/:\s*$/, '').trim()}
              </div>`
            ).join('')}
            ${toolLines.length > 3 ? `<div class="tool-item" style="color:var(--muted)">+${toolLines.length - 3} more…</div>` : ''}
          </div>
        </div>
        <div style="padding:10px 20px;border-top:1px solid var(--border-light);display:flex;gap:8px">
          <button class="btn btn-primary btn-sm"
                  onclick="event.stopPropagation();saveTemplateAsSkill('${key}')">
            <i class="fa-solid fa-floppy-disk"></i> Save
          </button>
          <button class="btn btn-secondary btn-sm"
                  onclick="event.stopPropagation();createAgentFromTemplate('${key}')">
            <i class="fa-solid fa-robot"></i> Create Agent
          </button>
        </div>
      </div>`;
  }).join('');
  document.getElementById('lib-count').textContent = templates.length;
}

function filterTemplates(q) {
  const f = Object.values(SKILL_TEMPLATES).filter(t =>
    t.name.toLowerCase().includes(q.toLowerCase()) ||
    t.description.toLowerCase().includes(q.toLowerCase()) ||
    (t.category || '').includes(q.toLowerCase())
  );
  renderTemplateGrid(f);
}

function filterByCategory(cat) {
  renderTemplateGrid(
    cat ? Object.values(SKILL_TEMPLATES).filter(t => t.category === cat)
        : Object.values(SKILL_TEMPLATES)
  );
}

// ── Saved skills ──────────────────────────────────────────────────────────────

async function loadSavedSkills() {
  try {
    _skills = await api.get('/skills');
  } catch {
    _skills = [];
  }
  renderSavedSkills();
}

function renderSavedSkills() {
  const el = document.getElementById('saved-skills-list');
  if (!el) return;
  document.getElementById('saved-count').textContent = _skills.length;

  if (!_skills.length) {
    el.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-floppy-disk"></i>
        <h3>No saved skills yet</h3>
        <p>Save a template from the Library tab, or create a custom skill from scratch.</p>
        <button class="btn btn-primary" style="margin-top:16px" onclick="openSkillModal()">
          <i class="fa-solid fa-plus"></i> Create Custom Skill
        </button>
      </div>`;
    return;
  }

  el.innerHTML = `<div class="skills-grid">
    ${_skills.map(s => {
      const cat   = s.category || 'general';
      const icon  = CATEGORY_ICONS[cat]  || 'fa-puzzle-piece';
      const color = CATEGORY_COLORS[cat] || 'var(--muted)';
      const tools = (() => { try { return JSON.parse(s.tools_json || '[]'); } catch { return []; } })();
      return `
        <div class="skill-card">
          <div class="skill-card-header">
            <div class="skill-icon" style="background:${color}18;color:${color}">
              <i class="fa-solid ${icon}"></i>
            </div>
            <div style="flex:1;min-width:0">
              <div class="skill-name">${s.name}</div>
              <div class="skill-meta">${tools.length} tool${tools.length !== 1 ? 's' : ''} · ${cat}</div>
            </div>
            <span class="badge badge-blue" style="flex-shrink:0">saved</span>
          </div>
          <div class="skill-card-body">
            <p class="skill-desc">${s.description || 'No description.'}</p>
            <div class="tool-list">
              ${tools.slice(0, 3).map(t =>
                `<div class="tool-item">
                  <i class="fa-solid fa-terminal" style="margin-right:6px;color:var(--muted);font-size:10px"></i>${t}
                </div>`
              ).join('')}
              ${tools.length > 3 ? `<div class="tool-item" style="color:var(--muted)">+${tools.length - 3} more…</div>` : ''}
            </div>
          </div>
          <div style="padding:10px 20px;border-top:1px solid var(--border-light);display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" onclick="createAgentFromSaved(${s.id})">
              <i class="fa-solid fa-robot"></i> Create Agent
            </button>
            <button class="btn btn-secondary btn-sm" onclick="viewSavedSkill(${s.id})">
              <i class="fa-solid fa-eye"></i> View
            </button>
            <button class="btn btn-secondary btn-sm" onclick="openSkillModal(${s.id})">
              <i class="fa-solid fa-pen"></i> Edit
            </button>
            <button class="btn-icon" style="margin-left:auto;color:var(--red)" onclick="deleteSkill(${s.id})">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>`;
    }).join('')}
  </div>`;
}

// ── Tools in use ──────────────────────────────────────────────────────────────

async function renderAllTools() {
  const el = document.getElementById('all-tools-list');
  if (!el) return;
  el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><p>Loading…</p></div>`;

  let agents = [];
  try { agents = await api.get('/agents'); } catch {}

  if (!agents.length) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-code"></i><p>No agents with tools defined yet.</p></div>`;
    return;
  }

  const rows = agents.flatMap(a => {
    const lines = (a.tools_py || '').split('\n');
    return lines
      .filter(l => l.trim().startsWith('def '))
      .map(fn => {
        const sig = fn.replace('def ', '').replace(/:\s*$/, '').trim();
        const idx = lines.indexOf(fn);
        const doc = lines.slice(idx + 1, idx + 4)
          .map(l => l.trim()).join(' ')
          .replace(/"""/g, '').replace(/'''/g, '').trim()
          .slice(0, 90) || '—';
        return `<tr>
          <td style="font-family:var(--font-mono);font-size:12px;color:var(--accent);font-weight:500">${sig}</td>
          <td><span class="badge badge-blue" style="font-size:11px">${a.name}</span></td>
          <td style="font-size:12.5px;color:var(--text-2)">${doc}</td>
        </tr>`;
      });
  });

  el.innerHTML = rows.length
    ? `<div class="table-wrap"><table>
        <thead><tr><th>Function Signature</th><th>Agent</th><th>Description</th></tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table></div>`
    : `<div class="empty-state"><i class="fa-solid fa-code"></i><p>No tools defined yet. Add tools.py to an agent.</p></div>`;
}

// ── View template modal ───────────────────────────────────────────────────────

function viewTemplate(key) {
  const t = SKILL_TEMPLATES[key];
  if (!t) return;
  openSkillDetailModal(
    `Template — ${t.name}`, t.skills_md, t.tools_py,
    `<button class="btn btn-secondary" onclick="closeModal()">Close</button>
     <button class="btn btn-secondary" onclick="saveTemplateAsSkill('${key}');closeModal()">
       <i class="fa-solid fa-floppy-disk"></i> Save to Library
     </button>
     <button class="btn btn-primary" onclick="createAgentFromTemplate('${key}');closeModal()">
       <i class="fa-solid fa-robot"></i> Create Agent
     </button>`
  );
}

function viewSavedSkill(id) {
  const s = _skills.find(x => x.id === id);
  if (!s) return;
  openSkillDetailModal(
    `Skill — ${s.name}`, s.skills_md, s.tools_py,
    `<button class="btn btn-secondary" onclick="closeModal()">Close</button>
     <button class="btn btn-secondary" onclick="openSkillModal(${id});closeModal()">
       <i class="fa-solid fa-pen"></i> Edit
     </button>
     <button class="btn btn-primary" onclick="createAgentFromSaved(${id});closeModal()">
       <i class="fa-solid fa-robot"></i> Create Agent
     </button>`
  );
}

function openSkillDetailModal(title, skills_md, tools_py, footer) {
  const uid = Date.now(); // unique id to avoid collisions if modal re-opens
  openModal(title, `
    <div style="display:flex;border-bottom:1px solid var(--border);margin-bottom:14px">
      <div class="tab active" id="sd-md-${uid}"
           onclick="document.getElementById('sd-md-${uid}').classList.add('active');
                    document.getElementById('sd-py-${uid}').classList.remove('active');
                    document.getElementById('sd-md-c-${uid}').style.display='block';
                    document.getElementById('sd-py-c-${uid}').style.display='none'">
        skills.md
      </div>
      <div class="tab" id="sd-py-${uid}"
           onclick="document.getElementById('sd-py-${uid}').classList.add('active');
                    document.getElementById('sd-md-${uid}').classList.remove('active');
                    document.getElementById('sd-py-c-${uid}').style.display='block';
                    document.getElementById('sd-md-c-${uid}').style.display='none'">
        tools.py
      </div>
    </div>
    <div id="sd-md-c-${uid}">
      <pre class="code-block" style="white-space:pre-wrap;max-height:380px;overflow-y:auto">${escHtml(skills_md || '# No skills.md defined')}</pre>
    </div>
    <div id="sd-py-c-${uid}" style="display:none">
      <pre class="code-block" style="white-space:pre-wrap;max-height:380px;overflow-y:auto">${escHtml(tools_py || '# No tools.py defined')}</pre>
    </div>`, footer);
}

// ── Create / edit skill modal ─────────────────────────────────────────────────

function openSkillModal(skillId = null) {
  const skill = skillId ? _skills.find(s => s.id === skillId) : null;
  const cats  = ['general', 'content', 'engineering', 'analytics', 'communication', 'support'];
  const uid   = Date.now();

  openModal(skill ? `Edit — ${skill.name}` : 'New Skill', `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Name *</label>
        <input class="form-input" id="sk-name-${uid}"
               value="${skill?.name || ''}" placeholder="e.g. PDF Formatter Agent" />
      </div>
      <div class="form-group">
        <label class="form-label">Category</label>
        <select class="form-select" id="sk-cat-${uid}">
          ${cats.map(c => `<option value="${c}" ${(skill?.category || 'general') === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Description</label>
      <input class="form-input" id="sk-desc-${uid}"
             value="${skill?.description || ''}" placeholder="One-line summary of what this agent does" />
    </div>
    <div style="display:flex;border-bottom:1px solid var(--border);margin-bottom:10px">
      <div class="tab active" id="ske-md-${uid}"
           onclick="document.getElementById('ske-md-${uid}').classList.add('active');
                    document.getElementById('ske-py-${uid}').classList.remove('active');
                    document.getElementById('ske-md-c-${uid}').style.display='block';
                    document.getElementById('ske-py-c-${uid}').style.display='none'">
        skills.md
      </div>
      <div class="tab" id="ske-py-${uid}"
           onclick="document.getElementById('ske-py-${uid}').classList.add('active');
                    document.getElementById('ske-md-${uid}').classList.remove('active');
                    document.getElementById('ske-py-c-${uid}').style.display='block';
                    document.getElementById('ske-md-c-${uid}').style.display='none'">
        tools.py
      </div>
    </div>
    <div id="ske-md-c-${uid}">
      <textarea class="form-textarea" id="sk-md-${uid}"
                style="min-height:220px;font-family:var(--font-mono);font-size:12px"></textarea>
    </div>
    <div id="ske-py-c-${uid}" style="display:none">
      <textarea class="form-textarea" id="sk-py-${uid}"
                style="min-height:220px;font-family:var(--font-mono);font-size:12px"></textarea>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="saveSkill(${skillId || 'null'},'${uid}')">
       <i class="fa-solid fa-floppy-disk"></i> ${skillId ? 'Update' : 'Save Skill'}
     </button>`
  );

  setTimeout(() => {
    const md = document.getElementById(`sk-md-${uid}`);
    const py = document.getElementById(`sk-py-${uid}`);
    if (md) md.value = skill?.skills_md || '# Agent Name\n\n## Role\n…\n\n## Capabilities\n- …\n\n## Behavioral Guidelines\n- …';
    if (py) py.value = skill?.tools_py  || 'def tool_name(param: str) -> str:\n    """Tool description."""\n    return f"Result: {param}"';
  }, 40);
}

async function saveSkill(skillId, uid) {
  const name      = document.getElementById(`sk-name-${uid}`)?.value.trim();
  const category  = document.getElementById(`sk-cat-${uid}`)?.value || 'general';
  const desc      = document.getElementById(`sk-desc-${uid}`)?.value.trim();
  const skills_md = document.getElementById(`sk-md-${uid}`)?.value || '';
  const tools_py  = document.getElementById(`sk-py-${uid}`)?.value || '';

  if (!name) { toast('Skill name is required', 'error'); return; }

  try {
    if (skillId) {
      await api.put(`/skills/${skillId}`, { name, category, description: desc, skills_md, tools_py });
      toast('Skill updated', 'success');
    } else {
      await api.post('/skills', { name, category, description: desc, skills_md, tools_py });
      toast(`"${name}" saved to your library`, 'success');
    }
    closeModal();
    await loadSavedSkills();
    switchSkillsTab('tab-saved');
  } catch (e) {
    toast('Save failed: ' + e.message, 'error');
  }
}

async function deleteSkill(id) {
  openModal('Delete Skill',
    '<div style="text-align:center;padding:8px 0 16px">' +
    '<i class="fa-solid fa-triangle-exclamation" style="font-size:32px;color:var(--red);margin-bottom:12px;display:block"></i>' +
    '<p style="font-size:14px;color:var(--text)">Delete this skill?</p>' +
    '<p style="font-size:13px;color:var(--muted);margin-top:6px">This cannot be undone.</p>' +
    '</div>',
    '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-danger" onclick="closeModal();_doDeleteSkill(' + id + ')"><i class="fa-solid fa-trash"></i> Delete</button>'
  );
}

async function _doDeleteSkill(id) {
  try {
    await api.del(`/skills/${id}`);
    toast('Skill deleted', 'success');
    await loadSavedSkills();
  } catch { toast('Failed to delete skill', 'error'); }
}

// ── Create agent actions ──────────────────────────────────────────────────────

async function saveTemplateAsSkill(key) {
  const t = SKILL_TEMPLATES[key];
  if (!t) return;
  try {
    await api.post('/skills', { name: t.name, category: t.category, description: t.description, skills_md: t.skills_md, tools_py: t.tools_py });
    toast(`"${t.name}" saved to your library`, 'success');
    await loadSavedSkills();
  } catch (e) { toast('Save failed: ' + e.message, 'error'); }
}

async function createAgentFromTemplate(key) {
  const t = SKILL_TEMPLATES[key];
  if (!t) return;
  try {
    const skill = await api.post('/skills', { name: t.name, category: t.category, description: t.description, skills_md: t.skills_md, tools_py: t.tools_py });
    const agent = await api.post(`/skills/${skill.id}/create-agent`, { name: t.name });
    toast(`Agent "${agent.name}" created — assign a model in the Agents page`, 'success');
    await loadSavedSkills();
    setTimeout(() => navigate('agents', document.querySelector('[data-page=agents]')), 900);
  } catch (e) { toast('Failed: ' + e.message, 'error'); }
}

async function createAgentFromSaved(skillId) {
  const skill = _skills.find(s => s.id === skillId);
  if (!skill) return;
  try {
    const agent = await api.post(`/skills/${skillId}/create-agent`, { name: skill.name });
    toast(`Agent "${agent.name}" created`, 'success');
    setTimeout(() => navigate('agents', document.querySelector('[data-page=agents]')), 900);
  } catch (e) { toast('Failed: ' + e.message, 'error'); }
}

// ── Import guide ──────────────────────────────────────────────────────────────

function renderImportGuide() {
  const el = document.getElementById('import-guide-content');
  if (!el) return;
  el.innerHTML = `
    <div style="max-width:720px">
      <div class="card" style="margin-bottom:20px;border-left:4px solid var(--green)">
        <div style="font-size:15px;font-weight:700;margin-bottom:12px">
          <i class="fa-solid fa-circle-check" style="color:var(--green)"></i> Fully Compatible Sources
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div style="padding:12px 14px;background:var(--surface-2);border-radius:var(--radius);border:1px solid var(--border)">
            <div style="font-weight:600;font-size:13.5px;margin-bottom:4px">
              <a href="https://github.com/msitarzewski/agency-agents" target="_blank" style="color:var(--accent);text-decoration:none">
                <i class="fa-brands fa-github"></i> agency-agents (67k ⭐)
              </a>
              <span class="badge badge-green" style="margin-left:8px">Direct paste</span>
            </div>
            <p style="font-size:13px;color:var(--text-2);margin-bottom:8px">147 expert .md agents — researchers, writers, coders, marketers, legal, finance.</p>
            <pre class="code-block" style="font-size:11.5px">1. Browse: github.com/msitarzewski/agency-agents
2. Open any .md file → click Raw → copy all
3. Here: Agents → New Agent → paste into skills.md
4. Add tools.py from the templates in this Library</pre>
          </div>
          <div style="padding:12px 14px;background:var(--surface-2);border-radius:var(--radius);border:1px solid var(--border)">
            <div style="font-weight:600;font-size:13.5px;margin-bottom:4px">
              Any Markdown system prompt
              <span class="badge badge-green" style="margin-left:8px">Native format</span>
            </div>
            <p style="font-size:13px;color:var(--text-2)">ChatGPT / Claude / Gemini system prompts — paste directly into skills.md. Recommended structure: Role → Capabilities → Behavioral Guidelines.</p>
          </div>
        </div>
      </div>

      <div class="card" style="border-left:4px solid var(--accent)">
        <div style="font-size:15px;font-weight:700;margin-bottom:14px">
          <i class="fa-solid fa-screwdriver-wrench" style="color:var(--accent)"></i> Build an Agent — Step by Step
        </div>
        ${[
          ['1','Define the role','One sentence: "You are a [job title] who [primary task]."','fa-user'],
          ['2','List capabilities','4–6 specific things it can do. Be concrete, not vague.','fa-list'],
          ['3','Write behavioral guidelines','Tone, output format, what to do when stuck. Min 3 rules.','fa-scale-balanced'],
          ['4','Add tools (Python stubs)','Each tool = a Python def with docstring. LLM reads signatures.','fa-code'],
          ['5','Save to library','Click Save Skill — persists in DB, shows in Saved Skills.','fa-floppy-disk'],
          ['6','Create the agent','Click Create Agent — assigns model via the Agents page.','fa-robot'],
          ['7','Test in Chat','Agents → Chat → send a test message. Refine if needed.','fa-comments'],
          ['8','Add to a Workflow','Builder → drag onto canvas → connect with edges → Run.','fa-diagram-project'],
        ].map(([n,title,desc,icon]) => `
          <div style="display:flex;gap:14px;padding:11px 0;border-bottom:1px solid var(--border-light)">
            <div style="width:28px;height:28px;border-radius:50%;background:var(--accent);color:#fff;
                        display:flex;align-items:center;justify-content:center;font-size:12px;
                        font-weight:700;flex-shrink:0;margin-top:2px">${n}</div>
            <div>
              <div style="font-size:13.5px;font-weight:600;margin-bottom:2px">
                <i class="fa-solid ${icon}" style="color:var(--accent);margin-right:6px"></i>${title}
              </div>
              <div style="font-size:13px;color:var(--text-2);line-height:1.6">${desc}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
