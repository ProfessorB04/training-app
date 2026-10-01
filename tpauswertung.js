// ============================================================
// Trainingsplanung (Admin/Trainer): Übersicht + Auswertung der Trainingsplan-App
// Bewegte Last je Übung = Σ Wdh × kg (ohne Gewicht: Σ Wdh) – Ampel Woche zu Woche und Block zu Block
// ============================================================

function renderTpHub(profile) {
  const content = `
    <div class="menu-grid">
      <a class="menu-card tint-plan" href="trainingsplan.html" style="text-decoration:none;">
        <span class="mc-icon">&#128203;</span>
        <span class="mc-title">Pl&auml;ne erstellen</span>
        <span class="mc-sub">&Uuml;bungen zusammenstellen, Excel/Serien-Export &mdash; und <b>&bdquo;&#128242; In App ver&ouml;ffentlichen&ldquo;</b> f&uuml;r Gruppen oder einzelne Athlet:innen</span>
      </a>
      <button class="menu-card tint-ath" type="button" id="tpOverBtn">
        <span class="mc-icon">&#128064;</span>
        <span class="mc-title">Aktuelle Trainings&uuml;bersicht</span>
        <span class="mc-sub">Welche Pl&auml;ne die Athlet:innen gerade in der App sehen &mdash; anklicken f&uuml;r alle &Uuml;bungen je Tag und Woche</span>
      </button>
      <button class="menu-card tint-cond" type="button" id="tpCondBtn">
        <span class="mc-icon">&#9201;&#65039;</span>
        <span class="mc-title">Conditioning</span>
        <span class="mc-sub">Ausdauer- &amp; Konditionseinheiten planen &mdash; individuell nach Tempo (vIFT) und Herzfrequenz, direkt in die App</span>
      </button>
      <button class="menu-card tint-load" type="button" id="tpEvalBtn">
        <span class="mc-icon">&#128202;</span>
        <span class="mc-title">Auswertung Trainingspl&auml;ne</span>
        <span class="mc-sub">Was Athlet:innen in der App eingetragen haben: erledigte Einheiten, bewegte Last je &Uuml;bung mit Ampel (Woche &amp; Block), Notizen</span>
      </button>
    </div>
    <p class="hint">Athlet:innen sehen ihren Plan unter &bdquo;Mein Trainingsplan&ldquo;, sobald das Recht in der Nutzerverwaltung auf &bdquo;eintragen&ldquo; steht.</p>`;
  renderShell(profile, 'trainingsplan', 'Trainingsplanung', content);
  document.getElementById('tpEvalBtn').onclick = () => renderTpEval(profile);
  document.getElementById('tpOverBtn').onclick = () => renderTpOverview(profile);
  document.getElementById('tpCondBtn').onclick = () => renderConditionHub(profile);
}

