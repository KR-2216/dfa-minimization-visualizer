/* ═══════════════════════════════════════════════════════
   DFA MINIMIZATION — Core Logic & Visualization
   ═══════════════════════════════════════════════════════ */

'use strict';

// ── Global state ──────────────────────────────────────────────────────────────
let dfaData           = null;
let minimizationSteps = [];
let currentStep       = -1;
let currentGraphMode  = 'original';
let minimizedDFA      = null;
let mergeGroups       = null;
let animationId       = null;
let animating         = false;

// ── Examples ──────────────────────────────────────────────────────────────────
const EXAMPLES = [
  {
    states: 'q0,q1,q2,q3,q4', alphabet: 'a,b', start: 'q0', accept: 'q3,q4',
    transitions: {
      q0: { a:'q1', b:'q2' }, q1: { a:'q1', b:'q3' }, q2: { a:'q2', b:'q4' },
      q3: { a:'q1', b:'q3' }, q4: { a:'q2', b:'q4' }
    }
  },
  {
    states: 'A,B,C,D,E,F', alphabet: '0,1', start: 'A', accept: 'C,D,F',
    transitions: {
      A: {'0':'B','1':'C'}, B: {'0':'B','1':'D'}, C: {'0':'B','1':'C'},
      D: {'0':'B','1':'C'}, E: {'0':'B','1':'F'}, F: {'0':'B','1':'C'}
    }
  },
  {
    states: 'q0,q1,q2', alphabet: 'a,b', start: 'q0', accept: 'q2',
    transitions: {
      q0: { a:'q0', b:'q1' }, q1: { a:'q2', b:'q0' }, q2: { a:'q2', b:'q2' }
    }
  }
];

// Group colours for animation
const GROUP_COLORS = [
  { fill:'#E8F5E9', stroke:'#4CAF50' }, { fill:'#E3F2FD', stroke:'#2196F3' },
  { fill:'#FFF3E0', stroke:'#FF9800' }, { fill:'#F3E5F5', stroke:'#9C27B0' },
  { fill:'#FCE4EC', stroke:'#E91E63' }, { fill:'#E0F7FA', stroke:'#00BCD4' },
];

// ── Sidebar ───────────────────────────────────────────────────────────────────
function toggleSidebar() {
  const panel  = document.getElementById('input-panel');
  const page   = document.getElementById('page-visualizer');
  const isOpen = !panel.classList.contains('collapsed');
  panel.classList.toggle('collapsed', isOpen);
  page.classList.toggle('sidebar-collapsed', isOpen);
  document.getElementById('sidebar-toggle').title = isOpen ? 'Expand panel' : 'Collapse panel';
  setTimeout(resizeAndRedraw, 310);
}

// ── Page switch ───────────────────────────────────────────────────────────────
function switchPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.getElementById('btn-' + page).classList.add('active');
}

// ── Load example ──────────────────────────────────────────────────────────────
function loadExample(idx) {
  const ex = EXAMPLES[idx]; if (!ex) return;
  document.getElementById('input-states').value  = ex.states;
  document.getElementById('input-alphabet').value = ex.alphabet;
  document.getElementById('input-start').value   = ex.start;
  document.getElementById('input-accept').value  = ex.accept;
  buildTransitionTable();
  ex.states.split(',').map(s=>s.trim()).forEach(st => {
    ex.alphabet.split(',').map(a=>a.trim()).forEach(sym => {
      const cell = document.getElementById(`trans-${st}-${sym}`);
      if (cell && ex.transitions[st]) cell.value = ex.transitions[st][sym] || '';
    });
  });
}

