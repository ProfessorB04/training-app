// ============================================================
// Wellness-Check (Athlet:innen), Wellness-Übersicht (Admin/Trainer) und Tool-Rechte je Athlet:in
// Tabelle wellness_entries; Rechte in profiles.permissions (siehe supabase_migration_rechte_wellness.sql)
// ============================================================

// Fragen + Antworttexte wie im bisherigen Forms-Setup — bei allen vier Fragen gilt 5 = sehr gut
const WELLNESS_QUESTIONS = [
  { key: 'sleep', title: 'Schlafqualität', q: 'Wie hast du diese Nacht geschlafen?',
    a: ['sehr schlecht geschlafen', 'eher schlecht geschlafen', 'mittelmäßig geschlafen', 'eher gut geschlafen', 'sehr gut geschlafen'] },
  { key: 'fatigue', title: 'Muskuläre Ermüdung', q: 'Wie fühlt sich deine Muskulatur gerade an?',
    a: ['sehr stark ermüdet', 'stark ermüdet', 'spürbar ermüdet', 'leicht ermüdet', 'kaum/nicht ermüdet'] },
  { key: 'pain', title: 'Schmerzen', q: 'Hast du aktuell Schmerzen (unabhängig von Muskelkater)?',
    a: ['starke Schmerzen', 'deutliche Schmerzen', 'leichte Schmerzen', 'kaum Schmerzen', 'keine Schmerzen'] },
  { key: 'energy', title: 'Energielevel', q: 'Wie energiegeladen fühlst du dich gerade?',
    a: ['sehr erschöpft / energielos', 'eher energielos', 'mittel', 'eher energiegeladen', 'sehr energiegeladen'] },
];
const wellnessComposite = (e) => Math.round(((e.sleep + e.fatigue + e.pain + e.energy) / 4) * 100) / 100;
const wDate = (iso) => { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; };

// ---------- Fragebogen (Athlet:in) bzw. Vorschau (Admin/Trainer) ----------
async function renderWellnessPage(profile, preview) {
  const today = new Date().toISOString().slice(0, 10);
  const canEdit = !preview && perm(profile, 'wellness') === 'edit';
  const { data: rows } = preview ? { data: [] } :
    await sb.from('wellness_entries').select('*').order('entry_date', { ascending: false }).limit(14);

  const qHtml = WELLNESS_QUESTIONS.map((q, qi) => `
    <fieldset class="wq">
      <legend><b>${qi + 1}. ${esc(q.title)}</b> <span class="muted-inline">${esc(q.q)}</span></legend>
      <div class="wq-opts">
        ${q.a.map((txt, i) => `
          <label class="wq-opt"><input type="radio" name="wq_${q.key}" value="${i + 1}" required ${canEdit || preview ? '' : 'disabled'}>
            <span class="wq-num">${i + 1}</span><span class="wq-txt">${esc(txt)}</span></label>`).join('')}
      </div>
    </fieldset>`).join('');

  const history = (rows && rows.length) ? rows.map(r => `
      <tr><td>${wDate(r.entry_date)}</td><td>${r.sleep}</td><td>${r.fatigue}</td><td>${r.pain}</td><td>${r.energy}</td>
      <td><b>${wellnessComposite(r).toFixed(2).replace('.', ',')}</b></td><td>${esc(r.comment || '')}</td></tr>`).join('')
    : `<tr><td colspan="7" class="muted">Noch keine Eintr&auml;ge.</td></tr>`;

  const content = `
    ${preview ? `<div class="notice" style="margin-bottom:14px;">Vorschau: So sehen Athlet:innen den Fragebogen. Freischalten je Person in der <b>Nutzerverwaltung &rarr; Rechte</b>. In der Vorschau wird nichts gespeichert.</div>` : ''}
    <div class="card" ${canEdit || preview ? '' : 'hidden'}>
      <h2>Wellness-Check</h2>
      <p class="hint" style="margin-top:0;">Bitte morgens vor dem Training ausf&uuml;llen (ca. 30 Sekunden). Bei allen Fragen gilt: <b>5 = sehr gut, 1 = sehr schlecht</b>.</p>
      <form id="wellForm">
        <label class="wq-date">Datum <input type="date" id="wellDate" value="${today}" required></label>
        ${qHtml}
        <label class="wq-comment">M&ouml;chtest du etwas erg&auml;nzen? (optional)
          <input type="text" id="wellComment" maxlength="300" placeholder="z. B. Krankheit, private Belastung, Verletzung im Anmarsch"></label>
        <button type="submit">${preview ? 'Absenden (Vorschau &ndash; wird nicht gespeichert)' : 'Absenden'}</button>
        <p class="notice" id="wellMsg" hidden></p>
      </form>
    </div>
    ${preview ? '' : `
    <div class="card">
      <h2>Meine letzten Eintr&auml;ge</h2>
      <div class="tablewrap"><table>
        <thead><tr><th>Datum</th><th>Schlaf</th><th>Erm&uuml;dung</th><th>Schmerzen</th><th>Energie</th><th>Wellness</th><th>Kommentar</th></tr></thead>
        <tbody>${history}</tbody>
      </table></div>
    </div>`}
  `;
  renderShell(profile, preview ? 'loadmanagement' : 'wellness', preview ? 'Wellness-Fragebogen (Vorschau)' : 'Wellness-Check', content);

  const form = document.getElementById('wellForm');
  if (!form) return;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const msg = document.getElementById('wellMsg');
    const val = (k) => parseInt((form.querySelector(`input[name="wq_${k}"]:checked`) || {}).value, 10);
    const rec = { entry_date: document.getElementById('wellDate').value, sleep: val('sleep'), fatigue: val('fatigue'),
      pain: val('pain'), energy: val('energy'), comment: document.getElementById('wellComment').value.trim() || null };
    msg.hidden = false;
    if (preview) { msg.textContent = `Vorschau: Wellness-Wert ${wellnessComposite(rec).toFixed(2).replace('.', ',')} – nicht gespeichert.`; return; }
    const { data: { user } } = await sb.auth.getUser();
    const { error } = await sb.from('wellness_entries').upsert({ user_id: user.id, ...rec }, { onConflict: 'user_id,entry_date' });
    if (error) { msg.textContent = 'Fehler: ' + error.message; return; }
    toast('Wellness-Check gespeichert. Danke!');
    renderWellnessPage(profile);
  };
}

