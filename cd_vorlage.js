// ============================================================
// Conditioning: frühere Einheit / früheren Plan als Vorlage nehmen und für andere umbauen (2026-11-25)
// - Übersicht: „📋 Frühere als Vorlage“ + „📋 Als Vorlage“ je Karte → Für wen? · Titel · Datum · Anpassung → Kopie
// - Eingabemaske und Wochenraster (📚): frühere Einheit in den geöffneten Tag holen
// Immer Kopie: neue Block-IDs, keine Zuweisungen, keine Eintragungen. Das Original bleibt unverändert.
// ============================================================
async function cdTplLoad() {
  const [pR, sR, aR, prR, mg] = await Promise.all([
    sb.from('cd_plans').select('*').order('created_at', { ascending: false }),
    sb.from('cd_sessions').select('*').order('created_at', { ascending: false }),
    sb.from('cd_assignments').select('session_id, user_id').eq('active', true),
    sb.from('profiles').select('id, name'),
    loadAthleteData().catch(() => null),
    cdLoadModalities(), cdLoadMethods(),
  ]);
  const err = [sR, aR, prR].map(r => r.error).filter(Boolean)[0];
  if (err) throw err;
  const plans = pR.error ? [] : (pR.data || []), sess = sR.data || [];
  const name = Object.fromEntries((prR.data || []).map(p => [p.id, p.name]));
  const asg = {}; (aR.data || []).forEach(a => { (asg[a.session_id] = asg[a.session_id] || []).push(a.user_id); });
  const uniq = l => [...new Set(l.filter(Boolean))];
  const hasBlocks = s => ((s.content || {}).blocks || []).length > 0;
  const items = [];
  plans.forEach(p => {
    const ss = sess.filter(s => s.plan_id === p.id && hasBlocks(s)).sort((x, y) => x.plan_week - y.plan_week || x.plan_slot - y.plan_slot);
    if (!ss.length) return;
    items.push({ type: 'plan', id: p.id, title: p.title || 'Conditioning', team: p.team || '', forName: p.for_name || '', who: uniq([p.for_name].concat((p.members || []).map(u => name[u]))), date: p.start_date || String(p.created_at || '').slice(0, 10), plan: p, sessions: ss });
  });
  sess.filter(hasBlocks).forEach(s => {
    const p = s.plan_id ? plans.find(x => x.id === s.plan_id) : null;
    const own = s.title && !CD_DEF_TITLE_RE.test(s.title) ? s.title : '';
    const fn = (s.content || {}).forName || (p && p.for_name) || '';
    items.push({ type: s.plan_id ? 'day' : 'sess', id: s.id, title: p ? [p.title, `${L('Woche', 'Week')} ${s.plan_week} · ${L('Tag', 'Day')} ${s.plan_slot}`, own].filter(Boolean).join(' – ') : (own || s.title || 'Conditioning'),
      base: own || (p && p.title) || s.title || 'Conditioning', own, team: s.team || (p && p.team) || '', forName: fn, who: uniq([fn].concat((asg[s.id] || []).map(u => name[u]))),
      date: s.planned_date || String(s.created_at || '').slice(0, 10), sessions: [s] });
  });
  const athletes = mg ? mg.athletes : [], groups = mg ? mg.groups : [];
  return { items, athletes, groups };
}
const cdTplFold = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const cdTplRe = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Namen der bisherigen Person im Titel gegen die neue tauschen („Delia Additional Conditioning“ → „Anna Additional Conditioning“)
function cdTplSwap(title, from, to) {
  let t = String(title || ''), hit = false;
  const f = String(from || '').trim(), n = String(to || '').trim();
  if (!f || !n || f === n) return { t, hit };
  [[f, n], [f.split(' ')[0], n.split(' ')[0]]].forEach(([a, b]) => {
    if (a.length < 3) return;
    t = t.replace(new RegExp('(^|[^\\p{L}])' + cdTplRe(a) + '(?![\\p{L}])', 'giu'), (m, pre) => { hit = true; return pre + b; });
  });
  return { t, hit };
}
// feste Vorgaben (Watt, km/h, Pace) sind nicht individuell · Hinweistexte können die alte Person nennen
function cdTplChecks(item) {
  const bl = item.sessions.flatMap(s => ((s.content || {}).blocks || []));
  const fixed = [...new Set(bl.filter(b => b.int && ['watt', 'speed', 'pace'].includes(b.int.type) && (b.int.min || b.int.max)).map(b => ({ watt: 'Watt', speed: 'km/h', pace: 'Pace' })[b.int.type]))];
  const texts = bl.map(b => b.note).concat(item.sessions.map(s => (s.content || {}).note)).concat(item.plan ? [item.plan.note] : []).filter(Boolean).join(' ');
  const first = String(item.forName || '').trim().split(' ')[0];
  const named = first.length > 2 && new RegExp('(^|[^\\p{L}])' + cdTplRe(first) + '(?![\\p{L}])', 'iu').test(texts) ? first : '';
  return { fixed, named };
}
function cdTplPreview(item) {
  const one = s => ((s.content || {}).blocks || []).slice().sort((x, y) => CD_PHASES.findIndex(p => p.key === x.phase) - CD_PHASES.findIndex(p => p.key === y.phase)).map(b => {
    const ph = CD_PHASES.find(p => p.key === b.phase) || CD_PHASES[1];
    return `<div style="border-left:4px solid ${ph.color};padding:2px 8px;margin:3px 0;font-size:.82rem;"><b>${esc(b.content || cdBLabel(b, true))}</b> &middot; ${esc(cdStructText(b))}${cdIntText(b) ? ' &middot; ' + esc(cdIntText(b)) : ''}</div>`;
  }).join('');
  return item.type === 'plan'
    ? `<div style="max-height:260px;overflow:auto;">${item.sessions.map(s => `<div style="margin:6px 0 2px;font-weight:700;font-size:.82rem;">${L('Woche', 'Week')} ${s.plan_week} &middot; ${L('Tag', 'Day')} ${s.plan_slot}${s.title && !CD_DEF_TITLE_RE.test(s.title) ? ' – ' + esc(s.title) : ''}</div>${one(s)}`).join('')}</div>`
    : one(item.sessions[0]);
}
function cdTplTeam(item, to, X) {
  const n = cdTplFold(to).trim(); if (!n) return item.team || null;
  const g = X.groups.find(x => cdTplFold(x.name) === n); if (g) return g.name;
  const a = X.athletes.find(x => cdTplFold(x.first_name + ' ' + x.last_name).trim() === n);
  if (!a) return item.team || null;
  const gs = X.groups.filter(x => (a.groupIds || []).includes(x.id)).map(x => x.name);
  return gs.includes(item.team) ? item.team : (gs[0] || null);
}
// opts: { only: 'plan:<id>' | 'sess:<id>' } → direkt Schritt 2 · { pick: async ({content,title,item}) } → nur Einheiten, in geöffneten Tag holen · forName: Person des geöffneten Tages
async function cdTemplateDialog(profile, opts) {
  opts = opts || {};
  const host = document.createElement('div');
  const shell = inner => { host.innerHTML = `<div class="modal-scrim"><div class="modal" style="max-width:760px;">${inner}</div></div>`; };
  const onKey = e => { if (e.key === 'Escape') close(); };
  const close = () => { document.removeEventListener('keydown', onKey); host.remove(); };
  document.addEventListener('keydown', onKey);
  shell(`<p class="muted">${L('Lade', 'Loading')}&hellip;</p>`);
  document.body.appendChild(host);
  let X;
  try { X = await cdTplLoad(); } catch (e) { shell(`<p class="error">${L('Fehler', 'Error')}: ${esc(e.message)}</p><div class="modal-actions"><span class="spacer"></span><button type="button" class="secondary" id="ctX">${L('Schlie&szlig;en', 'Close')}</button></div>`); host.querySelector('#ctX').onclick = close; return; }
  const items = opts.pick ? X.items.filter(i => i.type !== 'plan') : X.items;
  const people = [...new Set(items.flatMap(i => i.who))].sort((a, b) => a.localeCompare(b, 'de'));
  let q = '', who = '', kind = 'all', open = '';
  const key = i => (i.type === 'plan' ? 'plan:' : 'sess:') + i.id;
  const KIND = { plan: L('Plan', 'Plan'), day: L('Tag aus Plan', 'Day from plan'), sess: L('Einzel-Einheit', 'Single session') };

  const listStep = () => {
    shell(`<h2>&#128203; ${opts.pick ? L('Fr&uuml;here Einheit laden', 'Load earlier session') : L('Fr&uuml;here Einheit oder Plan als Vorlage', 'Earlier session or plan as template')}</h2>
      <p class="hint" style="margin-top:0;">${L('Es wird eine Kopie verwendet, das Original und seine Eintragungen bleiben unver&auml;ndert.', 'A copy is used; the original and its entries stay unchanged.')}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
        <input type="search" id="ctQ" placeholder="${L('Titel, Person, Inhalt &hellip;', 'Title, athlete, content &hellip;')}" value="${esc(q)}" style="flex:1 1 220px;">
        <select id="ctWho" style="width:auto;"><option value="">${L('Person: alle', 'Athlete: all')}</option>${people.map(p => `<option ${p === who ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
      </div>
      <div class="chips" style="margin-bottom:8px;">${[['all', L('Alle', 'All')], ...(opts.pick ? [] : [['plan', L('Pl&auml;ne', 'Plans')]]), ['sess', L('Einzel-Einheiten', 'Single sessions')], ['day', L('Tage aus Pl&auml;nen', 'Days from plans')]].map(([k, l]) => `<button type="button" class="${kind === k ? '' : 'secondary '}small-btn" data-kind="${k}">${l}</button>`).join('')}</div>
      <div class="cd-libl" id="ctRows" style="max-height:430px;"></div>
      <div class="modal-actions"><span class="spacer hint" id="ctN"></span><button type="button" class="secondary" id="ctX">${L('Abbrechen', 'Cancel')}</button></div>`);
    const rows = () => {
      const words = cdTplFold(q).split(/\s+/).filter(Boolean);
      const v = items.filter(i => (kind === 'all' || i.type === kind) && (!who || i.who.includes(who)) && words.every(w => i._hay.includes(w)));
      host.querySelector('#ctN').textContent = v.length + ' ' + L('von', 'of') + ' ' + items.length;
      host.querySelector('#ctRows').innerHTML = v.slice(0, 150).map(i => {
        const min = Math.round(i.sessions.reduce((n, s) => n + (cdSessionSec(s.content || {}).sec || 0), 0) / 60);
        const meta = [KIND[i.type], i.who.slice(0, 4).join(', ') + (i.who.length > 4 ? ' +' + (i.who.length - 4) : ''), i.type === 'plan' ? `${i.plan.weeks} ${L('Wochen', 'weeks')} × ${i.plan.per_week} ${L('Tage', 'days')}, ${i.sessions.length} ${L('Einheiten', 'sessions')}` : (min ? '≈ ' + min + ' min' : ''), i.date ? cdDate(i.date) : ''].filter(Boolean);
        return `<div style="border:1.5px solid var(--line);border-radius:10px;padding:9px 12px;">
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;"><div style="flex:1 1 260px;min-width:0;"><b>${i.type === 'plan' ? '&#128197; ' : ''}${esc(i.title)}</b><div class="muted-inline">${meta.map(esc).join(' &middot; ')}</div></div>
            <button type="button" class="secondary small-btn" data-see="${key(i)}">${open === key(i) ? L('Ausblenden', 'Hide') : L('Ansehen', 'View')}</button>
            <button type="button" class="small-btn" data-take="${key(i)}">${opts.pick ? L('&Uuml;bernehmen', 'Use') : L('Als Vorlage', 'Use as template')}</button></div>
          ${open === key(i) ? cdTplPreview(i) : ''}</div>`;
      }).join('') || `<p class="muted">${L('Nichts gefunden.', 'Nothing found.')}</p>`;
      host.querySelectorAll('[data-see]').forEach(b => b.onclick = () => { open = open === b.dataset.see ? '' : b.dataset.see; rows(); });
      host.querySelectorAll('[data-take]').forEach(b => b.onclick = () => formStep(items.find(i => key(i) === b.dataset.take)));
    };
    host.querySelector('#ctQ').oninput = e => { q = e.target.value; rows(); };
    host.querySelector('#ctWho').onchange = e => { who = e.target.value; rows(); };
    host.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => { kind = b.dataset.kind; listStep(); });
    host.querySelector('#ctX').onclick = close;
    rows(); host.querySelector('#ctQ').focus();
  };
  items.forEach(i => { i._hay = cdTplFold([i.title, i.team, i.who.join(' '), ...i.sessions.flatMap(s => [s.title, (s.content || {}).note, ...((s.content || {}).blocks || []).flatMap(b => [b.content, b.modality, b.modalityEn, b.note, cdBLabel(b)])])].join(' ')); });

  const formStep = (item) => {
    const isPlan = item.type === 'plan', chk = cdTplChecks(item);
    const baseTitle = isPlan ? item.title : item.base;
    const names = X.athletes.map(a => `${a.first_name} ${a.last_name}`.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, 'de')).concat(X.groups.map(g => g.name));
    const propose = to => { const r = cdTplSwap(baseTitle, item.forName, to); return r.hit ? r.t : baseTitle + (to ? '' : L(' (Kopie)', ' (copy)')); };
    const warn = [chk.fixed.length ? L(`Enth&auml;lt feste Vorgaben (${chk.fixed.join(', ')}) &ndash; f&uuml;r die neue Person anpassen.`, `Contains fixed targets (${chk.fixed.join(', ')}) &ndash; adjust them for the new athlete.`) : '',
      chk.named ? L(`In den Hinweisen steht noch &bdquo;${esc(chk.named)}&ldquo;.`, `The notes still mention &ldquo;${esc(chk.named)}&rdquo;.`) : ''].filter(Boolean);
    shell(`<h2>&#128203; ${opts.pick ? L('Einheit &uuml;bernehmen', 'Use session') : (isPlan ? L('Plan als Vorlage', 'Plan as template') : L('Einheit als Vorlage', 'Session as template'))}</h2>
      <p class="hint" style="margin-top:0;">${L('Vorlage', 'Template')}: <b>${esc(item.title)}</b>${item.who.length ? ' &middot; ' + esc(item.who.slice(0, 4).join(', ')) : ''}</p>
      <div class="cd-top" style="grid-template-columns:1fr 1fr;">
        ${opts.pick ? '' : `<label>${L('F&uuml;r wen?', 'For whom?')}<input type="text" id="ctFor" list="ctNames" placeholder="${L('Person oder Gruppe', 'Athlete or group')}"><datalist id="ctNames">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>
        <label>${isPlan ? L('Start (optional)', 'Start (optional)') : L('Datum', 'Date')}<input type="date" id="ctDate"></label>
        <label style="grid-column:span 2;">${L('Titel', 'Title')}<input type="text" id="ctTitle"></label>`}
        <label style="grid-column:span 2;">${L('Anpassung (Hauptteil)', 'Adjustment (main set)')}<select id="ctProg" style="padding:8px 9px;border:1px solid var(--line);border-radius:8px;">${CD_PROG.map(p => `<option value="${p.key}">${L(p.de, p.en)}</option>`).join('')}</select></label>
      </div>
      <p class="hint">${L('Vorgaben in % vIFT, % HFmax oder HF-Zonen werden automatisch pers&ouml;nlich berechnet.', 'Targets in % vIFT, % HRmax or HR zones are personalised automatically.')}</p>
      ${warn.length ? `<p class="hint" style="color:#8a5a00;">&#9888; ${warn.join(' ')}</p>` : ''}
      <details><summary class="hint" style="cursor:pointer;">${L('Inhalt ansehen', 'View content')}</summary>${cdTplPreview(item)}</details>
      <div class="modal-actions"><button type="button" class="secondary" id="ctBack">&lsaquo; ${L('Auswahl', 'List')}</button><span class="spacer"></span><button type="button" class="secondary" id="ctX">${L('Abbrechen', 'Cancel')}</button>
        <button type="button" id="ctGo">${opts.pick ? L('&Uuml;bernehmen', 'Use') : (isPlan ? L('Plan anlegen &amp; umbauen', 'Create plan &amp; edit') : L('&Ouml;ffnen &amp; umbauen', 'Open &amp; edit'))}</button></div>`);
    const $ = s => host.querySelector(s);
    $('#ctX').onclick = close; $('#ctBack').onclick = listStep;
    let touched = false;
    if (!opts.pick) {
      $('#ctTitle').value = propose('');
      $('#ctTitle').oninput = () => { touched = true; };
      $('#ctFor').oninput = () => { if (!touched) $('#ctTitle').value = propose($('#ctFor').value.trim()); };
      $('#ctFor').focus();
    }
    const mk = (s, to) => { const c = cdProgress(s.content, $('#ctProg').value); c.forName = to; return c; };
    $('#ctGo').onclick = async () => {
      const btn = $('#ctGo');
      if (opts.pick) {
        const s = item.sessions[0], c = mk(s, opts.forName || '');
        const t = item.own ? cdTplSwap(item.own, item.forName, opts.forName).t : '';
        btn.disabled = true;
        const ok = await opts.pick({ content: c, title: t, item });
        if (ok === false) { btn.disabled = false; return; }
        close(); return;
      }
      const to = $('#ctFor').value.trim(), title = $('#ctTitle').value.trim(), date = $('#ctDate').value || null;
      if (!title) { alert(L('Bitte einen Titel eingeben.', 'Please enter a title.')); return; }
      const team = cdTplTeam(item, to, X);
      if (!isPlan) { const c = mk(item.sessions[0], to); close(); renderCdEditor(profile, { id: null, title, team: team || '', planned_date: date, content: c, _tpl: true }); return; }
      btn.disabled = true;
      const { data: { user } } = await sb.auth.getUser();
      const p = item.plan;
      const r = await sb.from('cd_plans').insert({ created_by: user.id, title, team, for_name: to || null, start_date: date, weeks: p.weeks, per_week: p.per_week, members: [], note: p.note || null }).select('*').single();
      if (r.error) { alert(L('Fehler: ', 'Error: ') + r.error.message); btn.disabled = false; return; }
      const rows = item.sessions.map(s => ({ title: cdTplSwap(s.title || cdDefTitle(s.plan_week, s.plan_slot), item.forName, to).t, team, planned_date: null, content: mk(s, to), plan_id: r.data.id, plan_week: s.plan_week, plan_slot: s.plan_slot, created_by: user.id }));
      const r2 = await sb.from('cd_sessions').insert(rows).select('id');
      if (r2.error) { await sb.from('cd_plans').delete().eq('id', r.data.id); alert(L('Fehler: ', 'Error: ') + r2.error.message); btn.disabled = false; return; }
      close(); toast(L('Plan angelegt – noch nicht veröffentlicht.', 'Plan created – not published yet.')); renderCdPlan(profile, r.data.id);
    };
  };
  const pre = opts.only && items.find(i => key(i) === opts.only);
  if (pre) formStep(pre); else listStep();
}
