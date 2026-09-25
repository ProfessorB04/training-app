// ============================================================
// Trainingsplan-App: „Mein Trainingsplan“ (Athlet:innen) + gemeinsame Rechenfunktionen
// Tabellen: tp_plans, tp_plan_versions (Änderung ab Woche X, optional nur für bestimmte Athlet:innen),
//           tp_assignments, tp_logs (eine Zeile je Einheit)
// ============================================================

const TP_CATS = [
  { key: 'mobility', label: 'Mobility', type: 'check', color: '#0ea5a5' },
  { key: 'dynamic', label: 'Dynamic Stretch', type: 'check', color: '#d9822b' },
  { key: 'core', label: 'Core', type: 'sets', color: '#7c5cbf' },
  { key: 'power', label: 'Power', type: 'sets', color: '#d0392b' },
  { key: 'strength', label: 'Strength', type: 'sets', color: '#0042fc' },
  { key: 'accessory', label: 'Accessory', type: 'sets', color: '#c2478d' },
  { key: 'conditioning', label: 'Conditioning', type: 'sets', color: '#1f9d55' },
];
const TP_EXTRA_COLOR = '#45565f';
// Layouts wie in der Trainingsplanung (Kopf der Einheit)
const TP_LAYOUTS = {
  balance_movement: { name: 'Balance Movement', main: '#0042fc', dark: '#0032bd', accent: '#a1d7ff', logo: 'logo-balance-movement.png' },
  astroladies: { name: 'VIACTIV Astroladies Bochum', main: '#005ba4', dark: '#004397', accent: '#ee7105', logo: '' },
  nrw_sportschule: { name: 'NRW-Sportschule Pascal-Gymnasium Münster', main: '#010d6e', dark: '#01094d', accent: '#8cdcfe', logo: '' },
};
function tpLayoutOf(plan, content) {
  const k = (content && content.layout) || ((plan && plan.team || '').toLowerCase().includes('astroladies') ? 'astroladies' : 'balance_movement');
  return TP_LAYOUTS[k] || TP_LAYOUTS.balance_movement;
}
function tpKgText(v) { const n = parseFloat(v); return isNaN(n) ? '' : (Math.round(n * 10) / 10).toLocaleString('de-DE', { maximumFractionDigits: 1 }); }
const TP_CAT = Object.fromEntries(TP_CATS.map(c => [c.key, c]));
const KG_STEP = 0.5;

// ---------- gemeinsame Helfer (auch für die Auswertung) ----------
function tpLabel(ex) { return [ex.name, ex.position, ex.option].filter(Boolean).join(' · '); }
function tpRange(str, fallback) {
  const n = String(str || '').match(/\d+(?:[.,]\d+)?/g);
  if (!n) return { min: fallback, max: fallback };
  const v = n.map(x => parseFloat(x.replace(',', '.')));
  return { min: Math.min(v[0], v[v.length - 1]), max: Math.max(v[0], v[v.length - 1]) };
}
function tpKgFromNote(note) {
  const m = String(note || '').match(/(\d+(?:[.,]\d+)?)\s*kg/i);
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}
// Plan-Inhalt für eine Woche und Person: höchste „ab Woche“ gewinnt, bei Gleichstand die Variante für die Person
function tpContentFor(versions, week, uid) {
  let best = null;
  (versions || []).forEach(v => {
    const applies = !v.user_ids || v.user_ids.includes(uid);
    if (!applies || v.from_week > week) return;
    if (!best || v.from_week > best.from_week || (v.from_week === best.from_week && v.user_ids && !best.user_ids)
        || (v.from_week === best.from_week && !!v.user_ids === !!best.user_ids && v.id > best.id)) best = v;
  });
  return best ? best.content : null;
}
// Übungen eines Tages aus dem Plan-Inhalt
function tpDayItems(content, day) {
  const out = [];
  if (!content || !content.plan) return out;
  const d = content.plan[day] || content.plan[String(day)] || {};
  TP_CATS.forEach(c => {
    (d[c.key] || []).forEach(ex => {
      const presc = (content.prescription || {})[c.key] || null;
      out.push({ name: ex.name, position: ex.position || '', option: ex.option || '', note: ex.note || ex.preset || '', cat: c.key, presc });
    });
  });
  return out;
}
// Bewegte Last einer protokollierten Übung: Σ Wdh × kg; ohne Gewicht: Σ Wdh (Volumen)
function tpLoadOf(ex) {
  let kgLoad = 0, reps = 0, secs = 0, anyKg = false;
  (ex.sets || []).forEach(s => {
    if (!s.done) return;
    const r = parseFloat(s.reps) || 0, k = parseFloat(s.kg) || 0, t = parseFloat(s.sec) || 0;
    reps += r; secs += t;
    if (k > 0 && r > 0) { anyKg = true; kgLoad += r * k; }
  });
  if (anyKg) return { value: kgLoad, unit: 'kg', reps: reps || secs };
  if (reps) return { value: reps, unit: 'Wdh', reps };
  return { value: secs, unit: 's', reps: secs };
}
function tpSetDone(s) { return parseFloat(s.reps) > 0 || parseFloat(s.sec) > 0; }
function tpExerciseKey(ex) { return ex.status === 'swapped' && ex.swappedTo ? ex.swappedTo : tpLabel(ex); }
function tpFmt(n) { return (Math.round(n * 10) / 10).toLocaleString('de-DE'); }
// Ampel: Steigerung > +2 %, gleich ±2 %, Rückschritt < −2 %
function tpTrend(cur, prev) {
  if (cur == null || prev == null || prev === 0) return null;
  const pct = (cur - prev) / prev * 100;
  return { pct, cls: pct > 2 ? 'up' : (pct < -2 ? 'down' : 'same') };
}
function tpWeekOfDate(startIso, weeks) {
  if (!startIso) return null;
  const d = Math.floor((Date.now() - new Date(startIso + 'T00:00:00').getTime()) / 86400000);
  if (d < 0) return 1;
  return Math.min(weeks, Math.floor(d / 7) + 1);
}

