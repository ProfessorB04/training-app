// ============================================================
// Correctives / Homework (2026-11-06)
// Admin/Trainer: individuelle Hausaufgaben-Programme je Athlet:in (Prioritäten, Übungen mit Erläuterung,
//   Dosierung, Häufigkeit), Übungsbibliothek (tp_builder_store „cr_library“, Start: CR_SEED), Umsetzung, Drucken.
// Athlet:innen: Menüpunkt „Correctives“ (nur mit aktivem Programm) – Übungen ansehen und täglich abhaken.
// Tabellen: cr_programs, cr_logs (supabase_migration_correctives.sql)
// ============================================================

const CR_TYPES = ['Atmung', 'Mobilisation', 'Dehnung', 'Selbstmassage', 'Stabilität/Aktivierung', 'Bewegungsmuster'];
const CR_REGIONS = ['Atmung', 'Fuß/Sprunggelenk', 'Knie', 'Hüfte', 'Rumpf', 'Brustwirbelsäule', 'Schulter', 'Nacken', 'Handgelenk/Ellbogen', 'Ganzkörper'];
const CR_FREQ = ['täglich', '2× täglich', '5–6× pro Woche', '3–4× pro Woche', '2× pro Woche', 'vor jedem Training', 'nach dem Training', 'an trainingsfreien Tagen', 'bei Bedarf'];
const CR_DOSAGE = ['10 Atemzyklen', '2x8 pro Seite', '3x7 pro Seite', '10x pro Seite', '3x30 Sek.', '30 Sek. pro Seite', '1–2 Min. pro Seite', '2 Min. pro Seite', '2–5 Min.'];
const CR_PRIOS = ['Atmung (Zwerchfellatmung)', 'Hüftmobilität (Flexion/Innenrotation)', 'Sprunggelenksmobilität (Dorsalflexion)', 'Brustwirbelsäule (Rotation/Extension)',
  'Rumpfstabilität', 'Schulterstabilität', 'Fußstabilität', 'Beinachse/Kniestabilität', 'Hüftstreckung/Gesäßaktivierung', 'Rotationsstabilität'];
const CR_NOTE_DEFAULT = 'Nimm dir bewusst Zeit für die Übungen und nutze die Schwerpunkt-Übungen als „Pre-Workout“ vor deinem Training. Andere Übungen lassen sich zu Hause in Ruhe oder zwischendurch erledigen. Arbeite vom Zeitaufwand entsprechend der Prioritäten. Einfache Trainings-Formel: „Wenn dir etwas wichtig ist, mach es jeden Tag!“';
const CR_SRC_LABEL = { BER: 'Maik Berger', FT: 'Functional Training', FMS: 'FMS / Gray Cook', LA: 'Leichtathletik' };

