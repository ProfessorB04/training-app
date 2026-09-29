// ============================================================
// Condition: Ausdauer-/Konditionseinheiten planen, individuell (vIFT aus 30-15 IFT, HFmax/HFrest)
// in die App veröffentlichen; Athlet:innen sehen persönliche Vorgaben, haken ab, tragen sRPE ein.
// Tabellen: cd_sessions, cd_assignments (personal = Werte beim Veröffentlichen), cd_logs; athletes.hr_max/hr_rest/vift_kmh
// ============================================================

const CD_PHASES = [
  { key: 'warmup', label: 'Warm-Up', color: '#d9822b' },
  { key: 'main', label: 'Hauptteil', color: '#1f9d55' },
  { key: 'cooldown', label: 'Cool-down', color: '#0ea5a5' },
];
const CD_MODALITIES = ['Laufen (Platz/Halle)', 'Laufband', 'Court (Basketball)', 'Rad-Ergometer', 'Air Bike', 'Rudern', 'SkiErg', 'Schwimmen', 'Seilspringen', 'Sonstiges'];
const CD_INT_TYPES = [
  { key: 'vift', label: '% vIFT (30-15)', unit: '%' },
  { key: 'hrmax', label: '% HFmax', unit: '%' },
  { key: 'hrzone', label: 'HF-Zone (1–5)', unit: 'Zone' },
  { key: 'hrr', label: '% HF-Reserve (Karvonen)', unit: '%' },
  { key: 'watt', label: 'Watt', unit: 'W' },
  { key: 'speed', label: 'km/h', unit: 'km/h' },
  { key: 'pace', label: 'Pace (min/km)', unit: 'min/km' },
  { key: 'rpe', label: 'RPE (1–10)', unit: 'RPE' },
  { key: 'allout', label: 'maximal (all-out)', unit: '' },
];
const CD_INT = Object.fromEntries(CD_INT_TYPES.map(t => [t.key, t]));
const CD_ZONES = { 1: [50, 60], 2: [60, 70], 3: [70, 80], 4: [80, 90], 5: [90, 100] };
// Methoden mit sinnvollen Startwerten (werden beim Auswählen übernommen und sind danach frei änderbar)
const CD_METHODS = [
  { key: 'dauer', label: 'Dauermethode (GA1, locker)', d: { sets: 1, reps: 1, work: [30, 'min'], rest: [0, 's'], setRest: [0, 's'], int: ['hrmax', 65, 75] } },
  { key: 'tempodauer', label: 'Tempodauerlauf / Schwelle', d: { sets: 1, reps: 1, work: [20, 'min'], rest: [0, 's'], setRest: [0, 's'], int: ['hrmax', 85, 90] } },
  { key: 'fahrtspiel', label: 'Fahrtspiel', d: { sets: 1, reps: 1, work: [25, 'min'], rest: [0, 's'], setRest: [0, 's'], int: ['rpe', 5, 8] } },
  { key: 'extint', label: 'Extensive Intervalle', d: { sets: 1, reps: 6, work: [3, 'min'], rest: [90, 's'], setRest: [0, 's'], int: ['hrmax', 80, 85] } },
  { key: 'intint', label: 'Intensive Intervalle', d: { sets: 1, reps: 5, work: [2, 'min'], rest: [2, 'min'], setRest: [0, 's'], int: ['hrmax', 88, 92] } },
  { key: 'hiitlong', label: 'HIIT lang (z. B. 4 × 4 min)', d: { sets: 1, reps: 4, work: [4, 'min'], rest: [3, 'min'], setRest: [0, 's'], int: ['hrmax', 90, 95] } },
  { key: 'hiit1515', label: 'HIIT kurz 15/15', d: { sets: 2, reps: 10, work: [15, 's'], rest: [15, 's'], setRest: [3, 'min'], int: ['vift', 90, 95] } },
  { key: 'hiit3030', label: 'HIIT kurz 30/30', d: { sets: 2, reps: 8, work: [30, 's'], rest: [30, 's'], setRest: [3, 'min'], int: ['vift', 85, 90] } },
  { key: 'tabata', label: 'Tabata 20/10', d: { sets: 1, reps: 8, work: [20, 's'], rest: [10, 's'], setRest: [0, 's'], int: ['rpe', 9, 10] } },
  { key: 'sit', label: 'Sprint-Intervalle (SIT)', d: { sets: 1, reps: 6, work: [30, 's'], rest: [4, 'min'], setRest: [0, 's'], int: ['allout', '', ''] } },
  { key: 'rsa', label: 'Repeated Sprints (RSA)', d: { sets: 3, reps: 6, work: [20, 'm'], rest: [20, 's'], setRest: [3, 'min'], int: ['allout', '', ''] } },
  { key: 'court', label: 'Court-Shuttles / Suicides', d: { sets: 3, reps: 4, work: [30, 's'], rest: [30, 's'], setRest: [2, 'min'], int: ['rpe', 8, 9] } },
  { key: 'frei', label: 'Frei (eigene Vorgabe)', d: { sets: 1, reps: 1, work: [10, 'min'], rest: [0, 's'], setRest: [0, 's'], int: ['rpe', '', ''] } },
];
const CD_METHOD = Object.fromEntries(CD_METHODS.map(m => [m.key, m]));

