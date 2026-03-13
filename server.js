// ════════════════════════════════════════════════════════════════
//  💕 CHAOS DATE  —  Production WebSocket Server  v2.0
//  5 mini-games · pet system · love meter · stable state machine
// ════════════════════════════════════════════════════════════════
'use strict';

const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');
const path      = require('path');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });
app.use(express.static(path.join(__dirname, 'public')));

// ── Room store ─────────────────────────────────────────────────
const rooms = new Map();

function genCode() {
  const C = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += C[Math.floor(Math.random() * C.length)];
  return rooms.has(s) ? genCode() : s;
}

// ── Helpers ────────────────────────────────────────────────────
const tx  = (ws, m) => ws.readyState === 1 && ws.send(JSON.stringify(m));
const bc  = (r, m, excl) => r.players.forEach(p => p.ws !== excl && tx(p.ws, m));
const bca = (r, m) => bc(r, m, null);

// ── Mini-game catalog ──────────────────────────────────────────
const MG_POOL   = ['heart_collector','push_arena','draw_guess','love_quiz','memory_match'];
const MG_NAMES  = {
  heart_collector: '💕 Heart Collector',
  push_arena:      '🥊 Push Arena',
  draw_guess:      '🎨 Draw & Guess',
  love_quiz:       '💌 Love Quiz',
  memory_match:    '🃏 Memory Match',
};

const DRAW_WORDS = [
  'cat','dog','pizza','rainbow','star','moon','flower','cake','cloud','heart',
  'house','tree','fish','sun','butterfly','balloon','castle','dragon','crown',
  'diamond','rocket','penguin','donut','guitar','umbrella','beach','coffee',
  'mountain','airplane','lighthouse','cactus','jellyfish','mushroom','watermelon'
];

const QUIZ_QS = [
  { q:'🍕 Favourite pizza topping?',       a:['🧀 All cheese','🌶️ Loaded toppings'] },
  { q:'⏰ Are you a morning or night person?', a:['🌞 Rise & shine','🌙 Night owl forever'] },
  { q:'❄️ Hot or cold weather?',           a:['❄️ Cosy cold','🔥 Warm sunshine'] },
  { q:'🎬 Movie night pick?',              a:['😂 Comedy','💕 Romance'] },
  { q:'🐾 Team cat or dog?',              a:['🐱 Cats','🐶 Dogs'] },
  { q:'🌍 Dream vacation?',               a:['🏖️ Beach','🏔️ Mountains'] },
  { q:'☕ Hot drink of choice?',          a:['☕ Coffee','🍵 Tea'] },
  { q:'🎵 Vibe right now?',              a:['🎸 Loud & hype','🎻 Chill & soft'] },
  { q:'🍫 Chocolate preference?',         a:['🍫 Dark chocolate','🍬 Milk/White'] },
  { q:'🛌 Which side of the bed?',        a:['⬅️ Left side','➡️ Right side'] },
  { q:'📺 Binge preference?',            a:['📺 Series marathon','🎬 One great movie'] },
  { q:'❤️ Love language?',               a:['🤗 Physical touch','💬 Sweet words'] },
  { q:'🎮 Game night style?',            a:['🃏 Board games','🕹️ Video games'] },
  { q:'🌮 vs 🍣 for dinner?',           a:['🌮 Tacos all day','🍣 Sushi please'] },
  { q:'💐 Flowers or 🎂 cake as gift?',  a:['💐 Flowers','🎂 Dessert'] },
  { q:'📱 Social media habit?',          a:['📱 Always scrolling','📵 Minimal user'] },
  { q:'🚿 Shower time?',                a:['🌅 Morning shower','🌃 Night shower'] },
  { q:'👫 Date night style?',           a:['🏠 Cosy night in','🌃 Out on the town'] },
];

const MEM_EMOJIS = ['💕','🌟','🎀','🦋','🌈','🍓','🌙','🎵','🌸','🦊','🍀','🎉'];

// ── Room factory ───────────────────────────────────────────────
function mkRoom(code) {
  return {
    code, players: [], state: 'waiting',
    pet: { x: 410, y: 360, name: 'Noodle', happiness: 60 },
    notes: [], loveMeter: 0,
    lastMG: '', mg: null, mgTimer: null, mgNext: 0
  };
}

const WORLD_WAIT = 60000; // ms between mini-games

function scheduleMG(room) {
  clearTimeout(room.mgTimer);
  room.mgNext  = Date.now() + WORLD_WAIT;
  room.mgTimer = setTimeout(() => {
    if (room.players.length === 2 && room.state === 'world') launchMG(room);
  }, WORLD_WAIT);
}

