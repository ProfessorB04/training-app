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
      <button class="menu-card tint-load" type="button" id="tpEvalBtn">
        <span class="mc-icon">&#128202;</span>
        <span class="mc-title">Auswertung Trainingspl&auml;ne</span>
        <span class="mc-sub">Was Athlet:innen in der App eingetragen haben: erledigte Einheiten, bewegte Last je &Uuml;bung mit Ampel (Woche &amp; Block), Notizen</span>
      </button>
    </div>
    <p class="hint">Athlet:innen sehen ihren Plan unter &bdquo;Mein Trainingsplan&ldquo;, sobald das Recht in der Nutzerverwaltung auf &bdquo;eintragen&ldquo; steht.</p>`;
  renderShell(profile, 'trainingsplan', 'Trainingsplanung', content);
  document.getElementById('tpEvalBtn').onclick = () => renderTpEval(profile);
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
    renderShell(profile, 'trainingsplan', 'Auswertung Trainingspläne', `<div class="card"><h2>Noch keine Pl&auml;ne ver&ouml;ffentlicht</h2><p class="muted">In der Trainingsplanung einen Plan zusammenstellen und &bdquo;&#128242; In App ver&ouml;ffentlichen&ldquo; klicken.</p></div>`, back);
    return;
  }
  if (!plans.some(p => p.id === TP_EVAL_PLAN)) TP_EVAL_PLAN = plans[0].id;
  const plan = plans.find(p => p.id === TP_EVAL_PLAN);
  const names = Object.fromEntries((prRes.data || []).map(p => [p.id, p.name]));
  const members = (aRes.data || []).filter(a => a.plan_id === plan.id);
  const { data: logs } = await sb.from('tp_logs').select('*').eq('plan_id', plan.id);
  const byUser = {};
  (logs || []).forEach(l => { (byUser[l.user_id] = byUser[l.user_id] || []).push(l); });

  const weekLoad = (ls, w) => ls.filter(l => l.week === w).reduce((n, l) => n + (l.exercises || []).reduce((m, ex) => ex.status === 'skipped' ? m : m + (tpLoadOf(ex).unit === 'kg' ? tpLoadOf(ex).value : 0), 0), 0);
  const weeks = Array.from({ length: plan.weeks }, (_, i) => i + 1);
  const rows = members.sort((a, b) => (names[a.user_id] || '').localeCompare(names[b.user_id] || '', 'de')).map(m => {
    const ls = byUser[m.user_id] || [];
    const notes = ls.reduce((n, l) => n + (l.exercises || []).filter(e => e.athleteNote).length, 0);
    const lastAct = ls.map(l => l.updated_at).sort().pop();
    let prev = null;
    const cells = weeks.map(w => {
      const done = ls.filter(l => l.week === w && l.completed).length;
      const load = weekLoad(ls, w);
      const tr = tpTrend(load || null, prev);
      if (load) prev = load;
      const cls = done >= plan.days ? 'load-ok' : (done > 0 ? 'well-mid' : 'load-empty');
      return `<td><span class="${cls}">${done}/${plan.days}</span>${load ? `<div class="tp-wl">${tpFmt(load)} kg ${tr ? `<span class="tp-tr ${tr.cls}">${tr.cls === 'up' ? '&#9650;' : tr.cls === 'down' ? '&#9660;' : '&#9644;'}</span>` : ''}</div>` : ''}</td>`;
    }).join('');
    return `<tr class="tp-row" data-u="${m.user_id}"><td><b>${esc(names[m.user_id] || '–')}</b>${m.active ? '' : ' <span class="muted">(anderer Plan aktiv)</span>'}</td>${cells}
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
      <p class="hint">Je Woche: erledigte Einheiten / geplante Einheiten und bewegte Last (&Sigma; Wdh &times; kg). Ampel gegen&uuml;ber der Vorwoche: &#9650; Steigerung (&gt; +2 %) &middot; &#9644; gleich &middot; &#9660; R&uuml;ckschritt (&lt; &minus;2 %). Zeile anklicken f&uuml;r die Details je &Uuml;bung.</p>
    </div>`;
  renderShell(profile, 'trainingsplan', 'Auswertung Trainingspläne', content, back);
  document.getElementById('tpPlanSel').onchange = (e) => { TP_EVAL_PLAN = e.target.value; renderTpEval(profile); };
  document.getElementById('tpEdit').onclick = () => { window.location.href = 'trainingsplan.html#edit=' + plan.id; };
  document.getElementById('tpArchive').onclick = async () => {
    if (!confirm('Plan „' + (plan.title || '') + '“ archivieren? Er verschwindet aus dieser Liste; Einträge bleiben für Block-Vergleiche erhalten.')) return;
    await sb.from('tp_plans').update({ archived: true }).eq('id', plan.id);
    TP_EVAL_PLAN = ''; renderTpEval(profile);
  };
  appEl.querySelectorAll('.tp-row').forEach(r => { r.onclick = () => renderTpAthlete(profile, plan, r.dataset.u, names[r.dataset.u] || ''); });
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
  const [{ data: logs }, { data: asg }] = await Promise.all([
    sb.from('tp_logs').select('*').eq('plan_id', plan.id).eq('user_id', uid).order('week').order('day'),
    sb.from('tp_assignments').select('plan_id, assigned_at').eq('user_id', uid).order('assigned_at', { ascending: false }),
  ]);
  const cur = (asg || []).find(a => a.plan_id === plan.id);
  const prevAsg = (asg || []).filter(a => a.plan_id !== plan.id && (!cur || a.assigned_at < cur.assigned_at))[0];
  let prevTable = {}, prevWeeks = 0, prevTitle = '';
  if (prevAsg) {
    const [{ data: pl }, { data: pLogs }] = await Promise.all([
      sb.from('tp_plans').select('title, weeks').eq('id', prevAsg.plan_id).single(),
      sb.from('tp_logs').select('*').eq('plan_id', prevAsg.plan_id).eq('user_id', uid),
    ]);
    prevTable = tpExerciseTable(pLogs || []); prevWeeks = pl ? pl.weeks : 0; prevTitle = pl ? pl.title : '';
  }
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
    const bNow = avg(table[k]), bPrev = avg(prevTable[k]);
    const btr = tpTrend(bNow, bPrev);
    return `<tr><td><b>${esc(k)}</b><div class="muted-inline">${unit === 'kg' ? 'bewegte Last in kg' : (unit === 's' ? 'Dauer in Sekunden' : 'Wiederholungen')}</div></td>${cells}
      <td>${bPrev != null ? `${tpFmt(bPrev)} &rarr; ${tpFmt(bNow)} ${arrow(btr)}` : '<span class="muted">–</span>'}</td></tr>`;
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
        <thead><tr><th>&Uuml;bung</th>${weeks.map(w => `<th>Woche ${w}</th>`).join('')}<th>Block-Vergleich${prevTitle ? `<div class="muted-inline">&Oslash; je Woche: ${esc(prevTitle)} &rarr; jetzt</div>` : ''}</th></tr></thead>
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
    </div>`;
  renderShell(profile, 'trainingsplan', name, content, back);
  document.getElementById('tpWeekSel').onchange = (e) => renderTpAthlete(profile, plan, uid, name, +e.target.value);
  appEl.querySelectorAll('tr.tp-row[data-w]').forEach(r => { r.onclick = () => { renderTpAthlete(profile, plan, uid, name, +r.dataset.w); window.scrollTo(0, 0); }; });
}
