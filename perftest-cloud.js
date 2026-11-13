// ================= Performance-Test: Cloud-Speicherung (2026-11-13) =================
// Jeder Test liegt zusätzlich in Supabase (Tabelle perf_tests, ein Datensatz je Test) → PC, iPad und Handy sehen dieselben Daten.
// Jede Eingabe wird sofort lokal und ~1 s später in der Cloud gespeichert. Abgleich feldweise: jede geänderte Zelle
// bekommt einen Zeitstempel (t._fts), beim Zusammenführen gewinnt der neuere Wert – so können mehrere Geräte
// gleichzeitig in denselben Test eintragen. Gelöschte Spielerinnen (t._del) und Tests (db._deletedTests) werden mit
// Zeitstempel vermerkt, damit sie auch auf den anderen Geräten verschwinden. Andere Geräte holen Änderungen alle 15 s.
// Wird nach dem Hauptskript von test-performance.html geladen (nutzt db, state, save, getTest, render…-Funktionen).
(function(){
  var sb = window.appSb;
  if(!sb) return;
  function nk(s){ return String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().split(/[^a-z0-9ß]+/).filter(Boolean).sort().join("_"); }
  // stabile Kennung je Spielerin innerhalb eines Tests (auf allen Geräten gleich, auch für Altdaten ohne Kennung)
  function akey(a){
    if(!a._id) a._id = a.mgmtId ? "m:" + a.mgmtId : "n:" + nk(((a.vorname||"") + " " + (a.nachname||"")).trim() || a.name);
    return a._id;
  }
  var TSKIP = { athletes:1, _fts:1, _del:1, id:1 };
  function flat(t){
    var f = {};
    Object.keys(t).forEach(function(k){ if(!TSKIP[k]) f["t." + k] = JSON.stringify(t[k] === undefined ? null : t[k]); });
    (t.athletes || []).forEach(function(a, i){
      var id = akey(a);
      f["o." + id] = String(i);   // Zugehörigkeit + Reihenfolge
      Object.keys(a).forEach(function(k){ if(k !== "_id") f["a." + id + "." + k] = JSON.stringify(a[k] === undefined ? null : a[k]); });
    });
    return f;
  }
  function empty(v){ return v == null || v === "null" || v === '""' || v === "[]" || v === "{}"; }
  function maxTs(t){ var m = 0; Object.keys((t && t._fts) || {}).forEach(function(k){ if(t._fts[k] > m) m = t._fts[k]; }); return m; }
  // inhaltlicher Vergleich unabhängig von Schlüssel- und Spielerinnen-Reihenfolge (sonst schaukeln sich Geräte gegenseitig hoch)
  function canon(t){
    var f = flat(t), out = [];
    Object.keys(f).sort().forEach(function(p){ out.push(p + "=" + (p.indexOf("o.") === 0 ? "1" : f[p])); });
    var ts = t._fts || {}, dl = t._del || {};
    Object.keys(ts).sort().forEach(function(p){ out.push("@" + p + "=" + ts[p]); });
    Object.keys(dl).sort().forEach(function(p){ out.push("x" + p + "=" + dl[p]); });
    return out.join("\n");
  }
  // leerer Standard-Test (frisches Gerät ohne eigene Daten): nicht hochladen, verschwindet, sobald die Cloud Tests liefert
  var NAMEF = { vorname:1, nachname:1, name:1, geburtsdatum:1, position:1, polar:1, mgmtId:1 };
  function isBlank(t){
    if(maxTs(t) || (t.meta && (t.meta.date || t.meta.title || t.meta.ort))) return false;
    return (t.athletes || []).every(function(a){
      return Object.keys(a).every(function(k){ return NAMEF[k] || k.charAt(0) === "_" || empty(JSON.stringify(a[k] === undefined ? null : a[k])); });
    });
  }
  function replaceInPlace(target, src){
    Object.keys(target).forEach(function(k){ delete target[k]; });
    Object.assign(target, src);
  }

  // ---- lokale Änderungen mit Zeitstempel versehen ----
  var snap = {};          // Test-ID -> flat() beim letzten Speichern
  var dirty = {};         // Test-IDs, die hochgeladen werden müssen
  if(!db._deletedTests) db._deletedTests = {};
  function stamp(){
    var now = Date.now(), seen = {};
    db.tests.forEach(function(t){
      seen[t.id] = 1;
      if(!t._fts) t._fts = {};
      if(!t._del) t._del = {};
      var cur = flat(t), old = snap[t.id] || {}, changed = !snap[t.id];   // neu angelegter Test: alles stempeln
      Object.keys(cur).forEach(function(p){
        if(old[p] === cur[p]) return;
        if(p.indexOf("o.") === 0){ if(p in old) return; delete t._del[p.slice(2)]; }   // nur Neuaufnahme zählt, nicht Umsortieren
        t._fts[p] = now; changed = true;
      });
      Object.keys(old).forEach(function(p){
        if(p.indexOf("o.") === 0 && !(p in cur)){ t._del[p.slice(2)] = now; changed = true; }   // Spielerin entfernt
      });
      if(changed) dirty[t.id] = 1;
      snap[t.id] = cur;
    });
    Object.keys(snap).forEach(function(id){
      if(!seen[id]){ db._deletedTests[id] = now; dirty[id] = 1; delete snap[id]; }   // Test gelöscht
    });
  }

  // ---- zwei Fassungen eines Tests zusammenführen (feldweise, neuerer Zeitstempel gewinnt) ----
  function mergeTest(L, R){
    var lf = flat(L), rf = flat(R), lt = L._fts || {}, rt = R._fts || {};
    var out = { id: L.id, _fts: {}, _del: {}, athletes: [] };
    var del = {};
    [L._del || {}, R._del || {}].forEach(function(d){ Object.keys(d).forEach(function(k){ if(!del[k] || d[k] > del[k]) del[k] = d[k]; }); });
    var paths = {}; Object.keys(lf).concat(Object.keys(rf)).forEach(function(p){ paths[p] = 1; });
    var val = {};
    Object.keys(paths).forEach(function(p){
      var a = lf[p], b = rf[p], ta = lt[p] || 0, tb = rt[p] || 0, v;
      if(!(p in rf)) v = a; else if(!(p in lf)) v = b;
      else if(ta !== tb) v = ta > tb ? a : b;
      else v = empty(a) ? b : a;          // gleich alt (z. B. Altdaten ohne Zeitstempel): nicht-leerer Wert, sonst lokal
      val[p] = v;
      var ts = Math.max(ta, tb); if(ts) out._fts[p] = ts;
    });
    Object.keys(val).forEach(function(p){ if(p.indexOf("t.") === 0) out[p.slice(2)] = JSON.parse(val[p]); });
    // Spielerinnen: lokale Reihenfolge, dann neue aus der Cloud
    var ids = [];
    (L.athletes || []).forEach(function(a){ ids.push(akey(a)); });
    (R.athletes || []).forEach(function(a){ var k = akey(a); if(ids.indexOf(k) === -1) ids.push(k); });
    ids.forEach(function(id){
      var last = 0;
      Object.keys(out._fts).forEach(function(p){ if((p === "o." + id || p.indexOf("a." + id + ".") === 0) && out._fts[p] > last) last = out._fts[p]; });
      if(del[id] && del[id] >= last){ out._del[id] = del[id]; return; }   // gelöscht und danach nicht mehr bearbeitet
      var a = { _id: id };
      Object.keys(val).forEach(function(p){ if(p.indexOf("a." + id + ".") === 0) a[p.slice(id.length + 3)] = JSON.parse(val[p]); });
      out.athletes.push(a);
    });
    Object.keys(del).forEach(function(k){ if(ids.indexOf(k) === -1) out._del[k] = del[k]; });
    return out;
  }

  // ---- Statusanzeige ----
  function setStatus(txt, warn){
    var el = document.getElementById("pcStatus");
    if(!el){
      el = document.createElement("span"); el.id = "pcStatus"; el.className = "no-print";
      el.style.cssText = "font:12px/1.3 -apple-system,'Segoe UI',Roboto,sans-serif;margin-left:10px;padding:4px 10px;border-radius:99px;align-self:center;";
      var anchor = document.getElementById("deleteTestBtn");
      if(anchor && anchor.parentNode) anchor.parentNode.appendChild(el); else document.body.insertBefore(el, document.body.firstChild);
    }
    el.textContent = txt;
    el.style.background = warn ? "#fdecea" : "#e8f5ee"; el.style.color = warn ? "#a63a2c" : "#2f6e4f";
  }
  function hhmm(){ var d = new Date(); return ("0"+d.getHours()).slice(-2) + ":" + ("0"+d.getMinutes()).slice(-2); }
  function failMsg(e){ return "⚠️ nur auf diesem Gerät gespeichert – Cloud nicht erreichbar (" + ((e && e.message) || e) + ")"; }

  // ---- Cloud-Zeilen einmischen ----
  var lastFetch = null, timer = null, pushing = false, pendingRender = false;
  function applyRows(rows){
    var changed = false;
    rows.forEach(function(r){
      if(r.updated_at && (!lastFetch || r.updated_at > lastFetch)) lastFetch = r.updated_at;
      var i = -1; db.tests.forEach(function(t, j){ if(t.id === r.id) i = j; });
      if(r.deleted){
        var dts = (r.data && r.data._deletedAt) || 0;
        db._deletedTests[r.id] = Math.max(db._deletedTests[r.id] || 0, dts);
        if(i !== -1 && dts >= maxTs(db.tests[i]) && db.tests.length > 1){ db.tests.splice(i, 1); delete snap[r.id]; changed = true; }
        return;
      }
      if(db._deletedTests[r.id] && db._deletedTests[r.id] >= maxTs(r.data)) return;   // auf diesem Gerät gelöscht
      if(i === -1){ db.tests.push(r.data); snap[r.id] = flat(r.data); changed = true; return; }
      var before = canon(db.tests[i]);
      var m = mergeTest(db.tests[i], r.data);
      if(canon(m) !== before){
        replaceInPlace(db.tests[i], m);        // gleiches Objekt behalten (state zeigt darauf)
        snap[r.id] = flat(db.tests[i]); changed = true;
      }
      if(canon(db.tests[i]) !== canon(r.data)) dirty[r.id] = 1;   // lokal gibt es Neueres → hochladen
    });
    return changed;
  }

  function rerender(){
    // nicht mitten in einer Eingabe neu zeichnen – nach Verlassen des Feldes nachholen
    var ae = document.activeElement;
    if(ae && ae.closest && ae.closest("table.perf, .pt-modal") && /INPUT|SELECT|TEXTAREA/.test(ae.tagName)){ pendingRender = true; return; }
    pendingRender = false;
    if(!getTest(db.currentId)) db.currentId = db.tests[0].id;
    state = getTest(db.currentId);
    if(!Array.isArray(state.hiddenCols)) state.hiddenCols = [];
    if(!state.meta) state.meta = { date:"", tester:"", ort:"", wetter:"" };
    origSave();
    applyLayout(); renderTestSelector(); syncMeta(); renderGroupToggles(); renderTable();
  }
  document.addEventListener("focusout", function(){ if(pendingRender) setTimeout(function(){ if(pendingRender) rerender(); }, 300); });

  function pull(full){
    var q = sb.from("perf_tests").select("id,data,deleted,updated_at");
    if(!full && lastFetch) q = q.gt("updated_at", lastFetch);
    return q.then(function(r){
      if(r.error) throw r.error;
      if(applyRows(r.data || [])) rerender();
      if(Object.keys(dirty).length) schedule();
    });
  }
  function push(){
    if(pushing){ schedule(); return Promise.resolve(); }
    var ids = Object.keys(dirty);
    if(!ids.length){ setStatus("☁️ gespeichert " + hhmm()); return Promise.resolve(); }
    pushing = true; dirty = {};
    setStatus("☁️ speichert …");
    // vor dem Schreiben den Cloud-Stand dieser Tests holen und einmischen (Eingaben anderer Geräte)
    return sb.from("perf_tests").select("id,data,deleted,updated_at").in("id", ids).then(function(r){
      if(r.error) throw r.error;
      if(applyRows(r.data || [])) rerender();
      dirty = {};
      var rows = ids.map(function(id){
        var t = getTest(id);
        if(t) return { id: id, data: t, deleted: false };
        if(db._deletedTests[id]) return { id: id, data: { _deletedAt: db._deletedTests[id] }, deleted: true };
        return null;
      }).filter(Boolean);
      return rows.length ? sb.from("perf_tests").upsert(rows) : { error: null };
    }).then(function(r){
      if(r && r.error) throw r.error;
      origSave();
      setStatus("☁️ gespeichert " + hhmm());
    }).catch(function(e){
      ids.forEach(function(id){ dirty[id] = 1; });
      setStatus(failMsg(e), true);
    }).then(function(){ pushing = false; if(Object.keys(dirty).length) schedule(); });
  }
  function schedule(){ clearTimeout(timer); timer = setTimeout(push, 1000); }

  // save() erweitern: lokal speichern (wie bisher) + Änderungen stempeln + Cloud
  var origSave = save;
  save = function(){
    stamp();
    origSave();
    if(Object.keys(dirty).length){ setStatus("☁️ speichert …"); schedule(); }
  };

  // Start: lokale Fassung als Ausgangsstand, Cloud holen, zusammenführen, Neueres + bisher nur lokal Gespeichertes hochladen
  db.tests.forEach(function(t){ if(!t._fts) t._fts = {}; if(!t._del) t._del = {}; snap[t.id] = flat(t); });
  setStatus("☁️ verbinde …");
  sb.from("perf_tests").select("id,data,deleted,updated_at").then(function(r){
    if(r.error) throw r.error;
    var have = {}; (r.data || []).forEach(function(x){ have[x.id] = 1; });
    var changed = applyRows(r.data || []);
    if((r.data || []).some(function(x){ return !x.deleted; })){
      var keep = db.tests.filter(function(t){ return have[t.id] || !isBlank(t); });
      if(keep.length && keep.length !== db.tests.length){
        db.tests.filter(function(t){ return keep.indexOf(t) === -1; }).forEach(function(t){ delete snap[t.id]; });
        db.tests = keep; changed = true;
      }
    }
    if(changed) rerender();
    db.tests.forEach(function(t){ if(!have[t.id] && !db._deletedTests[t.id] && !isBlank(t)) dirty[t.id] = 1; });
    return push();
  }).catch(function(e){ setStatus(failMsg(e), true); });
  setInterval(function(){ if(!document.hidden && !pushing) pull(false).catch(function(){}); }, 15000);
  document.addEventListener("visibilitychange", function(){ if(!document.hidden) pull(false).catch(function(){}); else if(Object.keys(dirty).length) push(); });

  window.PerfCloud = { _merge: mergeTest, _flat: flat, push: push, pull: pull };
})();
