# Load-Management-Tool (2026-10-09): Krankheit/Verletzung/Abwesenheit, Wiedereinstieg, EWMA-ACWR (nur Trainer-Tool)
#  1) Status je Spielerin und Tag: krank (K) / verletzt (V) / Reha (R) / abwesend (A) – state.status[name][datum]
#     krank/verletzt/abwesend ohne Wert = echte 0 (fließt in Wochenlast und chronische Last ein; Blanch & Gabbett 2016)
#  2) Woche mit ≥ 3 Status-Tagen: keine Ampel/Empfehlung aus den Kennzahlen (Entscheidung Arzt/Physio; IOC-Konsens 2022)
#  3) Wiedereinstieg: nach ≥ 5 Status-Tagen am Stück, 3 Wochen lang – keine „steigern“-Empfehlung aus Unterlastung,
#     Orientierung Obergrenze ≈ ACWR 1,3 × chronische Last, Ø Wochenlast vor der Pause
#  4) Ganze Woche ohne Werte und ohne Status = fehlend (nicht 0, Windt et al. 2018); „Aus App übernehmen → Ersetzen“
#     setzt Tage ohne Eintrag nicht mehr auf 0 (Änderung in lm_patch_app_import.py)
#  5) ACWR wahlweise EWMA (Williams et al. 2017; λ = 2/(N+1), N = 7/28 Tage), Umschalter in „Ampel je Spielerin“
# Wird von make_load_app.py per exec() auf den Quelltext s angewendet (nutzt dessen rep()).

# ---------- CSS ----------
rep('''  .loadinput{ width:56px;''', '''  .lm-stcell{ position:relative; white-space:nowrap; }
  .lm-stbtn{ margin-left:2px; width:20px; height:20px; padding:0; border-radius:5px; border:1px dashed var(--line); background:transparent; color:var(--ink-faint); font-size:.68rem; font-weight:700; cursor:pointer; vertical-align:middle; }
  .lm-st-ill .lm-stbtn{ background:#c0392b; color:#fff; border:0; }  .lm-st-ill .loadinput{ background:rgba(192,57,43,.10); }
  .lm-st-inj .lm-stbtn{ background:#b9770e; color:#fff; border:0; }  .lm-st-inj .loadinput{ background:rgba(185,119,14,.12); }
  .lm-st-rehab .lm-stbtn{ background:#2471a3; color:#fff; border:0; }  .lm-st-rehab .loadinput{ background:rgba(36,113,163,.10); }
  .lm-st-away .lm-stbtn{ background:#7f8c8d; color:#fff; border:0; }  .lm-st-away .loadinput{ background:rgba(127,140,141,.14); }
  .lm-stweek{ font-size:.75rem; padding:3px 4px; border-radius:6px; border:1px solid var(--line); background:var(--bg-elevated); color:var(--ink); }
  .lm-st-hint{ font-size:.78rem; margin:8px 0 0; }
  .lm-st-key{ display:inline-block; min-width:16px; padding:0 4px; border-radius:4px; color:#fff; font-weight:700; font-size:.7rem; text-align:center; }
  .lm-acwr-opt{ display:flex; flex-wrap:wrap; gap:6px 14px; align-items:center; font-size:.85rem; margin:0 0 12px; color:var(--ink-soft); }
  .lm-acwr-opt label{ display:inline-flex; gap:5px; align-items:center; cursor:pointer; color:var(--ink); }
  .lm-acwr-opt .lm-acwr-note{ font-size:.78rem; color:var(--ink-faint); }
  .steer-st{ font-size:.72rem; font-weight:700; color:#fff; border-radius:4px; padding:1px 5px; }
  .loadinput{ width:56px;''')

