// ============================================================
// Gemeinsamer Baustein: Daten eines Test-Tools geräteübergreifend in der Cloud halten (Tabelle tool_records).
// Das Tool speichert weiter wie gewohnt lokal; dieser Baustein hängt sich an dessen Speichern-Funktion,
// merkt sich je Feld, wann es zuletzt geändert wurde, lädt Änderungen ~1 s später hoch und holt alle 15 s
// die Änderungen der anderen Geräte. Beim Zusammenführen gewinnt je Feld der neuere Wert, so können
// mehrere Geräte gleichzeitig eintragen. Gelöschte Datensätze/Unterpunkte werden mit Zeitstempel vermerkt.
//
//   CloudStore.attach({
//     tool: "ift",
//     state: function(){ return state; },                     // Objekt mit den Sammlungen
//     collections: { athletes:{}, sessions:{ sub:{ results:"athleteId" } }, teams:{} },
//     saveLocal: function(){ … bisheriges Speichern … },     // wird umhüllt
//     wrap: function(fn){ saveState = fn; },                   // neue Speichern-Funktion einsetzen
//     render: function(){ renderAll(); },
//     canRender: function(){ return !timerState; },           // z. B. nicht während eines laufenden Tests
//     isBlank: function(kind, rec, state){ … },                // leere Standard-Datensätze nicht hochladen
//     anchor: "idEinesElements"
//   });
// Jeder Datensatz braucht ein Feld "id". Unterlisten (sub) werden je Eintrag über den angegebenen Schlüssel abgeglichen.
// ============================================================
(function () {
  function empty(v) { return v == null || v === "null" || v === '""' || v === "[]" || v === "{}"; }
  function J(v) { return JSON.stringify(v === undefined ? null : v); }

  window.CloudStore = {
    attach: function (cfg) {
      var sb = window.appSb;
      if (!sb) return;
      var META_KEY = "cloudstore_meta_" + cfg.tool;
      var meta = {};
      try { meta = JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (e) {}
      meta.fts = meta.fts || {}; meta.sdel = meta.sdel || {}; meta.del = meta.del || {};
      function saveMeta() { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) {} }

      var S = cfg.state, kinds = Object.keys(cfg.collections);
      function records() {
        var out = {}, st = S();
        kinds.forEach(function (k) { (st[k] || []).forEach(function (r) { if (r && r.id != null) out[k + ":" + r.id] = { kind: k, rec: r }; }); });
        return out;
      }
      function flat(kind, r) {
        var f = {}, sub = cfg.collections[kind].sub || {};
        Object.keys(r).forEach(function (k) {
          if (k === "id") return;
          if (sub[k] && Array.isArray(r[k])) {
            f["l." + k] = "1";
            r[k].forEach(function (it) { if (it && it[sub[k]] != null) f["s." + k + "." + it[sub[k]]] = J(it); });
          } else f["f." + k] = J(r[k]);
        });
        return f;
      }
      function maxTs(rid) { var m = 0, t = meta.fts[rid] || {}; Object.keys(t).forEach(function (p) { if (t[p] > m) m = t[p]; }); return m; }
      function maxTsOf(fts) { var m = 0; Object.keys(fts || {}).forEach(function (p) { if (fts[p] > m) m = fts[p]; }); return m; }

      // ---- lokale Änderungen stempeln ----
      var snap = {}, dirty = {};
      function stamp() {
        var now = Date.now(), cur = records();
        Object.keys(cur).forEach(function (rid) {
          var f = flat(cur[rid].kind, cur[rid].rec), old = snap[rid], ts = meta.fts[rid] = meta.fts[rid] || {}, changed = !old;
          old = old || {};
          Object.keys(f).forEach(function (p) {
            if (old[p] === f[p]) return;
            ts[p] = now; changed = true;
            if (p.indexOf("s.") === 0 && meta.sdel[rid]) delete meta.sdel[rid][p];
          });
          Object.keys(old).forEach(function (p) {
            if (p.indexOf("s.") === 0 && !(p in f)) { (meta.sdel[rid] = meta.sdel[rid] || {})[p] = now; changed = true; }
          });
          if (changed) { dirty[rid] = 1; delete meta.del[rid]; }
          snap[rid] = f;
        });
        Object.keys(snap).forEach(function (rid) {
          if (!cur[rid]) { meta.del[rid] = now; dirty[rid] = 1; delete snap[rid]; }
        });
        saveMeta();
      }

      // ---- Datensatz zusammenführen (je Feld gewinnt der neuere Zeitstempel) ----
      function merge(kind, L, Lfts, Lsdel, R, Rfts, Rsdel) {
        var lf = flat(kind, L), rf = flat(kind, R), fts = {}, sdel = {}, val = {};
        [Lsdel || {}, Rsdel || {}].forEach(function (d) { Object.keys(d).forEach(function (p) { if (!sdel[p] || d[p] > sdel[p]) sdel[p] = d[p]; }); });
        var paths = {}; Object.keys(lf).concat(Object.keys(rf)).forEach(function (p) { paths[p] = 1; });
        Object.keys(paths).forEach(function (p) {
          var a = lf[p], b = rf[p], ta = (Lfts || {})[p] || 0, tb = (Rfts || {})[p] || 0, v;
          if (!(p in rf)) v = a; else if (!(p in lf)) v = b;
          else if (ta !== tb) v = ta > tb ? a : b;
          else v = empty(a) ? b : a;
          var t = Math.max(ta, tb);
          if (p.indexOf("s.") === 0 && sdel[p] && sdel[p] >= t) return;   // Unterpunkt gelöscht
          val[p] = v; if (t) fts[p] = t;
        });
        var out = { id: L.id }, sub = cfg.collections[kind].sub || {};
        Object.keys(val).forEach(function (p) {
          if (p.indexOf("f.") === 0) out[p.slice(2)] = JSON.parse(val[p]);
          else if (p.indexOf("l.") === 0) out[p.slice(2)] = [];
        });
        // Unterlisten: lokale Reihenfolge, dann neue
        Object.keys(sub).forEach(function (k) {
          if (!out[k]) return;
          var order = [];
          (L[k] || []).concat(R[k] || []).forEach(function (it) { var key = it && it[sub[k]]; if (key != null && order.indexOf(String(key)) === -1) order.push(String(key)); });
          order.forEach(function (key) { var p = "s." + k + "." + key; if (p in val) out[k].push(JSON.parse(val[p])); });
        });
        return { rec: out, fts: fts, sdel: sdel };
      }
      function canon(kind, rec, fts, sdel) {
        var f = flat(kind, rec), o = [];
        Object.keys(f).sort().forEach(function (p) { o.push(p + "=" + f[p]); });
        Object.keys(fts || {}).sort().forEach(function (p) { o.push("@" + p + "=" + fts[p]); });
        Object.keys(sdel || {}).sort().forEach(function (p) { o.push("x" + p + "=" + sdel[p]); });
        return o.join("\n");
      }
      function replaceInPlace(t, s) { Object.keys(t).forEach(function (k) { delete t[k]; }); Object.assign(t, s); }

      // ---- Status ----
      function setStatus(txt, warn) {
        var el = document.getElementById("csStatus");
        if (!el) {
          el = document.createElement("span"); el.id = "csStatus"; el.className = "no-print";
          el.style.cssText = "font:12px/1.3 -apple-system,'Segoe UI',Roboto,sans-serif;margin-left:10px;padding:4px 10px;border-radius:99px;display:inline-block;";
          var a = cfg.anchor && document.getElementById(cfg.anchor);
          if (a && a.parentNode) a.parentNode.appendChild(el); else document.body.insertBefore(el, document.body.firstChild);
        }
        el.textContent = txt;
        el.style.background = warn ? "#fdecea" : "#e8f5ee"; el.style.color = warn ? "#a63a2c" : "#2f6e4f";
      }
      function hhmm() { var d = new Date(); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }
      function failMsg(e) { return "⚠️ nur auf diesem Gerät gespeichert – Cloud nicht erreichbar (" + ((e && e.message) || e) + ")"; }

      // ---- Cloud-Zeilen einmischen ----
      var lastFetch = null, timer = null, pushing = false, pendingRender = false;
      function applyRows(rows) {
        var changed = false, cur = records(), st = S();
        rows.forEach(function (row) {
          if (row.updated_at && (!lastFetch || row.updated_at > lastFetch)) lastFetch = row.updated_at;
          var rid = row.rid, kind = rid.slice(0, rid.indexOf(":"));
          if (!cfg.collections[kind]) return;
          var d = row.data || {}, local = cur[rid];
          if (row.deleted) {
            var dts = d.deletedAt || 0;
            meta.del[rid] = Math.max(meta.del[rid] || 0, dts);
            if (local && dts >= maxTs(rid)) {
              st[kind] = st[kind].filter(function (r) { return r !== local.rec; });
              delete snap[rid]; delete meta.fts[rid]; changed = true;
            }
            return;
          }
          if (meta.del[rid] && meta.del[rid] >= maxTsOf(d.fts)) { dirty[rid] = 1; return; }   // hier gelöscht → Löschung hochladen
          if (!local) {
            st[kind] = (st[kind] || []).concat([d.rec]);
            meta.fts[rid] = d.fts || {}; if (d.sdel) meta.sdel[rid] = d.sdel;
            snap[rid] = flat(kind, d.rec); changed = true; return;
          }
          var before = canon(kind, local.rec, meta.fts[rid], meta.sdel[rid]);
          var m = merge(kind, local.rec, meta.fts[rid], meta.sdel[rid], d.rec, d.fts, d.sdel);
          if (canon(kind, m.rec, m.fts, m.sdel) !== before) {
            replaceInPlace(local.rec, m.rec); meta.fts[rid] = m.fts; meta.sdel[rid] = m.sdel;
            snap[rid] = flat(kind, local.rec); changed = true;
          }
          if (canon(kind, local.rec, meta.fts[rid], meta.sdel[rid]) !== canon(kind, d.rec, d.fts, d.sdel)) dirty[rid] = 1;
        });
        saveMeta();
        return changed;
      }
      function rerender() {
        var ae = document.activeElement;
        var typing = ae && /INPUT|SELECT|TEXTAREA/.test(ae.tagName) && ae.type !== "button";
        if (typing || (cfg.canRender && !cfg.canRender())) { pendingRender = true; return; }
        pendingRender = false;
        origSave();
        cfg.render();
      }
      document.addEventListener("focusout", function () { if (pendingRender) setTimeout(function () { if (pendingRender) rerender(); }, 300); });
      setInterval(function () { if (pendingRender) rerender(); }, 3000);

      function rowsFor(rids) {
        var cur = records();
        return rids.map(function (rid) {
          if (cur[rid]) return { tool: cfg.tool, rid: rid, deleted: false, data: { rec: cur[rid].rec, fts: meta.fts[rid] || {}, sdel: meta.sdel[rid] || {} } };
          if (meta.del[rid]) return { tool: cfg.tool, rid: rid, deleted: true, data: { deletedAt: meta.del[rid] } };
          return null;
        }).filter(Boolean);
      }
      function pull(full) {
        var q = sb.from("tool_records").select("rid,data,deleted,updated_at").eq("tool", cfg.tool);
        if (!full && lastFetch) q = q.gt("updated_at", lastFetch);
        return q.then(function (r) {
          if (r.error) throw r.error;
          if (applyRows(r.data || [])) rerender();
          if (Object.keys(dirty).length) schedule();
          return r.data || [];
        });
      }
      function push() {
        if (pushing) { schedule(); return Promise.resolve(); }
        var rids = Object.keys(dirty);
        if (!rids.length) { setStatus("☁️ gespeichert " + hhmm()); return Promise.resolve(); }
        pushing = true; dirty = {};
        setStatus("☁️ speichert …");
        var chunks = []; for (var i = 0; i < rids.length; i += 80) chunks.push(rids.slice(i, i + 80));
        return chunks.reduce(function (p, ch) {
          return p.then(function () {
            return sb.from("tool_records").select("rid,data,deleted,updated_at").eq("tool", cfg.tool).in("rid", ch).then(function (r) {
              if (r.error) throw r.error;
              if (applyRows(r.data || [])) rerender();
              var rows = rowsFor(ch);
              return rows.length ? sb.from("tool_records").upsert(rows) : { error: null };
            }).then(function (r) { if (r && r.error) throw r.error; });
          });
        }, Promise.resolve()).then(function () {
          dirty = {};
          setStatus("☁️ gespeichert " + hhmm());
        }).catch(function (e) {
          rids.forEach(function (rid) { dirty[rid] = 1; });
          setStatus(failMsg(e), true);
        }).then(function () { pushing = false; if (Object.keys(dirty).length) schedule(); });
      }
      function schedule() { clearTimeout(timer); timer = setTimeout(push, 1000); }

      var origSave = cfg.saveLocal;
      cfg.wrap(function () {
        stamp();
        origSave();
        if (Object.keys(dirty).length) { setStatus("☁️ speichert …"); schedule(); }
      });

      // Start: aktueller lokaler Stand als Ausgangspunkt
      var start = records();
      Object.keys(start).forEach(function (rid) { snap[rid] = flat(start[rid].kind, start[rid].rec); });
      setStatus("☁️ verbinde …");
      pull(true).then(function (rows) {
        var have = {}; rows.forEach(function (x) { have[x.rid] = 1; });
        var cur = records(), st = S(), anyCloud = rows.some(function (x) { return !x.deleted; }), removed = false;
        Object.keys(cur).forEach(function (rid) {
          if (have[rid] || meta.del[rid]) return;
          // leere Standard-Datensätze eines frischen Geräts nicht hochladen (und entfernen, wenn die Cloud schon Daten hat)
          if (cfg.isBlank && cfg.isBlank(cur[rid].kind, cur[rid].rec, st)) {
            if (anyCloud) { st[cur[rid].kind] = st[cur[rid].kind].filter(function (r) { return r !== cur[rid].rec; }); delete snap[rid]; removed = true; }
            return;
          }
          dirty[rid] = 1;
        });
        if (removed) rerender();
        return push();
      }).catch(function (e) { setStatus(failMsg(e), true); });
      setInterval(function () { if (!document.hidden && !pushing) pull(false).catch(function () {}); }, 15000);
      document.addEventListener("visibilitychange", function () {
        if (!document.hidden) pull(false).catch(function () {});
        else if (Object.keys(dirty).length) push();
      });
      window.CloudStore._debug = { merge: merge, flat: flat, meta: meta, push: push, pull: pull };
    }
  };
})();
