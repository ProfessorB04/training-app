/* ===== Vorhandenen Plan als Grundlage laden (2026-11-25, BM-Fassung der Sportschul-Funktion tp_base.js 1.2.5) =====
   App-Pläne (laufend/beendet/archiviert, inkl. Fassungen einzelner Personen), gespeicherte Pläne (tp_saved_plans),
   letzter Stand je Gruppe und Excel-Exporte je Person. Geladen wird immer eine KOPIE – das Original bleibt unverändert.
   Link: trainingsplan.html#base=<planId>[&uid=<userId>] */
(function(){
  'use strict';
  const H = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
  // Suche ohne Leerzeichen-Falle: „Gruppe1“ findet auch „Gruppe 1“
  const hit = (text, q) => { const h = fold(text), t = h + ' ' + h.replace(/[\s·–\-]+/g, ''); return fold(q).split(/\s+/).filter(Boolean).every(w => t.indexOf(w) !== -1); };
  const count = s => { let n = 0; for(let d = 1; d <= (s.days || 0); d++) Object.keys((s.plan || {})[d] || {}).forEach(k => { n += (s.plan[d][k] || []).length; }); return n; };
  // Supabase liefert höchstens 1000 Zeilen je Abfrage → seitenweise
  async function all(mk){
    const out = [];
    for(let from = 0; ; from += 1000){
      const r = await mk().range(from, from + 999);
      if(r.error) throw new Error(r.error.message);
      out.push(...(r.data || []));
      if((r.data || []).length < 1000) return out;
    }
  }
  async function rowsLoad(){
    const sb = window.appSb; if(!sb) throw new Error('Keine Verbindung zur App.');
    const [pl, vs, asg, pr, sv] = await Promise.all([
      all(() => sb.from('tp_plans').select('*').order('created_at', { ascending: false }).order('id')),
      all(() => sb.from('tp_plan_versions').select('id,plan_id,from_week,content,user_ids').order('id')),
      all(() => sb.from('tp_assignments').select('plan_id,user_id,active').order('plan_id').order('user_id')),
      all(() => sb.from('profiles').select('id,name').order('id')),
      all(() => sb.from('tp_saved_plans').select('*').order('updated_at', { ascending: false }).order('id')).catch(() => []),
    ]);
    const name = Object.fromEntries(pr.map(p => [p.id, p.name]));
    const names = us => [...new Set(us)].map(u => name[u]).filter(Boolean).sort((x, y) => x.localeCompare(y, 'de'));
    const newest = list => list.slice().sort((x, y) => y.from_week - x.from_week || y.id - x.id)[0];
    const fromContent = (c, p) => ({ plan: c.plan || {}, prescription: c.prescription, cooldown: c.cooldown || {}, prepNote: c.prepNote || {}, lang: c.lang || 'de',
      days: parseInt(c.days, 10) || p.days || 3, weeks: p.weeks || 4, rotate: c.rotate != null ? !!c.rotate : !!p.rotate, layout: c.layout, title: p.title || c.title || '', team: p.team || c.team || '' });
    const fromState = (s, t) => ({ plan: s.plan || {}, prescription: s.prescription, cooldown: s.cooldown || {}, prepNote: s.prepNote || {}, lang: s.lang || 'de', days: s.days, weeks: s.weeks, rotate: !!s.rotate, layout: s.layout, title: t, team: s.team || '' });
    const rows = [];
    pl.forEach(p => {
      const mine = vs.filter(v => v.plan_id === p.id); if(!mine.length) return;
      const g = newest(mine.filter(v => !v.user_ids)) || newest(mine);
      const act = asg.filter(a => a.plan_id === p.id && a.active).map(a => a.user_id), ever = asg.filter(a => a.plan_id === p.id).map(a => a.user_id);
      const r = { kind: 'app', id: p.id, title: p.title || 'Ohne Titel', team: p.team || '', date: p.created_at, badge: p.archived ? 'Archiv' : act.length ? 'in Nutzung' : ever.length ? 'beendet' : 'nicht zugewiesen',
        appTitle: (g.content && g.content.appTitle) || '', people: names(act.length ? act : ever), src: fromContent(g.content || {}, p), vars: [] };
      const vu = {}; mine.filter(v => v.user_ids && v.user_ids.length).sort((x, y) => x.from_week - y.from_week || x.id - y.id).forEach(v => v.user_ids.forEach(u => { vu[u] = v; }));
      const byV = {}; Object.keys(vu).forEach(u => (byV[vu[u].id] = byV[vu[u].id] || { v: vu[u], us: [] }).us.push(u));
      Object.values(byV).forEach(x => { const ns = names(x.us); if(ns.length) r.vars.push({ uids: x.us, names: ns, src: fromContent(x.v.content || {}, p) }); });
      rows.push(r);
    });
    sv.forEach(e => { const c = e.content || {}; rows.push({ kind: 'lib', id: 'lib:' + e.id, title: e.title || 'Plan', team: e.team || c.team || '', date: e.updated_at, badge: 'gespeichert', appTitle: c.appTitle || '', people: e.athlete ? [e.athlete] : [], src: fromState(c, e.title || c.title || ''), vars: [] }); });
    // automatische Stände nur, wenn sie nicht schon als App-/gespeicherter Plan in der Liste stehen
    const seen = new Set(rows.map(r => JSON.stringify(r.src.plan)));
    const auto = (id, e, title, team, badge, people) => { if(!e || !e.state) return; const k = JSON.stringify(e.state.plan || {}); if(seen.has(k)) return; seen.add(k);
      rows.push({ kind: 'auto', id, title, team, date: e.savedAt, badge, appTitle: e.state.appTitle || '', people, src: fromState(e.state, title), vars: [] }); };
    Object.keys(GROUP_PLANS || {}).forEach(g => auto('grp:' + g, GROUP_PLANS[g], (GROUP_PLANS[g] && GROUP_PLANS[g].state && GROUP_PLANS[g].state.title) || 'Letzter Stand ' + g, g, 'letzter Stand der Gruppe', []));
    Object.keys(ATHLETE_PLANS || {}).forEach(id => { const a = ATHLETES.find(x => x.id === id); (ATHLETE_PLANS[id] || []).forEach((e, i) => auto('ath:' + id + ':' + i, e, e.title || (e.state && e.state.title) || 'Plan', e.team || '', 'Excel-Export', a ? [athleteDisplayName(a, false)] : [])); });
    return rows.filter(r => count(r.src) > 0).sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')));
  }
  const ask = label => count(state) === 0 || confirm('„' + label + '“ als Grundlage laden?\n\nDer gerade geöffnete Stand wird ersetzt (vorher ggf. „💾 Plan speichern“). Der ausgewählte Plan selbst bleibt unverändert.');
  function load(src, label, keepTeam){
    const c = JSON.parse(JSON.stringify(src)), base = {};
    Object.keys(c.plan || {}).forEach(d => { base[d] = {}; Object.keys(c.plan[d] || {}).forEach(k => { (c.plan[d][k] || []).forEach(x => { delete x.was; }); base[d][k] = (c.plan[d][k] || []).map(x => x.name); }); });
    const cur = (state.team || '').trim(), from = (c.team || '').trim();
    const t = (c.title || label || 'Plan').replace(/(\s*\((Kopie|Folgeplan)\))+$/, '');
    Object.assign(c, { team: keepTeam && cur ? cur : (GROUPS.includes(from) ? from : cur), title: t + ' (Kopie)', start: '', appTitle: '', startAfterPrev: false, athleteIdx: '',
      nameOrder: state.nameOrder || 'first', boardBase: base, boardBaseName: label || t, layout: c.layout || LAYOUTS[0].key });
    if(!c.prescription) delete c.prescription;
    tpApplyLoadedState(c, { savedPlanId: null, savedPlanName: null, savedPlanAthlete: null, publishedPlanId: null, editingFromApp: false, editTargetUid: '', editTargetName: '', appTargets: null, progRef: null });
    if(window.TpProgression){ TpProgression.show(false); TpProgression.refresh(); }
    const tab = document.querySelector('.tpv-bar .tab[data-v="plan"]'); if(tab) tab.click();
    toast('Grundlage „' + (label || t) + '“ geladen – Name, Startdatum und Übungen anpassen');
    const ti = document.getElementById('cfgTitle');
    if(ti){ ti.style.scrollMarginTop = '120px'; ti.scrollIntoView({ behavior: 'smooth', block: 'start' }); ti.focus({ preventScroll: true }); ti.select(); }
  }
  async function open(){
    const host = document.createElement('div');
    host.innerHTML = `<div id="bsScrim" style="position:fixed;inset:0;background:rgba(10,14,30,.45);z-index:9998;display:flex;align-items:flex-start;justify-content:center;padding:30px 14px;overflow-y:auto;">
      <div style="background:#fff;border-radius:14px;padding:20px 22px;width:100%;max-width:820px;box-shadow:0 20px 50px rgba(0,17,61,.25);" id="bsBox"><p>Lade Pl&auml;ne &hellip;</p></div></div>`;
    document.body.appendChild(host);
    const box = host.querySelector('#bsBox'), qs = s => box.querySelector(s);
    const onKey = e => { if(e.key === 'Escape') close(); };
    const close = () => { document.removeEventListener('keydown', onKey); host.remove(); };
    document.addEventListener('keydown', onKey);
    host.querySelector('#bsScrim').addEventListener('click', e => { if(e.target.id === 'bsScrim') close(); });
    let rows;
    try { rows = await rowsLoad(); }
    catch(e){ box.innerHTML = '<p style="color:#b0281c">Pl&auml;ne konnten nicht geladen werden: ' + H(e.message) + '</p><button type="button" id="bsX">Schlie&szlig;en</button>'; qs('#bsX').onclick = close; return; }
    const team = (state.team || '').trim();
    const teams = [...new Set(rows.map(r => r.team).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'de', { numeric: true }));
    const people = [...new Set(rows.flatMap(r => r.people))].sort((x, y) => x.localeCompare(y, 'de'));
    let q = '', fT = teams.includes(team) ? team : '', fP = '', see = '';
    const de = iso => iso ? new Date(iso).toLocaleDateString('de-DE') : '';
    const preview = s => { let o = '<div style="display:flex;gap:14px;flex-wrap:wrap;margin:8px 0 4px;">';
      for(let d = 1; d <= s.days; d++){ const day = (s.plan || {})[d] || {};
        o += `<div style="flex:1 1 180px;min-width:160px;background:#f5f7fa;border-radius:8px;padding:8px 10px;font-size:12.5px;"><b>Tag ${d}</b>` + CATS.map(c => (day[c.key] || []).length ? `<div style="margin-top:4px;"><span style="color:#6b7280;font-size:11px;">${H(c.label)}</span><br>${day[c.key].map(x => H([x.name, x.position, x.option].filter(Boolean).join(' · '))).join('<br>')}</div>` : '').join('') + '</div>'; }
      return o + '</div>'; };
    box.innerHTML = `
      <h2 style="margin:0 0 4px;font-size:18px;">&#128203; Vorhandenen Plan als Grundlage laden</h2>
      <p class="hint" style="margin:0 0 12px;">Es wird eine Kopie geladen, das Original bleibt unver&auml;ndert.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
        <input type="text" id="bsQ" placeholder="Planname, Person &hellip;" style="flex:1 1 220px;min-width:180px;">
        <select id="bsT" style="width:auto;flex:0 1 auto;max-width:220px;"><option value="">Gruppe: alle</option>${teams.map(t => `<option value="${H(t)}" ${t === fT ? 'selected' : ''}>${H(t)}</option>`).join('')}</select>
        <select id="bsP" style="width:auto;flex:0 1 auto;max-width:220px;"><option value="">Person: alle</option>${people.map(t => `<option value="${H(t)}">${H(t)}</option>`).join('')}</select>
      </div>
      ${team ? `<label style="display:flex;gap:6px;align-items:center;font-size:13px;margin:0 0 8px;cursor:pointer;"><input type="checkbox" id="bsKeep" checked style="width:auto;"> Gruppe &bdquo;${H(team)}&ldquo; f&uuml;r den neuen Plan behalten</label>` : ''}
      <div id="bsRows" style="max-height:440px;overflow:auto;border-top:1px solid #e5e7eb;"></div>
      <div style="display:flex;align-items:center;margin-top:14px;"><span id="bsN" class="hint" style="flex:1;margin:0;"></span><button type="button" id="bsClose">Schlie&szlig;en</button></div>`;
    const pick = (src, label) => { if(!ask(label)) return; const keep = qs('#bsKeep') ? qs('#bsKeep').checked : false; close(); load(src, label, keep); };
    const find = id => rows.find(r => r.id === id);
    function list(){
      const v = rows.filter(r => (!fT || r.team === fT) && (!fP || r.people.includes(fP)) && hit([r.title, r.appTitle, r.team, r.badge, r.people.join(' '), r.src.title].join(' '), q));
      qs('#bsN').textContent = v.length + ' von ' + rows.length + ' Plänen';
      qs('#bsRows').innerHTML = v.map(r => `<div style="padding:9px 4px;border-bottom:1px solid #e5e7eb;">
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
            <div style="flex:1 1 260px;min-width:0;"><b>${H(r.title)}</b> <span style="font-size:11px;color:#00113d;background:#dcefff;border-radius:20px;padding:1px 8px;white-space:nowrap;">${H(r.badge)}</span>
              <div class="hint" style="margin:2px 0 0;">${[r.team, r.src.days + ' Tage × ' + r.src.weeks + ' Wochen', count(r.src) + ' Übungen', de(r.date)].filter(Boolean).map(H).join(' · ')}${r.appTitle && r.appTitle !== r.title ? ' · in der App: ' + H(r.appTitle) : ''}</div>
              ${r.people.length ? `<div style="font-size:12px;">${H(r.people.slice(0, 6).join(', ') + (r.people.length > 6 ? ' … (+' + (r.people.length - 6) + ')' : ''))}</div>` : ''}</div>
            <button type="button" class="small" data-see="${H(r.id)}">${see === r.id ? 'Übungen ausblenden' : 'Übungen ansehen'}</button>
            <button type="button" class="small primary" data-take="${H(r.id)}">Als Grundlage laden</button>
          </div>
          ${see === r.id ? preview(r.src) + (r.vars.length ? '<div class="hint" style="margin-top:6px;">Eigene Fassungen:</div>' + r.vars.map((x, i) => `<div style="display:flex;gap:8px;align-items:center;font-size:12.5px;padding:3px 0;"><span style="flex:1;">${H(x.names.join(', '))} (${x.src.days} Tage, ${count(x.src)} Übungen)</span><button type="button" class="small" data-var="${i}" data-of="${H(r.id)}">Diese Fassung laden</button></div>`).join('') : '') : ''}
        </div>`).join('') || `<p class="hint">Kein Plan gefunden.${fT || fP ? ' <a href="#" id="bsAll">Bei allen Gruppen und Personen suchen</a>' : ''}</p>`;
      box.querySelectorAll('[data-see]').forEach(b => b.onclick = () => { see = see === b.dataset.see ? '' : b.dataset.see; list(); });
      box.querySelectorAll('[data-take]').forEach(b => b.onclick = () => { const r = find(b.dataset.take); pick(r.src, r.title); });
      box.querySelectorAll('[data-var]').forEach(b => b.onclick = () => { const r = find(b.dataset.of), x = r.vars[+b.dataset.var]; pick(x.src, r.title + ' – ' + x.names.join(', ')); });
      const al = qs('#bsAll'); if(al) al.onclick = e => { e.preventDefault(); fT = fP = ''; qs('#bsT').value = ''; qs('#bsP').value = ''; list(); };
    }
    qs('#bsQ').oninput = e => { q = e.target.value; list(); };
    qs('#bsT').onchange = e => { fT = e.target.value; list(); };
    qs('#bsP').onchange = e => { fP = e.target.value; list(); };
    qs('#bsClose').onclick = close;
    list(); qs('#bsQ').focus();
  }
  // Knopf vor „💾 Plan speichern“ (die Aktionsleiste entsteht erst nach dem Laden)
  function button(){
    const save = document.getElementById('btnCloudSave');
    if(!save || document.getElementById('btnBasePlan')) return !!save;
    const grp = document.createElement('div'); grp.className = 'tp-actgrp';
    grp.innerHTML = '<span class="tp-actlbl">Start</span>';
    const b = document.createElement('button'); b.id = 'btnBasePlan'; b.type = 'button'; b.className = 'primary';
    b.textContent = '📋 Vorhandenen Plan als Grundlage laden';
    b.title = 'Jeden schon geschriebenen Plan als Kopie laden und für andere verändern';
    b.onclick = open; grp.append(b);
    const g1 = save.closest('.tp-actgrp'); g1.parentNode.insertBefore(grp, g1);
    return true;
  }
  let k = 0; const iv = setInterval(() => { if(button() || ++k > 50) clearInterval(iv); }, 100);
  async function fromHash(){
    const m = location.hash.match(/^#base=([0-9a-f-]{36})(?:&uid=([0-9a-f-]{36}))?$/i); if(!m) return;
    history.replaceState(null, '', location.pathname + location.search);
    for(let i = 0; i < 100 && !window.appSb; i++) await new Promise(r => setTimeout(r, 100));
    try {
      const r = (await rowsLoad()).find(x => x.id === m[1]);
      if(!r){ alert('Plan nicht gefunden oder ohne Übungen.'); return; }
      const v = m[2] && r.vars.find(x => x.uids.includes(m[2])), label = v ? r.title + ' – ' + v.names.join(', ') : r.title;
      if(ask(label)) load(v ? v.src : r.src, label, false);
    } catch(e){ alert('Plan konnte nicht geladen werden: ' + e.message); }
  }
  window.addEventListener('hashchange', fromHash);
  setTimeout(fromHash, 0);
  window.TpBase = { rowsLoad, load, open };
})();
