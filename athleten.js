// ============================================================
// Athletenverwaltung (Admin + Trainer:innen) — zentrale Athlet:innen & Gruppen in Supabase
// Tabellen: athletes, athlete_groups, athlete_group_members
// ============================================================

const ATH_STATE = { search: '', group: '', sort: { key: 'last_name', dir: 1 }, selected: new Set(), cache: null };

async function loadAthleteData() {
  const [a, g, m] = await Promise.all([
    sb.from('athletes').select('*'),
    sb.from('athlete_groups').select('*').order('name'),
    sb.from('athlete_group_members').select('*'),
  ]);
  const err = a.error || g.error || m.error;
  if (err) throw err;
  const groupsById = Object.fromEntries(g.data.map(x => [x.id, x]));
  const byAthlete = {};
  m.data.forEach(r => { (byAthlete[r.athlete_id] = byAthlete[r.athlete_id] || []).push(r.group_id); });
  const athletes = a.data.map(x => ({ ...x, groupIds: byAthlete[x.id] || [] }));
  return { athletes, groups: g.data, groupsById };
}

function athAge(iso) {
  if (!iso) return '';
  const b = new Date(iso + 'T00:00:00'), n = new Date();
  let age = n.getFullYear() - b.getFullYear();
  const mo = n.getMonth() - b.getMonth();
  if (mo < 0 || (mo === 0 && n.getDate() < b.getDate())) age--;
  return age >= 0 && age < 120 ? age : '';
}
function athDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
const GENDER_LABEL = { w: 'weiblich', m: 'männlich', d: 'divers' };