// ---------- Rechenhilfen ----------
function cdNum(v) { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? null : n; }
function cdSec(v, u) { const n = cdNum(v); if (n == null) return null; return u === 'min' ? n * 60 : (u === 's' ? n : null); }
function cdFmtDur(sec) { if (sec == null) return '–'; const m = Math.floor(sec / 60), s = Math.round(sec % 60); return s ? `${m}:${String(s).padStart(2, '0')} min` : `${m} min`; }
function cdFmtVal(v, u) { const n = cdNum(v); if (n == null) return ''; return `${String(n).replace('.', ',')} ${u}`; }
function cdPaceToSec(p) { const m = String(p || '').match(/^(\d+):(\d{1,2})$/); return m ? +m[1] * 60 + +m[2] : null; }
function cdRange(a, b, u) { const x = String(a ?? '').trim(), y = String(b ?? '').trim(); if (!x && !y) return ''; return (x && y && x !== y ? `${x}–${y}` : (x || y)) + (u ? ' ' + u : ''); }
function cdNewId() { return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function cdNewBlock(phase, methodKey) {
  const m = CD_METHOD[methodKey || (phase === 'main' ? 'hiit1515' : 'dauer')] || CD_METHODS[0];
  const d = m.d;
  const b = { id: cdNewId(), phase, method: m.key, content: '', modality: CD_MODALITIES[0], sets: d.sets, reps: d.reps,
    work: { v: d.work[0], u: d.work[1] }, rest: { v: d.rest[0], u: d.rest[1] }, setRest: { v: d.setRest[0], u: d.setRest[1] },
    int: { type: d.int[0], min: d.int[1], max: d.int[2] }, hr: { min: '', max: '' }, note: '' };
  if (phase !== 'main') { b.work = { v: phase === 'warmup' ? 10 : 8, u: 'min' }; b.int = { type: 'hrmax', min: 60, max: 70 }; b.method = 'dauer'; b.sets = 1; b.reps = 1; }
  return b;
}
// Gesamtdauer eines Blocks (s); bei Belastung in Metern ohne Tempo nicht bestimmbar
function cdBlockSec(b, workSecOverride) {
  const sets = Math.max(1, cdNum(b.sets) || 1), reps = Math.max(1, cdNum(b.reps) || 1);
  const w = workSecOverride != null ? workSecOverride : cdSec(b.work.v, b.work.u);
  const r = cdSec(b.rest.v, b.rest.u) || 0, sr = cdSec(b.setRest.v, b.setRest.u) || 0;
  if (w == null) return null;
  return sets * reps * w + sets * (reps - 1) * r + (sets - 1) * sr;
}
function cdStructText(b) {
  const sets = cdNum(b.sets) || 1, reps = cdNum(b.reps) || 1;
  const w = cdFmtVal(b.work.v, b.work.u), r = cdNum(b.rest.v) ? cdFmtVal(b.rest.v, b.rest.u) : '';
  let t = (reps > 1 ? `${reps} × ${w}` : w) + (r && reps > 1 ? ` / ${r} Pause` : '');
  if (sets > 1) t = `${sets} Serien à ${t}` + (cdNum(b.setRest.v) ? ` · ${cdFmtVal(b.setRest.v, b.setRest.u)} Serienpause` : '');
  return t;
}
function cdIntText(b) {
  const i = b.int || {}, t = CD_INT[i.type];
  let s = !t ? '' : (i.type === 'allout' ? 'maximal (all-out)' : (i.type === 'hrzone' ? 'HF-Zone ' + cdRange(i.min, i.max, '') : cdRange(i.min, i.max, t.unit)));
  if (s && ['vift', 'hrmax', 'hrr'].includes(i.type)) s += ' ' + { vift: 'vIFT', hrmax: 'HFmax', hrr: 'HF-Reserve' }[i.type];
  const h = b.hr || {};
  if (cdNum(h.min) || cdNum(h.max)) s += (s ? ' · ' : '') + 'HF ' + cdRange(h.min, h.max, '% HFmax');
  return s;
}
// Persönliche Vorgabe aus vIFT/HFmax/HFrest: { text, workSec }
function cdPersonalText(b, p) {
  p = p || {};
  const i = b.int || {}, out = [];
  let workSec = null;
  const lo = cdNum(i.min), hi = cdNum(i.max) ?? lo, loV = lo ?? hi;
  if (i.type === 'vift' && cdNum(p.vift) && loV != null) {
    const v1 = p.vift * loV / 100, v2 = p.vift * hi / 100;
    out.push(`${v1.toFixed(1).replace('.', ',')}${v2 !== v1 ? '–' + v2.toFixed(1).replace('.', ',') : ''} km/h`);
    const ws = cdSec(b.work.v, b.work.u);
    if (ws != null) { const m1 = Math.round(v1 / 3.6 * ws / 5) * 5, m2 = Math.round(v2 / 3.6 * ws / 5) * 5; out.push(`≈ ${m1}${m2 !== m1 ? '–' + m2 : ''} m je Belastung`); }
    else if (b.work.u === 'm' && cdNum(b.work.v)) { workSec = cdNum(b.work.v) / (v1 / 3.6); out.push(`≈ ${Math.round(workSec)} s je ${cdNum(b.work.v)} m`); }
  } else if ((i.type === 'hrmax' || i.type === 'hrzone') && cdNum(p.hr_max) && loV != null) {
    const pr = i.type === 'hrzone' ? [CD_ZONES[Math.round(loV)] ? CD_ZONES[Math.round(loV)][0] : null, CD_ZONES[Math.round(hi)] ? CD_ZONES[Math.round(hi)][1] : null] : [loV, hi];
    if (pr[0] != null) out.push(`Puls ${Math.round(p.hr_max * pr[0] / 100)}–${Math.round(p.hr_max * pr[1] / 100)}`);
  } else if (i.type === 'hrr' && cdNum(p.hr_max) && cdNum(p.hr_rest) && loV != null) {
    const r = p.hr_max - p.hr_rest;
    out.push(`Puls ${Math.round(p.hr_rest + r * loV / 100)}–${Math.round(p.hr_rest + r * hi / 100)}`);
  }
  const h = b.hr || {};
  if (cdNum(p.hr_max) && (cdNum(h.min) || cdNum(h.max))) {
    const a = cdNum(h.min) ?? cdNum(h.max), c = cdNum(h.max) ?? a;
    out.push(`Puls ${Math.round(p.hr_max * a / 100)}–${Math.round(p.hr_max * c / 100)}`);
  }
  return { text: out.join(' · '), workSec };
}
function cdSessionSec(content) {
  let t = 0, unknown = false;
  (content.blocks || []).forEach(b => { const s = cdBlockSec(b); if (s == null) unknown = true; else t += s; });
  return { sec: t, unknown };
}

// ============================================================
// Admin/Trainer: Übersicht
// ============================================================
async function renderConditionHub(profile) {
  const T = 'Condition';
  renderShell(profile, 'condition', T, `<p class="muted">Lade&hellip;</p>`);
  const [sRes, aRes, lRes, prRes] = await Promise.all([
    sb.from('cd_sessions').select('*').eq('archived', false).order('planned_date', { ascending: false, nullsFirst: true }).order('created_at', { ascending: false }),
    sb.from('cd_assignments').select('session_id, user_id, active').eq('active', true),
    sb.from('cd_logs').select('session_id, user_id, completed, srpe, duration_min'),
    sb.from('profiles').select('id, name'),
  ]);
  const err = [sRes, aRes, lRes, prRes].map(r => r.error).filter(Boolean)[0];
  if (err) { renderShell(profile, 'condition', T, `<div class="card"><p class="error">Fehler: ${esc(err.message)}${/cd_sessions|relation/.test(err.message) ? '<br>Die Datenbank f&uuml;r Condition ist noch nicht eingerichtet (Migration supabase_migration_condition.sql).' : ''}</p></div>`); return; }
  const names = Object.fromEntries((prRes.data || []).map(p => [p.id, p.name]));
  const today = new Date().toISOString().slice(0, 10);
  const cards = (sRes.data || []).map(s => {
    const as = (aRes.data || []).filter(a => a.session_id === s.id);
    const done = (lRes.data || []).filter(l => l.session_id === s.id && l.completed).length;
    const dur = cdSessionSec(s.content || {});
    const past = s.planned_date && s.planned_date < today;
    return `<div class="card cd-card${past ? ' past' : ''}">
      <div class="tpo-head">
        <div><div class="tpo-title">${esc(s.title || 'Condition-Einheit')}</div>
          <div class="muted-inline">${s.planned_date ? new Date(s.planned_date + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) : 'ohne Datum'}${s.team ? ' &middot; ' + esc(s.team) : ''} &middot; ${(s.content.blocks || []).length} Bl&ouml;cke &middot; ${dur.sec ? '&asymp; ' + Math.round(dur.sec / 60) + ' min' : ''}${dur.unknown ? ' +' : ''}</div></div>
        <span class="tpo-week">${as.length ? `${done}/${as.length} erledigt` : 'nicht ver&ouml;ffentlicht'}</span>
      </div>
      ${as.length ? `<div class="tpo-people">${as.map(a => `<span class="tpo-chip static">${esc(names[a.user_id] || '?')}</span>`).join('')}</div>` : ''}
      <div class="tpo-actions">
        <button type="button" class="small-btn" data-edit="${s.id}">&#9998; Bearbeiten</button>
        <button type="button" class="secondary small-btn" data-res="${s.id}">&#128202; Eintragungen</button>
        <button type="button" class="secondary small-btn" data-dup="${s.id}">Duplizieren</button>
        <button type="button" class="danger small-btn" data-del="${s.id}">&#128465; L&ouml;schen</button>
      </div>
    </div>`;
  }).join('');
  const content = `
    <div class="card cd-intro">
      <div class="ath-toolbar">
        <div><b>Condition-Einheiten</b> <span class="muted-inline">Ausdauer &amp; Kondition planen, individuell nach vIFT (30-15 IFT) und Herzfrequenz</span></div>
        <span class="spacer"></span>
        <button type="button" class="secondary" id="cdValues">&#10084;&#65039; Leistungswerte (vIFT / HFmax)</button>
        <button type="button" id="cdNew">+ Neue Einheit</button>
      </div>
    </div>
    ${cards || '<div class="card"><p class="muted">Noch keine Condition-Einheiten. &bdquo;+ Neue Einheit&ldquo; anklicken.</p></div>'}`;
  renderShell(profile, 'condition', T, content);
  document.getElementById('cdNew').onclick = () => renderCdEditor(profile, null);
  document.getElementById('cdValues').onclick = () => renderCdValues(profile);
  appEl.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => renderCdEditor(profile, (sRes.data || []).find(s => s.id === b.dataset.edit)));
  appEl.querySelectorAll('[data-res]').forEach(b => b.onclick = () => renderCdResults(profile, (sRes.data || []).find(s => s.id === b.dataset.res), names));
  appEl.querySelectorAll('[data-dup]').forEach(b => b.onclick = () => {
    const s = (sRes.data || []).find(x => x.id === b.dataset.dup);
    const c = JSON.parse(JSON.stringify(s.content || {}));
    (c.blocks || []).forEach(x => { x.id = cdNewId(); });
    renderCdEditor(profile, { id: null, title: (s.title || '') + ' (Kopie)', team: s.team, planned_date: null, content: c });
  });
  appEl.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const s = (sRes.data || []).find(x => x.id === b.dataset.del);
    const n = (lRes.data || []).filter(l => l.session_id === s.id).length;
    if (!confirm('Condition-Einheit „' + (s.title || '') + '“ löschen?' + (n ? '\n\n' + n + ' Eintragung(en) der Athlet:innen werden mitgelöscht (sRPE im Load Management bleibt).' : ''))) return;
    const r = await sb.from('cd_sessions').delete().eq('id', s.id);
    if (r.error) { toast('Fehler: ' + r.error.message); return; }
    toast('Gelöscht.'); renderConditionHub(profile);
  });
}

