# „Aus App übernehmen“ (sRPE) im Load-Management-Tool (2026-10-01):
#  - übernimmt in die oben gewählte Woche, Tage einzeln wählbar, Modus „Ersetzen“ (Standard) oder „nur leere Felder“
#  - manuelle Nachträge/Korrekturen aus „sRPE aus der App“ (Tabelle load_manual) ersetzen den App-Wert des Tages,
#    auch für Athlet:innen ohne App-Zugang
# Wird von make_load_app.py per exec() auf den Quelltext s angewendet (nutzt dessen rep()).

# 1) Laden: zusätzlich manuelle Werte + alle Athlet:innen (auch ohne Zugang)
rep(r'''      sb.from("load_entries").select("user_id,entry_date,srpe,duration_min").gte("entry_date", from).lte("entry_date", to),
      sb.from("profiles").select("id,name"),
      sb.from("athletes").select("id,first_name,last_name,profile_id").not("profile_id", "is", null),
      sb.from("athlete_groups").select("id,name").order("name"),
      sb.from("athlete_group_members").select("athlete_id,group_id")
    ]).then(function(r){
      btn.disabled = false;
      var err = r[0].error || r[1].error || r[2].error || r[3].error || r[4].error;''', r'''      sb.from("load_entries").select("user_id,entry_date,srpe,duration_min").gte("entry_date", from).lte("entry_date", to),
      sb.from("profiles").select("id,name"),
      sb.from("athletes").select("id,first_name,last_name,profile_id"),
      sb.from("athlete_groups").select("id,name").order("name"),
      sb.from("athlete_group_members").select("athlete_id,group_id"),
      sb.from("load_manual").select("*").gte("entry_date", from).lte("entry_date", to)
    ]).then(function(r){
      btn.disabled = false;
      var err = r[0].error || r[1].error || r[2].error || r[3].error || r[4].error;''')
# kommt im sRPE- und im Wellness-Import vor → nur das erste Vorkommen (sRPE) ersetzen
_a = r'''      r[2].data.forEach(function(a){ nameOf[a.profile_id] = ((a.first_name || "") + " " + (a.last_name || "")).trim(); });'''
assert s.count(_a) == 2
s = s.replace(_a, r'''      r[2].data.forEach(function(a){ var nm = ((a.first_name || "") + " " + (a.last_name || "")).trim(); if (a.profile_id) nameOf[a.profile_id] = nm; nameOf["a:" + a.id] = nm; });''', 1)
rep(r'''        row[idx] = (row[idx] || 0) + e.srpe * e.duration_min;
      });''', r'''        row[idx] = (row[idx] || 0) + e.srpe * e.duration_min;
      });
      // manuelle Sessions ('u:<profil>' bzw. 'a:<athlet>' ohne App-Zugang): Summe je Tag; ersetzen den App-Wert,
      // außer count_app = true (dann App-Wert + Sessions) – mehrere Sessions pro Tag seit 2026-10-09
      var manDays = {}, manSum = {}, manKeep = {};
      (r[5] && !r[5].error ? r[5].data : []).forEach(function(m){
        var idx = Math.round((new Date(m.entry_date + "T00:00:00").getTime() - base) / 86400000);
        if (idx < 0 || idx > 6) return;
        var key = m.person_key.indexOf("u:") === 0 ? m.person_key.slice(2) : m.person_key;
        var s = manSum[key] || (manSum[key] = {}), k = manKeep[key] || (manKeep[key] = {});
        s[idx] = (s[idx] || 0) + (+m.au || 0);
        if (m.count_app) k[idx] = true;
        (manDays[key] = manDays[key] || {})[idx] = true;
      });
      Object.keys(manSum).forEach(function(key){
        var row = byUser[key] || (byUser[key] = [null,null,null,null,null,null,null]);
        Object.keys(manSum[key]).forEach(function(idx){
          row[idx] = (manKeep[key][idx] ? (row[idx] || 0) : 0) + manSum[key][idx];
        });
      });''')
rep(r'''        return { uid: uid, name: nm, values: byUser[uid] };''', r'''        return { uid: uid, name: nm, values: byUser[uid], fromApp: true, manual: manDays[uid] || {} };''')
rep(r'''      lmShowAppPick("srpe", rows, r[3].data, lmUserGroups(r[2].data, r[4].data));
    }, function(e){ btn.disabled = false; toast("Fehler beim Laden: " + e.message); });''', r'''      var ug = lmUserGroups(r[2].data, r[4].data);
      // Gruppen auch für Athlet:innen ohne App-Zugang ('a:<id>')
      r[2].data.forEach(function(a){ ug["a:" + a.id] = r[4].data.filter(function(m){ return m.athlete_id === a.id; }).map(function(m){ return m.group_id; }); });
      lmShowAppPick("srpe", rows, r[3].data, ug);
    }, function(e){ btn.disabled = false; toast("Fehler beim Laden: " + e.message); });''')

