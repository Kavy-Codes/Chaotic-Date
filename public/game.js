// ════════════════════════════════════════════════════════════════
//  💕 CHAOS DATE  —  Game Engine  v2.0
//  All systems: world · characters · pet · 5 mini-games · fx
// ════════════════════════════════════════════════════════════════
'use strict';

// ── Canvas dimensions ─────────────────────────────────────────
const CW = 800, CH = 600;

// ── State machine ─────────────────────────────────────────────
// States: menu | gender | waiting | world | countdown | minigame | results
let appState = 'menu';

// ── Player data ───────────────────────────────────────────────
let myId = '', myName = '', myGender = 'girl', myColor = '#FF85A1', myIdx = 0;
let roomCode = '', isCreator = false, pendingAction = null; // 'create' | 'join'

// ── Players ───────────────────────────────────────────────────
let me = null, partner = null;

// ── Pet ───────────────────────────────────────────────────────
let pet = null;

// ── World data ────────────────────────────────────────────────
let notes = [];
let loveMeter = 0;

// ── Input ─────────────────────────────────────────────────────
const keys  = {};
const touch = { active:false, id:null, bx:0, by:0, dx:0, dy:0 };

// ── Rendering ─────────────────────────────────────────────────
let gc, gctx;       // world canvas
let mgc, mgctx;     // mini-game canvas
let drawOff, drawOffCtx;  // persistent draw surface
let frame = 0;
let scale = 1;
let canvasLeft = 0, canvasTop = 0;

// ── Timing ────────────────────────────────────────────────────
let lastSend = 0;
const SEND_HZ = 50;  // ms
let mgTimerVal = 60;
let mgTimerInterval = null;

// ── FX pools ──────────────────────────────────────────────────
let particles  = [];
let confetti   = [];
let reactions  = [];
let chatBubs   = [];
let floatTexts = [];

// ── Mini-game state ───────────────────────────────────────────
const MG = {
  active:   false,
  type:     '',
  // Heart collector
  hearts:   [],
  myScore:  0, partScore: 0,
  // Push arena
  pushMe:   null, pushOther: null,
  pushCX: 400, pushCY: 320, pushR: 230,
  myFell: false,
  // Draw & guess
  isDrawer: false, drawWord: '', drawHint: '',
  drawing: false, drawColor: '#222222', drawSz: 5, drawPath: [],
  strokes: [], guesses: [], drawDone: false,
  // Quiz
  quizQ: '', quizOpts: [], quizChosen: -1, quizReveal: null, quizQI: 0, quizTotal: 0,
  // Memory
  memCards: [], memFlipped: [], memMyTurn: false, memMatched: [],
  // Results
  resultScores: {}, resultWinner: null,
};

// ── Audio ─────────────────────────────────────────────────────
let audioCtx = null;
function initAudio() {
  if (audioCtx) return;
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
}
function playTone(freq, vol=0.08, dur=0.22, type='sine') {
  if (!audioCtx) return;
  try {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch(e) {}
}
function playChime(freqs=[880,1047,1318], delay=100) {
  freqs.forEach((f,i) => setTimeout(()=>playTone(f,.07,.25),i*delay));
}
function playWhoops() { playTone(440,.1,.15); setTimeout(()=>playTone(330,.08,.2),120); }
function playCollect(val=1) { playTone(660+val*120,.06,.15); }
function playSuccess() { playChime([880,1047,1318,1568],90); }
function playError()   { playTone(220,.08,.3,'sawtooth'); }

// ── WS ────────────────────────────────────────────────────────
let ws = null;
function connectWS(cb) {
  const proto = location.protocol==='https:'?'wss:':'ws:';
  ws = new WebSocket(`${proto}//${location.host}`);
  ws.onopen  = cb;
  ws.onerror = () => showErr('Connection failed — is the server running?');
  ws.onclose = () => { if (appState!=='menu') toast('💔 Disconnected. Refresh to reconnect.'); };
  ws.onmessage = e => { try { handleMsg(JSON.parse(e.data)); } catch(x) { console.error(x); } };
}
function wsend(m) { ws?.readyState===1 && ws.send(JSON.stringify(m)); }

// ── Message router ────────────────────────────────────────────
function handleMsg(m) {
  switch (m.type) {

    case 'created':
      myId = m.playerId; myIdx = 0;
      roomCode = m.code;
      me = mkMe(260, 450);
      showScreen('wait');
      document.getElementById('disp-code').textContent = m.code;
      document.getElementById('hud-code').textContent  = m.code;
      break;

    case 'joined':
      myId = m.playerId; myIdx = 1;
      roomCode = m.code;
      me      = mkMe(540, 450);
      partner = mkPartner(m.partner);
      loveMeter = m.loveMeter || 0;
      (m.notes||[]).forEach(n => notes.push(n));
      document.getElementById('hud-code').textContent = m.code;
      break;

    case 'partner_joined':
      partner = mkPartner(m.partner);
      break;

    case 'game_start':
      if (m.pet) pet = mkPet(m.pet);
      (m.notes||[]).forEach(n => notes.push(n));
      loveMeter = m.loveMeter || 0;
      enterWorld();
      break;

    case 'move':
      if (partner && m.id === partner.id) {
        partner.tx = m.x; partner.ty = m.y;
        partner.facing = m.facing; partner.animSnap = m.anim;
        partner.sitting = !!m.sit;
      }
      break;

    case 'react':
      const src = m.from === myId ? me : partner;
      if (src) spawnReact(src.x, src.y-44, m.emoji);
      // love boost on hugs/kisses
      if (m.emoji === '🤗' || m.emoji === '💋') {
        loveMeter = Math.min(100, loveMeter + 3);
        updateLoveHUD();
        wsend({ type: 'love_boost' });
      }
      playTone(660,.05,.15);
      break;

    case 'chat':
      const who = m.from === myId ? me : partner;
      if (who) chatBubs.push({ x: who.x, y: who.y-72, text: m.text, age: 0, isMe: m.from === myId });
      break;

    case 'note_added':
      notes.push(m.note);
      toast('📌 Note pinned!');
      break;

    case 'pet_update':
      if (pet) { pet.happiness = m.happiness; pet.happyTimer = 180; pet.state = 'spin'; }
      spawnReact(pet?.x||400, (pet?.y||360)-50, '💕');
      playTone(880,.06,.18);
      break;

    case 'pet_renamed':
      if (pet) pet.name = m.name;
      toast(`🐾 Pet renamed to "${m.name}"!`);
      break;

    case 'love':
      loveMeter = m.meter;
      updateLoveHUD();
      break;

    case 'partner_left':
      partner = null;
      toast('💔 Partner disconnected…');
      break;

    // ── Mini-game flow ───────────────────────────────────────
    case 'mg_start':
      startCountdown(m.game, m.name);
      break;

    case 'mg_playing':
      beginMG(m.game);
      break;

    case 'mg_end':
      finishMG(m.scores, m.winner);
      break;

    // ── Heart collector ──────────────────────────────────────
    case 'hearts_spawned':
      MG.hearts = m.hearts.map(h => ({ ...h, collected:false, popAge:-1, bobOff:Math.random()*Math.PI*2 }));
      MG.myScore = 0; MG.partScore = 0;
      break;

    case 'heart_taken': {
      const h = MG.hearts.find(h => h.id === m.id);
      if (h) { h.collected = true; h.popAge = 0; spawnHeartBurst(h.x, h.y, h.value); }
      MG.myScore   = m.scores[myId]           || 0;
      MG.partScore = m.scores[partner?.id||''] || 0;
      playCollect(h?.value||1);
      break;
    }

    // ── Push arena ───────────────────────────────────────────
    case 'push_init':
      MG.pushMe    = { ...m.positions[myId],    vx:0, vy:0, fell:false };
      MG.pushOther = { ...m.positions[partner?.id||''], vx:0, vy:0, fell:false };
      MG.myFell = false;
      break;

    case 'push_hit':
      if (m.from === partner?.id && MG.pushMe) {
        MG.pushMe.vx += m.dx * 5; MG.pushMe.vy += m.dy * 5;
        spawnSpark(MG.pushMe.x, MG.pushMe.y);
        playTone(300,.1,.12,'sawtooth');
      }
      break;

    case 'player_fell':
      if (m.id === myId && MG.pushMe)    { MG.pushMe.fell = true; MG.myFell = true; }
      if (m.id === partner?.id && MG.pushOther) MG.pushOther.fell = true;
      playWhoops();
      break;

    // ── Draw & guess ─────────────────────────────────────────
    case 'draw_role':
      MG.isDrawer = m.role === 'drawer';
      MG.drawWord = m.word || '';
      MG.drawHint = m.blank || '';
      MG.guesses  = []; MG.drawDone = false;
      drawOffCtx.clearRect(0,0,CW,CH);
      MG.strokes = [];
      initDrawUI();
      break;

    case 'draw_stroke':
      if (!MG.isDrawer) renderStroke(m.stroke);
      break;

    case 'draw_clear':
      if (!MG.isDrawer) { drawOffCtx.clearRect(0,0,CW,CH); MG.strokes=[]; }
      break;

    case 'guess_res':
      MG.guesses.push({ text: m.text, ok: m.ok, isMe: m.from === myId });
      if (m.ok) {
        MG.drawDone = true; MG.drawWord = m.word || MG.drawWord;
        spawnConfetti(); playSuccess();
      } else { playError(); }
      break;

    // ── Love quiz ────────────────────────────────────────────
    case 'quiz_q':
      MG.quizQ      = m.q;
      MG.quizOpts   = m.a;
      MG.quizChosen = -1;
      MG.quizReveal = null;
      MG.quizQI     = m.qi + 1;
      MG.quizTotal  = m.total;
      showQuizUI();
      break;

    case 'quiz_answered':
      // Partner answered — show waiting
      updateQuizWait();
      break;

    case 'quiz_reveal':
      MG.quizReveal = { match: m.match, ans: m.ans, opts: m.opts };
      showQuizReveal(m.match, m.ans, m.opts);
      if (m.match) { spawnConfetti(); playSuccess(); }
      else playTone(440,.07,.2);
      break;

    // ── Memory match ─────────────────────────────────────────
    case 'mem_init':
      MG.memCards   = m.hidden.map(c => ({ id: c.id, emoji:'', revealed:false, matched:false }));
      MG.memFlipped = [];
      MG.memMatched = [];
      MG.memMyTurn  = m.turn === myId;
      break;

    case 'mem_flip': {
      const c = MG.memCards.find(c => c.id === m.id);
      if (c) { c.emoji = m.emoji; c.revealed = true; }
      MG.memFlipped = MG.memCards.filter(c => c.revealed && !c.matched);
      playTone(660,.05,.12);
      break;
    }

    case 'mem_match': {
      m.ids.forEach(id => {
        const c = MG.memCards.find(c => c.id === id);
        if (c) { c.matched = true; c.revealed = true; }
        MG.memMatched.push(id);
      });
      MG.memFlipped = [];
      MG.myScore   = m.scores[myId]           || 0;
      MG.partScore = m.scores[partner?.id||''] || 0;
      spawnHeartBurst(CW/2, CH/2, 2); playTone(880,.08,.2);
      break;
    }

    case 'mem_hide': {
      m.ids.forEach(id => {
        const c = MG.memCards.find(c => c.id === id);
        if (c) { c.revealed = false; c.emoji = ''; }
      });
      MG.memFlipped = [];
      MG.memMyTurn  = m.turn === myId;
      break;
    }

    case 'timer_sync':
      mgTimerVal = m.remaining;
      updateTimerHUD();
      break;

    case 'err':
      showErr(m.msg);
      break;
  }
}

// ── Player factories ──────────────────────────────────────────
function mkMe(x, y) {
  return { id:myId, name:myName, gender:myGender, color:myColor,
           x, y, tx:x, ty:y, facing:'right', animTime:0, sitting:false, isMe:true };
}
function mkPartner(d) {
  return { id:d.id, name:d.name, gender:d.gender||'boy', color:d.color||'#85C1E9',
           x:d.x||530, y:d.y||450, tx:d.x||530, ty:d.y||450,
           facing:'left', animTime:0, animSnap:0, sitting:false, isMe:false };
}
function mkPet(d) {
  return { x:d.x||410, y:d.y||360, tx:d.x||410, ty:d.y||360,
           name:d.name||'Noodle', happiness:d.happiness||60,
           state:'idle', happyTimer:0, bobOff:0, animTime:0,
           eyeAnim:0, eyeTimer:0, tailAnim:0, wanderTimer:200 };
}

// ── Canvas setup ──────────────────────────────────────────────
function setupCanvas() {
  gc  = document.getElementById('gc');
  mgc = document.getElementById('mgc');
  gctx  = gc.getContext('2d');
  mgctx = mgc.getContext('2d');

  drawOff    = document.createElement('canvas');
  drawOff.width = CW; drawOff.height = CH;
  drawOffCtx = drawOff.getContext('2d');

  function resize() {
    const sw = Math.min(1, window.innerWidth  / CW);
    const sh = Math.min(1, window.innerHeight / CH);
    scale     = Math.min(sw, sh);
    const cw  = Math.floor(CW * scale);
    const ch  = Math.floor(CH * scale);
    canvasLeft = Math.floor((window.innerWidth  - cw) / 2);
    canvasTop  = Math.floor((window.innerHeight - ch) / 2);

    gc.width  = mgc.width  = CW;
    gc.height = mgc.height = CH;
    gc.style.width  = mgc.style.width  = cw+'px';
    gc.style.height = mgc.style.height = ch+'px';
    gc.style.left   = mgc.style.left   = canvasLeft+'px';
    gc.style.top    = mgc.style.top    = canvasTop+'px';
    gc.style.position = mgc.style.position = 'absolute';

    // position tap layer
    const mt = document.getElementById('mg-tap');
    mt.style.left   = canvasLeft+'px'; mt.style.top   = canvasTop+'px';
    mt.style.width  = cw+'px';         mt.style.height = ch+'px';
  }
  window.addEventListener('resize', resize);
  resize();
}

// ── Screen manager ────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const map = { menu:'s-menu', gender:'s-gender', wait:'s-wait', game:'s-game' };
  document.getElementById(map[id] || id)?.classList.add('active');
}