async function renderAthletesPage(profile, reuse) {
  if (!isStaff(profile)) { renderMenu(profile); return; }
  const st = ATH_STATE;
  let data = reuse ? st.cache : null;
  if (!data) {
    if (!document.querySelector('.ath-table')) renderShell(profile, 'athleten', 'Athletenverwaltung', `<p class="muted">Lade&hellip;</p>`);
    try { data = await loadAthleteData(); st.cache = data; }
    catch (e) {
      renderShell(profile, 'athleten', 'Athletenverwaltung',
        `<div class="card"><p class="error">Athletendaten konnten nicht geladen werden: ${esc(e.message)}</p></div>`);
      return;
    }
  }
  const { athletes, groups, groupsById } = data;
  if (st.group && !groupsById[st.group] && st.group !== '_none') st.group = '';

  // Filtern + Sortieren
  const q = st.search.trim().toLowerCase();
  let list = athletes.filter(a => {
    if (q && !(`${a.first_name} ${a.last_name}`.toLowerCase().includes(q) || `${a.last_name} ${a.first_name}`.toLowerCase().includes(q))) return false;
    if (st.group === '_none') return a.groupIds.length === 0;
    if (st.group) return a.groupIds.includes(st.group);
    return true;
  });
  const sortVal = (a, k) => {
    if (k === 'age') return athAge(a.birthdate) === '' ? null : athAge(a.birthdate);
    if (k === 'groups') return a.groupIds.map(id => (groupsById[id] || {}).name || '').sort().join(', ').toLowerCase() || null;
    const v = a[k];
    return v == null || v === '' ? null : String(v).toLowerCase();
  };
  list.sort((x, y) => {
    const vx = sortVal(x, st.sort.key), vy = sortVal(y, st.sort.key);
    if (vx === null && vy !== null) return 1;
    if (vy === null && vx !== null) return -1;
    let c = 0;
    if (vx !== null) c = (typeof vx === 'number' ? vx - vy : String(vx).localeCompare(String(vy), 'de')) * st.sort.dir;
    return c || x.last_name.localeCompare(y.last_name, 'de') || x.first_name.localeCompare(y.first_name, 'de');
  });
  // Auswahl auf sichtbare Personen begrenzen
  const visibleIds = new Set(list.map(a => a.id));
  [...st.selected].forEach(id => { if (!visibleIds.has(id)) st.selected.delete(id); });

  const groupOptions = groups.map(g => {
    const n = athletes.filter(a => a.groupIds.includes(g.id)).length;
    return `<option value="${g.id}" ${st.group === g.id ? 'selected' : ''}>${esc(g.name)} (${n})</option>`;
  }).join('');
  const noneCount = athletes.filter(a => !a.groupIds.length).length;

  const th = (key, label) => {
    const arrow = st.sort.key === key ? (st.sort.dir === 1 ? ' ▲' : ' ▼') : '';
    return `<th class="th-sort" data-sort="${key}">${label}${arrow}</th>`;
  };

  const rows = list.length ? list.map(a => `
      <tr data-id="${a.id}">
        <td><input type="checkbox" class="ath-sel" data-id="${a.id}" ${st.selected.has(a.id) ? 'checked' : ''}></td>
        <td><b>${esc(a.last_name)}</b></td>
        <td>${esc(a.first_name)}</td>
        <td>${athDate(a.birthdate)}</td>
        <td>${athAge(a.birthdate)}</td>
        <td>${esc(GENDER_LABEL[a.gender] || '')}</td>
        <td class="chips">${a.groupIds.map(id => groupsById[id] ? `<span class="chip">${esc(groupsById[id].name)}</span>` : '').join('')}</td>
        <td>${a.profile_id ? '<span class="chip app-chip" title="hat einen App-Zugang (Load Management)">App ✓</span>' : ''}</td>
        <td class="nowrap"><button type="button" class="secondary small-btn" data-edit="${a.id}">Bearbeiten</button></td>
      </tr>`).join('')
    : `<tr><td colspan="9" class="muted">Keine Athlet:innen gefunden.</td></tr>`;

  const content = `
    <div class="card">
      <div class="ath-toolbar">
        <input type="search" id="athSearch" placeholder="Name suchen…" value="${esc(st.search)}">
        <select id="athGroupFilter">
          <option value="">Alle Gruppen (${athletes.length})</option>
          ${groupOptions}
          <option value="_none" ${st.group === '_none' ? 'selected' : ''}>Ohne Gruppe (${noneCount})</option>
        </select>
        <span class="spacer"></span>
        <button type="button" id="athNew">+ Athlet:in</button>
        <button type="button" class="secondary" id="athGroups">Gruppen verwalten</button>
        <button type="button" class="secondary" id="athImport">Import</button>
        <input type="file" id="athImportFile" accept=".json,.csv,.txt" hidden>
      </div>
      <div class="ath-bulk" id="athBulk" ${st.selected.size ? '' : 'hidden'}>
        <b>${st.selected.size} ausgewählt</b>
        <select id="athBulkGroup">
          <option value="">Gruppe wählen…</option>
          ${groups.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}
        </select>
        <button type="button" id="athBulkAdd">Zur Gruppe hinzufügen</button>
        <button type="button" class="secondary" id="athBulkRemove">Aus Gruppe entfernen</button>
        <button type="button" class="danger" id="athBulkDelete">Löschen</button>
      </div>
      <div class="tablewrap">
        <table class="ath-table">
          <thead><tr>
            <th><input type="checkbox" id="athSelAll" ${list.length && list.every(a => st.selected.has(a.id)) ? 'checked' : ''}></th>
            ${th('last_name', 'Nachname')}${th('first_name', 'Vorname')}${th('birthdate', 'Geburtsdatum')}${th('age', 'Alter')}${th('gender', 'Geschlecht')}${th('groups', 'Gruppen')}${th('profile_id', 'App-Zugang')}
            <th></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="hint">${list.length} von ${athletes.length} Athlet:innen angezeigt. Spaltenkopf anklicken zum Sortieren. Mehrere per Häkchen auswählen, um sie gesammelt einer Gruppe zuzuordnen.
      Import: Sicherung aus der Trainingsplanung (.json) oder Liste (.csv mit Vorname;Nachname;Geburtsdatum;Geschlecht;Gruppe).</p>
    </div>
    <div id="athModal"></div>
  `;
  renderShell(profile, 'athleten', 'Athletenverwaltung', content);

  const rerender = () => renderAthletesPage(profile);          // nach Änderungen: neu laden
  const redraw = () => renderAthletesPage(profile, true);       // nur Ansicht (Suche, Filter, Sortierung, Auswahl)

  // Suche (Fokus behalten)
  const search = document.getElementById('athSearch');
  search.oninput = () => {
    st.search = search.value;
    const pos = search.selectionStart;
    redraw().then(() => {
      const s2 = document.getElementById('athSearch');
      if (s2) { s2.focus(); s2.setSelectionRange(pos, pos); }
    });
  };
  document.getElementById('athGroupFilter').onchange = (e) => { st.group = e.target.value; st.selected.clear(); redraw(); };
  appEl.querySelectorAll('th[data-sort]').forEach(h => {
    h.onclick = () => {
      const k = h.dataset.sort;
      st.sort = st.sort.key === k ? { key: k, dir: -st.sort.dir } : { key: k, dir: 1 };
      redraw();
    };
  });

  // Auswahl
  appEl.querySelectorAll('.ath-sel').forEach(cb => {
    cb.onchange = () => { cb.checked ? st.selected.add(cb.dataset.id) : st.selected.delete(cb.dataset.id); redraw(); };
  });
  document.getElementById('athSelAll').onchange = (e) => {
    list.forEach(a => e.target.checked ? st.selected.add(a.id) : st.selected.delete(a.id));
    redraw();
  };
  const bulkGroup = () => document.getElementById('athBulkGroup').value;
  const bulkAdd = document.getElementById('athBulkAdd');
  if (bulkAdd) {
    bulkAdd.onclick = async () => {
      const gid = bulkGroup(); if (!gid) { toast('Bitte eine Gruppe wählen.'); return; }
      const rowsIns = [...st.selected].map(id => ({ athlete_id: id, group_id: gid }));
      const { error } = await sb.from('athlete_group_members').upsert(rowsIns, { onConflict: 'athlete_id,group_id', ignoreDuplicates: true });
      if (error) { toast('Fehler: ' + error.message); return; }
      toast(`${rowsIns.length} zu „${groupsById[gid].name}“ hinzugefügt.`);
      st.selected.clear(); rerender();
    };
    document.getElementById('athBulkRemove').onclick = async () => {
      const gid = bulkGroup(); if (!gid) { toast('Bitte eine Gruppe wählen.'); return; }
      const { error } = await sb.from('athlete_group_members').delete().eq('group_id', gid).in('athlete_id', [...st.selected]);
      if (error) { toast('Fehler: ' + error.message); return; }
      toast(`Aus „${groupsById[gid].name}“ entfernt.`);
      st.selected.clear(); rerender();
    };
    document.getElementById('athBulkDelete').onclick = async () => {
      if (!confirm(`${st.selected.size} Athlet:innen dauerhaft löschen?`)) return;
      const { error } = await sb.from('athletes').delete().in('id', [...st.selected]);
      if (error) { toast('Fehler: ' + error.message); return; }
      toast('Gelöscht.');
      st.selected.clear(); rerender();
    };
  }

  // Bearbeiten / Neu
  appEl.querySelectorAll('[data-edit]').forEach(b => {
    b.onclick = () => openAthleteDialog(athletes.find(a => a.id === b.dataset.edit), groups, rerender);
  });
  document.getElementById('athNew').onclick = () => {
    const pre = st.group && st.group !== '_none' ? [st.group] : [];
    openAthleteDialog({ id: null, first_name: '', last_name: '', birthdate: null, gender: null, position: '', notes: '', groupIds: pre }, groups, rerender);
  };
  document.getElementById('athGroups').onclick = () => openGroupsDialog(groups, athletes, rerender);

  // Import
  const fileIn = document.getElementById('athImportFile');
  document.getElementById('athImport').onclick = () => fileIn.click();
  fileIn.onchange = async () => {
    const f = fileIn.files[0]; if (!f) return;
    try {
      const text = await f.text();
      const rows = parseAthleteImport(text, f.name);
      if (!rows.length) { toast('Keine Namen in der Datei gefunden.'); return; }
      const res = await importAthletes(rows, athletes, groups);
      toast(`Import: ${res.created} neu, ${res.updated} ergänzt, ${res.groupsCreated} neue Gruppen.`);
      rerender();
    } catch (e) {
      toast('Import fehlgeschlagen: ' + e.message);
    }
  };
}