// ---------- Wellness-Übersicht (Admin/Trainer) ----------
let WELL_GROUP = '';
async function renderWellnessOverview(profile) {
  const days = weekDates();
  const dayLabels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const [profRes, entRes, mgmt] = await Promise.all([
    sb.from('profiles').select('id, name').eq('role', 'athlete').order('name'),
    sb.from('wellness_entries').select('user_id, entry_date, sleep, fatigue, pain, energy, comment').in('entry_date', days),
    loadAthleteData().catch(() => null),
  ]);
  const byUserDate = {};
  (entRes.data || []).forEach(e => { (byUserDate[e.user_id] = byUserDate[e.user_id] || {})[e.entry_date] = e; });

  let people;
  const groups = mgmt ? mgmt.groups : [];
  if (WELL_GROUP && mgmt && mgmt.groupsById[WELL_GROUP]) {
    people = mgmt.athletes.filter(a => a.groupIds.includes(WELL_GROUP))
      .sort((x, y) => x.last_name.localeCompare(y.last_name, 'de') || x.first_name.localeCompare(y.first_name, 'de'))
      .map(a => ({ name: `${a.first_name} ${a.last_name}`, userId: a.profile_id || null }));
  } else {
    WELL_GROUP = '';
    people = (profRes.data || []).map(p => ({ name: p.name, userId: p.id }));
  }
  const cls = (v) => v === null ? 'load-empty' : (v < 2.5 ? 'load-high' : (v < 3.5 ? 'well-mid' : 'load-ok'));
  const rows = people.length ? people.map(a => {
    if (!a.userId) return `<tr class="no-access"><td>${esc(a.name)}</td><td colspan="7" class="muted">kein App-Zugang</td></tr>`;
    return `<tr><td>${esc(a.name)}</td>${days.map(d => {
      const e = byUserDate[a.userId] && byUserDate[a.userId][d];
      const v = e ? wellnessComposite(e) : null;
      const tip = e ? `Schlaf ${e.sleep} · Ermüdung ${e.fatigue} · Schmerzen ${e.pain} · Energie ${e.energy}${e.comment ? ' · „' + e.comment + '“' : ''}` : '';
      return `<td class="${cls(v)}" title="${esc(tip)}">${v === null ? '–' : v.toFixed(1).replace('.', ',')}${e && e.comment ? ' 💬' : ''}</td>`;
    }).join('')}</tr>`;
  }).join('') : `<tr><td colspan="8" class="muted">Keine Athlet:innen.</td></tr>`;

  const content = `
    <div class="card">
      <div class="ath-toolbar" style="margin-bottom:6px;">
        <h2 style="margin:0;">Wellness &mdash; diese Woche</h2>
        <span class="spacer"></span>
        <select id="wellGroup">
          <option value="">Alle mit App-Zugang</option>
          ${groups.map(g => `<option value="${g.id}" ${WELL_GROUP === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}
        </select>
      </div>
      <div class="tablewrap"><table>
        <thead><tr><th>Name</th>${dayLabels.map(l => `<th>${l}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="hint">Wert = Durchschnitt aus Schlaf, Erm&uuml;dung, Schmerzen, Energie (1&ndash;5, 5 = sehr gut). Rot &lt; 2,5 &middot; Gelb 2,5&ndash;3,4 &middot; Gr&uuml;n &ge; 3,5. Maus &uuml;ber den Wert zeigt die Einzelantworten, 💬 = Kommentar.
      Ins Load-Management-Tool: dort bei Wellness &bdquo;📱 Aus App &uuml;bernehmen&ldquo;.</p>
    </div>`;
  renderShell(profile, 'loadmanagement', 'Wellness aus der App', content);
  document.getElementById('wellGroup').onchange = (e) => { WELL_GROUP = e.target.value; renderWellnessOverview(profile); };
}

// ---------- Tool-Rechte je Athlet:in (Nutzerverwaltung, nur Admin) ----------
const PERM_TOOLS = [
  { key: 'srpe', label: 'Session-RPE', levels: [['none', 'kein Zugriff'], ['view', 'nur ansehen'], ['edit', 'eintragen']] },
  { key: 'wellness', label: 'Wellness-Check', levels: [['none', 'kein Zugriff'], ['view', 'nur ansehen'], ['edit', 'eintragen']] },
  { key: 'trainingsplan', label: 'Trainingsplanung', levels: [['none', 'kein Zugriff'], ['edit', 'Zugriff']] },
  { key: 'warmup', label: 'Warm-up', levels: [['none', 'kein Zugriff'], ['edit', 'Zugriff']] },
];
function permSummary(perms) {
  const p = Object.assign({}, PERM_DEFAULT, perms || {});
  return PERM_TOOLS.filter(t => p[t.key] !== 'none')
    .map(t => `<span class="chip">${esc(t.label)}${p[t.key] === 'view' ? ' (ansehen)' : ''}</span>`).join('') || '<span class="muted">nichts freigeschaltet</span>';
}
function openPermissionsDialog(user, done) {
  const p = Object.assign({}, PERM_DEFAULT, user.permissions || {});
  const host = document.createElement('div');
  host.innerHTML = `
    <div class="modal-scrim"><div class="modal">
      <h2>Tool-Rechte: ${esc(user.name)}</h2>
      <p class="hint" style="margin-top:0;">Was diese Person in der App sieht und ver&auml;ndern darf. Wird zus&auml;tzlich in der Datenbank gepr&uuml;ft.</p>
      <table class="perm-table"><tbody>
        ${PERM_TOOLS.map(t => `<tr><td><b>${esc(t.label)}</b></td><td>
          ${t.levels.map(([v, l]) => `<label class="perm-opt"><input type="radio" name="perm_${t.key}" value="${v}" ${p[t.key] === v ? 'checked' : ''}> ${l}</label>`).join('')}
        </td></tr>`).join('')}
      </tbody></table>
      <div class="modal-actions"><span class="spacer"></span>
        <button type="button" class="secondary" id="permCancel">Abbrechen</button>
        <button type="button" id="permSave">Speichern</button></div>
    </div></div>`;
  document.body.appendChild(host);
  const close = () => host.remove();
  host.querySelector('#permCancel').onclick = close;
  host.querySelector('#permSave').onclick = async () => {
    const perms = {};
    PERM_TOOLS.forEach(t => { perms[t.key] = (host.querySelector(`input[name="perm_${t.key}"]:checked`) || {}).value || 'none'; });
    const { error } = await sb.from('profiles').update({ permissions: perms }).eq('id', user.id);
    if (error) { toast('Fehler: ' + error.message); return; }
    toast('Rechte gespeichert.');
    close(); done();
  };
}
