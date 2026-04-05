/* ── Workflow Builder ────────────────────────────────────────────────────────
   SELECTION MODEL
   ───────────────────────────────────────────────────────────────────────────
   Nodes have ONLY onmousedown — no onclick.
   startNodeDrag() tracks whether the mouse actually moved (threshold 4px).
   • If NO movement  → treat as a click → select the node, show properties.
   • If movement     → drag the node, do NOT change selection.
   This eliminates the race where renderCanvas() in onUp destroys the DOM
   element before the browser can fire the click event.
   ─────────────────────────────────────────────────────────────────────────── */

let _builderState = {
  nodes:           [],
  edges:           [],
  selected:        null,
  currentWorkflow: null
};
let _builderAgents  = [];
let _canvasScale    = 1;
let _paletteDragData = null;
let _connectSource  = null;   // node id currently being connected from

// ── Page HTML ──────────────────────────────────────────────────────────────────

function renderBuilder() {
  const page = document.getElementById('page-builder');
  page.innerHTML = `
    <div class="builder-layout">

      <!-- Left palette -->
      <div class="builder-palette">
        <div class="palette-title">Agent Palette</div>
        <div id="palette-agents"></div>

        <div class="palette-title" style="margin-top:20px">Node Types</div>
        <div class="palette-item" draggable="true"
             ondragstart="paletteDragStart(event,'supervisor')">
          <i class="fa-solid fa-sitemap" style="color:var(--green)"></i>
          <span>Supervisor</span>
        </div>
        <div class="palette-item" draggable="true"
             ondragstart="paletteDragStart(event,'agent')">
          <i class="fa-solid fa-robot" style="color:var(--accent)"></i>
          <span>Agent Node</span>
        </div>

        <div class="section-divider"></div>
        <div class="palette-title">Workflow</div>
        <select class="form-select" id="builder-wf-select"
                onchange="loadWFIntoCanvas(this.value)"
                style="margin-bottom:8px">
          <option value="">— Select —</option>
        </select>
        <button class="btn btn-secondary btn-sm"
                style="width:100%;justify-content:center;margin-bottom:6px"
                onclick="saveCanvasToWorkflow()">
          <i class="fa-solid fa-floppy-disk"></i> Save
        </button>
        <button class="btn btn-ghost btn-sm"
                style="width:100%;justify-content:center"
                onclick="clearCanvasConfirm()">
          <i class="fa-solid fa-eraser"></i> Clear
        </button>

        <div class="section-divider"></div>
        <div style="font-size:11.5px;color:var(--muted);line-height:1.7;padding:0 2px">
          <strong style="color:var(--text-2);display:block;margin-bottom:4px">
            How to use
          </strong>
          <span style="color:var(--accent)">①</span> Drag an agent onto canvas<br>
          <span style="color:var(--accent)">②</span> Click node to select / edit<br>
          <span style="color:var(--accent)">③</span> Click a port ● then another to connect<br>
          <span style="color:var(--accent)">④</span> Drag node body to reposition
        </div>
      </div>

      <!-- Canvas -->
      <div class="builder-canvas-wrap" id="canvas-wrap"
           ondragover="event.preventDefault()"
           ondrop="canvasDrop(event)"
           onmousedown="canvasBackgroundClick(event)">
        <div class="canvas-toolbar">
          <button class="btn-icon" title="Zoom In"  onclick="zoomCanvas(1.15)">
            <i class="fa-solid fa-magnifying-glass-plus"></i>
          </button>
          <button class="btn-icon" title="Zoom Out" onclick="zoomCanvas(0.87)">
            <i class="fa-solid fa-magnifying-glass-minus"></i>
          </button>
          <div class="divider"></div>
          <button class="btn-icon" title="Fit"      onclick="fitCanvas()">
            <i class="fa-solid fa-expand"></i>
          </button>
          <button class="btn-icon" title="Delete selected node"
                  style="color:var(--red)"           onclick="deleteSelected()">
            <i class="fa-solid fa-trash"></i>
          </button>
          <div class="divider"></div>
          <span id="canvas-info"
                style="font-size:12px;color:var(--muted);padding:0 4px;
                       font-family:var(--font-mono)">0 nodes</span>
        </div>

        <!-- SVG edge overlay — pointer-events:none so clicks pass through to nodes -->
        <svg id="edges-svg"
             style="position:absolute;top:0;left:0;width:100%;height:100%;
                    pointer-events:none;z-index:4;overflow:visible"></svg>

        <!-- Node layer -->
        <div id="canvas-nodes"
             style="position:absolute;top:0;left:0;width:100%;height:100%;"></div>
      </div>

      <!-- Right: Properties -->
      <div class="builder-props">
        <div class="builder-props-header">
          <i class="fa-solid fa-sliders" style="color:var(--accent);font-size:13px"></i>
          Properties
        </div>
        <div id="props-panel">
          <div class="empty-state" style="padding:40px 16px">
            <i class="fa-regular fa-hand-pointer"
               style="font-size:28px;opacity:0.3"></i>
            <p style="font-size:12.5px;margin-top:12px;color:var(--muted)">
              Click a node to edit its properties
            </p>
          </div>
        </div>
      </div>
    </div>
  `;

  loadBuilderData();
  window._builderLoadWorkflow = loadWorkflowDef;
}