# 2) Auswahl-Kasten: Zielwoche, Tage, Modus
rep(r'''    function render(){
      box.innerHTML =
        "<div class='lm-apppick-head'><b>&#128241; Aus der App (" + weekKeyLabel(state.currentWeek) + ")</b> &ndash; Athlet:innen auswählen, deren Werte übernommen werden sollen: <span class='lm-apppick-count'></span></div>" +''',
    r'''    if (kind === "srpe" && !window.__lmAppOpt) window.__lmAppOpt = { mode: "replace", days: [true,true,true,true,true,true,true] };
    var DN = ["Mo","Di","Mi","Do","Fr","Sa","So"];
    function optHtml(){
      if (kind !== "srpe") return "";
      var o = window.__lmAppOpt;
      return "<div class='lm-apppick-opt'><b>&rarr; in " + weekKeyLabel(state.currentWeek) + " (" + fmtDate(state.currentWeek).slice(0,6) + "&ndash;" + fmtDate(addDays(state.currentWeek,6)).slice(0,6) + ")</b>" +
        " &middot; Tage: " + DN.map(function(d, i){ return "<label class='lm-dchk'><input type='checkbox' data-day='" + i + "'" + (o.days[i] ? " checked" : "") + "> " + d + "</label>"; }).join("") +
        " &middot; <label class='lm-dchk'><input type='radio' name='lmMode' value='replace'" + (o.mode === "replace" ? " checked" : "") + "> Ersetzen</label>" +
        "<label class='lm-dchk'><input type='radio' name='lmMode' value='fill'" + (o.mode === "fill" ? " checked" : "") + "> nur leere Felder f&uuml;llen</label>" +
        "<div class='lm-apppick-hint'>Ersetzen: an den gew&auml;hlten Tagen gelten genau die App-Werte, Tage ohne App-Eintrag werden <b>geleert</b> (nicht 0). Eine Woche ganz ohne Eintr&auml;ge gilt dann als fehlend &ndash; war die Spielerin krank/verletzt/abwesend, bitte in der Erfassung den <b>Status</b> setzen (z&auml;hlt dann als echte 0). &#9998; = manuell nachgetragener Wert, ein manueller 0-Wert bleibt 0.</div></div>";
    }
    function render(){
      box.innerHTML =
        "<div class='lm-apppick-head'><b>&#128241; Aus der App (" + weekKeyLabel(state.currentWeek) + ")</b> &ndash; Athlet:innen auswählen, deren Werte übernommen werden sollen: <span class='lm-apppick-count'></span></div>" + optHtml() +''')
rep(r'''          return "<label><input type='checkbox' data-u='" + r.uid + "'" + (sel[r.uid] ? " checked" : "") + "> " + esc(r.name) +''',
    r'''          return "<label><input type='checkbox' data-u='" + r.uid + "'" + (sel[r.uid] ? " checked" : "") + "> " + esc(r.name) + (r.manual && Object.keys(r.manual).length ? " &#9998;" : "") +''')
rep(r'''      box.querySelectorAll("input[data-u]").forEach(function(cb){
        cb.addEventListener("change", function(){ sel[cb.getAttribute("data-u")] = cb.checked; applySel(); });
      });''', r'''      box.querySelectorAll("input[data-u]").forEach(function(cb){
        cb.addEventListener("change", function(){ sel[cb.getAttribute("data-u")] = cb.checked; applySel(); });
      });
      box.querySelectorAll("input[data-day]").forEach(function(cb){
        cb.addEventListener("change", function(){ window.__lmAppOpt.days[+cb.getAttribute("data-day")] = cb.checked; });
      });
      box.querySelectorAll("input[name=lmMode]").forEach(function(rb){
        rb.addEventListener("change", function(){ if (rb.checked) window.__lmAppOpt.mode = rb.value; });
      });''')

