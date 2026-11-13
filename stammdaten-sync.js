// ============================================================
// Gemeinsamer Baustein: Stammdaten der Athletenverwaltung (Supabase-Tabelle athletes) mit einem Test-Tool abgleichen.
// Die Athletenverwaltung ist die eine Quelle: Name, Vorname, Geburtsdatum, Geschlecht, Position, Größe, Gewicht,
// Ruhe- und Maximalpuls. Jedes Tool meldet über einen Adapter, welche seiner Athlet:innen-Objekte welche Felder führen.
//
//   StammdatenSync.attach({
//     list: function(){ return [{ a: obj, fields: { first_name:'master', weight_kg:'fill', … } }, …]; },
//     read: function(a){ return { first_name, last_name, birthdate, gender, position, height_cm, weight_kg, hr_rest, hr_max }; },
//     write: function(a, patch){ … Werte ins Tool-Objekt übernehmen … },
//     persist: function(){ … speichern + neu zeichnen … },
//     anchor: "idEinesElements"   // Statuszeile wird davor eingefügt
//   });
//
// Feld-Regeln: 'master' = Wert aus der Athletenverwaltung gilt immer (überschreibt das Tool),
//              'fill'   = nur leere Tool-Felder werden gefüllt (z. B. Messwerte eines Testtags).
// In beiden Fällen gilt: Wird im Tool ein Wert geändert, wird er in die Athletenverwaltung zurückgeschrieben,
// und fehlt dort ein Wert, den das Tool kennt, wird er dort ergänzt.
// Zuordnung: gespeicherte mgmtId, sonst eindeutiger Namensabgleich (Wortmenge aus Vor- + Nachname, ohne Akzente),
// damit z. B. „Laura Barroso / Perez“ und „Laura / Barroso Perez“ dieselbe Person sind.
// Braucht window.appSb (setzt der Login-Schutz der Trainings-App).
// ============================================================
(function () {
  var FIELDS = ["first_name", "last_name", "birthdate", "gender", "position", "height_cm", "weight_kg", "hr_rest", "hr_max", "vift_kmh", "vift_date"];
  var LABEL = { first_name: "Vorname", last_name: "Nachname", birthdate: "Geburtsdatum", gender: "Geschlecht", position: "Position",
    height_cm: "Größe", weight_kg: "Gewicht", hr_rest: "Ruhepuls", hr_max: "Maxpuls" };
  var NUM = { height_cm: 1, weight_kg: 1, hr_rest: 1, hr_max: 1, vift_kmh: 1 };

  var cfg = null, master = [], byId = {}, snap = new WeakMap(), busy = false, again = false, timer = null, lastInfo = null;

  function sb() { return window.appSb || null; }
  function empty(v) { return v === null || v === undefined || v === ""; }
  function norm(v, k) {
    if (empty(v)) return null;
    if (NUM[k]) {
      var n = parseFloat(String(v).replace(",", "."));
      if (isNaN(n)) return null;
      if (k === "hr_rest" || k === "hr_max") n = Math.round(n);
      if (k === "vift_kmh") { n = Math.round(n * 10) / 10; if (n < 8 || n > 30) return null; }
      // Grenzen wie in der Datenbank (sonst lehnt sie die ganze Änderung ab)
      if ((k === "hr_max" && (n < 120 || n > 240)) || (k === "hr_rest" && (n < 30 || n > 120))) return null;
      return n;
    }
    return String(v).trim();
  }
  function same(x, y, k) { return norm(x, k) === norm(y, k); }
  function nameKey(first, last) {
    return ((first || "") + " " + (last || "")).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9ß ]+/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
  }

  function load() {
    return sb().from("athletes").select("id,first_name,last_name,birthdate,gender,position,height_cm,weight_kg,hr_rest,hr_max,vift_kmh,vift_date")
      .then(function (r) {
        if (r.error) {
          // Spalten noch nicht angelegt (Migration fehlt) → mit den Grundfeldern weiterarbeiten
          return sb().from("athletes").select("id,first_name,last_name,birthdate,gender,position").then(function (r2) {
            if (r2.error) throw r2.error;
            return r2.data;
          });
        }
        return r.data;
      })
      .then(function (rows) {
        master = rows || []; byId = {};
        master.forEach(function (m) { byId[m.id] = m; });
      });
  }

  function findMaster(a, vals) {
    if (a.mgmtId && byId[a.mgmtId]) return byId[a.mgmtId];
    var k = nameKey(vals.first_name, vals.last_name);
    if (!k) return null;
    var hits = master.filter(function (m) { return nameKey(m.first_name, m.last_name) === k; });
    return hits.length === 1 ? hits[0] : null;
  }

  // Ein Abgleich: lokale Änderungen hochschreiben, dann Athletenverwaltung ins Tool übernehmen
  function sync() {
    if (!cfg || !sb()) return Promise.resolve();
    if (busy) { again = true; return Promise.resolve(); }
    busy = true;
    var entries = cfg.list(), ups = {}, changedLocal = false, unmatched = [], matched = 0;
    entries.forEach(function (e) {
      var vals = cfg.read(e.a) || {};
      var m = findMaster(e.a, vals);
      if (!m) { var nm = ((vals.first_name || "") + " " + (vals.last_name || "")).trim(); if (nm) unmatched.push({ e: e, vals: vals, name: nm }); return; }
      matched++;
      if (e.a.mgmtId !== m.id) { e.a.mgmtId = m.id; changedLocal = true; }
      var prev = snap.get(e.a) || {};
      Object.keys(e.fields).forEach(function (k) {
        if (FIELDS.indexOf(k) === -1 || !(k in m)) return;
        var lv = vals[k];
        // im Tool geändert seit dem letzten Abgleich → in die Athletenverwaltung
        if (e.fields[k] === "up") {
          if (!empty(lv) && !same(m[k], lv, k) && (!e.upOk || e.upOk(m, vals))) { (ups[m.id] = ups[m.id] || {})[k] = norm(lv, k); }
          return;
        }
        var editedHere = (k in prev) && !same(prev[k], lv, k) && !empty(lv);
        if (editedHere || (empty(m[k]) && !empty(lv))) {
          if (!same(m[k], lv, k)) { (ups[m.id] = ups[m.id] || {})[k] = norm(lv, k); }
        }
      });
    });
    var ids = Object.keys(ups);
    var pushes = ids.map(function (id) {
      return sb().from("athletes").update(ups[id]).eq("id", id).then(function (r) {
        if (r.error) throw r.error;
        Object.assign(byId[id], ups[id]);
      });
    });
    return Promise.all(pushes).then(function () {
      // Athletenverwaltung → Tool
      entries.forEach(function (e) {
        var m = e.a.mgmtId && byId[e.a.mgmtId];
        if (!m) return;
        var vals = cfg.read(e.a) || {}, patch = {};
        Object.keys(e.fields).forEach(function (k) {
          if (!(k in m) || empty(m[k])) return;
          var rule = e.fields[k];
          if (rule === "master" && !same(vals[k], m[k], k)) patch[k] = m[k];
          if (rule === "fill" && empty(vals[k])) patch[k] = m[k];
        });
        if (Object.keys(patch).length) {
          cfg.write(e.a, patch);
          // nur als geändert zählen, wenn das Tool den Wert wirklich übernommen hat (z. B. Position nur aus seiner Liste)
          var after = cfg.read(e.a) || {};
          if (Object.keys(patch).some(function (k) { return !same(vals[k], after[k], k); })) changedLocal = true;
        }
        snap.set(e.a, cfg.read(e.a) || {});
      });
      if (changedLocal) cfg.persist();
      lastInfo = { matched: matched, unmatched: unmatched, pushed: ids.length };
      status();
    }).catch(function (err) {
      lastInfo = { error: err.message || String(err) };
      status();
    }).then(function () {
      busy = false;
      if (again) { again = false; return sync(); }
    });
  }

  function status() {
    if (!cfg) return;
    var el = document.getElementById("sdSyncBar");
    if (!el) {
      el = document.createElement("div");
      el.id = "sdSyncBar";
      el.className = "no-print";
      el.style.cssText = "font:13px/1.4 -apple-system,'Segoe UI',Roboto,sans-serif;background:#eef6ff;border:1px solid #a1d7ff;color:#00113d;border-radius:10px;padding:8px 12px;margin:10px 0;display:flex;flex-wrap:wrap;gap:8px;align-items:center;";
      var anchor = cfg.anchor && document.getElementById(cfg.anchor);
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(el, anchor);
      else document.body.insertBefore(el, document.body.firstChild);
    }
    var i = lastInfo || {};
    if (i.error) { el.innerHTML = "&#9888;&#65039; Stammdaten-Abgleich nicht möglich: " + esc(i.error); return; }
    var html = "&#128279; <b>Stammdaten</b> aus der Athletenverwaltung: " + i.matched + " abgeglichen" +
      (i.pushed ? " &middot; " + i.pushed + " dort aktualisiert" : "");
    if (i.unmatched && i.unmatched.length) {
      html += " &middot; <span style='color:#a63a2c;'>" + i.unmatched.length + " nicht in der Athletenverwaltung</span>" +
        " <button type='button' id='sdShow' style='font:inherit;border:1px solid #a1d7ff;background:#fff;border-radius:6px;padding:2px 8px;cursor:pointer;'>anzeigen / anlegen</button>";
    }
    el.innerHTML = html;
    var b = document.getElementById("sdShow");
    if (b) b.onclick = createMissing;
  }

  function createMissing() {
    var list = (lastInfo && lastInfo.unmatched) || [];
    var seen = {}, rows = [];
    list.forEach(function (u) { var k = nameKey(u.vals.first_name, u.vals.last_name); if (!seen[k]) { seen[k] = 1; rows.push(u); } });
    if (!rows.length) return;
    var msg = "Diese Personen gibt es in der Athletenverwaltung noch nicht:\n\n" + rows.map(function (u) { return "• " + u.name; }).join("\n") +
      "\n\nJetzt dort anlegen (mit den Stammdaten aus diesem Tool)?\n\nTipp: Ist eine Person nur anders geschrieben, lieber hier im Tool den Namen korrigieren – dann wird sie automatisch zugeordnet.";
    if (!confirm(msg)) return;
    var recs = rows.map(function (u) {
      var r = {};
      FIELDS.forEach(function (k) { if (!empty(u.vals[k])) r[k] = norm(u.vals[k], k); });
      r.first_name = r.first_name || ""; r.last_name = r.last_name || "";
      return r;
    });
    sb().from("athletes").insert(recs).then(function (r) {
      if (r.error) { alert("Fehler: " + r.error.message); return; }
      return load().then(sync);
    });
  }

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function schedule() { clearTimeout(timer); timer = setTimeout(sync, 700); }

  window.StammdatenSync = {
    attach: function (c) {
      cfg = c;
      if (!sb()) return;
      load().then(sync).catch(function (e) { lastInfo = { error: e.message || String(e) }; status(); });
      // Änderungen im Tool (Feld verlassen / Auswahl geändert) → abgleichen
      // (Klicks: z. B. Athlet:innen aus der Athletenverwaltung hinzugefügt oder neuer Test angelegt)
      ["change", "click"].forEach(function (type) {
        document.addEventListener(type, function (ev) {
          if (ev.target && ev.target.closest && ev.target.closest("#sdSyncBar")) return;
          if (type === "click" && !(ev.target && ev.target.closest && ev.target.closest("button"))) return;
          schedule();
        });
      });
      // zurück in den Tab → frisch aus der Athletenverwaltung laden
      document.addEventListener("visibilitychange", function () { if (!document.hidden) load().then(sync).catch(function () {}); });
    },
    resync: function () { return load().then(sync); },
    labels: LABEL
  };
})();