// ---------- Dialog: Athlet:in bearbeiten ----------
function openAthleteDialog(a, groups, done) {
  const box = document.getElementById('athModal');
  box.innerHTML = `
    <div class="modal-scrim">
      <div class="modal">
        <h2>${a.id ? 'Athlet:in bearbeiten' : 'Neue Athlet:in'}</h2>
        <form id="athForm" class="modal-form">
          <label>Vorname<input type="text" id="fFirst" value="${esc(a.first_name)}" required></label>
          <label>Nachname<input type="text" id="fLast" value="${esc(a.last_name)}" required></label>
          <label>Geburtsdatum<input type="date" id="fBirth" value="${a.birthdate || ''}"></label>
          <label>Geschlecht
            <select id="fGender">
              <option value="">–</option>
              <option value="w" ${a.gender === 'w' ? 'selected' : ''}>weiblich</option>
              <option value="m" ${a.gender === 'm' ? 'selected' : ''}>männlich</option>
              <option value="d" ${a.gender === 'd' ? 'selected' : ''}>divers</option>
            </select>
          </label>
          <label>Position / Sportart<input type="text" id="fPos" value="${esc(a.position || '')}" placeholder="z. B. Guard, Fußball"></label>
          <label class="wide">Notiz<input type="text" id="fNotes" value="${esc(a.notes || '')}"></label>
          <div class="wide">
            <div class="lbl">Gruppen</div>
            <div class="group-checks">
              ${groups.map(g => `<label class="gcheck"><input type="checkbox" value="${g.id}" ${a.groupIds.includes(g.id) ? 'checked' : ''}> ${esc(g.name)}</label>`).join('') || '<span class="muted">Noch keine Gruppen angelegt.</span>'}
            </div>
          </div>
          <div class="wide modal-actions">
            ${a.id ? '<button type="button" class="danger" id="fDelete">Löschen</button>' : ''}
            <span class="spacer"></span>
            <button type="button" class="secondary" id="fCancel">Abbrechen</button>
            <button type="submit">Speichern</button>
          </div>
        </form>
      </div>
    </div>`;
  const close = () => { box.innerHTML = ''; };
  document.getElementById('fCancel').onclick = close;
  box.querySelector('.modal-scrim').onclick = (e) => { if (e.target.classList.contains('modal-scrim')) close(); };

  document.getElementById('athForm').onsubmit = async (e) => {
    e.preventDefault();
    const rec = {
      first_name: document.getElementById('fFirst').value.trim(),
      last_name: document.getElementById('fLast').value.trim(),
      birthdate: document.getElementById('fBirth').value || null,
      gender: document.getElementById('fGender').value || null,
      position: document.getElementById('fPos').value.trim() || null,
      notes: document.getElementById('fNotes').value.trim() || null,
    };
    const wanted = [...box.querySelectorAll('.group-checks input:checked')].map(c => c.value);
    let id = a.id;
    if (id) {
      const { error } = await sb.from('athletes').update(rec).eq('id', id);
      if (error) { toast('Fehler: ' + error.message); return; }
    } else {
      const { data, error } = await sb.from('athletes').insert(rec).select('id').single();
      if (error) { toast('Fehler: ' + error.message); return; }
      id = data.id;
    }
    const toAdd = wanted.filter(g => !a.groupIds.includes(g));
    const toDel = a.groupIds.filter(g => !wanted.includes(g));
    if (toAdd.length) {
      const { error } = await sb.from('athlete_group_members').insert(toAdd.map(g => ({ athlete_id: id, group_id: g })));
      if (error) { toast('Fehler Gruppen: ' + error.message); return; }
    }
    if (toDel.length) {
      const { error } = await sb.from('athlete_group_members').delete().eq('athlete_id', id).in('group_id', toDel);
      if (error) { toast('Fehler Gruppen: ' + error.message); return; }
    }
    toast('Gespeichert.');
    close(); done();
  };
  const del = document.getElementById('fDelete');
  if (del) del.onclick = async () => {
    if (!confirm(`${a.first_name} ${a.last_name} dauerhaft löschen?`)) return;
    const { error } = await sb.from('athletes').delete().eq('id', a.id);
    if (error) { toast('Fehler: ' + error.message); return; }
    toast('Gelöscht.');
    close(); done();
  };
}