# 3) Übernehmen: App-Zeilen nach Modus/Tagen, sonst wie bisher (Excel: leere Zellen überschreiben nichts)
rep(r'''  function applyPastedRows(){
    pastedRows.forEach(function(row){
      if (state.players.indexOf(row.name) === -1) state.players.push(row.name);
      var vals = getPlayerWeek(state.currentWeek, row.name);
      for (var i=0; i<7; i++){
        if (row.values[i] !== null && row.values[i] !== undefined) vals[i] = row.values[i];
      }
    });''', r'''  function applyPastedRows(){
    var opt = window.__lmAppOpt || { mode: "replace", days: [true,true,true,true,true,true,true] };
    pastedRows.forEach(function(row){
      if (state.players.indexOf(row.name) === -1) state.players.push(row.name);
      var vals = getPlayerWeek(state.currentWeek, row.name);
      for (var i=0; i<7; i++){
        var v = row.values[i], has = v !== null && v !== undefined;
        if (row.fromApp){
          if (!opt.days[i]) continue;
          if (opt.mode === "replace") vals[i] = has ? v : null;   // kein Eintrag = leer/fehlend (seit 2026-10-09); echte 0 nur per Status (krank/verletzt/abwesend) oder manuellem 0-Wert
          else if (has && (vals[i] === null || vals[i] === undefined || vals[i] === "" || isNaN(vals[i]) || vals[i] === 0)) vals[i] = v;
        } else if (has) vals[i] = v;
      }
    });''')
rep(r'''    renderAll();
    toast("Werte übernommen.");
  }''', r'''    renderAll();
    toast("Werte übernommen in " + weekKeyLabel(state.currentWeek) + ".");
  }''')

# 4) Stile
rep(r'''  .steer-target .lbl{''', r'''  .lm-apppick-opt{ margin:6px 0 8px; padding:8px 10px; background:var(--bg-elevated); border:1px solid var(--line); border-radius:8px; font-size:.85rem; line-height:1.9; }
  .lm-dchk{ display:inline-flex; align-items:center; gap:3px; margin-right:8px; white-space:nowrap; }
  .lm-apppick-hint{ font-size:.78rem; color:var(--ink-faint); line-height:1.4; }
  .steer-target .lbl{''')

# 5) Auch Athlet:innen OHNE Einträge in dieser Woche anbieten, damit „Ersetzen“ alte Werte leeren kann
rep(r'''      if (!rows.length){ toast("Keine App-Einträge für " + weekKeyLabel(from) + "."); return; }''', r'''      var haveRow = {}; rows.forEach(function(x){ haveRow[x.uid] = true; });
      r[2].data.forEach(function(a){
        var key = a.profile_id || ("a:" + a.id);
        if (haveRow[key]) return;
        var nm = ((a.first_name || "") + " " + (a.last_name || "")).replace(/\s+/g, " ").trim();
        if (!nm) return;
        nm = roster[nm.toLowerCase()] || nm;
        if (!a.profile_id && !roster[nm.toLowerCase()]) return;   // ohne App und nicht im Kader → nicht anbieten
        rows.push({ uid: key, name: nm, values: [null,null,null,null,null,null,null], fromApp: true, manual: {}, noEntries: true, noApp: !a.profile_id });
        haveRow[key] = true;
      });
      rows.sort(function(a, b){ return a.name.localeCompare(b.name, "de"); });
      if (!rows.length){ toast("Keine Athlet:innen für " + weekKeyLabel(from) + "."); return; }''')
# Vorauswahl: ohne App-Zugang und ohne Einträge nicht automatisch ankreuzen (sonst würden Excel-Werte geleert)
rep(r'''    rows.forEach(function(r){ sel[r.uid] = active ? (userGroups[r.uid] || []).indexOf(active) !== -1 : true; });''',
    r'''    var pre = function(r){ return true; };   // alle vorauswählen: kein Eintrag → 0
    rows.forEach(function(r){ sel[r.uid] = (active ? (userGroups[r.uid] || []).indexOf(active) !== -1 : true) && pre(r); });''')
rep(r'''          rows.forEach(function(r){ sel[r.uid] = (userGroups[r.uid] || []).indexOf(active) !== -1; });''',
    r'''          rows.forEach(function(r){ sel[r.uid] = (userGroups[r.uid] || []).indexOf(active) !== -1 && pre(r); });''')
rep(r'''(r.manual && Object.keys(r.manual).length ? " &#9998;" : "") +''',
    r'''(r.manual && Object.keys(r.manual).length ? " &#9998;" : "") + (r.noEntries ? " <span class='lm-apppick-g' style='color:#b0281c'>keine Eintr&auml;ge" + (r.noApp ? ", ohne App" : "") + "</span>" : "") +''')