// ── Data ───────────────────────────────────────────────────────────────────────

async function loadBuilderData() {
  try {
    _builderAgents = await api.get('/agents');
    const workflows = await api.get('/workflows');

    document.getElementById('palette-agents').innerHTML =
      _builderAgents.map(a => `
        <div class="palette-item" draggable="true"
             ondragstart="paletteDragStart(event,'agent',${a.id},'${a.name.replace(/'/g,"\\'")}')">
          <i class="fa-solid fa-robot"></i>
          <span>${truncate(a.name, 20)}</span>
        </div>`).join('') ||
      `<div style="font-size:12px;color:var(--muted);padding:8px 2px">
         No agents yet — create agents first.
       </div>`;

    const sel = document.getElementById('builder-wf-select');
    workflows.forEach(w => {
      const o = document.createElement('option');
      o.value = w.id; o.textContent = w.name;
      sel.appendChild(o);
    });
  } catch {
    toast('Failed to load builder data', 'error');
  }
}

// ── Drag & drop from palette ──────────────────────────────────────────────────

function paletteDragStart(event, type, agentId = null, agentName = '') {
  _paletteDragData = { type, agentId, agentName };
  event.dataTransfer.effectAllowed = 'copy';
}

function canvasDrop(event) {
  event.preventDefault();
  if (!_paletteDragData) return;

  const wrap = document.getElementById('canvas-wrap');
  const rect = wrap.getBoundingClientRect();
  const x    = Math.max(10, (event.clientX - rect.left - 80) / _canvasScale);
  const y    = Math.max(10, (event.clientY - rect.top  - 50) / _canvasScale);

  if (_builderState.nodes.length >= 15) {
    toast('Maximum 15 nodes per workflow', 'error'); return;
  }

  const id   = 'n' + Date.now();
  const node = {
    id,
    type:        _paletteDragData.type === 'supervisor' ? 'supervisor' : 'agent',
    agent_id:    _paletteDragData.agentId,
    label:       _paletteDragData.agentName ||
                 (_paletteDragData.type === 'supervisor' ? 'Supervisor' : 'Agent'),
    x, y,
    model:       '',
    output_type: 'txt'
  };
  _builderState.nodes.push(node);
  _paletteDragData = null;

  // Auto-select the new node
  _builderState.selected = id;
  renderCanvas();
  renderNodeProps(id);
}

// ── Canvas background click — deselect ────────────────────────────────────────

