/* =====================================================================
   Trainingsplan-Status (2026-11-15) – gemeinsam für Sportschul- und Balance-Movement-App
   - welcher Plan gilt für eine Person? (terminierte Pläne: Startdatum in der Zukunft,
     optional „früher starten, sobald der laufende Plan erledigt ist“ = content.startAfterPrev)
   - Fortschritt je Person (erledigte / geplante Einheiten)
   - Karte „✓ Fertig · ⏳ Bald fertig“ in Trainingsplanung und Auswertung (Admin/Trainer)
   Nutzt nur window.appSb bzw. sb (supabase-js oder sb-shim).
   ===================================================================== */
(function(){
  'use strict';
  const client = () => window.appSb || (typeof sb !== 'undefined' ? sb : null);
  const H = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const isFuture = iso => !!iso && String(iso).slice(0, 10) > todayIso();
  const deDate = iso => iso ? new Date(String(iso).slice(0, 10) + 'T00:00:00').toLocaleDateString('de-DE') : '';
  // Auf der Planungsseite selbst nur den #-Teil ändern (wird dort per hashchange geladen), sonst zur Planungsseite
  // BM-App (Supabase, ohne sb-shim): Pläne enden nach Kalender – wer in der letzten Planwoche ist, gilt als „bald fertig“,
  // danach als „fertig“, auch wenn Einheiten offen geblieben sind (Maiks Vorgabe 21.11.2026). Sportschule: nur nach Einheiten.
  const BY_DATE = !document.querySelector('script[src*="sb-shim"]');
  // Kalenderwoche des Plans (1 = erste Woche, > weeks = Zeitraum abgelaufen), null ohne Startdatum
  const weekNo = iso => { if(!iso) return null; const d = Math.floor((new Date(todayIso() + 'T00:00:00') - new Date(String(iso).slice(0, 10) + 'T00:00:00')) / 86400000); return d < 0 ? 0 : Math.floor(d / 7) + 1; };
  const TOOL_URL = document.getElementById('dayPanels') ? '' : (/\.php(\?|#|$)/.test(location.pathname) || document.querySelector('script[src*="sb-shim"]') ? 'trainingsplan.php' : 'trainingsplan.html');

  // gültige Fassung für Woche w und Person (höchste „ab Woche“, eigene Variante hat Vorrang)
  function contentFor(versions, w, uid){
    let best = null;
    (versions || []).forEach(v => {
      const applies = !v.user_ids || v.user_ids.indexOf(uid) !== -1;
      if(!applies || v.from_week > w) return;
      if(!best || v.from_week > best.from_week || (v.from_week === best.from_week && v.user_ids && !best.user_ids)
        || (v.from_week === best.from_week && !!v.user_ids === !!best.user_ids && v.id > best.id)) best = v;
    });
    return best ? best.content : null;
  }
  // geplante Einheiten einer Person (berücksichtigt „Tage im Wechsel“ und Varianten mit weniger Tagen)
  function total(plan, versions, uid){
    let t = 0;
    for(let w = 1; w <= (plan.weeks || 1); w++){
      const c = contentFor(versions, w, uid) || {};
      const n = Math.max(1, Math.min(parseInt(c.days, 10) || plan.days || 1, plan.days || 7));
      const rot = c.rotate != null ? !!c.rotate : !!plan.rotate;
      t += rot && n > 1 ? 1 : n;
    }
    return t;
  }
  // Start/Sichtbarkeit je Zuteilung (Sportschule ab 1.2: je Gruppe) – sonst die des Plans
  const startOf = (a, p) => (a && a.start_date != null && a.start_date !== '') ? a.start_date : (p && p.start_date) || null;
  const afterOf = (a, c) => (a && a.after_prev != null) ? !!a.after_prev : !!(c && c.startAfterPrev);
  const doneCount = (logs, planId, uid) => new Set((logs || []).filter(l => l.plan_id === planId && l.user_id === uid && l.completed).map(l => l.week + '_' + l.day)).size;

  /* Plan, der für die Person gerade gilt.
     D = { plans: {id: plan}, versions: {planId: [..]}, logs: [..] }, actives = aktive Zuordnungen der Person
     Rückgabe { current, queued: [{a, plan, afterPrev}] } */
  function resolve(uid, actives, D){
    const list = (actives || []).filter(a => a.active && D.plans[a.plan_id])
      .sort((x, y) => String(y.assigned_at || '').localeCompare(String(x.assigned_at || '')) || ((y.id || 0) - (x.id || 0)));
    const isDone = a => { const p = D.plans[a.plan_id]; if(doneCount(D.logs, a.plan_id, uid) >= total(p, D.versions[a.plan_id], uid)) return true;
      // BM: Plan endet spätestens mit seiner letzten Kalenderwoche (nur mit festem Startdatum)
      if(!BY_DATE || afterOf(a, contentFor(D.versions[a.plan_id], 1, uid) || {})) return false;
      const w = weekNo(startOf(a, p)); return w != null && w > (p.weeks || 1); };
    function pick(arr){
      for(let i = 0; i < arr.length; i++){
        const a = arr[i], older = arr.slice(i + 1), p = D.plans[a.plan_id];
        if(!older.length) return i;
        const c = contentFor(D.versions[a.plan_id], 1, uid) || {};
        const after = afterOf(a, c), assigned = String(a.assigned_at || '').slice(0, 10);
        // Startdatum erreicht → gilt. Ausnahme „erst nach Abschluss“: NUR wenn der vorige Plan komplett erledigt ist,
        // das Startdatum öffnet ihn nie vorzeitig (Maiks Vorgabe 21.11.2026)
        if(!after && !isFuture(startOf(a, p))) return i;
        if(after){ const j = pick(older); if(j >= 0 && isDone(older[j])) return i; }
      }
      return arr.length ? arr.length - 1 : -1;
    }
    const i = pick(list);
    if(i < 0) return { current: null, queued: [], superseded: [] };
    const queued = list.slice(0, i).reverse().map(a => ({ a, plan: D.plans[a.plan_id], afterPrev: afterOf(a, contentFor(D.versions[a.plan_id], 1, uid)), start: startOf(a, D.plans[a.plan_id]), appTitle: ((contentFor(D.versions[a.plan_id], 1, uid) || {}).appTitle || '').trim() }));
    return { current: list[i], queued, superseded: list.slice(i + 1) };
  }

  // Für „Mein Trainingsplan“: aktuelle Zuordnung der eingeloggten Person bestimmen
  async function currentFor(uid, asg){
    const act = (asg || []).filter(a => a.active);
    if(act.length <= 1) return { current: act[0] || null, queued: [], superseded: [] };
    const ids = [...new Set(act.map(a => a.plan_id))];
    const s = client();
    const [p, v, l] = await Promise.all([
      s.from('tp_plans').select('*').in('id', ids),
      s.from('tp_plan_versions').select('*').in('plan_id', ids),
      s.from('tp_logs').select('plan_id, user_id, week, day, completed').eq('user_id', uid).in('plan_id', ids),
    ]);
    const D = { plans: {}, versions: {}, logs: l.data || [] };
    (p.data || []).forEach(x => { D.plans[x.id] = x; });
    (v.data || []).forEach(x => { (D.versions[x.plan_id] = D.versions[x.plan_id] || []).push(x); });
    const r = resolve(uid, act, D);
    return { current: r.current, queued: r.queued, superseded: r.superseded || [] };
  }

  /* ---------- Übersicht für Admin/Trainer ---------- */
  let CACHE = null, CACHE_AT = 0;
  // Supabase liefert max. 1000 Zeilen je Abfrage → seitenweise laden (sb-shim liefert alles auf einmal)
  async function allRows(mk){
    if(typeof mk().range !== 'function') return mk();
    let out = [];
    for(let from = 0; ; from += 1000){
      const r = await mk().range(from, from + 999);
      if(r.error) return r;
      out = out.concat(r.data || []);
      if(!r.data || r.data.length < 1000) return { data: out };
    }
  }
  async function loadAll(force){
    if(CACHE && !force && Date.now() - CACHE_AT < 20000) return CACHE;
    const s = client();
    const [p, a, v, l, pr] = await Promise.all([
      s.from('tp_plans').select('*'),
      s.from('tp_assignments').select('*'),
      s.from('tp_plan_versions').select('id, plan_id, from_week, user_ids, content'),
      allRows(() => s.from('tp_logs').select('id, plan_id, user_id, week, day, completed, updated_at').eq('completed', true).order('id')),
      s.from('profiles').select('id, name'),
    ]);
    const D = { plans: {}, versions: {}, logs: l.data || [], asg: a.data || [], names: {} };
    (p.data || []).forEach(x => { D.plans[x.id] = x; });
    (v.data || []).forEach(x => { (D.versions[x.plan_id] = D.versions[x.plan_id] || []).push(x); });
    (pr.data || []).forEach(x => { D.names[x.id] = x.name; });
    // je Person: gültiger Plan, Fortschritt, terminierte Pläne
    const byUser = {};
    D.asg.forEach(x => { (byUser[x.user_id] = byUser[x.user_id] || []).push(x); });
    D.people = [];
    D.housekeep = [];
    Object.keys(byUser).forEach(uid => {
      const r = resolve(uid, byUser[uid], D);
      if(!r.current) return;
      const plan = D.plans[r.current.plan_id];
      const tot = total(plan, D.versions[plan.id], uid), dn = doneCount(D.logs, plan.id, uid);
      const c1 = contentFor(D.versions[plan.id], 1, uid) || {};
      const wk = BY_DATE && !afterOf(r.current, c1) ? weekNo(startOf(r.current, plan)) : null;
      D.people.push({ uid, name: D.names[uid] || 'Unbekannt', plan, total: tot, done: dn, left: Math.max(0, tot - dn), queued: r.queued,
        week: wk, lastWeek: wk != null && wk === (plan.weeks || 1), expired: wk != null && wk > (plan.weeks || 1) });
      r.superseded.forEach(x => D.housekeep.push(x));
    });
    D.people.sort((x, y) => x.left - y.left || x.name.localeCompare(y.name, 'de'));
    CACHE = D; CACHE_AT = Date.now();
    return D;
  }
  // Fortschritt aller Personen eines Plans (auch wenn er nicht mehr ihr aktueller ist)
  function planProgress(D, planId){
    const plan = D.plans[planId]; if(!plan) return [];
    const users = [...new Set(D.asg.filter(a => a.plan_id === planId).map(a => a.user_id))];
    return users.map(uid => { const t = total(plan, D.versions[planId], uid), d = doneCount(D.logs, planId, uid); return { uid, name: D.names[uid] || 'Unbekannt', total: t, done: d, left: Math.max(0, t - d) }; })
      .sort((x, y) => x.name.localeCompare(y.name, 'de'));
  }
  // abgelöste (ältere) aktive Zuordnungen beenden, sobald ein terminierter Plan gestartet ist
  async function housekeep(D){
    if(!D.housekeep.length) return;
    const s = client();
    for(const a of D.housekeep){ try { await s.from('tp_assignments').update({ active: false }).eq('plan_id', a.plan_id).eq('user_id', a.user_id); } catch(e){} }
    D.housekeep = [];
  }

  function queuedText(q){
    if(!q || !q.length) return '';
    const x = q[0];
    return `<span class="tps-q" title="bereits terminiert">&#128197; ${H(x.plan.title || 'Ohne Titel')} ${x.afterPrev ? 'nach Abschluss des laufenden Plans' : 'ab ' + deDate(x.start || x.plan.start_date)}</span>`;
  }
  function cardHtml(D, opts){
    // Wer schon einen Folgeplan hat (terminiert / „nach Abschluss“), braucht keinen Hinweis mehr → ausblenden
    const open = D.people.filter(p => !(p.queued && p.queued.length));
    const done = open.filter(p => (p.left === 0 && p.total > 0) || p.expired), soon = open.filter(p => p.left > 0 && !p.expired && (p.left <= 2 || p.lastWeek));
    if(!done.length && !soon.length) return (opts && opts.always) ? `<div class="card tps-card">
      <h2 style="margin-top:0;">&#9203; Anschlusspläne vorbereiten</h2>
      <p class="hint" style="margin:0;">&#10003; Aktuell ist niemand mit dem Plan fertig oder kurz davor (noch 1–2 Einheiten${BY_DATE ? ' oder letzte Planwoche' : ''})${D.people.length ? ' – ' + D.people.length + ' Person' + (D.people.length === 1 ? '' : 'en') + ' mit laufendem Plan' : ''}. Sobald jemand so weit ist, erscheint die Person hier mit „➜ Anschlussplan“.</p>
    </div>` : '';
    const row = p => `<div class="tps-row"><span class="tps-n"><b>${H(p.name)}</b> <span class="tps-m">${H(p.plan.title || 'Ohne Titel')} · ${p.done}/${p.total}${p.left ? ' · noch ' + p.left + ' Einheit' + (p.left === 1 ? '' : 'en') : ''}${p.expired ? ' · <b>Zeitraum beendet</b>' : p.lastWeek ? ' · <b>letzte Woche (' + p.week + '/' + (p.plan.weeks || 1) + ')</b>' : ''}</span></span>` +
      (p.queued.length ? queuedText(p.queued) : `<a class="tps-btn" href="${TOOL_URL}#folge=${p.plan.id}&uid=${p.uid}">&#10140; Anschlussplan</a>`) + `</div>`;
    // Pläne, in denen mehrere fertig sind und noch keinen Anschluss haben → ein Plan für alle Fertigen
    const byPlan = {};
    done.filter(p => !p.queued.length && p.left === 0).forEach(p => { (byPlan[p.plan.id] = byPlan[p.plan.id] || []).push(p); });
    const groupBtns = Object.keys(byPlan).filter(id => byPlan[id].length > 1).map(id => `<a class="tps-btn" href="${TOOL_URL}#folge=${id}&wer=fertig">&#10140; Ein Anschlussplan für alle ${byPlan[id].length} Fertigen aus „${H(D.plans[id].title || 'Ohne Titel')}“</a>`).join(' ');
    return `<div class="card tps-card">
      <h2 style="margin-top:0;">&#9203; Anschlusspläne vorbereiten</h2>
      ${done.length ? `<div class="tps-h">&#10003; Plan fertig${BY_DATE ? ' / Zeitraum beendet' : ''} (${done.length})</div>${done.map(row).join('')}` : ''}
      ${soon.length ? `<div class="tps-h">&#9203; Noch 1–2 Einheiten${BY_DATE ? ' oder letzte Planwoche' : ''} (${soon.length})</div>${soon.map(row).join('')}` : ''}
      ${groupBtns ? `<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;">${groupBtns}</div>` : ''}
      <p class="hint" style="margin-bottom:0;">„➜ Anschlussplan“ legt den neuen Plan mit „erst nach Abschluss des laufenden Plans starten“ an: Wer noch Einheiten offen hat, macht den alten Plan fertig${BY_DATE ? ' (spätestens bis zum Ende seiner letzten Woche)' : ''} und bekommt den neuen automatisch direkt im Anschluss. Alternativ ein Startdatum in der Zukunft wählen.</p>
    </div>`;
  }
  function css(){
    if(document.getElementById('tpsCss')) return;
    const st = document.createElement('style'); st.id = 'tpsCss';
    st.textContent = `.tps-card .tps-h{ font-weight:700; font-size:.85rem; text-transform:uppercase; letter-spacing:.3px; margin:12px 0 4px; color:var(--muted, #5a6072); }
      .tps-row{ display:flex; flex-wrap:wrap; align-items:center; gap:6px 12px; padding:7px 0; border-bottom:1px solid var(--border, #e5e7eb); }
      .tps-n{ flex:1 1 260px; } .tps-m{ color:var(--muted, #5a6072); font-size:.85rem; }
      .tps-btn{ display:inline-block; font-size:.82rem; font-weight:600; padding:5px 10px; border-radius:8px; border:1px solid var(--border, #d7dcda); text-decoration:none; color:inherit; background:#fff; }
      .tps-q{ font-size:.82rem; color:#1f7a45; font-weight:600; }`;
    document.head.appendChild(st);
  }
  async function insertCard(){
    const role = (window.PROFILE && window.PROFILE.role) || window.appRole;
    if(role && role !== 'admin' && role !== 'trainer') return;
    const appEl = document.getElementById('app'); if(!appEl) return;
    const anchor = appEl.querySelector('.menu-grid, .card'); if(!anchor) return;
    let D; try { D = await loadAll(true); } catch(e){ return; }
    housekeep(D);
    const html = cardHtml(D, { always: true }); if(!html) return;
    if(!anchor.isConnected || appEl.querySelector('.tps-card')) return;
    css();
    const box = document.createElement('div'); box.innerHTML = html;
    anchor.parentNode.insertBefore(box.firstElementChild, anchor);
  }
  // Karte in Trainingsplanung (Übersicht) und Auswertung einhängen
  function hook(){
    if(typeof window.renderTpHub === 'function' && !window.renderTpHub.__tps){
      const o = window.renderTpHub;
      window.renderTpHub = function(){ const r = o.apply(this, arguments); setTimeout(insertCard, 0); return r; };
      window.renderTpHub.__tps = true;
    }
    if(typeof window.renderTpEval === 'function' && !window.renderTpEval.__tps){
      const o = window.renderTpEval;
      window.renderTpEval = async function(){ const r = await o.apply(this, arguments); insertCard(); return r; };
      window.renderTpEval.__tps = true;
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
  window.TpStatus = { _cardHtml: cardHtml, cardHtml, css, isFuture, todayIso, deDate, contentFor, total, doneCount, resolve, currentFor, loadAll, planProgress, startOf, afterOf };
})();