// ---------- Daten der eingeloggten Person ----------
async function tpLoadMine() {
  const { data: { user } } = await sb.auth.getUser();
  const { data: asg, error } = await sb.from('tp_assignments').select('plan_id, active, assigned_at').eq('user_id', user.id).order('assigned_at', { ascending: false });
  if (error) throw error;
  const act = (asg || []).find(a => a.active);
  if (!act) return { user, plan: null };
  const [pRes, vRes, lRes] = await Promise.all([
    sb.from('tp_plans').select('*').eq('id', act.plan_id).single(),
    sb.from('tp_plan_versions').select('*').eq('plan_id', act.plan_id).order('from_week'),
    sb.from('tp_logs').select('*').eq('plan_id', act.plan_id).eq('user_id', user.id),
  ]);
  if (pRes.error) throw pRes.error;
  // letzte Werte je Übung (auch aus früheren Plänen) für die Info „Letztes Mal“
  const { data: allLogs } = await sb.from('tp_logs').select('week, day, exercises, updated_at').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(60);
  const last = {};
  (allLogs || []).forEach(l => (l.exercises || []).forEach(ex => {
    const k = tpExerciseKey(ex);
    if (!last[k] && (ex.sets || []).some(s => s.done)) last[k] = ex.sets.filter(s => s.done);
  }));
  return { user, plan: pRes.data, versions: vRes.data || [], logs: lRes.data || [], last };
}