function enterWorld() {
  showScreen('game');
  document.getElementById('hud').style.display     = 'block';
  document.getElementById('side-reacts').style.display = 'flex';
  document.getElementById('toolbar').style.display  = 'flex';
  // show joystick only on touch devices
  if (window.matchMedia('(pointer:coarse)').matches)
    document.getElementById('joystick').style.display = 'block';
  appState = 'world';
  updateLoveHUD();
  startTimerPoll();
  toast(`💕 Connected! Hello ${partner?.name || 'partner'}!`);
  spawnReact(CW/2, 240, '🎉');
  playChime();
}

function startTimerPoll() {
  clearInterval(mgTimerInterval);
  mgTimerInterval = setInterval(() => {
    if (appState === 'world') {
      mgTimerVal = Math.max(0, mgTimerVal - 1);
      updateTimerHUD();
    }
    if (appState === 'world' && frame % 300 === 0) {
      wsend({ type:'timer_req' }); // re-sync every ~5s
    }
  }, 1000);
}

function updateTimerHUD() {
  const el  = document.getElementById('timer-txt');
  const hud = document.getElementById('hud-timer');
  if (!el) return;
  if (appState === 'world') {
    el.textContent = mgTimerVal+'s';
    hud.classList.toggle('urgent', mgTimerVal <= 12);
  } else if (appState === 'minigame') {
    el.textContent = '🎮 Playing!';
    hud.classList.remove('urgent');
  }
}

function updateLoveHUD() {
  const fill = document.getElementById('love-bar-fill');
  const pct  = document.getElementById('love-pct');
  if (fill) fill.style.width = loveMeter + '%';
  if (pct)  pct.textContent  = Math.round(loveMeter) + '%';
}

// ── Countdown → Mini-game ─────────────────────────────────────
function startCountdown(type, name) {
  MG.type = type; MG.active = false;
  appState = 'countdown';
  clearInterval(mgTimerInterval);
  mgctx.clearRect(0,0,CW,CH);
  document.getElementById('mgc').style.display = 'block';
  document.getElementById('mg-tap').style.display = 'block';

  const cdEl  = document.getElementById('countdown');
  const numEl = document.getElementById('cd-num');
  document.getElementById('cd-name').textContent = name || type;
  cdEl.style.display = 'flex';
  numEl.textContent  = '3';
  playTone(880,.09,.18);

  let n = 3;
  const iv = setInterval(() => {
    n--;
    if (n > 0) {
      numEl.textContent = n;
      playTone(n===1?1047:880,.09,.18);
    } else {
      clearInterval(iv);
      cdEl.style.display = 'none';
    }
  }, 1000);
}

function beginMG(type) {
  MG.type   = type;
  MG.active = true;
  MG.myScore = 0; MG.partScore = 0;
  MG.myFell  = false;
  MG.guesses = []; MG.drawDone = false;
  appState = 'minigame';
  document.getElementById('countdown').style.display = 'none';
  updateTimerHUD();
  startTimerPoll();
  playTone(1046,.1,.2);
}

// ── Finish / results ──────────────────────────────────────────
function finishMG(scores, winner) {
  // Reset all MG UI immediately
  appState = 'world';
  MG.active = false;
  document.getElementById('mgc').style.display  = 'none';
  document.getElementById('mg-tap').style.display = 'none';
  document.getElementById('draw-bar').style.display   = 'none';
  document.getElementById('guess-bar').style.display  = 'none';
  document.getElementById('quiz-ui').style.display    = 'none';
  document.getElementById('countdown').style.display  = 'none';
  mgctx.clearRect(0,0,CW,CH);

  MG.resultScores = scores;
  MG.resultWinner = winner;

  // Build results card
  const myS   = scores[myId]           || 0;
  const partS = scores[partner?.id||''] || 0;
  const tie   = myS === partS;
  const iWin  = myS > partS;

  document.getElementById('res-title').textContent  = tie ? "🤝 It's a tie!" : iWin ? '🏆 You win!' : '😅 They win!';
  document.getElementById('res-winner').textContent = winner === myId
    ? `${myName} takes the crown! 👑`
    : winner ? `${partner?.name||'Partner'} wins this round!`
    : 'No winner this time!';

  const sc = document.getElementById('res-scores');
  sc.innerHTML = `
    <div class="rs-block">
      <div class="rs-name">${myName} (you)</div>
      <div class="rs-val" style="color:${myColor}">${myS}</div>
    </div>
    <div class="rs-block">
      <div class="rs-name">${partner?.name||'Partner'}</div>
      <div class="rs-val" style="color:${partner?.color||'#85C1E9'}">${partS}</div>
    </div>`;
  document.getElementById('res-love').textContent = `💕 Love meter: ${Math.round(loveMeter)}%`;

  document.getElementById('results').style.display = 'flex';
  if (iWin||tie) { spawnConfetti(); playSuccess(); }
  else           { playTone(440,.09,.3); }

  setTimeout(() => {
    document.getElementById('results').style.display = 'none';
    startTimerPoll();
    wsend({ type:'timer_req' });
  }, 5000);
}

// ═══════════════════════════════════════════════════════════════
//  MOVEMENT & COLLISION
// ═══════════════════════════════════════════════════════════════

const BOUNDS = { l:28, r:772, t:118, b:585 };
const SOLID  = [
  { x:38,  y:435, w:216, h:92  },  // couch
  { x:318, y:348, w:134, h:68  },  // table
  { x:616, y:82,  w:158, h:195 },  // bookshelf
  { x:28,  y:195, w:95,  h:125 },  // desk
];

function isSolid(nx, ny) {
  if (nx<BOUNDS.l||nx>BOUNDS.r||ny<BOUNDS.t||ny>BOUNDS.b) return true;
  for (const f of SOLID) if (nx>f.x&&nx<f.x+f.w&&ny>f.y&&ny<f.y+f.h) return true;
  return false;
}

function getDir() {
  let dx=0, dy=0;
  if (keys['arrowleft']||keys['a']) dx=-1;
  if (keys['arrowright']||keys['d']) dx=1;
  if (keys['arrowup']||keys['w']) dy=-1;
  if (keys['arrowdown']||keys['s']) dy=1;
  if (touch.active) { dx=touch.dx; dy=touch.dy; }
  if (dx&&dy) { dx*=.707; dy*=.707; }
  return { dx, dy };
}

function updateMyPlayer() {
  if (!me || appState !== 'world') return;
  const SPD = 3.0;
  const { dx, dy } = getDir();
  const nx = me.x + dx*SPD, ny = me.y + dy*SPD;
  if (!isSolid(nx, me.y)) me.x = nx;
  if (!isSolid(me.x, ny)) me.y = ny;
  if (dx>0) me.facing='right'; if (dx<0) me.facing='left';
  const moving = dx!==0||dy!==0;
  if (moving) me.animTime += 0.2; else me.animTime=0;
  me.sitting = false;

  const now = performance.now();
  if (now - lastSend > SEND_HZ) {
    lastSend = now;
    wsend({ type:'move', x:me.x, y:me.y, facing:me.facing, anim:me.animTime, sit:me.sitting });
  }
}

function lerpPartner() {
  if (!partner) return;
  partner.x += (partner.tx - partner.x) * 0.2;
  partner.y += (partner.ty - partner.y) * 0.2;
  const moving = Math.abs(partner.tx-partner.x)>0.5 || Math.abs(partner.ty-partner.y)>0.5;
  if (moving) partner.animTime = (partner.animTime||0) + 0.2;
  else        partner.animTime = 0;
}

// ── Pet AI ─────────────────────────────────────────────────────
function updatePet() {
  if (!pet) return;
  pet.animTime++; pet.bobOff += .055; pet.tailAnim += .08;
  if (pet.happyTimer > 0) pet.happyTimer--;
  if (pet.happyTimer === 0 && pet.state==='spin') pet.state='idle';
  pet.eyeTimer++;
  if (pet.eyeTimer > 130+Math.random()*60) { pet.eyeAnim=1; pet.eyeTimer=0; }
  if (pet.eyeAnim > 0) pet.eyeAnim = Math.max(0, pet.eyeAnim-.15);
  pet.wanderTimer--;
  if (pet.wanderTimer <= 0) {
    const tgt = Math.random()<.6 ? me : partner;
    if (tgt) {
      const d = Math.hypot(tgt.x-pet.x, tgt.y-pet.y);
      if (d > 100) { pet.tx=tgt.x+(Math.random()-.5)*60; pet.ty=tgt.y+(Math.random()-.5)*40; }
      else          { pet.tx=120+Math.random()*560; pet.ty=150+Math.random()*380; }
    }
    pet.wanderTimer = 140+Math.random()*220;
  }
  pet.x += (pet.tx-pet.x)*.022; pet.y += (pet.ty-pet.y)*.022;
  pet.x = Math.max(55, Math.min(CW-55, pet.x));
  pet.y = Math.max(145, Math.min(CH-55, pet.y));
}

// ── Push arena physics ─────────────────────────────────────────
function updatePush() {
  if (!MG.pushMe || MG.myFell) return;
  const { dx, dy } = getDir();
  MG.pushMe.vx = (MG.pushMe.vx + dx*.65) * .88;
  MG.pushMe.vy = (MG.pushMe.vy + dy*.65) * .88;
  MG.pushMe.x += MG.pushMe.vx;
  MG.pushMe.y += MG.pushMe.vy;

  if (MG.pushOther && !MG.pushOther.fell) {
    const dist = Math.hypot(MG.pushMe.x-MG.pushOther.x, MG.pushMe.y-MG.pushOther.y);
    if (dist < 42 && dist > 0) {
      const nx=(MG.pushMe.x-MG.pushOther.x)/dist, ny=(MG.pushMe.y-MG.pushOther.y)/dist;
      const p = (42-dist)*.5;
      MG.pushMe.vx+=nx*p*.3; MG.pushMe.vy+=ny*p*.3;
      MG.pushOther.vx-=nx*p*.3; MG.pushOther.vy-=ny*p*.3;
      wsend({ type:'mg', action:'push', dx:-nx*.9, dy:-ny*.9 });
    }
    MG.pushOther.vx*=.88; MG.pushOther.vy*=.88;
    MG.pushOther.x+=MG.pushOther.vx; MG.pushOther.y+=MG.pushOther.vy;
  }

  const myD = Math.hypot(MG.pushMe.x-MG.pushCX, MG.pushMe.y-MG.pushCY);
  if (myD > MG.pushR && !MG.myFell) {
    MG.myFell = true;
    wsend({ type:'mg', action:'fell' });
    spawnBurst(MG.pushMe.x, MG.pushMe.y, myColor);
  }
}