# ---------- HTML: Hinweis unter der Erfassung, Umschalter ACWR ----------
rep('''      <table class="grid" id="entryTable"></table>
    </div>''', '''      <table class="grid" id="entryTable"></table>
    </div>
    <p class="section-intro lm-st-hint">Status je Tag (Knopf neben dem Feld, mehrfach klicken): <span class="lm-st-key" style="background:#c0392b">K</span> krank &middot; <span class="lm-st-key" style="background:#b9770e">V</span> verletzt &middot; <span class="lm-st-key" style="background:#2471a3">R</span> Reha &middot; <span class="lm-st-key" style="background:#7f8c8d">A</span> abwesend. Ganze Woche &uuml;ber &bdquo;Status Woche&ldquo;.
      Krank/verletzt/abwesend ohne Wert z&auml;hlt als <b>echte 0</b> (keine Belastung). Ab 3 Status-Tagen in einer Woche gibt es f&uuml;r diese Spielerin <b>keine Ampel und keine Empfehlung</b>; nach &ge;&nbsp;5 Status-Tagen am St&uuml;ck folgt eine 3-w&ouml;chige <b>Wiedereinstiegs-Phase</b>. Eine Woche ganz ohne Werte und ohne Status gilt als <b>fehlend</b> (nicht als 0) &ndash; dann bitte Status setzen oder Werte nachtragen. Nur hier im Tool sichtbar (Trainer:innen), nicht f&uuml;r Athlet:innen.</p>''')
rep('''    <div class="player-grid" id="playerGrid"></div>''', '''    <div class="lm-acwr-opt" id="lmAcwrOpt">ACWR-Berechnung:
      <label><input type="radio" name="lmAcwrM" value="ra"> Rollierend (aktuelle Woche &divide; &Oslash; 3 Vorwochen)</label>
      <label><input type="radio" name="lmAcwrM" value="ewma"> EWMA (Williams et al. 2017)</label>
      <span class="lm-acwr-note">EWMA gewichtet j&uuml;ngere Tage st&auml;rker und bildet Pausen realistischer ab; braucht &ge;&nbsp;28 Tage Daten. Gilt f&uuml;r dieses Team.</span></div>
    <div class="player-grid" id="playerGrid"></div>''')

# ---------- JS: Status-Helfer ----------
rep('''  function getWellnessWeek(iso){''', '''  // ---- Status je Spielerin & Tag (nur im Trainer-Tool) ----
  var LM_ST = { ill:{ l:"krank", s:"K", c:"#c0392b" }, inj:{ l:"verletzt", s:"V", c:"#b9770e" }, rehab:{ l:"Reha", s:"R", c:"#2471a3" }, away:{ l:"abwesend", s:"A", c:"#7f8c8d" } };
  var LM_ST_ORDER = ["", "ill", "inj", "rehab", "away"];
  function stGet(name, dIso){ var m = state.status && state.status[name]; return (m && m[dIso]) || ""; }
  function stSet(name, dIso, code){
    if (!state.status) state.status = {};
    var m = state.status[name] || (state.status[name] = {});
    if (code && LM_ST[code]) m[dIso] = code; else delete m[dIso];
    if (!Object.keys(m).length) delete state.status[name];
  }
  // krank/verletzt/abwesend ohne eingetragenen Wert = echte 0; Reha: eingetragene Werte zählen, leer = fehlend
  function stIsZero(code){ return code === "ill" || code === "inj" || code === "away"; }
  function stWeekInfo(iso, name){
    var n = 0, cnt = {};
    for (var i = 0; i < 7; i++){ var c = stGet(name, addDays(iso, i)); if (c){ n++; cnt[c] = (cnt[c] || 0) + 1; } }
    var kind = Object.keys(cnt).sort(function(a, b){ return cnt[b] - cnt[a]; })[0] || "";
    return { days: n, kind: kind };
  }
  function lmStChanged(){ save(); renderEntryTable(); renderDashboard(); renderTeamPills(); renderWeekSteering(); }

  function getWellnessWeek(iso){''')

rep('''  function weekTotal(iso, name){
    var vals = getPlayerWeek(iso, name).filter(function(v){ return v !== null && v !== undefined && !isNaN(v); });
    if (!vals.length) return null;''', '''  function weekTotal(iso, name){
    var vals = [];
    getPlayerWeek(iso, name).forEach(function(v, i){
      if (v !== null && v !== undefined && !isNaN(v)) vals.push(v);
      else if (stIsZero(stGet(name, addDays(iso, i)))) vals.push(0);   // krank/verletzt/abwesend = echte 0
    });
    if (!vals.length) return null;''')