const crIso = d => { const z = new Date(d); return z.getFullYear() + '-' + String(z.getMonth() + 1).padStart(2, '0') + '-' + String(z.getDate()).padStart(2, '0'); };
const crToday = () => crIso(new Date());
const crAddDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return crIso(d); };
const crDate = (iso, opt) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('de-DE', opt || { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const crUid = () => 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const crNl = s => esc(s || '').replace(/\n/g, '<br>');

// ---------- Übungsbibliothek (Cloud: tp_builder_store „cr_library“) ----------
let CR_LIB = null, CR_LIB_DEL = [];
const crKey = n => String(n || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
const crSeedOf = name => CR_SEED.find(x => crKey(x.name) === crKey(name));
// Cloud-Stand + neue Standard-Übungen (nicht gelöschte) zusammenführen; ältere Stände bekommen die
// Schritt-Anleitungen des Standards, solange sie nur einen Stichpunkt (einzeilig) hatten.
async function crLoadLib() {
  if (CR_LIB) return CR_LIB;
  const r = await sb.from('tp_builder_store').select('data').eq('key', 'cr_library').maybeSingle();
  const d = (r.data && r.data.data) || {};
  CR_LIB_DEL = Array.isArray(d.deleted) ? d.deleted : [];
  if (!Array.isArray(d.items) || !d.items.length) { CR_LIB = JSON.parse(JSON.stringify(CR_SEED)); return CR_LIB; }
  const items = d.items.slice(), oldSeed = (d.seedV || 1) < CR_SEED_V;
  items.forEach(x => {
    const sd = crSeedOf(x.name);
    if (x.expl == null) x.expl = '';
    if (sd && (!String(x.desc || '').trim() || (oldSeed && !/\n/.test(x.desc || '')))) x.desc = sd.desc;
  });
  CR_SEED.forEach(sd => { if (!items.some(x => crKey(x.name) === crKey(sd.name)) && !CR_LIB_DEL.includes(crKey(sd.name))) items.push(JSON.parse(JSON.stringify(sd))); });
  CR_LIB = items;
  return CR_LIB;
}
async function crSaveLib(items, deletedName) {
  if (deletedName) CR_LIB_DEL = [...new Set(CR_LIB_DEL.concat([crKey(deletedName)]))];
  const { data: { user } } = await sb.auth.getUser();
  const r = await sb.from('tp_builder_store').upsert({ key: 'cr_library', data: { items, deleted: CR_LIB_DEL, seedV: CR_SEED_V }, updated_at: new Date().toISOString(), updated_by: user.id });
  if (r.error) throw r.error;
  CR_LIB = items;
}
// Instruktion für eine Übung aus der Bibliothek (gleicher Name)
const crLibMatch = name => (CR_LIB || CR_SEED).find(x => crKey(x.name) === crKey(name));

// ---------- Staff: Übersicht ----------
async function renderCrHub(profile) {
  const T = 'Correctives';
  const back = { label: 'Trainingsplanung', go: () => renderTpHub(profile) };
  renderShell(profile, 'trainingsplan', T, `<p class="muted">Lade&hellip;</p>`, back);
  const since = crAddDays(crToday(), -27);
  const [pRes, prRes, lRes] = await Promise.all([
    sb.from('cr_programs').select('*').order('created_at', { ascending: false }),
    sb.from('profiles').select('id, name, role'),
    sb.from('cr_logs').select('program_id, entry_date, done').gte('entry_date', since),
  ]);
  if (pRes.error) {
    renderShell(profile, 'trainingsplan', T, `<div class="card"><p class="error">Fehler: ${esc(pRes.error.message)}${/cr_programs|relation|schema cache/.test(pRes.error.message) ? '<br>Die Datenbank-Tabellen fehlen noch: <code>bash deploy_supabase.sh supabase_migration_correctives.sql</code>' : ''}</p></div>`, back);
    return;
  }
  const names = Object.fromEntries((prRes.data || []).map(p => [p.id, p.name || 'Unbekannt']));
  const logs = lRes.data || [];
  const today = crToday();
  const progs = (pRes.data || []).map(p => {
    const items = (p.content && p.content.items) || [];
    const d7 = new Set(logs.filter(l => l.program_id === p.id && l.entry_date > crAddDays(today, -7) && (l.done || []).length).map(l => l.entry_date)).size;
    const last = logs.filter(l => l.program_id === p.id && (l.done || []).length).map(l => l.entry_date).sort().pop();
    const ended = !p.active || (p.end_date && p.end_date < today);
    return { p, items, d7, last, ended, name: names[p.user_id] || 'Unbekannt' };
  });
  const card = x => `<div class="card cr-card${x.ended ? ' cr-ended' : ''}">
      <div class="tpo-head">
        <div><div class="tpo-title">${esc(x.name)}</div>
          <div class="muted-inline">${esc(x.p.title || 'Homework')} &middot; ${x.items.length} &Uuml;bung${x.items.length === 1 ? '' : 'en'}${x.p.start_date ? ' &middot; ab ' + crDate(x.p.start_date) : ''}${x.p.end_date ? ' bis ' + crDate(x.p.end_date) : ''}</div></div>
        <span class="tpo-week" title="Tage mit mindestens einer abgehakten &Uuml;bung">${x.ended ? 'beendet' : `${x.d7}/7 Tage aktiv`}</span>
      </div>
      ${((x.p.content || {}).priorities || []).filter(Boolean).length ? `<div class="cr-prios">${x.p.content.priorities.filter(Boolean).map((t, i) => `<span class="chip">${i + 1}. ${esc(t)}</span>`).join(' ')}</div>` : ''}
      <div class="muted-inline" style="margin:6px 0 10px;">${x.last ? 'zuletzt abgehakt: ' + crDate(x.last, { weekday: 'short', day: '2-digit', month: '2-digit' }) : 'noch nichts abgehakt'}</div>
      <div class="cr-actions">
        <button type="button" class="small-btn" data-edit="${x.p.id}">&#9998; Bearbeiten</button>
        <button type="button" class="secondary small-btn" data-stat="${x.p.id}">&#128202; Umsetzung</button>
        <button type="button" class="secondary small-btn" data-print="${x.p.id}">&#128424;&#65039; Drucken</button>
        <button type="button" class="secondary small-btn" data-dup="${x.p.id}" title="Als Vorlage f&uuml;r eine andere Person &ouml;ffnen">&#10697; Kopieren</button>
        ${x.ended ? `<button type="button" class="secondary small-btn" data-react="${x.p.id}">&#9654;&#65039; Wieder aktivieren</button>` : `<button type="button" class="secondary small-btn" data-end="${x.p.id}">&#9209; Beenden</button>`}
        <button type="button" class="danger small-btn" data-del="${x.p.id}">&#128465;</button>
      </div></div>`;
  const act = progs.filter(x => !x.ended), old = progs.filter(x => x.ended);
  const content = `
    <div class="cr-top">
      <button type="button" id="crNew">&#10133; Neues Homework-Programm</button>
      <button type="button" class="secondary" id="crLib">&#128218; &Uuml;bungsbibliothek</button>
    </div>
    <p class="hint" style="margin:0 0 14px;">Individuelle Hausaufgaben (Correctives) zus&auml;tzlich zum Trainingsplan: Schwerpunkte, &Uuml;bungen mit Erl&auml;uterung, Anzahl/Dauer und H&auml;ufigkeit. Die Athlet:in sieht das Programm in der App unter &bdquo;Correctives&ldquo; und hakt die &Uuml;bungen ab.</p>
    ${act.length ? act.map(card).join('') : '<div class="card"><p class="muted">Noch keine laufenden Programme.</p></div>'}
    ${old.length ? `<details class="cr-old"><summary>Beendete Programme (${old.length})</summary>${old.map(card).join('')}</details>` : ''}`;
  renderShell(profile, 'trainingsplan', T, content, back);
  const byId = id => progs.find(x => x.p.id === id).p;
  document.getElementById('crNew').onclick = () => renderCrEditor(profile, null);
  document.getElementById('crLib').onclick = () => renderCrLibrary(profile);
  appEl.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => renderCrEditor(profile, byId(b.dataset.edit)));
  appEl.querySelectorAll('[data-stat]').forEach(b => b.onclick = () => renderCrStats(profile, byId(b.dataset.stat), names));
  appEl.querySelectorAll('[data-print]').forEach(b => b.onclick = () => crPrint(byId(b.dataset.print), names[byId(b.dataset.print).user_id]));
  appEl.querySelectorAll('[data-dup]').forEach(b => b.onclick = () => {
    const p = JSON.parse(JSON.stringify(byId(b.dataset.dup)));
    delete p.id; p.user_id = ''; p.start_date = today; p.end_date = null; p.active = true;
    renderCrEditor(profile, p);
  });
  const setActive = async (id, active, msg) => {
    const r = await sb.from('cr_programs').update({ active, updated_at: new Date().toISOString() }).eq('id', id);
    if (r.error) { toast('Fehler: ' + r.error.message); return; }
    toast(msg); renderCrHub(profile);
  };
  appEl.querySelectorAll('[data-end]').forEach(b => b.onclick = () => { if (confirm('Programm beenden? Die Athlet:in sieht es dann nicht mehr. Abgehaktes bleibt erhalten.')) setActive(b.dataset.end, false, 'Programm beendet.'); });
  appEl.querySelectorAll('[data-react]').forEach(b => b.onclick = () => setActive(b.dataset.react, true, 'Programm wieder aktiv.'));
  appEl.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const p = byId(b.dataset.del);
    if (!confirm('Programm von ' + (names[p.user_id] || '?') + ' inkl. aller Abhak-Einträge endgültig löschen?\n\nTipp: „Beenden“ blendet es nur aus.')) return;
    const r = await sb.from('cr_programs').delete().eq('id', p.id);
    if (r.error) { toast('Fehler: ' + r.error.message); return; }
    toast('Programm gelöscht.'); renderCrHub(profile);
  });
}

// ---------- Staff: Programm anlegen / bearbeiten ----------
async function renderCrEditor(profile, prog) {
  const isNew = !prog || !prog.id;
  const T = isNew ? 'Neues Homework-Programm' : 'Homework bearbeiten';
  let dirty = false;
  const back = { label: 'Correctives', go: () => { if (!dirty || confirm('Ungespeicherte Änderungen verwerfen?')) renderCrHub(profile); } };
  renderShell(profile, 'trainingsplan', T, `<p class="muted">Lade&hellip;</p>`, back);
  const [prRes] = await Promise.all([sb.from('profiles').select('id, name, role').eq('role', 'athlete').order('name'), crLoadLib()]);
  const people = prRes.data || [];
  const P = prog ? JSON.parse(JSON.stringify(prog)) : { user_id: '', title: 'Homework & Corrective Exercises', start_date: crToday(), end_date: null, active: true, content: {} };
  const C = P.content = Object.assign({ priorities: ['', '', ''], note: CR_NOTE_DEFAULT, tips: '', items: [] }, P.content || {});
  while (C.priorities.length < 3) C.priorities.push('');
  C.items.forEach(it => { const m = crLibMatch(it.name); if (m && !String(it.desc || '').trim()) it.desc = m.desc; if (m && !it.region) it.region = m.region; if (it.expl == null) it.expl = ''; });

  const dl = (id, list) => `<datalist id="${id}">${list.map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;
  const itemHtml = (it, i) => `
    <div class="cr-item" data-i="${i}">
      <div class="cr-item-head">
        <span class="cr-num">${i + 1}</span>
        <input class="cr-name" data-f="name" list="crDl_lib" value="${esc(it.name)}" placeholder="&Uuml;bung (Name aus der Bibliothek f&uuml;llt die Instruktion)">
        ${it.region ? `<span class="chip">${esc(it.region)}</span>` : ''}
        <span class="cr-mv">
          <button type="button" class="secondary small-btn" data-mv="-1" title="nach oben">&uarr;</button>
          <button type="button" class="secondary small-btn" data-mv="1" title="nach unten">&darr;</button>
          <button type="button" class="secondary small-btn" data-star title="In die &Uuml;bungsbibliothek &uuml;bernehmen">&#9734;</button>
          <button type="button" class="danger small-btn" data-rm title="entfernen">&#10005;</button>
        </span>
      </div>
      <div class="cr-item-grid">
        <label class="cr-expl">Erl&auml;uterung <span class="cr-sub">(individuell: warum diese &Uuml;bung, worauf achten)</span><textarea data-f="expl" rows="2" placeholder="z. B. Verbessert deine Dorsalflexion links &ndash; wichtig f&uuml;r tiefe Landungen. Ferse nicht abheben!">${esc(it.expl || '')}</textarea></label>
        <label>Anzahl / Dauer<input data-f="dosage" list="crDl_dos" value="${esc(it.dosage)}" placeholder="z. B. 3x7 pro Seite"></label>
        <label>Wie oft?<input data-f="freq" list="crDl_freq" value="${esc(it.freq)}" placeholder="z. B. t&auml;glich"></label>
        <label class="cr-full">Instruktion / Ablauf<textarea data-f="desc" rows="3" placeholder="1. Ausgangsposition &#10;2. Ausf&uuml;hrung &#10;3. worauf achten">${esc(it.desc)}</textarea></label>
      </div>
    </div>`;
  const draw = () => {
    const html = `
      <div class="card">
        <div class="cr-form">
          <label>Athlet:in<select id="crWho"><option value="">&ndash; bitte w&auml;hlen &ndash;</option>${people.map(u => `<option value="${u.id}"${u.id === P.user_id ? ' selected' : ''}>${esc(u.name || '?')}</option>`).join('')}</select></label>
          <label>Titel<input id="crTitle" value="${esc(P.title)}"></label>
          <label>ab<input type="date" id="crStart" value="${esc(P.start_date || '')}"></label>
          <label>bis (optional)<input type="date" id="crEnd" value="${esc(P.end_date || '')}"></label>
        </div>
        <h2 style="margin-top:16px;">Ziele &amp; Schwerpunkte</h2>
        <div class="cr-form cr-prioform">
          ${C.priorities.map((t, i) => `<label>Priorit&auml;t ${i + 1}<input data-prio="${i}" list="crDl_prio" value="${esc(t)}" placeholder="z. B. ${esc(CR_PRIOS[i])}"></label>`).join('')}
        </div>
        <div class="cr-form cr-two">
          <label>Hinweis f&uuml;r die Athlet:in<textarea id="crNote" rows="3">${esc(C.note)}</textarea></label>
          <label>Zus&auml;tzliche Empfehlungen (optional)<textarea id="crTips" rows="3" placeholder="z. B. Schlafroutine, Reduzieren: maximale Sprungbelastungen bis zur Verbesserung &hellip;">${esc(C.tips)}</textarea></label>
        </div>
      </div>
      <div class="card">
        <div class="tpo-head"><h2 style="margin:0;">&Uuml;bungen (${C.items.length})</h2>
          <div class="cr-actions"><button type="button" id="crAddLib">&#10133; Aus Bibliothek</button><button type="button" class="secondary" id="crAddOwn">+ Eigene &Uuml;bung</button></div></div>
        ${C.items.length ? C.items.map(itemHtml).join('') : '<p class="muted">Noch keine &Uuml;bungen &ndash; &bdquo;Aus Bibliothek&ldquo; w&auml;hlen.</p>'}
        <div class="cr-form cr-two" style="margin-top:10px;"><label>H&auml;ufigkeit f&uuml;r alle setzen<span style="display:flex;gap:6px;"><input id="crFreqAll" list="crDl_freq" placeholder="z. B. t&auml;glich"><button type="button" class="secondary small-btn" id="crFreqAllBtn">&uuml;bernehmen</button></span></label></div>
      </div>
      <div class="cr-savebar">
        <button type="button" class="secondary" id="crCancel">Abbrechen</button>
        <button type="button" class="secondary" id="crPrintBtn">&#128424;&#65039; Drucken / PDF</button>
        <button type="button" id="crSave">&#128190; Speichern${isNew ? ' &amp; in App freigeben' : ''}</button>
      </div>
      ${dl('crDl_freq', CR_FREQ)}${dl('crDl_dos', CR_DOSAGE)}${dl('crDl_prio', CR_PRIOS)}${dl('crDl_lib', (CR_LIB || []).map(x => x.name).sort((a, b) => a.localeCompare(b, 'de')))}`;
    renderShell(profile, 'trainingsplan', T, html, back);
    wire();
  };
  const readForm = () => {
    P.user_id = document.getElementById('crWho').value;
    P.title = document.getElementById('crTitle').value.trim();
    P.start_date = document.getElementById('crStart').value || null;
    P.end_date = document.getElementById('crEnd').value || null;
    C.note = document.getElementById('crNote').value;
    C.tips = document.getElementById('crTips').value;
    appEl.querySelectorAll('[data-prio]').forEach(inp => { C.priorities[+inp.dataset.prio] = inp.value.trim(); });
  };
  const wire = () => {
    appEl.querySelectorAll('.cr-form input, .cr-form select, .cr-form textarea').forEach(el => el.addEventListener('input', () => { dirty = true; }));
    appEl.querySelectorAll('.cr-item').forEach(row => {
      const it = C.items[+row.dataset.i];
      row.querySelectorAll('[data-f]').forEach(inp => inp.addEventListener('input', () => { it[inp.dataset.f] = inp.value; dirty = true; }));
      row.querySelector('.cr-name').addEventListener('change', () => {
        const m = crLibMatch(it.name);
        if (!m || (String(it.desc || '').trim() && String(it.dosage || '').trim())) return;
        readForm();
        if (!String(it.desc || '').trim()) it.desc = m.desc;
        if (!String(it.dosage || '').trim()) it.dosage = m.dosage;
        if (!String(it.expl || '').trim()) it.expl = m.expl || '';
        it.region = it.region || m.region; it.type = m.type; it.src = m.src;
        draw(); toast('Instruktion aus der Bibliothek übernommen.');
      });
      row.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => {
        const i = +row.dataset.i, j = i + (+b.dataset.mv);
        if (j < 0 || j >= C.items.length) return;
        readForm(); [C.items[i], C.items[j]] = [C.items[j], C.items[i]]; dirty = true; draw();
      });
      row.querySelector('[data-rm]').onclick = () => { readForm(); C.items.splice(+row.dataset.i, 1); dirty = true; draw(); };
      row.querySelector('[data-star]').onclick = async () => {
        const lib = await crLoadLib();
        const ex = lib.find(x => x.name.trim().toLowerCase() === (it.name || '').trim().toLowerCase());
        const entry = { id: ex ? ex.id : crUid(), name: it.name, type: it.type || (ex && ex.type) || 'Mobilisation', region: it.region || (ex && ex.region) || 'Ganzkörper', desc: it.desc, expl: it.expl || '', dosage: it.dosage, src: (ex && ex.src) || 'BER' };
        if (ex && !confirm('„' + it.name + '“ steht schon in der Bibliothek. Mit Instruktion, Erläuterung und Dosierung von hier überschreiben?')) return;
        try { await crSaveLib(ex ? lib.map(x => x === ex ? entry : x) : lib.concat([entry])); toast(ex ? 'Bibliothek aktualisiert.' : 'In die Bibliothek übernommen.'); }
        catch (e) { toast('Fehler: ' + e.message); }
      };
    });
    document.getElementById('crAddLib').onclick = () => { readForm(); crPickFromLib(list => { list.forEach(ex => C.items.push({ id: crUid(), name: ex.name, type: ex.type, region: ex.region, desc: ex.desc, expl: ex.expl || '', dosage: ex.dosage, freq: 'täglich', src: ex.src })); dirty = true; draw(); }); };
    document.getElementById('crAddOwn').onclick = () => { readForm(); C.items.push({ id: crUid(), name: '', type: 'Mobilisation', region: '', desc: '', expl: '', dosage: '', freq: 'täglich', src: 'BER' }); dirty = true; draw(); };
    document.getElementById('crFreqAllBtn').onclick = () => { const v = document.getElementById('crFreqAll').value.trim(); if (!v) return; readForm(); C.items.forEach(it => { it.freq = v; }); dirty = true; draw(); };
    document.getElementById('crCancel').onclick = back.go;
    document.getElementById('crPrintBtn').onclick = () => { readForm(); crPrint(P, (people.find(u => u.id === P.user_id) || {}).name || ''); };
    document.getElementById('crSave').onclick = async () => {
      readForm();
      if (!P.user_id) { alert('Bitte eine Athlet:in wählen.'); return; }
      C.items = C.items.filter(it => (it.name || '').trim());
      if (!C.items.length) { alert('Bitte mindestens eine Übung hinzufügen.'); return; }
      const btn = document.getElementById('crSave'); btn.disabled = true;
      const row = { user_id: P.user_id, title: P.title || 'Homework', content: C, start_date: P.start_date, end_date: P.end_date, active: P.active !== false, updated_at: new Date().toISOString() };
      let r;
      if (isNew) { const { data: { user } } = await sb.auth.getUser(); r = await sb.from('cr_programs').insert(Object.assign(row, { created_by: user.id })); }
      else r = await sb.from('cr_programs').update(row).eq('id', P.id);
      if (r.error) { btn.disabled = false; alert('Speichern fehlgeschlagen: ' + r.error.message); return; }
      dirty = false;
      toast(isNew ? 'Programm gespeichert – ' + ((people.find(u => u.id === P.user_id) || {}).name || 'die Athlet:in') + ' sieht es unter „Correctives“.' : 'Gespeichert.');
      renderCrHub(profile);
    };
  };
  draw();
}

// Auswahl-Dialog: Übungen aus der Bibliothek (Mehrfachauswahl, Suche, Filter)
async function crPickFromLib(onPick) {
  const lib = await crLoadLib();
  const picked = new Set();
  const host = document.createElement('div');
  host.className = 'modal-scrim';
  host.innerHTML = `<div class="modal cr-pick" style="max-width:820px;">
    <h2>&Uuml;bungen aus der Bibliothek</h2>
    <div class="cr-filter">
      <input type="search" id="crQ" placeholder="Suchen (Name, Erl&auml;uterung) &hellip;">
      <select id="crFT"><option value="">alle Typen</option>${CR_TYPES.map(t => `<option>${esc(t)}</option>`).join('')}</select>
      <select id="crFR"><option value="">alle Regionen</option>${CR_REGIONS.map(t => `<option>${esc(t)}</option>`).join('')}</select>
    </div>
    <div id="crList" class="cr-list"></div>
    <div class="cr-savebar"><span id="crCnt" class="muted-inline" style="flex:1;"></span>
      <button type="button" class="secondary" id="crX">Abbrechen</button><button type="button" id="crOk">&Uuml;bernehmen</button></div></div>`;
  document.body.appendChild(host);
  const q = s => host.querySelector(s);
  const close = () => host.remove();
  host.addEventListener('click', e => { if (e.target === host) close(); });
  const list = () => {
    const t = q('#crQ').value.trim().toLowerCase(), ft = q('#crFT').value, fr = q('#crFR').value;
    const rows = lib.filter(x => (!ft || x.type === ft) && (!fr || x.region === fr) && (!t || (x.name + ' ' + x.desc).toLowerCase().includes(t)))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    q('#crList').innerHTML = rows.map(x => `<label class="cr-li"><input type="checkbox" data-id="${esc(x.id)}"${picked.has(x.id) ? ' checked' : ''}>
      <span><b>${esc(x.name)}</b> <span class="chip">${esc(x.type)}</span> <span class="chip">${esc(x.region)}</span> <span class="muted-inline">${esc(x.dosage || '')}</span>
      ${x.expl ? `<span class="cr-li-expl">${esc(x.expl)}</span>` : ''}${x.desc ? `<span class="cr-li-desc">${esc(x.desc).replace(/\n/g, ' · ')}</span>` : ''}</span></label>`).join('') || '<p class="muted">Keine Treffer.</p>';
    q('#crList').querySelectorAll('input').forEach(cb => cb.onchange = () => { cb.checked ? picked.add(cb.dataset.id) : picked.delete(cb.dataset.id); cnt(); });
    cnt();
  };
  const cnt = () => { q('#crCnt').textContent = picked.size + ' ausgewählt'; };
  ['#crQ', '#crFT', '#crFR'].forEach(s => q(s).addEventListener('input', list));
  q('#crX').onclick = close;
  q('#crOk').onclick = () => { const arr = lib.filter(x => picked.has(x.id)); close(); if (arr.length) onPick(arr); };
  list(); q('#crQ').focus();
}

// ---------- Staff: Übungsbibliothek bearbeiten ----------
async function renderCrLibrary(profile) {
  const T = 'Correctives – Übungsbibliothek';
  const back = { label: 'Correctives', go: () => renderCrHub(profile) };
  renderShell(profile, 'trainingsplan', T, `<p class="muted">Lade&hellip;</p>`, back);
  let lib = JSON.parse(JSON.stringify(await crLoadLib()));
  let fT = '', fR = '', fQ = '';
  const draw = () => {
    const rows = lib.filter(x => (!fT || x.type === fT) && (!fR || x.region === fR) && (!fQ || (x.name + ' ' + x.desc + ' ' + x.src).toLowerCase().includes(fQ)))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    const html = `
      <div class="cr-top">
        <button type="button" id="crLNew">+ Neue &Uuml;bung</button>
        <button type="button" class="secondary" id="crLReset" title="Standard-Bibliothek erg&auml;nzen bzw. wiederherstellen">&#8634; Standard</button>
      </div>
      <div class="card">
        <div class="cr-filter">
          <input type="search" id="crLQ" placeholder="Suchen &hellip;" value="${esc(fQ)}">
          <select id="crLT"><option value="">alle Typen</option>${CR_TYPES.map(t => `<option${t === fT ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>
          <select id="crLR"><option value="">alle Regionen</option>${CR_REGIONS.map(t => `<option${t === fR ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>
          <span class="muted-inline">${rows.length} von ${lib.length}</span>
        </div>
        <div class="tablewrap"><table class="cr-table"><thead><tr><th>&Uuml;bung</th><th>Typ</th><th>Region</th><th>Anzahl/Dauer</th><th>Quelle</th><th></th></tr></thead><tbody>
        ${rows.map(x => `<tr><td><b>${esc(x.name)}</b>${x.expl ? `<div class="cr-li-expl">${esc(x.expl)}</div>` : ''}${x.desc ? `<div class="cr-li-desc">${esc(x.desc).replace(/\n/g, ' · ')}</div>` : ''}</td><td>${esc(x.type)}</td><td>${esc(x.region)}</td><td>${esc(x.dosage)}</td>
          <td title="${esc(CR_SRC_LABEL[x.src] || x.src || '')}">${esc(x.src || '')}</td>
          <td style="white-space:nowrap;"><button type="button" class="secondary small-btn" data-ed="${esc(x.id)}">&#9998;</button> <button type="button" class="danger small-btn" data-dl="${esc(x.id)}">&#128465;</button></td></tr>`).join('')}
        </tbody></table></div>
        <p class="hint">Quellen: BER = Maik Berger (Homework-Bl&auml;tter), FT = Functional Training, FMS = Functional Movement Screen / Gray Cook, Starrett S. xxx = Kelly Starrett „Werde ein geschmeidiger Leopard“ (Seite der dt. Ausgabe), Starrett = Starrett-Mobilisation ohne Seitenangabe, Triggerball/Foam Roller = Selbstmassage mit Lacrosse-/Tennisball bzw. Rolle, sonst Autor bzw. System als Orientierung (Cook, Boyle, McGill, Dan John, Cressey, DNS, Janda).</p>
      </div>`;
    renderShell(profile, 'trainingsplan', T, html, back);
    const q = document.getElementById('crLQ');
    q.oninput = () => { fQ = q.value.trim().toLowerCase(); const pos = q.selectionStart; draw(); const n = document.getElementById('crLQ'); n.focus(); n.setSelectionRange(pos, pos); };
    document.getElementById('crLT').onchange = e => { fT = e.target.value; draw(); };
    document.getElementById('crLR').onchange = e => { fR = e.target.value; draw(); };
    document.getElementById('crLNew').onclick = () => edit(null);
    document.getElementById('crLReset').onclick = async () => {
      const miss = CR_SEED.filter(s => !lib.some(x => x.name.trim().toLowerCase() === s.name.trim().toLowerCase()));
      const choice = prompt('Standard-Bibliothek:\n1 = fehlende Standard-Übungen ergänzen (' + miss.length + ')\n2 = komplett auf Standard zurücksetzen (eigene Übungen/Änderungen gehen verloren)', '1');
      if (choice !== '1' && choice !== '2') return;
      if (choice === '2') CR_LIB_DEL = [];
      lib = choice === '2' ? JSON.parse(JSON.stringify(CR_SEED)) : lib.concat(JSON.parse(JSON.stringify(miss)));
      await save('Bibliothek aktualisiert.');
    };
    appEl.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => edit(lib.find(x => x.id === b.dataset.ed)));
    appEl.querySelectorAll('[data-dl]').forEach(b => b.onclick = async () => {
      const x = lib.find(y => y.id === b.dataset.dl);
      if (!confirm('„' + x.name + '“ aus der Bibliothek löschen? (Bestehende Programme behalten ihre Kopie.)')) return;
      lib = lib.filter(y => y !== x); await save('Gelöscht.', x.name);
    });
  };
  const save = async (msg, deletedName) => { try { await crSaveLib(lib, deletedName); toast(msg); } catch (e) { toast('Fehler: ' + e.message); } draw(); };
  const edit = ex => {
    const x = ex ? Object.assign({ expl: '' }, ex) : { id: crUid(), name: '', type: 'Mobilisation', region: 'Hüfte', desc: '', expl: '', dosage: '', src: 'BER' };
    const host = document.createElement('div');
    host.className = 'modal-scrim';
    host.innerHTML = `<div class="modal"><h2>${ex ? '&Uuml;bung bearbeiten' : 'Neue &Uuml;bung'}</h2>
      <div class="modal-form">
        <label style="grid-column:1/-1;">Name (Englisch)<input id="eN" value="${esc(x.name)}"></label>
        <label>Typ<select id="eT">${CR_TYPES.map(t => `<option${t === x.type ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        <label>Region<select id="eR">${CR_REGIONS.map(t => `<option${t === x.region ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        <label style="grid-column:1/-1;">Instruktion / Ablauf<textarea id="eD" rows="5" class="cr-ta">${esc(x.desc)}</textarea></label>
        <label style="grid-column:1/-1;">Erl&auml;uterung (Standard, z. B. Ziel / worauf achten &ndash; im Programm individuell &auml;nderbar)<textarea id="eE" rows="2" class="cr-ta">${esc(x.expl)}</textarea></label>
        <label>Anzahl / Dauer (Standard)<input id="eS" value="${esc(x.dosage)}"></label>
        <label>Quelle<input id="eQ" value="${esc(x.src)}" placeholder="z. B. BER, Cook/FMS, Boyle"></label>
      </div>
      <div class="cr-savebar"><button type="button" class="secondary" id="eX">Abbrechen</button><button type="button" id="eOk">Speichern</button></div></div>`;
    document.body.appendChild(host);
    const q = s => host.querySelector(s);
    q('#eX').onclick = () => host.remove();
    q('#eOk').onclick = async () => {
      x.name = q('#eN').value.trim(); if (!x.name) { alert('Bitte einen Namen eingeben.'); return; }
      x.type = q('#eT').value; x.region = q('#eR').value; x.desc = q('#eD').value; x.expl = q('#eE').value; x.dosage = q('#eS').value.trim(); x.src = q('#eQ').value.trim();
      lib = ex ? lib.map(y => y.id === ex.id ? x : y) : lib.concat([x]);
      host.remove(); await save('Gespeichert.');
    };
  };
  draw();
}

// ---------- Staff: Umsetzung (letzte 4 Wochen) ----------
async function renderCrStats(profile, prog, names) {
  const back = { label: 'Correctives', go: () => renderCrHub(profile) };
  const T = 'Umsetzung – ' + (names[prog.user_id] || '');
  renderShell(profile, 'trainingsplan', T, `<p class="muted">Lade&hellip;</p>`, back);
  const today = crToday(), from = crAddDays(today, -27);
  const r = await sb.from('cr_logs').select('entry_date, done, note').eq('program_id', prog.id).gte('entry_date', from);
  const byDay = Object.fromEntries((r.data || []).map(l => [l.entry_date, l]));
  const days = Array.from({ length: 28 }, (_, i) => crAddDays(from, i));
  const items = (prog.content && prog.content.items) || [];
  const head = days.map(d => `<th class="${new Date(d + 'T00:00:00').getDay() === 1 ? 'cr-mon' : ''}" title="${crDate(d, { weekday: 'long', day: '2-digit', month: '2-digit' })}">${new Date(d + 'T00:00:00').getDate()}</th>`).join('');
  const rows = items.map(it => {
    let n = 0;
    const cells = days.map(d => { const ok = byDay[d] && (byDay[d].done || []).includes(it.id); if (ok) n++; return `<td class="${ok ? 'cr-ok' : ''}${new Date(d + 'T00:00:00').getDay() === 1 ? ' cr-mon' : ''}">${ok ? '&#10003;' : ''}</td>`; }).join('');
    return `<tr><td class="cr-st-name"><b>${esc(it.name)}</b><div class="muted-inline">${esc(it.freq || '')}</div></td>${cells}<td><b>${n}</b></td></tr>`;
  }).join('');
  const notes = (r.data || []).filter(l => l.note).sort((a, b) => b.entry_date.localeCompare(a.entry_date));
  const activeDays = days.filter(d => byDay[d] && (byDay[d].done || []).length).length;
  renderShell(profile, 'trainingsplan', T, `
    <div class="card"><div class="tpo-head"><div><div class="tpo-title">${esc(prog.title || 'Homework')}</div>
      <div class="muted-inline">letzte 4 Wochen (${crDate(from)} &ndash; ${crDate(today)}) &middot; ${activeDays} von 28 Tagen mit Eintr&auml;gen</div></div></div>
      <div class="tablewrap"><table class="cr-stat"><thead><tr><th></th>${head}<th>&Sigma;</th></tr></thead><tbody>${rows}</tbody></table></div></div>
    ${notes.length ? `<div class="card"><h2>Notizen der Athlet:in</h2>${notes.map(l => `<p><b>${crDate(l.entry_date, { weekday: 'short', day: '2-digit', month: '2-digit' })}:</b> ${esc(l.note)}</p>`).join('')}</div>` : ''}`, back);
}

// ---------- Drucken (Layout wie die Homework-Excel-Blätter) ----------
function crPrint(prog, name) {
  const C = prog.content || {};
  const prios = (C.priorities || []).filter(Boolean);
  const logo = new URL('logo-balance-movement.png', location.href).href;
  const w = window.open('', '_blank');
  if (!w) { alert('Bitte Pop-ups für diese Seite erlauben, um zu drucken.'); return; }
  w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(prog.title || 'Homework')} – ${esc(name || '')}</title>
  <style>
    body{font-family:-apple-system,"Segoe UI",Roboto,sans-serif;color:#141824;margin:24px;font-size:12.5px;}
    .hd{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #a1d7ff;padding-bottom:10px;margin-bottom:12px;}
    .hd img{height:54px;} h1{font-size:20px;margin:0;color:#00113d;}
    .meta{display:flex;gap:24px;margin:8px 0 12px;font-size:13px;} .meta b{color:#00113d;}
    .prio{background:#eef7ff;border-radius:8px;padding:8px 12px;margin-bottom:12px;} .prio div{margin:2px 0;}
    table{width:100%;border-collapse:collapse;} th{background:#00113d;color:#fff;text-align:left;padding:6px 8px;font-size:12px;}
    td{border-bottom:1px solid #d9dee8;padding:7px 8px;vertical-align:top;} td.n{font-weight:700;width:22%;} td.r{width:13%;color:#3f4556;} td.d{width:16%;} td.f{width:13%;}
    tr{page-break-inside:avoid;} .note{margin-top:14px;padding:10px 12px;border:1px solid #d9dee8;border-radius:8px;}
    @media print{body{margin:10mm;} @page{size:A4 landscape;}}
  </style></head><body>
  <div class="hd"><h1>${esc(prog.title || 'Homework & Corrective Exercises')}</h1><img src="${logo}" alt="Balance Movement"></div>
  <div class="meta"><span>Name: <b>${esc(name || '')}</b></span><span>Datum: <b>ab ${crDate(prog.start_date) || '–'}${prog.end_date ? ' bis ' + crDate(prog.end_date) : ''}</b></span></div>
  ${prios.length ? `<div class="prio"><b>Ziele &amp; Schwerpunkte zur Verbesserung dysfunktionaler Bewegungen:</b>${prios.map((t, i) => `<div>Priorit&auml;t ${i + 1}: ${esc(t)}</div>`).join('')}</div>` : ''}
  <table><thead><tr><th>Exercise</th><th>K&ouml;rperregion</th><th>Bemerkung</th><th>Dauer/Anzahl</th><th>Wie oft?</th></tr></thead><tbody>
  ${(C.items || []).map(it => `<tr><td class="n">${esc(it.name)}</td><td class="r">${esc(it.region || '')}</td><td>${it.expl ? `<b>${crNl(it.expl)}</b>${it.desc ? '<br>' : ''}` : ''}${crNl(it.desc)}</td><td class="d">${esc(it.dosage || '')}</td><td class="f">${esc(it.freq || '')}</td></tr>`).join('')}
  </tbody></table>
  ${C.note ? `<div class="note">${crNl(C.note)}</div>` : ''}
  ${C.tips ? `<div class="note"><b>Zus&auml;tzliche Empfehlungen:</b><br>${crNl(C.tips)}</div>` : ''}
  <script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script></body></html>`);
  w.document.close();
}

// ---------- Athlet:innen: „Correctives“ ----------
async function crHasProgram(profile) {
  try {
    const r = await sb.from('cr_programs').select('id, start_date, end_date').eq('user_id', profile.id).eq('active', true);
    const t = crToday();
    return (r.data || []).some(p => !p.end_date || p.end_date >= t);
  } catch (e) { return false; }
}

let CR_DAY = null;
async function renderMyCorrectives(profile) {
  const T = 'Correctives';
  renderShell(profile, 'correctives', T, `<p class="muted">Lade&hellip;</p>`);
  const today = crToday();
  if (!CR_DAY || CR_DAY > today) CR_DAY = today;
  const r = await sb.from('cr_programs').select('*').eq('user_id', profile.id).eq('active', true).order('created_at', { ascending: false });
  const progs = (r.data || []).filter(p => !p.end_date || p.end_date >= today);
  if (!progs.length) { renderShell(profile, 'correctives', T, `<div class="card"><h2>Aktuell keine Hausaufgaben</h2><p class="muted">Sobald dein Coach dir Correctives zusammenstellt, erscheinen sie hier.</p></div>`); return; }
  const weekStart = crAddDays(CR_DAY, -((new Date(CR_DAY + 'T00:00:00').getDay() + 6) % 7));
  const l = await sb.from('cr_logs').select('*').eq('user_id', profile.id).in('program_id', progs.map(p => p.id)).gte('entry_date', weekStart).lte('entry_date', crAddDays(weekStart, 6));
  const logs = l.data || [];
  const logOf = (pid, d) => logs.find(x => x.program_id === pid && x.entry_date === d);
  const dayLbl = CR_DAY === today ? 'Heute' : (CR_DAY === crAddDays(today, -1) ? 'Gestern' : crDate(CR_DAY, { weekday: 'long', day: '2-digit', month: '2-digit' }));
  const cards = progs.map(p => {
    const C = p.content || {}, items = C.items || [];
    const lg = logOf(p.id, CR_DAY), done = new Set((lg && lg.done) || []);
    const week = Array.from({ length: 7 }, (_, i) => crAddDays(weekStart, i)).map(d => {
      const x = logOf(p.id, d), n = x ? (x.done || []).length : 0;
      const cls = d > today ? 'fut' : (n >= items.length && n ? 'full' : (n ? 'part' : ''));
      return `<button type="button" class="cr-wd ${cls}${d === CR_DAY ? ' sel' : ''}" data-day="${d}"${d > today ? ' disabled' : ''}><span>${new Date(d + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short' })}</span><b>${n ? n : ''}</b></button>`;
    }).join('');
    return `<div class="card">
      <div class="tpo-head"><div><div class="tpo-title">${esc(p.title || 'Homework')}</div>
        <div class="muted-inline">${p.start_date ? 'ab ' + crDate(p.start_date) : ''}${p.end_date ? ' bis ' + crDate(p.end_date) : ''}</div></div>
        <span class="tpo-week">${done.size}/${items.length} erledigt</span></div>
      ${(C.priorities || []).filter(Boolean).length ? `<div class="cr-prios"><b>Deine Schwerpunkte:</b> ${C.priorities.filter(Boolean).map((t, i) => `<span class="chip">${i + 1}. ${esc(t)}</span>`).join(' ')}</div>` : ''}
      <div class="cr-week">${week}</div>
      <div class="cr-daylbl">${esc(dayLbl)}: abhaken, was du gemacht hast</div>
      ${items.map(it => `<div class="cr-ath${done.has(it.id) ? ' done' : ''}">
        <button type="button" class="cr-check" data-p="${p.id}" data-it="${esc(it.id)}" aria-pressed="${done.has(it.id)}">${done.has(it.id) ? '&#10003;' : ''}</button>
        <div class="cr-ath-body"><div class="cr-ath-name">${esc(it.name)}</div>
          <div class="cr-ath-meta">${it.dosage ? `<span class="chip">${esc(it.dosage)}</span>` : ''}${it.freq ? ` <span class="chip cr-freq">${esc(it.freq)}</span>` : ''}${it.region ? ` <span class="muted-inline">${esc(it.region)}</span>` : ''}</div>
          ${it.expl ? `<div class="cr-ath-expl">${crNl(it.expl)}</div>` : ''}
          ${it.desc ? `<details class="cr-how"><summary>So geht&rsquo;s</summary><div>${crNl(it.desc)}</div></details>` : ''}</div></div>`).join('')}
      <label class="cr-notelbl">Notiz (optional, z. B. Schmerzen, Fragen)<input type="text" data-note="${p.id}" value="${esc((lg && lg.note) || '')}" placeholder="&hellip;"></label>
      ${C.note ? `<div class="hint cr-hint">${crNl(C.note)}</div>` : ''}
      ${C.tips ? `<div class="hint cr-hint"><b>Empfehlungen:</b> ${crNl(C.tips)}</div>` : ''}
    </div>`;
  }).join('');
  renderShell(profile, 'correctives', T, cards);
  const save = async (pid, patch) => {
    const lg = logOf(pid, CR_DAY);
    const row = Object.assign({ program_id: pid, user_id: profile.id, entry_date: CR_DAY, done: (lg && lg.done) || [], note: (lg && lg.note) || null, updated_at: new Date().toISOString() }, patch);
    const res = await sb.from('cr_logs').upsert(row, { onConflict: 'program_id,user_id,entry_date' });
    if (res.error) { toast('Nicht gespeichert: ' + res.error.message); return false; }
    return true;
  };
  appEl.querySelectorAll('.cr-wd[data-day]').forEach(b => b.onclick = () => { CR_DAY = b.dataset.day; renderMyCorrectives(profile); });
  appEl.querySelectorAll('.cr-check').forEach(b => b.onclick = async () => {
    const lg = logOf(b.dataset.p, CR_DAY), set = new Set((lg && lg.done) || []);
    set.has(b.dataset.it) ? set.delete(b.dataset.it) : set.add(b.dataset.it);
    b.disabled = true;
    if (await save(b.dataset.p, { done: [...set] })) { const y = window.scrollY; await renderMyCorrectives(profile); window.scrollTo(0, y); }
    else b.disabled = false;
  });
  appEl.querySelectorAll('[data-note]').forEach(inp => inp.onchange = async () => { if (await save(inp.dataset.note, { note: inp.value.trim() || null })) toast('Notiz gespeichert.'); });
}