// ── Heart collect check ────────────────────────────────────────
function checkHearts() {
  if (!me) return;
  MG.hearts.forEach(h => {
    if (h.collected) return;
    if (Math.hypot(me.x-h.x, me.y-h.y) < 30) wsend({ type:'mg', action:'collect', id:h.id });
  });
}

// ═══════════════════════════════════════════════════════════════
//  FX
// ═══════════════════════════════════════════════════════════════

function spawnReact(x,y,emoji) { reactions.push({x,y,emoji,age:0,maxAge:90,vy:-1.3}); }
function spawnHeartBurst(x,y,n=1) {
  for (let i=0;i<n*5;i++) {
    const a=Math.random()*Math.PI*2, s=1+Math.random()*3;
    particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-1.2,r:3+Math.random()*4,col:'#FF85A1',life:1});
  }
}
function spawnSpark(x,y) {
  for (let i=0;i<10;i++) {
    const a=Math.random()*Math.PI*2;
    particles.push({x,y,vx:Math.cos(a)*3.5,vy:Math.sin(a)*3.5-1,r:3,col:'#FFD93D',life:1});
  }
}
function spawnBurst(x,y,col) {
  for (let i=0;i<18;i++) {
    const a=Math.random()*Math.PI*2, s=2+Math.random()*5;
    particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-2,r:4+Math.random()*5,col,life:1});
  }
}
function spawnFloat(x,y,txt,col='#FF5C8A') { floatTexts.push({x,y,txt,col,age:0,maxAge:70}); }
function spawnConfetti() {
  const cols=['#FF85A1','#85C1E9','#FFD93D','#72E480','#C97EE8','#FF5C8A'];
  for (let i=0;i<90;i++) {
    confetti.push({ x:Math.random()*CW, y:-20, vx:(Math.random()-.5)*5,
      vy:2+Math.random()*4, col:cols[i%cols.length], rot:Math.random()*360,
      rs:(Math.random()-.5)*9, life:1, w:8+Math.random()*8, h:4+Math.random()*5 });
  }
}
function updateFX() {
  for (let i=particles.length-1;i>=0;i--) {
    const p=particles[i]; p.x+=p.vx; p.y+=p.vy; p.vy+=.18; p.life-=.026; if(p.life<=0) particles.splice(i,1);
  }
  for (let i=confetti.length-1;i>=0;i--) {
    const c=confetti[i]; c.x+=c.vx; c.y+=c.vy; c.rot+=c.rs; c.life-=.008; if(c.life<=0||c.y>CH+20) confetti.splice(i,1);
  }
  for (let i=reactions.length-1;i>=0;i--) {
    const r=reactions[i]; r.age++; r.y+=r.vy; if(r.age>=r.maxAge) reactions.splice(i,1);
  }
  for (let i=chatBubs.length-1;i>=0;i--) {
    chatBubs[i].age++; if(chatBubs[i].age>260) chatBubs.splice(i,1);
  }
  for (let i=floatTexts.length-1;i>=0;i--) {
    floatTexts[i].age++; floatTexts[i].y-=.6; if(floatTexts[i].age>=floatTexts[i].maxAge) floatTexts.splice(i,1);
  }
}

// ═══════════════════════════════════════════════════════════════
//  DRAW HELPERS
// ═══════════════════════════════════════════════════════════════

function rr(c,x,y,w,h,r) {
  c.beginPath();
  c.moveTo(x+r,y); c.lineTo(x+w-r,y); c.quadraticCurveTo(x+w,y,x+w,y+r);
  c.lineTo(x+w,y+h-r); c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  c.lineTo(x+r,y+h); c.quadraticCurveTo(x,y+h,x,y+h-r);
  c.lineTo(x,y+r); c.quadraticCurveTo(x,y,x+r,y); c.closePath();
}

// ═══════════════════════════════════════════════════════════════
//  WORLD RENDERER
// ═══════════════════════════════════════════════════════════════

function drawWorld(c) {
  // Wallpaper
  const wg = c.createLinearGradient(0,0,0,280);
  wg.addColorStop(0,'#EDD5F5'); wg.addColorStop(1,'#DCC0EE');
  c.fillStyle=wg; c.fillRect(0,0,CW,280);
  // Wallpaper hearts pattern
  c.fillStyle='rgba(255,133,161,.13)';
  for (let row=0;row<4;row++) for (let col=0;col<20;col++) {
    const ox=(row%2)*20, px=col*42+ox, py=row*44+14;
    drawHeartShape(c,px,py,7);
  }
  // Floor
  const fg=c.createLinearGradient(0,255,0,CH);
  fg.addColorStop(0,'#F5E6D0'); fg.addColorStop(1,'#E8D4B8');
  c.fillStyle=fg; c.fillRect(0,255,CW,CH-255);
  // Planks
  c.strokeStyle='rgba(180,140,100,.2)'; c.lineWidth=1;
  for (let y=275;y<CH;y+=55){ c.beginPath();c.moveTo(0,y);c.lineTo(CW,y);c.stroke(); }
  for (let x=0;x<CW;x+=100){ c.beginPath();c.moveTo(x,255);c.lineTo(x,CH);c.stroke(); }
  // Baseboard
  c.fillStyle='#D4B090'; c.fillRect(0,252,CW,13);
  c.fillStyle='#C09070'; c.fillRect(0,262,CW,3);
  // Furniture
  drawFurniture(c);
}

function drawHeartShape(c,x,y,s) {
  c.beginPath();
  c.moveTo(x,y+s*.3);
  c.bezierCurveTo(x,y-s*.15, x-s,y-s*.5, x-s,y-s*.5);
  c.bezierCurveTo(x-s*1.8,y-s*.5, x-s*1.8,y+s*.4, x-s*1.8,y+s*.4);
  c.bezierCurveTo(x-s*1.8,y+s*.9, x,y+s*1.4, x,y+s*1.5);
  c.bezierCurveTo(x,y+s*1.4, x+s*1.8,y+s*.9, x+s*1.8,y+s*.4);
  c.bezierCurveTo(x+s*1.8,y+s*.4, x+s*1.8,y-s*.5, x+s,y-s*.5);
  c.bezierCurveTo(x+s,y-s*.5, x,y-s*.15, x,y+s*.3);
  c.fill();
}

function drawFurniture(c) {
  drawWindow(c,285,36,225,185);
  drawBookshelf(c,616,78,160,205);
  drawDesk(c,26,192,98,128);
  drawCouch(c,36,432,220,98);
  drawRug(c,400,490,205,92);
  drawTable(c,328,452,138,52);
  drawPlant(c,706,442);
  drawLamp(c,158,200);
  drawPlantSmall(c,40,500);
  drawDecorItems(c);
}

function drawWindow(c,x,y,w,h) {
  c.fillStyle='#C8A87A'; rr(c,x-7,y-7,w+14,h+14,9); c.fill();
  const sg=c.createLinearGradient(x,y,x,y+h);
  sg.addColorStop(0,'#6080C0'); sg.addColorStop(1,'#1A2050');
  c.fillStyle=sg; rr(c,x,y,w,h,4); c.fill();
  // Stars
  c.fillStyle='rgba(255,250,200,.95)';
  [[x+25,y+20],[x+55,y+38],[x+90,y+14],[x+150,y+28],[x+180,y+50],[x+45,y+65],[x+115,y+58]].forEach(([sx,sy])=>{
    const flk=.5+Math.sin(frame*.04+sx)*.5;
    c.globalAlpha=flk; c.beginPath(); c.arc(sx,sy,2+Math.sin(frame*.03+sy)*.7,0,Math.PI*2); c.fill();
  });
  c.globalAlpha=1;
  // Moon
  c.fillStyle='rgba(255,245,200,.95)';
  c.beginPath(); c.arc(x+w*.7,y+38,20,0,Math.PI*2); c.fill();
  c.fillStyle='rgba(100,120,200,.8)'; c.beginPath(); c.arc(x+w*.7+9,y+33,17,0,Math.PI*2); c.fill();
  c.fillStyle='rgba(255,245,200,.95)'; c.beginPath(); c.arc(x+w*.7,y+38,20,0,Math.PI*2); c.fill();
  // Ground
  c.fillStyle='rgba(60,180,100,.45)';
  c.beginPath(); c.moveTo(x,y+h); c.quadraticCurveTo(x+w*.35,y+h*.6,x+w*.5,y+h*.68);
  c.quadraticCurveTo(x+w*.72,y+h*.78,x+w,y+h*.63); c.lineTo(x+w,y+h); c.fill();
  // Dividers
  c.strokeStyle='#C8A87A'; c.lineWidth=3;
  c.beginPath(); c.moveTo(x+w/2,y); c.lineTo(x+w/2,y+h); c.stroke();
  c.beginPath(); c.moveTo(x,y+h*.56); c.lineTo(x+w,y+h*.56); c.stroke();
  // Curtains
  ['left','right'].forEach(side => {
    const cx = side==='left' ? x-7 : x+w+7;
    const dir = side==='left' ? 1 : -1;
    c.fillStyle='#E8A8C0';
    c.beginPath();
    c.moveTo(cx,y-7); c.quadraticCurveTo(cx+dir*18,y+h*.45,cx,y+h+7);
    c.lineTo(cx+dir*32,y+h+7); c.quadraticCurveTo(cx+dir*38,y+h*.45,cx+dir*32,y-7); c.fill();
  });
  c.fillStyle='#D080A0'; c.fillRect(x-14,y-11,w+28,16);
}

function drawBookshelf(c,x,y,w,h) {
  c.fillStyle='#9A7040'; rr(c,x,y,w,h,4); c.fill();
  c.fillStyle='#836030'; c.fillRect(x+4,y+4,w-8,h-8);
  const bcols=['#FF85A1','#85C1E9','#72E480','#FFD93D','#C97EE8','#FF7B54','#5DADE2','#F1948A'];
  for (let shelf=0;shelf<3;shelf++) {
    const sy=y+8+shelf*64;
    c.fillStyle='#9A7040'; c.fillRect(x+4,sy+50,w-8,6);
    let bx=x+8;
    for (let b=0;b<6;b++) {
      const bh=26+(shelf*5+b*3)%14, bw=13+(b*5)%8;
      if (bx+bw>x+w-6) break;
      c.fillStyle=bcols[(shelf*6+b)%bcols.length];
      rr(c,bx,sy+50-bh,bw,bh,2); c.fill();
      c.fillStyle='rgba(0,0,0,.1)'; c.fillRect(bx,sy+50-bh,2,bh);
      bx+=bw+2;
    }
  }
  // Top deco
  c.fillStyle='#C87840'; rr(c,x+8,y-20,28,22,4); c.fill();
  c.fillStyle='#5CA830'; c.beginPath(); c.arc(x+22,y-22,11,0,Math.PI*2); c.fill();
  c.fillStyle='#F0E8D0'; c.beginPath(); c.arc(x+w-26,y-14,13,0,Math.PI*2); c.fill();
  c.strokeStyle='#A07030'; c.lineWidth=2; c.stroke();
}

function drawDesk(c,x,y,w,h) {
  c.fillStyle='#8A6E3A'; c.fillRect(x+4,y+h-18,8,18); c.fillRect(x+w-12,y+h-18,8,18);
  c.fillStyle='#C8A87A'; rr(c,x,y,w,12,3); c.fill();
  c.fillStyle='#B89060'; c.fillRect(x+4,y+10,w-8,h-28);
  // Laptop
  c.fillStyle='#505060'; rr(c,x+14,y-24,56,22,3); c.fill();
  c.fillStyle='#888898'; rr(c,x+16,y-22,52,18,2); c.fill();
  c.fillStyle='#70C8F8'; rr(c,x+18,y-20,48,14,1); c.fill();
  // Screen glow
  const lg=c.createRadialGradient(x+42,y-13,1,x+42,y-13,28);
  lg.addColorStop(0,'rgba(100,200,255,.12)'); lg.addColorStop(1,'rgba(100,200,255,0)');
  c.fillStyle=lg; c.fillRect(x,y-30,80,40);
  c.fillStyle='#505060'; c.fillRect(x+24,y,44,4); c.fillRect(x+20,y+4,8,5); c.fillRect(x+60,y+4,8,5);
}

