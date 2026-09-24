// ============================================================
// Schmale Menüleiste (wie das eingeklappte App-Menü) für die Tool-Seiten.
// Desktop: feste Symbolleiste links. Handy (< 860 px): stattdessen die hellblaue „Zurück“-Leiste.
// Rolle kommt vom Login-Schutz der Seite (window.appRole) → Menüpunkte je Rolle.
// ============================================================
(function () {
  var ITEMS = [
    { href: "index.html", icon: "&#127968;", label: "Dashboard", match: [] },
    { href: "trainingsplan.html", icon: "&#128203;", label: "Trainingsplanung", match: ["trainingsplan.html"] },
    { href: "index.html#loadmanagement", icon: "&#128200;", label: "Load Management", match: ["loadmanagement.html"] },
    { href: "index.html#testungen", icon: "&#129514;", label: "Testungen & Assessments", match: ["test-"], staff: true },
    { href: "warmup.html", icon: "&#128293;", label: "Warm-up", match: ["warmup.html"], staff: true },
    { href: "index.html#athleten", icon: "&#127939;", label: "Athletenverwaltung", match: [], staff: true },
    { href: "index.html#team", icon: "&#128101;", label: "Nutzerverwaltung", match: [], admin: true }
  ];

  var CSS = "" +
    ".app-rail{position:fixed;top:0;left:0;bottom:0;width:68px;background:#a1d7ff;z-index:40;display:flex;flex-direction:column;align-items:center;" +
    "padding:14px 0;gap:4px;box-sizing:border-box;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;}" +
    ".app-rail .rail-logo{display:block;background:#fff;border-radius:8px;padding:4px;margin-bottom:12px;}" +
    ".app-rail .rail-logo img{display:block;width:44px;height:auto;}" +
    ".app-rail a.rail-item{position:relative;display:flex;align-items:center;justify-content:center;width:48px;height:42px;border-radius:9px;" +
    "text-decoration:none;font-size:1.15rem;line-height:1;}" +
    ".app-rail a.rail-item:hover{background:rgba(255,255,255,.45);}" +
    ".app-rail a.rail-item.active{background:#fff;}" +
    ".app-rail a.rail-item.active::before{content:'';position:absolute;left:-10px;top:8px;bottom:8px;width:4px;background:#0042fc;border-radius:0 4px 4px 0;}" +
    ".app-rail a.rail-item .tip{display:none;position:absolute;left:56px;top:50%;transform:translateY(-50%);background:#00113d;color:#fff;" +
    "font-size:.78rem;font-weight:600;white-space:nowrap;padding:5px 10px;border-radius:7px;pointer-events:none;}" +
    ".app-rail a.rail-item:hover .tip{display:block;}" +
    "body.has-rail{padding-left:68px !important;}" +
    "body.has-rail .app-backbar{display:none !important;}" +
    "@media (max-width:860px){.app-rail{display:none;} body.has-rail{padding-left:0 !important;} body.has-rail .app-backbar{display:block !important;}}";

  function init(role) {
    if (document.querySelector(".app-rail")) return;
    var staff = role === "admin" || role === "trainer";
    var path = (location.pathname.split("/").pop() || "index.html");
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    var rail = document.createElement("nav");
    rail.className = "app-rail";
    rail.setAttribute("aria-label", "Menü");
    var h = "<a class='rail-logo' href='index.html' title='Dashboard'><img src='logo-balance-movement.png' alt='Balance Movement'></a>";
    ITEMS.forEach(function (it) {
      if (it.staff && !staff) return;
      if (it.admin && role !== "admin") return;
      var active = it.match.some(function (m) { return path.indexOf(m) === 0 || path === m; });
      h += "<a class='rail-item" + (active ? " active" : "") + "' href='" + it.href + "' aria-label='" + it.label + "'>" + it.icon +
        "<span class='tip'>" + it.label + "</span></a>";
    });
    rail.innerHTML = h;
    document.body.appendChild(rail);
    document.body.classList.add("has-rail");
  }

  window.appRailInit = init;
  if (window.appRole) init(window.appRole);
})();