# ---------- JS: Kennzahlen – EWMA, Pause, Wiedereinstieg ----------
rep('''  function computeMetrics(name, weekIso){''', '''  function computeMetricsBase(name, weekIso){''')
rep('''  function computeWellnessMetrics(name, weekIso){''', '''  // Tageswert für die EWMA: eingetragener Wert; sonst krank/verletzt/abwesend = 0; sonst trainingsfreier Tag (= 0) in einer
  // Woche mit Einträgen/Status; ganze Woche ohne Daten = fehlend (null) → EWMA bleibt unverändert (fehlend ≠ 0, Windt et al. 2018)
  function lmDaily(name, dIso){
    var mon = mondayOf(new Date(dIso + "T00:00:00"));
    var i = Math.round((new Date(dIso + "T00:00:00") - new Date(mon + "T00:00:00")) / 86400000);
    var arr = state.weeks[mon] && state.weeks[mon][name];
    var v = arr ? arr[i] : null;
    if (v !== null && v !== undefined && v !== "" && !isNaN(v)) return { v: +v, real: true };
    var c = stGet(name, dIso);
    if (stIsZero(c)) return { v: 0 };
    if (c === "rehab") return null;
    var has = arr && arr.some(function(x){ return x !== null && x !== undefined && x !== "" && !isNaN(x); });
    for (var k = 0; !has && k < 7; k++) if (stGet(name, addDays(mon, k))) has = true;
    return has ? { v: 0 } : null;
  }
  function lmFirstWeek(name){
    var first = null;
    Object.keys(state.weeks).forEach(function(iso){
      var a = state.weeks[iso] && state.weeks[iso][name];
      if (a && a.some(function(x){ return x !== null && x !== undefined && x !== "" && !isNaN(x); }) && (!first || iso < first)) first = iso;
    });
    return first;
  }
  // EWMA nach Williams et al. (2017): EWMA_heute = λ·Last_heute + (1−λ)·EWMA_gestern, λ = 2/(N+1), N = 7 (akut) bzw. 28 (chronisch).
  // Startwert = erster erfasster Tageswert (wie Murray et al. 2017); Startwert-Problem (Wang et al.): erst ab 28 Tagen Werte, < 50 Tage = Einlaufphase.
  function ewmaAcwr(name, weekIso){
    var first = lmFirstWeek(name);
    if (!first) return { acwr: null, days: 0 };
    var end = addDays(weekIso, 6), today = isoDate(new Date());
    if (weekIso <= today && today < end){                          // laufende Woche nur bis heute (heute ohne Eintrag: bis gestern)
      var lt = lmDaily(name, today); end = (lt && lt.real) ? today : addDays(today, -1);
    }
    var la = 2 / (7 + 1), lc = 2 / (28 + 1), A = null, C = null, n = 0, gaps = 0;
    for (var d = first; d <= end; d = addDays(d, 1)){
      var L = lmDaily(name, d);
      if (A === null){ if (L && L.real){ A = L.v; C = L.v; n = 1; } continue; }
      if (L === null){ gaps++; continue; }
      A = la * L.v + (1 - la) * A; C = lc * L.v + (1 - lc) * C; n++;
    }
    if (A === null || n < 28) return { acwr: null, days: n, gaps: gaps };
    return { acwr: C > 0 ? A / C : null, acute: A, chronic: C, days: n, gaps: gaps, warm: n < 50 };
  }
  // Wiedereinstieg: letzte Status-Phase (≥ 5 Tage am Stück) endete in den 21 Tagen vor Wochenende
  function lmReturnInfo(name, weekIso, m){
    var end = addDays(weekIso, 6), lastSt = null;
    for (var k = 0; k < 21; k++){ var d = addDays(end, -k); if (stGet(name, d)){ lastSt = d; break; } }
    if (!lastSt || lastSt === end) return null;
    var start = lastSt, len = 0;
    while (stGet(name, start) && len < 400){ len++; start = addDays(start, -1); }
    start = addDays(start, 1);
    if (len < 5) return null;
    var since = Math.round((new Date(end + "T00:00:00") - new Date(lastSt + "T00:00:00")) / 86400000);
    var startMon = mondayOf(new Date(start + "T00:00:00")), pre = [];
    for (var w = 1; w <= 4; w++){ var t = weekTotal(addDays(startMon, -7 * w), name); if (t !== null && t > 0) pre.push(t); }
    var chronicWeek = null;
    if (m && m.method === "ewma" && m.ewma && m.ewma.chronic !== undefined) chronicWeek = m.ewma.chronic * 7;
    else {
      var cv = [weekIso, addDays(weekIso, -7), addDays(weekIso, -14)].map(function(x){ return weekTotal(x, name); }).filter(function(x){ return x !== null; });
      if (cv.length >= 2) chronicWeek = mean(cv);
    }
    return { days: len, from: start, to: lastSt, weekNo: Math.min(3, Math.ceil(since / 7)), preAvg: pre.length ? mean(pre) : null,
             cap: chronicWeek ? 1.3 * chronicWeek : null };
  }
  function computeMetrics(name, weekIso){
    var cur = weekIso || state.currentWeek;
    var m = computeMetricsBase(name, cur);
    m.method = state.acwrMethod === "ewma" ? "ewma" : "ra";
    m.acwrRa = m.acwr;
    if (m.method === "ewma"){ m.ewma = ewmaAcwr(name, cur); m.acwr = m.total !== null ? m.ewma.acwr : null; }
    m.st = stWeekInfo(cur, name);
    m.pause = m.st.days >= 3;
    m.ret = m.pause ? null : lmReturnInfo(name, cur, m);
    return m;
  }

  function computeWellnessMetrics(name, weekIso){''')