// ---------- Übersicht „Mein Trainingsplan“ ----------
async function renderMyPlan(profile) {
  renderShell(profile, 'meinplan', 'Mein Trainingsplan', `<p class="muted">Lade&hellip;</p>`);
  let D;
  try { D = await tpLoadMine(); }
  catch (e) { renderShell(profile, 'meinplan', 'Mein Trainingsplan', `<div class="card"><p class="error">Plan konnte nicht geladen werden: ${esc(e.message)}</p></div>`); return; }
  if (!D.plan) {
    renderShell(profile, 'meinplan', 'Mein Trainingsplan', `<div class="card"><h2>Noch kein Trainingsplan</h2><p class="muted">Sobald dein Trainer einen Plan f&uuml;r dich ver&ouml;ffentlicht, erscheint er hier.</p></div>`);
    return;
  }
  const P = D.plan;
  const logBy = {};
  D.logs.forEach(l => { logBy[l.week + '_' + l.day] = l; });
  // „Heute dran“: erste nicht abgeschlossene Einheit (ab der Kalenderwoche des Plans)
  const calWeek = tpWeekOfDate(P.start_date, P.weeks) || 1;
  let next = null;
  for (let w = 1; w <= P.weeks && !next; w++) for (let d = 1; d <= P.days && !next; d++) {
    const l = logBy[w + '_' + d];
    if (!(l && l.completed) && w >= Math.min(calWeek, P.weeks) - 0) next = { w, d };
  }
  if (!next) for (let w = 1; w <= P.weeks && !next; w++) for (let d = 1; d <= P.days && !next; d++) {
    const l = logBy[w + '_' + d]; if (!(l && l.completed)) next = { w, d };
  }
  const canEdit = perm(profile, 'meinplan') === 'edit';
  const cell = (w, d) => {
    const l = logBy[w + '_' + d];
    const st = l ? (l.completed ? 'done' : 'part') : 'open';
    const sym = st === 'done' ? '&#10003;' : (st === 'part' ? '&#9680;' : '');
    return `<button type="button" class="mp-cell ${st}${next && next.w === w && next.d === d ? ' next' : ''}" data-w="${w}" data-d="${d}">Tag ${d}<span>${sym}</span></button>`;
  };
  const grid = Array.from({ length: P.weeks }, (_, i) => i + 1).map(w => `
      <div class="mp-week"><div class="mp-wlabel">Woche ${w}</div>${Array.from({ length: P.days }, (_, j) => cell(w, j + 1)).join('')}</div>`).join('');
  const content = `
    ${next ? `
    <div class="card mp-next" style="--lay-main:${tpLayoutOf(P, tpContentFor(D.versions, next.w, D.user.id)).main};--lay-accent:${tpLayoutOf(P, tpContentFor(D.versions, next.w, D.user.id)).accent};">
      <div><div class="mp-kicker">Als N&auml;chstes dran</div>
      <div class="mp-big">Woche ${next.w} &middot; Tag ${next.d}</div>
      <div class="muted-inline">${esc(P.title || 'Trainingsplan')}${P.team ? ' &middot; ' + esc(P.team) : ''}</div></div>
      <button type="button" id="mpStart">${canEdit ? 'Training starten' : 'Ansehen'} &rarr;</button>
    </div>` : `<div class="card"><h2>&#127881; Alle Einheiten erledigt</h2><p class="muted">Stark! Dein Trainer stellt den n&auml;chsten Block ein.</p></div>`}
    <div class="card">
      <h2>${esc(P.title || 'Trainingsplan')}</h2>
      <p class="hint" style="margin-top:0;">${P.weeks} Wochen &middot; ${P.days} Einheiten pro Woche${P.start_date ? ' &middot; ab ' + wDate(P.start_date) : ''}. Tippe auf eine Einheit zum &Ouml;ffnen.</p>
      <div class="mp-grid">${grid}</div>
      <p class="hint">&#10003; erledigt &middot; &#9680; angefangen</p>
    </div>`;
  renderShell(profile, 'meinplan', 'Mein Trainingsplan', content);
  // beim Öffnen einer Einheit den aktuellen Planstand holen (Trainer kann laufende Pläne ändern)
  const open = async (w, d) => {
    const [v, l] = await Promise.all([
      sb.from('tp_plan_versions').select('*').eq('plan_id', P.id).order('from_week'),
      sb.from('tp_logs').select('*').eq('plan_id', P.id).eq('user_id', D.user.id),
    ]);
    if (!v.error && v.data) D.versions = v.data;
    if (!l.error && l.data) D.logs = l.data;
    renderMySession(profile, D, w, d);
  };
  if (next) document.getElementById('mpStart').onclick = () => open(next.w, next.d);
  appEl.querySelectorAll('.mp-cell').forEach(b => { b.onclick = () => open(+b.dataset.w, +b.dataset.d); });
}

// ---------- Eingabe-Overlay: Wdh als Scroll-Auswahl (bis Vorgabe-Max), Gewicht/Dauer als Tastenfeld ----------
function mpPad(o) {
  const ov = document.createElement('div');
  ov.className = 'mp-ov';
  const IH = 48;
  let txt = o.value == null ? '' : (o.mode === 'kg' ? tpKgText(o.value) : String(o.value));
  const wheel = o.mode === 'wheel';
  const nums = wheel ? Array.from({ length: o.max }, (_, k) => k + 1) : [];
  ov.innerHTML = `<div class="mp-sheet" role="dialog" aria-modal="true">
    <div class="mp-sheet-t">${esc(o.title)}</div>
    <div class="mp-sheet-s">${esc(o.sub || '')}${o.hint ? ' &middot; letztes Mal: ' + esc(o.hint) : ''}</div>
    ${wheel ? `<div class="mp-wheel"><div class="mp-wheel-mark"></div><div class="mp-wheel-sc">
        <div style="height:${IH * 2}px"></div>${nums.map(n => `<div class="mp-wheel-it" data-n="${n}">${n}</div>`).join('')}<div style="height:${IH * 2}px"></div>
      </div></div>`
    : `<div class="mp-disp"><span class="mp-disp-v"></span><span class="mp-disp-u">${o.mode === 'kg' ? 'kg' : 's'}</span></div>
      <div class="mp-keys">${['1','2','3','4','5','6','7','8','9', o.mode === 'kg' ? ',' : '', '0', '⌫'].map(k => k ? `<button type="button" data-k="${k}">${k}</button>` : '<span></span>').join('')}</div>`}
    <div class="mp-sheet-b">
      <button type="button" class="secondary" data-a="clear">Leeren</button>
      <button type="button" class="secondary" data-a="cancel">Abbrechen</button>
      <button type="button" data-a="ok">&Uuml;bernehmen</button>
    </div></div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  let sc = null;
  if (wheel) {
    sc = ov.querySelector('.mp-wheel-sc');
    const start = o.value != null ? o.value : (o.hint && parseInt(o.hint, 10) <= o.max ? parseInt(o.hint, 10) : o.max);
    const idx = Math.max(0, Math.min(nums.length - 1, start - 1));
    const mark = () => { const k = Math.round(sc.scrollTop / IH); sc.querySelectorAll('.mp-wheel-it').forEach((it, n) => it.classList.toggle('sel', n === k)); };
    requestAnimationFrame(() => { sc.scrollTop = idx * IH; mark(); });
    sc.addEventListener('scroll', mark);
    sc.querySelectorAll('.mp-wheel-it').forEach((it, n) => { it.onclick = () => sc.scrollTo({ top: n * IH, behavior: 'smooth' }); });
  } else {
    const disp = ov.querySelector('.mp-disp-v');
    const show = () => { disp.textContent = txt || '0'; disp.classList.toggle('empty', !txt); };
    show();
    ov.querySelectorAll('[data-k]').forEach(b => {
      b.onclick = () => {
        const k = b.dataset.k;
        if (k === '⌫') txt = txt.slice(0, -1);
        else if (k === ',') { if (!txt.includes(',')) txt = (txt || '0') + ','; }
        else if (txt.includes(',')) { if (txt.split(',')[1].length < 1) txt += k; }   // nur eine Nachkommastelle
        else if (txt.length < (o.mode === 'kg' ? 3 : 4)) txt = txt === '0' ? k : txt + k;
        show();
      };
    });
  }
  ov.querySelector('[data-a="cancel"]').onclick = close;
  ov.querySelector('[data-a="clear"]').onclick = () => { close(); o.onSet(null); };
  ov.querySelector('[data-a="ok"]').onclick = () => {
    let v;
    if (wheel) v = nums[Math.max(0, Math.min(nums.length - 1, Math.round(sc.scrollTop / IH)))];
    else { const n = parseFloat(txt.replace(',', '.')); v = isNaN(n) || n <= 0 ? null : n; }
    close(); o.onSet(v);
  };
}

