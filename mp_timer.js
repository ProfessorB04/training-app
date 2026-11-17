// ============================================================
// Stoppuhr für Zeit-Übungen in „Mein Trainingsplan“ (gemeinsame Quelle BM-App + NRW-Sportschule)
// Quelle: Trainings-App-Sportschule/public/mp_timer.js → nach Trainings-App-Web/ kopieren
// Erkennt Zeitvorgaben im Übungs-Hinweis („3x 30sek“, „45sek.“, „3x60sec.“, „6x 10/30"“, „1 min“)
// oder in der Kategorie-Vorgabe (Wdh. „20-30 Sek.“). Ablauf: Start → 3-2-1 → Belastung (Countdown)
// → [Seitenwechsel → 2. Seite] → Zeit wird in den Satz eingetragen → Pause → nächster Satz.
// ============================================================

const MP_TIME_UNIT = `(?:sekunden|sekunde|sek|secs|sec|seconds|s|"|''|´´)`;
const MP_NO_LETTER = '(?![a-zäöüß])';

// Sekunden aus einem Text: {sec, min, max, rest} oder null
function mpParseTime(txt) {
  if (!txt) return null;
  const t = String(txt).replace(/[“”„]/g, '"');
  let m = t.match(new RegExp(`(\\d{1,3})\\s*\\/\\s*(\\d{1,3})\\s*${MP_TIME_UNIT}${MP_NO_LETTER}`, 'i'));
  if (m) return { sec: +m[1], min: +m[1], max: +m[1], rest: +m[2] };            // Intervall „10/30"“ = 10 s Belastung, 30 s Pause
  m = t.match(new RegExp(`(\\d{1,3})(?:\\s*[-–]\\s*(\\d{1,3}))?\\s*${MP_TIME_UNIT}${MP_NO_LETTER}`, 'i'));
  if (m) { const a = +m[1], b = m[2] ? +m[2] : a; if (b > 0) return { sec: Math.max(a, b), min: Math.min(a, b), max: Math.max(a, b) }; }
  m = t.match(/(\d{1,2}(?:[.,]\d)?)\s*(?:min|minuten|minute)(?![a-zäöüß])/i);
  if (m) { const s = Math.round(parseFloat(m[1].replace(',', '.')) * 60); if (s > 0) return { sec: s, min: s, max: s }; }
  return null;
}

// Zeitvorgabe einer Übung (Hinweis hat Vorrang vor der Kategorie-Vorgabe)
function mpTimeTarget(ex) {
  if (!ex || ex.status === 'skipped') return null;
  const t = mpParseTime(ex.note) || mpParseTime(ex.presc && ex.presc.reps);
  if (!t || t.sec < 3 || t.sec > 900) return null;
  const name = ((ex.status === 'swapped' && ex.swappedTo) || ex.name || '') + ' ' + (ex.position || '') + ' ' + (ex.option || '');
  t.sides = /seite|side|links|rechts|l\/r|each|per leg|pro bein|je bein/i.test(ex.note || '')
    || /copenhagen|side plank|seitst[üu]tz|suitcase|single|einbein|einarmig|split squat|lunge|ausfallschritt/i.test(name);
  const p = mpParseTime(ex.presc && ex.presc.pause);
  t.pause = t.rest != null ? t.rest : (p ? p.min : 0);
  return t;
}

function mpTimerBtn(ex, i) {
  const t = mpTimeTarget(ex);
  if (!t) return '';
  return `<button type="button" class="small-btn mp-timer-btn" data-i="${i}" data-f="timer">&#9201; Stoppuhr ${t.min !== t.max ? t.min + '–' + t.max : t.sec}&nbsp;s${t.sides ? ' je Seite' : ''}</button>`;
}