rep('''  function overallSignal(metrics, wellnessMetrics){''', '''  // Status-Woche: keine Ampel/Empfehlung; Wiedereinstieg: keine „steigern“-Empfehlung aus Unterlastung, mindestens Gelb
  function overallSignal(metrics, wellnessMetrics){
    if (metrics && metrics.pause) return { zone: "idle", dir: null, pause: true };
    var s = overallSignalBase(metrics, wellnessMetrics);
    if (metrics && metrics.ret){
      if (!((s.zone === "r" || s.zone === "a") && s.dir === "over")) s = { zone: "a", dir: "under" };
      s.ret = true;
    }
    return s;
  }
  function overallSignalBase(metrics, wellnessMetrics){''')

rep('''  function recoText(zone, metrics, wellnessMetrics, dir){''', '''  function recoText(zone, metrics, wellnessMetrics, dir){
    if (metrics && metrics.pause){
      var st = LM_ST[metrics.st.kind] || { l: "Pause" };
      return "&#9208; Status <b>" + st.l + "</b> (" + metrics.st.days + " Tag" + (metrics.st.days === 1 ? "" : "e") + " in dieser Woche) &mdash; <b>keine Laststeuerung aus den Kennzahlen</b>. " +
        "Ob und wie trainiert wird, entscheidet der Gesundheitsstatus (Arzt/Physio). Nach Infekten schrittweise R&uuml;ckkehr nach klinischer Beurteilung (IOC-Konsens 2022).";
    }
    var base = recoTextBase(zone, metrics, wellnessMetrics, dir);
    if (metrics && metrics.ret){
      var r = metrics.ret;
      return "&#8635; <b>Wiedereinstieg</b> nach " + r.days + " Tagen Pause (" + fmtDate(r.from).slice(0, 6) + "&ndash;" + fmtDate(r.to).slice(0, 6) + "), Woche " + r.weekNo + " von 3: " +
        "Last schrittweise aufbauen, keine Spr&uuml;nge" + (r.cap ? " &mdash; Orientierung n&auml;chste Woche h&ouml;chstens &asymp; " + Math.round(r.cap) + " AU (ACWR 1,3)" : "") +
        (r.preAvg ? "; vor der Pause &Oslash; " + Math.round(r.preAvg) + " AU/Woche" : "") + ". Freigabe und Belastbarkeit mit Arzt/Physio abstimmen. " +
        "<span style='opacity:.8'>Kennzahlen: " + base + "</span>";
    }
    return base;
  }
  function recoTextBase(zone, metrics, wellnessMetrics, dir){''')

# ---------- Ampel-Karten ----------
rep('''      if (zone !== "idle" && sig.dir === "under") zoneLabel += " (Unterlastung)";''', '''      if (zone !== "idle" && sig.dir === "under" && !sig.ret) zoneLabel += " (Unterlastung)";
      if (sig.pause){ zoneLabel = (LM_ST[m.st.kind] || { l: "Pause" }).l; zAcwr = zWow = zMono = zWell = null; }   // keine Bewertung in Status-Wochen
      if (sig.ret) zoneLabel += " &middot; Wiedereinstieg";''')
