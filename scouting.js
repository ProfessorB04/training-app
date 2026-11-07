// ============================================================
// Scouting Basketball (2026-11-07, Phase 1)
// Admin/Trainer/Coach: Liga von der DBB-Schnittstelle laden (Teams, Tabelle, Spielplan), Kader der Gegner
//   aus den Spielberichten, Spielerinnen-Profile (Nr., Position, Statistik, Notizen), Scouting-Reports
//   (Offense/Defense des Gegners, „So spielen wir sie“, Schlüsselspielerinnen, direkte Gegenspielerinnen),
//   Freigabe an Spielerinnen, Drucken/PDF.
// Athlet:innen: Menüpunkt „Scouting“ nur mit freigegebenem Report – kompletter Report, eigene Gegenspielerin hervorgehoben.
// Tabellen: sc_teams, sc_players, sc_games, sc_reports (+ sc_tags, sc_playlists für Video/Clips in Phase 2/3)
// DBB-Abruf über die Edge Function invite-user (action "dbb"), weil die Schnittstelle keine Browser-Abrufe erlaubt.
// ============================================================

const SC_LEAGUES = [
  { id: 55746, name: '2. DBBL Nord' },
  { id: 55749, name: '2. DBBL Süd' },
  { id: 55738, name: '1. DBBL' },
];
const SC_POS = ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'G/F', 'F/C'];
const SC_STATS = [['min', 'Min'], ['ppg', 'Pkt'], ['rpg', 'Reb'], ['apg', 'Ast'], ['p3', '3P %'], ['ft', 'FW %']];

const scLs = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
const scDate = iso => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const scNl = s => esc(s || '').replace(/\n/g, '<br>');
const scPName = p => [p.first_name, p.last_name].filter(Boolean).join(' ');
const scUid = () => 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function scDbb(path, payload) {
  const { data, error } = await sb.functions.invoke('invite-user', { body: { action: 'dbb', path, payload } });
  if (error || !data || data.error) throw new Error((data && data.error) || (error && error.message) || 'DBB nicht erreichbar');
  if (String(data.status) !== '0') throw new Error(data.message || 'DBB: keine Daten');
  return data.data;
}

// ---------- Liga von der DBB-Schnittstelle laden ----------
async function scImportLeague(leagueId, onStep) {
  const step = t => onStep && onStep(t);
  step('Tabelle …');
  const act = await scDbb('competition/actual/id/' + leagueId);
  step('Spielplan …');
  const plan = await scDbb('competition/spielplan/id/' + leagueId);
  const season = (act.ligaData && act.ligaData.seasonName) || '';
  const leagueName = (act.ligaData && act.ligaData.liganame) || '';
  const table = ((act.tabelle || {}).entries || []);
  const teamsDbb = {};
  const addT = (t, row) => { if (!t || !t.teamPermanentId) return; teamsDbb[t.teamPermanentId] = Object.assign(teamsDbb[t.teamPermanentId] || { name: t.teamname, short: t.teamnameSmall }, row ? { table: row } : {}); };
  table.forEach(e => addT(e.team, { rang: e.rang, spiele: e.anzspiele, s: e.s, n: e.n, koerbe: e.koerbe, gegen: e.gegenKoerbe, diff: e.korbdiff }));
  (plan.matches || []).forEach(m => { addT(m.homeTeam); addT(m.guestTeam); });
  step('Teams speichern …');
  const { data: have } = await sb.from('sc_teams').select('id, dbb_team_id, notes').eq('season', season).not('dbb_team_id', 'is', null);
  const idOf = {};
  (have || []).forEach(t => { idOf[t.dbb_team_id] = t; });
  for (const [dbbId, t] of Object.entries(teamsDbb)) {
    const ex = idOf[dbbId];
    const notes = Object.assign({}, ex ? ex.notes : {}, t.table ? { table: t.table } : {});
    const row = { name: t.name, short_name: t.short, league_id: leagueId, league_name: leagueName, season, dbb_team_id: +dbbId, notes, updated_at: new Date().toISOString() };
    if (ex) { const r = await sb.from('sc_teams').update(row).eq('id', ex.id); if (r.error) throw r.error; }
    else { const r = await sb.from('sc_teams').insert(row).select('id, dbb_team_id, notes').single(); if (r.error) throw r.error; idOf[dbbId] = r.data; }
  }
  step('Spiele speichern …');
  const games = (plan.matches || []).map(m => ({
    dbb_match_id: m.matchId, league_id: leagueId, game_date: m.kickoffDate || null,
    home_name: m.homeTeam && m.homeTeam.teamname, guest_name: m.guestTeam && m.guestTeam.teamname,
    home_team_id: m.homeTeam && idOf[m.homeTeam.teamPermanentId] ? idOf[m.homeTeam.teamPermanentId].id : null,
    guest_team_id: m.guestTeam && idOf[m.guestTeam.teamPermanentId] ? idOf[m.guestTeam.teamPermanentId].id : null,
    result: m.result || null,
  }));
  for (let i = 0; i < games.length; i += 100) {
    const r = await sb.from('sc_games').upsert(games.slice(i, i + 100), { onConflict: 'dbb_match_id' });
    if (r.error) throw r.error;
  }
  return { teams: Object.keys(teamsDbb).length, games: games.length, season, leagueName };
}