function drawCouch(c,x,y,w,h) {
  c.fillStyle='rgba(0,0,0,.06)'; rr(c,x+8,y+h-4,w,14,7); c.fill();
  c.fillStyle='#CC7878'; rr(c,x,y,w,h*.54,12); c.fill();
  c.fillStyle='#E09090'; rr(c,x+6,y+h*.43,w-12,h*.6,10); c.fill();
  c.fillStyle='#BB6868'; rr(c,x-5,y+h*.08,26,h*.82,10); c.fill();
  rr(c,x+w-21,y+h*.08,26,h*.82,10); c.fill();
  ['#F4AAAA','#F0C0C0'].forEach((col,i) => {
    c.fillStyle=col; rr(c,x+24+i*103,y+h*.46,94,h*.52,8); c.fill();
    c.strokeStyle='rgba(255,255,255,.45)'; c.lineWidth=1.5;
    c.beginPath(); c.moveTo(x+71+i*103,y+h*.5); c.lineTo(x+71+i*103,y+h-8); c.stroke();
  });
  // Blanket
  c.fillStyle='#B0C8F0'; c.beginPath();
  c.moveTo(x+98,y+6); c.quadraticCurveTo(x+122,y+22,x+185,y+12);
  c.quadraticCurveTo(x+205,y+32,x+192,y+65); c.quadraticCurveTo(x+168,y+58,x+108,y+64);
  c.quadraticCurveTo(x+88,y+48,x+98,y+6); c.fill();
}

function drawRug(c,x,y,rx,ry) {
  c.save(); c.translate(x,y);
  c.fillStyle='rgba(0,0,0,.06)'; c.beginPath(); c.ellipse(6,8,rx+6,ry+6,0,0,Math.PI*2); c.fill();
  c.fillStyle='#F4A0B5'; c.beginPath(); c.ellipse(0,0,rx,ry,0,0,Math.PI*2); c.fill();
  c.strokeStyle='#E88898'; c.lineWidth=4;
  c.beginPath(); c.ellipse(0,0,rx*.72,ry*.72,0,0,Math.PI*2); c.stroke();
  c.fillStyle='#E88898'; c.beginPath(); c.arc(0,0,rx*.2,0,Math.PI*2); c.fill();
  c.fillStyle='#FFB3C8'; c.beginPath(); c.arc(0,0,rx*.1,0,Math.PI*2); c.fill();
  c.fillStyle='#E88898';
  for (let a=0;a<Math.PI*2;a+=.28) {
    c.beginPath(); c.arc(Math.cos(a)*(rx-9),Math.sin(a)*(ry-9),2.5,0,Math.PI*2); c.fill();
  }
  c.restore();
}

function drawTable(c,x,y,w,h) {
  c.fillStyle='#9A7840'; c.fillRect(x+8,y+h,8,18); c.fillRect(x+w-16,y+h,8,18);
  c.fillStyle='#D4AC70'; rr(c,x,y,w,h,8); c.fill();
  c.fillStyle='#C49A58'; rr(c,x+4,y+4,w-8,h-8,6); c.fill();
  // Cup
  c.fillStyle='white'; rr(c,x+w/2-14,y+4,28,20,4); c.fill();
  c.strokeStyle='#E0B0C0'; c.lineWidth=1.5; c.stroke();
  c.fillStyle='#D48060'; c.beginPath(); c.arc(x+w/2,y+11,7,0,Math.PI*2); c.fill();
  // Steam
  c.strokeStyle='rgba(200,200,255,.5)'; c.lineWidth=1.5;
  for (let i=0;i<2;i++) {
    c.beginPath();
    c.moveTo(x+w/2+(i*8-4),y+2);
    c.quadraticCurveTo(x+w/2+(i*8-4)+3,y-5,x+w/2+(i*8-4),y-12); c.stroke();
  }
}

function drawPlant(c,x,y) {
  c.fillStyle='#C87840';
  c.beginPath(); c.moveTo(x-22,y); c.lineTo(x+22,y); c.lineTo(x+16,y+52); c.lineTo(x-16,y+52); c.fill();
  c.fillStyle='#B06020'; c.fillRect(x-26,y-5,52,10);
  c.fillStyle='#6B3A1F'; c.beginPath(); c.arc(x,y,18,Math.PI,0); c.fill();
  const sway=Math.sin(frame*.018)*2.5;
  c.fillStyle='#4A9830';
  for (let i=0;i<5;i++) {
    const a=-Math.PI/2+(i-2)*.42+sway*.018, len=52+(i%2)*20;
    const ex=x+Math.cos(a)*len, ey=y-18+Math.sin(a)*len;
    c.beginPath(); c.moveTo(x,y-6); c.quadraticCurveTo((x+ex)/2+sway,((y-6)+ey)/2-14,ex,ey);
    c.quadraticCurveTo((x+ex)/2-14+sway,((y-6)+ey)/2+5,x,y-6); c.fill();
  }
}

function drawLamp(c,x,y) {
  c.strokeStyle='#A07030'; c.lineWidth=4;
  c.beginPath(); c.moveTo(x,y); c.lineTo(x,y-84); c.stroke();
  c.fillStyle='#FFE4A0';
  c.beginPath(); c.moveTo(x-32,y-82); c.lineTo(x+32,y-82); c.lineTo(x+22,y-52); c.lineTo(x-22,y-52); c.fill();
  c.strokeStyle='#E0C070'; c.lineWidth=2; c.stroke();
  const gl=c.createRadialGradient(x,y-60,5,x,y-60,90);
  gl.addColorStop(0,'rgba(255,220,130,.22)'); gl.addColorStop(1,'rgba(255,220,130,0)');
  c.fillStyle=gl; c.beginPath(); c.arc(x,y-60,90,0,Math.PI*2); c.fill();
  c.fillStyle='#A07030'; rr(c,x-10,y-8,20,10,4); c.fill();
}

function drawPlantSmall(c,x,y) {
  c.fillStyle='#B06020'; rr(c,x,y,30,24,4); c.fill();
  c.fillStyle='#4A9830'; c.beginPath(); c.arc(x+15,y-8,14,0,Math.PI*2); c.fill();
  c.fillStyle='#5AB040'; c.beginPath(); c.arc(x+10,y-14,10,0,Math.PI*2); c.fill();
  c.beginPath(); c.arc(x+20,y-12,9,0,Math.PI*2); c.fill();
}

function drawDecorItems(c) {
  // Star lights string top
  c.strokeStyle='rgba(80,60,100,.5)'; c.lineWidth=1.5;
  c.beginPath(); c.moveTo(0,20); c.quadraticCurveTo(CW/2,35,CW,20); c.stroke();
  const starColors=['#FFD93D','#FF85A1','#85C1E9','#72E480','#C97EE8'];
  for (let i=0;i<18;i++) {
    const t=i/17, bx2=t*CW, by2=20+(Math.sin(t*Math.PI)*15);
    const flk=.5+Math.sin(frame*.06+i*1.2)*.5;
    c.fillStyle=starColors[i%starColors.length]; c.globalAlpha=.6+flk*.4;
    c.beginPath(); c.arc(bx2,by2,3,0,Math.PI*2); c.fill();
  }
  c.globalAlpha=1;
}

// ═══════════════════════════════════════════════════════════════
//  CHARACTER RENDERER
// ═══════════════════════════════════════════════════════════════

function drawChar(c, p, isMe) {
  if (!p) return;
  const { x, y, color, facing, animTime, sitting, gender } = p;
  c.save();
  if (facing==='left') { c.translate(x*2,0); c.scale(-1,1); }

  const bob = sitting ? 0 : Math.abs(Math.sin(animTime))*.028*10;
  const leg  = sitting ? 0 : Math.sin(animTime)*9;

  // Shadow
  c.fillStyle='rgba(0,0,0,.09)'; c.beginPath(); c.ellipse(x,y+3,15,5,0,0,Math.PI*2); c.fill();

  // Legs
  c.fillStyle=gender==='boy'?'#3050A0':gender==='enby'?'#604080':'#504090';
  if (!sitting) {
    rr(c,x-10,y-4+bob,9,24+leg,4); c.fill();
    rr(c,x+1,y-4+bob,9,24-leg,4); c.fill();
    // Shoes
    c.fillStyle=gender==='boy'?'#202060':'#302050';
    rr(c,x-12,y+18+leg+bob,14,7,3); c.fill();
    rr(c,x-2,y+18-leg+bob,14,7,3); c.fill();
  } else {
    c.fillRect(x-10,y,20,14);
    c.fillStyle='#302050'; rr(c,x-14,y+10,14,7,3); c.fill(); rr(c,x,y+10,14,7,3); c.fill();
  }

  // Body
  c.fillStyle=color; rr(c,x-13,y-30+bob,26,28,7); c.fill();
  // Shirt detail
  if (gender==='girl') {
    c.fillStyle='rgba(255,255,255,.28)'; rr(c,x-9,y-26+bob,18,8,4); c.fill();
    // Skirt flare hint
    c.fillStyle=color; c.globalAlpha=.6; rr(c,x-16,y-6+bob,32,10,5); c.fill(); c.globalAlpha=1;
  } else if (gender==='enby') {
    c.fillStyle='rgba(255,255,255,.22)';
    c.fillRect(x-9,y-26+bob,18,2); c.fillRect(x-9,y-20+bob,18,2);
  } else {
    c.fillStyle='rgba(255,255,255,.2)'; rr(c,x-8,y-26+bob,16,6,3); c.fill();
  }

  // Arms
  const armSw = Math.sin(animTime*1.1)*12;
  [[x+12,x+20,-4,1],[x-20,x-20,0,-1]].forEach(([tx2,armX,flip,dir],ai) => {
    c.save(); c.translate(x+(ai===0?12:-20), y-24+bob);
    c.rotate((armSw*dir+(isMe?Math.sin(frame*.05)*2:0))*Math.PI/180);
    c.fillStyle=color; rr(c,0,0,8,20,4); c.fill();
    c.fillStyle='#FFDAB9'; c.beginPath(); c.arc(4,20,5.5,0,Math.PI*2); c.fill();
    c.restore();
  });

  // Neck
  c.fillStyle='#FFDAB9'; c.fillRect(x-5,y-36+bob,10,8);

  // Head
  c.fillStyle='#FFDAB9'; c.beginPath(); c.arc(x,y-48+bob,17,0,Math.PI*2); c.fill();

  // Hair
  const hairCols = {
    girl:  { main:'#C06080', hi:'#E080A0' },
    boy:   { main:'#306090', hi:'#4080C0' },
    enby:  { main:'#806090', hi:'#B090C0' },
  };
  const hc = hairCols[gender] || hairCols.girl;
  c.fillStyle=hc.main;
  c.beginPath(); c.arc(x,y-56+bob,15,Math.PI,0); c.fill();
  c.beginPath(); c.arc(x-9,y-58+bob,10,0,Math.PI*2); c.fill();
  c.beginPath(); c.arc(x+9,y-58+bob,9,0,Math.PI*2); c.fill();
  c.beginPath(); c.arc(x,y-62+bob,11,0,Math.PI*2); c.fill();

  if (gender==='girl') {
    // Side hair locks
    c.fillStyle=hc.main;
    c.beginPath(); c.arc(x-17,y-44+bob,7,0,Math.PI*2); c.fill();
    c.beginPath(); c.arc(x+17,y-44+bob,7,0,Math.PI*2); c.fill();
    // Hair bow
    c.fillStyle='#FF85A1';
    c.beginPath(); c.ellipse(x+8,y-66+bob,8,5,-.6,0,Math.PI*2); c.fill();
    c.beginPath(); c.ellipse(x+8,y-66+bob,8,5,.6,0,Math.PI*2); c.fill();
    c.fillStyle='#FF5C8A'; c.beginPath(); c.arc(x+8,y-66+bob,3.5,0,Math.PI*2); c.fill();
  }
  if (gender==='enby') {
    c.fillStyle=hc.hi;
    c.beginPath(); c.arc(x,y-64+bob,8,0,Math.PI*2); c.fill();
  }
  if (gender==='boy') {
    // Spiky detail
    c.fillStyle=hc.hi; c.beginPath(); c.arc(x-4,y-64+bob,5,0,Math.PI*2); c.fill();
  }

  // Eyes
  const eyeOpen=1-(frame%240<7?(7-frame%240)/7:0);
  c.fillStyle='#3A2A5A';
  c.beginPath(); c.ellipse(x-5.5,y-49+bob,3,3.5*eyeOpen+.5,0,0,Math.PI*2); c.fill();
  c.beginPath(); c.ellipse(x+5.5,y-49+bob,3,3.5*eyeOpen+.5,0,0,Math.PI*2); c.fill();
  c.fillStyle='white';
  c.beginPath(); c.arc(x-4.5,y-51+bob,1.3,0,Math.PI*2); c.fill();
  c.beginPath(); c.arc(x+6.5,y-51+bob,1.3,0,Math.PI*2); c.fill();

  // Blush
  c.fillStyle='rgba(255,140,140,.42)';
  c.beginPath(); c.ellipse(x-11,y-44+bob,5.5,3.5,0,0,Math.PI*2); c.fill();
  c.beginPath(); c.ellipse(x+11,y-44+bob,5.5,3.5,0,0,Math.PI*2); c.fill();

  // Smile
  c.strokeStyle='#A06050'; c.lineWidth=1.5;
  c.beginPath(); c.arc(x,y-44+bob,5,.08,Math.PI-.08); c.stroke();

  c.restore();

  // Name tag (always correct orientation)
  const tagY = y - 75 - bob;
  const tagCol = isMe ? color : (partner?.color||'#85C1E9');
  c.fillStyle=tagCol; c.globalAlpha=.88;
  const tw = gctx.measureText(p.name).width + 16;
  rr(c,x-tw/2,tagY-14,tw,18,9); c.fill();
  c.globalAlpha=1;
  c.fillStyle='white'; c.font='bold 11px Nunito,sans-serif';
  c.textAlign='center'; c.textBaseline='middle';
  c.fillText(p.name, x, tagY-5);
  if (isMe) {
    c.fillStyle='rgba(255,255,255,.6)'; c.font='9px Nunito,sans-serif';
    c.fillText('(you)', x, tagY+6);
  }
}

