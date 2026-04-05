/* ── Chat Page ── */

let _sessions     = [];
let _currentSession = null;

// ── Page render ───────────────────────────────────────────────────────────────

async function renderChat() {
  const page = document.getElementById('page-chat');
  page.innerHTML = `
    <div class="chat-layout" style="height:100vh">

      <!-- Sidebar: session list -->
      <div class="chat-sidebar">
        <div class="chat-sidebar-header">
          <h3>Sessions</h3>
          <button class="btn-icon" onclick="newChatSessionModal()" title="New session">
            <i class="fa-solid fa-plus"></i>
          </button>
        </div>
        <div class="sessions-list" id="sessions-list">
          <div style="padding:20px;text-align:center;color:var(--muted);font-size:13px">
            <i class="fa-solid fa-circle-notch fa-spin"></i>
          </div>
        </div>
      </div>

      <!-- Main chat area -->
      <div class="chat-main">

        <!-- Header -->
        <div class="chat-header" id="chat-header">
          <i class="fa-solid fa-comments" style="color:var(--accent);font-size:16px;flex-shrink:0"></i>
          <div style="flex:1;min-width:0">
            <div id="chat-header-title" style="font-size:14px;font-weight:600;color:var(--text)">
              Select or create a session
            </div>
            <div id="chat-header-sub" style="font-size:12px;color:var(--muted)">
              Chat directly with any agent, or with a workflow orchestrator
            </div>
          </div>
          <div id="chat-header-actions" style="display:flex;gap:8px;align-items:center"></div>
        </div>

        <!-- Messages -->
        <div class="chat-messages" id="chat-messages">
          <div class="chat-empty-state" style="text-align:center;color:var(--muted);padding:80px 32px">
            <i class="fa-solid fa-comments" style="font-size:40px;display:block;margin-bottom:16px;opacity:0.2"></i>
            <div style="font-size:14px;font-weight:500;margin-bottom:8px">No session selected</div>
            <div style="font-size:13px;line-height:1.6">
              Create a new session to chat with a single agent<br>
              or route through an entire workflow orchestrator.
            </div>
            <button class="btn btn-primary" style="margin-top:20px" onclick="newChatSessionModal()">
              <i class="fa-solid fa-plus"></i> New Session
            </button>
          </div>
        </div>

        <!-- Input area (hidden until session selected) -->
        <div class="chat-input-area" id="chat-input-area" style="display:none">

          <!-- Model override bar -->
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;
                      padding:8px 12px;background:var(--surface-2);border-radius:var(--radius);
                      border:1px solid var(--border-light)">
            <i class="fa-solid fa-microchip" style="color:var(--muted);font-size:11px;flex-shrink:0"></i>
            <span style="font-size:12px;color:var(--muted);white-space:nowrap">Override model:</span>
            <select id="chat-model-override" class="form-select"
                    style="flex:1;font-family:var(--font-mono);font-size:12px;
                           padding:4px 8px;border:none;background:transparent">
              <option value="">From agent / workflow settings</option>
            </select>
            <span id="chat-target-badge" style="font-size:11px;color:var(--muted);
                  white-space:nowrap;flex-shrink:0"></span>
          </div>

          <!-- Text input row -->
          <div class="chat-input-row">
            <textarea class="chat-input" id="chat-input"
              placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
              rows="1"
              onkeydown="chatInputKeydown(event)"
              oninput="autoResizeTA(this)"></textarea>
            <button class="btn btn-primary" onclick="sendChatMsg()" id="send-btn" title="Send">
              <i class="fa-solid fa-paper-plane"></i>
            </button>
          </div>

        </div><!-- /chat-input-area -->
      </div><!-- /chat-main -->
    </div><!-- /chat-layout -->
  `;

  await loadChatSessions();
  populateModelSelect(document.getElementById('chat-model-override'), '', true);
}

// ── Session management ────────────────────────────────────────────────────────

async function loadChatSessions() {
  try {
    _sessions = await api.get('/chat/sessions');
    renderSessionsList();
  } catch { toast('Failed to load sessions', 'error'); }
}

