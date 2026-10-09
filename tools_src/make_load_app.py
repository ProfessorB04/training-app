#!/usr/bin/env python3
"""Erzeugt die App-Fassung des Load-Management-Tools (Astroladies-HTML-Tool) mit
  - mehreren Teams (eigene Datensätze: Kader, Wochen, Wellness, Wochensteuerung)
  - Layout je Team: VIACTIV Astroladies Bochum · NRW-Sportschule Pascal-Gymnasium Münster · Balance Movement
    (Logo, Farben, PDF-/Word-Export)
  - window.LM für die Anbindung an die Athletenverwaltung (Adapter in tools_einbinden.py)
Alle Funktionen des Originals (Rohdaten-Import, Ampel, Wochensteuerung/Trainingsempfehlung, Team-Übersicht,
Methodik, PDF/Word, JSON-Sicherung) bleiben unverändert.
Start: python3 tools_src/make_load_app.py  → tools_src/Load_Management_App.html
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = ("/Users/maikberger/Library/CloudStorage/OneDrive-Pascal-GymnasiumMuenster/Pascal-Gymnasium Münster/"
       "01 Athletik/02 Basketball/03 Astroladies Bochum/Assessments & Performance/Load_Management_Astroladies_Bochum Kopie.html")
OUT = os.path.join(HERE, "Load_Management_App.html")

s = open(SRC, encoding="utf-8").read()
logo_nrw = open(os.path.join(HERE, "logo_nrw.b64")).read().strip()
logo_bm = open(os.path.join(HERE, "logo_bm.b64")).read().strip()

def rep(a, b, count=1):
    global s
    n = s.count(a)
    assert n == count, f"{n}x statt {count}x: {a[:90]!r}"
    s = s.replace(a, b)

# ---------- HTML: Topbar + Team-/Layout-Leiste ----------
rep('<p class="eyebrow">VIACTIV Astroladies Bochum</p>', '<p class="eyebrow" id="lmEyebrow">VIACTIV Astroladies Bochum</p>')
i = s.index('<div class="topbar-inner">')
j = s.index('<img src="', i)
s = s[:j] + '<img id="lmTopLogo" src="' + s[j + len('<img src="'):]
rep('''<div class="weekbar">''', '''<div class="lm-dsbar no-print">
  <div class="lm-dsbar-inner">
    <label>Team <select id="lmDataset"></select></label>
    <label>Layout <select id="lmLayout"></select></label>
    <button class="btn" id="lmNewDs" type="button">+ Neues Team</button>
    <button class="btn" id="lmRenameDs" type="button">Umbenennen</button>
    <button class="btn" id="lmDeleteDs" type="button" style="color:var(--zone-r);">Team löschen</button>
  </div>
  <div class="lm-dsbar-inner lm-viewtabs">
    <button type="button" class="lm-tab" data-view="daten">&#128202; Daten &amp; Ampel</button>
    <button type="button" class="lm-tab" data-view="steuerung">&#129517; Wochensteuerung &amp; Trainingsempfehlung</button>
  </div>
</div>

<div class="weekbar">''')
s = s.replace('</style>', '''  /* --- App-Fassung: Team-/Layout-Leiste --- */
  .lm-dsbar{ background:var(--card); border-bottom:1px solid var(--line); }
  .lm-dsbar-inner{ max-width:1180px; margin:0 auto; padding:10px 18px; display:flex; gap:10px; align-items:center; flex-wrap:wrap; font-size:.85rem; color:var(--ink-soft); }
  .lm-dsbar label{ display:flex; align-items:center; gap:6px; }
  .lm-dsbar select{ padding:7px 9px; border:1px solid var(--line); border-radius:8px; background:var(--card); color:var(--ink); font-size:.88rem; }
  .lm-viewtabs{ padding-top:0; gap:6px; }
  .lm-tab{ border:1px solid var(--line); background:var(--bg); color:var(--ink-soft); border-radius:9px 9px 0 0; padding:9px 14px; font-weight:700; font-size:.88rem; cursor:pointer; font-family:inherit; border-bottom:none; }
  .lm-tab.on{ background:var(--blue); color:#fff; border-color:var(--blue); }
  body.lm-view-daten #weekSteering{ display:none !important; }
  body.lm-view-steuerung .wrap > section:not(#weekSteering){ display:none !important; }
  body.lm-view-steuerung .weekbar{ display:none !important; }
  .lm-apppick{ border:1px solid var(--line); border-radius:10px; padding:12px 14px; margin-bottom:12px; background:var(--bg); }
  .lm-apppick-head{ font-size:.86rem; color:var(--ink-soft); margin-bottom:8px; }
  .lm-apppick-count{ font-weight:700; color:var(--ink); }
  .lm-apppick-groups{ display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px; }
  .lm-chip{ border:1px solid var(--line); background:var(--card); color:var(--ink); border-radius:99px; padding:5px 12px; font-size:.8rem; cursor:pointer; font-family:inherit; }
  .lm-chip.on{ background:var(--blue); color:#fff; border-color:var(--blue); }
  .lm-apppick-list{ columns:3; column-gap:18px; max-height:220px; overflow:auto; }
  .lm-apppick-list label{ display:flex; align-items:center; gap:6px; font-size:.86rem; padding:2px 0; break-inside:avoid; cursor:pointer; }
  .lm-apppick-g{ color:var(--ink-faint); font-size:.72rem; }
  @media (max-width:700px){ .lm-apppick-list{ columns:1; } }
</style>''', 1)   # nur das erste </style> (Seiten-CSS, nicht die Word-Vorlage im JS)

# ---------- JS: Datensätze ----------
rep('  var STORE_KEY = "astroladies_load_v1";', '''  // ---- App-Fassung: Teams (je eigener Datensatz) ----
  var LM_DS_KEY = "lm_datasets_v1", LM_ACTIVE_KEY = "lm_active_dataset_v1";
  var LM_DEFAULT_DS = [{ id:"astroladies", name:"VIACTIV Astroladies Bochum", layout:"astroladies" }];
  var LM_DATASETS;
  try { LM_DATASETS = JSON.parse(localStorage.getItem(LM_DS_KEY)) || LM_DEFAULT_DS; } catch(e){ LM_DATASETS = LM_DEFAULT_DS; }
  if (!LM_DATASETS.length) LM_DATASETS = LM_DEFAULT_DS;
  var LM_ACTIVE = null;
  try { LM_ACTIVE = localStorage.getItem(LM_ACTIVE_KEY); } catch(e){}
  if (!LM_DATASETS.some(function(d){ return d.id === LM_ACTIVE; })) LM_ACTIVE = LM_DATASETS[0].id;
  var STORE_KEY = LM_ACTIVE === "astroladies" ? "astroladies_load_v1" : "lm_load_" + LM_ACTIVE;''')
rep('  if (!state) state = { players: DEFAULT_ROSTER.slice(), weeks: {}, wellness: {}, currentWeek: mondayOf(new Date()) };',
    '  if (!state) state = { players: (LM_ACTIVE === "astroladies" ? DEFAULT_ROSTER.slice() : []), weeks: {}, wellness: {}, currentWeek: mondayOf(new Date()) };')

# sRPE-Einträge aus der App übernehmen (Button + Handler, nutzt die vorhandene Einfüge-Vorschau)
rep('''<button class="btn" id="pasteToggleBtn" style="margin-left:auto;">Aus Excel einf&uuml;gen</button>''',
    '''<button class="btn" id="appImportBtn" style="margin-left:auto;" title="sRPE-Einträge, die Athlet:innen in der Trainings-App gemacht haben, für diese Woche laden">&#128241; Aus App übernehmen</button>
      <button class="btn" id="pasteToggleBtn">Aus Excel einf&uuml;gen</button>''')
rep('''  document.getElementById("pasteApplyBtn").addEventListener("click", function(){''', '''  // ---- App-Fassung: Auswahl der Athlet:innen beim Übernehmen aus der App (Gruppen + Häkchen) ----
  function lmUserGroups(athletes, members){
    var byAthlete = {}, out = {};
    members.forEach(function(m){ (byAthlete[m.athlete_id] = byAthlete[m.athlete_id] || []).push(m.group_id); });
    athletes.forEach(function(a){ if (a.profile_id) out[a.profile_id] = byAthlete[a.id] || []; });
    return out;
  }
  function lmShowAppPick(kind, rows, groups, userGroups){
    var panel = document.getElementById(kind === "srpe" ? "pastePanel" : "wellnessPastePanel");
    var area = document.getElementById(kind === "srpe" ? "pasteArea" : "wellnessPasteArea");
    var box = document.getElementById("appPick_" + kind);
    if (!box){
      box = document.createElement("div");
      box.id = "appPick_" + kind; box.className = "lm-apppick";
      panel.insertBefore(box, panel.firstChild);
      // Beim Übernehmen/Abbrechen/Excel-Einfügen die App-Auswahl wieder entfernen
      [kind === "srpe" ? "pasteApplyBtn" : "wellnessPasteApplyBtn", kind === "srpe" ? "pasteCancelBtn" : "wellnessPasteCancelBtn",
       kind === "srpe" ? "pasteToggleBtn" : "wellnessPasteToggleBtn"].forEach(function(id){
        document.getElementById(id).addEventListener("click", function(){ var b = document.getElementById("appPick_" + kind); if (b) b.remove(); });
      });
    }
    panel.style.display = "block";
    var gUsed = groups.filter(function(g){ return rows.some(function(r){ return (userGroups[r.uid] || []).indexOf(g.id) !== -1; }); });
    var team = lmCur().name.toLowerCase().trim();
    var g0 = gUsed.filter(function(g){ return g.name.toLowerCase().trim() === team; })[0];
    var active = g0 ? g0.id : "";
    var sel = {};
    rows.forEach(function(r){ sel[r.uid] = active ? (userGroups[r.uid] || []).indexOf(active) !== -1 : true; });
    var gName = {}; groups.forEach(function(g){ gName[g.id] = g.name; });

    function applySel(){
      var chosen = rows.filter(function(r){ return sel[r.uid]; });
      area.value = chosen.map(function(x){ return [x.name].concat(x.values.map(function(v){ return v === null ? "" : v; })).join("\\t"); }).join("\\n");
      if (kind === "srpe"){ pastedRows = chosen; renderPastePreview(); } else { pastedWellnessRows = chosen; renderWellnessPastePreview(); }
      var c = box.querySelector(".lm-apppick-count"); if (c) c.textContent = chosen.length + " von " + rows.length + " ausgewählt";
    }
    function render(){
      box.innerHTML =
        "<div class='lm-apppick-head'><b>&#128241; Aus der App (" + weekKeyLabel(state.currentWeek) + ")</b> &ndash; Athlet:innen auswählen, deren Werte übernommen werden sollen: <span class='lm-apppick-count'></span></div>" +
        "<div class='lm-apppick-groups'>" +
          gUsed.map(function(g){
            var n = rows.filter(function(r){ return (userGroups[r.uid] || []).indexOf(g.id) !== -1; }).length;
            return "<button type='button' class='lm-chip" + (active === g.id ? " on" : "") + "' data-g='" + g.id + "'>" + esc(g.name) + " (" + n + ")</button>";
          }).join("") +
          "<button type='button' class='lm-chip' data-all='1'>Alle</button><button type='button' class='lm-chip' data-none='1'>Keine</button>" +
        "</div>" +
        "<div class='lm-apppick-list'>" + rows.map(function(r){
          var gl = (userGroups[r.uid] || []).map(function(id){ return gName[id]; }).filter(Boolean).join(", ");
          return "<label><input type='checkbox' data-u='" + r.uid + "'" + (sel[r.uid] ? " checked" : "") + "> " + esc(r.name) +
                 (gl ? " <span class='lm-apppick-g'>" + esc(gl) + "</span>" : " <span class='lm-apppick-g'>keine Gruppe</span>") + "</label>";
        }).join("") + "</div>";
      box.querySelectorAll("[data-g]").forEach(function(b){
        b.addEventListener("click", function(){
          active = b.getAttribute("data-g");
          rows.forEach(function(r){ sel[r.uid] = (userGroups[r.uid] || []).indexOf(active) !== -1; });
          render();
        });
      });
      box.querySelector("[data-all]").addEventListener("click", function(){ active = ""; rows.forEach(function(r){ sel[r.uid] = true; }); render(); });
      box.querySelector("[data-none]").addEventListener("click", function(){ active = ""; rows.forEach(function(r){ sel[r.uid] = false; }); render(); });
      box.querySelectorAll("input[data-u]").forEach(function(cb){
        cb.addEventListener("change", function(){ sel[cb.getAttribute("data-u")] = cb.checked; applySel(); });
      });
      applySel();
    }
    render();
    toast(rows.length + " Athlet:innen mit App-Einträgen – Auswahl prüfen und „Übernehmen“.");
  }

  // ---- App-Fassung: sRPE-Einträge aus der Trainings-App als Rohdaten laden ----
  document.getElementById("appImportBtn").addEventListener("click", function(){
    var sb = window.appSb;
    if (!sb){ toast("Keine Verbindung zur Trainings-App."); return; }
    var from = state.currentWeek, to = addDays(state.currentWeek, 6);
    var btn = this; btn.disabled = true;
    Promise.all([
      sb.from("load_entries").select("user_id,entry_date,srpe,duration_min").gte("entry_date", from).lte("entry_date", to),
      sb.from("profiles").select("id,name"),
      sb.from("athletes").select("id,first_name,last_name,profile_id").not("profile_id", "is", null),
      sb.from("athlete_groups").select("id,name").order("name"),
      sb.from("athlete_group_members").select("athlete_id,group_id")
    ]).then(function(r){
      btn.disabled = false;
      var err = r[0].error || r[1].error || r[2].error || r[3].error || r[4].error;
      if (err){ toast("Fehler beim Laden: " + err.message); return; }
      var nameOf = {};
      r[1].data.forEach(function(p){ nameOf[p.id] = p.name; });
      r[2].data.forEach(function(a){ nameOf[a.profile_id] = ((a.first_name || "") + " " + (a.last_name || "")).trim(); });
      var roster = {};
      state.players.forEach(function(p){ roster[p.toLowerCase().replace(/\\s+/g, " ").trim()] = p; });
      var base = new Date(from + "T00:00:00").getTime();
      var byUser = {};
      r[0].data.forEach(function(e){
        var idx = Math.round((new Date(e.entry_date + "T00:00:00").getTime() - base) / 86400000);
        if (idx < 0 || idx > 6) return;
        var row = byUser[e.user_id] || (byUser[e.user_id] = [null,null,null,null,null,null,null]);
        row[idx] = (row[idx] || 0) + e.srpe * e.duration_min;
      });
      var rows = Object.keys(byUser).map(function(uid){
        var nm = (nameOf[uid] || "Unbekannt").replace(/\\s+/g, " ").trim();
        nm = roster[nm.toLowerCase()] || nm;          // Schreibweise aus dem Kader übernehmen
        return { uid: uid, name: nm, values: byUser[uid] };
      }).sort(function(a, b){ return a.name.localeCompare(b.name, "de"); });
      if (!rows.length){ toast("Keine App-Einträge für " + weekKeyLabel(from) + "."); return; }
      lmShowAppPick("srpe", rows, r[3].data, lmUserGroups(r[2].data, r[4].data));
    }, function(e){ btn.disabled = false; toast("Fehler beim Laden: " + e.message); });
  });

  document.getElementById("pasteApplyBtn").addEventListener("click", function(){''')

# Einmaliger Abgleich: Astroladies-sRPE aus den Forms-Antworten (Stand 21.09.2026) – füllt nur leere Felder
import json as _json
_seed_weeks = _json.load(open(os.path.join(HERE, "astroladies_srpe_seed.json"), encoding="utf-8"))
_seed_roster = _json.load(open(os.path.join(HERE, "astroladies_roster_seed.json"), encoding="utf-8"))
rep('''  if (!state.steeringLegend) state.steeringLegend = { vol:["<75 min","60-90 min",">90 min"], int:["<5","6-7","8-9"] };

  function load(){''', '''  if (!state.steeringLegend) state.steeringLegend = { vol:["<75 min","60-90 min",">90 min"], int:["<5","6-7","8-9"] };

  // ---- App-Fassung: einmaliger Abgleich mit den Forms-Antworten (sRPE, Astroladies, Stand 21.09.2026) ----
  // Füllt nur leere Tageswerte und ergänzt fehlende Namen im Kader; bereits eingetragene Werte bleiben unverändert.
  var LM_SEED_ID = "forms_srpe_2026-09-21";
  var SEED_WEEKS_REF = %s;
  if (LM_ACTIVE === "astroladies" && !(state.seeds && state.seeds[LM_SEED_ID])){
    var SEED_ROSTER = %s;
    var SEED_WEEKS = SEED_WEEKS_REF;
    var seedFilled = 0;
    SEED_ROSTER.forEach(function(n){ if (state.players.indexOf(n) === -1) state.players.push(n); });
    Object.keys(SEED_WEEKS).forEach(function(iso){
      if (!state.weeks[iso]) state.weeks[iso] = {};
      Object.keys(SEED_WEEKS[iso]).forEach(function(name){
        if (state.players.indexOf(name) === -1) state.players.push(name);
        var row = state.weeks[iso][name] || (state.weeks[iso][name] = [null,null,null,null,null,null,null]);
        SEED_WEEKS[iso][name].forEach(function(v, i){
          if (v !== null && (row[i] === null || row[i] === undefined || row[i] === "")){ row[i] = v; seedFilled++; }
        });
      });
    });
    state.seeds = state.seeds || {};
    state.seeds[LM_SEED_ID] = new Date().toISOString();
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch(e){}
    window.__lmSeedInfo = seedFilled;
  }

  // ---- App-Fassung: Abgleich mit dem alten Load-Tool (Safari, 24.09.2026): Handkorrekturen + Wochensteuerung ----
  var LM_SEED2 = "safari_load_2026-09-24";
  if (LM_ACTIVE === "astroladies" && !(state.seeds && state.seeds[LM_SEED2])){
    var OLD = %s;
    var FORMS = SEED_WEEKS_REF;
    var cUpd = 0, sUpd = 0;
    OLD.players.forEach(function(n){ if (state.players.indexOf(n) === -1) state.players.push(n); });
    Object.keys(OLD.weeks).forEach(function(iso){
      Object.keys(OLD.weeks[iso]).forEach(function(name){
        var ov = OLD.weeks[iso][name];
        if (!ov || !ov.some(function(v){ return v !== null && v !== undefined; })) return;
        if (!state.weeks[iso]) state.weeks[iso] = {};
        var row = state.weeks[iso][name] || (state.weeks[iso][name] = [null,null,null,null,null,null,null]);
        var fr = (FORMS[iso] && FORMS[iso][name]) || [];
        ov.forEach(function(v, i){
          if (v === null || v === undefined) return;
          var cur = row[i], fv = (fr[i] === undefined ? null : fr[i]);
          if (cur === null || cur === undefined || cur === ""){ row[i] = v; cUpd++; }
          else if (v !== 0 && fv !== null && Number(cur) === Number(fv) && Number(v) !== Number(cur)){ row[i] = v; cUpd++; }   // Handkorrektur
        });
      });
    });
    Object.keys(OLD.wellness || {}).forEach(function(iso){
      Object.keys(OLD.wellness[iso]).forEach(function(name){
        var ov = OLD.wellness[iso][name];
        if (!ov || !ov.some(function(v){ return v !== null && v !== undefined; })) return;
        if (!state.wellness[iso]) state.wellness[iso] = {};
        var row = state.wellness[iso][name] || (state.wellness[iso][name] = [null,null,null,null,null,null,null]);
        ov.forEach(function(v, i){ if (v !== null && v !== undefined && (row[i] === null || row[i] === undefined)){ row[i] = v; cUpd++; } });
      });
    });
    Object.keys(OLD.steering || {}).forEach(function(iso){
      var o = OLD.steering[iso], c = state.steering[iso];
      if (!c){ state.steering[iso] = JSON.parse(JSON.stringify(o)); sUpd++; return; }
      if (!c.note && o.note){ c.note = o.note; sUpd++; }
      if (!c.autoNoteOverride && o.autoNoteOverride){ c.autoNoteOverride = o.autoNoteOverride; sUpd++; }
    });
    if (OLD.steeringLegend) state.steeringLegend = OLD.steeringLegend;
    state.seeds = state.seeds || {};
    state.seeds[LM_SEED2] = new Date().toISOString();
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch(e){}
    window.__lmSeed2Info = { cells: cUpd, steering: sUpd };
  }

  function load(){''' % (_json.dumps(_seed_weeks, ensure_ascii=False), _json.dumps(_seed_roster, ensure_ascii=False),
       _json.dumps(_json.load(open(os.path.join(HERE, "astroladies_load_safari_2026-09-24.json"), encoding="utf-8")), ensure_ascii=False)))

# Wellness-Einträge aus der App übernehmen (nutzt die vorhandene Wellness-Einfüge-Vorschau)
rep('''id="wellnessPasteToggleBtn"''', '''id="wellnessPasteToggleBtn"''')
_i = s.index('id="wellnessPasteToggleBtn"')
_j = s.rindex('<button', 0, _i)
s = s[:_j] + '''<button class="btn" id="appWellnessImportBtn" title="Wellness-Checks aus der Trainings-App für diese Woche laden">&#128241; Aus App übernehmen</button>
      ''' + s[_j:]
rep('''  document.getElementById("wellnessPasteApplyBtn").addEventListener("click", function(){''', '''  // ---- App-Fassung: Wellness-Checks aus der Trainings-App (Tageswert = Ø der 4 Fragen, 1–5) ----
  document.getElementById("appWellnessImportBtn").addEventListener("click", function(){
    var sb = window.appSb;
    if (!sb){ toast("Keine Verbindung zur Trainings-App."); return; }
    var from = state.currentWeek, to = addDays(state.currentWeek, 6);
    var btn = this; btn.disabled = true;
    Promise.all([
      sb.from("wellness_entries").select("user_id,entry_date,sleep,fatigue,pain,energy").gte("entry_date", from).lte("entry_date", to),
      sb.from("profiles").select("id,name"),
      sb.from("athletes").select("id,first_name,last_name,profile_id").not("profile_id", "is", null),
      sb.from("athlete_groups").select("id,name").order("name"),
      sb.from("athlete_group_members").select("athlete_id,group_id")
    ]).then(function(r){
      btn.disabled = false;
      var err = r[0].error || r[1].error || r[2].error || r[3].error || r[4].error;
      if (err){ toast("Fehler beim Laden: " + err.message); return; }
      var nameOf = {};
      r[1].data.forEach(function(p){ nameOf[p.id] = p.name; });
      r[2].data.forEach(function(a){ nameOf[a.profile_id] = ((a.first_name || "") + " " + (a.last_name || "")).trim(); });
      var roster = {};
      state.players.forEach(function(p){ roster[p.toLowerCase().replace(/\\s+/g, " ").trim()] = p; });
      var base = new Date(from + "T00:00:00").getTime();
      var byUser = {};
      r[0].data.forEach(function(e){
        var idx = Math.round((new Date(e.entry_date + "T00:00:00").getTime() - base) / 86400000);
        if (idx < 0 || idx > 6) return;
        var row = byUser[e.user_id] || (byUser[e.user_id] = [null,null,null,null,null,null,null]);
        row[idx] = Math.round(((e.sleep + e.fatigue + e.pain + e.energy) / 4) * 100) / 100;
      });
      var rows = Object.keys(byUser).map(function(uid){
        var nm = (nameOf[uid] || "Unbekannt").replace(/\\s+/g, " ").trim();
        return { uid: uid, name: roster[nm.toLowerCase()] || nm, values: byUser[uid] };
      }).sort(function(a, b){ return a.name.localeCompare(b.name, "de"); });
      if (!rows.length){ toast("Keine Wellness-Einträge aus der App für " + weekKeyLabel(from) + "."); return; }
      lmShowAppPick("wellness", rows, r[3].data, lmUserGroups(r[2].data, r[4].data));
    }, function(e){ btn.disabled = false; toast("Fehler beim Laden: " + e.message); });
  });

  document.getElementById("wellnessPasteApplyBtn").addEventListener("click", function(){''')

# Methodik & Quellen: nur noch als aufklappbarer Button
_i = s.index('<section id="methodology">')
_j = s.index('</section>', _i)
_sec = s[_i:_j]
_sec = _sec.replace('<div class="section-head"><h2>Methodik &amp; Quellen</h2></div>',
    '<details class="lm-refs"><summary>&#128218; Methodik &amp; Quellen <span>(zum Lesen aufklappen)</span></summary>', 1)
s = s[:_i] + _sec.rstrip() + '\n    </details>\n  ' + s[_j:]
s = s.replace('</style>', '''  .lm-refs{ margin:10px 0 30px; }
  .lm-refs > summary{ cursor:pointer; list-style:none; display:inline-flex; align-items:center; gap:8px; padding:9px 14px; border:1px solid var(--line); border-radius:9px; background:var(--card); font-weight:700; color:var(--ink-soft); font-size:.9rem; }
  .lm-refs > summary::-webkit-details-marker{ display:none; }
  .lm-refs > summary span{ font-weight:400; color:var(--ink-faint); font-size:.8rem; }
  .lm-refs[open] > summary{ margin-bottom:12px; }
</style>''', 1)

# Kadergröße für Schulgruppen erweitern
rep('''    if (state.players.length >= 24){ toast("Maximal 24 Spielerinnen."); return; }''',
    '''    if (state.players.length >= 60){ toast("Maximal 60 Personen."); return; }''')

# Logo: Astroladies-Logo merken, aktuelles Logo je Layout
rep('  var CLUB_LOGO_B64 = "', '  var CLUB_LOGO_ASTRO = "')
i = s.index('var CLUB_LOGO_ASTRO = "')
j = s.index('";', i)
s = s[:j + 2] + '\n  var CLUB_LOGO_B64 = CLUB_LOGO_ASTRO;' + s[j + 2:]

# Word-Export: Farben nach Layout
rep("h2{color:#005ba4;font-size:12pt;}</style></head><body>\";", "h2{color:\" + LM_L.blue + \";font-size:12pt;}</style></head><body>\";")
rep("\"<td style='background:#ee7105;padding:10px 14px;width:70px;'>\" +", "\"<td style='background:\" + LM_L.header + \";padding:10px 14px;width:70px;'>\" +")
rep("\"<td style='background:#ee7105;padding:10px 14px;color:#ffffff;'>\" +", "\"<td style='background:\" + LM_L.header + \";padding:10px 14px;color:#ffffff;'>\" +")
rep('''a.download = "astroladies_load_export_" + state.currentWeek + ".json";''',
    '''a.download = "load_export_" + LM_ACTIVE + "_" + state.currentWeek + ".json";''')

# ---------- Layout anwenden + Team-Leiste + window.LM (vor dem ersten renderAll) ----------
rep('''  renderAll();
})();
</script>''', '''  // ---- App-Fassung: Layouts ----
  var LM_LOGO_NRW = "%s";
  var LM_LOGO_BM = "%s";
  function lmLayouts(){
    return {
      astroladies: { label:"VIACTIV Astroladies Bochum", logo:CLUB_LOGO_ASTRO, blue:"#005ba4", dark:"#004397", header:"#ee7105", accent:"#c7560b" },
      nrw:         { label:"NRW-Sportschule Pascal-Gymnasium Münster", logo:LM_LOGO_NRW, blue:"#010d6e", dark:"#01094d", header:"#0a4fae", accent:"#0a4fae" },
      bm:          { label:"Balance Movement", logo:LM_LOGO_BM, blue:"#0042fc", dark:"#0032bd", header:"#0042fc", accent:"#0042fc" }
    };
  }
  var LM_L = lmLayouts().astroladies;
  function lmCur(){ return LM_DATASETS.filter(function(d){ return d.id === LM_ACTIVE; })[0] || LM_DATASETS[0]; }
  function lmSaveDs(){ try { localStorage.setItem(LM_DS_KEY, JSON.stringify(LM_DATASETS)); } catch(e){} }
  function lmSwitch(id){ try { localStorage.setItem(LM_ACTIVE_KEY, id); } catch(e){} location.reload(); }
  function lmApplyLayout(){
    var d = lmCur(), all = lmLayouts();
    LM_L = all[d.layout] || all.astroladies;
    CLUB_LOGO_B64 = LM_L.logo;
    var r = document.documentElement.style;
    r.setProperty("--blue", LM_L.blue); r.setProperty("--dark-blue", LM_L.dark);
    r.setProperty("--astro-orange", LM_L.header); r.setProperty("--accent", LM_L.accent);
    document.getElementById("lmTopLogo").src = "data:image/png;base64," + LM_L.logo;
    document.getElementById("lmTopLogo").alt = d.name;
    document.getElementById("lmEyebrow").textContent = d.name;
    document.title = "Load Management · " + d.name;
  }
  function lmRenderDsBar(){
    var all = lmLayouts();
    document.getElementById("lmDataset").innerHTML = LM_DATASETS.map(function(d){
      return "<option value='" + esc(d.id) + "'" + (d.id === LM_ACTIVE ? " selected" : "") + ">" + esc(d.name) + "</option>";
    }).join("");
    document.getElementById("lmLayout").innerHTML = Object.keys(all).map(function(k){
      return "<option value='" + k + "'" + (k === lmCur().layout ? " selected" : "") + ">" + esc(all[k].label) + "</option>";
    }).join("");
  }
  document.getElementById("lmDataset").addEventListener("change", function(e){ lmSwitch(e.target.value); });
  document.getElementById("lmLayout").addEventListener("change", function(e){
    lmCur().layout = e.target.value; lmSaveDs(); lmApplyLayout(); renderAll();
  });
  document.getElementById("lmNewDs").addEventListener("click", function(){
    var name = prompt("Name des neuen Teams (z. B. Jahrgang 8, U16, Leichtathletik):");
    if (!name || !name.trim()) return;
    var id = "ds" + Date.now().toString(36);
    LM_DATASETS.push({ id:id, name:name.trim(), layout:"bm" });
    lmSaveDs(); lmSwitch(id);
  });
  document.getElementById("lmRenameDs").addEventListener("click", function(){
    var name = prompt("Neuer Name für „" + lmCur().name + "“:", lmCur().name);
    if (!name || !name.trim()) return;
    lmCur().name = name.trim(); lmSaveDs(); lmRenderDsBar(); lmApplyLayout();
  });
  document.getElementById("lmDeleteDs").addEventListener("click", function(){
    if (LM_DATASETS.length <= 1){ alert("Das letzte Team kann nicht gelöscht werden."); return; }
    if (!confirm("Team „" + lmCur().name + "“ mit allen Daten (Kader, Wochen, Wellness, Wochensteuerung) löschen?\\nTipp: vorher „Export (JSON)“ als Sicherung.")) return;
    try { localStorage.removeItem(STORE_KEY); } catch(e){}
    LM_DATASETS = LM_DATASETS.filter(function(d){ return d.id !== LM_ACTIVE; });
    lmSaveDs(); lmSwitch(LM_DATASETS[0].id);
  });

  // Für die Anbindung an die Athletenverwaltung
  window.LM = {
    players: function(){ return state.players.slice(); },
    addPlayers: function(names){
      var have = {}; state.players.forEach(function(p){ have[p.toLowerCase().replace(/\\s+/g," ").trim()] = true; });
      var n = 0;
      names.forEach(function(nm){
        var k = nm.toLowerCase().replace(/\\s+/g," ").trim();
        if (!k || have[k] || state.players.length >= 60) return;
        state.players.push(nm.replace(/\\s+/g," ").trim()); have[k] = true; n++;
      });
      if (n){ save(); renderAll(); }
      return n;
    }
  };

  // ---- App-Fassung: Ansichten „Daten & Ampel“ / „Wochensteuerung & Trainingsempfehlung“ ----
  function lmSetView(v, scroll){
    v = (v === "steuerung") ? "steuerung" : "daten";
    document.body.classList.toggle("lm-view-steuerung", v === "steuerung");
    document.body.classList.toggle("lm-view-daten", v === "daten");
    [].forEach.call(document.querySelectorAll(".lm-tab"), function(b){ b.classList.toggle("on", b.getAttribute("data-view") === v); });
    var h1 = document.querySelector(".topbar h1");
    if (h1) h1.innerHTML = v === "steuerung" ? "Wochensteuerung &amp; Trainingsempfehlung" : "Load Management &middot; Session-RPE";
    try { history.replaceState(null, "", "#" + v); } catch(e){}
    if (scroll) window.scrollTo(0, 0);
  }
  [].forEach.call(document.querySelectorAll(".lm-tab"), function(b){
    b.addEventListener("click", function(){ lmSetView(b.getAttribute("data-view"), true); renderAll(); });
  });
  lmSetView((location.hash || "").indexOf("steuerung") !== -1 ? "steuerung" : "daten");

  lmRenderDsBar();
  lmApplyLayout();
  renderAll();
  if (window.__lmSeedInfo) toast(window.__lmSeedInfo + " Tageswerte aus den Forms-Antworten (KW 34–39) ergänzt.");
  if (window.__lmSeed2Info) setTimeout(function(){ toast("Altes Load-Tool übernommen: " + window.__lmSeed2Info.cells + " Werte, " + window.__lmSeed2Info.steering + " Wochensteuerungs-Einträge."); }, 2600);
})();
</script>''' % (logo_nrw, logo_bm))

exec(open(os.path.join(HERE, "lm_patch_spielerauswahl.py"), encoding="utf-8").read())   # Spielerinnen-Auswahl Wochensteuerung
exec(open(os.path.join(HERE, "lm_patch_wellness_einklappen.py"), encoding="utf-8").read())   # Wellness-Erfassung einklappbar
exec(open(os.path.join(HERE, "lm_patch_app_import.py"), encoding="utf-8").read())   # Aus App übernehmen: Woche/Tage/Modus + manuelle Werte
exec(open(os.path.join(HERE, "lm_patch_status_ewma.py"), encoding="utf-8").read())   # Status krank/verletzt/Reha/abwesend, Wiedereinstieg, EWMA-ACWR
open(OUT, "w", encoding="utf-8").write(s)
print("erstellt:", OUT, len(s) // 1024, "KB")