function launchMG(room) {
  const pool = MG_POOL.filter(t => t !== room.lastMG);
  const type = pool[Math.floor(Math.random() * pool.length)];
  room.lastMG = type;
  room.state  = 'countdown';
  room.mg     = { type, state: 'countdown', scores: {}, data: {}, timers: [] };
  room.players.forEach(p => { room.mg.scores[p.id] = 0; });
  bca(room, { type: 'mg_start', game: type, name: MG_NAMES[type] });

  room.mg.timers.push(setTimeout(() => {
    if (!room.mg) return;
    room.mg.state = 'playing';
    room.state    = 'minigame';
    bca(room, { type: 'mg_playing', game: type });
    initMG(room, type);
  }, 3600));
}

function initMG(room, type) {
  const mg = room.mg;

  if (type === 'heart_collector') {
    const hearts = Array.from({ length: 14 }, (_, i) => ({
      id: i, x: 70 + Math.random()*660, y: 130+Math.random()*440,
      collected: false, value: Math.random()<0.12 ? 3 : Math.random()<0.25 ? 2 : 1
    }));
    mg.data.hearts = hearts;
    bca(room, { type: 'hearts_spawned', hearts });
    mg.timers.push(setTimeout(() => endMG(room), 30000));
  }

  if (type === 'push_arena') {
    const pos = {};
    room.players.forEach((p, i) => { pos[p.id] = { x: 300 + i*200, y: 320 }; });
    mg.data.push = pos;
    bca(room, { type: 'push_init', positions: pos });
    mg.timers.push(setTimeout(() => endMG(room), 45000));
  }

  if (type === 'draw_guess') {
    const di   = Math.floor(Math.random() * room.players.length);
    const draw = room.players[di];
    const gues = room.players[1 - di];
    const word = DRAW_WORDS[Math.floor(Math.random() * DRAW_WORDS.length)];
    mg.data    = { drawer: draw.id, guesser: gues.id, word, tries: 0 };
    tx(draw.ws, { type: 'draw_role', role: 'drawer', word });
    tx(gues.ws, { type: 'draw_role', role: 'guesser', blank: word.replace(/\S/g,'_') });
    mg.timers.push(setTimeout(() => endMG(room), 60000));
  }

  if (type === 'love_quiz') {
    const qs = [...QUIZ_QS].sort(() => Math.random()-0.5).slice(0, 6);
    mg.data  = { qs, qi: 0, ans: {}, roundScores: {} };
    room.players.forEach(p => { mg.data.ans[p.id] = null; });
    pushQuizQ(room);
    mg.timers.push(setTimeout(() => endMG(room), 70000));
  }

  if (type === 'memory_match') {
    const em  = [...MEM_EMOJIS].sort(() => Math.random()-0.5).slice(0,6);
    const cards = [...em, ...em].sort(() => Math.random()-0.5)
      .map((e, i) => ({ id: i, emoji: e, revealed: false, matched: false }));
    mg.data = { cards, flipped: [], turn: room.players[0].id, pairs: 0 };
    bca(room, { type: 'mem_init', hidden: cards.map(c=>({id:c.id})), turn: mg.data.turn });
    mg.timers.push(setTimeout(() => endMG(room), 90000));
  }
}

function pushQuizQ(room) {
  const mg = room.mg;
  const qi = mg.data.qi;
  if (qi >= mg.data.qs.length) { endMG(room); return; }
  room.players.forEach(p => { mg.data.ans[p.id] = null; });
  const q = mg.data.qs[qi];
  bca(room, { type: 'quiz_q', qi, total: mg.data.qs.length, q: q.q, a: q.a });
}

function endMG(room) {
  if (!room.mg) return;
  room.mg.timers.forEach(clearTimeout);
  const { scores } = room.mg;
  const sorted  = Object.entries(scores).sort((a,b)=>b[1]-a[1]);
  const winner  = sorted.length && sorted[0][1]>0 ? sorted[0][0] : null;
  room.mg   = null;
  room.state = 'world';
  bca(room, { type: 'mg_end', scores, winner });
  scheduleMG(room);
}