let TP_EVAL_PLAN = '';
async function renderTpEval(profile) {
  const back = { label: 'Trainingsplanung', go: () => renderTpHub(profile) };
  renderShell(profile, 'trainingsplan', 'Auswertung Trainingspläne', `<p class="muted">Lade&hellip;</p>`, back);
  const [pRes, aRes, prRes] = await Promise.all([
    sb.from('tp_plans').select('*').eq('archived', false).order('created_at', { ascending: false }),
    sb.from('tp_assignments').select('*'),
    sb.from('profiles').select('id, name'),
  ]);
  if (pRes.error) {
    renderShell(profile, 'trainingsplan', 'Auswertung Trainingspläne', `<div class="card"><p class="error">Fehler: ${esc(pRes.error.message)}</p></div>`, back);
    return;
  }
  const plans = pRes.data || [];
  if (!plans.length) {
    const CD0 = typeof cdLoadAll === 'function' ? await cdLoadAll().catch(() => ({ sessions: [], asg: [], logs: [] })) : { sessions: [], asg: [], logs: [] };
    const names0 = Object.fromEntries((prRes.data || []).map(p => [p.id, p.name]));
    renderShell(profile, 'trainingsplan', 'Auswertung Trainingspläne', `<div class="card"><h2>Noch keine Kraft-Pl&auml;ne ver&ouml;ffentlicht</h2><p class="muted">In der Trainingsplanung einen Plan zusammenstellen und &bdquo;&#128242; In App ver&ouml;ffentlichen&ldquo; klicken.</p></div>${cdEvalHtml(CD0, names0)}`, back);
    appEl.querySelectorAll('[data-cdres]').forEach(b => b.onclick = () => renderCdResults(profile, CD0.sessions.find(s => s.id === b.dataset.cdres), names0, { label: 'Auswertung', go: () => renderTpEval(profile) }));
    return;
  }
  if (!plans.some(p => p.id === TP_EVAL_PLAN)) TP_EVAL_PLAN = plans[0].id;
  const plan = plans.find(p => p.id === TP_EVAL_PLAN);
  const names = Object.fromEntries((prRes.data || []).map(p => [p.id, p.name]));
  const members = (aRes.data || []).filter(a => a.plan_id === plan.id);
  const [{ data: logs }, CD] = await Promise.all([
    sb.from('tp_logs').select('*').eq('plan_id', plan.id),
    typeof cdLoadAll === 'function' ? cdLoadAll().catch(() => ({ sessions: [], asg: [], logs: [] })) : { sessions: [], asg: [], logs: [] },
  ]);
  const byUser = {};
  (logs || []).forEach(l => { (byUser[l.user_id] = byUser[l.user_id] || []).push(l); });

  const weekLoad = (ls, w) => ls.filter(l => l.week === w).reduce((n, l) => n + (l.exercises || []).reduce((m, ex) => ex.status === 'skipped' ? m : m + (tpLoadOf(ex).unit === 'kg' ? tpLoadOf(ex).value : 0), 0), 0);
  const weeks = Array.from({ length: plan.weeks }, (_, i) => i + 1);
  const rows = members.sort((a, b) => (names[a.user_id] || '').localeCompare(names[b.user_id] || '', 'de')).map(m => {
    const ls = byUser[m.user_id] || [];
    const notes = ls.reduce((n, l) => n + (l.exercises || []).filter(e => e.athleteNote).length, 0);
    const lastAct = ls.map(l => l.updated_at).sort().pop();
    let prev = null;
    const cdw = typeof cdWeeksFor === 'function' ? cdWeeksFor(CD, m.user_id, plan) : {};
    const cells = weeks.map(w => {
      const done = ls.filter(l => l.week === w && l.completed).length;
      const load = weekLoad(ls, w);
      const tr = tpTrend(load || null, prev);
      if (load) prev = load;
      const cls = done >= plan.days ? 'load-ok' : (done > 0 ? 'well-mid' : 'load-empty');
      const c = cdw[w];
      return `<td><span class="${cls}">${done}/${plan.days}</span>${load ? `<div class="tp-wl">${tpFmt(load)} kg ${tr ? `<span class="tp-tr ${tr.cls}">${tr.cls === 'up' ? '&#9650;' : tr.cls === 'down' ? '&#9660;' : '&#9644;'}</span>` : ''}</div>` : ''}${c ? `<div class="tp-cdw" title="Conditioning: erledigte Einheiten &middot; Session-Load (sRPE &times; Minuten)">&#9201;&#65039; ${c.n}${c.au ? ' &middot; ' + c.au + ' AU' : ''}</div>` : ''}</td>`;
    }).join('');
    const cdAll = CD.asg.filter(a => a.user_id === m.user_id), cdDone = cdAll.filter(a => CD.logs.some(l => l.session_id === a.session_id && l.user_id === m.user_id && l.completed)).length;
    return `<tr class="tp-row" data-u="${m.user_id}"><td><b>${esc(names[m.user_id] || '–')}</b>${m.active ? '' : ' <span class="muted">(anderer Plan aktiv)</span>'}${cdAll.length ? `<div class="tp-cdw">&#9201;&#65039; Conditioning ${cdDone}/${cdAll.length}</div>` : ''}</td>${cells}
      <td>${notes ? `&#128172; ${notes}` : ''}</td><td class="muted">${lastAct ? new Date(lastAct).toLocaleDateString('de-DE') : '–'}</td></tr>`;
  }).join('') || `<tr><td colspan="${weeks.length + 3}" class="muted">Noch niemand zugeordnet.</td></tr>`;

  const content = `
    <div class="card">
      <div class="ath-toolbar">
        <select id="tpPlanSel">${plans.map(p => `<option value="${p.id}" ${p.id === plan.id ? 'selected' : ''}>${esc(p.title || 'Ohne Titel')}${p.team ? ' · ' + esc(p.team) : ''} (${new Date(p.created_at).toLocaleDateString('de-DE')})</option>`).join('')}</select>
        <span class="spacer"></span>
        <button type="button" class="secondary" id="tpEdit">&#9998; Plan bearbeiten</button>
        <button type="button" class="secondary" id="tpArchive">Plan archivieren</button>
      </div>
      <div class="tablewrap"><table class="tp-table">
        <thead><tr><th>Athlet:in</th>${weeks.map(w => `<th>Woche ${w}</th>`).join('')}<th>Notizen</th><th>Zuletzt</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="hint">Je Woche: erledigte Einheiten / geplante Einheiten und bewegte Last (&Sigma; Wdh &times; kg). Ampel gegen&uuml;ber der Vorwoche: &#9650; Steigerung (&gt; +2 %) &middot; &#9644; gleich &middot; &#9660; R&uuml;ckschritt (&lt; &minus;2 %). &#9201;&#65039; = Conditioning-Einheiten der Woche (nach Datum) mit Session-Load in AU (sRPE &times; Minuten). Zeile anklicken f&uuml;r die Details je &Uuml;bung und Conditioning-Einheit.</p>
    </div>
    ${cdEvalHtml(CD, names)}`;
  renderShell(profile, 'trainingsplan', 'Auswertung Trainingspläne', content, back);
  document.getElementById('tpPlanSel').onchange = (e) => { TP_EVAL_PLAN = e.target.value; renderTpEval(profile); };
  document.getElementById('tpEdit').onclick = () => { window.location.href = 'trainingsplan.html#edit=' + plan.id; };
  document.getElementById('tpArchive').onclick = async () => {
    if (!confirm('Plan „' + (plan.title || '') + '“ archivieren? Er verschwindet aus dieser Liste; Einträge bleiben für Block-Vergleiche erhalten.')) return;
    await sb.from('tp_plans').update({ archived: true }).eq('id', plan.id);
    TP_EVAL_PLAN = ''; renderTpEval(profile);
  };
  appEl.querySelectorAll('.tp-row').forEach(r => { r.onclick = () => renderTpAthlete(profile, plan, r.dataset.u, names[r.dataset.u] || ''); });
  appEl.querySelectorAll('[data-cdres]').forEach(b => b.onclick = () => renderCdResults(profile, CD.sessions.find(s => s.id === b.dataset.cdres), names, { label: 'Auswertung', go: () => renderTpEval(profile) }));
}
// Tabelle aller Conditioning-Einheiten in der Auswertung
function cdEvalHtml(CD, names) {
  if (!CD || !CD.sessions.length || typeof cdSessionSec !== 'function') return '';
  const rows = CD.sessions.filter(s => CD.asg.some(a => a.session_id === s.id)).sort((x, y) => (y.planned_date || '').localeCompare(x.planned_date || '')).map(s => {
    const as = CD.asg.filter(a => a.session_id === s.id), ls = CD.logs.filter(l => l.session_id === s.id && l.completed);
    const rpe = ls.filter(l => l.srpe), avg = rpe.length ? (rpe.reduce((n, l) => n + l.srpe, 0) / rpe.length) : null;
    const au = ls.reduce((n, l) => n + cdAU(l), 0);
    return `<tr class="tp-row" data-cdres="${s.id}"><td><b>${esc(typeof cdSessLabel === 'function' ? cdSessLabel(s, CD.plans) : (s.title || 'Conditioning'))}</b>${s.content && s.content.forName ? `<div class="muted-inline">f&uuml;r ${esc(s.content.forName)}</div>` : ''}</td><td>${s.planned_date ? new Date(s.planned_date + 'T00:00:00').toLocaleDateString('de-DE') : '–'}</td>
      <td>${ls.length}/${as.length}</td><td>${avg != null ? tpFmt(avg) : '–'}</td><td>${au ? au + ' AU' : '–'}</td></tr>`;
  }).join('');
  if (!rows) return '';
  return `<div class="card"><h2>&#9201;&#65039; Conditioning &mdash; Auswertung</h2><div class="tablewrap"><table class="tp-table">
    <thead><tr><th>Einheit</th><th>Datum</th><th>erledigt</th><th>&Oslash; sRPE</th><th>Session-Load gesamt</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="hint">Zeile anklicken f&uuml;r die Eintragungen je Athlet:in (Bl&ouml;cke, Puls, Strecke, Notizen).</p></div>`;
}

// Übungs-Last je Woche aus Protokollen
function tpExerciseTable(logs) {
  const t = {};   // key -> { week -> {value, unit, sets[]} }
  logs.forEach(l => (l.exercises || []).forEach(ex => {
    if (ex.status === 'skipped' || ex.status === 'open' && !(ex.sets || []).some(s => s.done)) return;
    if ((TP_CAT[ex.cat] || {}).type === 'check') return;
    const k = tpExerciseKey(ex), L = tpLoadOf(ex);
    if (!L.reps) return;
    const w = (t[k] = t[k] || {});
    const cur = w[l.week] || { value: 0, unit: L.unit, reps: 0 };
    cur.value += L.value; cur.reps += L.reps; if (L.unit === 'kg') cur.unit = 'kg';
    w[l.week] = cur;
  }));
  return t;
}

// Wochen-/Tagesansicht: je Tag alle Übungen mit jedem Satz (Wdh × kg)
function tpWeekView(plan, logs, week) {
  const days = Array.from({ length: plan.days }, (_, i) => i + 1);
  return `<div class="tp-weekgrid">${days.map(d => {
    const l = (logs || []).find(x => x.week === week && x.day === d);
    if (!l) return `<div class="tp-day"><h3>Tag ${d}</h3><div class="tp-daymeta">noch nicht eingetragen</div></div>`;
    const exs = (l.exercises || []).map(ex => {
      const cat = TP_CAT[ex.cat] || { color: TP_EXTRA_COLOR, type: 'sets', label: 'Extra' };
      const name = ex.status === 'swapped' && ex.swappedTo ? `${esc(ex.swappedTo)} <span class="muted-inline">(statt ${esc(tpLabel(ex))})</span>`
        : esc(tpLabel(ex)) + (ex.status === 'extra' ? ' <span class="muted-inline">(extra)</span>' : '');
      let sets = '';
      if (ex.status === 'skipped') sets = '<span class="muted">weggelassen</span>';
      else if (cat.type === 'check') sets = ex.status === 'done' ? '&#10003; erledigt' : '<span class="muted">nicht abgehakt</span>';
      else sets = (ex.sets || []).map((st, j) => {
        const parts = [st.reps !== '' && st.reps != null ? st.reps + ' Wdh' : '', parseFloat(st.kg) > 0 ? tpKgText(st.kg) + ' kg' : '', parseFloat(st.sec) > 0 ? st.sec + ' s' : ''].filter(Boolean);
        const txt = `S${j + 1}: ${parts.length ? parts.join(' &times; ') : '–'}`;
        return st.done ? txt : `<span class="nd">${txt}</span>`;
      }).join('<br>');
      const L = tpLoadOf(ex);
      const sum = cat.type === 'sets' && L.value ? `<div class="tp-daymeta" style="margin:2px 0 0;">= ${tpFmt(L.value)} ${L.unit === 'kg' ? 'kg bewegt' : (L.unit === 's' ? 's gesamt' : 'Wdh')}</div>` : '';
      return `<div class="tp-dex${ex.status === 'skipped' ? ' skipped' : ''}" style="--cat:${cat.color};"><b>${name}</b>
        <div class="tp-sets">${sets}</div>${sum}${ex.athleteNote ? `<div class="tp-dnote">&#128172; ${esc(ex.athleteNote)}</div>` : ''}</div>`;
    }).join('');
    return `<div class="tp-day"><h3>Tag ${d} ${l.completed ? '&#10003;' : '&#9680;'}</h3>
      <div class="tp-daymeta">${wDate(l.entry_date)}${l.srpe ? ' &middot; sRPE ' + l.srpe + ' &times; ' + l.duration_min + ' min = ' + (l.srpe * l.duration_min) : ''}</div>${exs}</div>`;
  }).join('')}</div>`;
}

async function renderTpAthlete(profile, plan, uid, name, weekSel) {
  const back = { label: 'Auswertung', go: () => renderTpEval(profile) };
  renderShell(profile, 'trainingsplan', name, `<p class="muted">Lade&hellip;</p>`, back);
  // aktueller Block + vorheriger Block (zuletzt zugeordneter anderer Plan) für den Vergleich
  const [{ data: logs }, { data: asg }, CD] = await Promise.all([
    sb.from('tp_logs').select('*').eq('plan_id', plan.id).eq('user_id', uid).order('week').order('day'),
    sb.from('tp_assignments').select('plan_id, assigned_at').eq('user_id', uid).order('assigned_at', { ascending: false }),
    typeof cdLoadAll === 'function' ? cdLoadAll().catch(() => ({ sessions: [], asg: [], logs: [] })) : { sessions: [], asg: [], logs: [] },
  ]);
  const cur = (asg || []).find(a => a.plan_id === plan.id);
  // alle früheren Blöcke (neueste zuerst): je Übung wird mit dem letzten Block verglichen, in dem sie vorkam
  const earlier = (asg || []).filter(a => a.plan_id !== plan.id && (!cur || a.assigned_at < cur.assigned_at))
    .sort((x, y) => (y.assigned_at || '').localeCompare(x.assigned_at || ''));
  let prevBlocks = [];
  if (earlier.length) {
    const ids = earlier.map(a => a.plan_id);
    const [{ data: pls }, { data: pLogs }] = await Promise.all([
      sb.from('tp_plans').select('id, title, weeks').in('id', ids),
      sb.from('tp_logs').select('*').in('plan_id', ids).eq('user_id', uid),
    ]);
    prevBlocks = earlier.map(a => ({ title: ((pls || []).find(p => p.id === a.plan_id) || {}).title || 'früherer Block', table: tpExerciseTable((pLogs || []).filter(l => l.plan_id === a.plan_id)) }));
  }
  const prevTitle = prevBlocks.length ? prevBlocks[0].title : '';
  const table = tpExerciseTable(logs || []);
  const weeks = Array.from({ length: plan.weeks }, (_, i) => i + 1);
  const avg = (w) => { const v = Object.values(w || {}); return v.length ? v.reduce((n, x) => n + x.value, 0) / v.length : null; };
  const arrow = (tr) => tr ? `<span class="tp-tr ${tr.cls}" title="${tr.pct > 0 ? '+' : ''}${Math.round(tr.pct)} %">${tr.cls === 'up' ? '&#9650;' : tr.cls === 'down' ? '&#9660;' : '&#9644;'}</span>` : '';
  const exRows = Object.keys(table).sort((a, b) => a.localeCompare(b, 'de')).map(k => {
    let prev = null;
    const unit = Object.values(table[k])[0].unit;
    const cells = weeks.map(w => {
      const c = table[k][w];
      if (!c) return '<td class="muted">–</td>';
      const tr = tpTrend(c.value, prev); prev = c.value;
      return `<td>${tpFmt(c.value)} ${arrow(tr)}</td>`;
    }).join('');
    const pb = prevBlocks.find(b => b.table[k]);
    const bNow = avg(table[k]), bPrev = pb ? avg(pb.table[k]) : null;
    const btr = tpTrend(bNow, bPrev);
    return `<tr><td><b>${esc(k)}</b><div class="muted-inline">${unit === 'kg' ? 'bewegte Last in kg' : (unit === 's' ? 'Dauer in Sekunden' : 'Wiederholungen')}</div></td>${cells}
      <td>${bPrev != null ? `${tpFmt(bPrev)} &rarr; ${tpFmt(bNow)} ${arrow(btr)}${pb.title !== prevTitle ? `<div class="muted-inline">aus &bdquo;${esc(pb.title)}&ldquo;</div>` : ''}` : '<span class="muted">–</span>'}</td></tr>`;
  }).join('') || `<tr><td colspan="${weeks.length + 2}" class="muted">Noch keine Eintr&auml;ge mit S&auml;tzen.</td></tr>`;

  const sessions = (logs || []).map(l => {
    const notes = (l.exercises || []).filter(e => e.athleteNote).map(e => `<li><b>${esc(tpExerciseKey(e))}:</b> ${esc(e.athleteNote)}</li>`).join('');
    const changes = (l.exercises || []).filter(e => e.status === 'skipped' || e.status === 'swapped' || e.status === 'extra')
      .map(e => e.status === 'skipped' ? `<li>&#10060; weggelassen: ${esc(tpLabel(e))}</li>` : e.status === 'swapped' ? `<li>&#8644; getauscht: ${esc(tpLabel(e))} &rarr; ${esc(e.swappedTo)}</li>` : `<li>&#10133; zus&auml;tzlich: ${esc(e.name)}</li>`).join('');
    return `<tr class="tp-row" data-w="${l.week}"><td>W${l.week} &middot; T${l.day}</td><td>${wDate(l.entry_date)}</td><td>${l.completed ? '&#10003;' : '&#9680;'}</td>
      <td>${l.srpe ? `${l.srpe} &times; ${l.duration_min} min = ${l.srpe * l.duration_min}` : '–'}</td><td><ul class="tp-ul">${changes}${notes}</ul></td></tr>`;
  }).join('') || `<tr><td colspan="5" class="muted">Noch keine Einheiten eingetragen.</td></tr>`;

  const weeksWithLogs = [...new Set((logs || []).map(l => l.week))].sort((a, b) => a - b);
  const week = weekSel || weeksWithLogs[weeksWithLogs.length - 1] || 1;
  const content = `
    <div class="card">
      <div class="ath-toolbar" style="margin-bottom:10px;">
        <h2 style="margin:0;">Wochen&uuml;bersicht &mdash; S&auml;tze, Wiederholungen &amp; Gewicht</h2>
        <span class="spacer"></span>
        <select id="tpWeekSel">${weeks.map(w => `<option value="${w}" ${w === week ? 'selected' : ''}>Woche ${w}${weeksWithLogs.includes(w) ? '' : ' (leer)'}</option>`).join('')}</select>
      </div>
      ${tpWeekView(plan, logs, week)}
      <p class="hint">Durchgestrichen = eingetragen, aber nicht abgehakt. Farbiger Rand = Kategorie wie in der Trainingsplanung.</p>
    </div>
    <div class="card">
      <h2>${esc(plan.title || 'Trainingsplan')} &mdash; bewegte Last je &Uuml;bung</h2>
      <div class="tablewrap"><table class="tp-table">
        <thead><tr><th>&Uuml;bung</th>${weeks.map(w => `<th>Woche ${w}</th>`).join('')}<th>Block-Vergleich${prevTitle ? `<div class="muted-inline">&Oslash; je Woche: letzter Block mit der &Uuml;bung (meist ${esc(prevTitle)}) &rarr; jetzt</div>` : ''}</th></tr></thead>
        <tbody>${exRows}</tbody>
      </table></div>
      <p class="hint">Bewegte Last = &Sigma; (Wdh &times; kg) der erledigten S&auml;tze je Woche; ohne Gewicht z&auml;hlen die Wiederholungen. &#9650; Steigerung &gt; +2 % &middot; &#9644; gleich &middot; &#9660; R&uuml;ckschritt &lt; &minus;2 % (gegen&uuml;ber Vorwoche bzw. Wochen-&Oslash; des vorherigen Blocks). Maus &uuml;ber den Pfeil zeigt die Prozent.</p>
    </div>
    <div class="card">
      <h2>Einheiten, &Auml;nderungen &amp; Notizen</h2>
      <div class="tablewrap"><table class="tp-table">
        <thead><tr><th>Einheit</th><th>Datum</th><th></th><th>sRPE</th><th>Getauscht / weggelassen / extra &middot; Notizen</th></tr></thead>
        <tbody>${sessions}</tbody>
      </table></div>
    </div>
    ${typeof cdAthleteListHtml === 'function' ? cdAthleteListHtml(CD, uid) : ''}`;
  renderShell(profile, 'trainingsplan', name, content, back);
  appEl.querySelectorAll('tr[data-cds]').forEach(r => { r.onclick = () => renderCdAthleteDetail(profile, CD.sessions.find(s => s.id === r.dataset.cds), uid, name, CD, { label: name, go: () => renderTpAthlete(profile, plan, uid, name, weekSel) }); });
  document.getElementById('tpWeekSel').onchange = (e) => renderTpAthlete(profile, plan, uid, name, +e.target.value);
  appEl.querySelectorAll('tr.tp-row[data-w]').forEach(r => { r.onclick = () => { renderTpAthlete(profile, plan, uid, name, +r.dataset.w); window.scrollTo(0, 0); }; });
}