// Mini-version for push arena
function drawCharMini(c,x,y,col,gender='girl',name='') {
  const g=gender;
  c.fillStyle='rgba(0,0,0,.12)'; c.beginPath(); c.ellipse(x,y+4,14,5,0,0,Math.PI*2); c.fill();
  c.fillStyle=g==='boy'?'#3050A0':'#504090'; rr(c,x-8,y-2,16,22,4); c.fill();
  c.fillStyle=col; rr(c,x-12,y-28,24,26,6); c.fill();
  c.fillStyle='#FFDAB9'; c.beginPath(); c.arc(x,y-46,15,0,Math.PI*2); c.fill();
  c.fillStyle=g==='boy'?'#306090':g==='enby'?'#806090':'#C06080';
  c.beginPath(); c.arc(x,y-54,13,Math.PI,0); c.fill(); c.beginPath(); c.arc(x-8,y-56,9,0,Math.PI*2); c.fill(); c.beginPath(); c.arc(x+8,y-56,9,0,Math.PI*2); c.fill();
  c.fillStyle='#3A2A5A'; c.beginPath(); c.arc(x-5,y-47,2.5,0,Math.PI*2); c.fill(); c.beginPath(); c.arc(x+5,y-47,2.5,0,Math.PI*2); c.fill();
  if (name) {
    c.fillStyle=col; c.globalAlpha=.85;
    const tw=c.measureText(name).width+12; rr(c,x-tw/2,y-68,tw,15,7); c.fill();
    c.globalAlpha=1; c.fillStyle='white'; c.font='bold 10px Nunito'; c.textAlign='center'; c.textBaseline='middle';
    c.fillText(name,x,y-61);
  }
}

// ═══════════════════════════════════════════════════════════════
//  PET RENDERER
// ═══════════════════════════════════════════════════════════════

function drawPet(c) {
  if (!pet) return;
  const bob = Math.sin(pet.bobOff)*4.5;
  const px=pet.x, py=pet.y+bob;
  c.save(); c.translate(px,py);
  if (pet.state==='spin') c.rotate(Math.sin(pet.animTime*.25)*.22);

  c.fillStyle='rgba(0,0,0,.07)'; c.beginPath(); c.ellipse(0,28-bob,20,7,0,0,Math.PI*2); c.fill();

  // Ghost body
  c.fillStyle='#F0EAFF';
  c.beginPath(); c.moveTo(-22,0);
  c.bezierCurveTo(-24,-32,-18,-46,0,-47);
  c.bezierCurveTo(18,-46,24,-32,22,0);
  const tw2=Math.sin(pet.tailAnim);
  c.bezierCurveTo(22+tw2*3,13,13,19,6,15);
  c.bezierCurveTo(3,10,0,20+tw2*4,-4,15);
  c.bezierCurveTo(-9,10,-15,19,-22,15);
  c.bezierCurveTo(-24+tw2*2,10,-22,0,-22,0);
  c.closePath(); c.fill();

  const gg=c.createRadialGradient(0,-18,1,0,-18,22);
  gg.addColorStop(0,'rgba(180,150,255,.3)'); gg.addColorStop(1,'rgba(180,150,255,0)');
  c.fillStyle=gg; c.beginPath(); c.arc(0,-20,22,0,Math.PI*2); c.fill();

  // Eyes
  const eH=6*(1-pet.eyeAnim);
  c.fillStyle='#5A3A9A';
  c.beginPath(); c.ellipse(-7,-27,4,Math.max(.5,eH),0,0,Math.PI*2); c.fill();
  c.beginPath(); c.ellipse( 7,-27,4,Math.max(.5,eH),0,0,Math.PI*2); c.fill();
  c.fillStyle='white';
  c.beginPath(); c.arc(-6,-29,1.5,0,Math.PI*2); c.fill();
  c.beginPath(); c.arc( 8,-29,1.5,0,Math.PI*2); c.fill();
  c.fillStyle='rgba(255,140,140,.42)';
  c.beginPath(); c.ellipse(-11,-22,5,3,0,0,Math.PI*2); c.fill();
  c.beginPath(); c.ellipse( 11,-22,5,3,0,0,Math.PI*2); c.fill();
  // Ear horns
  c.fillStyle='#E0D8FF';
  c.beginPath(); c.arc(-15,-43,6,0,Math.PI*2); c.fill();
  c.beginPath(); c.arc( 15,-43,6,0,Math.PI*2); c.fill();
  c.fillStyle='#C8B0F8';
  c.beginPath(); c.arc(-15,-43,3,0,Math.PI*2); c.fill();
  c.beginPath(); c.arc( 15,-43,3,0,Math.PI*2); c.fill();

  c.restore();

  // Name
  c.font='bold 10px Nunito'; c.textAlign='center'; c.textBaseline='middle';
  const nt = pet.name; const ntw=c.measureText(nt).width+14;
  c.fillStyle='rgba(190,150,240,.85)'; rr(c,px-ntw/2,py-65,ntw,16,8); c.fill();
  c.fillStyle='white'; c.fillText(nt,px,py-57);

  // Happiness bar
  const bw=44;
  c.fillStyle='rgba(0,0,0,.14)'; rr(c,px-bw/2,py-70,bw,5,2); c.fill();
  c.fillStyle=pet.happiness>60?'#72E480':pet.happiness>30?'#FFD93D':'#FF6B6B';
  rr(c,px-bw/2,py-70,bw*(pet.happiness/100),5,2); c.fill();
}

// ── Proximity hearts (holding hands) ─────────────────────────
function drawProximityHeart(c) {
  if (!me || !partner) return;
  const dist=Math.hypot(me.x-partner.x,me.y-partner.y);
  if (dist<70) {
    const mid={x:(me.x+partner.x)/2, y:(me.y+partner.y)/2-60};
    c.save(); c.globalAlpha=Math.max(0,(70-dist)/70)*.9;
    c.font=`${18+Math.sin(frame*.08)*3}px serif`;
    c.textAlign='center'; c.textBaseline='middle';
    c.fillText('💕',mid.x,mid.y); c.restore();
    // Dotted line between players
    c.save(); c.globalAlpha=Math.max(0,(70-dist)/70)*.3;
    c.setLineDash([4,4]); c.strokeStyle='#FF85A1'; c.lineWidth=2;
    c.beginPath(); c.moveTo(me.x,me.y-20); c.lineTo(partner.x,partner.y-20); c.stroke();
    c.restore();
  }
}

// ── Notes ─────────────────────────────────────────────────────
function drawNotes(c) {
  notes.forEach(n => {
    c.save(); c.translate(n.x,n.y); c.rotate(-.04+(n.id%7)*.025);
    c.fillStyle=n.from===myId?'#FFFACC':'#CCF0FF';
    c.shadowColor='rgba(0,0,0,.14)'; c.shadowBlur=6; c.shadowOffsetY=3;
    rr(c,-45,-35,90,70,6); c.fill(); c.shadowBlur=0; c.shadowOffsetY=0;
    c.fillStyle=n.color||'#FF5C8A'; c.beginPath(); c.arc(0,-35,5,0,Math.PI*2); c.fill();
    c.fillStyle='#5A4A10'; c.font='700 9px Nunito'; c.textAlign='center'; c.textBaseline='top';
    const words=n.text.split(' '); let line='',ly=-28;
    words.forEach(w=>{
      const t=line+w+' ';
      if (c.measureText(t).width>76&&line){c.fillText(line.trim(),0,ly);ly+=12;line=w+' ';}else line=t;
    });
    if(line)c.fillText(line.trim(),0,ly);
    c.restore();
  });
}

// ── Reactions + chat ──────────────────────────────────────────
function drawFX(c) {
  reactions.forEach(r=>{
    const t=r.age/r.maxAge;
    const a=t<.2?t/.2:t>.72?1-(t-.72)/.28:1;
    const sc=.5+t*.85;
    c.save(); c.globalAlpha=a; c.font=`${Math.floor(26*sc)}px serif`;
    c.textAlign='center'; c.textBaseline='middle'; c.fillText(r.emoji,r.x,r.y); c.restore();
  });

  chatBubs.forEach(b=>{
    const t=b.age/260;
    const a=t<.1?t/.1:t>.78?1-(t-.78)/.22:1;
    c.save(); c.globalAlpha=a;
    const bx=b.x,by=b.y;
    const tw3=Math.min(c.measureText(b.text).width+22,200),th=26;
    c.fillStyle=b.isMe?myColor:(partner?.color||'#85C1E9');
    rr(c,bx-tw3/2,by-th/2,tw3,th,13); c.fill();
    c.beginPath(); c.moveTo(bx-6,by+th/2-2); c.lineTo(bx+6,by+th/2-2); c.lineTo(bx,by+th/2+9); c.fill();
    c.fillStyle='white'; c.font='bold 11px Nunito'; c.textAlign='center'; c.textBaseline='middle';
    c.fillText(b.text.length>22?b.text.slice(0,21)+'…':b.text,bx,by);
    c.restore();
  });

  floatTexts.forEach(f=>{
    const a=1-f.age/f.maxAge;
    c.save(); c.globalAlpha=a; c.fillStyle=f.col;
    c.font='bold 16px Nunito'; c.textAlign='center'; c.textBaseline='middle';
    c.fillText(f.txt,f.x,f.y); c.restore();
  });

  particles.forEach(p=>{
    c.save(); c.globalAlpha=p.life; c.fillStyle=p.col;
    c.beginPath(); c.arc(p.x,p.y,p.r*p.life,0,Math.PI*2); c.fill(); c.restore();
  });
  confetti.forEach(cf=>{
    c.save(); c.translate(cf.x,cf.y); c.rotate(cf.rot*Math.PI/180);
    c.globalAlpha=cf.life; c.fillStyle=cf.col;
    c.fillRect(-cf.w/2,-cf.h/2,cf.w,cf.h); c.restore();
  });
}

// ═══════════════════════════════════════════════════════════════
//  MINI-GAME RENDERERS
// ═══════════════════════════════════════════════════════════════