// ── Build transition table ────────────────────────────────────────────────────
function buildTransitionTable() {
  const states = document.getElementById('input-states').value.split(',').map(s=>s.trim()).filter(Boolean);
  const alpha  = document.getElementById('input-alphabet').value.split(',').map(a=>a.trim()).filter(Boolean);
  const accept = document.getElementById('input-accept').value.split(',').map(s=>s.trim()).filter(Boolean);
  if (!states.length || !alpha.length) return;

  let html = '<table class="trans-table"><thead><tr><th>δ</th>';
  alpha.forEach(sym => { html += `<th>${sym}</th>`; });
  html += '</tr></thead><tbody>';
  states.forEach(st => {
    const isAcc = accept.includes(st);
    html += `<tr><td class="row-label ${isAcc?'is-accept':''}">${isAcc?'★ ':''}${st}</td>`;
    alpha.forEach(sym => {
      html += `<td><input type="text" id="trans-${st}-${sym}" placeholder="—" maxlength="10"/></td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  document.getElementById('transition-table-wrapper').innerHTML = html;
}

// ── Parse DFA ─────────────────────────────────────────────────────────────────
function parseDFA() {
  const states = document.getElementById('input-states').value.split(',').map(s=>s.trim()).filter(Boolean);
  const alpha  = document.getElementById('input-alphabet').value.split(',').map(a=>a.trim()).filter(Boolean);
  const start  = document.getElementById('input-start').value.trim();
  const accept = document.getElementById('input-accept').value.split(',').map(s=>s.trim()).filter(Boolean);

  if (!states.length || !alpha.length || !start) { alert('Fill in states, alphabet and start state.'); return null; }
  if (!states.includes(start)) { alert(`Start state "${start}" not in states.`); return null; }

  const delta = {};
  for (const st of states) {
    delta[st] = {};
    for (const sym of alpha) {
      const val = (document.getElementById(`trans-${st}-${sym}`)?.value || '').trim();
      if (val && !states.includes(val)) { alert(`δ(${st},${sym})="${val}" is not a valid state.`); return null; }
      delta[st][sym] = val || null;
    }
  }
  return { states, alpha, start, accept, delta };
}

// ── Table-filling algorithm ───────────────────────────────────────────────────
function minimize(dfa) {
  const { states, alpha, accept, delta } = dfa;
  const steps = [], n = states.length;

  steps.push({
    title: 'Step 0 — Initial Partition',
    description: 'Separate accept states (F) from non-accept states (Q \\ F).',
    partitions: [accept.filter(s=>states.includes(s)), states.filter(s=>!accept.includes(s))].filter(g=>g.length>0).map(g=>[...g])
  });

  const marked = Array.from({length:n}, ()=>Array(n).fill(false));
  for (let i=0;i<n;i++) for (let j=i+1;j<n;j++)
    if (accept.includes(states[i]) !== accept.includes(states[j]))
      marked[i][j]=marked[j][i]=true;

  steps.push({
    title:'Step 1 — Mark Base Pairs',
    description:'Mark pairs where one is accept and other is not (ε witnesses this).',
    markedPairs: getMarkedPairs(states,marked),
    tableSnapshot: snapshotTable(states,marked)
  });

  let changed=true, iter=0;
  while (changed) {
    changed=false; iter++;
    const newly=[];
    for (let i=0;i<n;i++) for (let j=i+1;j<n;j++) {
      if (marked[i][j]) continue;
      for (const sym of alpha) {
        const di=delta[states[i]][sym], dj=delta[states[j]][sym];
        if (!di||!dj) continue;
        const ii=states.indexOf(di), ij=states.indexOf(dj);
        if (ii!==-1&&ij!==-1&&ii!==ij&&marked[ii][ij]) {
          marked[i][j]=marked[j][i]=true; changed=true;
          newly.push(`{${states[i]},${states[j]}} via '${sym}'`); break;
        }
      }
    }
    if (newly.length||iter===1) steps.push({
      title:`Step ${iter+1} — Refinement Iteration ${iter}`,
      description: newly.length
        ? `Marked ${newly.length} pair(s): ${newly.slice(0,5).join(', ')}${newly.length>5?' …':''}`
        : 'No new pairs marked — algorithm converges.',
      markedPairs: getMarkedPairs(states,marked),
      tableSnapshot: snapshotTable(states,marked)
    });
  }

  const visited=new Set(), groups=[];
  for (let i=0;i<n;i++) {
    if (visited.has(i)) continue;
    const g=[states[i]]; visited.add(i);
    for (let j=i+1;j<n;j++) if (!marked[i][j]) { g.push(states[j]); visited.add(j); }
    groups.push(g);
  }

  steps.push({
    title:`Step ${iter+2} — Merge Equivalent States`,
    description:`Found ${groups.filter(g=>g.length>1).length} mergeable group(s). Constructing minimized DFA.`,
    partitions: groups.map(g=>[...g]),
    isFinal: true
  });

  const gname = g=>g.join(',');
  const s2g   = {};
  states.forEach(st=>{ s2g[st]=groups.find(g=>g.includes(st)); });

  const minStates = groups.map(gname);
  const minStart  = gname(s2g[dfa.start]);
  const minAccept = groups.filter(g=>g.some(s=>accept.includes(s))).map(gname);
  const minDelta  = {};
  groups.forEach(g => {
    const rep=g[0], nm=gname(g); minDelta[nm]={};
    alpha.forEach(sym => {
      const tgt=delta[rep][sym];
      minDelta[nm][sym]=tgt?(s2g[tgt]?gname(s2g[tgt]):tgt):null;
    });
  });

  return {
    steps,
    minimizedDFA:{ states:minStates, alpha, start:minStart, accept:minAccept, delta:minDelta },
    groups,
    tableSnapshot: snapshotTable(states,marked)
  };
}

function getMarkedPairs(states,marked) {
  const p=[];
  for (let i=0;i<states.length;i++) for (let j=i+1;j<states.length;j++)
    if (marked[i][j]) p.push([states[i],states[j]]);
  return p;
}

function snapshotTable(states,marked) {
  return states.map((s,i)=>states.map((t,j)=>{
    if (i===j) return 'same';
    if (i>j) return marked[j][i]?'X':'✓';
    return null;
  }));
}

// ── Start minimization ────────────────────────────────────────────────────────
function startMinimization() {
  dfaData = parseDFA(); if (!dfaData) return;
  const result = minimize(dfaData);
  minimizationSteps = result.steps;
  minimizedDFA      = result.minimizedDFA;
  mergeGroups       = result.groups;
  currentStep       = 0;
  currentGraphMode  = 'original';

  document.getElementById('canvas-empty').style.display   = 'none';
  document.getElementById('partition-area').style.display = 'block';
  document.getElementById('result-box').style.display     = 'block';

  renderStep(0);
  updateStepNav();
  drawDFA(dfaData, 'Original DFA');
  document.getElementById('graph-title').textContent = 'Original DFA';
  document.getElementById('gctrl-original').classList.add('active');
  document.getElementById('gctrl-minimized').classList.remove('active');
  buildPartitionTable(result.tableSnapshot, dfaData.states);
  renderResultBox(dfaData, minimizedDFA, result.groups);
}

// ── Steps ─────────────────────────────────────────────────────────────────────
function renderStep(idx) {
  const step = minimizationSteps[idx]; if (!step) return;
  let html = `<div class="step-card"><h4>${step.title}</h4><p>${step.description}</p>`;

  if (step.partitions) {
    html += '<div class="step-partition">';
    step.partitions.forEach((g,i)=>{ html+=`<span class="partition-group pg-${i%8}">{${g.join(', ')}}</span>`; });
    html += '</div>';
  }
  if (step.markedPairs?.length) {
    html += `<div style="margin-top:0.5rem;font-size:0.78rem;color:var(--ink-soft);">
      Marked: ${step.markedPairs.map(p=>`{${p[0]},${p[1]}}`).join(', ')}</div>`;
  }
  html += '</div>';
  document.getElementById('steps-content').innerHTML = html;

  // Auto-switch graph view based on step
  if (step.isFinal) {
    // Final step: play merge animation → ends on minimized
    triggerMergeAnimation();
  } else {
    // Any non-final step: snap back to original (cancel animation if running)
    if (animating) cancelAnim();
    if (currentGraphMode !== 'original') {
      currentGraphMode = 'original';
      document.getElementById('gctrl-original').classList.add('active');
      document.getElementById('gctrl-minimized').classList.remove('active');
      document.getElementById('graph-title').textContent = 'Original DFA';
      drawDFA(dfaData, 'Original DFA');
    }
  }
}

function updateStepNav() {
  const total = minimizationSteps.length;
  document.getElementById('step-counter').textContent = `${currentStep+1} / ${total}`;
  document.getElementById('btn-prev').disabled = currentStep === 0;
  document.getElementById('btn-next').disabled = currentStep === total-1;
}

function prevStep() {
  if (currentStep > 0) { currentStep--; renderStep(currentStep); updateStepNav(); }
}
function nextStep() {
  if (currentStep < minimizationSteps.length-1) { currentStep++; renderStep(currentStep); updateStepNav(); }
}

// ── Manual graph toggle ───────────────────────────────────────────────────────
function showGraph(mode) {
  if (!dfaData) return;
  if (mode==='minimized' && !minimizedDFA) return;
  if (animating) cancelAnim();
  currentGraphMode = mode;
  document.getElementById('gctrl-original').classList.toggle('active', mode==='original');
  document.getElementById('gctrl-minimized').classList.toggle('active', mode==='minimized');
  if (mode==='original') {
    document.getElementById('graph-title').textContent = 'Original DFA';
    drawDFA(dfaData, 'Original DFA');
  } else {
    document.getElementById('graph-title').textContent = 'Minimized DFA';
    drawDFA(minimizedDFA, 'Minimized DFA');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── MERGE ANIMATION ───────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function cancelAnim() {
  if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
  animating = false;
}

function ease(t) { return t<0.5 ? 2*t*t : -1+(4-2*t)*t; }

function lerpColor(c1, c2, t) {
  const h=s=>parseInt(s,16);
  const [r1,g1,b1]=[h(c1.slice(1,3)),h(c1.slice(3,5)),h(c1.slice(5,7))];
  const [r2,g2,b2]=[h(c2.slice(1,3)),h(c2.slice(3,5)),h(c2.slice(5,7))];
  return `rgb(${Math.round(r1+(r2-r1)*t)},${Math.round(g1+(g2-g1)*t)},${Math.round(b1+(b2-b1)*t)})`;
}

function circlePositions(stateNames, W, H) {
  const n=stateNames.length, cx=W/2, cy=H/2, R=Math.min(W,H)*0.36, pos={};
  stateNames.forEach((st,i)=>{
    const a = -Math.PI/2 + (2*Math.PI*i)/n;
    pos[st] = { x: cx+R*Math.cos(a), y: cy+R*Math.sin(a) };
  });
  return pos;
}

function triggerMergeAnimation() {
  if (!dfaData||!minimizedDFA||!mergeGroups) return;
  cancelAnim();

  const canvas = document.getElementById('dfa-canvas');
  const ctx    = canvas.getContext('2d');
  const W=canvas.width, H=canvas.height;
  const stateR = Math.min(36, Math.min(W,H)*0.36*0.28);

  const origPos = circlePositions(dfaData.states, W, H);
  const gname   = g=>g.join(',');
  const minPos  = circlePositions(mergeGroups.map(gname), W, H);

  const s2g={};
  dfaData.states.forEach(st=>{ s2g[st]=mergeGroups.find(g=>g.includes(st)); });

  const gcol={};
  mergeGroups.forEach((g,i)=>{ gcol[gname(g)]=GROUP_COLORS[i%GROUP_COLORS.length]; });

  // ── PHASE PLAN ─────────────────────────────────────────────────────────────
  // 0.0 – 0.35 : highlight groups (glow, colour fill)
  // 0.35 – 0.75: states slide to merged positions, non-reps fade out
  // 0.75 – 1.0 : minimized edges fade in
  const DURATION = 1400;
  let startTime = null;
  animating = true;

  document.getElementById('graph-title').textContent = 'Minimizing…';
  document.getElementById('gctrl-original').classList.remove('active');
  document.getElementById('gctrl-minimized').classList.remove('active');

  function frame(ts) {
    if (!startTime) startTime = ts;
    const raw = Math.min((ts-startTime)/DURATION, 1);

    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#FAFAF7'; ctx.fillRect(0,0,W,H);

    // Timing sub-phases
    const glowT  = raw<0.35  ? ease(raw/0.35)        : 1;
    const slideT = raw<0.35  ? 0 : raw<0.75 ? ease((raw-0.35)/0.4) : 1;
    const edgeT  = raw<0.75  ? 0 : ease((raw-0.75)/0.25);
    const origEdgeAlpha = raw<0.35 ? 1 : raw<0.55 ? 1-ease((raw-0.35)/0.2) : 0;

    // Original edges fading out
    if (origEdgeAlpha > 0.01) {
      ctx.globalAlpha = origEdgeAlpha;
      drawDFAEdges(ctx, dfaData, origPos, stateR);
      ctx.globalAlpha = 1;
    }

    // Draw each original state, animated
    dfaData.states.forEach(st => {
      const g    = s2g[st];
      const gn   = gname(g);
      const gc   = gcol[gn];
      const src  = origPos[st];
      const tgt  = minPos[gn];
      const isRep= g[0]===st;
      const isMerged = g.length>1;

      // Current position (lerp)
      const px = src.x+(tgt.x-src.x)*slideT;
      const py = src.y+(tgt.y-src.y)*slideT;

      const isAcc = dfaData.accept.includes(st);

      // Non-rep fades out during slide
      const nodeAlpha = (!isRep && isMerged)
        ? Math.max(0, 1 - ease(Math.max(0,slideT-0.2)/0.8))
        : 1;

      ctx.globalAlpha = nodeAlpha;

      // Glow halo for merged groups
      if (isMerged && glowT > 0) {
        ctx.save();
        ctx.globalAlpha = nodeAlpha * glowT * 0.3;
        ctx.beginPath(); ctx.arc(px,py,stateR+16,0,2*Math.PI);
        ctx.fillStyle=gc.stroke; ctx.fill();
        ctx.restore();
        ctx.globalAlpha = nodeAlpha;
      }

      // Accept ring
      if (isAcc) {
        ctx.beginPath(); ctx.arc(px,py,stateR+5,0,2*Math.PI);
        ctx.strokeStyle='#00827F'; ctx.lineWidth=2; ctx.stroke();
      }

      // State circle
      const baseFill = isAcc?'#E0F2F1':'#FFFFFF';
      const circleFill = isMerged ? lerpColor(baseFill, gc.fill, glowT) : baseFill;
      ctx.beginPath(); ctx.arc(px,py,stateR,0,2*Math.PI);
      ctx.fillStyle   = circleFill;
      ctx.strokeStyle = isMerged ? gc.stroke : '#1A1A1A';
      ctx.lineWidth   = isMerged ? 2.5 : 1.5;
      ctx.fill(); ctx.stroke();

      // Label
      ctx.font=`bold ${Math.max(11,stateR*0.55)}px 'JetBrains Mono',monospace`;
      ctx.fillStyle='#1A1A1A'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(st.length>6?st.slice(0,5)+'…':st, px, py);

      ctx.globalAlpha = 1;
    });

    // "≡ merge" labels in glow phase
    if (glowT>0.2 && slideT<0.5) {
      mergeGroups.filter(g=>g.length>1).forEach(g => {
        const gn=gname(g), gc=gcol[gn];
        const cx2=g.reduce((s,st)=>s+origPos[st].x,0)/g.length;
        const cy2=g.reduce((s,st)=>s+origPos[st].y,0)/g.length;
        ctx.globalAlpha = glowT*(1-slideT*2);
        ctx.font='bold 11px JetBrains Mono,monospace';
        ctx.fillStyle=gc.stroke; ctx.textAlign='center';
        ctx.fillText('≡ merge', cx2, cy2+stateR+24);
        ctx.globalAlpha=1;
      });
    }

    // Minimized edges fading in
    if (edgeT>0.01) {
      ctx.globalAlpha=edgeT;
      drawDFAEdges(ctx, minimizedDFA, minPos, stateR);
      ctx.globalAlpha=1;
    }

    // Watermark
    ctx.font='12px EB Garamond,serif'; ctx.fillStyle='#BBBBBB';
    ctx.textAlign='right'; ctx.textBaseline='bottom';
    ctx.fillText(raw<1?'Minimizing…':'Minimized DFA', W-10, H-8);

    if (raw < 1) {
      animationId = requestAnimationFrame(frame);
    } else {
      // Animation done
      animating=false; animationId=null;
      currentGraphMode='minimized';
      document.getElementById('gctrl-minimized').classList.add('active');
      document.getElementById('gctrl-original').classList.remove('active');
      document.getElementById('graph-title').textContent='Minimized DFA';
      drawDFA(minimizedDFA,'Minimized DFA');
    }
  }

  animationId = requestAnimationFrame(frame);
}

// Helper: draw only edges of a DFA into given positions
function drawDFAEdges(ctx, dfa, pos, stateR) {
  const groups={};
  dfa.states.forEach(st=>{
    dfa.alpha.forEach(sym=>{
      const tgt=dfa.delta[st]?.[sym];
      if (!tgt||!pos[tgt]) return;
      const key=`${st}→${tgt}`;
      if (!groups[key]) groups[key]={from:st,to:tgt,symbols:[]};
      groups[key].symbols.push(sym);
    });
  });
  Object.values(groups).forEach(e=>{
    drawEdge(ctx,pos[e.from],pos[e.to],e.symbols.join(','),stateR,e.from===e.to);
  });
}

// ── Static DFA draw ───────────────────────────────────────────────────────────
function drawDFA(dfa, title) {
  const canvas=document.getElementById('dfa-canvas');
  const ctx=canvas.getContext('2d');
  const W=canvas.width, H=canvas.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#FAFAF7'; ctx.fillRect(0,0,W,H);

  const states=dfa.states, n=states.length; if (!n) return;
  const stateR=Math.min(36,Math.min(W,H)*0.36*0.28);
  const pos=circlePositions(states,W,H);

  drawDFAEdges(ctx,dfa,pos,stateR);

  states.forEach((st,i)=>{
    const p=pos[st], isAcc=dfa.accept.includes(st), isSt=st===dfa.start;
    if (isAcc) {
      ctx.beginPath(); ctx.arc(p.x,p.y,stateR+5,0,2*Math.PI);
      ctx.strokeStyle='#00827F'; ctx.lineWidth=2; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(p.x,p.y,stateR,0,2*Math.PI);
    ctx.fillStyle=isAcc?'#E0F2F1':'#FFFFFF';
    ctx.strokeStyle='#1A1A1A'; ctx.lineWidth=1.5; ctx.fill(); ctx.stroke();

    if (isSt) {
      const ang=-Math.PI/2+(2*Math.PI*0)/n;
      const ax=p.x-Math.cos(ang)*(stateR+22), ay=p.y-Math.sin(ang)*(stateR+22);
      ctx.beginPath(); ctx.moveTo(ax,ay);
      ctx.lineTo(p.x-Math.cos(ang)*stateR, p.y-Math.sin(ang)*stateR);
      ctx.strokeStyle='#00827F'; ctx.lineWidth=2; ctx.stroke();
      drawArrowHead(ctx,ax,ay,p.x-Math.cos(ang)*stateR,p.y-Math.sin(ang)*stateR,'#00827F');
    }
    ctx.font=`bold ${Math.max(11,stateR*0.55)}px 'JetBrains Mono',monospace`;
    ctx.fillStyle='#1A1A1A'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(st.length>6?st.slice(0,5)+'…':st, p.x, p.y);
  });

  ctx.font='12px EB Garamond,serif'; ctx.fillStyle='#BBBBBB';
  ctx.textAlign='right'; ctx.textBaseline='bottom'; ctx.fillText(title,W-10,H-8);
}

function drawEdge(ctx,from,to,label,r,isSelf) {
  ctx.save(); const col='#444444';
  if (isSelf) {
    const lx=from.x, ly=from.y-r-18;
    ctx.beginPath(); ctx.arc(lx,ly,14,0,2*Math.PI);
    ctx.strokeStyle=col; ctx.lineWidth=1.2; ctx.stroke();
    drawArrowHead(ctx,lx-6,ly+13,lx+4,ly+14,col);
    ctx.font='10px JetBrains Mono,monospace'; ctx.fillStyle='#00827F'; ctx.textAlign='center';
    ctx.fillText(label,lx,ly-16); ctx.restore(); return;
  }
  const dx=to.x-from.x, dy=to.y-from.y, dist=Math.sqrt(dx*dx+dy*dy);
  if (dist<0.1){ctx.restore();return;}
  const nx=dx/dist, ny=dy/dist, curve=25;
  const midX=(from.x+to.x)/2-ny*curve, midY=(from.y+to.y)/2+nx*curve;
  const sx=from.x+nx*r, sy=from.y+ny*r;
  const ex=to.x-nx*(r+2), ey=to.y-ny*(r+2);
  ctx.beginPath(); ctx.moveTo(sx,sy); ctx.quadraticCurveTo(midX,midY,ex,ey);
  ctx.strokeStyle=col; ctx.lineWidth=1.2; ctx.stroke();
  drawArrowHead(ctx,midX,midY,ex,ey,col);
  const lx=(sx+ex)/2-ny*curve*0.6, ly=(sy+ey)/2+nx*curve*0.6;
  ctx.font='10px JetBrains Mono,monospace'; ctx.fillStyle='#00827F';
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(label,lx,ly);
  ctx.restore();
}

function drawArrowHead(ctx,fx,fy,tx,ty,color) {
  const a=Math.atan2(ty-fy,tx-fx),s=7;
  ctx.save(); ctx.fillStyle=color; ctx.beginPath(); ctx.moveTo(tx,ty);
  ctx.lineTo(tx-s*Math.cos(a-0.4),ty-s*Math.sin(a-0.4));
  ctx.lineTo(tx-s*Math.cos(a+0.4),ty-s*Math.sin(a+0.4));
  ctx.closePath(); ctx.fill(); ctx.restore();
}

// ── Partition table ───────────────────────────────────────────────────────────
function buildPartitionTable(snapshot,states) {
  const c=document.getElementById('partition-table-container');
  if (!snapshot||!states){c.innerHTML='';return;}
  let html='<table class="ptable"><thead><tr><th></th>';
  for (let j=0;j<states.length-1;j++) html+=`<th>${states[j]}</th>`;
  html+='</tr></thead><tbody>';
  for (let i=1;i<states.length;i++) {
    html+=`<tr><th style="background:var(--ink);color:#fff;padding:0.4rem 0.8rem">${states[i]}</th>`;
    for (let j=0;j<states.length-1;j++) {
      if (j>=i){html+='<td></td>';continue;}
      const v=snapshot[i][j];
      html+=`<td class="${v==='X'?'cell-marked':v==='✓'?'cell-unmarked':'cell-same'}">${v==='same'?'':v}</td>`;
    }
    html+='</tr>';
  }
  html+='</tbody></table><p style="font-size:0.78rem;color:var(--ink-faint);margin-top:0.5rem;font-family:var(--font-mono)">✓ = indistinguishable (merge) &nbsp; X = distinguishable</p>';
  c.innerHTML=html;
}

// ── Result box ────────────────────────────────────────────────────────────────
function renderResultBox(orig,min,groups) {
  const merged=groups.filter(g=>g.length>1);
  let html=`<div class="result-row">
    <div class="result-stat">Original states: <strong>${orig.states.length}</strong></div>
    <div class="result-stat">Minimized states: <strong>${min.states.length}</strong></div>
    <div class="result-stat">States removed: <strong>${orig.states.length-min.states.length}</strong></div>
  </div>`;
  if (merged.length) {
    html+='<p style="font-size:0.85rem;margin-top:0.5rem;color:var(--ink-soft)">Merged groups:</p><div class="merged-classes">';
    merged.forEach(g=>{html+=`<span class="merged-tag">{${g.join(', ')}}</span>`;});
    html+='</div>';
  } else {
    html+='<p style="font-size:0.85rem;margin-top:0.5rem;color:var(--topaz-dark);font-style:italic">✓ The DFA is already minimal — no states can be merged.</p>';
  }
  html+=`<p style="font-size:0.82rem;margin-top:0.8rem;color:var(--ink-soft)">
    Minimized accept: <span style="font-family:var(--font-mono);color:var(--topaz)">${min.accept.join(', ')||'∅'}</span><br/>
    Start state: <span style="font-family:var(--font-mono);color:var(--topaz)">${min.start}</span></p>`;
  document.getElementById('result-content').innerHTML=html;
}

// ── Reset ─────────────────────────────────────────────────────────────────────
function resetAll() {
  cancelAnim();
  dfaData=null; minimizationSteps=[]; currentStep=-1;
  minimizedDFA=null; mergeGroups=null; currentGraphMode='original';
  document.getElementById('canvas-empty').style.display='';
  document.getElementById('partition-area').style.display='none';
  document.getElementById('result-box').style.display='none';
  document.getElementById('steps-content').innerHTML='<div class="step-empty">Run the minimization to see step-by-step partitions.</div>';
  document.getElementById('step-counter').textContent='—';
  document.getElementById('btn-prev').disabled=true;
  document.getElementById('btn-next').disabled=true;
  document.getElementById('gctrl-original').classList.remove('active');
  document.getElementById('gctrl-minimized').classList.remove('active');
  document.getElementById('graph-title').textContent='Original DFA';
  const cv=document.getElementById('dfa-canvas');
  cv.getContext('2d').clearRect(0,0,cv.width,cv.height);
}

// ── Resize & redraw ───────────────────────────────────────────────────────────
function resizeAndRedraw() {
  const canvas=document.getElementById('dfa-canvas');
  const w=canvas.parentElement.clientWidth;
  canvas.width=w; canvas.height=Math.min(420,w*0.6);
  if (animating) return;
  if (dfaData) {
    if (currentGraphMode==='minimized'&&minimizedDFA) drawDFA(minimizedDFA,'Minimized DFA');
    else drawDFA(dfaData,'Original DFA');
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', ()=>{
  buildTransitionTable();
  ['input-states','input-alphabet','input-accept'].forEach(id=>{
    document.getElementById(id).addEventListener('blur', buildTransitionTable);
  });
  window.addEventListener('resize', resizeAndRedraw);
  resizeAndRedraw();
});
