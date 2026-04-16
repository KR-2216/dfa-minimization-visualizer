/* ═══════════════════════════════════════════════════════
   DFA MINIMIZATION — Core Logic & Visualization
   ═══════════════════════════════════════════════════════ */

'use strict';

// ── State ────────────────────────────────────────────────────────────────────
let dfaData = null;          // parsed DFA object
let minimizationSteps = [];  // array of step objects
let currentStep = -1;
let currentGraphMode = 'original';
let minimizedDFA = null;

const PALETTE = [
  '#4CAF50','#2196F3','#FF9800','#9C27B0',
  '#E91E63','#00BCD4','#8BC34A','#FF5722'
];

// ── Examples ─────────────────────────────────────────────────────────────────
const EXAMPLES = [
  {
    name: 'Example 1 – Redundant states',
    states: 'q0,q1,q2,q3,q4',
    alphabet: 'a,b',
    start: 'q0',
    accept: 'q3,q4',
    transitions: {
      q0: { a: 'q1', b: 'q2' },
      q1: { a: 'q1', b: 'q3' },
      q2: { a: 'q2', b: 'q4' },
      q3: { a: 'q1', b: 'q3' },
      q4: { a: 'q2', b: 'q4' }
    }
  },
  {
    name: 'Example 2 – Three equivalent pairs',
    states: 'A,B,C,D,E,F',
    alphabet: '0,1',
    start: 'A',
    accept: 'C,D,F',
    transitions: {
      A: { '0': 'B', '1': 'C' },
      B: { '0': 'B', '1': 'D' },
      C: { '0': 'B', '1': 'C' },
      D: { '0': 'B', '1': 'C' },
      E: { '0': 'H', '1': 'F' },
      F: { '0': 'G', '1': 'C' }
    }
  },
  {
    name: 'Example 3 – Already minimal',
    states: 'q0,q1,q2',
    alphabet: 'a,b',
    start: 'q0',
    accept: 'q2',
    transitions: {
      q0: { a: 'q0', b: 'q1' },
      q1: { a: 'q2', b: 'q0' },
      q2: { a: 'q2', b: 'q2' }
    }
  }
];

// ── Page switching ────────────────────────────────────────────────────────────
function switchPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.getElementById('btn-' + page).classList.add('active');
}

// ── Load example ──────────────────────────────────────────────────────────────
function loadExample(idx) {
  const ex = EXAMPLES[idx];
  if (!ex) return;
  document.getElementById('input-states').value = ex.states;
  document.getElementById('input-alphabet').value = ex.alphabet;
  document.getElementById('input-start').value = ex.start;
  document.getElementById('input-accept').value = ex.accept;
  buildTransitionTable();

  // Fill transition table
  const states = ex.states.split(',').map(s => s.trim());
  const alpha  = ex.alphabet.split(',').map(a => a.trim());
  states.forEach(st => {
    alpha.forEach(sym => {
      const cell = document.getElementById(`trans-${st}-${sym}`);
      if (cell && ex.transitions[st]) cell.value = ex.transitions[st][sym] || '';
    });
  });
}