// ---------- Aktuelle Trainingsübersicht: sichtbare Pläne der Athlet:innen ----------
async function renderTpOverview(profile) {
  const back = { label: 'Trainingsplanung', go: () => renderTpHub(profile) };
  const T = 'Aktuelle Trainingsübersicht';
  renderShell(profile, 'trainingsplan', T, `<p class="muted">Lade&hellip;</p>`, back);
  const [pRes, aRes, vRes, prRes, lRes, CD] = await Promise.all([
    sb.from('tp_plans').select('*').eq('archived', false).order('created_at', { ascending: false }),
    sb.from('tp_assignments').select('plan_id, user_id, active').eq('active', true),
    sb.from('tp_plan_versions').select('id, plan_id, from_week, user_ids, created_at'),
    sb.from('profiles').select('id, name'),
    sb.from('tp_logs').select('plan_id, user_id, completed'),
    typeof cdLoadAll === 'function' ? cdLoadAll().catch(() => ({ sessions: [], asg: [], logs: [] })) : { sessions: [], asg: [], logs: [] },
  ]);
  const err = [pRes, aRes, vRes, prRes].map(r => r.error).filter(Boolean)[0];
  const doneOf = (pid, u) => (lRes.data || []).filter(l => l.plan_id === pid && l.user_id === u && l.completed).length;
  if (err) { renderShell(profile, 'trainingsplan', T, `<div class="card"><p class="error">Fehler: ${esc(err.message)}</p></div>`, back); return; }
  const names = Object.fromEntries((prRes.data || []).map(p => [p.id, p.name]));
  const plans = (pRes.data || []).map(p => {
    const members = (aRes.data || []).filter(a => a.plan_id === p.id).map(a => a.user_id)
      .sort((x, y) => (names[x] || '').localeCompare(names[y] || '', 'de'));
    const vers = (vRes.data || []).filter(v => v.plan_id === p.id);
    const variantUsers = new Set(); vers.forEach(v => (v.user_ids || []).forEach(u => variantUsers.add(u)));
    return { p, members, cur: tpWeekOfDate(p.start_date, p.weeks) || 1, variantUsers, changes: vers.filter(v => !v.user_ids && v.from_week > 1).length };
  }).filter(x => x.members.length);
  const cards = plans.map(x => `
    <div class="card tpo-card">
      <div class="tpo-head">
        <div><div class="tpo-title">${esc(x.p.title || 'Ohne Titel')}</div>
          <div class="muted-inline">${x.p.team ? esc(x.p.team) + ' &middot; ' : ''}${x.p.weeks} Wochen &middot; ${x.p.days} Einheiten/Woche${x.p.start_date ? ' &middot; ab ' + new Date(x.p.start_date + 'T00:00:00').toLocaleDateString('de-DE') : ''}</div></div>
        <span class="tpo-week">Woche ${x.cur} von ${x.p.weeks}</span>
      </div>
      <div class="tpo-actions">
        <button type="button" class="secondary small-btn" data-end="${x.p.id}" title="Athlet:innen sehen den Plan nicht mehr; Eintr&auml;ge bleiben f&uuml;r die Auswertung erhalten">&#9209; Beenden</button>
        <button type="button" class="danger small-btn" data-del="${x.p.id}" title="Plan inkl. aller Eintr&auml;ge der Athlet:innen endg&uuml;ltig l&ouml;schen">&#128465; L&ouml;schen</button>
      </div>
      ${x.changes ? `<div class="hint" style="margin:0 0 8px;">&#9998; ${x.changes} &Auml;nderung(en) ab einer sp&auml;teren Woche</div>` : ''}
      <div class="tpo-people">
        <button type="button" class="tpo-chip group" data-plan="${x.p.id}" data-uid="">&#128101; Gruppenplan</button>
        ${x.members.map(u => `<button type="button" class="tpo-chip" data-plan="${x.p.id}" data-uid="${u}">${esc(names[u] || 'Unbekannt')} <span class="tpo-cnt" title="erledigte Einheiten">${doneOf(x.p.id, u)}/${x.p.weeks * x.p.days}</span>${x.variantUsers.has(u) ? ' <span class="tpo-var" title="Hat eine eigene Variante">Variante</span>' : ''}</button>`).join('')}
      </div>
    </div>`).join('');
  const cdHtml = typeof cdOverviewHtml === 'function' ? cdOverviewHtml(CD, names) : '';
  const content = (plans.length ? `
    <p class="hint" style="margin-top:0;">Alle Pl&auml;ne, die Athlet:innen gerade unter &bdquo;Mein Trainingsplan&ldquo; (Kraft) und &bdquo;Conditioning&ldquo; sehen. Auf eine Person (oder &bdquo;Gruppenplan&ldquo;) klicken, um alle &Uuml;bungen bzw. Eintragungen zu sehen.</p>${cards}`
    : `<div class="card"><h2>Keine aktiven Kraft-Pl&auml;ne</h2><p class="muted">In der Trainingsplanung einen Plan erstellen und &bdquo;&#128242; In App ver&ouml;ffentlichen&ldquo;.</p></div>`) + cdHtml;
  renderShell(profile, 'trainingsplan', T, content, back);
  if (cdHtml) cdWireOverview(profile, CD, names, { label: 'Aktuelle Trainingsübersicht', go: () => renderTpOverview(profile) });
  // Plan beenden: Zuordnungen aus + archivieren (Einträge bleiben) · Löschen: alles inkl. Einträge
  appEl.querySelectorAll('[data-end]').forEach(b => {
    b.onclick = async () => {
      const x = plans.find(y => y.p.id === b.dataset.end);
      if (!confirm('Plan „' + (x.p.title || 'Ohne Titel') + '“ beenden?\n\nDie ' + x.members.length + ' Athlet:innen sehen ihn nicht mehr unter „Mein Trainingsplan“. Ihre Einträge bleiben für Auswertung und Block-Vergleich erhalten.')) return;
      b.disabled = true;
      let r = await sb.from('tp_assignments').update({ active: false }).eq('plan_id', x.p.id);
      if (!r.error) r = await sb.from('tp_plans').update({ archived: true }).eq('id', x.p.id);
      if (r.error) { b.disabled = false; toast('Fehler: ' + r.error.message); return; }
      toast('Plan beendet.'); renderTpOverview(profile);
    };
  });
  appEl.querySelectorAll('[data-del]').forEach(b => {
    b.onclick = async () => {
      const x = plans.find(y => y.p.id === b.dataset.del);
      const { count } = await sb.from('tp_logs').select('id', { count: 'exact', head: true }).eq('plan_id', x.p.id);
      const msg = 'Plan „' + (x.p.title || 'Ohne Titel') + '“ ENDGÜLTIG löschen?\n\n' +
        '• ' + x.members.length + ' Athlet:innen sehen ihn nicht mehr\n' +
        '• ' + (count || 0) + ' eingetragene Einheiten (Sätze, Gewichte, Notizen) werden mitgelöscht\n' +
        '• sRPE-Werte im Load Management bleiben erhalten\n\n' +
        'Tipp: „Beenden“ blendet den Plan nur aus und behält die Einträge.';
      if (!confirm(msg)) return;
      if ((count || 0) > 0 && prompt('Zur Sicherheit bitte LÖSCHEN eintippen:') !== 'LÖSCHEN') { toast('Nicht gelöscht.'); return; }
      b.disabled = true;
      const r = await sb.from('tp_plans').delete().eq('id', x.p.id);
      if (r.error) { b.disabled = false; toast('Fehler: ' + r.error.message); return; }
      toast('Plan gelöscht.'); renderTpOverview(profile);
    };
  });
  appEl.querySelectorAll('.tpo-chip[data-plan]').forEach(b => {
    b.onclick = () => {
      const x = plans.find(y => y.p.id === b.dataset.plan);
      renderTpPlanDetail(profile, x.p, b.dataset.uid || null, b.dataset.uid ? names[b.dataset.uid] : null, x.cur);
    };
  });
}

async function renderTpPlanDetail(profile, plan, uid, name, week) {
  const back = { label: 'Aktuelle Trainingsübersicht', go: () => renderTpOverview(profile) };
  const T = plan.title || 'Trainingsplan';
  renderShell(profile, 'trainingsplan', T, `<p class="muted">Lade&hellip;</p>`, back);
  const [vRes, lRes] = await Promise.all([
    sb.from('tp_plan_versions').select('*').eq('plan_id', plan.id).order('from_week'),
    uid ? sb.from('tp_logs').select('week, day, completed, exercises').eq('plan_id', plan.id).eq('user_id', uid) : Promise.resolve({ data: [] }),
  ]);
  if (vRes.error) { renderShell(profile, 'trainingsplan', T, `<div class="card"><p class="error">Fehler: ${esc(vRes.error.message)}</p></div>`, back); return; }
  const versions = vRes.data || [];
  // Status je Einheit dieser Person: erledigt / angefangen (etwas eingetragen) / offen
  const stBy = {};
  (lRes.data || []).forEach(l => {
    const any = (l.exercises || []).some(e => e.status !== 'open' || (e.sets || []).some(x => x.done));
    stBy[l.week + '_' + l.day] = l.completed ? 'done' : (any ? 'part' : null);
  });
  const cur = tpWeekOfDate(plan.start_date, plan.weeks) || 1;
  const draw = (w) => {
    const content = tpContentFor(versions, w, uid);
    const isVar = !!uid && versions.some(v => v.user_ids && v.user_ids.includes(uid) && v.from_week <= w);
    const LAY = tpLayoutOf(plan, content);
    const days = Array.from({ length: plan.days }, (_, i) => i + 1).map(d => {
      const items = tpDayItems(content, d);
      const prep = content && content.prepNote ? (content.prepNote[d] || content.prepNote[String(d)] || '') : '';
      const cool = content && content.cooldown ? (content.cooldown[d] || content.cooldown[String(d)] || '') : '';
      let lastCat = null, html = '';
      items.forEach(it => {
        const c = TP_CAT[it.cat] || { label: it.cat, color: TP_EXTRA_COLOR };
        if (it.cat !== lastCat) {
          const pr = it.presc || {};
          const pt = [pr.sets ? pr.sets + ' Sätze' : '', pr.reps ? pr.reps + ' Wdh.' : '', pr.tempo ? 'Tempo ' + pr.tempo : '', pr.pause ? 'Pause ' + pr.pause : ''].filter(Boolean).join(' · ');
          html += `<div class="tpo-cat" style="--cat:${c.color}">${esc(c.label)}${pt ? `<span>${esc(pt)}</span>` : ''}</div>`;
          lastCat = it.cat;
        }
        html += `<div class="tpo-ex" style="--cat:${c.color}"><b>${esc(tpLabel(it))}</b>${it.note ? `<div class="tpo-note">&#128204; ${esc(it.note)}</div>` : ''}</div>`;
      });
      const st = uid ? stBy[w + '_' + d] : null;
      const badge = st === 'done' ? '<span class="tpo-st done">&#10003; erledigt – bleibt unver&auml;ndert</span>' : (st === 'part' ? '<span class="tpo-st part">angefangen</span>' : (uid ? '<span class="tpo-st open">offen</span>' : ''));
      return `<div class="card tpo-day">
        <div class="tpo-dayhead" style="background:${LAY.main};">Tag ${d} ${badge}</div>
        ${prep ? `<div class="tpo-note" style="margin-bottom:6px;">&#128221; ${esc(prep)}</div>` : ''}
        ${html || '<p class="muted">Keine &Uuml;bungen.</p>'}
        ${cool ? `<div class="tpo-note" style="margin-top:8px;">&#10052; Cool-down: ${esc(cool)}</div>` : ''}
      </div>`;
    }).join('');
    const html = `
      <div class="card">
        <div class="ath-toolbar">
          <div><b class="tpo-name">${esc(name || 'Gruppenplan')}</b> <span class="muted-inline">${plan.team ? esc(plan.team) + ' · ' : ''}${uid ? (isVar ? 'eigene Variante' : 'folgt dem Gruppenplan') : 'gilt für alle ohne eigene Variante'}</span></div>
          <span class="spacer"></span>
          <label class="muted-inline">Woche <select id="tpoWeek" style="width:auto;">${Array.from({ length: plan.weeks }, (_, i) => `<option value="${i + 1}" ${i + 1 === w ? 'selected' : ''}>${i + 1}${i + 1 === cur ? ' (aktuell)' : ''}</option>`).join('')}</select></label>
          ${uid ? `<button type="button" id="tpoEditOne">&#9998; Nur f&uuml;r ${esc(name || 'diese Person')} &auml;ndern</button>` : ''}
          <button type="button" class="${uid ? 'secondary' : ''}" id="tpoEditAll">&#9998; F&uuml;r alle &auml;ndern</button>
        </div>
        <p class="hint" style="margin:8px 0 0;">&Auml;ndern &ouml;ffnet den Plan in der Trainingsplanung. Nach &bdquo;&#128242; In App ver&ouml;ffentlichen&ldquo; gilt die &Auml;nderung ab der gew&auml;hlten Woche f&uuml;r alle <b>noch nicht erledigten Einheiten</b>${uid ? ` &ndash; bei &bdquo;Nur f&uuml;r ${esc(name || 'diese Person')}&ldquo; als eigene Variante, die anderen behalten den Gruppenplan` : ''}. Erledigte Einheiten bleiben unver&auml;ndert, in angefangenen bleiben eingetragene S&auml;tze erhalten.</p>
      </div>
      <div class="tpo-days">${days}</div>`;
    renderShell(profile, 'trainingsplan', T, html, back);
    document.getElementById('tpoWeek').onchange = e => draw(+e.target.value);
    document.getElementById('tpoEditAll').onclick = () => { window.location.href = 'trainingsplan.html#edit=' + plan.id; };
    const one = document.getElementById('tpoEditOne');
    if (one) one.onclick = () => { window.location.href = 'trainingsplan.html#edit=' + plan.id + '&uid=' + uid; };
  };
  draw(week || cur);
}