rep('''      html += metricRow("ACWR", fmt1(m.acwr), zAcwr);''', '''      html += metricRow("ACWR" + (m.method === "ewma" ? " (EWMA" + (m.ewma && m.ewma.warm ? ", Einlauf" : "") + ")" : ""), fmt1(m.acwr), zAcwr);''')
rep('''  function renderDashboard(){
    var grid = document.getElementById("playerGrid");''', '''  function lmAcwrOptSync(){
    var box = document.getElementById("lmAcwrOpt");
    if (!box) return;
    box.querySelectorAll("input[name=lmAcwrM]").forEach(function(rb){
      rb.checked = rb.value === (state.acwrMethod === "ewma" ? "ewma" : "ra");
      if (!rb.__lm){ rb.__lm = true; rb.addEventListener("change", function(){ if (rb.checked){ state.acwrMethod = rb.value; save(); renderAll(); } }); }
    });
  }
  function renderDashboard(){
    lmAcwrOptSync();
    var grid = document.getElementById("playerGrid");''')

# ---------- Erfassungstabelle: Status-Knopf je Tag + Status Woche ----------
rep('''    html += "<th>Summe</th><th></th></tr></thead><tbody>";''', '''    html += "<th>Summe</th><th>Status Woche</th><th></th></tr></thead><tbody>";''')
rep('''        html += "<td><input class='loadinput mono' type='number' min='0' step='1' inputmode='numeric' " +
          "data-player='" + idx + "' data-day='" + d + "' value='" + (v===null||v===undefined?"":v) + "'></td>";''',
'''        var stc = stGet(name, addDays(state.currentWeek, d));
        html += "<td class='lm-stcell" + (stc ? " lm-st-" + stc : "") + "'><input class='loadinput mono' type='number' min='0' step='1' inputmode='numeric' " +
          "data-player='" + idx + "' data-day='" + d + "' value='" + (v===null||v===undefined?"":v) + "'" + (stIsZero(stc) ? " placeholder='0'" : "") + ">" +
          "<button type='button' class='lm-stbtn' data-stp='" + idx + "' data-std='" + d + "' title='Status: " + (stc ? LM_ST[stc].l : "keiner") + " – klicken: keiner → krank → verletzt → Reha → abwesend'>" + (stc ? LM_ST[stc].s : "+") + "</button></td>";''')
rep('''      html += "<td><button class='del-row' data-remove='" + idx + "'>entfernen</button></td></tr>";''', '''      html += "<td><select class='lm-stweek' data-stp='" + idx + "' title='Status für alle 7 Tage dieser Woche setzen'><option value=''>&ndash;</option>" +
        LM_ST_ORDER.slice(1).map(function(c){ return "<option value='" + c + "'>" + LM_ST[c].l + "</option>"; }).join("") + "<option value='clear'>Status l&ouml;schen</option></select></td>";
      html += "<td><button class='del-row' data-remove='" + idx + "'>entfernen</button></td></tr>";''')
rep('''    table.querySelectorAll("[data-remove]").forEach(function(btn){''', '''    table.querySelectorAll(".lm-stbtn").forEach(function(b){
      b.addEventListener("click", function(){
        var name = state.players[+b.getAttribute("data-stp")], dIso = addDays(state.currentWeek, +b.getAttribute("data-std"));
        var c = stGet(name, dIso);
        stSet(name, dIso, LM_ST_ORDER[(LM_ST_ORDER.indexOf(c) + 1) % LM_ST_ORDER.length]);
        lmStChanged();
      });
    });
    table.querySelectorAll(".lm-stweek").forEach(function(sel){
      sel.addEventListener("change", function(){
        var v = sel.value, name = state.players[+sel.getAttribute("data-stp")];
        if (!v) return;
        for (var i = 0; i < 7; i++) stSet(name, addDays(state.currentWeek, i), v === "clear" ? "" : v);
        lmStChanged();
      });
    });
    table.querySelectorAll("[data-remove]").forEach(function(btn){''')

# ---------- Wochensteuerung je Spielerin ----------
rep('''        if (effDir === "under") zoneLabel += " (U)";''', '''        if (effDir === "under" && !sig.ret) zoneLabel += " (U)";
        if (sig.ret) zoneLabel += " &middot; R&uuml;ckkehr";
        // Status in der Steuerungs-Woche (vorab eingetragen) oder in der Bezugswoche → keine Pfeile aus den Kennzahlen
        var tst = stWeekInfo(state.steeringWeek, name), stPaused = sig.pause || tst.days >= 3;
        if (stPaused) zoneLabel = (LM_ST[(sig.pause ? m.st.kind : tst.kind)] || { l: "Pause" }).l;''')