// ── Build transition table UI ─────────────────────────────────────────────────
function buildTransitionTable() {
  const statesRaw = document.getElementById('input-states').value;
  const alphaRaw  = document.getElementById('input-alphabet').value;
  const acceptRaw = document.getElementById('input-accept').value;
  if (!statesRaw || !alphaRaw) return;

  const states = statesRaw.split(',').map(s => s.trim()).filter(Boolean);
  const alpha  = alphaRaw.split(',').map(a => a.trim()).filter(Boolean);
  const accept = acceptRaw.split(',').map(s => s.trim()).filter(Boolean);

  let html = '<table class="trans-table"><thead><tr><th>δ</th>';
  alpha.forEach(sym => { html += `<th>${sym}</th>`; });
  html += '</tr></thead><tbody>';

  states.forEach(st => {
    const isAcc = accept.includes(st);
    html += `<tr><td class="row-label ${isAcc ? 'is-accept' : ''}">${isAcc ? '★ ' : ''}${st}</td>`;
    alpha.forEach(sym => {
      html += `<td><input type="text" id="trans-${st}-${sym}" placeholder="—" maxlength="10" /></td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  document.getElementById('transition-table-wrapper').innerHTML = html;
}

// ── Parse DFA from form ───────────────────────────────────────────────────────
function parseDFA() {
  const states = document.getElementById('input-states').value.split(',').map(s => s.trim()).filter(Boolean);
  const alpha  = document.getElementById('input-alphabet').value.split(',').map(a => a.trim()).filter(Boolean);
  const start  = document.getElementById('input-start').value.trim();
  const accept = document.getElementById('input-accept').value.split(',').map(s => s.trim()).filter(Boolean);

  if (!states.length || !alpha.length || !start) {
    alert('Please fill in states, alphabet, and start state.');
    return null;
  }
  if (!states.includes(start)) {
    alert(`Start state "${start}" is not in the states list.`);
    return null;
  }

  const delta = {};
  states.forEach(st => {
    delta[st] = {};
    alpha.forEach(sym => {
      const cell = document.getElementById(`trans-${st}-${sym}`);
      const val  = cell ? cell.value.trim() : '';
      if (val && !states.includes(val)) {
        alert(`Transition δ(${st}, ${sym}) = "${val}" is not a valid state.`);
        return null;
      }
      delta[st][sym] = val || null;
    });
  });

  return { states, alpha, start, accept, delta };
}

// ── Table-filling minimization ────────────────────────────────────────────────
function minimize(dfa) {
  const { states, alpha, accept, delta } = dfa;
  const steps = [];
  const n = states.length;

  // Step 0: initial partition
  const initialPartition = [
    accept.filter(s => states.includes(s)),
    states.filter(s => !accept.includes(s))
  ].filter(g => g.length > 0);

  steps.push({
    title: 'Step 0 — Initial Partition',
    description: 'Separate accept states (F) from non-accept states (Q \\ F).',
    partitions: initialPartition.map(g => [...g])
  });

  // Build pair marking table
  // marked[i][j] = true means states[i] and states[j] are distinguishable
  const marked = Array.from({ length: n }, () => Array(n).fill(false));
  const waiting = []; // pairs to process

  // Mark base case: one accept, one non-accept
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const iAcc = accept.includes(states[i]);
      const jAcc = accept.includes(states[j]);
      if (iAcc !== jAcc) {
        marked[i][j] = marked[j][i] = true;
      }
    }
  }

  steps.push({
    title: 'Step 1 — Mark Base Pairs',
    description: 'Mark pairs {p, q} where one is an accept state and the other is not (distinguished by ε).',
    markedPairs: getMarkedPairs(states, marked),
    tableSnapshot: snapshotTable(states, marked)
  });

  // Iterative refinement
  let changed = true;
  let iteration = 0;
  while (changed) {
    changed = false;
    iteration++;
    const newlyMarked = [];

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (marked[i][j]) continue;
        for (const sym of alpha) {
          const di = delta[states[i]][sym];
          const dj = delta[states[j]][sym];
          if (di === null || dj === null) continue;
          const idxi = states.indexOf(di);
          const idxj = states.indexOf(dj);
          if (idxi === -1 || idxj === -1) continue;
          if (idxi !== idxj && marked[idxi][idxj]) {
            marked[i][j] = marked[j][i] = true;
            changed = true;
            newlyMarked.push(`{${states[i]}, ${states[j]}} via '${sym}'`);
            break;
          }
        }
      }
    }

    if (newlyMarked.length > 0 || iteration === 1) {
      steps.push({
        title: `Step ${iteration + 1} — Refinement Iteration ${iteration}`,
        description: newlyMarked.length
          ? `Marked ${newlyMarked.length} new pair(s): ${newlyMarked.slice(0, 5).join(', ')}${newlyMarked.length > 5 ? ' …' : ''}`
          : 'No new pairs marked — algorithm converges.',
        markedPairs: getMarkedPairs(states, marked),
        tableSnapshot: snapshotTable(states, marked)
      });
    }
  }

  // Merge indistinguishable states
  const visited = new Set();
  const groups  = [];
  for (let i = 0; i < n; i++) {
    if (visited.has(i)) continue;
    const group = [states[i]];
    visited.add(i);
    for (let j = i + 1; j < n; j++) {
      if (!marked[i][j]) {
        group.push(states[j]);
        visited.add(j);
      }
    }
    groups.push(group);
  }

  steps.push({
    title: `Step ${iteration + 2} — Merge Equivalent States`,
    description: `Found ${groups.filter(g => g.length > 1).length} mergeable group(s). Constructing minimized DFA.`,
    partitions: groups.map(g => [...g]),
    isFinal: true
  });

  // Build minimized DFA
  const groupName = g => g.join(',');
  const stateToGroup = {};
  states.forEach(st => {
    const g = groups.find(gr => gr.includes(st));
    stateToGroup[st] = g;
  });

  const minStates    = groups.map(groupName);
  const minStart     = groupName(stateToGroup[dfa.start]);
  const minAccept    = groups.filter(g => g.some(s => accept.includes(s))).map(groupName);
  const minDelta     = {};

  groups.forEach(g => {
    const rep  = g[0];
    const name = groupName(g);
    minDelta[name] = {};
    alpha.forEach(sym => {
      const target = delta[rep][sym];
      if (target) {
        const tGroup = stateToGroup[target];
        minDelta[name][sym] = tGroup ? groupName(tGroup) : target;
      } else {
        minDelta[name][sym] = null;
      }
    });
  });

  return {
    steps,
    minimizedDFA: { states: minStates, alpha, start: minStart, accept: minAccept, delta: minDelta },
    groups,
    markedTable: marked,
    tableSnapshot: snapshotTable(states, marked)
  };
}

function getMarkedPairs(states, marked) {
  const pairs = [];
  for (let i = 0; i < states.length; i++) {
    for (let j = i + 1; j < states.length; j++) {
      if (marked[i][j]) pairs.push([states[i], states[j]]);
    }
  }
  return pairs;
}

function snapshotTable(states, marked) {
  return states.map((s, i) => states.map((t, j) => {
    if (i === j) return 'same';
    if (i > j) return marked[j][i] ? 'X' : '✓';
    return null;
  }));
}

// ── Start minimization ────────────────────────────────────────────────────────
function startMinimization() {
  dfaData = parseDFA();
  if (!dfaData) return;

  const result = minimize(dfaData);
  minimizationSteps = result.steps;
  minimizedDFA = result.minimizedDFA;
  currentStep = 0;
  currentGraphMode = 'original';

  // Show canvas, hide empty
  document.getElementById('canvas-empty').style.display = 'none';
  document.getElementById('partition-area').style.display = 'block';
  document.getElementById('result-box').style.display = 'block';

  renderStep(currentStep);
  updateStepNav();
  drawDFA(dfaData, 'Original DFA');
  buildPartitionTable(result.tableSnapshot, dfaData.states);
  renderResultBox(dfaData, minimizedDFA, result.groups);

  document.getElementById('gctrl-original').classList.add('active');
  document.getElementById('gctrl-minimized').classList.remove('active');
}

// ── Step rendering ────────────────────────────────────────────────────────────
function renderStep(idx) {
  const step = minimizationSteps[idx];
  if (!step) return;

  const content = document.getElementById('steps-content');
  let html = `<div class="step-card">
    <h4>${step.title}</h4>
    <p>${step.description}</p>`;

  if (step.partitions) {
    html += '<div class="step-partition">';
    step.partitions.forEach((group, i) => {
      html += `<span class="partition-group pg-${i % 8}">{${group.join(', ')}}</span>`;
    });
    html += '</div>';
  }

  if (step.markedPairs && step.markedPairs.length > 0) {
    html += `<div style="margin-top:0.5rem;font-size:0.78rem;color:var(--ink-soft);">
      Marked pairs: ${step.markedPairs.map(p => `{${p[0]},${p[1]}}`).join(', ')}
    </div>`;
  }

  html += '</div>';
  content.innerHTML = html;

  // Highlight graph based on partitions
  if (step.partitions && step.isFinal) {
    drawDFA(minimizedDFA, 'Minimized DFA');
    document.getElementById('graph-title').textContent = 'Minimized DFA';
    document.getElementById('gctrl-minimized').classList.add('active');
    document.getElementById('gctrl-original').classList.remove('active');
    currentGraphMode = 'minimized';
  }
}

function updateStepNav() {
  const total = minimizationSteps.length;
  document.getElementById('step-counter').textContent = `${currentStep + 1} / ${total}`;
  document.getElementById('btn-prev').disabled = currentStep === 0;
  document.getElementById('btn-next').disabled = currentStep === total - 1;
}

function prevStep() {
  if (currentStep > 0) { currentStep--; renderStep(currentStep); updateStepNav(); }
}

function nextStep() {
  if (currentStep < minimizationSteps.length - 1) { currentStep++; renderStep(currentStep); updateStepNav(); }
}

// ── Graph toggle ──────────────────────────────────────────────────────────────
function showGraph(mode) {
  if (!dfaData) return;
  currentGraphMode = mode;
  document.getElementById('gctrl-original').classList.toggle('active', mode === 'original');
  document.getElementById('gctrl-minimized').classList.toggle('active', mode === 'minimized');

  if (mode === 'original') {
    drawDFA(dfaData, 'Original DFA');
  } else if (minimizedDFA) {
    drawDFA(minimizedDFA, 'Minimized DFA');
  }
}

// ── Canvas DFA drawing ────────────────────────────────────────────────────────
function drawDFA(dfa, title) {
  const canvas = document.getElementById('dfa-canvas');
  const ctx    = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = '#FAFAF7';
  ctx.fillRect(0, 0, W, H);

  const states = dfa.states;
  const n = states.length;
  if (n === 0) return;

  // Circular layout
  const cx = W / 2, cy = H / 2;
  const R  = Math.min(W, H) * 0.36;
  const stateR = Math.min(36, R * 0.28);

  const positions = {};
  states.forEach((st, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    positions[st] = {
      x: cx + R * Math.cos(angle),
      y: cy + R * Math.sin(angle)
    };
  });

  // Draw edges first
  const edgeGroups = {};
  states.forEach(st => {
    dfa.alpha.forEach(sym => {
      const target = dfa.delta[st]?.[sym];
      if (!target || !positions[target]) return;
      const key = `${st}→${target}`;
      if (!edgeGroups[key]) edgeGroups[key] = { from: st, to: target, symbols: [] };
      edgeGroups[key].symbols.push(sym);
    });
  });

  Object.values(edgeGroups).forEach(edge => {
    drawEdge(ctx, positions[edge.from], positions[edge.to], edge.symbols.join(','), stateR, edge.from === edge.to, positions);
  });

  // Draw states
  states.forEach((st, i) => {
    const pos   = positions[st];
    const isAcc = dfa.accept.includes(st);
    const isSt  = st === dfa.start;

    // Outer ring for accept
    if (isAcc) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, stateR + 5, 0, 2 * Math.PI);
      ctx.strokeStyle = '#00827F';
      ctx.lineWidth   = 2;
      ctx.stroke();
    }

    // State circle
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, stateR, 0, 2 * Math.PI);
    ctx.fillStyle   = isAcc ? '#E0F2F1' : '#FFFFFF';
    ctx.strokeStyle = '#1A1A1A';
    ctx.lineWidth   = 1.5;
    ctx.fill();
    ctx.stroke();

    // Start arrow
    if (isSt) {
      const angle = -Math.PI / 2 + (2 * Math.PI * 0) / n;
      const ax = pos.x - Math.cos(angle) * (stateR + 22);
      const ay = pos.y - Math.sin(angle) * (stateR + 22);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(pos.x - Math.cos(angle) * stateR, pos.y - Math.sin(angle) * stateR);
      ctx.strokeStyle = '#00827F';
      ctx.lineWidth   = 2;
      ctx.stroke();
      drawArrowHead(ctx, ax, ay, pos.x - Math.cos(angle) * stateR, pos.y - Math.sin(angle) * stateR, '#00827F');
    }

    // State label
    ctx.font      = `bold ${Math.max(11, stateR * 0.55)}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#1A1A1A';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = st.length > 6 ? st.slice(0, 5) + '…' : st;
    ctx.fillText(label, pos.x, pos.y);
  });

  // Title watermark
  ctx.font      = '12px EB Garamond, serif';
  ctx.fillStyle = '#BBBBBB';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(title, W - 10, H - 8);
}

function drawEdge(ctx, from, to, label, r, isSelf, positions) {
  ctx.save();
  const col = '#444444';

  if (isSelf) {
    // Self-loop
    const lx = from.x, ly = from.y - r - 18;
    ctx.beginPath();
    ctx.arc(lx, ly, 14, 0, 2 * Math.PI);
    ctx.strokeStyle = col;
    ctx.lineWidth   = 1.2;
    ctx.stroke();

    // Arrow at bottom of loop
    drawArrowHead(ctx, lx - 6, ly + 13, lx + 4, ly + 14, col);

    ctx.font      = '10px JetBrains Mono, monospace';
    ctx.fillStyle = '#00827F';
    ctx.textAlign = 'center';
    ctx.fillText(label, lx, ly - 16);
    ctx.restore();
    return;
  }

  const dx   = to.x - from.x;
  const dy   = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.1) { ctx.restore(); return; }

  const nx = dx / dist, ny = dy / dist;

  // Check reverse edge for curve offset
  const revKey = `${to}→${from}`;
  const hasBoth = false; // simplification

  const curve = 25;
  const midX  = (from.x + to.x) / 2 - ny * curve;
  const midY  = (from.y + to.y) / 2 + nx * curve;

  const startX = from.x + nx * r;
  const startY = from.y + ny * r;

  // Compute arrow tip on circle boundary
  const ex = to.x - nx * (r + 2);
  const ey = to.y - ny * (r + 2);

  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.quadraticCurveTo(midX, midY, ex, ey);
  ctx.strokeStyle = col;
  ctx.lineWidth   = 1.2;
  ctx.stroke();

  drawArrowHead(ctx, midX, midY, ex, ey, col);

  // Edge label at midpoint
  const lx = (startX + ex) / 2 - ny * (curve * 0.6);
  const ly = (startY + ey) / 2 + nx * (curve * 0.6);

  ctx.font      = '10px JetBrains Mono, monospace';
  ctx.fillStyle = '#00827F';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, lx, ly);

  ctx.restore();
}