// Kader eines Teams aus den Spielberichten (Boxscores) der gespielten Spiele
async function scImportRoster(team, onStep) {
  const { data: games } = await sb.from('sc_games').select('*').or(`home_team_id.eq.${team.id},guest_team_id.eq.${team.id}`).not('result', 'is', null);
  const seen = {};
  let n = 0;
  for (const g of (games || [])) {
    n++; onStep && onStep('Spielbericht ' + n + '/' + games.length + ' …');
    let box = g.boxscore && g.boxscore.home ? g.boxscore : null;
    if (!box) {
      try {
        const d = await scDbb('match/id/' + g.dbb_match_id + '/boxscore');
        const mb = d.matchBoxscore || {};
        const slim = list => (list || []).map(p => ({ id: p.player && p.player.person ? p.player.person.id : null, no: p.player ? p.player.no : '', vn: p.player && p.player.person ? p.player.person.vorname : '', nn: p.player && p.player.person ? p.player.person.nachname : '', pts: p.pts, min: p.esz, rt: p.rt, as: p.as, st: p.st, to: p.to, bs: p.bs, fo: p.fouls, p3m: p.threePoints && p.threePoints.made, p3a: p.threePoints && p.threePoints.attempted, ftm: p.wt && p.wt.made, fta: p.wt && p.wt.attempted }));
        box = { home: slim(mb.homePlayerStats), guest: slim(mb.guestPlayerStats), statType: d.statisticType };
        const mr = d.matchResult || {};
        await sb.from('sc_games').update({ boxscore: box, quarters: mr }).eq('id', g.id);
      } catch (e) { continue; }
    }
    const side = g.home_team_id === team.id ? box.home : box.guest;
    (side || []).forEach(p => {
      if (!p.id) return;
      const s = seen[p.id] || (seen[p.id] = { id: p.id, vn: p.vn, nn: p.nn, no: '', games: 0, pts: 0, min: 0, rt: 0, as: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0, withStats: 0 });
      s.games++;
      if (p.no && p.no !== '0') s.no = p.no;
      if ((p.pts || 0) + (p.min || 0) + (p.rt || 0) > 0) { s.withStats++; ['pts', 'min', 'rt', 'as', 'p3m', 'p3a', 'ftm', 'fta'].forEach(k => { s[k] += +p[k] || 0; }); }
    });
  }
  onStep && onStep('Kader speichern …');
  const { data: have } = await sb.from('sc_players').select('*').eq('team_id', team.id);
  const byDbb = {}; (have || []).forEach(p => { if (p.dbb_person_id) byDbb[p.dbb_person_id] = p; });
  let added = 0;
  for (const s of Object.values(seen)) {
    const ex = byDbb[s.id];
    const auto = s.withStats ? { ppg: +(s.pts / s.withStats).toFixed(1), rpg: +(s.rt / s.withStats).toFixed(1), apg: +(s.as / s.withStats).toFixed(1), min: +(s.min / s.withStats).toFixed(1), p3: s.p3a ? Math.round(100 * s.p3m / s.p3a) : null, ft: s.fta ? Math.round(100 * s.ftm / s.fta) : null, src: 'DBB' } : null;
    if (ex) {
      const upd = { games: s.games, updated_at: new Date().toISOString() };
      if (!ex.number && s.no) upd.number = s.no;
      if (auto && (!ex.stats || !ex.stats.manual)) upd.stats = auto;
      await sb.from('sc_players').update(upd).eq('id', ex.id);
    } else {
      await sb.from('sc_players').insert({ team_id: team.id, dbb_person_id: s.id, first_name: s.vn || '', last_name: s.nn || '', number: s.no || null, games: s.games, stats: auto || {} });
      added++;
    }
  }
  return { players: Object.keys(seen).length, added, games: (games || []).length };
}