rep('''        sw.days.forEach(function(day){
          if (day.type !== "training"){
            dayCells += "<td class='arrows'>&ndash;</td>";
          } else {
            var av = adjustSteerLevel(day.vol, effZone, effDir);''', '''        sw.days.forEach(function(day, di){
          var dst = stGet(name, addDays(state.steeringWeek, di));
          if (dst){
            dayCells += "<td class='arrows'><span class='steer-st' style='background:" + LM_ST[dst].c + "' title='" + LM_ST[dst].l + "'>" + LM_ST[dst].s + "</span></td>";
          } else if (stPaused){
            dayCells += "<td class='arrows' title='keine Steuerung aus den Kennzahlen'>&ndash;</td>";
          } else if (day.type !== "training"){
            dayCells += "<td class='arrows'>&ndash;</td>";
          } else {
            var av = adjustSteerLevel(day.vol, effZone, effDir);''')
rep('''        var noteTxt = effZone === "r" ? (effDir === "under" ? "Unterbelastet, vorsichtig steigern" : "Belastung reduzieren")''', '''        var noteTxt = stPaused ? "Individuell (Arzt/Physio)" : sig.ret ? "Wiedereinstieg: schrittweise, nicht über Team-Plan"
          : effZone === "r" ? (effDir === "under" ? "Unterbelastet, vorsichtig steigern" : "Belastung reduzieren")''')

# ---------- Methodik & Quellen ----------
rep('''        <dt>Wochen-zu-Woche-&Auml;nderung</dt>''', '''        <dt>ACWR als EWMA (w&auml;hlbar unter &bdquo;Ampel je Spielerin&ldquo;)</dt>
        <dd>Exponentiell gewichteter gleitender Mittelwert der Tageslast: EWMA<sub>heute</sub> = &lambda; &times; Last<sub>heute</sub> + (1 &minus; &lambda;) &times; EWMA<sub>gestern</sub>, &lambda; = 2/(N+1) mit N = 7 Tagen (akut, &lambda; = 0,25) und N = 28 Tagen (chronisch, &lambda; &asymp; 0,069); ACWR = akute &divide; chronische EWMA am letzten Tag der Woche (laufende Woche: heute) (Williams et al. 2017). Murray et al. (2017) fanden das EWMA-Modell sensitiver f&uuml;r Lastspitzen als rollierende Mittelwerte. Startwert = erster erfasster Tageswert; weil der Startwert die chronische EWMA lange &uuml;berproportional beeinflusst (Wang et al. 2019), zeigt das Tool erst ab 28 Tagen Daten einen Wert und markiert unter 50 Tagen &bdquo;Einlauf&ldquo;. Tage ohne Eintrag in einer Woche mit Eintr&auml;gen z&auml;hlen als trainingsfrei (0); ganze Wochen ohne Daten und ohne Status werden &uuml;bersprungen (fehlend, nicht 0).</dd>
        <dt>Krank / verletzt / Reha / abwesend</dt>
        <dd>Status je Tag in der Wochen-Erfassung. Krank, verletzt und abwesend ohne Wert z&auml;hlen als <i>echte</i> 0 &ndash; die Spielerin hat tats&auml;chlich nicht trainiert, die chronische Last sinkt. Genau dieses &bdquo;Abebben&ldquo; der Last w&auml;hrend der Genesung erzeugt beim Wiedereinstieg den Lastsprung, den die ACWR erfassen soll (Blanch &amp; Gabbett 2016). Davon zu unterscheiden sind <i>fehlende</i> Werte (trainiert, aber nicht eingetragen): Sie als 0 zu werten, verf&auml;lscht abgeleitete Kennzahlen (Windt et al. 2018); das Tool imputiert nicht, sondern l&auml;sst ganze Wochen ohne Daten aus (zu Imputationsverfahren: Benson et al. 2021). Bei Reha z&auml;hlen nur eingetragene Werte.
          <br><b>Ab 3 Status-Tagen in einer Woche</b> keine Ampel und keine Empfehlung: Bei Krankheit entscheidet der klinische Status, nicht die Lastkennzahl. Der IOC-Konsens empfiehlt nach Atemwegsinfekten eine schrittweise, &auml;rztlich gesteuerte R&uuml;ckkehr in mehreren Schritten (Schwellnus et al. 2022); die verbreitete &bdquo;Neck-Check&ldquo;-Regel ist dort ausdr&uuml;cklich <i>nicht</i> evidenzbasiert. Unangemessenes Belastungsmanagement ist ein Risikofaktor f&uuml;r akute Erkrankungen (Schwellnus et al. 2016).
          <br><b>Wiedereinstieg</b> (nach &ge;&nbsp;5 Status-Tagen am St&uuml;ck, 3 Wochen lang): keine &bdquo;steigern&ldquo;-Empfehlung aus Unterlastung, Ampel mindestens Gelb, als Orientierung die Obergrenze f&uuml;r die n&auml;chste Woche bei ACWR&nbsp;1,3 (&asymp; 1,3 &times; chronische Wochenlast) und die &Oslash; Wochenlast der 4 Wochen vor der Pause. Blanch &amp; Gabbett (2016) empfehlen, die ACWR in die Return-to-Play-Entscheidung einzubeziehen; Stokes et al. (2020) halten nach l&auml;ngeren Trainingsunterbrechungen mindestens 3&ndash;4 Wochen progressiven Aufbau f&uuml;r n&ouml;tig. Bereits nach weniger als 4 Wochen ohne ausreichenden Trainingsreiz gehen Anpassungen zur&uuml;ck (Mujika &amp; Padilla 2000). <i>Die Schwellen 3 Tage / 5 Tage / 3 Wochen sind pragmatische Festlegungen des Tools, keine publizierten Grenzwerte.</i></dd>
        <dt>Wochen-zu-Woche-&Auml;nderung</dt>''')