// ============================================================
// Leistungswerte je Athlet:in (vIFT, HFmax, HFrest) + Übernahme aus dem 30-15-IFT-Tool
// ============================================================
async function renderCdValues(profile) {
  const back = { label: 'Condition', go: () => renderConditionHub(profile) };
  const T = 'Leistungswerte';
  renderShell(profile, 'condition', T, `<p class="muted">Lade&hellip;</p>`, back);
  let mgmt;
  try { mgmt = await loadAthleteData(); } catch (e) { renderShell(profile, 'condition', T, `<div class="card"><p class="error">Fehler: ${esc(e.message)}</p></div>`, back); return; }
  let grp = '';
  const draw = () => {
    const list = mgmt.athletes.filter(a => !grp || a.groupIds.includes(grp))
      .sort((x, y) => x.last_name.localeCompare(y.last_name, 'de') || x.first_name.localeCompare(y.first_name, 'de'));
    const html = `
      <div class="card">
        <div class="ath-toolbar">
          <select id="cdvGrp" style="width:auto;"><option value="">Alle Gruppen</option>${mgmt.groups.map(g => `<option value="${g.id}" ${g.id === grp ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>
          <span class="spacer"></span>
          <button type="button" class="secondary" id="cdvIft">&#8595; Aus 30-15 IFT &uuml;bernehmen</button>
        </div>
        <p class="hint">vIFT = Endgeschwindigkeit im 30-15 Intermittent Fitness Test (km/h). HFmax und Ruhepuls f&uuml;r Pulsbereiche (% HFmax, Zonen, Karvonen). Werte werden beim Ver&ouml;ffentlichen einer Einheit f&uuml;r die pers&ouml;nlichen Vorgaben verwendet. &Auml;nderungen speichern automatisch.</p>
        <div class="tablewrap"><table class="user-table cd-vals">
          <thead><tr><th>Name</th><th>vIFT (km/h)</th><th>Test vom</th><th>HFmax</th><th>Ruhepuls</th><th>App</th></tr></thead>
          <tbody>${list.map(a => `<tr data-id="${a.id}">
            <td>${esc(a.last_name)}, ${esc(a.first_name)}</td>
            <td><input type="text" inputmode="decimal" data-f="vift_kmh" value="${a.vift_kmh ?? ''}" placeholder="z. B. 18,5"></td>
            <td><input type="date" data-f="vift_date" value="${a.vift_date || ''}"></td>
            <td><input type="text" inputmode="numeric" data-f="hr_max" value="${a.hr_max ?? ''}" placeholder="z. B. 200"></td>
            <td><input type="text" inputmode="numeric" data-f="hr_rest" value="${a.hr_rest ?? ''}" placeholder="z. B. 55"></td>
            <td>${a.profile_id ? '&#10003;' : '<span class="muted" title="Kein App-Zugang verkn&uuml;pft">–</span>'}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Keine Athlet:innen.</td></tr>'}</tbody>
        </table></div>
      </div>`;
    renderShell(profile, 'condition', T, html, back);
    document.getElementById('cdvGrp').onchange = e => { grp = e.target.value; draw(); };
    appEl.querySelectorAll('.cd-vals input[data-f]').forEach(inp => {
      inp.onchange = async () => {
        const id = inp.closest('tr').dataset.id, f = inp.dataset.f;
        let v = inp.value.trim();
        if (f === 'vift_kmh') v = v ? Math.round(cdNum(v) * 10) / 10 : null;
        else if (f === 'hr_max' || f === 'hr_rest') v = v ? Math.round(cdNum(v)) : null;
        else v = v || null;
        const r = await sb.from('athletes').update({ [f]: v }).eq('id', id);
        if (r.error) { toast('Fehler: ' + r.error.message); inp.classList.add('err'); return; }
        inp.classList.remove('err');
        const a = mgmt.athletes.find(x => x.id === id); if (a) a[f] = v;
        toast('Gespeichert.');
      };
    });
    document.getElementById('cdvIft').onclick = async () => {
      let d = null;
      try { d = JSON.parse(localStorage.getItem('ift3015_data_v1')); } catch (e) {}
      if (!d || !Array.isArray(d.athletes)) { alert('Auf diesem Gerät sind keine 30-15-IFT-Daten gespeichert.\n\nBitte am Gerät mit den IFT-Tests (Testungen → 30-15 IFT) öffnen oder die Werte hier eintragen.'); return; }
      const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
      const latest = {};   // athleteId -> { vift, date }
      (d.sessions || []).slice().sort((x, y) => (x.date || '').localeCompare(y.date || '')).forEach(s => (s.results || []).forEach(r => { if (r.vift) latest[r.athleteId] = { vift: r.vift, date: s.date }; }));
      const byName = new Map(mgmt.athletes.map(a => [norm(a.first_name + ' ' + a.last_name), a]));
      let n = 0; const miss = [];
      for (const ia of d.athletes) {
        const key = norm((ia.vorname || '') + ' ' + (ia.nachname || '')) || norm(ia.name);
        const a = byName.get(key) || byName.get(norm(ia.name));
        const res = latest[ia.id];
        const patch = {};
        if (res && res.vift) { patch.vift_kmh = Math.round(res.vift * 10) / 10; patch.vift_date = res.date || null; }
        if (ia.maxpuls) patch.hr_max = Math.round(ia.maxpuls);
        if (ia.ruhepuls) patch.hr_rest = Math.round(ia.ruhepuls);
        if (!Object.keys(patch).length) continue;
        if (!a) { miss.push(ia.name || key); continue; }
        const r = await sb.from('athletes').update(patch).eq('id', a.id);
        if (!r.error) { Object.assign(a, patch); n++; }
      }
      toast(n + ' Athlet:innen aktualisiert');
      if (miss.length) alert('Übernommen: ' + n + '\n\nNicht gefunden in der Athletenverwaltung (Name abweichend?):\n• ' + miss.join('\n• '));
      draw();
    };
  };
  draw();
}

// ============================================================
// Editor
// ============================================================
async function renderCdEditor(profile, session) {
  const back = { label: 'Condition', go: () => { if (!dirty || confirm('Ungespeicherte Änderungen verwerfen?')) renderConditionHub(profile); } };
  const T = session && session.id ? 'Condition bearbeiten' : 'Neue Condition-Einheit';
  renderShell(profile, 'condition', T, `<p class="muted">Lade&hellip;</p>`, back);
  const S = session ? JSON.parse(JSON.stringify(session)) : { id: null, title: '', team: '', planned_date: new Date().toISOString().slice(0, 10), content: {} };
  S.content = S.content || {};
  if (!Array.isArray(S.content.blocks) || !S.content.blocks.length) S.content.blocks = [cdNewBlock('warmup'), cdNewBlock('main'), cdNewBlock('cooldown')];
  let dirty = false;
  const [mgmt, lib, asg, prof] = await Promise.all([
    loadAthleteData().catch(() => null),
    sb.from('tp_builder_store').select('data').eq('key', 'tp_builder_db_v2').maybeSingle(),
    S.id ? sb.from('cd_assignments').select('user_id, active').eq('session_id', S.id) : Promise.resolve({ data: [] }),
    sb.from('profiles').select('id, name, role, permissions').eq('role', 'athlete').order('name'),
  ]);
  const libNames = ((lib.data && lib.data.data && lib.data.data.conditioning) || []).map(x => x.name).filter(Boolean).sort((a, b) => a.localeCompare(b, 'de'));
  const athletes = mgmt ? mgmt.athletes : [], groups = mgmt ? mgmt.groups : [];
  const athByProfile = {}; athletes.forEach(a => { if (a.profile_id) athByProfile[a.profile_id] = a; });
  const users = (prof.data || []);
  const picked = new Set((asg.data || []).filter(a => a.active).map(a => a.user_id));
  const teamGroups = groups.map(g => g.name);
  let previewGrp = '';

  const intInputs = (b) => {
    const t = b.int.type;
    if (t === 'allout') return '';
    if (t === 'pace') return `<input type="text" data-k="int.min" value="${esc(b.int.min ?? '')}" placeholder="4:30"> – <input type="text" data-k="int.max" value="${esc(b.int.max ?? '')}" placeholder="4:10">`;
    return `<input type="text" inputmode="decimal" data-k="int.min" value="${esc(b.int.min ?? '')}" placeholder="von"> – <input type="text" inputmode="decimal" data-k="int.max" value="${esc(b.int.max ?? '')}" placeholder="bis">`;
  };
  const unitSel = (k, v, opts) => `<select data-k="${k}">${opts.map(o => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
  const blockCard = (b, idx) => {
    const ph = CD_PHASES.find(p => p.key === b.phase) || CD_PHASES[1];
    const sec = cdBlockSec(b);
    return `<div class="cd-block" data-i="${idx}" style="--cat:${ph.color}">
      <div class="cd-bhead">
        <select data-k="method" class="cd-method">${CD_METHODS.map(m => `<option value="${m.key}" ${m.key === b.method ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select>
        <span class="cd-bsum">${esc(cdStructText(b))}${cdIntText(b) ? ' &middot; ' + esc(cdIntText(b)) : ''} &middot; ${sec != null ? '&asymp; ' + cdFmtDur(sec) : 'Dauer je nach Tempo'}</span>
        <span class="cd-btools">
          <button type="button" class="mini" data-a="up" title="nach oben">&uarr;</button><button type="button" class="mini" data-a="down" title="nach unten">&darr;</button>
          <button type="button" class="mini" data-a="dup" title="duplizieren">&#10697;</button><button type="button" class="mini danger" data-a="del" title="l&ouml;schen">&times;</button>
        </span>
      </div>
      <div class="cd-grid">
        <label class="w2">Inhalt / &Uuml;bung<input type="text" data-k="content" list="cdLib" value="${esc(b.content || '')}" placeholder="z. B. Pendell&auml;ufe 20 m, lockeres Einlaufen &hellip;"></label>
        <label>Sportart<select data-k="modality">${CD_MODALITIES.map(m => `<option ${m === b.modality ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
        <label>Phase<select data-k="phase">${CD_PHASES.map(p => `<option value="${p.key}" ${p.key === b.phase ? 'selected' : ''}>${p.label}</option>`).join('')}</select></label>
        <label>Serien<input type="text" inputmode="numeric" data-k="sets" value="${esc(b.sets ?? '')}"></label>
        <label>Wiederholungen<input type="text" inputmode="numeric" data-k="reps" value="${esc(b.reps ?? '')}"></label>
        <label>Belastung<span class="cd-pair"><input type="text" inputmode="decimal" data-k="work.v" value="${esc(b.work.v ?? '')}">${unitSel('work.u', b.work.u, ['s', 'min', 'm'])}</span></label>
        <label>Pause<span class="cd-pair"><input type="text" inputmode="decimal" data-k="rest.v" value="${esc(b.rest.v ?? '')}">${unitSel('rest.u', b.rest.u, ['s', 'min'])}</span></label>
        <label>Serienpause<span class="cd-pair"><input type="text" inputmode="decimal" data-k="setRest.v" value="${esc(b.setRest.v ?? '')}">${unitSel('setRest.u', b.setRest.u, ['s', 'min'])}</span></label>
        <label class="w2">Intensit&auml;t<span class="cd-pair"><select data-k="int.type">${CD_INT_TYPES.map(t => `<option value="${t.key}" ${t.key === b.int.type ? 'selected' : ''}>${t.label}</option>`).join('')}</select>${intInputs(b)}</span></label>
        <label>HF-Kontrolle (% HFmax)<span class="cd-pair"><input type="text" inputmode="numeric" data-k="hr.min" value="${esc(b.hr.min ?? '')}" placeholder="von"> – <input type="text" inputmode="numeric" data-k="hr.max" value="${esc(b.hr.max ?? '')}" placeholder="bis"></span></label>
        <label class="w3">Hinweis<input type="text" data-k="note" value="${esc(b.note || '')}" placeholder="z. B. Richtungswechsel alle 20 m, Pause aktiv gehen"></label>
      </div>
    </div>`;
  };
  const previewHtml = () => {
    const mains = S.content.blocks.filter(b => ['vift', 'hrmax', 'hrzone', 'hrr'].includes(b.int.type) || cdNum(b.hr.min) || cdNum(b.hr.max));
    const who = users.filter(u => previewGrp === '__pub' ? picked.has(u.id) : (!previewGrp || (athByProfile[u.id] && athByProfile[u.id].groupIds.includes(previewGrp))));
    if (!mains.length) return '<p class="hint">Pers&ouml;nliche Werte entstehen bei Intensit&auml;t in % vIFT, % HFmax, HF-Zone oder Karvonen.</p>';
    return `<div class="tablewrap"><table class="user-table cd-prev"><thead><tr><th>Athlet:in</th><th>vIFT</th><th>HFmax</th>${mains.map((b, k) => `<th>${esc(CD_METHOD[b.method] ? CD_METHOD[b.method].label.split(' (')[0] : 'Block')}<div class="hint" style="margin:0;">${esc(cdStructText(b))}</div></th>`).join('')}</tr></thead>
      <tbody>${who.map(u => { const a = athByProfile[u.id] || {}; const p = { vift: cdNum(a.vift_kmh), hr_max: a.hr_max, hr_rest: a.hr_rest };
        return `<tr><td>${esc(u.name)}</td><td>${p.vift ? String(p.vift).replace('.', ',') : '<span class="muted">–</span>'}</td><td>${p.hr_max || '<span class="muted">–</span>'}</td>${mains.map(b => `<td>${esc(cdPersonalText(b, p).text) || '<span class="muted">Wert fehlt</span>'}</td>`).join('')}</tr>`; }).join('') || `<tr><td colspan="${3 + mains.length}" class="muted">Keine Athlet:innen mit App-Zugang in der Auswahl.</td></tr>`}</tbody></table></div>`;
  };
  const draw = () => {
    const tot = cdSessionSec(S.content);
    const phaseHtml = CD_PHASES.map(ph => {
      const list = S.content.blocks.map((b, i) => [b, i]).filter(([b]) => b.phase === ph.key);
      return `<div class="cd-phase"><div class="cd-phead" style="--cat:${ph.color}">${ph.label}<button type="button" class="secondary small-btn" data-add="${ph.key}">+ Block</button></div>
        ${list.map(([b, i]) => blockCard(b, i)).join('') || '<p class="hint" style="margin:4px 0 10px;">Kein Block.</p>'}</div>`;
    }).join('');
    const html = `
      <datalist id="cdLib">${libNames.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      <div class="card">
        <div class="cd-top">
          <label class="w2">Titel<input type="text" id="cdTitle" value="${esc(S.title || '')}" placeholder="z. B. HIIT 15/15 &ndash; Vorbereitung"></label>
          <label>Datum<input type="date" id="cdDate" value="${S.planned_date || ''}"></label>
          <label>Team / Gruppe<input type="text" id="cdTeam" list="cdTeams" value="${esc(S.team || '')}"><datalist id="cdTeams">${teamGroups.map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>
          <label class="w4">Hinweis f&uuml;r alle<input type="text" id="cdNote" value="${esc(S.content.note || '')}" placeholder="z. B. Pulsgurt anlegen, Trinkflasche mitbringen"></label>
        </div>
        <div class="cd-total">Gesamt &asymp; <b>${tot.sec ? Math.round(tot.sec / 60) + ' min' : '–'}</b>${tot.unknown ? ' (+ Bl&ouml;cke nach Strecke)' : ''} &middot; ${S.content.blocks.length} Bl&ouml;cke</div>
      </div>
      ${phaseHtml}
      <div class="card">
        <div class="ath-toolbar"><h2 style="margin:0;">Pers&ouml;nliche Vorgaben (Vorschau)</h2><span class="spacer"></span>
          <select id="cdPrevGrp" style="width:auto;"><option value="">Alle mit App-Zugang</option><option value="__pub" ${previewGrp === '__pub' ? 'selected' : ''}>Nur ausgew&auml;hlte (Ver&ouml;ffentlichen)</option>${groups.map(g => `<option value="${g.id}" ${g.id === previewGrp ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div>
        ${previewHtml()}
        <p class="hint">Fehlende vIFT/HFmax unter &bdquo;Condition &rarr; Leistungswerte&ldquo; eintragen oder aus dem 30-15 IFT &uuml;bernehmen.</p>
      </div>
      <div class="cd-savebar">
        <button type="button" class="secondary" id="cdSave">&#128190; Speichern</button>
        <button type="button" id="cdPub">&#128242; In App ver&ouml;ffentlichen${picked.size ? ' (' + picked.size + ')' : ''}</button>
      </div>`;
    renderShell(profile, 'condition', T, html, back);
    wire();
  };
  const setPath = (o, k, v) => { const p = k.split('.'); if (p.length === 2) o[p[0]][p[1]] = v; else o[k] = v; };
  const wire = () => {
    const top = (id, f) => { const el = document.getElementById(id); el.oninput = () => { f(el.value); dirty = true; }; };
    top('cdTitle', v => S.title = v); top('cdDate', v => S.planned_date = v || null); top('cdTeam', v => S.team = v); top('cdNote', v => S.content.note = v);
    document.getElementById('cdPrevGrp').onchange = e => { previewGrp = e.target.value; draw(); };
    appEl.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { S.content.blocks.push(cdNewBlock(b.dataset.add)); dirty = true; draw(); });
    appEl.querySelectorAll('.cd-block').forEach(card => {
      const i = +card.dataset.i, b = S.content.blocks[i];
      card.querySelectorAll('[data-k]').forEach(el => {
        const k = el.dataset.k;
        el.onchange = () => {
          dirty = true;
          if (k === 'method') {
            const m = CD_METHOD[el.value]; b.method = el.value;
            if (m) { const d = m.d; Object.assign(b, { sets: d.sets, reps: d.reps, work: { v: d.work[0], u: d.work[1] }, rest: { v: d.rest[0], u: d.rest[1] }, setRest: { v: d.setRest[0], u: d.setRest[1] }, int: { type: d.int[0], min: d.int[1], max: d.int[2] } }); }
            draw(); return;
          }
          setPath(b, k, el.value);
          if (k === 'int.type') { b.int.min = ''; b.int.max = ''; if (el.value === 'hrzone') { b.int.min = 2; b.int.max = 2; } }
          draw();
        };
        if (el.tagName === 'INPUT') el.oninput = () => { setPath(b, k, el.value); dirty = true; };
      });
      card.querySelectorAll('[data-a]').forEach(btn => btn.onclick = () => {
        const a = btn.dataset.a, arr = S.content.blocks;
        if (a === 'del') { if (!confirm('Block löschen?')) return; arr.splice(i, 1); }
        else if (a === 'dup') { const c = JSON.parse(JSON.stringify(b)); c.id = cdNewId(); arr.splice(i + 1, 0, c); }
        else {
          // innerhalb derselben Phase verschieben
          const same = arr.map((x, k) => [x, k]).filter(([x]) => x.phase === b.phase).map(([, k]) => k);
          const pos = same.indexOf(i), j = same[pos + (a === 'up' ? -1 : 1)];
          if (j == null) return;
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        dirty = true; draw();
      });
    });
    document.getElementById('cdSave').onclick = async () => { if (await save()) { toast('Gespeichert.'); draw(); } };
    document.getElementById('cdPub').onclick = () => publishDialog();
  };
  const save = async () => {
    if (!(S.title || '').trim()) { alert('Bitte einen Titel eingeben.'); return false; }
    const { data: { user } } = await sb.auth.getUser();
    const row = { title: S.title.trim(), team: (S.team || '').trim() || null, planned_date: S.planned_date || null, content: S.content, updated_at: new Date().toISOString() };
    let r;
    if (S.id) r = await sb.from('cd_sessions').update(row).eq('id', S.id).select('id').single();
    else r = await sb.from('cd_sessions').insert(Object.assign({ created_by: user.id }, row)).select('id').single();
    if (r.error) { alert('Speichern fehlgeschlagen: ' + r.error.message); return false; }
    S.id = r.data.id; dirty = false;
    return true;
  };
  const publishDialog = () => {
    const host = document.createElement('div');
    const sel = new Set(picked);
    const render = () => {
      host.innerHTML = `<div class="modal-scrim"><div class="modal" style="max-width:640px;">
        <h2>&#128242; In App ver&ouml;ffentlichen</h2>
        <p class="hint" style="margin-top:0;">Die Ausgew&auml;hlten sehen die Einheit im Men&uuml; unter &bdquo;Condition&ldquo; mit ihren pers&ouml;nlichen Vorgaben. Sp&auml;tere &Auml;nderungen an der Einheit sind sofort sichtbar.</p>
        <div class="chips" style="margin-bottom:8px;">${groups.map(g => `<button type="button" class="secondary small-btn" data-g="${g.id}">${esc(g.name)}</button>`).join('')}<button type="button" class="secondary small-btn" data-g="__all">Alle</button><button type="button" class="secondary small-btn" data-g="__none">Keine</button></div>
        <div class="cd-pick">${users.map(u => { const a = athByProfile[u.id]; const miss = !a || !cdNum(a.vift_kmh) || !a.hr_max; const noPerm = !!u.permissions && u.permissions.condition === 'none';
          return `<label><input type="checkbox" data-u="${u.id}" ${sel.has(u.id) ? 'checked' : ''}> ${esc(u.name)}${miss ? ' <span class="muted-inline" title="vIFT/HFmax fehlen – allgemeine Vorgaben">(Werte fehlen)</span>' : ''}${noPerm ? ' <b style="color:#b0281c;">Recht fehlt</b>' : ''}</label>`; }).join('') || '<p class="muted">Keine Athlet:innen mit App-Zugang.</p>'}</div>
        <div class="modal-actions"><span class="spacer">${sel.size} ausgew&auml;hlt</span>
          <button type="button" class="secondary" id="cdpX">Abbrechen</button>
          <button type="button" id="cdpGo">Ver&ouml;ffentlichen</button></div>
      </div></div>`;
      host.querySelectorAll('[data-u]').forEach(c => c.onchange = () => { if (c.checked) sel.add(c.dataset.u); else sel.delete(c.dataset.u); render(); });
      host.querySelectorAll('[data-g]').forEach(b => b.onclick = () => {
        const g = b.dataset.g;
        if (g === '__all') users.forEach(u => sel.add(u.id));
        else if (g === '__none') sel.clear();
        else { sel.clear(); users.forEach(u => { const a = athByProfile[u.id]; if (a && a.groupIds.includes(g)) sel.add(u.id); }); }
        render();
      });
      host.querySelector('#cdpX').onclick = () => host.remove();
      host.querySelector('#cdpGo').onclick = async () => {
        if (!sel.size && !picked.size) { alert('Bitte mindestens eine Person auswählen.'); return; }
        const btn = host.querySelector('#cdpGo'); btn.disabled = true; btn.textContent = 'Veröffentliche …';
        if (!(await save())) { btn.disabled = false; btn.textContent = 'Veröffentlichen'; return; }
        const rows = [...sel].map(uid => { const a = athByProfile[uid] || {}; return { session_id: S.id, user_id: uid, active: true,
          personal: { vift: cdNum(a.vift_kmh), hr_max: a.hr_max || null, hr_rest: a.hr_rest || null } }; });
        let r = rows.length ? await sb.from('cd_assignments').upsert(rows, { onConflict: 'session_id,user_id' }) : { error: null };
        const removed = [...picked].filter(u => !sel.has(u));
        if (!r.error && removed.length) r = await sb.from('cd_assignments').update({ active: false }).eq('session_id', S.id).in('user_id', removed);
        if (r.error) { alert('Veröffentlichen fehlgeschlagen: ' + r.error.message); btn.disabled = false; btn.textContent = 'Veröffentlichen'; return; }
        picked.clear(); sel.forEach(u => picked.add(u));
        host.remove(); toast('Veröffentlicht für ' + picked.size + ' Athlet:innen'); draw();
      };
    };
    document.body.appendChild(host); render();
  };
  draw();
}

// ---------- Eintragungen einer Einheit (Admin/Trainer) ----------
async function renderCdResults(profile, s, names) {
  const back = { label: 'Condition', go: () => renderConditionHub(profile) };
  const T = s.title || 'Condition-Einheit';
  renderShell(profile, 'condition', T, `<p class="muted">Lade&hellip;</p>`, back);
  const [aRes, lRes] = await Promise.all([
    sb.from('cd_assignments').select('*').eq('session_id', s.id).eq('active', true),
    sb.from('cd_logs').select('*').eq('session_id', s.id),
  ]);
  const blocks = (s.content && s.content.blocks) || [];
  const rows = (aRes.data || []).sort((x, y) => (names[x.user_id] || '').localeCompare(names[y.user_id] || '', 'de')).map(a => {
    const l = (lRes.data || []).find(x => x.user_id === a.user_id);
    const bd = (l && l.data && l.data.blocks) || {};
    const done = blocks.filter(b => bd[b.id] && bd[b.id].done).length;
    const extras = blocks.map(b => { const x = bd[b.id]; if (!x) return ''; const t = [x.hr ? '&Oslash; ' + esc(x.hr) + ' bpm' : '', x.dist ? esc(x.dist) + ' m' : '', x.note ? esc(x.note) : ''].filter(Boolean).join(' · '); return t ? `<div class="hint" style="margin:0;"><b>${esc(CD_METHOD[b.method] ? CD_METHOD[b.method].label.split(' (')[0] : 'Block')}:</b> ${t}</div>` : ''; }).join('');
    return `<tr><td>${esc(names[a.user_id] || '?')}</td>
      <td>${l && l.completed ? '<span class="status-pill ok">erledigt</span>' : (l ? '<span class="status-pill half">angefangen</span>' : '<span class="status-pill open">offen</span>')}</td>
      <td>${done}/${blocks.length}</td><td>${l && l.srpe ? l.srpe : '–'}</td><td>${l && l.duration_min ? l.duration_min + ' min' : '–'}</td>
      <td>${extras}${l && l.data && l.data.note ? `<div class="hint" style="margin:0;">&#128221; ${esc(l.data.note)}</div>` : ''}</td></tr>`;
  }).join('');
  renderShell(profile, 'condition', T, `<div class="card"><div class="tablewrap"><table class="user-table">
    <thead><tr><th>Athlet:in</th><th>Status</th><th>Bl&ouml;cke</th><th>sRPE</th><th>Dauer</th><th>Eintr&auml;ge</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" class="muted">Noch nicht ver&ouml;ffentlicht.</td></tr>'}</tbody></table></div></div>`, back);
}

// ============================================================
// Athlet:innen: Liste in „Mein Trainingsplan“ + Einheit ansehen/eintragen
// ============================================================
async function cdLoadMine() {
  const { data: { user } } = await sb.auth.getUser();
  const { data: asg, error } = await sb.from('cd_assignments').select('session_id, personal, active').eq('user_id', user.id).eq('active', true);
  if (error || !asg || !asg.length) return [];
  const ids = asg.map(a => a.session_id);
  const [sRes, lRes] = await Promise.all([
    sb.from('cd_sessions').select('*').in('id', ids),
    sb.from('cd_logs').select('*').eq('user_id', user.id).in('session_id', ids),
  ]);
  return (sRes.data || []).map(s => ({ s, personal: (asg.find(a => a.session_id === s.id) || {}).personal || {}, log: (lRes.data || []).find(l => l.session_id === s.id) || null, uid: user.id }))
    .sort((x, y) => (x.log && x.log.completed ? 1 : 0) - (y.log && y.log.completed ? 1 : 0) || (x.s.planned_date || '9999').localeCompare(y.s.planned_date || '9999'));
}
function cdMyListHtml(list) {
  if (!list || !list.length) return '';
  const open = list.filter(x => !(x.log && x.log.completed)), done = list.filter(x => x.log && x.log.completed);
  const item = x => {
    const dur = cdSessionSec(x.s.content || {});
    const st = x.log && x.log.completed ? '&#10003;' : (x.log ? '&#9680;' : '');
    return `<button type="button" class="cd-mine${x.log && x.log.completed ? ' done' : ''}" data-cd="${x.s.id}">
      <span><b>${esc(x.s.title || 'Condition')}</b><span class="muted-inline">${x.s.planned_date ? new Date(x.s.planned_date + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }) : ''}${dur.sec ? ' &middot; &asymp; ' + Math.round(dur.sec / 60) + ' min' : ''}</span></span><span class="cd-st">${st}</span></button>`;
  };
  return `<div class="card"><h2>&#10084;&#65039; Condition</h2>
    <div class="cd-mylist">${open.map(item).join('')}</div>
    ${done.length ? `<details style="margin-top:8px;"><summary class="hint" style="cursor:pointer;">Erledigt (${done.length})</summary><div class="cd-mylist">${done.map(item).join('')}</div></details>` : ''}</div>`;
}
// eigener Menüpunkt „Condition“ für Athlet:innen (Recht „condition“)
async function renderMyConditionList(profile) {
  renderShell(profile, 'condition', 'Condition', `<p class="muted">Lade&hellip;</p>`);
  const list = await cdLoadMine().catch(() => []);
  renderShell(profile, 'condition', 'Condition', list.length ? cdMyListHtml(list)
    : `<div class="card"><h2>Noch keine Condition-Einheit</h2><p class="muted">Sobald dein Trainer eine Ausdauer-/Konditionseinheit f&uuml;r dich ver&ouml;ffentlicht, erscheint sie hier &ndash; mit deinen pers&ouml;nlichen Tempo- und Pulsvorgaben.</p></div>`);
  cdWireMyList(profile, list);
}
function cdWireMyList(profile, list) {
  appEl.querySelectorAll('[data-cd]').forEach(b => b.onclick = () => renderMyCondition(profile, list.find(x => x.s.id === b.dataset.cd)));
}

function renderMyCondition(profile, x) {
  const canEdit = perm(profile, 'condition') === 'edit';
  const s = x.s, p = x.personal || {}, blocks = (s.content && s.content.blocks) || [];
  const data = JSON.parse(JSON.stringify((x.log && x.log.data) || {})); data.blocks = data.blocks || {};
  const back = { label: 'Condition', go: () => renderMyConditionList(profile) };
  let timer = null;
  const persist = async (completed, extra) => {
    if (!canEdit) return;
    const row = Object.assign({ session_id: s.id, user_id: x.uid, data, completed: !!completed, updated_at: new Date().toISOString(),
      entry_date: (x.log && x.log.entry_date) || new Date().toISOString().slice(0, 10) }, extra || {});
    const r = await sb.from('cd_logs').upsert(row, { onConflict: 'session_id,user_id' }).select('*').single();
    if (r.error) toast('Nicht gespeichert: ' + r.error.message); else x.log = r.data;
  };
  const soon = () => { clearTimeout(timer); timer = setTimeout(() => persist(x.log && x.log.completed), 900); };
  const draw = () => {
    const html = CD_PHASES.map(ph => {
      const list = blocks.filter(b => b.phase === ph.key);
      if (!list.length) return '';
      return `<div class="cd-phead" style="--cat:${ph.color}">${ph.label}</div>` + list.map(b => {
        const d = data.blocks[b.id] || {};
        const pers = cdPersonalText(b, p);
        return `<div class="card cd-myblock${d.done ? ' done' : ''}" style="--cat:${ph.color}">
          <div class="cd-mytitle"><b>${esc(b.content || (CD_METHOD[b.method] ? CD_METHOD[b.method].label : 'Block'))}</b><span class="muted-inline">${esc(b.modality || '')}</span></div>
          <div class="cd-mystruct">${esc(cdStructText(b))}</div>
          ${cdIntText(b) ? `<div class="cd-myint">${esc(cdIntText(b))}</div>` : ''}
          ${pers.text ? `<div class="cd-mypers">&#127919; Deine Vorgabe: <b>${esc(pers.text)}</b></div>` : ''}
          ${b.note ? `<div class="tpo-note">&#128204; ${esc(b.note)}</div>` : ''}
          <div class="cd-mylog">
            <label class="mp-check"><input type="checkbox" data-b="${b.id}" data-f="done" ${d.done ? 'checked' : ''} ${canEdit ? '' : 'disabled'}> erledigt</label>
            <input type="text" inputmode="numeric" data-b="${b.id}" data-f="hr" value="${esc(d.hr || '')}" placeholder="&Oslash; Puls" ${canEdit ? '' : 'disabled'}>
            <input type="text" inputmode="numeric" data-b="${b.id}" data-f="dist" value="${esc(d.dist || '')}" placeholder="Meter" ${canEdit ? '' : 'disabled'}>
            <input type="text" data-b="${b.id}" data-f="note" value="${esc(d.note || '')}" placeholder="Notiz" ${canEdit ? '' : 'disabled'}>
          </div>
        </div>`;
      }).join('');
    }).join('');
    const dur = cdSessionSec(s.content || {});
    const content = `
      <div class="card mp-sesshead" style="--lay-main:#1f9d55;--lay-dark:#157a42;--lay-accent:#a1d7ff;">
        <div><div class="mp-kicker">Condition${s.planned_date ? ' &middot; ' + new Date(s.planned_date + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' }) : ''}</div>
        <div class="mp-big">${esc(s.title || 'Condition')}</div>
        <div class="muted-inline">${dur.sec ? '&asymp; ' + Math.round(dur.sec / 60) + ' min' : ''}${x.log && x.log.completed ? ' &middot; abgeschlossen' : ''}</div></div>
      </div>
      ${s.content && s.content.note ? `<div class="card mp-info">&#128221; ${esc(s.content.note)}</div>` : ''}
      ${!p.vift && !p.hr_max ? '<p class="hint">F&uuml;r pers&ouml;nliche Tempo- und Pulsvorgaben fehlen noch deine Testwerte (vIFT/HFmax) &ndash; sprich deinen Trainer an.</p>' : ''}
      ${html}
      <input type="text" class="mp-anote" id="cdMyNote" value="${esc(data.note || '')}" placeholder="Notiz zur Einheit (optional)" ${canEdit ? '' : 'disabled'}>
      ${canEdit ? `<button type="button" id="cdFinish" class="mp-finish">Einheit abschlie&szlig;en</button>` : ''}`;
    renderShell(profile, 'condition', 'Condition', content, back);
    appEl.querySelectorAll('[data-b]').forEach(el => {
      const d = () => (data.blocks[el.dataset.b] = data.blocks[el.dataset.b] || {});
      if (el.dataset.f === 'done') el.onchange = () => { d().done = el.checked; el.closest('.cd-myblock').classList.toggle('done', el.checked); soon(); };
      else el.oninput = () => { d()[el.dataset.f] = el.value.trim(); soon(); };
    });
    const n = document.getElementById('cdMyNote'); if (n) n.oninput = () => { data.note = n.value; soon(); };
    const fin = document.getElementById('cdFinish'); if (fin) fin.onclick = finish;
  };
  const finish = () => {
    const needRpe = perm(profile, 'srpe') === 'edit';
    const dur0 = cdSessionSec(s.content || {}).sec;
    const mins = dur0 ? Math.max(5, Math.round(dur0 / 60)) : 45;
    const host = document.createElement('div');
    host.innerHTML = `<div class="modal-scrim"><div class="modal">
      <h2>Einheit abschlie&szlig;en</h2>
      ${needRpe ? `<p class="hint" style="margin-top:0;">Wie anstrengend war die Einheit insgesamt? (1 = sehr leicht &hellip; 10 = maximal)</p>
      <div class="mp-rpe">${Array.from({ length: 10 }, (_, k) => `<button type="button" class="secondary" data-rpe="${k + 1}">${k + 1}</button>`).join('')}</div>
      <label class="wq-date" style="margin-top:12px;">Dauer (Minuten)<input type="number" inputmode="numeric" id="cdDur" min="1" max="300" value="${x.log && x.log.duration_min ? x.log.duration_min : ''}" placeholder="${mins}"></label>` : '<p>Einheit als erledigt speichern?</p>'}
      <div class="modal-actions"><span class="spacer"></span><button type="button" class="secondary" id="cdfX">Zur&uuml;ck</button><button type="button" id="cdfGo" ${needRpe && !(x.log && x.log.srpe) ? 'disabled' : ''}>Speichern</button></div>
    </div></div>`;
    document.body.appendChild(host);
    let rpe = (x.log && x.log.srpe) || null;
    const mark = () => host.querySelectorAll('[data-rpe]').forEach(b => b.classList.toggle('on', +b.dataset.rpe === rpe));
    mark();
    host.querySelectorAll('[data-rpe]').forEach(b => b.onclick = () => { rpe = +b.dataset.rpe; mark(); host.querySelector('#cdfGo').disabled = false; });
    host.querySelector('#cdfX').onclick = () => host.remove();
    host.querySelector('#cdfGo').onclick = async () => {
      clearTimeout(timer);
      const dur = needRpe ? (parseInt(host.querySelector('#cdDur').value, 10) || mins) : null;
      await persist(true, needRpe ? { srpe: rpe, duration_min: dur } : {});
      if (needRpe) {
        // wie „Mein Trainingsplan“: sRPE ins Load Management, bei vorhandenem Tages-Eintrag zusammenrechnen
        const date = new Date().toISOString().slice(0, 10), tag = 'Condition: ' + (s.title || '');
        const { data: ex } = await sb.from('load_entries').select('*').eq('user_id', x.uid).eq('entry_date', date).maybeSingle();
        let row = { user_id: x.uid, entry_date: date, srpe: rpe, duration_min: dur, comment: tag };
        if (ex && !(ex.comment || '').includes(tag)) {
          const totalDur = ex.duration_min + dur;
          row = { user_id: x.uid, entry_date: date, duration_min: totalDur,
            srpe: Math.max(1, Math.min(10, Math.round((ex.srpe * ex.duration_min + rpe * dur) / totalDur))),
            comment: [ex.comment, '+ ' + tag].filter(Boolean).join(' ') };
        }
        await sb.from('load_entries').upsert(row, { onConflict: 'user_id,entry_date' });
      }
      host.remove(); toast('Einheit gespeichert – stark! 💪'); renderMyConditionList(profile);
    };
  };
  draw();
}