function mpTimerCss() {
  if (document.getElementById('mpTimerCss')) return;
  const st = document.createElement('style');
  st.id = 'mpTimerCss';
  st.textContent = `
  .mp-timer-btn{ background:var(--brand-strong, #0042fc); color:#fff; border-color:transparent; }
  .mpt-ov{ position:fixed; inset:0; z-index:1100; background:rgba(10,14,30,.6); display:flex; align-items:center; justify-content:center; padding:16px; }
  .mpt{ background:#fff; color:#111827; width:100%; max-width:420px; border-radius:20px; padding:18px 18px calc(18px + env(safe-area-inset-bottom)); text-align:center; box-shadow:0 10px 40px rgba(0,0,0,.3); }
  .mpt-h{ display:flex; align-items:flex-start; gap:8px; text-align:left; }
  .mpt-h b{ font-size:1.05rem; display:block; }
  .mpt-h small{ color:#5a6072; }
  .mpt-x{ margin-left:auto; background:none; border:none; font-size:1.6rem; line-height:1; color:#5a6072; padding:0 4px; min-height:0; }
  .mpt-phase{ margin-top:16px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; font-size:.9rem; color:#5a6072; }
  .mpt.work .mpt-phase{ color:#0a8f4a; } .mpt.rest .mpt-phase{ color:#b45309; } .mpt.prep .mpt-phase, .mpt.switch .mpt-phase{ color:#1d4ed8; }
  .mpt-big{ font-size:5.2rem; font-weight:800; font-variant-numeric:tabular-nums; line-height:1.05; margin:4px 0 2px; }
  .mpt.over .mpt-big{ color:#0a8f4a; }
  .mpt-sub{ color:#5a6072; min-height:1.3em; }
  .mpt-bar{ height:8px; border-radius:6px; background:#e5e7eb; overflow:hidden; margin:12px 0 4px; }
  .mpt-bar i{ display:block; height:100%; width:0; background:#0a8f4a; transition:width .2s linear; }
  .mpt.rest .mpt-bar i{ background:#f59e0b; } .mpt.prep .mpt-bar i, .mpt.switch .mpt-bar i{ background:#3b82f6; }
  .mpt-opts{ display:flex; justify-content:center; gap:14px; flex-wrap:wrap; margin:10px 0 2px; font-size:.92rem; }
  .mpt-opts label{ display:flex; align-items:center; gap:6px; }
  .mpt-opts input[type=number]{ width:72px; padding:4px 6px; }
  .mpt-b{ display:flex; gap:8px; margin-top:14px; }
  .mpt-b button{ flex:1; height:54px; font-size:1.05rem; }
  .mpt-res{ margin-top:6px; font-size:.95rem; }`;
  document.head.appendChild(st);
}