// ── WebSocket handler ──────────────────────────────────────────
let pid = 0;
wss.on('connection', ws => {
  let room = null, player = null;

  const self = () => player;

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }

    switch (m.type) {

      // ── CREATE ─────────────────────────────────────
      case 'create': {
        const code = genCode();
        room   = mkRoom(code);
        rooms.set(code, room);
        player = { id:'P'+(++pid), ws, name:m.name||'P1', gender:m.gender||'girl',
                   avatar:m.avatar||0, color:m.color||'#FF85A1', x:270,y:450,facing:'right' };
        room.players.push(player);
        tx(ws, { type:'created', code, playerId:player.id, idx:0 });
        break;
      }

      // ── JOIN ───────────────────────────────────────
      case 'join': {
        const r = rooms.get((m.code||'').toUpperCase().trim());
        if (!r)                   { tx(ws,{type:'err',msg:'🔍 Room not found!'}); return; }
        if (r.players.length>=2)  { tx(ws,{type:'err',msg:'🚫 Room is full!'}); return; }
        room   = r;
        player = { id:'P'+(++pid), ws, name:m.name||'P2', gender:m.gender||'boy',
                   avatar:m.avatar||0, color:m.color||'#85C1E9', x:530,y:450,facing:'left' };
        room.players.push(player);
        const p1 = room.players[0];
        const snap = p => ({id:p.id,name:p.name,gender:p.gender,avatar:p.avatar,x:p.x,y:p.y,color:p.color});
        tx(ws, { type:'joined', code:room.code, playerId:player.id, idx:1,
                 partner:snap(p1), pet:room.pet, notes:room.notes, loveMeter:room.loveMeter });
        tx(p1.ws, { type:'partner_joined', partner:snap(player) });
        room.state = 'world';
        bca(room, { type:'game_start', pet:room.pet, notes:room.notes, loveMeter:room.loveMeter });
        scheduleMG(room);
        break;
      }

      // ── WORLD ──────────────────────────────────────
      case 'move':
        if (!player||!room) return;
        player.x=m.x; player.y=m.y; player.facing=m.facing;
        bc(room,{type:'move',id:player.id,x:m.x,y:m.y,facing:m.facing,anim:m.anim,sit:m.sit},ws);
        break;

      case 'react':
        if (!player||!room) return;
        bca(room,{type:'react',from:player.id,emoji:m.emoji});
        break;

      case 'chat':
        if (!player||!room) return;
        bca(room,{type:'chat',from:player.id,text:String(m.text||'').slice(0,130)});
        break;

      case 'note':
        if (!player||!room) return;
        const note={id:Date.now(),text:String(m.text||'').slice(0,100),
                    x:m.x,y:m.y,color:player.color,from:player.id};
        room.notes.push(note);
        if (room.notes.length>24) room.notes.shift();
        bca(room,{type:'note_added',note});
        break;

      case 'pet':
        if (!player||!room) return;
        if (m.action==='pet') {
          room.pet.happiness = Math.min(100, room.pet.happiness+10);
          room.loveMeter     = Math.min(100, room.loveMeter+2);
          bca(room,{type:'pet_update',happiness:room.pet.happiness,by:player.id});
          bca(room,{type:'love',meter:room.loveMeter});
        }
        if (m.action==='rename' && m.name) {
          room.pet.name = String(m.name).slice(0,16);
          bca(room,{type:'pet_renamed',name:room.pet.name});
        }
        break;

      case 'love_boost':
        if (!player||!room) return;
        room.loveMeter = Math.min(100,room.loveMeter+4);
        bca(room,{type:'love',meter:room.loveMeter});
        break;

      case 'timer_req':
        if (!room) return;
        tx(ws,{type:'timer_sync',remaining:Math.max(0,Math.ceil((room.mgNext-Date.now())/1000))});
        break;

      // ── MINI-GAME ACTIONS ──────────────────────────
      case 'mg': {
        if (!player||!room||!room.mg||room.mg.state!=='playing') return;
        const mg = room.mg;
        const act = m.action;

        // Heart collector
        if (mg.type==='heart_collector' && act==='collect') {
          const h = mg.data.hearts?.find(h=>h.id===m.id&&!h.collected);
          if (!h) return;
          h.collected=true;
          mg.scores[player.id]=(mg.scores[player.id]||0)+h.value;
          room.loveMeter=Math.min(100,room.loveMeter+1);
          bca(room,{type:'heart_taken',id:h.id,by:player.id,scores:mg.scores});
          bca(room,{type:'love',meter:room.loveMeter});
          if (mg.data.hearts.every(h=>h.collected)) {
            mg.timers.forEach(clearTimeout); mg.timers=[];
            mg.timers.push(setTimeout(()=>endMG(room),900));
          }
        }

        // Push arena
        if (mg.type==='push_arena') {
          if (act==='push') bc(room,{type:'push_hit',from:player.id,dx:m.dx,dy:m.dy},ws);
          if (act==='fell') {
            const other=room.players.find(p=>p.id!==player.id);
            if (other) mg.scores[other.id]=(mg.scores[other.id]||0)+15;
            bca(room,{type:'player_fell',id:player.id});
            mg.timers.forEach(clearTimeout); mg.timers=[];
            mg.timers.push(setTimeout(()=>endMG(room),2000));
          }
        }

        // Draw & guess
        if (mg.type==='draw_guess') {
          if (act==='stroke') bc(room,{type:'draw_stroke',stroke:m.stroke},ws);
          if (act==='clear')  bc(room,{type:'draw_clear'},ws);
          if (act==='guess') {
            const ok = String(m.text||'').toLowerCase().trim()===mg.data.word.toLowerCase();
            mg.data.tries++;
            bca(room,{type:'guess_res',from:player.id,text:m.text,ok,word:ok?mg.data.word:undefined});
            if (ok) {
              mg.scores[player.id]       =(mg.scores[player.id]||0)+10+Math.max(0,8-mg.data.tries);
              mg.scores[mg.data.drawer]  =(mg.scores[mg.data.drawer]||0)+8;
              room.loveMeter=Math.min(100,room.loveMeter+8);
              bca(room,{type:'love',meter:room.loveMeter});
              mg.timers.forEach(clearTimeout); mg.timers=[];
              mg.timers.push(setTimeout(()=>endMG(room),2200));
            }
          }
        }

        // Love quiz
        if (mg.type==='love_quiz' && act==='answer') {
          if (mg.data.ans[player.id]!==null) return;
          mg.data.ans[player.id]=m.idx;
          bc(room,{type:'quiz_answered',from:player.id},ws);
          const allIn=room.players.every(p=>mg.data.ans[p.id]!==null);
          if (allIn) {
            const vals=Object.values(mg.data.ans);
            const match=vals[0]===vals[1];
            const pts=match?12:4;
            room.players.forEach(p=>{mg.scores[p.id]=(mg.scores[p.id]||0)+pts;});
            room.loveMeter=Math.min(100,room.loveMeter+(match?14:5));
            const q=mg.data.qs[mg.data.qi];
            bca(room,{type:'quiz_reveal',match,ans:mg.data.ans,opts:q.a});
            bca(room,{type:'love',meter:room.loveMeter});
            mg.data.qi++;
            mg.timers.push(setTimeout(()=>{
              if (!room.mg) return;
              if (mg.data.qi>=mg.data.qs.length) endMG(room);
              else pushQuizQ(room);
            },3200));
          }
        }

        // Memory match
        if (mg.type==='memory_match' && act==='flip') {
          const d=mg.data;
          if (d.turn!==player.id) return;
          if (d.flipped.length>=2) return;
          const card=d.cards.find(c=>c.id===m.id&&!c.matched&&!c.revealed);
          if (!card) return;
          card.revealed=true;
          d.flipped.push(card);
          bca(room,{type:'mem_flip',id:card.id,emoji:card.emoji});
          if (d.flipped.length===2) {
            const [a,b]=d.flipped;
            if (a.emoji===b.emoji) {
              a.matched=b.matched=true; d.pairs++; d.flipped=[];
              mg.scores[player.id]=(mg.scores[player.id]||0)+12;
              room.loveMeter=Math.min(100,room.loveMeter+6);
              bca(room,{type:'mem_match',ids:[a.id,b.id],by:player.id,scores:mg.scores});
              bca(room,{type:'love',meter:room.loveMeter});
              if (d.pairs===6){mg.timers.forEach(clearTimeout);mg.timers=[];mg.timers.push(setTimeout(()=>endMG(room),1200));}
            } else {
              mg.timers.push(setTimeout(()=>{
                if (!room.mg) return;
                a.revealed=b.revealed=false; d.flipped=[];
                const ot=room.players.find(p=>p.id!==player.id);
                d.turn=ot?ot.id:player.id;
                bca(room,{type:'mem_hide',ids:[a.id,b.id],turn:d.turn});
              },1600));
            }
          }
        }
        break;
      }
    }
  });

  ws.on('close', ()=>{
    if (!room||!player) return;
    room.players=room.players.filter(p=>p.id!==player.id);
    bc(room,{type:'partner_left',id:player.id});
    if (room.players.length===0) {
      clearTimeout(room.mgTimer);
      room.mg?.timers.forEach(clearTimeout);
      rooms.delete(room.code);
    }
  });
  ws.on('error', ()=>{});
});

const PORT = process.env.PORT||3000;
server.listen(PORT, ()=>{
  console.log(`\n  💕 CHAOS DATE  v2.0  →  http://localhost:${PORT}\n`);
});