// ---------- Dialog: Gruppen verwalten ----------
function openGroupsDialog(groups, athletes, done) {
  const box = document.getElementById('athModal');
  const count = id => athletes.filter(a => a.groupIds.includes(id)).length;
  box.innerHTML = `
    <div class="modal-scrim">
      <div class="modal">
        <h2>Gruppen verwalten</h2>
        <form id="grpNewForm" class="inline-form">
          <label>Neue Gruppe<input type="text" id="grpNewName" required placeholder="z. B. U16, Klasse 7a, Leichtathletik"></label>
          <button type="submit">Anlegen</button>
        </form>
        <table class="grp-table">
          <tbody>
            ${groups.map(g => `
              <tr>
                <td><input type="text" class="grp-name" data-id="${g.id}" value="${esc(g.name)}"></td>
                <td class="muted nowrap">${count(g.id)} Personen</td>
                <td class="nowrap"><button type="button" class="danger small-btn" data-gdel="${g.id}">Löschen</button></td>
              </tr>`).join('') || '<tr><td class="muted">Noch keine Gruppen.</td></tr>'}
          </tbody>
        </table>
        <p class="hint">Namen direkt im Feld ändern (wird beim Verlassen gespeichert). Beim Löschen einer Gruppe bleiben die Athlet:innen erhalten.</p>
        <div class="modal-actions"><span class="spacer"></span><button type="button" id="grpClose">Fertig</button></div>
      </div>
    </div>`;
  const close = () => { box.innerHTML = ''; done(); };
  document.getElementById('grpClose').onclick = close;
  document.getElementById('grpNewForm').onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('grpNewName').value.trim();
    const { data, error } = await sb.from('athlete_groups').insert({ name }).select().single();
    if (error) { toast(error.code === '23505' ? 'Diese Gruppe gibt es schon.' : 'Fehler: ' + error.message); return; }
    groups.push(data); groups.sort((x, y) => x.name.localeCompare(y.name, 'de'));
    openGroupsDialog(groups, athletes, done);
  };
  box.querySelectorAll('.grp-name').forEach(inp => {
    inp.onchange = async () => {
      const name = inp.value.trim(); if (!name) return;
      const { error } = await sb.from('athlete_groups').update({ name }).eq('id', inp.dataset.id);
      toast(error ? 'Fehler: ' + error.message : 'Gruppe umbenannt.');
    };
  });
  box.querySelectorAll('[data-gdel]').forEach(b => {
    b.onclick = async () => {
      const g = groups.find(x => x.id === b.dataset.gdel);
      if (!confirm(`Gruppe „${g.name}“ löschen? Die Athlet:innen bleiben erhalten.`)) return;
      const { error } = await sb.from('athlete_groups').delete().eq('id', g.id);
      if (error) { toast('Fehler: ' + error.message); return; }
      groups.splice(groups.indexOf(g), 1);
      openGroupsDialog(groups, athletes, done);
    };
  });
}