rep('''        <li>Bosquet L, Montpetit J, Arvisais D, Mujika I. Effects of tapering on performance: a meta-analysis. <i>Med Sci Sports Exerc.</i> 2007;39(8):1358&ndash;1365.</li>''', '''        <li>Bosquet L, Montpetit J, Arvisais D, Mujika I. Effects of tapering on performance: a meta-analysis. <i>Med Sci Sports Exerc.</i> 2007;39(8):1358&ndash;1365.</li>
        <li>Williams S, West S, Cross MJ, Stokes KA. Better way to determine the acute:chronic workload ratio? <i>Br J Sports Med.</i> 2017;51(3):209&ndash;210.</li>
        <li>Murray NB, Gabbett TJ, Townshend AD, Blanch P. Calculating acute:chronic workload ratios using exponentially weighted moving averages provides a more sensitive indicator of injury likelihood than rolling averages. <i>Br J Sports Med.</i> 2017;51(9):749&ndash;754.</li>
        <li>Wang C, Trejo Vargas J, Stokes T, Steele R, Shrier I. The acute:chronic workload ratio: challenges and prospects for improvement. <i>arXiv</i> 1907.05326 (Preprint), 2019.</li>
        <li>Blanch P, Gabbett TJ. Has the athlete trained enough to return to play safely? The acute:chronic workload ratio permits clinicians to quantify a player&rsquo;s risk of subsequent injury. <i>Br J Sports Med.</i> 2016;50(8):471&ndash;475.</li>
        <li>Windt J, Ardern CL, Gabbett TJ, et al. Getting the most out of intensive longitudinal data: a methodological review of workload&ndash;injury studies. <i>BMJ Open.</i> 2018;8(10):e022626.</li>
        <li>Benson LC, Stilling C, Owoeye OBA, Emery CA. Evaluating methods for imputing missing data from longitudinal monitoring of athlete workload. <i>J Sports Sci Med.</i> 2021;20(2):188&ndash;196.</li>
        <li>Schwellnus M, Soligard T, Alonso JM, et al. How much is too much? (Part 2) International Olympic Committee consensus statement on load in sport and risk of illness. <i>Br J Sports Med.</i> 2016;50:1043&ndash;1052.</li>
        <li>Schwellnus M, Adami PE, Bougault V, et al. International Olympic Committee (IOC) consensus statement on acute respiratory illness in athletes part 1: acute respiratory infections. <i>Br J Sports Med.</i> 2022;56:1066&ndash;1088.</li>
        <li>Stokes KA, Jones B, Bennett M, et al. Returning to play after prolonged training restrictions in professional collision sports. <i>Int J Sports Med.</i> 2020;41(13):895&ndash;911.</li>
        <li>Mujika I, Padilla S. Detraining: loss of training-induced physiological and performance adaptations. Part I: short term insufficient training stimulus. <i>Sports Med.</i> 2000;30(2):79&ndash;87.</li>''')