function canvasBackgroundClick(event) {
  // Only deselect if we clicked the wrap or nodes container directly (not a node)
  if (event.target.id === 'canvas-wrap' || event.target.id === 'canvas-nodes') {
    if (_builderState.selected) {
      _builderState.selected = null;
      renderCanvas();
      showPropsEmpty();
    }
    if (_connectSource) {
      _connectSource = null;
      renderCanvas();
    }
  }
}

// ── Render canvas ─────────────────────────────────────────────────────────────

function renderCanvas() {
  const nodesEl = document.getElementById('canvas-nodes');
  if (!nodesEl) return;

  nodesEl.innerHTML = _builderState.nodes.map(n => {
    const isSelected = _builderState.selected === n.id;
    const isConnSrc  = _connectSource === n.id;
    const selStyle   = isSelected
      ? 'border-color:var(--accent);box-shadow:0 0 0 3px rgba(230,126,34,0.2);'
      : '';
    const connStyle  = isConnSrc
      ? 'border-color:var(--green);box-shadow:0 0 0 3px rgba(45,159,117,0.25);'
      : '';

    return `
      <div class="wf-node ${n.type === 'supervisor' ? 'supervisor' : ''}"
           id="node-${n.id}"
           style="left:${n.x * _canvasScale}px;
                  top:${n.y * _canvasScale}px;
                  width:${160 * _canvasScale}px;
                  cursor:move;
                  ${selStyle}${connStyle}"
           onmousedown="_nodeMousedown(event,'${n.id}')">

        <!-- Selected indicator pill -->
        ${isSelected ? `<div style="position:absolute;top:-10px;left:50%;
          transform:translateX(-50%);background:var(--accent);color:#fff;
          font-size:9px;font-weight:700;padding:1px 7px;border-radius:99px;
          letter-spacing:.04em;white-space:nowrap">SELECTED</div>` : ''}

        <div class="node-type-badge">${n.type}</div>
        <div class="node-label">${n.label}</div>
        <div class="node-model" style="font-size:10.5px;color:var(--muted);
             font-family:var(--font-mono);margin-top:2px">
          ${n.model || '<em style="opacity:.5">no model set</em>'}
        </div>

        <div class="node-ports">
          <div class="node-port" title="Connect"
               style="cursor:crosshair"
               onmousedown="event.stopPropagation();portMousedown(event,'${n.id}')">
          </div>
          <div class="node-port" title="Connect"
               style="cursor:crosshair"
               onmousedown="event.stopPropagation();portMousedown(event,'${n.id}')">
          </div>
        </div>
      </div>`;
  }).join('');

  requestAnimationFrame(drawEdges);

  document.getElementById('canvas-info').textContent =
    `${_builderState.nodes.length} nodes · ${_builderState.edges.length} edges`;
}

// ── Node mousedown — unified select + drag ────────────────────────────────────
// This is the ONLY mouse handler on nodes. We differentiate click from drag
// by tracking how much the mouse actually moved.

function _nodeMousedown(event, nodeId) {
  // Don't interfere with port clicks — they have their own handler
  if (event.target.classList.contains('node-port')) return;

  event.stopPropagation();  // prevent canvasBackgroundClick

  const node = _builderState.nodes.find(n => n.id === nodeId);
  if (!node) return;

  const startX  = event.clientX;
  const startY  = event.clientY;
  const origX   = node.x;
  const origY   = node.y;
  let   moved   = false;
  const DRAG_THRESHOLD = 4;  // pixels — below this is treated as a click

  function onMove(e) {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!moved && Math.sqrt(dx*dx + dy*dy) < DRAG_THRESHOLD) return;

    moved  = true;
    node.x = origX + dx / _canvasScale;
    node.y = origY + dy / _canvasScale;

    // Move DOM element directly (avoid full re-render during drag)
    const el = document.getElementById(`node-${nodeId}`);
    if (el) {
      el.style.left = node.x * _canvasScale + 'px';
      el.style.top  = node.y * _canvasScale + 'px';
    }
    drawEdges();  // keep arrows connected during drag
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);

    if (!moved) {
      // ── This was a CLICK — select the node ──────────────────────────────
      _builderState.selected = (_builderState.selected === nodeId) ? null : nodeId;
      renderCanvas();
      if (_builderState.selected) {
        renderNodeProps(_builderState.selected);
      } else {
        showPropsEmpty();
      }
    } else {
      // ── This was a DRAG — just redraw in final position ──────────────────
      renderCanvas();
      // Keep properties panel showing the same node if it was already selected
      if (_builderState.selected === nodeId) {
        renderNodeProps(nodeId);
      }
    }
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

// ── Port click — connect two nodes ────────────────────────────────────────────

function portMousedown(event, nodeId) {
  event.stopPropagation();
  event.preventDefault();

  if (!_connectSource) {
    // Start connection from this node
    _connectSource = nodeId;
    renderCanvas();
    toast(`Node "${_builderState.nodes.find(n=>n.id===nodeId)?.label}" selected — click another node's port to connect`, 'info');
    return;
  }

  if (_connectSource === nodeId) {
    // Clicked same port — cancel
    _connectSource = null;
    renderCanvas();
    return;
  }

  // Check for duplicate edge
  const exists = _builderState.edges.find(
    e => e.source === _connectSource && e.target === nodeId
  );
  if (!exists) {
    _builderState.edges.push({ id: 'e' + Date.now(), source: _connectSource, target: nodeId });
    toast('Nodes connected', 'success');
  } else {
    toast('Already connected', 'info');
  }
  _connectSource = null;
  renderCanvas();
}

// ── SVG edges ─────────────────────────────────────────────────────────────────

function drawEdges() {
  const svgEl = document.getElementById('edges-svg');
  const wrap  = document.getElementById('canvas-wrap');
  if (!svgEl || !wrap) return;

  const wr = wrap.getBoundingClientRect();

  const paths = _builderState.edges.map(e => {
    const s = document.getElementById(`node-${e.source}`);
    const t = document.getElementById(`node-${e.target}`);
    if (!s || !t) return '';

    const sr = s.getBoundingClientRect();
    const tr = t.getBoundingClientRect();

    const x1 = sr.right  - wr.left;
    const y1 = sr.top    - wr.top + sr.height / 2;
    const x2 = tr.left   - wr.left;
    const y2 = tr.top    - wr.top + tr.height / 2;
    const cp = Math.max(60, Math.abs(x2 - x1) * 0.5);

    const active = _builderState.selected &&
      (e.source === _builderState.selected || e.target === _builderState.selected);

    return `<path
      d="M${x1},${y1} C${x1+cp},${y1} ${x2-cp},${y2} ${x2},${y2}"
      stroke="${active ? 'var(--accent)' : '#CBD5E0'}"
      stroke-width="${active ? 2.5 : 1.8}"
      fill="none" opacity="${active ? 1 : 0.8}"
      marker-end="url(#ah${active ? 'a' : ''})" />`;
  }).join('');

  svgEl.innerHTML = `
    <defs>
      <marker id="ah" markerWidth="10" markerHeight="7"
              refX="9" refY="3.5" orient="auto" markerUnits="strokeWidth">
        <polygon points="0 0,10 3.5,0 7" fill="#CBD5E0" opacity="0.9"/>
      </marker>
      <marker id="aha" markerWidth="10" markerHeight="7"
              refX="9" refY="3.5" orient="auto" markerUnits="strokeWidth">
        <polygon points="0 0,10 3.5,0 7" fill="var(--accent)"/>
      </marker>
    </defs>
    ${paths}`;
}

// ── Properties panel ──────────────────────────────────────────────────────────

function showPropsEmpty() {
  const panel = document.getElementById('props-panel');
  if (!panel) return;
  panel.innerHTML = `
    <div class="empty-state" style="padding:40px 16px">
      <i class="fa-regular fa-hand-pointer" style="font-size:28px;opacity:0.3"></i>
      <p style="font-size:12.5px;margin-top:12px;color:var(--muted)">
        Click a node to edit its properties
      </p>
    </div>`;
}

function renderNodeProps(id) {
  const node  = _builderState.nodes.find(n => n.id === id);
  if (!node) return;
  const panel = document.getElementById('props-panel');
  if (!panel) return;

  const outgoing = _builderState.edges.filter(e => e.source === id);
  const incoming = _builderState.edges.filter(e => e.target === id);

  panel.innerHTML = `
    <div style="padding:16px;display:flex;flex-direction:column;gap:14px">

      <!-- Node identity chip -->
      <div style="background:var(--accent-light);border:1px solid var(--accent-border);
                  border-radius:var(--radius);padding:10px 12px;
                  display:flex;align-items:center;gap:10px">
        <i class="fa-solid fa-${node.type==='supervisor'?'sitemap':'robot'}"
           style="color:var(--accent);font-size:15px;flex-shrink:0"></i>
        <div style="min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--text);
                      white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${node.label}
          </div>
          <div style="font-size:10px;color:var(--muted);font-family:var(--font-mono)">
            ${node.id}
          </div>
        </div>
      </div>

      <!-- Connection counts -->
      <div style="display:flex;gap:8px">
        <div style="flex:1;text-align:center;padding:8px;background:var(--surface-2);
                    border:1px solid var(--border-light);border-radius:var(--radius)">
          <div style="font-size:18px;font-weight:700;color:var(--text);
                      font-family:var(--font-display)">${incoming.length}</div>
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;
                      letter-spacing:.05em">In</div>
        </div>
        <div style="flex:1;text-align:center;padding:8px;background:var(--surface-2);
                    border:1px solid var(--border-light);border-radius:var(--radius)">
          <div style="font-size:18px;font-weight:700;color:var(--accent);
                      font-family:var(--font-display)">${outgoing.length}</div>
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;
                      letter-spacing:.05em">Out</div>
        </div>
      </div>

      <!-- Label -->
      <div class="form-group" style="margin:0">
        <label class="form-label">Label</label>
        <input class="form-input" id="prop-label"
               value="${node.label || ''}"
               oninput="_updateProp('${id}','label',this.value)" />
      </div>

      <!-- Agent -->
      <div class="form-group" style="margin:0">
        <label class="form-label">Agent</label>
        <select class="form-select" id="prop-agent"
                onchange="_updateProp('${id}','agent_id',parseInt(this.value)||null)">
          <option value="">— None —</option>
          ${_builderAgents.map(a =>
            `<option value="${a.id}" ${node.agent_id == a.id ? 'selected' : ''}>
               ${a.name}
             </option>`).join('')}
        </select>
      </div>

      <!-- Model override -->
      <div class="form-group" style="margin:0">
        <label class="form-label">
          Model
          <span style="font-size:10px;color:var(--muted);font-weight:400">
            (overrides agent default)
          </span>
        </label>
        <select class="form-select" id="prop-model"></select>
      </div>

      <!-- Output type -->
      <div class="form-group" style="margin:0">
        <label class="form-label">Output Type</label>
        <select class="form-select"
                onchange="_updateProp('${id}','output_type',this.value)">
          ${['txt','html','pdf','py','sh','bat','csv','json'].map(t =>
            `<option value="${t}" ${(node.output_type||'txt')===t?'selected':''}>${t}</option>`
          ).join('')}
        </select>
      </div>

      <!-- Node type -->
      <div class="form-group" style="margin:0">
        <label class="form-label">Node Type</label>
        <select class="form-select"
                onchange="_updateProp('${id}','type',this.value);renderCanvas()">
          <option value="agent"      ${node.type==='agent'      ?'selected':''}>agent</option>
          <option value="supervisor" ${node.type==='supervisor' ?'selected':''}>supervisor</option>
        </select>
      </div>

      <!-- Position info -->
      <div style="font-size:11px;color:var(--muted);font-family:var(--font-mono);
                  background:var(--surface-2);border:1px solid var(--border-light);
                  border-radius:var(--radius);padding:7px 10px">
        x: ${Math.round(node.x)} · y: ${Math.round(node.y)} · scale: ${_canvasScale.toFixed(2)}
      </div>

      <!-- Outgoing connections -->
      ${outgoing.length ? `
        <div>
          <div style="font-size:11px;font-weight:700;letter-spacing:.05em;
                      text-transform:uppercase;color:var(--muted);margin-bottom:6px">
            Connected to
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">
            ${outgoing.map(e => {
              const tgt = _builderState.nodes.find(n => n.id === e.target);
              return `<div style="display:flex;align-items:center;gap:8px;
                                  padding:6px 8px;background:var(--surface-2);
                                  border:1px solid var(--border-light);
                                  border-radius:var(--radius);font-size:12.5px">
                <i class="fa-solid fa-arrow-right"
                   style="color:var(--accent);font-size:10px;flex-shrink:0"></i>
                <span style="flex:1">${tgt?.label || e.target}</span>
                <button onclick="_removeEdge('${e.id}')"
                        style="background:none;border:none;color:var(--red);
                               cursor:pointer;padding:2px 4px;font-size:12px"
                        title="Remove connection">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>`;
            }).join('')}
          </div>
        </div>` : ''}

      <!-- Delete node -->
      <button class="btn btn-danger btn-sm"
              style="width:100%;justify-content:center;margin-top:4px"
              onclick="_confirmDeleteNode('${id}')">
        <i class="fa-solid fa-trash"></i> Remove Node
      </button>
    </div>`;

  // Populate model dropdown asynchronously
  setTimeout(async () => {
    const sel = document.getElementById('prop-model');
    if (!sel) return;
    try {
      await populateModelSelect(sel, node.model || '', true);
      sel.onchange = () => {
        _updateProp(id, 'model', sel.value);
        const opt = sel.options[sel.selectedIndex];
        if (opt?.dataset?.sourceName) _updateProp(id, 'source', opt.dataset.sourceName);
      };
    } catch {
      sel.innerHTML = '<option value="">— model list unavailable —</option>';
    }
  }, 50);
}

// ── Node prop helpers ─────────────────────────────────────────────────────────

function _updateProp(id, key, value) {
  const node = _builderState.nodes.find(n => n.id === id);
  if (!node) return;
  node[key] = value;
  // Refresh canvas label/type badge without losing selection
  if (key === 'label' || key === 'type') {
    const el = document.getElementById(`node-${id}`);
    if (el) {
      if (key === 'label') {
        const lbl = el.querySelector('.node-label');
        if (lbl) lbl.textContent = value;
      }
      if (key === 'type') renderCanvas(); // type affects CSS class
    }
  }
  if (key === 'model') {
    const el = document.getElementById(`node-${id}`);
    if (el) {
      const mdl = el.querySelector('.node-model');
      if (mdl) mdl.innerHTML = value || '<em style="opacity:.5">no model set</em>';
    }
  }
}

function _removeEdge(edgeId) {
  _builderState.edges = _builderState.edges.filter(e => e.id !== edgeId);
  renderCanvas();
  if (_builderState.selected) renderNodeProps(_builderState.selected);
}

// ── Delete node ───────────────────────────────────────────────────────────────

function _confirmDeleteNode(id) {
  const node  = _builderState.nodes.find(n => n.id === id);
  const label = node?.label || id;
  openModal('Remove Node', `
    <div style="text-align:center;padding:8px 0 16px">
      <i class="fa-solid fa-triangle-exclamation"
         style="font-size:32px;color:var(--amber);margin-bottom:14px;display:block"></i>
      <p style="font-size:14px;color:var(--text);font-weight:500">
        Remove <strong>${label}</strong>?
      </p>
      <p style="font-size:13px;color:var(--muted);margin-top:6px">
        All edges connected to this node will also be removed.
      </p>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-danger"
             onclick="closeModal();_doDeleteNode('${id}')">
       <i class="fa-solid fa-trash"></i> Remove
     </button>`);
}

function _doDeleteNode(id) {
  _builderState.nodes = _builderState.nodes.filter(n => n.id !== id);
  _builderState.edges = _builderState.edges.filter(e => e.source !== id && e.target !== id);
  if (_builderState.selected === id) _builderState.selected = null;
  renderCanvas();
  showPropsEmpty();
}

function deleteSelected() {
  if (_builderState.selected) {
    _confirmDeleteNode(_builderState.selected);
  } else {
    toast('No node selected', 'info');
  }
}

// ── Clear canvas ──────────────────────────────────────────────────────────────

function clearCanvasConfirm() {
  if (!_builderState.nodes.length) { toast('Canvas is already empty', 'info'); return; }
  openModal('Clear Canvas', `
    <div style="text-align:center;padding:8px 0 16px">
      <i class="fa-solid fa-eraser"
         style="font-size:32px;color:var(--amber);margin-bottom:14px;display:block"></i>
      <p style="font-size:14px;color:var(--text)">
        Clear all ${_builderState.nodes.length} nodes and ${_builderState.edges.length} edges?
      </p>
      <p style="font-size:13px;color:var(--muted);margin-top:6px">
        Unsaved changes will be lost.
      </p>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-danger" onclick="closeModal();_doClearCanvas()">
       <i class="fa-solid fa-eraser"></i> Clear
     </button>`);
}

function _doClearCanvas() {
  _builderState.nodes    = [];
  _builderState.edges    = [];
  _builderState.selected = null;
  _connectSource = null;
  renderCanvas();
  showPropsEmpty();
}

// ── Zoom ──────────────────────────────────────────────────────────────────────

function zoomCanvas(factor) {
  _canvasScale = Math.max(0.35, Math.min(2.2, _canvasScale * factor));
  renderCanvas();
  if (_builderState.selected) renderNodeProps(_builderState.selected);
}

function fitCanvas() {
  _canvasScale = 1;
  renderCanvas();
  if (_builderState.selected) renderNodeProps(_builderState.selected);
}

// ── Save / Load ───────────────────────────────────────────────────────────────

async function saveCanvasToWorkflow() {
  const sel  = document.getElementById('builder-wf-select');
  const wfId = sel?.value;
  if (!wfId) { toast('Select a workflow first', 'error'); return; }
  try {
    const wf = await api.get(`/workflows/${wfId}`);
    await api.put(`/workflows/${wfId}`, {
      ...wf,
      definition: { nodes: _builderState.nodes, edges: _builderState.edges }
    });
    toast(`Saved — ${_builderState.nodes.length} nodes, ${_builderState.edges.length} edges`, 'success');
  } catch {
    toast('Save failed', 'error');
  }
}

async function loadWFIntoCanvas(wfId) {
  if (!wfId) return;
  try {
    const wf = await api.get(`/workflows/${wfId}`);
    loadWorkflowDef(wf);
  } catch {
    toast('Failed to load workflow', 'error');
  }
}

function loadWorkflowDef(wf) {
  const def = wf.definition || {};
  _builderState.nodes    = (def.nodes || []).map(n => ({ ...n }));
  _builderState.edges    = (def.edges || []).map(e => ({ ...e }));
  _builderState.selected = null;
  _connectSource = null;

  const sel = document.getElementById('builder-wf-select');
  if (sel) sel.value = wf.id;

  renderCanvas();
  showPropsEmpty();
  toast(`Loaded: ${wf.name} — ${_builderState.nodes.length} nodes`, 'info');
}