// ---------- Import ----------
// Unterstützt: Trainingsplan-Builder-Sicherung (.json mit athletes[{first,last,group}]),
// 30-15-IFT-/Sprint-Sicherungen mit Vorname/Nachname-Feldern, CSV (Vorname;Nachname;Geburtsdatum;Geschlecht;Gruppe)
function parseAthleteImport(text, filename) {
  const rows = [];
  const normDate = (v) => {
    v = String(v || '').trim();
    let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(v);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    return m ? v : null;
  };
  const normGender = (v) => {
    v = String(v || '').trim().toLowerCase();
    if (['w', 'f', 'weiblich', 'female'].includes(v)) return 'w';
    if (['m', 'männlich', 'male'].includes(v)) return 'm';
    if (['d', 'divers'].includes(v)) return 'd';
    return null;
  };
  if (/\.json$/i.test(filename) || text.trim().startsWith('{') || text.trim().startsWith('[')) {
    const d = JSON.parse(text);
    const collect = (arr, group) => (arr || []).forEach(x => {
      const first = x.first ?? x.vorname ?? x.firstName ?? '';
      const last = x.last ?? x.nachname ?? x.lastName ?? '';
      if (!String(first).trim() && !String(last).trim()) return;
      rows.push({
        first_name: String(first).trim(), last_name: String(last).trim(),
        birthdate: normDate(x.birthdate ?? x.geburtsdatum ?? x.birth ?? ''),
        gender: normGender(x.gender ?? x.geschlecht ?? x.sex ?? ''),
        groups: [x.group || group].filter(Boolean),
      });
    });
    if (Array.isArray(d)) collect(d);
    else if (Array.isArray(d.athletes)) collect(d.athletes);
    else if (Array.isArray(d.teams)) d.teams.forEach(t => collect(t.athletes || t.players || t.kader, t.name));
  } else {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    const sep = lines[0].includes(';') ? ';' : (lines[0].includes('\t') ? '\t' : ',');
    let head = lines[0].split(sep).map(h => h.trim().toLowerCase());
    let start = 1;
    if (!head.some(h => h.startsWith('vorname') || h.startsWith('nachname'))) { head = ['vorname', 'nachname', 'geburtsdatum', 'geschlecht', 'gruppe']; start = 0; }
    const idx = (k) => head.findIndex(h => h.startsWith(k));
    lines.slice(start).forEach(l => {
      const c = l.split(sep).map(x => x.trim());
      const first = c[idx('vorname')] || '', last = c[idx('nachname')] || '';
      if (!first && !last) return;
      const g = idx('gruppe') >= 0 ? c[idx('gruppe')] : '';
      rows.push({
        first_name: first, last_name: last,
        birthdate: idx('geburtsdatum') >= 0 ? normDate(c[idx('geburtsdatum')]) : null,
        gender: idx('geschlecht') >= 0 ? normGender(c[idx('geschlecht')]) : null,
        groups: g ? [g] : [],
      });
    });
  }
  return rows;
}