// ── Heart collector ────────────────────────────────────────────
function renderHearts(c) {
  const bg=c.createLinearGradient(0,0,0,CH);
  bg.addColorStop(0,'#FFF0F8'); bg.addColorStop(1,'#FFE0F0');
  c.fillStyle=bg; c.fillRect(0,0,CW,CH);
  // Tile pattern
  c.fillStyle='rgba(255,133,161,.07)';
  for (let r=0;r<10;r++) for (let cl2=0;cl2<14;cl2++) { rr(c,cl2*60-5,r*62-8,52,52,8); c.fill(); }

  c.fillStyle='#FF5C8A'; c.font='bold 26px Nunito'; c.textAlign='center'; c.textBaseline='top';
  c.fillText('💕 Collect the Hearts!',CW/2,16);

  // Scores
  drawScoreBar(c, myName, MG.myScore, myColor, 50, 54);
  if (partner) drawScoreBar(c, partner.name, MG.partScore, partner.color||'#85C1E9', 50, 80);

  // Hearts
  MG.hearts.forEach(h=>{
    if (h.collected) {
      if (h.popAge>=0&&h.popAge<18) { const s=1+h.popAge*.07; c.save(); c.translate(h.x,h.y); c.scale(s,s); c.globalAlpha=1-h.popAge/18; drawLgHeart(c,0,0); c.restore(); h.popAge++; }
      return;
    }
    const bob2=Math.sin(frame*.05+h.bobOff)*4.5, pulse=1+Math.sin(frame*.08+h.bobOff)*.06;
    c.save(); c.translate(h.x,h.y+bob2); c.scale(pulse,pulse);
    // Glow
    const hgl=c.createRadialGradient(0,0,3,0,0,h.value>1?36:26);
    hgl.addColorStop(0,'rgba(255,92,138,.35)'); hgl.addColorStop(1,'rgba(255,92,138,0)');
    c.fillStyle=hgl; c.beginPath(); c.arc(0,0,h.value>1?36:26,0,Math.PI*2); c.fill();
    drawLgHeart(c,0,0,h.value>1?26:20);
    if (h.value>1) { c.fillStyle='white'; c.font='bold 11px Nunito'; c.textAlign='center'; c.textBaseline='middle'; c.fillText('×'+h.value,0,0); }
    // Sparkles
    c.fillStyle='rgba(255,200,220,.8)';
    for (let i=0;i<3;i++) { const sa=frame*.07+h.bobOff+i*2.1; c.beginPath(); c.arc(Math.cos(sa)*22,Math.sin(sa)*22,2,0,Math.PI*2); c.fill(); }
    c.restore();
  });

  if (me) drawChar(c,me,true);
  if (partner) drawChar(c,partner,false);
  drawFX(c);
}

function drawLgHeart(c,x,y,size=20) {
  const s=size/20;
  c.save(); c.translate(x,y); c.scale(s,s);
  c.fillStyle='#FF5C8A';
  c.shadowColor='rgba(255,92,138,.5)'; c.shadowBlur=9;
  c.beginPath();
  c.moveTo(0,6); c.bezierCurveTo(0,3,-4,-6,-12,-6);
  c.bezierCurveTo(-20,-6,-20,6,-20,6); c.bezierCurveTo(-20,14,-12,22,0,30);
  c.bezierCurveTo(12,22,20,14,20,6); c.bezierCurveTo(20,6,20,-6,12,-6);
  c.bezierCurveTo(4,-6,0,3,0,6); c.fill(); c.shadowBlur=0;
  c.fillStyle='rgba(255,255,255,.32)'; c.beginPath(); c.ellipse(-6,0,5,3,-.5,0,Math.PI*2); c.fill();
  c.restore();
}

function drawScoreBar(c,name,score,col,x,y) {
  c.fillStyle=col; c.globalAlpha=.82; rr(c,x,y,170,22,11); c.fill(); c.globalAlpha=1;
  c.fillStyle='white'; c.font='bold 12px Nunito'; c.textAlign='left'; c.textBaseline='middle';
  c.fillText(`${name}: ${score} pts`,x+10,y+11);
}

// ── Push arena ─────────────────────────────────────────────────
function renderPush(c) {
  const spg=c.createRadialGradient(CW/2,CH/2,40,CW/2,CH/2,500);
  spg.addColorStop(0,'#1E0A3C'); spg.addColorStop(1,'#060210');
  c.fillStyle=spg; c.fillRect(0,0,CW,CH);
  c.fillStyle='white';
  for (let s=0;s<90;s++) {
    const sx=(s*131+50)%CW, sy=(s*97+30)%CH;
    c.globalAlpha=.3+Math.sin(frame*.04+s*1.4)*.3;
    c.beginPath(); c.arc(sx,sy,.5+(s%3)*.5,0,Math.PI*2); c.fill();
  }
  c.globalAlpha=1;

  const CX=MG.pushCX, CY=MG.pushCY, R=MG.pushR;
  const igl=c.createRadialGradient(CX,CY+20,R*.25,CX,CY+20,R*1.5);
  igl.addColorStop(0,'rgba(160,80,255,.3)'); igl.addColorStop(1,'rgba(160,80,255,0)');
  c.fillStyle=igl; c.beginPath(); c.arc(CX,CY,R*1.5,0,Math.PI*2); c.fill();

  // Island
  c.fillStyle='#221648'; c.beginPath(); c.ellipse(CX,CY,R,R*.38,0,0,Math.PI*2); c.fill();
  const itg=c.createLinearGradient(CX,CY-R*.3,CX,CY+R*.15);
  itg.addColorStop(0,'#4A2A9A'); itg.addColorStop(1,'#2A1060');
  c.fillStyle=itg; c.beginPath(); c.ellipse(CX,CY-9,R,R*.36,0,0,Math.PI*2); c.fill();
  c.strokeStyle='rgba(160,100,255,.65)'; c.lineWidth=3;
  c.beginPath(); c.ellipse(CX,CY-9,R,R*.36,0,0,Math.PI*2); c.stroke();

  // Crystals
  for (let i=0;i<10;i++) {
    const a=i/10*Math.PI*2, cr=R*.74;
    const cx2=CX+Math.cos(a)*cr, cy2=CY-9+Math.sin(a)*cr*.36;
    const h=10+i%4*6;
    c.fillStyle=`hsl(${250+i*12},68%,${48+i*3}%)`; c.globalAlpha=.7;
    c.beginPath(); c.moveTo(cx2,cy2-h); c.lineTo(cx2+5,cy2); c.lineTo(cx2-5,cy2); c.fill();
  }
  c.globalAlpha=1;

  c.fillStyle='#D0A0FF'; c.font='bold 24px Nunito'; c.textAlign='center'; c.textBaseline='top';
  c.fillText('🥊 Push Arena!',CW/2,12);
  c.font='700 13px Nunito'; c.fillStyle='rgba(210,170,255,.8)';
  c.fillText('Push your partner off the island!',CW/2,44);

  if (MG.pushMe && !MG.myFell) {
    drawCharMini(c,MG.pushMe.x,MG.pushMe.y,myColor,myGender,myName+' (you)');
  } else if (MG.myFell&&MG.pushMe) {
    c.save(); c.globalAlpha=.35; c.translate(MG.pushMe.x,MG.pushMe.y+Math.min(frame*2,300));
    drawCharMini(c,0,0,myColor,myGender,'😵'); c.restore();
  }
  if (MG.pushOther&&!MG.pushOther.fell) {
    drawCharMini(c,MG.pushOther.x,MG.pushOther.y,partner?.color||'#85C1E9',partner?.gender||'girl',partner?.name||'Partner');
  }
  drawFX(c);
}

// ── Draw & guess ───────────────────────────────────────────────
function renderDraw(c) {
  c.fillStyle='rgba(255,255,255,.97)'; rr(c,24,48,CW-48,CH-96,16); c.fill();
  c.strokeStyle='#FF85A1'; c.lineWidth=3; c.stroke();

  c.drawImage(drawOff,0,0);

  if (MG.drawing&&MG.drawPath.length>1) {
    c.beginPath(); c.strokeStyle=MG.drawColor; c.lineWidth=MG.drawSz;
    c.lineCap='round'; c.lineJoin='round';
    c.moveTo(MG.drawPath[0].x,MG.drawPath[0].y);
    MG.drawPath.forEach(p=>c.lineTo(p.x,p.y)); c.stroke();
  }

  c.fillStyle='rgba(255,235,248,.97)'; rr(c,24,48,CW-48,44,16); c.fill();
  c.strokeStyle='#FF85A1'; c.lineWidth=3; c.stroke();
  c.font='bold 18px Nunito'; c.textAlign='center'; c.textBaseline='middle';
  if (MG.isDrawer) { c.fillStyle='#FF5C8A'; c.fillText(`🎨 Draw: "${MG.drawWord}"`,CW/2,70); }
  else             { c.fillStyle='#3080B0'; c.fillText(`🔍 Guess: ${MG.drawHint||'_ _ _'}`,CW/2,70); }

  // Guesses
  const baseY=CH-160;
  MG.guesses.slice(-5).forEach((g,i)=>{
    const a=i<MG.guesses.length-4?.4:1;
    c.globalAlpha=a;
    c.fillStyle=g.ok?'#72E480':g.isMe?'#FF85A1':'#85C1E9';
    const gt=c.measureText(g.text).width+20, isR=!g.isMe;
    const gx=isR?CW-55-Math.min(gt,220):55;
    rr(c,gx,baseY+i*28,Math.min(gt,220),22,11); c.fill();
    c.fillStyle='white'; c.font='bold 11px Nunito';
    c.textAlign=isR?'right':'left'; c.textBaseline='middle';
    c.fillText((g.ok?'✅ ':'')+g.text,isR?gx+Math.min(gt,220)-10:gx+10,baseY+i*28+11);
    c.globalAlpha=1;
  });

  if (MG.drawDone) {
    c.fillStyle='rgba(255,200,225,.94)'; rr(c,CW/2-170,CH/2-32,340,64,18); c.fill();
    c.strokeStyle='#FF85A1'; c.lineWidth=3; c.stroke();
    c.fillStyle='#FF5C8A'; c.font='bold 20px Nunito'; c.textAlign='center'; c.textBaseline='middle';
    c.fillText(`✅ It was "${MG.drawWord}"! Great job! 🎉`,CW/2,CH/2);
  }
  drawFX(c);
}

// ── Love quiz ──────────────────────────────────────────────────
function renderQuiz(c) {
  // Quiz has its own HTML UI, but we add a minimal bg
  c.fillStyle='rgba(60,20,100,.55)'; c.fillRect(0,0,CW,CH);
}

// ── Memory match ───────────────────────────────────────────────
function renderMemory(c) {
  const bg2=c.createLinearGradient(0,0,0,CH);
  bg2.addColorStop(0,'#E8D0F8'); bg2.addColorStop(1,'#D0E8F8');
  c.fillStyle=bg2; c.fillRect(0,0,CW,CH);

  c.fillStyle='#8040C0'; c.font='bold 24px Nunito'; c.textAlign='center'; c.textBaseline='top';
  c.fillText('🃏 Memory Match',CW/2,14);
  c.font='700 13px Nunito'; c.fillStyle='rgba(100,50,180,.8)';
  const turnName=MG.memMyTurn?myName:(partner?.name||'Partner');
  c.fillText(`${MG.memMyTurn?'Your':'Partner\'s'} turn — ${turnName} flips a card!`,CW/2,44);

  // Scores
  drawScoreBar(c,myName,MG.myScore,myColor,50,66);
  if (partner) drawScoreBar(c,partner.name,MG.partScore,partner.color||'#85C1E9',50,92);

  // Grid 4×3
  const cols=4, rows=3;
  const cw2=110, ch2=80, gapX=14, gapY=14;
  const startX=(CW-(cols*cw2+(cols-1)*gapX))/2;
  const startY=120;

  MG.memCards.forEach((card,i)=>{
    const col2=i%cols, row2=Math.floor(i/cols);
    const cx2=startX+col2*(cw2+gapX), cy2=startY+row2*(ch2+gapY);
    const matched=card.matched, revealed=card.revealed||card.matched;

    // Card shadow
    c.fillStyle='rgba(0,0,0,.1)'; rr(c,cx2+4,cy2+4,cw2,ch2,12); c.fill();

    if (revealed) {
      // Front
      c.fillStyle=matched?'rgba(120,220,140,.95)':'white';
      rr(c,cx2,cy2,cw2,ch2,12); c.fill();
      c.strokeStyle=matched?'#72E480':'rgba(160,120,220,.5)'; c.lineWidth=2.5; c.stroke();
      c.font='38px serif'; c.textAlign='center'; c.textBaseline='middle';
      c.fillText(card.emoji,cx2+cw2/2,cy2+ch2/2);
      if (matched) {
        c.font='18px serif'; c.fillText('✅',cx2+cw2-20,cy2+10);
      }
    } else {
      // Back
      const bg3=c.createLinearGradient(cx2,cy2,cx2+cw2,cy2+ch2);
      bg3.addColorStop(0,'#9060D0'); bg3.addColorStop(1,'#6040A0');
      c.fillStyle=bg3; rr(c,cx2,cy2,cw2,ch2,12); c.fill();
      // Pattern
      c.fillStyle='rgba(255,255,255,.18)';
      for (let p=0;p<4;p++) {
        const px2=cx2+10+p*24, py2=cy2+10;
        c.beginPath(); c.arc(px2,py2,5,0,Math.PI*2); c.fill();
        c.beginPath(); c.arc(px2,py2+ch2-20,5,0,Math.PI*2); c.fill();
      }
      c.font='28px serif'; c.textAlign='center'; c.textBaseline='middle';
      c.fillText('💜',cx2+cw2/2,cy2+ch2/2);
      // Clickable if my turn
      if (MG.memMyTurn) {
        c.strokeStyle='rgba(255,200,255,.6)'; c.lineWidth=2; c.stroke();
      }
    }
  });

  drawFX(c);
}