// o = { name, target, setCount, nextSet(): Index|−1, save(j, sec) }
function mpTimer(o) {
  mpTimerCss();
  const T = o.target;
  const S = { phase: 'ready', sides: !!T.sides, work: T.sec, pause: T.pause || 0, side: 1, t0: 0, dur: 0, paused: false, pausedAt: 0, times: [], j: o.nextSet(), lastBeep: null };
  const ov = document.createElement('div');
  ov.className = 'mpt-ov';
  document.body.appendChild(ov);
  let tick = null, wake = null, actx = null;

  const beep = (f, d) => {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const g = actx.createGain(), osc = actx.createOscillator();
      osc.frequency.value = f; osc.type = 'sine'; osc.connect(g); g.connect(actx.destination);
      const n = actx.currentTime; g.gain.setValueAtTime(0.0001, n); g.gain.exponentialRampToValueAtTime(0.5, n + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, n + d);
      osc.start(n); osc.stop(n + d + 0.05);
    } catch (e) {}
    try { if (navigator.vibrate) navigator.vibrate(d > 0.3 ? 400 : 80); } catch (e) {}
  };
  const lockScreen = async () => { try { if (navigator.wakeLock && !wake) wake = await navigator.wakeLock.request('screen'); } catch (e) {} };
  const onVis = () => { if (document.visibilityState === 'visible' && S.phase !== 'ready' && S.phase !== 'done') { wake = null; lockScreen(); } };
  document.addEventListener('visibilitychange', onVis);

  const now = () => (S.paused ? S.pausedAt : performance.now());
  const elapsed = () => Math.max(0, (now() - S.t0) / 1000);
  const fmt = s => { s = Math.max(0, Math.ceil(s - 1e-6)); return s >= 60 ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : String(s); };
  const setLabel = () => S.j >= 0 ? `Satz ${S.j + 1} von ${Math.max(o.setCount(), S.j + 1)}` : 'alle Sätze erledigt';
  const sideLabel = () => S.sides ? (S.side === 1 ? ' · Seite 1' : ' · Seite 2') : '';

  function start(phase, dur) {
    S.phase = phase; S.dur = dur; S.t0 = performance.now(); S.paused = false; S.lastBeep = null;
    if (!tick) tick = setInterval(step, 100);
    draw();
  }
  function stopTick() { clearInterval(tick); tick = null; }
  function step() {
    if (S.paused) return;
    const left = S.dur - elapsed();
    const whole = Math.ceil(left);
    if (left > 0 && whole <= 3 && whole !== S.lastBeep && (S.phase !== 'rest' || S.dur > 5)) { S.lastBeep = whole; beep(660, 0.12); }
    if (left <= 0) return next();
    paint();
  }
  function next() {
    if (S.phase === 'prep' || S.phase === 'switch') { beep(990, 0.35); return start('work', S.work); }
    if (S.phase === 'work') return finishWork(S.work);
    if (S.phase === 'rest') { beep(990, 0.5); stopTick(); S.phase = 'ready'; return draw(); }
  }
  function finishWork(sec) {
    S.times.push(Math.round(sec));
    if (S.sides && S.side === 1) { beep(880, 0.4); S.side = 2; return start('switch', 5); }
    beep(990, 0.6);
    stopTick();
    S.phase = 'done';
    draw();
  }
  function saveSet() {
    const sec = Math.min(...S.times);
    o.save(S.j, sec);
    S.times = []; S.side = 1;
    S.j = o.nextSet();
    if (S.j >= 0 && S.pause > 0) return start('rest', S.pause);
    stopTick(); S.phase = 'ready'; draw();
  }
  function close() {
    stopTick();
    document.removeEventListener('visibilitychange', onVis);
    try { if (wake) wake.release(); } catch (e) {}
    try { if (actx) actx.close(); } catch (e) {}
    ov.remove();
  }

  function paint() {
    const big = ov.querySelector('.mpt-big'), bar = ov.querySelector('.mpt-bar i');
    if (!big || S.phase === 'ready' || S.phase === 'done') return;
    const e = elapsed();
    big.textContent = fmt(S.dur - e);
    if (bar) bar.style.width = Math.min(100, (e / S.dur) * 100) + '%';
  }

  function draw() {
    const ph = S.phase;
    const titles = { ready: 'Bereit', prep: 'Gleich geht’s los', work: 'Halten!', switch: 'Seite wechseln', rest: 'Pause', done: 'Geschafft' };
    let big = '', sub = '', btns = '', opts = '';
    if (ph === 'ready') {
      big = fmt(S.work);
      sub = S.j >= 0 ? setLabel() + (S.sides ? ' · beide Seiten' : '') : 'Alle Sätze sind eingetragen.';
      opts = `<div class="mpt-opts">
        <label>Zeit <input type="number" id="mptWork" min="3" max="900" value="${S.work}"> s</label>
        <label><input type="checkbox" id="mptSides" ${S.sides ? 'checked' : ''}> je Seite</label>
        <label>Pause <input type="number" id="mptPause" min="0" max="600" value="${S.pause}"> s</label></div>`;
      btns = S.j >= 0 ? `<button type="button" class="secondary" data-a="close">Schlie&szlig;en</button><button type="button" data-a="go">&#9654; Start</button>`
                      : `<button type="button" data-a="close">Schlie&szlig;en</button>`;
    } else if (ph === 'done') {
      const sec = Math.min(...S.times);
      big = fmt(sec);
      sub = setLabel();
      btns = `<button type="button" class="secondary" data-a="again">Nochmal</button><button type="button" data-a="save">&#10003; ${sec}&nbsp;s eintragen</button>`;
    } else {
      big = fmt(S.dur - elapsed());
      sub = ph === 'rest' ? `danach ${setLabel()}` : setLabel() + sideLabel();
      btns = ph === 'work'
        ? `<button type="button" class="secondary" data-a="pause">${S.paused ? '&#9654; Weiter' : '&#10074;&#10074; Pause'}</button><button type="button" data-a="stop">&#9632; Stopp</button>`
        : ph === 'rest'
          ? `<button type="button" class="secondary" data-a="close">Schlie&szlig;en</button><button type="button" data-a="skip">Pause &uuml;berspringen</button>`
          : `<button type="button" class="secondary" data-a="cancel">Abbrechen</button><button type="button" data-a="skip">Sofort los</button>`;
    }
    ov.innerHTML = `<div class="mpt ${ph}" role="dialog" aria-modal="true">
      <div class="mpt-h"><div><b>${esc(o.name)}</b><small>Vorgabe ${T.min !== T.max ? T.min + '–' + T.max : T.sec}&nbsp;s${S.sides ? ' je Seite' : ''}${S.pause ? ' · Pause ' + S.pause + '&nbsp;s' : ''}</small></div>
        <button type="button" class="mpt-x" data-a="close" aria-label="Schließen">&times;</button></div>
      <div class="mpt-phase">${titles[ph]}</div>
      <div class="mpt-big">${big}</div>
      <div class="mpt-sub">${sub}</div>
      ${ph === 'ready' || ph === 'done' ? '' : '<div class="mpt-bar"><i></i></div>'}
      ${ph === 'done' && S.times.length > 1 ? `<div class="mpt-res">Seite 1: ${S.times[0]}&nbsp;s · Seite 2: ${S.times[1]}&nbsp;s</div>` : ''}
      ${opts}
      <div class="mpt-b">${btns}</div>
    </div>`;
    paint();
    ov.querySelectorAll('[data-a]').forEach(b => b.onclick = () => act(b.dataset.a));
  }

  function act(a) {
    if (a === 'close') { if (S.phase === 'work' && !confirm('Stoppuhr läuft – wirklich schließen?')) return; return close(); }
    if (a === 'go') {
      const w = parseInt((ov.querySelector('#mptWork') || {}).value, 10), p = parseInt((ov.querySelector('#mptPause') || {}).value, 10);
      if (w >= 3) S.work = Math.min(900, w);
      S.pause = p >= 0 ? Math.min(600, p) : S.pause;
      S.sides = !!(ov.querySelector('#mptSides') || {}).checked;
      S.side = 1; S.times = [];
      beep(660, 0.05);           // Ton auf iPhone erst nach einer Berührung möglich
      lockScreen();
      return start('prep', 3);
    }
    if (a === 'skip') { if (S.phase === 'rest') { stopTick(); S.phase = 'ready'; return draw(); } return next(); }
    if (a === 'cancel') { stopTick(); S.phase = 'ready'; S.side = 1; S.times = []; return draw(); }
    if (a === 'pause') {
      if (S.paused) { S.t0 += performance.now() - S.pausedAt; S.paused = false; } else { S.pausedAt = performance.now(); S.paused = true; }
      return draw();
    }
    if (a === 'stop') { const e = elapsed(); S.paused = false; return finishWork(Math.min(e, S.work)); }
    if (a === 'again') { S.times = []; S.side = 1; S.phase = 'ready'; return draw(); }
    if (a === 'save') return saveSet();
  }
  draw();
}