async function importAthletes(rows, athletes, groups) {
  const key = (f, l) => `${f}|${l}`.toLowerCase().replace(/\s+/g, ' ').trim();
  const existing = new Map(athletes.map(a => [key(a.first_name, a.last_name), a]));
  const groupByName = new Map(groups.map(g => [g.name.toLowerCase(), g]));
  let created = 0, updated = 0, groupsCreated = 0;

  // fehlende Gruppen anlegen
  const neededGroups = [...new Set(rows.flatMap(r => r.groups))].filter(n => !groupByName.has(n.toLowerCase()));
  if (neededGroups.length) {
    const { data, error } = await sb.from('athlete_groups').insert(neededGroups.map(name => ({ name }))).select();
    if (error) throw error;
    data.forEach(g => groupByName.set(g.name.toLowerCase(), g));
    groupsCreated = data.length;
  }

  const members = [];
  for (const r of rows) {
    const ex = existing.get(key(r.first_name, r.last_name));
    let id;
    if (ex) {
      id = ex.id;
      const patch = {};
      if (!ex.birthdate && r.birthdate) patch.birthdate = r.birthdate;
      if (!ex.gender && r.gender) patch.gender = r.gender;
      if (Object.keys(patch).length) {
        const { error } = await sb.from('athletes').update(patch).eq('id', id);
        if (error) throw error;
        updated++;
      }
    } else {
      const { data, error } = await sb.from('athletes')
        .insert({ first_name: r.first_name, last_name: r.last_name, birthdate: r.birthdate, gender: r.gender })
        .select('*').single();
      if (error) throw error;
      id = data.id; created++;
      existing.set(key(r.first_name, r.last_name), { ...data, groupIds: [] });
    }
    r.groups.forEach(n => members.push({ athlete_id: id, group_id: groupByName.get(n.toLowerCase()).id }));
  }
  if (members.length) {
    const { error } = await sb.from('athlete_group_members').upsert(members, { onConflict: 'athlete_id,group_id', ignoreDuplicates: true });
    if (error) throw error;
  }
  return { created, updated, groupsCreated };
}