function renderSessionsList() {
  const el = document.getElementById('sessions-list');
  if (!_sessions.length) {
    el.innerHTML = `
      <div style="padding:24px 16px;text-align:center;color:var(--muted);font-size:13px">
        No sessions yet.
        <button class="btn btn-secondary btn-sm" style="display:block;margin:10px auto 0"
                onclick="newChatSessionModal()">
          <i class="fa-solid fa-plus"></i> New Session
        </button>
      </div>`;
    return;
  }

  el.innerHTML = _sessions.map(s => {
    const isActive = _currentSession?.id === s.id;
    const icon     = s.agent_name    ? 'fa-robot'            :
                     s.workflow_name ? 'fa-diagram-project'  : 'fa-comment';
    const target   = s.agent_name    ? `Agent: ${s.agent_name}` :
                     s.workflow_name ? `Workflow: ${s.workflow_name}` : 'Direct';
    const modelTag = s.agent_model   ? ` · ${s.agent_model}` : '';
    return `
      <div class="session-item ${isActive ? 'active' : ''}" onclick="selectSession(${s.id})">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:2px">
          <i class="fa-solid ${icon}" style="font-size:11px;color:var(--muted)"></i>
          <span class="session-name">${s.name || 'Session'}</span>
        </div>
        <div class="session-time">${target}${modelTag}</div>
        <div class="session-time">${formatDate(s.last_activity)}</div>
      </div>`;
  }).join('');
}

async function selectSession(id) {
  try {
    // Fetch fresh session data (has joined workflow/agent names)
    _currentSession = await api.get(`/chat/sessions/${id}`);
  } catch {
    _currentSession = _sessions.find(s => s.id === id);
  }
  if (!_currentSession) return;

  renderSessionsList();

  // Update header
  const icon   = _currentSession.agent_name    ? '🤖' :
                 _currentSession.workflow_name  ? '🔀' : '💬';
  const target = _currentSession.agent_name
    ? `Agent: ${_currentSession.agent_name}`
    : _currentSession.workflow_name
    ? `Workflow orchestrator: ${_currentSession.workflow_name}`
    : 'Direct session (global default model)';

  document.getElementById('chat-header-title').textContent = _currentSession.name || 'Session';
  document.getElementById('chat-header-sub').textContent   = target;
  document.getElementById('chat-header-actions').innerHTML = `
    <button class="btn-icon" title="Delete session"
            onclick="deleteChatSession(${id})" style="color:var(--red)">
      <i class="fa-solid fa-trash"></i>
    </button>`;

  // Show target badge in input bar
  const badge = document.getElementById('chat-target-badge');
  if (badge) badge.textContent = target;

  document.getElementById('chat-input-area').style.display = 'block';
  document.getElementById('chat-input')?.focus();

  await loadMessages();
}

async function loadMessages() {
  if (!_currentSession) return;
  const el = document.getElementById('chat-messages');
  try {
    const msgs = await api.get(`/chat/sessions/${_currentSession.id}/messages`);
    if (!msgs.length) {
      const who = _currentSession.agent_name || _currentSession.workflow_name || 'the assistant';
      el.innerHTML = `
        <div style="text-align:center;color:var(--muted);font-size:13.5px;padding:60px 32px">
          <i class="fa-solid fa-message" style="font-size:30px;display:block;
             margin-bottom:12px;opacity:0.25"></i>
          Ready to chat with <strong>${who}</strong>.<br>
          <span style="font-size:12.5px">Type a message below to begin.</span>
        </div>`;
      return;
    }
    el.innerHTML = msgs.map(m => buildMessageHTML(m.role, m.content)).join('');
    el.scrollTop = el.scrollHeight;
  } catch { toast('Failed to load messages', 'error'); }
}

// ── Message rendering ─────────────────────────────────────────────────────────

function buildMessageHTML(role, content, meta = null) {
  const isUser = role === 'user';

  // Escape for safe HTML injection
  const safe = (content || '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/\n/g, '<br>');

  const avatarIcon = isUser ? 'fa-user' : 'fa-robot';
  const avatarCls  = isUser ? 'style="background:var(--accent-light);color:var(--accent)"' : '';

  let responderLabel = '';
  if (!isUser && meta?.responder) {
    responderLabel = `
      <div class="message-responder">
        <i class="fa-solid fa-robot" style="font-size:10px"></i>
        ${meta.responder}
        ${meta.model
          ? `<span class="model-tag">· ${meta.model}</span>`
          : ''}
      </div>`;
  }

  return `
    <div class="message ${isUser ? 'user' : ''}">
      <div class="message-avatar" ${avatarCls}>
        <i class="fa-solid ${avatarIcon}"></i>
      </div>
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px">
        ${responderLabel}
        <div class="message-content">${safe}</div>
      </div>
    </div>`;
}

function buildTypingHTML(typingId) {
  return `
    <div class="message" id="${typingId}">
      <div class="message-avatar">
        <i class="fa-solid fa-robot"></i>
      </div>
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px">
        <div class="message-responder" id="${typingId}-label">
          <i class="fa-solid fa-circle-notch fa-spin" style="font-size:10px"></i>
          Thinking…
        </div>
        <div class="message-content" id="${typingId}-content">
          <div class="typing-dots">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>
    </div>`;
}

// ── Send message ──────────────────────────────────────────────────────────────

function chatInputKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMsg();
  }
}

