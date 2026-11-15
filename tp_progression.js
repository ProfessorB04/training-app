/* =====================================================================
   Trainingsplanung: Anschlussplan & Progression (2026-11-15)
   Gemeinsamer Baustein für die Sportschul-App und die Balance-Movement-App.
   - Reiter „📊 Abgeschlossener Plan“: Ergebnis des Bezugsplans je Übung und Woche
     (Person oder ganze Gruppe) mit Steigerungsvorschlag
   - Hinweis unter jeder Übung im neuen Plan: „zuletzt … → Vorschlag“ + „übernehmen“
   - Link trainingsplan…#folge=<planId>[&uid=<userId>] (Knopf „➜ Anschlussplan“ in der
     Auswertung): lädt den Plan als Vorlage für den Folgeblock und setzt ihn als Bezug
   Braucht im Tool: state, saveState, renderPanels, dayPanelsEl, window.appSb, window.appRole.
   ===================================================================== */
(function(){
  'use strict';
  const SET_CATS = ['core', 'power', 'strength', 'accessory', 'conditioning'];
  const CAT_LABEL = { mobility:'Mobility', dynamic:'Dynamic Stretch', core:'Core', power:'Power', strength:'Strength', accessory:'Accessory', conditioning:'Conditioning' };
  const CAT_COLOR = { core:'#7c5cbf', power:'#d0392b', strength:'#0042fc', accessory:'#c2478d', conditioning:'#1f9d55' };
  const H = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? 0 : n; };
  const fmt = n => (Math.round(n * 10) / 10).toLocaleString('de-DE', { maximumFractionDigits: 1 });
  const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const labelOf = ex => [ex.name, ex.position, ex.option].filter(Boolean).join(' · ');
  const keyOf = ex => norm(labelOf(ex));
  function range(str, fb){
    const n = String(str || '').match(/\d+(?:[.,]\d+)?/g);
    if(!n) return { min: fb, max: fb };
    const v = n.map(x => parseFloat(x.replace(',', '.')));
    return { min: Math.min(v[0], v[v.length - 1]), max: Math.max(v[0], v[v.length - 1]) };
  }
  // Gewichtsschritt: leichte Gewichte feiner (Kurzhantel/Kettlebell), schwere gröber
  function kgStep(kg){ return kg < 10 ? 1 : (kg < 40 ? 2.5 : 5); }
  const roundHalf = v => Math.round(v * 2) / 2;

  /* ---------- Bewertung einer Übung (letzte Einheit) ---------- */
  // ex = protokollierte Übung (sets[], presc{sets,reps}), Rückgabe = Vorschlag
  function judge(ex, week){
    const timeBased = /sek|sec|\bs\b/i.test(String((ex.presc || {}).reps || '')) || (ex.sets || []).some(s => s.done && num(s.sec) > 0 && !num(s.reps));
    const planned = Math.max((ex.sets || []).length, range((ex.presc || {}).sets, 0).max || 0) || 1;
    const rr = range((ex.presc || {}).reps, 0);
    const done = (ex.sets || []).filter(s => s.done && (num(s.reps) > 0 || num(s.sec) > 0));
    if(!done.length) return null;
    const vals = done.map(s => timeBased ? num(s.sec) : num(s.reps));
    const kgs = done.map(s => num(s.kg)).filter(k => k > 0);
    const kg = kgs.length ? Math.max.apply(null, kgs) : 0;
    const minV = Math.min.apply(null, vals);
    const unit = timeBased ? 's' : 'Wdh';
    const detail = `W${week}: ${done.length}/${planned} Sätze · ${vals.map(fmt).join('/')} ${unit}${kg ? ' × ' + fmt(kg) + ' kg' : ''}`;
    const out = { week, detail, kg, planned, doneSets: done.length, unit, top: rr.max, low: rr.min, vals };
    const allSets = done.length >= planned;
    if(rr.max && allSets && minV >= rr.max){
      out.cls = 'up';
      if(kg){ out.newKg = roundHalf(kg + kgStep(kg)); out.text = `↑ ${fmt(out.newKg)} kg`; out.why = `alle Sätze mit ${fmt(rr.max)}+ ${unit} geschafft`; }
      else if(timeBased){ out.newVal = Math.max.apply(null, vals) + 5; out.text = `↑ ${fmt(out.newVal)} s`; out.why = 'alle Sätze voll geschafft'; }
      else { out.newVal = Math.max.apply(null, vals) + 2; out.text = `↑ ${fmt(out.newVal)} Wdh`; out.why = 'alle Sätze voll geschafft'; }
    } else if(rr.min && minV < rr.min * 0.8){
      out.cls = 'down';
      if(kg){ out.newKg = Math.max(0, roundHalf(kg - kgStep(kg))); out.text = `↓ ${fmt(out.newKg)} kg`; }
      else out.text = '↓ leichter';
      out.why = `deutlich unter ${fmt(rr.min)} ${unit}`;
    } else if(!allSets){
      out.cls = 'fill'; out.newKg = kg || null;
      out.text = kg ? `= ${fmt(kg)} kg` : '= halten';
      out.why = `erst alle ${planned} Sätze schaffen`;
    } else {
      out.cls = 'same'; out.newKg = kg || null;
      out.text = kg ? `= ${fmt(kg)} kg` : '= halten';
      out.why = rr.max ? `Ziel: ${fmt(rr.max)} ${unit} in allen Sätzen` : 'Niveau festigen';
    }
    return out;
  }

  /* ---------- Daten ---------- */
  const P = { plans: null, names: {}, asgAll: [], athleteProfile: {}, ref: null, data: null, loadingKey: '' };
  const sbc = () => window.appSb;

  async function loadBase(){
    if(P.plans) return;
    const sb = sbc();
    const [pl, asg, pr, at] = await Promise.all([
      sb.from('tp_plans').select('*').order('created_at', { ascending: false }),
      sb.from('tp_assignments').select('plan_id, user_id, active, assigned_at'),
      sb.from('profiles').select('id, name'),
      sb.from('athletes').select('id, profile_id'),
    ]);
    P.plans = pl.data || [];
    P.asgAll = asg.data || [];
    (pr.data || []).forEach(p => { P.names[p.id] = p.name; });
    (at.data || []).forEach(a => { if(a.profile_id) P.athleteProfile[a.id] = a.profile_id; });
  }
  const progressOf = id => (P.status && window.TpStatus) ? TpStatus.planProgress(P.status, id) : [];
  const planById = id => (P.plans || []).find(p => p.id === id);
  const membersOf = id => [...new Set(P.asgAll.filter(a => a.plan_id === id).map(a => a.user_id))]
    .sort((x, y) => (P.names[x] || '').localeCompare(P.names[y] || '', 'de'));

  // Bezug: ausdrücklich gewählt (state.progRef) oder geraten aus Person/Gruppe des Entwurfs
  function currentRef(){
    if(state.progRef && state.progRef.planId && planById(state.progRef.planId)) return state.progRef;
    const uid = state.athleteIdx ? P.athleteProfile[state.athleteIdx] : '';
    const skip = state.publishedPlanId || '';
    if(uid){
      const mine = P.asgAll.filter(a => a.user_id === uid && a.plan_id !== skip).sort((a, b) => String(b.assigned_at || '').localeCompare(String(a.assigned_at || '')));
      if(mine.length) return { planId: mine[0].plan_id, uid, auto: true };
    }
    if(state.team){
      const p = P.plans.find(x => x.id !== skip && norm(x.team) === norm(state.team));
      if(p) return { planId: p.id, uid: '', auto: true };
    }
    return null;
  }

  async function loadRef(){
    await loadBase();
    if(window.TpStatus){ try { P.status = await TpStatus.loadAll(); } catch(e){ P.status = null; } }
    const ref = currentRef();
    P.ref = ref;
    if(!ref){ P.data = null; return; }
    const key = ref.planId + '|' + (ref.uid || '');
    if(P.data && P.data.key === key) return;
    if(P.loadingKey === key) return;
    P.loadingKey = key;
    const sb = sbc();
    const single = ref.uid && ref.uid !== '__done';
    const [lg, vs] = await Promise.all([
      single ? sb.from('tp_logs').select('*').eq('plan_id', ref.planId).eq('user_id', ref.uid)
             : sb.from('tp_logs').select('*').eq('plan_id', ref.planId),
      sb.from('tp_plan_versions').select('*').eq('plan_id', ref.planId).order('from_week'),
    ]);
    P.loadingKey = '';
    const logs = lg.data || [];
    const plan = planById(ref.planId);
    // je Person und Übung: Wochenwerte + Vorschlag aus der letzten Einheit mit Eintrag
    const per = {};   // key -> { label, cat, users: { uid -> { weeks: {w: judge}, last: judge, notes:[] } } }
    logs.slice().sort((a, b) => a.week - b.week || a.day - b.day).forEach(l => (l.exercises || []).forEach(ex => {
      if(SET_CATS.indexOf(ex.cat) === -1 || ex.status === 'skipped') return;
      const exx = ex.status === 'swapped' && ex.swappedTo ? Object.assign({}, ex, { name: ex.swappedTo, position: '', option: '' }) : ex;
      const k = keyOf(exx);
      const j = judge(exx, l.week);
      const e = per[k] = per[k] || { label: labelOf(exx), name: norm(exx.name), cat: ex.cat, users: {} };
      const u = e.users[l.user_id] = e.users[l.user_id] || { weeks: {}, last: null, notes: [] };
      if(ex.athleteNote) u.notes.push(`W${l.week}: ${ex.athleteNote}`);
      if(!j) return;
      u.weeks[l.week] = j;   // letzte Einheit der Woche gewinnt
      u.last = j;
    }));
    const latest = (vs.data || []).filter(v => !v.user_ids).pop() || (vs.data || []).slice(-1)[0] || null;
    P.data = { key, plan, logs, per, versions: vs.data || [], content: latest ? latest.content : null,
      users: single ? [ref.uid] : (ref.uid === '__done' ? progressOf(ref.planId).filter(x => x.left === 0 && x.total > 0).map(x => x.uid) : membersOf(ref.planId)) };
  }

  // Vorschlag für eine Übung des neuen Plans
  function suggestionFor(item){
    if(!P.data) return null;
    const k = keyOf(item);
    let e = P.data.per[k];
    if(!e){ const n = norm(item.name); e = Object.values(P.data.per).find(x => x.name === n); }
    if(!e) return null;
    const list = P.data.users.map(u => ({ uid: u, j: (e.users[u] || {}).last })).filter(x => x.j);
    if(!list.length) return null;
    return { e, list };
  }

  /* ---------- Übernehmen ---------- */
  function applyTo(item, sug){
    const list = sug.list;
    const kgTargets = list.map(x => x.j.newKg).filter(v => v != null);
    const sameKg = kgTargets.length === list.length && kgTargets.every(v => v === kgTargets[0]);
    if(sameKg && kgTargets[0] > 0){
      const t = fmt(kgTargets[0]) + ' kg';
      item.note = /\d+(?:[.,]\d+)?\s*kg/i.test(item.note || '') ? item.note.replace(/\d+(?:[.,]\d+)?\s*kg/i, t) : [t, item.note].filter(Boolean).join(' · ');
    } else if(list.length === 1 && list[0].j.newVal){
      const j = list[0].j;
      item.preset = `${j.planned}x${fmt(j.newVal)}${j.unit === 's' ? ' Sek.' : ''}`;
    } else {
      // Gruppe mit unterschiedlichen Gewichten: allgemeiner Hinweis (ohne Zahl + „kg“, sonst würde die App ihn als Gewicht vorbelegen)
      const up = list.filter(x => x.j.cls === 'up').length, down = list.filter(x => x.j.cls === 'down').length;
      const txt = up >= list.length / 2 ? 'Progression: Gewicht/Wdh steigern' : (down >= list.length / 2 ? 'Progression: leichter, Technik' : 'Progression: halten, alle Sätze sauber');
      item.note = [txt, (item.note || '').replace(/Progression:[^·]*/, '').replace(/^\s*·\s*|\s*·\s*$/g, '')].filter(Boolean).join(' · ');
    }
    saveState(true);
  }

  /* ---------- Hinweise im Editor ---------- */
  function hintHtml(sug){
    const list = sug.list;
    if(list.length === 1){
      const j = list[0].j;
      return `<span class="tpp-${j.cls}">${H(j.text)}</span> <span class="tpp-d">zuletzt ${H(j.detail)} · ${H(j.why)}</span>`;
    }
    const c = { up: 0, same: 0, fill: 0, down: 0 };
    list.forEach(x => { c[x.j.cls]++; });
    const kg = list.map(x => x.j.newKg).filter(v => v != null);
    const sameKg = kg.length === list.length && kg.every(v => v === kg[0]);
    return `<span class="tpp-d">Gruppe (${list.length}):</span> ${c.up ? `<span class="tpp-up">↑ ${c.up}</span> ` : ''}${c.same + c.fill ? `<span class="tpp-same">= ${c.same + c.fill}</span> ` : ''}${c.down ? `<span class="tpp-down">↓ ${c.down}</span> ` : ''}` +
      (sameKg && kg[0] ? `<span class="tpp-d">→ alle ${fmt(kg[0])} kg</span>` : '') +
      `<details class="tpp-det"><summary>je Person</summary>${list.map(x => `<div><b>${H(P.names[x.uid] || '–')}</b> <span class="tpp-${x.j.cls}">${H(x.j.text)}</span> <span class="tpp-d">${H(x.j.detail)}</span></div>`).join('')}</details>`;
  }

  function decorate(){
    if(!P.data || !dayPanelsEl) return;
    const panels = dayPanelsEl.children;
    for(let d = 1; d <= state.days; d++){
      const panel = panels[d - 1]; if(!panel) continue;
      panel.querySelectorAll('.section[data-cat]').forEach(sec => {
        const cat = sec.dataset.cat;
        if(SET_CATS.indexOf(cat) === -1) return;
        const list = (state.plan[d] || {})[cat] || [];
        sec.querySelectorAll('table.ex-table tbody tr').forEach((tr, idx) => {
          const item = list[idx]; if(!item) return;
          const cell = tr.querySelector('.name-cell'); if(!cell || cell.querySelector('.tpp-hint')) return;
          const sug = suggestionFor(item); if(!sug) return;
          const div = document.createElement('div');
          div.className = 'tpp-hint';
          div.innerHTML = hintHtml(sug) + ' <button type="button" class="ghost small tpp-take" title="Vorschlag in Notiz/Vorgabe eintragen">übernehmen</button>';
          div.querySelector('.tpp-take').addEventListener('click', ev => {
            ev.preventDefault();
            applyTo(item, sug);
            const n = tr.querySelector('input[data-f=note]'), p = tr.querySelector('input[data-f=preset]');
            if(n) n.value = item.note || ''; if(p) p.value = item.preset || '';
            ev.target.textContent = '✓ übernommen'; ev.target.disabled = true;
          });
          cell.appendChild(div);
        });
      });
    }
  }

  /* ---------- Reiter „Abgeschlossener Plan“ ---------- */
  function refBarHtml(){
    const ref = P.ref;
    const finTxt = id => { const pr = progressOf(id); const f = pr.filter(x => x.left === 0 && x.total > 0).length; return pr.length ? ` · ${f}/${pr.length} fertig` : ''; };
    const opts = P.plans.map(p => `<option value="${p.id}" ${ref && ref.planId === p.id ? 'selected' : ''}>${H(p.title || 'Ohne Titel')}${p.team ? ' · ' + H(p.team) : ''} (${new Date(p.created_at).toLocaleDateString('de-DE')})${finTxt(p.id)}${p.archived ? ' – archiviert' : ''}</option>`).join('');
    const mem = ref ? membersOf(ref.planId) : [];
    const prog = {}; (ref ? progressOf(ref.planId) : []).forEach(x => { prog[x.uid] = x; });
    const nFin = mem.filter(u => prog[u] && prog[u].left === 0 && prog[u].total > 0).length;
    const st = u => { const x = prog[u]; if(!x) return ''; return x.left === 0 ? ' – ✓ fertig' : ` – noch ${x.left} von ${x.total}`; };
    const sorted = mem.slice().sort((a, b) => ((prog[a] || {}).left || 0) - ((prog[b] || {}).left || 0) || (P.names[a] || '').localeCompare(P.names[b] || '', 'de'));
    return `<div class="tpp-tools">
      <div><label>Bezugsplan (abgeschlossen)</label><select id="tppPlan"><option value="">– wählen –</option>${opts}</select></div>
      <div><label>Für wen</label><select id="tppWho"><option value="">Ganze Gruppe (${mem.length})</option>${nFin ? `<option value="__done" ${ref && ref.uid === '__done' ? 'selected' : ''}>✓ Nur fertige (${nFin})</option>` : ''}${sorted.map(u => `<option value="${u}" ${ref && ref.uid === u ? 'selected' : ''}>${H(P.names[u] || 'Unbekannt')}${st(u)}</option>`).join('')}</select></div>
      ${ref && ref.auto ? '<span class="tpp-d" style="align-self:center;">automatisch gewählt (letzter Plan der Person/Gruppe im Entwurf)</span>' : ''}
    </div>`;
  }

  function cellHtml(e, w){
    const us = P.data.users.map(u => (e.users[u] || {}).weeks || {}).map(x => x[w]).filter(Boolean);
    if(!us.length) return '<td class="tpp-c muted">–</td>';
    if(us.length === 1 && P.data.users.length === 1){
      const j = us[0];
      return `<td class="tpp-c">${j.doneSets}/${j.planned} × ${j.vals.map(fmt).join('/')}${j.kg ? `<br><b>${fmt(j.kg)} kg</b>` : ''}</td>`;
    }
    const sets = us.reduce((n, j) => n + j.doneSets, 0), pl = us.reduce((n, j) => n + j.planned, 0);
    const kgs = us.map(j => j.kg).filter(Boolean).sort((a, b) => a - b);
    return `<td class="tpp-c">${us.length} P. · ${Math.round(sets / pl * 100)} %${kgs.length ? `<br>${fmt(kgs[0])}${kgs.length > 1 && kgs[kgs.length - 1] !== kgs[0] ? '–' + fmt(kgs[kgs.length - 1]) : ''} kg` : ''}</td>`;
  }

  function draftItems(key, name){
    const out = [];
    for(let d = 1; d <= state.days; d++) SET_CATS.forEach(c => ((state.plan[d] || {})[c] || []).forEach(it => {
      if(keyOf(it) === key || norm(it.name) === name) out.push(it);
    }));
    return out;
  }

  function renderView(){
    const view = document.getElementById('tppView'); if(!view) return;
    if(!P.plans){ view.innerHTML = '<div class="card"><p class="hint" style="margin:0;">Lade …</p></div>'; return; }
    // Karte „Anschlusspläne vorbereiten“ (fertig / noch 1–2 Einheiten) oben im Reiter
    let html = '';
    if(window.TpStatus && P.status){ try { TpStatus.css(); html += TpStatus.cardHtml(P.status); } catch(e){} }
    html += `<div class="card">${refBarHtml()}`;
    if(!P.ref || !P.data){
      html += `<p class="hint">Noch kein Bezugsplan. Wähle oben einen abgeschlossenen Plan – oder in der Auswertung „➜ Anschlussplan“.</p></div>`;
      view.innerHTML = html; wire(); return;
    }
    const d = P.data, weeks = Array.from({ length: d.plan.weeks || 1 }, (_, i) => i + 1);
    const withData = d.users.filter(u => Object.values(d.per).some(e => e.users[u] && e.users[u].last));
    html += `<p class="tpp-d" style="margin:10px 0;">${H(d.plan.title || 'Ohne Titel')} · ${d.plan.weeks} Wochen · ${P.ref.uid && P.ref.uid !== '__done' ? H(P.names[P.ref.uid] || '') : (P.ref.uid === '__done' ? d.users.length + ' fertige Person(en): ' + d.users.map(u => H(P.names[u] || '')).join(', ') : withData.length + ' von ' + d.users.length + ' Personen mit Einträgen')}. Vorschlag aus der jeweils letzten Einheit: <span class="tpp-up">↑ steigern</span> (alle Sätze am oberen Ende der Vorgabe) · <span class="tpp-same">= halten</span> · <span class="tpp-down">↓ zurücknehmen</span> (deutlich unter der Vorgabe).</p>`;
    // Reihenfolge wie im Bezugsplan (Tag, Kategorie), danach übrige Übungen
    const order = [], seen = {};
    const c = d.content || {};
    for(let day = 1; day <= (parseInt(c.days, 10) || d.plan.days || 1); day++){
      const pd = (c.plan || {})[day] || (c.plan || {})[String(day)] || {};
      SET_CATS.forEach(cat => (pd[cat] || []).forEach(it => { const k = keyOf(it); if(d.per[k] && !seen[k]){ seen[k] = 1; order.push({ k, day }); } }));
    }
    Object.keys(d.per).forEach(k => { if(!seen[k]){ seen[k] = 1; order.push({ k, day: null }); } });
    let lastDay = -1;
    html += `<div class="tablewrap" style="overflow-x:auto;"><table class="tpp-table"><thead><tr><th>Übung</th>${weeks.map(w => `<th>W${w}</th>`).join('')}<th>Vorschlag</th><th>Im neuen Plan</th></tr></thead><tbody>`;
    order.forEach(({ k, day }) => {
      const e = d.per[k];
      if(day !== lastDay){ html += `<tr class="tpp-dayrow"><td colspan="${weeks.length + 3}">${day ? 'Tag ' + day : 'Weitere / getauscht / extra'}</td></tr>`; lastDay = day; }
      const sug = { e, list: d.users.map(u => ({ uid: u, j: (e.users[u] || {}).last })).filter(x => x.j) };
      const notes = d.users.flatMap(u => ((e.users[u] || {}).notes || []).map(n => (d.users.length > 1 ? (P.names[u] || '') + ' ' : '') + n));
      const inDraft = draftItems(k, e.name);
      html += `<tr><td><span class="tpp-dot" style="background:${CAT_COLOR[e.cat] || '#888'}"></span><b>${H(e.label)}</b><div class="tpp-d">${H(CAT_LABEL[e.cat] || '')}</div>${notes.length ? (notes.length > 2 ? `<details class="tpp-note"><summary>💬 ${notes.length} Notizen</summary>${notes.map(H).join('<br>')}</details>` : `<div class="tpp-note">💬 ${notes.map(H).join('<br>💬 ')}</div>`) : ''}</td>
        ${weeks.map(w => cellHtml(e, w)).join('')}
        <td class="tpp-sug">${sug.list.length ? hintHtml(sug) : '<span class="muted">keine Einträge</span>'}</td>
        <td>${sug.list.length ? (inDraft.length ? `<button type="button" class="ghost small" data-take="${H(k)}">übernehmen (${inDraft.length}×)</button>` : `<button type="button" class="ghost small" data-add="${H(k)}">+ in Tag ${day || state.activeDay || 1}</button>`) : ''}</td></tr>`;
    });
    html += `</tbody></table></div><p class="hint">„übernehmen“ trägt den Vorschlag in die Notiz (kg – die App belegt das Gewicht damit vor) bzw. die Vorgabe (Wdh/Sek.) der gleichen Übung im neuen Plan ein. Bei Gruppen mit unterschiedlichen Gewichten kommt ein allgemeiner Hinweis in die Notiz; die Athlet:innen sehen ihr letztes Gewicht in der App.</p></div>`;
    view.innerHTML = html; wire();
    view.querySelectorAll('[data-take]').forEach(b => b.addEventListener('click', () => {
      const e = d.per[b.dataset.take];
      const sug = { e, list: d.users.map(u => ({ uid: u, j: (e.users[u] || {}).last })).filter(x => x.j) };
      draftItems(b.dataset.take, e.name).forEach(it => applyTo(it, sug));
      b.textContent = '✓ übernommen'; b.disabled = true; markDirty();
    }));
    view.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.add, e = d.per[k];
      const src = order.find(o => o.k === k);
      const day = Math.min(state.days, (src && src.day) || state.activeDay || 1);
      // Original-Eintrag (Name/Position/Option) aus dem Bezugsplan
      let orig = null;
      for(let dd = 1; dd <= 7 && !orig; dd++) SET_CATS.forEach(cat => (((c.plan || {})[dd] || {})[cat] || []).forEach(it => { if(!orig && keyOf(it) === k) orig = it; }));
      const it = { name: orig ? orig.name : e.label, position: orig ? orig.position || '' : '', option: orig ? orig.option || '' : '', preset: orig ? orig.preset || '' : '', note: '' };
      state.plan[day] = state.plan[day] || {}; (state.plan[day][e.cat] = state.plan[day][e.cat] || []).push(it);
      const sug = { e, list: d.users.map(u => ({ uid: u, j: (e.users[u] || {}).last })).filter(x => x.j) };
      applyTo(it, sug);
      b.textContent = '✓ in Tag ' + day; b.disabled = true; markDirty();
    }));
  }
  let dirty = false;
  function markDirty(){ dirty = true; const bd = document.getElementById('tppBadge'); if(bd){ bd.hidden = false; } }

  function wire(){
    const ps = document.getElementById('tppPlan'), ws = document.getElementById('tppWho');
    if(ps) ps.onchange = async () => { state.progRef = ps.value ? { planId: ps.value, uid: '' } : null; saveState(true); P.data = null; await refresh(); };
    if(ws) ws.onchange = async () => { state.progRef = { planId: (P.ref || {}).planId || ps.value, uid: ws.value }; saveState(true); P.data = null; await refresh(); };
  }

  async function refresh(){
    try { await loadRef(); } catch(e){ console.warn('Progression: Bezugsplan nicht ladbar', e); }
    renderView();
    if(typeof renderPanels === 'function') renderPanels();
  }

  function show(on){
    const wrap = document.querySelector('.wrap');
    wrap.classList.toggle('tpp-on', on);
    if(on) wrap.classList.remove('tpv-cur');
    document.querySelectorAll('.tpp-bar .tab, .tpv-bar .tab').forEach(t => t.classList.toggle('active', on ? t.dataset.v === 'ref' : t.dataset.v === 'plan' && !wrap.classList.contains('tpv-cur')));
    if(on) renderView();
    else if(dirty){ dirty = false; const bd = document.getElementById('tppBadge'); if(bd) bd.hidden = true; renderPanels(); }
    window.scrollTo({ top: 0 });
  }

  /* ---------- Anschlussplan aus der Auswertung (#folge=) ---------- */
  async function loadFollowUp(planId, uid, wer){
    await loadBase();
    const sb = sbc();
    const p = planById(planId);
    const { data: vs } = await sb.from('tp_plan_versions').select('*').eq('plan_id', planId).order('from_week');
    if(!p || !(vs || []).length){ alert('Bezugsplan konnte nicht geladen werden.'); return; }
    // Stand der letzten Woche (für eine Person: ihre Variante hat Vorrang)
    let ver = null;
    vs.forEach(x => {
      const applies = !x.user_ids || (uid && x.user_ids.indexOf(uid) !== -1);
      if(!applies) return;
      if(!ver || x.from_week > ver.from_week || (x.from_week === ver.from_week && x.user_ids && !ver.user_ids) || (x.from_week === ver.from_week && !!x.user_ids === !!ver.user_ids && x.id > ver.id)) ver = x;
    });
    ver = ver || vs[vs.length - 1];
    if(window.TpStatus){ try { P.status = await TpStatus.loadAll(); } catch(e){} }
    const fertig = wer === 'fertig' ? progressOf(planId).filter(x => x.left === 0 && x.total > 0) : [];
    const who = uid ? (P.names[uid] || 'diese Person') : (fertig.length ? 'die ' + fertig.length + ' Fertigen (' + fertig.map(x => x.name).join(', ') + ')' : '');
    if(!confirm('Anschlussplan an „' + (p.title || 'Ohne Titel') + '“' + (who ? ' für ' + who : '') + ' erstellen?\n\nDie Übungen werden als Vorlage geladen (der aktuell geöffnete Entwurf wird ersetzt). Unter jeder Übung steht dann der Steigerungsvorschlag aus dem abgeschlossenen Plan.')) return;
    const c = ver.content || {};
    let start = '';
    if(p.start_date){ const dt = new Date(p.start_date + 'T00:00:00'); dt.setDate(dt.getDate() + 7 * (p.weeks || 4)); start = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0'); }
    if(!start || (window.TpStatus && start < TpStatus.todayIso())) start = window.TpStatus ? TpStatus.todayIso() : start;
    const base = /\(Folgeplan\)$/.test(p.title || '') ? p.title : (p.title || 'Plan') + ' (Folgeplan)';
    state = Object.assign(defaultState(), JSON.parse(JSON.stringify({ plan: c.plan || {}, prescription: c.prescription, cooldown: c.cooldown || {},
      prepNote: c.prepNote || {}, lang: c.lang || 'de', days: parseInt(c.days, 10) || p.days || 3, weeks: p.weeks || 4, title: base,
      team: p.team || c.team || '', layout: c.layout || (typeof LAYOUTS !== 'undefined' ? LAYOUTS[0].key : ''), start, rotate: c.rotate != null ? !!c.rotate : !!p.rotate })));
    if(!state.prescription && typeof DEFAULT_PRESCRIPTION !== 'undefined') state.prescription = JSON.parse(JSON.stringify(DEFAULT_PRESCRIPTION));
    state.publishedPlanId = ''; state.editingFromApp = false; state.editTargetUid = ''; state.editTargetName = '';
    state.progRef = { planId, uid: uid || (fertig.length ? '__done' : '') };
    state.startAfterPrev = true;   // Anschluss: startet spätestens am Startdatum, früher sobald der laufende Plan erledigt ist
    state.athleteIdx = '';
    const aidOf = u => Object.keys(P.athleteProfile).find(a => P.athleteProfile[a] === u);
    if(uid){ const aid = aidOf(uid); if(aid){ state.athleteIdx = aid; state.pickAthletes = [aid]; } }
    else state.pickAthletes = fertig.map(x => aidOf(x.uid)).filter(Boolean);
    // BM-App: Empfänger:innen im Veröffentlichen-Dialog (Zugangs-IDs) vorauswählen
    state.appTargets = { title: state.title, ids: uid ? [uid] : fertig.map(x => x.uid) };
    if(typeof ensurePrescription === 'function') ensurePrescription();
    state.activeDay = 1;
    for(let d = 1; d <= state.days; d++) ensureDayStructure(d);
    saveState(true);
    if(typeof syncConfigInputs === 'function') syncConfigInputs();
    if(typeof renderPrescriptionTable === 'function') renderPrescriptionTable();
    if(typeof renderTabs === 'function') renderTabs();
    if(typeof tpEditBanner === 'function') tpEditBanner();
    if(typeof tpStep4Render === 'function') tpStep4Render();
    if(typeof renderAppTargets === 'function') renderAppTargets();
    P.data = null;
    await refresh();
    if(typeof toast === 'function') toast('Anschlussplan geladen – Vorschläge stehen unter den Übungen, Ergebnisse im Reiter „📊 Abgeschlossener Plan“');
  }

  /* ---------- Start ---------- */
  async function init(){
    for(let k = 0; k < 100 && !window.appRole; k++) await new Promise(r => setTimeout(r, 100));
    if(window.appRole !== 'admin' && window.appRole !== 'trainer') return;
    for(let k = 0; k < 100 && !window.appSb; k++) await new Promise(r => setTimeout(r, 100));
    if(!window.appSb) return;
    const wrap = document.querySelector('.wrap'), head = wrap && wrap.querySelector('header.top');
    if(!wrap) return;
    const st = document.createElement('style');
    st.textContent = `
      .tpp-bar{ position:sticky; top:0; z-index:30; display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:0 0 16px; padding:8px 0; background:var(--bg, #f5f7fa); }
      .tpp-bar .tab, .tpv-bar .tab[data-v=ref]{ font-size:14px; padding:9px 18px; }
      .tpp-badge[hidden]{ display:none; } .tpp-badge{ display:inline-block; margin-left:6px; background:#1f7a45; color:#fff; border-radius:20px; padding:1px 7px; font-size:11px; }
      .wrap.tpp-on > :not(.tpp-bar):not(.tpv-bar):not(#tppView):not(header.top){ display:none !important; }
      .wrap:not(.tpp-on) > #tppView{ display:none; }
      .tpp-tools{ display:flex; flex-wrap:wrap; gap:10px 14px; align-items:flex-end; }
      .tpp-tools label{ display:block; font-size:10.5px; font-weight:700; color:var(--muted, #667); text-transform:uppercase; letter-spacing:.3px; margin-bottom:4px; }
      .tpp-tools select{ min-width:240px; max-width:100%; }
      .tpp-table{ width:100%; border-collapse:collapse; font-size:13px; }
      .tpp-table th{ text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.3px; color:var(--muted, #667); padding:6px 8px; border-bottom:2px solid var(--border, #dde); white-space:nowrap; }
      .tpp-table td{ padding:7px 8px; border-bottom:1px solid var(--border, #e5e7eb); vertical-align:top; }
      .tpp-table td.tpp-c{ white-space:nowrap; font-size:12.5px; }
      .tpp-dayrow td{ background:var(--surface-2, #f1f4f8); font-weight:700; font-size:12px; text-transform:uppercase; letter-spacing:.3px; }
      .tpp-dot{ display:inline-block; width:9px; height:9px; border-radius:50%; margin-right:6px; }
      .tpp-d{ color:var(--muted, #667); font-size:12px; }
      .tpp-note summary{ cursor:pointer; } .tpp-note{ color:#6b5a00; background:#fff8e1; border-radius:6px; padding:3px 6px; font-size:12px; margin-top:4px; }
      .tpp-up{ color:#1f7a45; font-weight:700; } .tpp-same, .tpp-fill{ color:#7a6400; font-weight:700; } .tpp-down{ color:#b03a2e; font-weight:700; }
      .tpp-hint{ margin-top:4px; font-size:12px; line-height:1.4; white-space:normal; }
      .tpp-hint button{ padding:2px 8px; font-size:11.5px; margin-left:4px; }
      .tpp-det{ display:inline-block; margin-left:6px; } .tpp-det summary{ cursor:pointer; color:var(--muted, #667); font-size:12px; }
      .tpp-det div{ font-size:12px; padding:2px 0; }
      .tpp-sug{ min-width:200px; }
      .tpp-sched{ margin:6px 0 4px; font-size:13px; } .tpp-sched label{ display:flex; gap:6px; align-items:center; font-weight:500; text-transform:none; letter-spacing:0; }
      .tpp-sched #tppSchedInfo{ margin-top:3px; }`;
    document.head.appendChild(st);
    let bar = document.querySelector('.tpv-bar');
    if(bar){
      // BM-App: Reiter in die vorhandene Leiste „Planung | Aktuelle Pläne“ einhängen
      bar.insertAdjacentHTML('beforeend', `<div class="tab" data-v="ref">📊 Abgeschlossener Plan<span class="tpp-badge" id="tppBadge" hidden>✓</span></div>`);
      bar.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => { if(t.dataset.v !== 'ref') show(false); }, true));
    } else {
      bar = document.createElement('div');
      bar.className = 'tpp-bar';
      bar.innerHTML = `<div class="tab active" data-v="plan">📝 Neuer Plan</div><div class="tab" data-v="ref">📊 Abgeschlossener Plan<span class="tpp-badge" id="tppBadge" hidden>✓</span></div>`;
      if(head) head.after(bar); else wrap.prepend(bar);
      bar.querySelector('[data-v=plan]').addEventListener('click', () => show(false));
    }
    bar.querySelector('[data-v=ref]').addEventListener('click', () => show(true));
    const view = document.createElement('div');
    view.id = 'tppView';
    wrap.appendChild(view);

    // Hinweise nach jedem Neuaufbau der Tages-Panels
    const orig = renderPanels;
    renderPanels = function(){ orig.apply(this, arguments); try { decorate(); } catch(e){ console.warn(e); } };

    schedUi();
    const m = location.hash.match(/^#folge=([0-9a-f-]{36})(?:&uid=([0-9a-f-]{36}))?(?:&wer=(fertig))?$/i);
    if(m){ history.replaceState(null, '', location.pathname + location.search); await loadFollowUp(m[1], m[2] || '', m[3] || ''); schedSync(); return; }
    await refresh();
  }
  /* ---------- Terminieren: Startdatum in der Zukunft + „früher starten“ ---------- */
  function schedUi(){
    const inp = document.getElementById('cfgStart'); if(!inp || document.getElementById('tppSched')) return;
    const box = document.createElement('div');
    box.id = 'tppSched'; box.className = 'tpp-sched';
    box.innerHTML = `<label><input type="checkbox" id="tppAfter"> erst nach Abschluss des laufenden Plans starten</label><div id="tppSchedInfo" class="tpp-d"></div>`;
    inp.parentNode.appendChild(box);
    box.querySelector('#tppAfter').addEventListener('change', e => { state.startAfterPrev = e.target.checked; saveState(true); schedSync(); });
    inp.addEventListener('change', () => setTimeout(schedSync, 0));
    inp.addEventListener('input', () => setTimeout(schedSync, 0));
    if(typeof syncConfigInputs === 'function'){ const o = syncConfigInputs; syncConfigInputs = function(){ const r = o.apply(this, arguments); schedSync(); return r; }; }
    schedSync();
  }
  function schedSync(){
    const cb = document.getElementById('tppAfter'), info = document.getElementById('tppSchedInfo'); if(!cb || !info) return;
    cb.checked = !!state.startAfterPrev;
    const fut = window.TpStatus && TpStatus.isFuture(state.start);
    info.innerHTML = state.startAfterPrev
      ? `⏭ Wer noch einen laufenden Plan hat, macht ihn zuerst fertig und bekommt diesen Plan direkt danach${fut ? ` – spätestens am ${TpStatus.deDate(state.start)}` : ''}. Wer schon fertig ist, bekommt ihn sofort.`
      : (fut ? `📅 <b>Terminiert:</b> Wer schon einen Plan hat, behält ihn bis ${TpStatus.deDate(state.start)}; danach gilt dieser Plan automatisch.` : '');
  }

  // Bezug neu bestimmen, wenn Person/Gruppe im Entwurf wechselt (nur automatischer Bezug)
  document.addEventListener('change', ev => {
    const id = ev.target && ev.target.id;
    if((id === 'cfgAthlete' || id === 'cfgTeam') && !(state.progRef && state.progRef.planId)){ P.data = null; setTimeout(refresh, 50); }
  });
  // Links „➜ Anschlussplan“ auf derselben Seite (nur der #-Teil ändert sich) direkt ausführen
  window.addEventListener('hashchange', async () => {
    const m = location.hash.match(/^#folge=([0-9a-f-]{36})(?:&uid=([0-9a-f-]{36}))?(?:&wer=(fertig))?$/i);
    if(!m) return;
    history.replaceState(null, '', location.pathname + location.search);
    await loadFollowUp(m[1], m[2] || '', m[3] || ''); schedSync(); show(false);
  });
  window.TpProgression = { judge, refresh, show };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