// ---------- Einheit eintragen ----------
function renderMySession(profile, D, week, day) {
  const P = D.plan, uid = D.user.id;
  const canEdit = perm(profile, 'meinplan') === 'edit';
  const content0 = tpContentFor(D.versions, week, uid);
  const existing = D.logs.find(l => l.week === week && l.day === day);
  const draftKey = `mp_draft_${P.id}_${week}_${day}`;
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(draftKey)); } catch (e) {}

  // Protokoll-Grundlage: gespeichert > lokaler Entwurf > Plan
  const fresh = it => {
    const type = TP_CAT[it.cat].type;
    const r = tpRange(it.presc && it.presc.sets, 3), reps = tpRange(it.presc && it.presc.reps, null);
    const sets = type === 'check' ? [] : Array.from({ length: r.max }, (_, i) => {
        return { reps: '', kg: '', sec: '', done: false };
    });
    return { name: it.name, position: it.position, option: it.option, cat: it.cat, note: it.note, presc: it.presc, status: 'open', sets, athleteNote: '' };
  };
  let exs;
  const saved = existing && existing.exercises && existing.exercises.length ? existing.exercises : (draft && draft.length ? draft : null);
  if (!saved) exs = tpDayItems(content0, day).map(fresh);
  else if (existing && existing.completed) exs = saved;
  else {
    // Laufende Einheit: Änderungen des Trainers übernehmen – neue Übungen ergänzen, gestrichene (noch nicht begonnene) entfernen
    const key = e => e.cat + '|' + tpLabel(e);
    const pool = saved.slice();
    const begun = e => e.status === 'skipped' || e.status === 'swapped' || e.athleteNote || (e.sets || []).some(s => s.done);
    exs = tpDayItems(content0, day).map(it => {
      const k = pool.findIndex(e => e.status !== 'extra' && key(e) === key(it));
      if (k < 0) return fresh(it);
      const e = pool.splice(k, 1)[0];
      return Object.assign(e, { note: it.note, presc: it.presc });
    });
    pool.forEach(e => { if (e.status === 'extra' || begun(e)) exs.push(e); });
  }
  // Zellen immer leer: nicht selbst eingetragene Werte (alte Vorbefüllungen) leeren
  if (!(existing && existing.completed)) exs.forEach(ex => (ex.sets || []).forEach(s => {
    if (s.done) return;
    s.reps = ''; s.sec = ''; s.kg = ''; delete s.hintKg;
  }));
  const cooldown = content0 && content0.cooldown ? (content0.cooldown[day] || content0.cooldown[String(day)] || '') : '';
  const prep = content0 && content0.prepNote ? (content0.prepNote[day] || content0.prepNote[String(day)] || '') : '';
  const started = Date.now();
  const LAY = tpLayoutOf(P, content0);
  let saveTimer = null;

  function persist(completed, extra) {
    try { localStorage.setItem(draftKey, JSON.stringify(exs)); } catch (e) {}
    if (!canEdit) return Promise.resolve();
    clearTimeout(saveTimer);
    const row = Object.assign({ plan_id: P.id, user_id: uid, week, day, exercises: exs, completed: !!completed,
      entry_date: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() }, extra || {});
    if (existing && existing.entry_date && !completed) row.entry_date = existing.entry_date;
    return sb.from('tp_logs').upsert(row, { onConflict: 'plan_id,user_id,week,day' }).then(({ error }) => {
      if (error) toast('Nicht gespeichert (offline?) – Eingaben bleiben auf dem Gerät.');
    });
  }
  function persistSoon() { clearTimeout(saveTimer); try { localStorage.setItem(draftKey, JSON.stringify(exs)); } catch (e) {} saveTimer = setTimeout(() => persist(existing && existing.completed), 1200); }

  function prescText(ex) {
    const p = ex.presc || {};
    return [p.sets ? p.sets + ' Sätze' : '', p.reps ? p.reps + ' Wdh.' : '', p.tempo ? 'Tempo ' + p.tempo : '', p.pause ? 'Pause ' + p.pause : ''].filter(Boolean).join(' · ');
  }
  function exCard(ex, i) {
    const cat = TP_CAT[ex.cat] || { label: 'Extra', type: 'sets' };
    const title = ex.status === 'swapped' && ex.swappedTo ? `${esc(ex.swappedTo)} <span class="mp-was">statt ${esc(tpLabel(ex))}</span>` : esc(tpLabel(ex));
    const skip = ex.status === 'skipped';
    let body = '';
    if (!skip && cat.type === 'check') {
      body = `<label class="mp-check"><input type="checkbox" data-i="${i}" data-f="checkdone" ${ex.status === 'done' ? 'checked' : ''} ${canEdit ? '' : 'disabled'}> erledigt</label>`;
    } else if (!skip) {
      const lastS = D.last[tpExerciseKey(ex)] || [];
      const ph = (j, f, dflt) => { const l = lastS[j] || lastS[lastS.length - 1]; const v = l && parseFloat(l[f]) > 0 ? l[f] : null; return v == null ? dflt : (f === 'kg' ? tpKgText(v) : v); };
      body = `<div class="mp-sets">
        <div class="mp-sethead"><span></span><span>Wdh.</span><span>Gewicht (kg)</span><span>Dauer (s)</span><span></span></div>
        ${ex.sets.map((s, j) => `
        <div class="mp-set${s.done ? ' done' : ''}">
          <span class="mp-sn">Satz ${j + 1}</span>
          <input class="mp-in" inputmode="none" data-i="${i}" data-j="${j}" data-f="reps" value="${s.reps === '' || s.reps == null ? '' : s.reps}" placeholder="${ph(j, 'reps', 'Wdh')}" readonly ${canEdit && !(parseFloat(s.sec) > 0 && !(parseFloat(s.reps) > 0)) ? '' : 'disabled'}>
          <input class="mp-in" inputmode="none" data-i="${i}" data-j="${j}" data-f="kg" value="${tpKgText(s.kg)}" placeholder="${ph(j, 'kg', 'kg')}" readonly ${canEdit ? '' : 'disabled'}>
          <input class="mp-in" inputmode="none" data-i="${i}" data-j="${j}" data-f="sec" value="${s.sec === '' || s.sec == null ? '' : s.sec}" placeholder="${ph(j, 'sec', 's')}" readonly ${canEdit && !(parseFloat(s.reps) > 0 && !(parseFloat(s.sec) > 0)) ? '' : 'disabled'}>
          <span class="mp-tick" aria-label="${s.done ? 'erledigt' : 'offen'}">${s.done ? '&#10003;' : ''}</span>
        </div>`).join('')}
      </div>
      ${canEdit ? `<div class="mp-exbtns">
        <button type="button" class="secondary small-btn" data-i="${i}" data-f="allplan">Leere S&auml;tze wie Satz 1</button>
        <button type="button" class="secondary small-btn" data-i="${i}" data-f="addset">+ Satz</button>
      </div>` : ''}`;
    }
    const lastSets = D.last[tpExerciseKey(ex)];
    const lastTxt = lastSets && lastSets.length ? 'Letztes Mal: ' + lastSets.map(s => [s.reps ? s.reps + ' Wdh' : '', s.kg ? tpKgText(s.kg) + ' kg' : '', s.sec ? s.sec + ' s' : ''].filter(Boolean).join(' × ')).join(' / ') : '';
    return `
      <div class="card mp-ex${skip ? ' skipped' : ''}${ex.status === 'extra' ? ' extra' : ''}" style="--cat:${cat.color || TP_EXTRA_COLOR};">
        <div class="mp-exhead">
          <div><div class="mp-cat">${esc(ex.status === 'extra' ? 'Zusätzlich' : cat.label)}</div><div class="mp-exname">${title}</div></div>
          ${canEdit && ex.status !== 'extra' ? `<div class="mp-exmenu">
            <button type="button" class="mp-mini" data-i="${i}" data-f="swap">&#8644; Tauschen</button>
            <button type="button" class="mp-mini" data-i="${i}" data-f="skip">${skip ? '&#8634; Doch machen' : '&#10005; Weglassen'}</button></div>` : ''}
        </div>
        ${prescText(ex) ? `<div class="mp-presc">Vorgabe: ${esc(prescText(ex))}</div>` : ''}
        ${ex.note ? `<div class="mp-note">&#128204; ${esc(ex.note)}</div>` : ''}
        ${lastTxt && !skip ? `<div class="mp-last">${esc(lastTxt)}</div>` : ''}
        ${skip ? '<div class="muted">weggelassen</div>' : body}
        <input type="text" class="mp-anote" data-i="${i}" data-f="anote" value="${esc(ex.athleteNote || '')}" placeholder="Notiz (optional), z. B. Knie zwickt" ${canEdit ? '' : 'disabled'}>
      </div>`;
  }

  function draw() {
    const doneCnt = exs.filter(e => e.status === 'done' || e.status === 'swapped' || e.status === 'extra' || (e.sets || []).some(s => s.done)).length;
    const content = `
      <div class="card mp-sesshead" style="--lay-main:${LAY.main};--lay-dark:${LAY.dark};--lay-accent:${LAY.accent};">
        ${LAY.logo ? `<img src="${LAY.logo}" alt="" class="mp-laylogo">` : ''}
        <div><div class="mp-kicker">${esc(P.title || 'Trainingsplan')}</div><div class="mp-big">Woche ${week} &middot; Tag ${day}</div>
        <div class="muted-inline">${doneCnt} von ${exs.length} &Uuml;bungen begonnen${existing && existing.completed ? ' &middot; abgeschlossen' : ''}</div></div>
      </div>
      ${prep ? `<div class="card mp-info">&#128221; ${esc(prep)}</div>` : ''}
      ${exs.map(exCard).join('')}
      ${canEdit ? `<button type="button" class="secondary" id="mpAddEx" style="width:100%;margin-bottom:14px;">+ &Uuml;bung hinzuf&uuml;gen (extra gemacht)</button>` : ''}
      ${cooldown ? `<div class="card mp-info">&#10052; Cool-down: ${esc(cooldown)}</div>` : ''}
      ${canEdit ? `<button type="button" id="mpFinish" class="mp-finish">Einheit abschlie&szlig;en</button>` : ''}
    `;
    renderShell(profile, 'meinplan', 'Mein Trainingsplan', content, { label: 'Mein Trainingsplan', go: () => { persist(existing && existing.completed); renderMyPlan(profile); } });
    wire();
  }
  function num(v) { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; }
  function wire() {
    appEl.querySelectorAll('[data-f]').forEach(el => {
      const i = +el.dataset.i, j = el.dataset.j != null ? +el.dataset.j : null, f = el.dataset.f;
      const ex = exs[i];
      if (el.tagName === 'INPUT' && (f === 'reps' || f === 'kg' || f === 'sec')) {
        el.onchange = () => {
          let v = num(el.value);
          if (v != null) v = f === 'kg' ? Math.round(v * 10) / 10 : Math.round(v);
          ex.sets[j][f] = v == null ? '' : v;
          el.value = v == null ? '' : (f === 'kg' ? tpKgText(v) : v);
          const st = ex.sets[j];
          // Wiederholungen und Dauer schließen sich je Satz aus
          if (f === 'reps' || f === 'sec') {
            const row = el.closest('.mp-set');
            const other = row && row.querySelector('input[data-f="' + (f === 'reps' ? 'sec' : 'reps') + '"]');
            if (other) other.disabled = v != null && v > 0;
          }
          const wasDone = st.done;
          st.done = tpSetDone(st);
          if (ex.status === 'open' && ex.sets.some(x => x.done)) ex.status = 'done';
          if (ex.status === 'done' && !ex.sets.some(x => x.done)) ex.status = 'open';
          persistSoon();
          if (wasDone !== st.done) {
            const row = el.closest('.mp-set');
            if (row) { row.classList.toggle('done', st.done); const t = row.querySelector('.mp-tick'); if (t) t.innerHTML = st.done ? '&#10003;' : ''; }
          }
        };
        el.onclick = () => {
          if (el.disabled) return;
          const st = ex.sets[j], name = ex.status === 'swapped' && ex.swappedTo ? ex.swappedTo : tpLabel(ex);
          const cur = f === 'kg' ? st.kg : st[f];
          mpPad({
            mode: f === 'reps' ? 'wheel' : (f === 'kg' ? 'kg' : 'int'),
            title: (f === 'reps' ? 'Wiederholungen' : (f === 'kg' ? 'Gewicht (kg)' : 'Dauer (s)')) + ' · Satz ' + (j + 1),
            sub: name,
            max: tpRange(ex.presc && ex.presc.reps, 30).max || 30,
            value: cur === '' || cur == null ? null : cur,
            hint: el.placeholder && /\d/.test(el.placeholder) ? el.placeholder : null,
            onSet: v => { el.value = v == null ? '' : (f === 'kg' ? tpKgText(v) : v); el.onchange(); },
          });
        };
      } else if (f === 'anote') {
        el.oninput = () => { ex.athleteNote = el.value; persistSoon(); };
      } else if (f === 'checkdone') {
        el.onchange = () => { ex.status = el.checked ? 'done' : 'open'; persistSoon(); };
      } else if (el.tagName === 'BUTTON') {
        el.onclick = () => {
          if (f === 'tick') {
            ex.sets[j].done = !ex.sets[j].done;
            if (ex.status === 'open' && ex.sets.some(s => s.done)) ex.status = 'done';
          } else if (f === 'allplan') {
            const s0 = ex.sets[0];
            if (!tpSetDone(s0)) { toast('Bitte zuerst Satz 1 eintragen.'); return; }
            ex.sets.forEach(s => {
              if (!tpSetDone(s)) { s.reps = s0.reps; s.sec = s0.sec; if (s.kg === '' || s.kg == null) s.kg = s0.kg; }
              s.done = tpSetDone(s);
            });
            if (ex.status === 'open') ex.status = 'done';
          } else if (f === 'addset') {
            const l = ex.sets[ex.sets.length - 1] || { reps: '', kg: '' };
            ex.sets.push({ reps: '', kg: '', sec: '', done: false });
          } else if (f === 'skip') {
            ex.status = ex.status === 'skipped' ? 'open' : 'skipped';
          } else if (f === 'swap') {
            const n = prompt('Welche Übung machst du stattdessen?', ex.swappedTo || '');
            if (n === null) return;
            if (n.trim()) { ex.status = 'swapped'; ex.swappedTo = n.trim(); } else { ex.status = 'open'; delete ex.swappedTo; }
          }
          persistSoon(); draw();
        };
      }
    });
    const add = document.getElementById('mpAddEx');
    if (add) add.onclick = () => {
      const n = prompt('Welche Übung hast du zusätzlich gemacht?');
      if (!n || !n.trim()) return;
      exs.push({ name: n.trim(), position: '', option: '', cat: 'extra', note: '', presc: null, status: 'extra', athleteNote: '',
        sets: [0, 1, 2].map(() => ({ reps: '', kg: '', sec: '', done: false })) });
      persistSoon(); draw();
    };
    const fin = document.getElementById('mpFinish');
    if (fin) fin.onclick = () => finishDialog();
  }

  function finishDialog() {
    const mins = 45;
    const host = document.createElement('div');
    host.innerHTML = `
      <div class="modal-scrim"><div class="modal">
        <h2>Einheit abschlie&szlig;en</h2>
        <p class="hint" style="margin-top:0;">Wie anstrengend war die Einheit insgesamt? (1 = sehr leicht &hellip; 10 = maximal)</p>
        <div class="mp-rpe">${Array.from({ length: 10 }, (_, k) => `<button type="button" class="secondary" data-rpe="${k + 1}">${k + 1}</button>`).join('')}</div>
        <label class="wq-date" style="margin-top:12px;">Dauer (Minuten)<input type="number" inputmode="numeric" id="mpDur" min="1" max="300" value="${existing && existing.duration_min ? existing.duration_min : ''}" placeholder="${mins}"></label>
        <div class="modal-actions"><span class="spacer"></span>
          <button type="button" class="secondary" id="mpCancel">Zur&uuml;ck</button>
          <button type="button" id="mpSave" disabled>Speichern</button></div>
      </div></div>`;
    document.body.appendChild(host);
    let rpe = existing && existing.srpe || null;
    const mark = () => host.querySelectorAll('[data-rpe]').forEach(b => b.classList.toggle('on', +b.dataset.rpe === rpe));
    if (rpe) { mark(); host.querySelector('#mpSave').disabled = false; }
    host.querySelectorAll('[data-rpe]').forEach(b => { b.onclick = () => { rpe = +b.dataset.rpe; mark(); host.querySelector('#mpSave').disabled = false; }; });
    host.querySelector('#mpCancel').onclick = () => host.remove();
    host.querySelector('#mpSave').onclick = async () => {
      const dur = parseInt(host.querySelector('#mpDur').value, 10) || mins;
      await persist(true, { srpe: rpe, duration_min: dur });
      // sRPE direkt ins Load Management (Session-RPE der App)
      if (perm(profile, 'srpe') === 'edit') {
        const date = new Date().toISOString().slice(0, 10);
        const { data: ex } = await sb.from('load_entries').select('*').eq('user_id', uid).eq('entry_date', date).maybeSingle();
        let row = { user_id: uid, entry_date: date, srpe: rpe, duration_min: dur, comment: `Trainingsplan W${week}/T${day}` };
        if (ex && !(ex.comment || '').includes(`Trainingsplan W${week}/T${day}`)) {
          const totalDur = ex.duration_min + dur;
          row = { user_id: uid, entry_date: date, duration_min: totalDur,
            srpe: Math.max(1, Math.min(10, Math.round((ex.srpe * ex.duration_min + rpe * dur) / totalDur))),
            comment: [ex.comment, `+ Trainingsplan W${week}/T${day}`].filter(Boolean).join(' ') };
        }
        await sb.from('load_entries').upsert(row, { onConflict: 'user_id,entry_date' });
      }
      try { localStorage.removeItem(draftKey); } catch (e) {}
      host.remove();
      toast('Einheit gespeichert – stark! 💪');
      renderMyPlan(profile);
    };
  }
  draw();
}