async function sendChatMsg() {
  if (!_currentSession) { toast('Select a session first', 'error'); return; }

  const inputEl = document.getElementById('chat-input');
  const content = inputEl?.value.trim();
  if (!content) return;

  inputEl.value = '';
  if (inputEl.style) inputEl.style.height = 'auto';

  const modelOverride = document.getElementById('chat-model-override')?.value || null;
  const messagesEl    = document.getElementById('chat-messages');

  // Remove empty-state placeholder
  messagesEl.querySelector('.chat-empty-state,div[style*="padding:60px"]')?.remove();
  messagesEl.querySelector('div[style*="margin-top:80px"]')?.remove();

  // Append user bubble
  messagesEl.insertAdjacentHTML('beforeend', buildMessageHTML('user', content));

  // Typing indicator
  const typingId = 'typing-' + Date.now();
  messagesEl.insertAdjacentHTML('beforeend', buildTypingHTML(typingId));
  messagesEl.scrollTop = messagesEl.scrollHeight;

  const sendBtn = document.getElementById('send-btn');
  if (sendBtn) sendBtn.disabled = true;

  let streamContentEl = null;
  let streamText      = '';

  try {
    await api.stream(
      `/chat/sessions/${_currentSession.id}/message`,
      {
        content,
        agent_id:       _currentSession.agent_id    || null,
        workflow_id:    _currentSession.workflow_id  || null,
        model_override: modelOverride,
      },
      {
        onMeta(meta) {
          // Update typing indicator with real responder info
          const labelEl = document.getElementById(`${typingId}-label`);
          if (labelEl) {
            labelEl.innerHTML = `
              <i class="fa-solid fa-robot" style="font-size:10px"></i>
              ${meta.responder || 'Assistant'}
              ${meta.model
                ? `<span class="model-tag">· ${meta.model}</span>`
                : ''}`;
          }
          // Clear dots, prepare for streaming text
          const contentEl = document.getElementById(`${typingId}-content`);
          if (contentEl) {
            contentEl.innerHTML = '';
            streamContentEl = contentEl;
          }
        },

        onToken(token) {
          streamText += token;
          if (streamContentEl) {
            streamContentEl.innerHTML = streamText
              .replace(/&/g,  '&amp;')
              .replace(/</g,  '&lt;')
              .replace(/>/g,  '&gt;')
              .replace(/\n/g, '<br>');
            messagesEl.scrollTop = messagesEl.scrollHeight;
          }
        },

        onDone() {
          if (sendBtn) sendBtn.disabled = false;
          // Refresh sidebar so timestamps update
          loadChatSessions().then(() => {
            // Re-highlight current session without losing state
            renderSessionsList();
          });
        }
      }
    );
  } catch (err) {
    const contentEl = document.getElementById(`${typingId}-content`);
    if (contentEl) {
      contentEl.innerHTML = `<span style="color:var(--red)">
        <i class="fa-solid fa-triangle-exclamation"></i>
        ${err.message || 'Stream error'}
      </span>`;
    }
    if (sendBtn) sendBtn.disabled = false;
  }
}

// ── New session modal ─────────────────────────────────────────────────────────

