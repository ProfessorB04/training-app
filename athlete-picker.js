// ============================================================
// Gemeinsamer Baustein: Athlet:innen aus der Athletenverwaltung (Supabase) in ein Tool übernehmen.
// Nutzung in einem Tool:
//   AthletePicker.attach({ after: "idEinesButtons", label: "…", onAdd: function(list, ctx){ … return anzahlNeu; } })
// list: [{ id, first_name, last_name, birthdate, gender, position, groups:[Gruppennamen] }]
// ctx.groupNames: in der Auswahl angeklickte Gruppen (für Tools mit eigener Gruppen-/Teamzuordnung)
// Braucht window.appSb (wird vom Login-Schutz der Trainings-App gesetzt).
// ============================================================
(function () {
  var CSS = "" +
    ".ap-btn{margin-left:6px;}" +
    ".ap-scrim{position:fixed;inset:0;background:rgba(10,14,30,.45);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:36px 14px;overflow-y:auto;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;}" +
    ".ap-modal{background:#fff;color:#141824;border-radius:14px;padding:20px 22px;width:100%;max-width:720px;box-shadow:0 20px 50px rgba(0,17,61,.25);}" +
    ".ap-modal h2{margin:0 0 4px;font-size:1.15rem;}" +
    ".ap-sub{font-size:.8rem;color:#5a6072;margin:0 0 14px;}" +
    ".ap-groups{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;}" +
    ".ap-g{border:1px solid #d7dcda;background:#fff;border-radius:99px;padding:6px 12px;font-size:.82rem;cursor:pointer;font-family:inherit;color:#141824;}" +
    ".ap-g.on{background:#00113d;color:#fff;border-color:#00113d;}" +
    ".ap-search{width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid #d7dcda;border-radius:8px;font-size:.92rem;margin-bottom:8px;font-family:inherit;}" +
    ".ap-list{max-height:300px;overflow:auto;border:1px solid #d7dcda;border-radius:10px;padding:6px 10px;columns:2;column-gap:18px;}" +
    ".ap-list label{display:flex;align-items:center;gap:6px;font-size:.86rem;padding:3px 0;break-inside:avoid;cursor:pointer;}" +
    ".ap-list label.have{color:#9aa3ad;}" +
    ".ap-hint{color:#7c8b92;font-size:.72rem;}" +
    ".ap-actions{display:flex;gap:10px;align-items:center;margin-top:16px;}" +
    ".ap-actions .grow{flex:1;font-size:.82rem;color:#5a6072;}" +
    ".ap-actions button{font-family:inherit;font-size:.9rem;font-weight:600;border-radius:9px;padding:9px 16px;cursor:pointer;border:1px solid #d7dcda;background:#fff;color:#141824;}" +
    ".ap-actions button.ap-primary{background:#a1d7ff;border-color:#a1d7ff;color:#00113d;}" +
    ".ap-err{color:#a63a2c;font-size:.85rem;}" +
    "@media(max-width:600px){.ap-list{columns:1;}}";

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  function load() {
    var sb = window.appSb;
    if (!sb) return Promise.reject(new Error("Keine Verbindung zur Athletenverwaltung – bitte das Tool über die Trainings-App öffnen."));
    return Promise.all([
      sb.from("athletes").select("id,first_name,last_name,birthdate,gender,position"),
      sb.from("athlete_groups").select("id,name").order("name"),
      sb.from("athlete_group_members").select("athlete_id,group_id")
    ]).then(function (r) {
      var err = r[0].error || r[1].error || r[2].error;
      if (err) throw err;
      var gname = {};
      r[1].data.forEach(function (g) { gname[g.id] = g.name; });
      var mem = {};
      r[2].data.forEach(function (m) { (mem[m.athlete_id] = mem[m.athlete_id] || []).push(m.group_id); });
      var athletes = r[0].data.map(function (a) {
        a.groupIds = mem[a.id] || [];
        a.groups = a.groupIds.map(function (id) { return gname[id]; }).filter(Boolean).sort(function (x, y) { return x.localeCompare(y, "de"); });
        return a;
      });
      athletes.sort(function (x, y) {
        return (x.last_name || "").localeCompare(y.last_name || "", "de") || (x.first_name || "").localeCompare(y.first_name || "", "de");
      });
      return { athletes: athletes, groups: r[1].data };
    });
  }

  function open(opts) {
    if (!document.getElementById("apStyle")) {
      var st = document.createElement("style"); st.id = "apStyle"; st.textContent = CSS; document.head.appendChild(st);
    }
    var host = document.createElement("div");
    host.innerHTML =
      "<div class='ap-scrim'><div class='ap-modal'>" +
      "<h2>Aus Athletenverwaltung hinzufügen</h2>" +
      "<p class='ap-sub'>" + esc((typeof opts.subtitle === "function" ? opts.subtitle() : opts.subtitle) || "Ganze Gruppe anklicken oder einzeln auswählen. Bereits vorhandene Namen werden übersprungen.") + "</p>" +
      "<div class='ap-groups' id='apGroups'><span class='ap-hint'>Lade…</span></div>" +
      "<input type='search' class='ap-search' id='apSearch' placeholder='Name suchen…'>" +
      "<div class='ap-list' id='apList'></div>" +
      "<div class='ap-actions'><span class='grow' id='apCount'>0 ausgewählt</span>" +
      "<button type='button' id='apCancel'>Abbrechen</button>" +
      "<button type='button' class='ap-primary' id='apAdd'>Hinzufügen</button></div>" +
      "</div></div>";
    document.body.appendChild(host);
    var $ = function (id) { return host.querySelector("#" + id); };
    var data = null, picked = {}, activeGroups = {};
    var have = opts.existingKeys ? opts.existingKeys() : {};
    var keyOf = function (a) { return ((a.first_name || "") + "|" + (a.last_name || "")).toLowerCase().replace(/\s+/g, " ").trim(); };

    function close() { host.remove(); }
    function count() { $("apCount").textContent = Object.keys(picked).length + " ausgewählt"; }
    function renderList() {
      var q = ($("apSearch").value || "").toLowerCase();
      var h = "";
      data.athletes.forEach(function (a) {
        var nm = (a.last_name || "") + ", " + (a.first_name || "");
        if (q && nm.toLowerCase().indexOf(q) === -1) return;
        var exists = have[keyOf(a)];
        h += "<label" + (exists ? " class='have' title='schon im Tool'" : "") + "><input type='checkbox' data-id='" + a.id + "'" +
          (picked[a.id] ? " checked" : "") + (exists ? " disabled" : "") + "> " + esc(nm) +
          (a.groups.length ? " <span class='ap-hint'>" + esc(a.groups.join(", ")) + "</span>" : "") +
          (exists ? " <span class='ap-hint'>(vorhanden)</span>" : "") + "</label>";
      });
      $("apList").innerHTML = h || "<span class='ap-hint'>Keine Athlet:innen gefunden.</span>";
      $("apList").querySelectorAll("input[data-id]").forEach(function (cb) {
        cb.addEventListener("change", function () { if (cb.checked) picked[cb.dataset.id] = true; else delete picked[cb.dataset.id]; count(); });
      });
    }
    function renderGroups() {
      $("apGroups").innerHTML = data.groups.map(function (g) {
        var n = data.athletes.filter(function (a) { return a.groupIds.indexOf(g.id) !== -1; }).length;
        return "<button type='button' class='ap-g" + (activeGroups[g.id] ? " on" : "") + "' data-gid='" + g.id + "'>" + esc(g.name) + " (" + n + ")</button>";
      }).join("") + "<button type='button' class='ap-g' id='apClear'>Auswahl leeren</button>";
      $("apGroups").querySelectorAll("[data-gid]").forEach(function (b) {
        b.addEventListener("click", function () {
          var gid = b.dataset.gid, on = !activeGroups[gid];
          if (on) activeGroups[gid] = true; else delete activeGroups[gid];
          data.athletes.forEach(function (a) {
            if (a.groupIds.indexOf(gid) === -1 || have[keyOf(a)]) return;
            if (on) picked[a.id] = true; else delete picked[a.id];
          });
          renderGroups(); renderList(); count();
        });
      });
      $("apClear").addEventListener("click", function () { picked = {}; activeGroups = {}; renderGroups(); renderList(); count(); });
    }

    $("apCancel").addEventListener("click", close);
    host.querySelector(".ap-scrim").addEventListener("click", function (e) { if (e.target.classList.contains("ap-scrim")) close(); });
    $("apSearch").addEventListener("input", function () { if (data) renderList(); });
    $("apAdd").addEventListener("click", function () {
      if (!data) return;
      var list = data.athletes.filter(function (a) { return picked[a.id]; });
      if (!list.length) { alert("Bitte mindestens eine Person auswählen."); return; }
      var groupNames = data.groups.filter(function (g) { return activeGroups[g.id]; }).map(function (g) { return g.name; });
      var n = opts.onAdd(list, { groupNames: groupNames });
      close();
      if (typeof n === "number") {
        var msg = n + " Athlet:in" + (n === 1 ? "" : "nen") + " hinzugefügt" + (n < list.length ? " (" + (list.length - n) + " schon vorhanden)" : "") + ".";
        if (typeof window.toast === "function") { try { window.toast(msg); return; } catch (e) {} }
        alert(msg);
      }
    });

    load().then(function (d) { data = d; renderGroups(); renderList(); count(); })
      .catch(function (e) { $("apGroups").innerHTML = "<span class='ap-err'>" + esc(e.message) + "</span>"; });
  }

  function attach(opts) {
    var anchor = document.getElementById(opts.after);
    if (!anchor) return;
    var b = document.createElement("button");
    b.type = "button";
    b.className = (opts.className || anchor.className || "") + " ap-btn";
    b.textContent = opts.label || "👥 Aus Athletenverwaltung";
    b.addEventListener("click", function () { open(opts); });
    anchor.insertAdjacentElement("afterend", b);
    return b;
  }

  window.AthletePicker = { attach: attach, open: open, load: load };
})();