// ═══════════════════════════════════════════════════════════════
//  DRAW & GUESS — DOM INTERACTION
// ═══════════════════════════════════════════════════════════════

function initDrawUI() {
  const db=document.getElementById('draw-bar');
  const gb=document.getElementById('guess-bar');
  const mgtap=document.getElementById('mg-tap');

  if (MG.isDrawer) {
    db.style.display='flex'; gb.style.display='none';
    mgtap.style.pointerEvents='all';
    setupDrawEvents(mgtap);
  } else {
    db.style.display='none'; gb.style.display='flex';
    mgtap.style.pointerEvents='none';
    document.getElementById('guess-in').value='';
  }
}

function setupDrawEvents(el) {
  // Remove old listeners by cloning
  const fresh=el.cloneNode(true);
  el.parentNode.replaceChild(fresh,el);
  const mgTap=document.getElementById('mg-tap');

  function evPos(e) {
    const rect=mgTap.getBoundingClientRect();
    const ex=e.touches?e.touches[0].clientX:e.clientX;
    const ey=e.touches?e.touches[0].clientY:e.clientY;
    return { x:(ex-rect.left)/scale, y:(ey-rect.top)/scale };
  }

  mgTap.addEventListener('mousedown', e=>{
    if (!MG.active||MG.type!=='draw_guess'||!MG.isDrawer) return;
    MG.drawing=true; const p=evPos(e); MG.drawPath=[p];
    drawOffCtx.beginPath(); drawOffCtx.moveTo(p.x,p.y);
  });
  mgTap.addEventListener('mousemove', e=>{
    if (!MG.drawing||!MG.isDrawer) return;
    const p=evPos(e); MG.drawPath.push(p); applyStroke(p);
  });
  mgTap.addEventListener('mouseup', endStroke);
  mgTap.addEventListener('touchstart', e=>{ e.preventDefault(); if(!MG.active||MG.type!=='draw_guess'||!MG.isDrawer) return; MG.drawing=true; const p=evPos(e); MG.drawPath=[p]; drawOffCtx.beginPath(); drawOffCtx.moveTo(p.x,p.y); },{passive:false});
  mgTap.addEventListener('touchmove', e=>{ e.preventDefault(); if(!MG.drawing||!MG.isDrawer) return; const p=evPos(e); MG.drawPath.push(p); applyStroke(p); },{passive:false});
  mgTap.addEventListener('touchend', endStroke);
}

function applyStroke(p) {
  drawOffCtx.lineTo(p.x,p.y);
  drawOffCtx.strokeStyle=MG.drawColor;
  drawOffCtx.lineWidth=MG.drawSz;
  drawOffCtx.lineCap='round'; drawOffCtx.lineJoin='round';
  drawOffCtx.stroke();
}

function endStroke() {
  if (!MG.drawing) return;
  MG.drawing=false;
  if (MG.drawPath.length>1) {
    const stroke={color:MG.drawColor,size:MG.drawSz,pts:[...MG.drawPath]};
    wsend({type:'mg',action:'stroke',stroke});
  }
  MG.drawPath=[];
}

function renderStroke(s) {
  if (!s||!s.pts||s.pts.length<2) return;
  drawOffCtx.beginPath();
  drawOffCtx.strokeStyle=s.color; drawOffCtx.lineWidth=s.size;
  drawOffCtx.lineCap='round'; drawOffCtx.lineJoin='round';
  drawOffCtx.moveTo(s.pts[0].x,s.pts[0].y);
  s.pts.forEach(p=>drawOffCtx.lineTo(p.x,p.y));
  drawOffCtx.stroke();
}

// ═══════════════════════════════════════════════════════════════
//  LOVE QUIZ — DOM UI
// ═══════════════════════════════════════════════════════════════

function showQuizUI() {
  const ui=document.getElementById('quiz-ui');
  ui.style.display='flex';
  document.getElementById('quiz-prog').textContent=`Question ${MG.quizQI} / ${MG.quizTotal}`;
  document.getElementById('quiz-q-text').textContent=MG.quizQ;
  document.getElementById('quiz-wait').style.display='none';

  const opts=document.getElementById('quiz-opts');
  opts.innerHTML='';
  MG.quizOpts.forEach((opt,i)=>{
    const btn=document.createElement('button');
    btn.className='quiz-opt';
    btn.textContent=opt;
    btn.onclick=()=>{
      if (MG.quizChosen!==-1) return;
      MG.quizChosen=i;
      document.querySelectorAll('.quiz-opt').forEach(b=>b.classList.remove('chosen'));
      btn.classList.add('chosen');
      wsend({type:'mg',action:'answer',idx:i});
      document.getElementById('quiz-wait').style.display='block';
    };
    opts.appendChild(btn);
  });
}

function updateQuizWait() {
  document.getElementById('quiz-wait').style.display='block';
}

function showQuizReveal(match, ans, opts) {
  document.getElementById('quiz-wait').style.display='none';
  const btns=document.querySelectorAll('.quiz-opt');
  const myAns=ans[myId];
  const partAns=ans[partner?.id||''];
  btns.forEach((btn,i)=>{
    if (i===myAns&&i===partAns) btn.classList.add('match-yes');
    else if (i===myAns||i===partAns) btn.classList.add('match-no');
  });
  // Show result bubble
  const w=document.getElementById('quiz-wait');
  w.style.display='block';
  w.textContent=match?'💕 You both matched! +12 pts each!':'💔 Different answers… +4 pts each';
  w.style.color=match?'#2E8B57':'#C0392B';
}

// ═══════════════════════════════════════════════════════════════
//  MEMORY MATCH — TAP HANDLER
// ═══════════════════════════════════════════════════════════════

function setupMemoryTap() {
  const mgTap=document.getElementById('mg-tap');
  mgTap.onclick=e=>{
    if (MG.type!=='memory_match'||!MG.memMyTurn) return;
    const rect=mgTap.getBoundingClientRect();
    const mx=(e.clientX-rect.left)/scale, my=(e.clientY-rect.top)/scale;
    // Find which card
    const cols=4, cw2=110, ch2=80, gapX=14, gapY=14;
    const startX=(CW-(cols*cw2+(cols-1)*gapX))/2;
    const startY=120;
    MG.memCards.forEach((card,i)=>{
      const col2=i%cols, row2=Math.floor(i/cols);
      const cx2=startX+col2*(cw2+gapX), cy2=startY+row2*(ch2+gapY);
      if (mx>=cx2&&mx<=cx2+cw2&&my>=cy2&&my<=cy2+ch2&&!card.revealed&&!card.matched) {
        wsend({type:'mg',action:'flip',id:card.id});
      }
    });
  };
}

// ═══════════════════════════════════════════════════════════════
//  MAIN LOOP
// ═══════════════════════════════════════════════════════════════

function loop() {
  frame++;
  requestAnimationFrame(loop);

  if (appState==='world'||appState==='countdown') {
    updateMyPlayer(); lerpPartner(); updatePet(); updateFX();
    gctx.clearRect(0,0,CW,CH);
    drawWorld(gctx); drawNotes(gctx);
    if (pet) drawPet(gctx);
    [me,partner].filter(Boolean).sort((a,b)=>a.y-b.y).forEach(p=>drawChar(gctx,p,p===me));
    drawProximityHeart(gctx);
    drawFX(gctx);
    if (appState==='countdown') { gctx.fillStyle='rgba(20,6,40,.22)'; gctx.fillRect(0,0,CW,CH); }
  }

  if (appState==='minigame') {
    updateFX();
    mgctx.clearRect(0,0,CW,CH);
    if (MG.type==='heart_collector') { updateMyPlayer(); checkHearts(); renderHearts(mgctx); }
    if (MG.type==='push_arena')      { updatePush();     renderPush(mgctx); }
    if (MG.type==='draw_guess')      { renderDraw(mgctx); }
    if (MG.type==='love_quiz')       { renderQuiz(mgctx); }
    if (MG.type==='memory_match')    { renderMemory(mgctx); }
  }
}

// ═══════════════════════════════════════════════════════════════
//  INPUT SETUP
// ═══════════════════════════════════════════════════════════════