async function newChatSessionModal() {
  let agents = [], workflows = [];
  try { agents    = await api.get('/agents');    } catch {}
  try { workflows = await api.get('/workflows'); } catch {}

  const agentOpts    = agents.map(a =>
    `<option value="${a.id}">${a.name}${a.llm_model ? ` (${a.llm_model})` : ''}</option>`
  ).join('');
  const workflowOpts = workflows.map(w =>
    `<option value="${w.id}">${w.name}</option>`
  ).join('');

  const body = `
    <div class="form-group">
      <label class="form-label">Session Name</label>
      <input class="form-input" id="sess-name"
             value="Session ${new Date().toLocaleDateString()}" />
    </div>

    <div style="margin-bottom:16px">
      <div style="font-size:12.5px;font-weight:600;color:var(--text);margin-bottom:10px">
        Who should respond?
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">

        <label class="mode-card" id="mcard-workflow">
          <input type="radio" name="sess-mode" value="workflow"
                 onchange="onModeChange()" checked />
          <div class="mode-card-icon" style="background:var(--green-light);color:var(--green)">
            <i class="fa-solid fa-diagram-project"></i>
          </div>
          <div>
            <div style="font-size:13.5px;font-weight:600">Workflow Orchestrator</div>
            <div style="font-size:12px;color:var(--muted)">Routes your message through the full pipeline</div>
          </div>
        </label>

        <label class="mode-card" id="mcard-agent">
          <input type="radio" name="sess-mode" value="agent"
                 onchange="onModeChange()" />
          <div class="mode-card-icon" style="background:var(--accent-light);color:var(--accent)">
            <i class="fa-solid fa-robot"></i>
          </div>
          <div>
            <div style="font-size:13.5px;font-weight:600">Single Agent</div>
            <div style="font-size:12px;color:var(--muted)">Chat directly with one specific agent</div>
          </div>
        </label>

        <label class="mode-card" id="mcard-direct">
          <input type="radio" name="sess-mode" value="direct"
                 onchange="onModeChange()" />
          <div class="mode-card-icon" style="background:var(--surface-2);color:var(--muted)">
            <i class="fa-solid fa-comment"></i>
          </div>
          <div>
            <div style="font-size:13.5px;font-weight:600">Direct (no target)</div>
            <div style="font-size:12px;color:var(--muted)">Uses the global default model</div>
          </div>
        </label>

      </div>
    </div>

    <div id="picker-workflow">
      <div class="form-group">
        <label class="form-label">Select Workflow</label>
        <select class="form-select" id="sess-workflow">
          ${workflowOpts || '<option value="">No workflows yet — create one first</option>'}
        </select>
      </div>
    </div>

    <div id="picker-agent" style="display:none">
      <div class="form-group">
        <label class="form-label">Select Agent</label>
        <select class="form-select" id="sess-agent">
          ${agentOpts || '<option value="">No agents yet — create one first</option>'}
        </select>
      </div>
    </div>
  `;

  openModal('New Chat Session', body, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="createChatSession()">
      <i class="fa-solid fa-plus"></i> Create &amp; Open
    </button>
  `);
}

function onModeChange() {
  const mode = document.querySelector('input[name="sess-mode"]:checked')?.value;
  document.getElementById('picker-workflow').style.display = mode === 'workflow' ? 'block' : 'none';
  document.getElementById('picker-agent').style.display   = mode === 'agent'    ? 'block' : 'none';
  // Highlight active card
  ['workflow','agent','direct'].forEach(m => {
    const card = document.getElementById(`mcard-${m}`);
    if (card) {
      card.style.borderColor  = m === mode ? 'var(--accent)'       : 'var(--border)';
      card.style.background   = m === mode ? 'var(--accent-light)' : 'var(--surface)';
    }
  });
}

async function createChatSession() {
  const name     = document.getElementById('sess-name')?.value.trim() || 'Session';
  const mode     = document.querySelector('input[name="sess-mode"]:checked')?.value || 'direct';
  const agentId  = mode === 'agent'    ? parseInt(document.getElementById('sess-agent')?.value    || '0') || null : null;
  const wfId     = mode === 'workflow' ? parseInt(document.getElementById('sess-workflow')?.value  || '0') || null : null;

  try {
    const sess = await api.post('/chat/sessions', {
      name,
      agent_id:    agentId,
      workflow_id: wfId,
    });
    closeModal();
    await loadChatSessions();
    await selectSession(sess.id);
    toast('Session created', 'success');
  } catch { toast('Failed to create session', 'error'); }
}

async function deleteChatSession(id) {
  openModal('Delete Session',
    '<div style="text-align:center;padding:8px 0 16px">' +
    '<i class="fa-solid fa-triangle-exclamation" style="font-size:32px;color:var(--red);margin-bottom:12px;display:block"></i>' +
    '<p style="font-size:14px;color:var(--text)">Delete this chat session?</p>' +
    '<p style="font-size:13px;color:var(--muted);margin-top:6px">All messages will be permanently removed.</p>' +
    '</div>',
    '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-danger" onclick="closeModal();_doDeleteSession(' + id + ')"><i class="fa-solid fa-trash"></i> Delete</button>'
  );
}

async function _doDeleteSession(id) {
  try {
    await api.del(`/chat/sessions/${id}`);
    _currentSession = null;
    document.getElementById('chat-messages').innerHTML = `
      <div class="chat-empty-state" style="text-align:center;color:var(--muted);padding:80px 32px">
        <i class="fa-solid fa-comments" style="font-size:40px;display:block;margin-bottom:16px;opacity:0.2"></i>
        <div style="font-size:14px;font-weight:500;margin-bottom:8px">No session selected</div>
      </div>`;
    document.getElementById('chat-input-area').style.display = 'none';
    document.getElementById('chat-header-title').textContent = 'Select or create a session';
    document.getElementById('chat-header-sub').textContent   = '';
    document.getElementById('chat-header-actions').innerHTML = '';
    await loadChatSessions();
    toast('Session deleted', 'success');
  } catch { toast('Failed to delete session', 'error'); }
}

function autoResizeTA(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}