// ---------- Übersicht ----------
async function renderScHub(profile) {
  const T = 'Scouting';
  renderShell(profile, 'scouting', T, `<p class="muted">Lade&hellip;</p>`);
  const league = +(scLs('sc_league') || SC_LEAGUES[0].id);
  const [tRes, rRes, pRes] = await Promise.all([
    sb.from('sc_teams').select('*').order('name'),
    sb.from('sc_reports').select('id, title, opponent_team_id, game_date, status, shared_with, updated_at').order('game_date', { ascending: false, nullsFirst: true }),
    sb.from('sc_players').select('team_id'),
  ]);
  if (tRes.error) {
    renderShell(profile, 'scouting', T, `<div class="card"><p class="error">Fehler: ${esc(tRes.error.message)}${/sc_teams|relation|schema cache/.test(tRes.error.message) ? '<br>Die Datenbank-Tabellen fehlen noch: <code>bash deploy_supabase.sh supabase_migration_scouting.sql</code>' : ''}</p></div>`);
    return;
  }
  const teams = tRes.data || [];
  const lt = teams.filter(t => t.league_id === league || (!t.league_id && t.is_own));
  const count = {}; (pRes.data || []).forEach(p => { count[p.team_id] = (count[p.team_id] || 0) + 1; });
  const tName = id => (teams.find(t => t.id === id) || {}).name || '–';
  const reports = rRes.data || [];
  const sorted = lt.slice().sort((a, b) => ((a.notes.table || {}).rang || 99) - ((b.notes.table || {}).rang || 99) || a.name.localeCompare(b.name, 'de'));
  const content = `
    <div class="sc-top">
      <select id="scLeague">${SC_LEAGUES.map(l => `<option value="${l.id}"${l.id === league ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select>
      <button type="button" class="secondary" id="scImport">&#8635; Liga von DBB laden</button>
      <button type="button" id="scNewReport">&#10133; Neuer Scouting-Report</button>
      <span id="scStatus" class="muted-inline"></span>
    </div>
    <div class="card">
      <h2>Scouting-Reports</h2>
      ${reports.length ? `<div class="sc-list">${reports.map(r => `
        <button type="button" class="sc-row" data-rep="${r.id}">
          <span><b>${esc(r.title || 'Scouting-Report')}</b><span class="muted-inline"> &middot; ${esc(tName(r.opponent_team_id))}${r.game_date ? ' &middot; ' + scDate(r.game_date) : ''}</span></span>
          <span class="sc-badges"><span class="chip ${r.status === 'published' ? 'sc-pub' : ''}">${r.status === 'published' ? 'freigegeben' : 'Entwurf'}</span>${(r.shared_with || []).length ? `<span class="chip">&#128065; ${r.shared_with.length}</span>` : ''}</span>
        </button>`).join('')}</div>` : '<p class="muted">Noch keine Reports.</p>'}
    </div>
    <div class="card">
      <h2>Teams ${esc((SC_LEAGUES.find(l => l.id === league) || {}).name || '')}${lt[0] && lt[0].season ? ' &middot; ' + esc(lt[0].season) : ''}</h2>
      ${sorted.length ? `<div class="tablewrap"><table class="sc-table"><thead><tr><th>#</th><th>Team</th><th>Bilanz</th><th>K&ouml;rbe</th><th>Kader</th><th></th></tr></thead><tbody>
        ${sorted.map(t => { const tb = t.notes.table || {}; return `<tr data-team="${t.id}"${t.is_own ? ' class="sc-own"' : ''}><td>${tb.rang || ''}</td><td><b>${esc(t.name)}</b>${t.is_own ? ' <span class="chip sc-pub">eigenes Team</span>' : ''}</td><td>${tb.s != null ? tb.s + ':' + tb.n : ''}</td><td>${tb.koerbe != null ? tb.koerbe + ':' + tb.gegen : ''}</td><td>${count[t.id] || 0}</td><td><button type="button" class="secondary small-btn" data-open="${t.id}">&Ouml;ffnen</button></td></tr>`; }).join('')}
      </tbody></table></div>` : '<p class="muted">Noch keine Teams &ndash; &bdquo;Liga von DBB laden&ldquo; holt Tabelle, Teams und Spielplan.</p>'}
      <p class="hint">Quelle: DBB-Spielbetrieb (basketball-bund.net). F&uuml;r die 2. DBBL liefert der DBB Kader und Ergebnisse, aber keine Einzelstatistik &ndash; Statistik bei Bedarf in den Spielerinnen-Profilen eintragen.</p>
    </div>`;
  renderShell(profile, 'scouting', T, content);
  document.getElementById('scLeague').onchange = e => { scLs('sc_league', e.target.value); renderScHub(profile); };
  document.getElementById('scImport').onclick = async () => {
    const st = document.getElementById('scStatus'), b = document.getElementById('scImport');
    b.disabled = true;
    try { const r = await scImportLeague(league, t => { st.textContent = t; }); toast(r.leagueName + ' ' + r.season + ': ' + r.teams + ' Teams, ' + r.games + ' Spiele geladen.'); renderScHub(profile); }
    catch (e) { st.textContent = ''; b.disabled = false; toast('Fehler: ' + e.message); }
  };
  document.getElementById('scNewReport').onclick = () => renderScReport(profile, null, null);
  appEl.querySelectorAll('[data-rep]').forEach(b => b.onclick = () => renderScReport(profile, b.dataset.rep));
  appEl.querySelectorAll('[data-open]').forEach(b => b.onclick = () => renderScTeam(profile, b.dataset.open));
}

// ---------- Team: Kader + Spiele ----------
async function renderScTeam(profile, teamId) {
  const back = { label: 'Scouting', go: () => renderScHub(profile) };
  renderShell(profile, 'scouting', 'Team', `<p class="muted">Lade&hellip;</p>`, back);
  const [tRes, pRes, gRes] = await Promise.all([
    sb.from('sc_teams').select('*').eq('id', teamId).single(),
    sb.from('sc_players').select('*').eq('team_id', teamId),
    sb.from('sc_games').select('id, game_date, home_name, guest_name, home_team_id, guest_team_id, result').or(`home_team_id.eq.${teamId},guest_team_id.eq.${teamId}`).order('game_date'),
  ]);
  if (tRes.error) { renderShell(profile, 'scouting', 'Team', `<div class="card"><p class="error">${esc(tRes.error.message)}</p></div>`, back); return; }
  const team = tRes.data, tb = team.notes.table || {};
  const players = (pRes.data || []).sort((a, b) => (parseInt(a.number, 10) || 999) - (parseInt(b.number, 10) || 999) || a.last_name.localeCompare(b.last_name, 'de'));
  const games = gRes.data || [];
  const statLine = p => SC_STATS.filter(([k]) => p.stats && p.stats[k] != null && p.stats[k] !== '').map(([k, l]) => `<span class="chip">${l} ${esc(String(p.stats[k]))}</span>`).join(' ');
  const card = p => `<button type="button" class="sc-pcard${p.active === false ? ' sc-inactive' : ''}" data-pl="${p.id}">
      <span class="sc-num">${esc(p.number || '–')}</span>
      <span class="sc-pbody"><b>${esc(scPName(p))}</b><span class="muted-inline">${[p.position, p.height, p.birth_year ? 'Jg. ' + p.birth_year : '', p.games ? p.games + ' Sp.' : ''].filter(Boolean).map(esc).join(' &middot; ')}</span>
        <span>${statLine(p)}</span>
        ${p.notes && (p.notes.offense || p.notes.strengths) ? `<span class="sc-pnote">${esc((p.notes.offense || p.notes.strengths || '').slice(0, 110))}</span>` : ''}</span></button>`;
  const content = `
    <div class="card">
      <div class="tpo-head"><div><div class="tpo-title">${esc(team.name)}</div>
        <div class="muted-inline">${esc(team.league_name || '')}${team.season ? ' &middot; ' + esc(team.season) : ''}${tb.rang ? ' &middot; Platz ' + tb.rang + ' (' + tb.s + ':' + tb.n + ', K&ouml;rbe ' + tb.koerbe + ':' + tb.gegen + ')' : ''}</div></div>
        <label class="sc-ownlbl"><input type="checkbox" id="scOwn"${team.is_own ? ' checked' : ''}> eigenes Team</label></div>
      <div class="sc-top">
        <button type="button" id="scRoster">&#8635; Kader aus Spielberichten laden</button>
        <button type="button" class="secondary" id="scAddPl">+ Spielerin</button>
        ${team.is_own ? '' : `<button type="button" class="secondary" id="scRepTeam">&#10133; Scouting-Report gegen ${esc(team.short_name || team.name)}</button>`}
        <span id="scStatus" class="muted-inline"></span>
      </div>
    </div>
    <div class="card"><h2>Kader (${players.length})</h2>
      ${players.length ? `<div class="sc-pgrid">${players.map(card).join('')}</div>` : '<p class="muted">Noch keine Spielerinnen &ndash; &bdquo;Kader aus Spielberichten laden&ldquo;.</p>'}
      <p class="hint">Antippen &rarr; Profil bearbeiten (Nr., Position, Gr&ouml;&szlig;e, Statistik, Offense/Defense, St&auml;rken/Schw&auml;chen).</p></div>
    <div class="card"><h2>Spiele</h2>
      ${games.length ? `<div class="tablewrap"><table class="sc-table"><tbody>${games.map(g => {
        const home = g.home_team_id === teamId, opp = home ? g.guest_name : g.home_name;
        let res = '';
        if (g.result) { const [a, b] = g.result.split(':').map(Number); const own = home ? a : b, other = home ? b : a; res = `<b class="${own > other ? 'sc-win' : 'sc-loss'}">${own > other ? 'S' : 'N'} ${own}:${other}</b>`; }
        return `<tr><td>${scDate(g.game_date)}</td><td>${home ? 'vs' : '@'} ${esc(opp || '')}</td><td>${res}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">Keine Spiele &ndash; Liga in der &Uuml;bersicht laden.</p>'}</div>`;
  renderShell(profile, 'scouting', team.name, content, back);
  document.getElementById('scOwn').onchange = async e => { const r = await sb.from('sc_teams').update({ is_own: e.target.checked }).eq('id', teamId); toast(r.error ? 'Fehler: ' + r.error.message : 'Gespeichert.'); renderScTeam(profile, teamId); };
  document.getElementById('scRoster').onclick = async () => {
    const st = document.getElementById('scStatus'), b = document.getElementById('scRoster'); b.disabled = true;
    try { const r = await scImportRoster(team, t => { st.textContent = t; }); toast(r.players + ' Spielerinnen aus ' + r.games + ' Spielberichten (' + r.added + ' neu).'); renderScTeam(profile, teamId); }
    catch (e) { b.disabled = false; st.textContent = ''; toast('Fehler: ' + e.message); }
  };
  document.getElementById('scAddPl').onclick = () => scEditPlayer({ team_id: teamId, first_name: '', last_name: '', stats: {}, notes: {}, active: true }, () => renderScTeam(profile, teamId));
  const rt = document.getElementById('scRepTeam'); if (rt) rt.onclick = () => renderScReport(profile, null, teamId);
  appEl.querySelectorAll('[data-pl]').forEach(b => b.onclick = () => scEditPlayer(players.find(p => p.id === b.dataset.pl), () => renderScTeam(profile, teamId)));
}

function scEditPlayer(p, done) {
  const x = JSON.parse(JSON.stringify(p)); x.stats = x.stats || {}; x.notes = x.notes || {};
  const host = document.createElement('div');
  host.className = 'modal-scrim';
  host.innerHTML = `<div class="modal" style="max-width:760px;"><h2>${x.id ? esc(scPName(x)) : 'Neue Spielerin'}</h2>
    <div class="modal-form sc-pform">
      <label>Vorname<input id="pF" value="${esc(x.first_name)}"></label>
      <label>Nachname<input id="pL" value="${esc(x.last_name)}"></label>
      <label>Nr.<input id="pN" value="${esc(x.number || '')}"></label>
      <label>Position<input id="pP" list="scPosDl" value="${esc(x.position || '')}"></label>
      <label>Gr&ouml;&szlig;e<input id="pH" value="${esc(x.height || '')}" placeholder="z. B. 1,82 m"></label>
      <label>Jahrgang<input id="pY" type="number" value="${esc(x.birth_year || '')}"></label>
      <label>Nation<input id="pNa" value="${esc(x.nation || '')}"></label>
      <label>Profil-Link<input id="pU" value="${esc(x.profile_url || '')}" placeholder="https://…"></label>
      <div class="sc-statrow" style="grid-column:1/-1;">${SC_STATS.map(([k, l]) => `<label>${l}<input data-st="${k}" value="${esc(x.stats[k] != null ? x.stats[k] : '')}"></label>`).join('')}</div>
      <label style="grid-column:1/-1;">Offense (Rolle, Lieblingsaktionen, Wurfzonen)<textarea id="nO" rows="2">${esc(x.notes.offense || '')}</textarea></label>
      <label style="grid-column:1/-1;">Defense (wie verteidigt sie, Foulverhalten)<textarea id="nD" rows="2">${esc(x.notes.defense || '')}</textarea></label>
      <label>St&auml;rken<textarea id="nS" rows="2">${esc(x.notes.strengths || '')}</textarea></label>
      <label>Schw&auml;chen<textarea id="nW" rows="2">${esc(x.notes.weaknesses || '')}</textarea></label>
      <label style="grid-column:1/-1;"><span><input type="checkbox" id="pA"${x.active !== false ? ' checked' : ''} style="width:auto;"> aktiv im Kader</span></label>
    </div>
    <datalist id="scPosDl">${SC_POS.map(v => `<option value="${v}">`).join('')}</datalist>
    <div class="cr-savebar">${x.id ? '<button type="button" class="danger" id="pDel">L&ouml;schen</button><span style="flex:1"></span>' : ''}<button type="button" class="secondary" id="pX">Abbrechen</button><button type="button" id="pOk">Speichern</button></div></div>`;
  document.body.appendChild(host);
  const q = s => host.querySelector(s);
  q('#pX').onclick = () => host.remove();
  if (q('#pDel')) q('#pDel').onclick = async () => { if (!confirm(scPName(x) + ' löschen?')) return; const r = await sb.from('sc_players').delete().eq('id', x.id); if (r.error) { toast('Fehler: ' + r.error.message); return; } host.remove(); done(); };
  q('#pOk').onclick = async () => {
    const stats = {}; host.querySelectorAll('[data-st]').forEach(i => { const v = i.value.trim().replace(',', '.'); if (v !== '') stats[i.dataset.st] = isNaN(+v) ? v : +v; });
    if (Object.keys(stats).length) stats.manual = true;
    const row = { team_id: x.team_id, first_name: q('#pF').value.trim(), last_name: q('#pL').value.trim(), number: q('#pN').value.trim() || null, position: q('#pP').value.trim() || null,
      height: q('#pH').value.trim() || null, birth_year: parseInt(q('#pY').value, 10) || null, nation: q('#pNa').value.trim() || null, profile_url: q('#pU').value.trim() || null,
      stats, notes: { offense: q('#nO').value, defense: q('#nD').value, strengths: q('#nS').value, weaknesses: q('#nW').value }, active: q('#pA').checked, updated_at: new Date().toISOString() };
    if (!row.first_name && !row.last_name) { alert('Bitte einen Namen eingeben.'); return; }
    const r = x.id ? await sb.from('sc_players').update(row).eq('id', x.id) : await sb.from('sc_players').insert(row);
    if (r.error) { toast('Fehler: ' + r.error.message); return; }
    host.remove(); toast('Gespeichert.'); done();
  };
}

// ---------- Scouting-Report ----------
async function renderScReport(profile, reportId, teamId) {
  let dirty = false;
  const back = { label: 'Scouting', go: () => { if (!dirty || confirm('Ungespeicherte Änderungen verwerfen?')) renderScHub(profile); } };
  renderShell(profile, 'scouting', 'Scouting-Report', `<p class="muted">Lade&hellip;</p>`, back);
  const [rRes, tRes, aRes] = await Promise.all([
    reportId ? sb.from('sc_reports').select('*').eq('id', reportId).single() : Promise.resolve({ data: null }),
    sb.from('sc_teams').select('id, name, short_name, league_id, is_own').order('name'),
    sb.from('profiles').select('id, name').eq('role', 'athlete').order('name'),
  ]);
  const teams = tRes.data || [], athletes = aRes.data || [];
  const R = rRes.data ? JSON.parse(JSON.stringify(rRes.data)) : { title: '', opponent_team_id: teamId || '', game_date: null, status: 'draft', shared_with: [], content: {} };
  const C = R.content = Object.assign({ summary: '', offense: '', sets: [], defense: '', gameplan_off: '', gameplan_def: '', keyPlayers: [], matchups: [] }, R.content || {});
  let roster = [];
  const loadRoster = async () => { roster = R.opponent_team_id ? ((await sb.from('sc_players').select('*').eq('team_id', R.opponent_team_id)).data || []).sort((a, b) => (parseInt(a.number, 10) || 999) - (parseInt(b.number, 10) || 999)) : []; };
  await loadRoster();
  const plOpt = sel => `<option value="">&ndash; Spielerin &ndash;</option>` + roster.map(p => `<option value="${p.id}"${p.id === sel ? ' selected' : ''}>#${esc(p.number || '–')} ${esc(scPName(p))}</option>`).join('');
  const athOpt = sel => `<option value="">&ndash; eigene Spielerin &ndash;</option>` + athletes.map(a => `<option value="${a.id}"${a.id === sel ? ' selected' : ''}>${esc(a.name || '?')}</option>`).join('');
  const ta = (id, label, val, ph, rows) => `<label class="sc-full">${label}<textarea data-c="${id}" rows="${rows || 4}" placeholder="${ph || ''}">${esc(val || '')}</textarea></label>`;
  const read = () => {
    R.title = document.getElementById('rT').value.trim(); R.opponent_team_id = document.getElementById('rO').value || null;
    R.game_date = document.getElementById('rD').value || null; R.status = document.getElementById('rS').value;
    appEl.querySelectorAll('[data-c]').forEach(t => { C[t.dataset.c] = t.value; });
    appEl.querySelectorAll('[data-set]').forEach(row => { const s = C.sets[+row.dataset.set]; s.name = row.querySelector('[data-f=name]').value; s.desc = row.querySelector('[data-f=desc]').value; s.answer = row.querySelector('[data-f=answer]').value; });
    appEl.querySelectorAll('[data-kp]').forEach(row => { const k = C.keyPlayers[+row.dataset.kp]; k.player_id = row.querySelector('select').value; k.note = row.querySelector('textarea').value; });
    appEl.querySelectorAll('[data-mu]').forEach(row => { const m = C.matchups[+row.dataset.mu]; m.user_id = row.querySelector('[data-f=own]').value; m.player_id = row.querySelector('[data-f=opp]').value; m.note = row.querySelector('textarea').value; });
    R.shared_with = [...appEl.querySelectorAll('[data-share]:checked')].map(c => c.dataset.share);
  };
  const draw = () => {
    const html = `
      <div class="card"><div class="sc-form">
        <label>Titel<input id="rT" value="${esc(R.title)}" placeholder="z. B. Scouting BG 74 Veilchen – 6. Spieltag"></label>
        <label>Gegner<select id="rO"><option value="">&ndash; w&auml;hlen &ndash;</option>${teams.filter(t => !t.is_own).map(t => `<option value="${t.id}"${t.id === R.opponent_team_id ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
        <label>Spieltag<input type="date" id="rD" value="${esc(R.game_date || '')}"></label>
        <label>Status<select id="rS"><option value="draft"${R.status !== 'published' ? ' selected' : ''}>Entwurf (nur Coaches)</option><option value="published"${R.status === 'published' ? ' selected' : ''}>Freigegeben f&uuml;r Spielerinnen</option></select></label>
      </div></div>
      <div class="card"><h2>&Uuml;berblick</h2>${ta('summary', 'Zusammenfassung / Spielidee des Gegners', C.summary, 'Tempo, Rotation, Form, Besonderheiten …', 3)}</div>
      <div class="card"><h2>Offense des Gegners</h2>
        ${ta('offense', 'Grundverhalten', C.offense, 'Systeme, Transition, Pick & Roll, Wurfauswahl, ATO …')}
        <h3 class="sc-h3">Spielz&uuml;ge / Sets</h3>
        ${C.sets.map((s, i) => `<div class="sc-sub" data-set="${i}"><div class="sc-subhead"><input data-f="name" value="${esc(s.name || '')}" placeholder="Name / Ansage (z. B. „Horns Flare“)"><button type="button" class="danger small-btn" data-rmset="${i}">&#10005;</button></div>
          <div class="sc-two"><textarea data-f="desc" rows="2" placeholder="Ablauf">${esc(s.desc || '')}</textarea><textarea data-f="answer" rows="2" placeholder="Unsere Antwort / Coverage">${esc(s.answer || '')}</textarea></div></div>`).join('')}
        <button type="button" class="secondary small-btn" id="rAddSet">+ Spielzug</button></div>
      <div class="card"><h2>Defense des Gegners</h2>${ta('defense', 'Verteidigung', C.defense, 'Mann/Zone, Press, Pick-&-Roll-Coverage, Help-Side, Rebound …')}</div>
      <div class="card sc-plan"><h2>So spielen wir sie</h2>
        <div class="sc-two">${ta('gameplan_off', 'Unsere Offense', C.gameplan_off, 'Wo greifen wir an, welche Sets, Matchups ausnutzen …', 5)}${ta('gameplan_def', 'Unsere Defense', C.gameplan_def, 'Coverage, wen helfen wir weg, Box-out, Transition-D …', 5)}</div></div>
      <div class="card"><h2>Schl&uuml;sselspielerinnen</h2>
        ${roster.length ? '' : '<p class="hint">Kader des Gegners noch leer &ndash; im Team &bdquo;Kader aus Spielberichten laden&ldquo;.</p>'}
        ${C.keyPlayers.map((k, i) => `<div class="sc-sub" data-kp="${i}"><div class="sc-subhead"><select>${plOpt(k.player_id)}</select><button type="button" class="danger small-btn" data-rmkp="${i}">&#10005;</button></div>
          <textarea rows="2" placeholder="Was macht sie gef&auml;hrlich, wie stoppen wir sie?">${esc(k.note || '')}</textarea></div>`).join('')}
        <button type="button" class="secondary small-btn" id="rAddKp">+ Schl&uuml;sselspielerin</button></div>
      <div class="card"><h2>Direkte Gegenspielerinnen (Matchups)</h2>
        <p class="hint" style="margin-top:-6px;">Jede eigene Spielerin sieht ihr Matchup im Report hervorgehoben.</p>
        ${C.matchups.map((m, i) => `<div class="sc-sub" data-mu="${i}"><div class="sc-subhead"><select data-f="own">${athOpt(m.user_id)}</select><span class="sc-vs">vs</span><select data-f="opp">${plOpt(m.player_id)}</select><button type="button" class="danger small-btn" data-rmmu="${i}">&#10005;</button></div>
          <textarea rows="2" placeholder="So verteidigst du sie / so greifst du sie an">${esc(m.note || '')}</textarea></div>`).join('')}
        <button type="button" class="secondary small-btn" id="rAddMu">+ Matchup</button></div>
      <div class="card"><h2>Freigabe f&uuml;r Spielerinnen</h2>
        <div class="sc-share-tools"><button type="button" class="secondary small-btn" id="rAll">alle Matchup-Spielerinnen</button><button type="button" class="secondary small-btn" id="rNone">keine</button></div>
        <div class="sc-share">${athletes.map(a => `<label><input type="checkbox" data-share="${a.id}"${R.shared_with.includes(a.id) ? ' checked' : ''}> ${esc(a.name || '?')}</label>`).join('') || '<span class="muted">Keine Spielerinnen mit App-Zugang.</span>'}</div>
        <p class="hint">Sichtbar erst mit Status &bdquo;Freigegeben f&uuml;r Spielerinnen&ldquo;. Die Spielerinnen sehen den kompletten Report inkl. Kader des Gegners.</p></div>
      <div class="cr-savebar">${R.id ? '<button type="button" class="danger" id="rDel">L&ouml;schen</button><span style="flex:1"></span>' : ''}
        <button type="button" class="secondary" id="rPrint">&#128424;&#65039; Drucken / PDF</button><button type="button" id="rSave">&#128190; Speichern</button></div>`;
    renderShell(profile, 'scouting', R.id ? 'Scouting-Report' : 'Neuer Scouting-Report', html, back);
    appEl.querySelectorAll('input, textarea, select').forEach(el => el.addEventListener('input', () => { dirty = true; }));
    document.getElementById('rO').onchange = async () => { read(); C.keyPlayers.forEach(k => { k.player_id = ''; }); C.matchups.forEach(m => { m.player_id = ''; }); await loadRoster(); dirty = true; draw(); };
    const add = (list, obj) => () => { read(); C[list].push(obj()); dirty = true; draw(); };
    document.getElementById('rAddSet').onclick = add('sets', () => ({ name: '', desc: '', answer: '' }));
    document.getElementById('rAddKp').onclick = add('keyPlayers', () => ({ player_id: '', note: '' }));
    document.getElementById('rAddMu').onclick = add('matchups', () => ({ user_id: '', player_id: '', note: '' }));
    const rm = (attr, list) => appEl.querySelectorAll('[' + attr + ']').forEach(b => b.onclick = () => { read(); C[list].splice(+b.getAttribute(attr), 1); dirty = true; draw(); });
    rm('data-rmset', 'sets'); rm('data-rmkp', 'keyPlayers'); rm('data-rmmu', 'matchups');
    document.getElementById('rAll').onclick = () => { const ids = new Set(appEl.querySelectorAll('[data-mu] [data-f=own]').length ? [...appEl.querySelectorAll('[data-mu] [data-f=own]')].map(s => s.value).filter(Boolean) : athletes.map(a => a.id)); appEl.querySelectorAll('[data-share]').forEach(c => { c.checked = ids.has(c.dataset.share) || c.checked; }); dirty = true; };
    document.getElementById('rNone').onclick = () => { appEl.querySelectorAll('[data-share]').forEach(c => { c.checked = false; }); dirty = true; };
    document.getElementById('rPrint').onclick = async () => { read(); scPrint(R, teams.find(t => t.id === R.opponent_team_id), roster, athletes); };
    if (document.getElementById('rDel')) document.getElementById('rDel').onclick = async () => {
      if (!confirm('Scouting-Report „' + (R.title || 'ohne Titel') + '“ löschen?')) return;
      const r = await sb.from('sc_reports').delete().eq('id', R.id); if (r.error) { toast('Fehler: ' + r.error.message); return; }
      dirty = false; toast('Gelöscht.'); renderScHub(profile);
    };
    document.getElementById('rSave').onclick = async () => {
      read();
      if (!R.opponent_team_id) { alert('Bitte den Gegner wählen.'); return; }
      if (!R.title) R.title = 'Scouting ' + ((teams.find(t => t.id === R.opponent_team_id) || {}).name || '');
      if (R.status === 'published' && !R.shared_with.length && !confirm('Freigegeben, aber noch keine Spielerin ausgewählt. Trotzdem speichern?')) return;
      const row = { title: R.title, opponent_team_id: R.opponent_team_id, game_date: R.game_date, content: C, status: R.status, shared_with: R.shared_with, updated_at: new Date().toISOString() };
      let r;
      if (R.id) r = await sb.from('sc_reports').update(row).eq('id', R.id).select('id').single();
      else { const { data: { user } } = await sb.auth.getUser(); r = await sb.from('sc_reports').insert(Object.assign(row, { created_by: user.id })).select('id').single(); }
      if (r.error) { alert('Speichern fehlgeschlagen: ' + r.error.message); return; }
      R.id = r.data.id; dirty = false;
      toast(R.status === 'published' ? 'Gespeichert – ' + R.shared_with.length + ' Spielerin(nen) sehen den Report.' : 'Entwurf gespeichert.');
      draw();
    };
  };
  draw();
}

// Report als lesbare Ansicht (für Spielerinnen und Druck)
function scReportHtml(R, team, roster, athletes, me) {
  const C = R.content || {};
  const pl = id => roster.find(p => p.id === id);
  const pLabel = p => p ? `#${esc(p.number || '–')} ${esc(scPName(p))}${p.position ? ' (' + esc(p.position) + ')' : ''}` : '–';
  const aName = id => (athletes.find(a => a.id === id) || {}).name || '';
  const sec = (title, body, cls) => body ? `<section class="scr-sec ${cls || ''}"><h3>${title}</h3>${body}</section>` : '';
  const mine = me ? (C.matchups || []).filter(m => m.user_id === me) : [];
  const statLine = p => SC_STATS.filter(([k]) => p.stats && p.stats[k] != null && p.stats[k] !== '').map(([k, l]) => `${l} ${esc(String(p.stats[k]))}`).join(' · ');
  return `
    <div class="scr-head"><div class="scr-title">${esc(R.title || 'Scouting-Report')}</div>
      <div class="scr-meta">${esc(team ? team.name : '')}${R.game_date ? ' · ' + scDate(R.game_date) : ''}</div></div>
    ${mine.length ? `<section class="scr-sec scr-mine"><h3>&#127919; Deine Gegenspielerin</h3>${mine.map(m => { const p = pl(m.player_id); return `<div class="scr-mu"><b>${pLabel(p)}</b>${p && statLine(p) ? `<div class="scr-small">${statLine(p)}</div>` : ''}${m.note ? `<div>${scNl(m.note)}</div>` : ''}${p && p.notes && (p.notes.offense || p.notes.defense) ? `<div class="scr-small">${p.notes.offense ? '<b>Offense:</b> ' + scNl(p.notes.offense) + '<br>' : ''}${p.notes.defense ? '<b>Defense:</b> ' + scNl(p.notes.defense) : ''}</div>` : ''}</div>`; }).join('')}</section>` : ''}
    ${sec('Überblick', C.summary ? `<p>${scNl(C.summary)}</p>` : '')}
    ${sec('Offense des Gegners', (C.offense ? `<p>${scNl(C.offense)}</p>` : '') + ((C.sets || []).filter(s => s.name || s.desc).length ? `<table class="scr-table"><thead><tr><th>Spielzug</th><th>Ablauf</th><th>Unsere Antwort</th></tr></thead><tbody>${C.sets.filter(s => s.name || s.desc).map(s => `<tr><td><b>${esc(s.name || '')}</b></td><td>${scNl(s.desc)}</td><td>${scNl(s.answer)}</td></tr>`).join('')}</tbody></table>` : ''))}
    ${sec('Defense des Gegners', C.defense ? `<p>${scNl(C.defense)}</p>` : '')}
    ${sec('So spielen wir sie', (C.gameplan_off ? `<h4>Unsere Offense</h4><p>${scNl(C.gameplan_off)}</p>` : '') + (C.gameplan_def ? `<h4>Unsere Defense</h4><p>${scNl(C.gameplan_def)}</p>` : ''), 'scr-plan')}
    ${sec('Schlüsselspielerinnen', (C.keyPlayers || []).filter(k => k.player_id).map(k => { const p = pl(k.player_id); return `<div class="scr-kp"><b>${pLabel(p)}</b>${p && statLine(p) ? ` <span class="scr-small">${statLine(p)}</span>` : ''}${k.note ? `<div>${scNl(k.note)}</div>` : ''}${p && p.notes && (p.notes.strengths || p.notes.weaknesses) ? `<div class="scr-small">${p.notes.strengths ? '<b>Stärken:</b> ' + scNl(p.notes.strengths) + ' ' : ''}${p.notes.weaknesses ? '<b>Schwächen:</b> ' + scNl(p.notes.weaknesses) : ''}</div>` : ''}</div>`; }).join(''))}
    ${sec('Matchups', (C.matchups || []).filter(m => m.user_id || m.player_id).length ? `<table class="scr-table"><tbody>${C.matchups.filter(m => m.user_id || m.player_id).map(m => `<tr${me && m.user_id === me ? ' class="scr-me"' : ''}><td><b>${esc(aName(m.user_id))}</b></td><td>vs ${pLabel(pl(m.player_id))}</td><td>${scNl(m.note)}</td></tr>`).join('')}</tbody></table>` : '')}
    ${sec('Kader ' + esc(team ? (team.short_name || team.name) : ''), roster.filter(p => p.active !== false).length ? `<table class="scr-table"><thead><tr><th>Nr.</th><th>Name</th><th>Pos.</th><th>Statistik</th><th>Hinweise</th></tr></thead><tbody>${roster.filter(p => p.active !== false).map(p => `<tr><td>${esc(p.number || '')}</td><td><b>${esc(scPName(p))}</b>${p.height ? `<div class="scr-small">${esc(p.height)}</div>` : ''}</td><td>${esc(p.position || '')}</td><td class="scr-small">${statLine(p)}</td><td class="scr-small">${[p.notes && p.notes.offense, p.notes && p.notes.defense].filter(Boolean).map(scNl).join('<br>')}</td></tr>`).join('')}</tbody></table>` : '')}`;
}

function scPrint(R, team, roster, athletes) {
  const w = window.open('', '_blank');
  if (!w) { alert('Bitte Pop-ups für diese Seite erlauben, um zu drucken.'); return; }
  const logo = new URL('logo-balance-movement.png', location.href).href;
  w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(R.title || 'Scouting-Report')}</title><style>
    body{font-family:-apple-system,"Segoe UI",Roboto,sans-serif;color:#141824;margin:22px;font-size:12.5px;line-height:1.45;}
    .scr-head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #a1d7ff;padding-bottom:8px;margin-bottom:12px;}
    .scr-title{font-size:20px;font-weight:800;color:#00113d;} .scr-meta{color:#5a6072;}
    .scr-sec{margin:12px 0;page-break-inside:avoid;} .scr-sec h3{font-size:14px;color:#00113d;border-left:4px solid #a1d7ff;padding-left:8px;margin:0 0 6px;} .scr-sec h4{margin:8px 0 2px;font-size:12.5px;}
    .scr-plan{background:#f2f8ff;padding:8px 10px;border-radius:8px;} p{margin:0 0 6px;}
    .scr-table{width:100%;border-collapse:collapse;} .scr-table th{background:#00113d;color:#fff;text-align:left;padding:4px 6px;font-size:11.5px;} .scr-table td{border-bottom:1px solid #d9dee8;padding:5px 6px;vertical-align:top;}
    .scr-small{color:#5a6072;font-size:11.5px;} .scr-kp,.scr-mu{margin:5px 0;}
    @media print{body{margin:10mm;} @page{size:A4;}}
  </style></head><body><img src="${logo}" style="height:40px;float:right;margin-left:10px;">${scReportHtml(R, team, roster, athletes, null)}
  <script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script></body></html>`);
  w.document.close();
}

// ---------- Athlet:innen ----------
async function scHasShared(profile) {
  try {
    const r = await sb.from('sc_reports').select('id', { count: 'exact', head: true }).eq('status', 'published').contains('shared_with', [profile.id]);
    return (r.count || 0) > 0;
  } catch (e) { return false; }
}

async function renderMyScouting(profile, reportId) {
  const T = 'Scouting';
  renderShell(profile, 'scouting', T, `<p class="muted">Lade&hellip;</p>`);
  const r = await sb.from('sc_reports').select('*').eq('status', 'published').contains('shared_with', [profile.id]).order('game_date', { ascending: false, nullsFirst: false });
  const reps = r.data || [];
  if (!reps.length) { renderShell(profile, 'scouting', T, `<div class="card"><h2>Noch kein Scouting-Report</h2><p class="muted">Sobald dein Coach einen Report freigibt, erscheint er hier.</p></div>`); return; }
  const R = reps.find(x => x.id === reportId) || reps[0];
  const [tRes, pRes, aRes] = await Promise.all([
    sb.from('sc_teams').select('*').eq('id', R.opponent_team_id).maybeSingle(),
    sb.from('sc_players').select('*').eq('team_id', R.opponent_team_id),
    sb.from('profiles').select('id, name').eq('role', 'athlete'),
  ]);
  const roster = (pRes.data || []).sort((a, b) => (parseInt(a.number, 10) || 999) - (parseInt(b.number, 10) || 999));
  const pick = reps.length > 1 ? `<div class="sc-top"><select id="scPick">${reps.map(x => `<option value="${x.id}"${x.id === R.id ? ' selected' : ''}>${esc(x.title || 'Scouting-Report')}${x.game_date ? ' · ' + scDate(x.game_date) : ''}</option>`).join('')}</select></div>` : '';
  renderShell(profile, 'scouting', T, `${pick}<div class="card scr-view">${scReportHtml(R, tRes.data, roster, aRes.data || [], profile.id)}</div>`);
  const s = document.getElementById('scPick'); if (s) s.onchange = () => renderMyScouting(profile, s.value);
}