function setupInput() {
  document.addEventListener('keydown', e=>{
    keys[e.key.toLowerCase()]=true;
    if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key.toLowerCase())) e.preventDefault();
  });
  document.addEventListener('keyup', e=>{ keys[e.key.toLowerCase()]=false; });

  // ── Joystick ────────────────────────────────────────────────
  const joyEl=document.getElementById('joystick');
  const joyKnob=document.getElementById('joy-knob');
  function joyStart(e) {
    e.preventDefault(); touch.active=true;
    const r=joyEl.getBoundingClientRect();
    touch.bx=r.left+r.width/2; touch.by=r.top+r.height/2;
    joyMove(e);
  }
  function joyMove(e) {
    const t=e.touches?e.touches[0]:e;
    const dx=t.clientX-touch.bx, dy=t.clientY-touch.by;
    const len=Math.min(Math.sqrt(dx*dx+dy*dy),34);
    const ang=Math.atan2(dy,dx);
    touch.dx=Math.cos(ang)*(len/34); touch.dy=Math.sin(ang)*(len/34);
    joyKnob.style.transform=`translate(calc(-50% + ${Math.cos(ang)*len}px),calc(-50% + ${Math.sin(ang)*len}px))`;
  }
  function joyEnd() { touch.active=false; touch.dx=0; touch.dy=0; joyKnob.style.transform='translate(-50%,-50%)'; }
  joyEl.addEventListener('touchstart', joyStart,{passive:false});
  document.addEventListener('touchmove', e=>{ if(touch.active) joyMove(e); },{passive:false});
  document.addEventListener('touchend', joyEnd);
  document.addEventListener('touchcancel', joyEnd);

  // ── Reactions ───────────────────────────────────────────────
  document.querySelectorAll('.rb').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const e=btn.dataset.e;
      wsend({type:'react',emoji:e});
      if (me) spawnReact(me.x,me.y-44,e);
      playTone(660,.05,.15);
    });
  });

  // ── Chat ─────────────────────────────────────────────────────
  const chatOv=document.getElementById('chat-ov');
  const chatIn=document.getElementById('chat-in');
  document.getElementById('tb-chat').addEventListener('click',()=>{ chatOv.classList.add('open'); chatIn.focus(); });
  document.getElementById('chat-close').addEventListener('click',()=>chatOv.classList.remove('open'));
  function sendChat() {
    const t=chatIn.value.trim(); if(!t) return;
    wsend({type:'chat',text:t});
    if (me) chatBubs.push({x:me.x,y:me.y-72,text:t,age:0,isMe:true});
    chatIn.value=''; chatOv.classList.remove('open');
  }
  document.getElementById('chat-send').addEventListener('click',sendChat);
  chatIn.addEventListener('keydown',e=>{ if(e.key==='Enter'){e.preventDefault();sendChat();} });

  // ── Notes ────────────────────────────────────────────────────
  const noteOv=document.getElementById('note-ov');
  const noteTa=document.getElementById('note-ta');
  document.getElementById('tb-note').addEventListener('click',()=>{ noteOv.classList.add('open'); noteTa.focus(); });
  document.getElementById('note-close').addEventListener('click',()=>noteOv.classList.remove('open'));
  document.getElementById('note-x').addEventListener('click',()=>noteOv.classList.remove('open'));
  document.getElementById('note-ok').addEventListener('click',()=>{
    const t=noteTa.value.trim(); if(!t) return;
    const nx=me?me.x+(Math.random()-.5)*100:200+Math.random()*400;
    const ny=me?me.y+(Math.random()-.5)*60:200+Math.random()*200;
    wsend({type:'note',text:t,x:nx,y:ny});
    noteTa.value=''; noteOv.classList.remove('open');
    playTone(880,.06,.18);
  });

  // ── Pet panel ─────────────────────────────────────────────────
  const petOv=document.getElementById('pet-ov');
  document.getElementById('tb-pet').addEventListener('click',()=>{
    petOv.classList.add('open');
    updatePetPanel();
  });
  document.getElementById('pet-close').addEventListener('click',()=>petOv.classList.remove('open'));
  document.getElementById('pet-x').addEventListener('click',()=>petOv.classList.remove('open'));
  document.getElementById('btn-pet-pet').addEventListener('click',()=>{
    wsend({type:'pet',action:'pet'});
    playTone(880,.07,.18);
    toast('🐾 You petted the pet!');
    updatePetPanel();
  });
  document.getElementById('btn-pet-rename').addEventListener('click',()=>{
    const rw=document.getElementById('rename-wrap');
    rw.style.display=rw.style.display==='none'?'block':'none';
    if (rw.style.display==='block') document.getElementById('rename-in').focus();
  });
  document.getElementById('btn-rename-ok').addEventListener('click',()=>{
    const n=document.getElementById('rename-in').value.trim(); if(!n) return;
    wsend({type:'pet',action:'rename',name:n});
    document.getElementById('rename-in').value='';
    document.getElementById('rename-wrap').style.display='none';
    playChime();
  });

  // ── Hug button ────────────────────────────────────────────────
  document.getElementById('tb-hug').addEventListener('click',()=>{
    wsend({type:'react',emoji:'🤗'});
    if (me) spawnReact(me.x,me.y-50,'🤗');
    spawnHeartBurst(me?.x||400,me?.y||400,3);
    playChime([660,880,1047],80);
    toast('🤗 Virtual hug sent!');
  });

  // ── Canvas pet tap ────────────────────────────────────────────
  gc.addEventListener('click',e=>{
    if (appState!=='world'||!pet) return;
    const rect=gc.getBoundingClientRect();
    const cx=(e.clientX-rect.left)/scale, cy=(e.clientY-rect.top)/scale;
    if (Math.hypot(cx-pet.x,cy-pet.y)<45) {
      wsend({type:'pet',action:'pet'});
      spawnReact(pet.x,pet.y-52,'💕');
      playTone(880,.06,.18);
    }
  });

  // ── Draw controls ─────────────────────────────────────────────
  document.querySelectorAll('.dsw').forEach(sw=>{
    sw.addEventListener('click',()=>{
      document.querySelectorAll('.dsw').forEach(s=>s.classList.remove('sel'));
      sw.classList.add('sel');
      MG.drawColor=sw.dataset.c;
    });
  });
  document.getElementById('draw-sz').addEventListener('input',e=>{ MG.drawSz=+e.target.value; });
  document.getElementById('draw-clear').addEventListener('click',()=>{
    drawOffCtx.clearRect(0,0,CW,CH); MG.strokes=[];
    wsend({type:'mg',action:'clear'});
  });

  // ── Guess ──────────────────────────────────────────────────────
  const guessIn=document.getElementById('guess-in');
  const guessSend=document.getElementById('guess-send');
  function submitGuess() {
    const t=guessIn.value.trim(); if(!t) return;
    wsend({type:'mg',action:'guess',text:t});
    guessIn.value='';
  }
  guessSend.addEventListener('click',submitGuess);
  guessIn.addEventListener('keydown',e=>{ if(e.key==='Enter'){e.preventDefault();submitGuess();} });
}

// ── Pet panel helper ──────────────────────────────────────────
function updatePetPanel() {
  if (!pet) return;
  document.getElementById('pet-hap-fill').style.width=pet.happiness+'%';
  // Mini preview on panel canvas
  const pc=document.getElementById('pet-preview');
  const pctx=pc.getContext('2d');
  pctx.clearRect(0,0,100,120);
  pctx.save(); pctx.translate(50,70);
  // Simplified ghost
  pctx.fillStyle='#F0EAFF'; pctx.beginPath(); pctx.arc(0,-12,28,0,Math.PI*2); pctx.fill();
  pctx.fillStyle='#5A3A9A'; pctx.beginPath(); pctx.arc(-9,-16,4,0,Math.PI*2); pctx.fill();
  pctx.beginPath(); pctx.arc(9,-16,4,0,Math.PI*2); pctx.fill();
  pctx.fillStyle='rgba(255,140,140,.45)';
  pctx.beginPath(); pctx.ellipse(-13,-10,6,4,0,0,Math.PI*2); pctx.fill();
  pctx.beginPath(); pctx.ellipse(13,-10,6,4,0,0,Math.PI*2); pctx.fill();
  pctx.fillStyle='#F0EAFF'; pctx.beginPath(); pctx.arc(-15,-18,7,0,Math.PI*2); pctx.fill(); pctx.beginPath(); pctx.arc(15,-18,7,0,Math.PI*2); pctx.fill();
  pctx.restore();
}

// ═══════════════════════════════════════════════════════════════
//  AVATAR PREVIEW (gender selection screen)
// ═══════════════════════════════════════════════════════════════

function drawAvatarPreview(id, gender, col) {
  const cv=document.getElementById(id);
  if (!cv) return;
  const c=cv.getContext('2d');
  c.clearRect(0,0,80,110);
  const x=40, y=80;
  c.fillStyle='rgba(0,0,0,.08)'; c.beginPath(); c.ellipse(x,y+4,13,4,0,0,Math.PI*2); c.fill();
  // Legs
  c.fillStyle=gender==='boy'?'#3050A0':'#504090';
  c.fillRect(x-9,y-2,8,20); c.fillRect(x+1,y-2,8,20);
  // Body
  c.fillStyle=col||'#FF85A1'; rr(c,x-11,y-28,22,26,6); c.fill();
  // Neck
  c.fillStyle='#FFDAB9'; c.fillRect(x-4,y-34,8,7);
  // Head
  c.fillStyle='#FFDAB9'; c.beginPath(); c.arc(x,y-44,15,0,Math.PI*2); c.fill();
  // Hair
  const hairs={girl:['#C06080','#E080A0'],boy:['#306090','#4080C0'],enby:['#806090','#B090C0']};
  const [hm]=hairs[gender]||hairs.girl;
  c.fillStyle=hm;
  c.beginPath(); c.arc(x,y-52,13,Math.PI,0); c.fill();
  c.beginPath(); c.arc(x-8,y-54,8,0,Math.PI*2); c.fill();
  c.beginPath(); c.arc(x+8,y-54,7,0,Math.PI*2); c.fill();
  if (gender==='girl') {
    c.fillStyle='#FF85A1';
    c.beginPath(); c.ellipse(x+7,y-60,7,4,-.6,0,Math.PI*2); c.fill();
    c.beginPath(); c.ellipse(x+7,y-60,7,4,.6,0,Math.PI*2); c.fill();
    c.fillStyle='#FF5C8A'; c.beginPath(); c.arc(x+7,y-60,3,0,Math.PI*2); c.fill();
  }
  // Eyes
  c.fillStyle='#3A2A5A';
  c.beginPath(); c.arc(x-5,y-45,2.5,0,Math.PI*2); c.fill();
  c.beginPath(); c.arc(x+5,y-45,2.5,0,Math.PI*2); c.fill();
  c.fillStyle='rgba(255,140,140,.4)';
  c.beginPath(); c.ellipse(x-10,y-41,4.5,2.5,0,0,Math.PI*2); c.fill();
  c.beginPath(); c.ellipse(x+10,y-41,4.5,2.5,0,0,Math.PI*2); c.fill();
}

// ═══════════════════════════════════════════════════════════════
//  MENU & NAVIGATION
// ═══════════════════════════════════════════════════════════════

function showErr(msg) {
  const el=document.getElementById('menu-err');
  if (!el) return; el.textContent=msg; el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),4000);
}

function toast(msg) {
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),3500);
}

function setupMenuButtons() {
  // Create room
  document.getElementById('btn-create').addEventListener('click',()=>{
    const name=document.getElementById('in-name').value.trim();
    if (!name) { showErr('Please enter your name! 😊'); return; }
    myName=name; pendingAction='create';
    showScreen('gender');
    drawAvatarPreview('av-girl','girl',myColor);
    drawAvatarPreview('av-boy','boy','#85C1E9');
    drawAvatarPreview('av-enby','enby','#C97EE8');
    initAudio();
  });

  // Join room
  document.getElementById('btn-join').addEventListener('click',()=>{
    const name=document.getElementById('in-name').value.trim();
    const code=document.getElementById('in-code').value.trim().toUpperCase();
    if (!name) { showErr('Please enter your name! 😊'); return; }
    if (code.length!==4) { showErr('Please enter the 4-letter room code!'); return; }
    myName=name; pendingAction='join';
    showScreen('gender');
    drawAvatarPreview('av-girl','girl',myColor);
    drawAvatarPreview('av-boy','boy','#85C1E9');
    drawAvatarPreview('av-enby','enby','#C97EE8');
    initAudio();
  });

  // Gender selection
  document.querySelectorAll('.gender-opt').forEach(opt=>{
    opt.addEventListener('click',()=>{
      document.querySelectorAll('.gender-opt').forEach(o=>o.classList.remove('selected'));
      opt.classList.add('selected');
      myGender=opt.dataset.g;
    });
  });

  // Color pick
  document.querySelectorAll('.cpick').forEach(cp=>{
    cp.addEventListener('click',()=>{
      document.querySelectorAll('.cpick').forEach(c=>c.classList.remove('sel'));
      cp.classList.add('sel');
      myColor=cp.dataset.c;
      // Redraw avatar
      drawAvatarPreview('av-'+myGender, myGender, myColor);
    });
  });

  // Gender confirm
  document.getElementById('btn-gender-ok').addEventListener('click',()=>{
    initAudio();
    if (pendingAction==='create') {
      connectWS(()=>wsend({type:'create',name:myName,gender:myGender,color:myColor}));
    } else {
      const code=document.getElementById('in-code').value.trim().toUpperCase();
      connectWS(()=>wsend({type:'join',name:myName,gender:myGender,color:myColor,code}));
    }
  });

  document.getElementById('btn-gender-back').addEventListener('click',()=>showScreen('menu'));

  // Waiting screen
  document.getElementById('btn-copy').addEventListener('click',()=>{
    const url=`${location.origin}?r=${document.getElementById('disp-code').textContent}`;
    navigator.clipboard?.writeText(url).then(()=>{
      document.getElementById('btn-copy').textContent='✅ Copied!';
      setTimeout(()=>{document.getElementById('btn-copy').textContent='📋 Copy link';},2200);
    }).catch(()=>{ alert(`Share this code: ${document.getElementById('disp-code').textContent}`); });
  });

  document.getElementById('btn-wait-back').addEventListener('click',()=>{
    ws?.close(); showScreen('menu');
  });

  // Auto-fill from URL
  const rp=new URLSearchParams(location.search).get('r')||new URLSearchParams(location.search).get('room');
  if (rp) document.getElementById('in-code').value=rp.toUpperCase().slice(0,4);

  // Memory tap setup (lazy, called when minigame begins)
  setupMemoryTap();
}

// ═══════════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════════

setupCanvas();
setupInput();
setupMenuButtons();
requestAnimationFrame(loop);

console.log('💕 CHAOS DATE v2.0 — ready!');