function drawArrowHead(ctx, fx, fy, tx, ty, color) {
  const angle = Math.atan2(ty - fy, tx - fx);
  const size  = 7;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx - size * Math.cos(angle - 0.4), ty - size * Math.sin(angle - 0.4));
  ctx.lineTo(tx - size * Math.cos(angle + 0.4), ty - size * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ── Partition table ───────────────────────────────────────────────────────────
function buildPartitionTable(snapshot, states) {
  const container = document.getElementById('partition-table-container');
  if (!snapshot || !states) { container.innerHTML = ''; return; }

  let html = '<table class="ptable"><thead><tr><th></th>';
  // Only show lower triangle → column headers = states[0..n-2]
  for (let j = 0; j < states.length - 1; j++) {
    html += `<th>${states[j]}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (let i = 1; i < states.length; i++) {
    html += `<tr><th style="background:var(--ink);color:#fff;padding:0.4rem 0.8rem">${states[i]}</th>`;
    for (let j = 0; j < states.length - 1; j++) {
      if (j >= i) {
        html += '<td></td>';
      } else {
        const val = snapshot[i][j];
        const cls = val === 'X' ? 'cell-marked' : val === '✓' ? 'cell-unmarked' : 'cell-same';
        html += `<td class="${cls}">${val === 'same' ? '' : val}</td>`;
      }
    }
    html += '</tr>';
  }

  html += '</tbody></table>';
  html += '<p style="font-size:0.78rem;color:var(--ink-faint);margin-top:0.5rem;font-family:var(--font-mono)">✓ = indistinguishable (merge)&nbsp;&nbsp;&nbsp;X = distinguishable (keep separate)</p>';
  container.innerHTML = html;
}

// ── Result box ────────────────────────────────────────────────────────────────
function renderResultBox(orig, min, groups) {
  const box = document.getElementById('result-content');
  const merged = groups.filter(g => g.length > 1);

  let html = `<div class="result-row">
    <div class="result-stat">Original states: <strong>${orig.states.length}</strong></div>
    <div class="result-stat">Minimized states: <strong>${min.states.length}</strong></div>
    <div class="result-stat">States removed: <strong>${orig.states.length - min.states.length}</strong></div>
  </div>`;

  if (merged.length > 0) {
    html += '<p style="font-size:0.85rem;margin-top:0.5rem;color:var(--ink-soft)">Merged groups:</p>';
    html += '<div class="merged-classes">';
    merged.forEach((g, i) => {
      html += `<span class="merged-tag">{${g.join(', ')}}</span>`;
    });
    html += '</div>';
  } else {
    html += '<p style="font-size:0.85rem;margin-top:0.5rem;color:var(--topaz-dark);font-style:italic">✓ The DFA is already minimal — no states can be merged.</p>';
  }

  html += `<p style="font-size:0.82rem;margin-top:0.8rem;color:var(--ink-soft)">
    Minimized accept states: <span style="font-family:var(--font-mono);color:var(--topaz)">${min.accept.join(', ') || '∅'}</span><br/>
    Minimized start state: <span style="font-family:var(--font-mono);color:var(--topaz)">${min.start}</span>
  </p>`;

  box.innerHTML = html;
}

// ── Reset ─────────────────────────────────────────────────────────────────────
function resetAll() {
  dfaData = null;
  minimizationSteps = [];
  currentStep = -1;
  minimizedDFA = null;

  document.getElementById('canvas-empty').style.display = '';
  document.getElementById('partition-area').style.display = 'none';
  document.getElementById('result-box').style.display = 'none';
  document.getElementById('steps-content').innerHTML = '<div class="step-empty">Run the minimization to see step-by-step partitions.</div>';
  document.getElementById('step-counter').textContent = '—';
  document.getElementById('btn-prev').disabled = true;
  document.getElementById('btn-next').disabled = true;
  document.getElementById('gctrl-original').classList.remove('active');
  document.getElementById('gctrl-minimized').classList.remove('active');
  document.getElementById('graph-title').textContent = 'Original DFA';

  const canvas = document.getElementById('dfa-canvas');
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  buildTransitionTable();

  // Rebuild table when states/alphabet change
  ['input-states', 'input-alphabet', 'input-accept'].forEach(id => {
    document.getElementById(id).addEventListener('blur', buildTransitionTable);
  });

  // Resize canvas properly
  function resizeCanvas() {
    const canvas = document.getElementById('dfa-canvas');
    const parent = canvas.parentElement;
    const w = parent.clientWidth;
    canvas.width  = w;
    canvas.height = Math.min(420, w * 0.6);
    if (dfaData) {
      if (currentGraphMode === 'minimized' && minimizedDFA) drawDFA(minimizedDFA, 'Minimized DFA');
      else drawDFA(dfaData, 'Original DFA');
    }
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
});
