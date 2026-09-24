// ============================================================
// Balance Movement Training App — Supabase-Version
// ============================================================
const SUPABASE_URL = "https://hbrtzjrhaluoabvfkbkb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhicnR6anJoYWx1b2FidmZrYmtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNDkxMTgsImV4cCI6MjEwNTcyNTExOH0.fSav78jlqCLFBhwObAe5CS3cTlccndJlyDaY640j0nI";

// Eigene (No-op-)Sperre statt Browser-LockManager: verhindert Hänger, wenn mehrere Tabs der App offen sind
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { lock: async (_name, _timeout, fn) => await fn() },
});

// Notfall-Anzeige, falls der Start trotzdem hängt
function showStartProblem(reason) {
  appEl.innerHTML = `
    <main class="login-page"><div class="login-card">
      <div class="login-logo"><img src="${LOGO_SRC}" alt="Balance Movement"></div>
      <h1>Die App l&auml;dt gerade nicht</h1>
      <p class="sub">${esc(reason)}</p>
      <div class="auth-form">
        <button type="button" id="probReload">Neu laden</button>
        <button type="button" class="secondary" id="probReset">Anmeldung zur&uuml;cksetzen &amp; neu anmelden</button>
      </div>
      <p class="hint" style="text-align:center;">Tipp: Andere offene Tabs der App schlie&szlig;en.</p>
    </div></main>`;
  document.getElementById('probReload').onclick = () => location.reload();
  document.getElementById('probReset').onclick = () => {
    try { Object.keys(localStorage).filter(k => k.startsWith('sb-')).forEach(k => localStorage.removeItem(k)); } catch (e) {}
    location.href = location.pathname;
  };
}
setTimeout(() => {
  if (!document.querySelector('.shell, .login-page')) showStartProblem('Der Start hat länger als 10 Sekunden gedauert (Anmeldung oder Verbindung hängt).');
}, 10000);
const appEl = document.getElementById('app');
const LOGO_SRC = 'logo-balance-movement.png';

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

function weekDates() {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // 0 = Montag
  const monday = new Date(now);
  monday.setDate(now.getDate() - day);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

// ---------------- Rollen ----------------
// admin   = volle Rechte inkl. Nutzerverwaltung (Einladen, Rollen ändern)
// trainer = alle Inhalte (Team-Übersichten, Trainingsplanung …), aber keine Nutzerverwaltung
// athlete = eigene Einträge
const ROLE_LABELS = { admin: 'Admin', trainer: 'Trainer:in', athlete: 'Athlet:in' };
const isAdmin = (profile) => profile.role === 'admin';
const isStaff = (profile) => profile.role === 'admin' || profile.role === 'trainer';

// ---------------- App-Shell (Sidebar + Kopfzeile) ----------------
const NAV_ITEMS = [
  { key: 'menu', label: 'Dashboard', icon: '&#127968;' },
  { key: 'trainingsplan', label: 'Trainingsplanung', icon: '&#128203;' },
  { key: 'loadmanagement', label: 'Load Management', icon: '&#128200;' },
  { key: 'testungen', label: 'Testungen & Assessments', icon: '&#129514;', staffOnly: true },
  { key: 'warmup', label: 'Warm-up', icon: '&#128293;', staffOnly: true },
  { key: 'athleten', label: 'Athletenverwaltung', icon: '&#127939;', staffOnly: true },
  { key: 'team', label: 'Nutzerverwaltung', icon: '&#128101;', adminOnly: true },
];

function renderShell(profile, activeKey, title, contentHtml) {
  const navHtml = NAV_ITEMS
    .filter(item => (!item.adminOnly || isAdmin(profile)) && (!item.staffOnly || isStaff(profile)))
    .map(item => {
      const isActive = item.key === activeKey;
      const cls = 'nav-item' + (isActive ? ' active' : '') + (item.soon ? ' disabled' : '');
      const soonTag = item.soon ? '<span class="soon-tag">bald</span>' : '';
      return `<button type="button" class="${cls}" data-nav="${item.key}" title="${esc(item.label)}" ${item.soon ? 'disabled' : ''}>
        <span class="ic">${item.icon}</span><span class="lbl">${esc(item.label)}</span>${soonTag}
      </button>`;
    }).join('');

  let collapsed = false;
  try { collapsed = localStorage.getItem('bm_sidebar_collapsed') === '1'; } catch (e) {}

  appEl.innerHTML = `
    <div class="shell${collapsed ? ' collapsed' : ''}" id="shell">
      <div class="sidebar-scrim" id="sidebarScrim"></div>
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-header">
          <img src="${LOGO_SRC}" alt="Balance Movement">
          <div class="org-sub">Trainings-App</div>
        </div>
        <button type="button" class="collapse-btn" id="collapseBtn" title="Menü ein-/ausklappen" aria-label="Menü ein- oder ausklappen">
          <span class="ic">&#171;</span><span class="lbl">Menü einklappen</span>
        </button>
        <nav class="sidebar-nav">${navHtml}</nav>
        <div class="sidebar-footer">
          <div class="sidebar-user"><b>${esc(profile.name)}</b>${ROLE_LABELS[profile.role] || ''}</div>
          <button type="button" id="logoutBtn" title="Abmelden"><span class="lbl">Abmelden</span><span class="ic-only">&#10162;</span></button>
        </div>
      </aside>
      <div class="main-area">
        <header class="topbar">
          <button class="menu-toggle" id="menuToggle" type="button" aria-label="Men&uuml;">&#9776;</button>
          <h1>${esc(title)}</h1>
          <span></span>
        </header>
        <main class="wrap">${contentHtml}</main>
      </div>
    </div>
  `;

  document.getElementById('logoutBtn').onclick = async () => {
    await sb.auth.signOut();
  };

  appEl.querySelectorAll('.nav-item[data-nav]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.nav;
      if (key === 'menu') renderMenu(profile);
      else if (key === 'trainingsplan') window.location.href = 'trainingsplan.html';
      else if (key === 'loadmanagement') {
        isStaff(profile) ? renderLoadHub(profile) : renderAthleteDashboard(profile);
      } else if (key === 'team' && isAdmin(profile)) renderTeamPage(profile);
      else if (key === 'testungen' && isStaff(profile)) renderTestingPage(profile);
      else if (key === 'warmup' && isStaff(profile)) window.location.href = 'warmup.html';
      else if (key === 'athleten' && isStaff(profile)) renderAthletesPage(profile);
    };
  });

  const sidebar = document.getElementById('sidebar');
  const scrim = document.getElementById('sidebarScrim');
  const toggle = document.getElementById('menuToggle');
  if (toggle) {
    toggle.onclick = () => { sidebar.classList.add('open'); scrim.classList.add('show'); };
    scrim.onclick = () => { sidebar.classList.remove('open'); scrim.classList.remove('show'); };
  }
  // Seitenleiste am Desktop einklappen (nur Symbole) – Zustand bleibt gespeichert
  document.getElementById('collapseBtn').onclick = () => {
    const shell = document.getElementById('shell');
    const now = !shell.classList.contains('collapsed');
    shell.classList.toggle('collapsed', now);
    try { localStorage.setItem('bm_sidebar_collapsed', now ? '1' : '0'); } catch (e) {}
  };
}

// ---------------- Login ----------------
// Öffentliche Registrierung ist bewusst deaktiviert (höchster Zugriffsschutz) —
// neue Zugänge legt ausschließlich der Trainer/Administrator an.
function renderAuth() {
  appEl.innerHTML = `
    <main class="login-page">
      <div class="login-card">
        <div class="login-logo"><img src="${LOGO_SRC}" alt="Balance Movement"></div>
        <h1>Balance Movement</h1>
        <p class="sub">Trainings-App</p>
        <form id="loginForm" class="auth-form">
          <label>E-Mail<input type="email" id="loginEmail" required autocomplete="username"></label>
          <label>Passwort<input type="password" id="loginPassword" required autocomplete="current-password"></label>
          <button type="submit">Anmelden</button>
          <p class="error" id="loginError"></p>
        </form>
        <form id="forgotForm" class="auth-form" hidden>
          <label>E-Mail<input type="email" id="forgotEmail" required autocomplete="username"></label>
          <button type="submit">Link zum Zur&uuml;cksetzen senden</button>
          <p class="error" id="forgotError"></p>
          <p class="ok" id="forgotOk"></p>
        </form>
        <p class="hint" style="margin-top:16px;text-align:center;">
          <a href="#" id="forgotToggle">Passwort vergessen?</a>
        </p>
        <p class="hint" style="text-align:center;">Kein Zugang? Wende dich an deinen Trainer — Konten werden ausschließlich persönlich vergeben, es gibt keine Selbstregistrierung.</p>
      </div>
    </main>
  `;

  document.getElementById('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    document.getElementById('loginError').textContent = error ? 'E-Mail oder Passwort falsch.' : '';
  };

  const loginForm = document.getElementById('loginForm');
  const forgotForm = document.getElementById('forgotForm');
  const forgotToggle = document.getElementById('forgotToggle');
  forgotToggle.onclick = (e) => {
    e.preventDefault();
    const showingForgot = !forgotForm.hidden;
    loginForm.hidden = !showingForgot;
    forgotForm.hidden = showingForgot;
    forgotToggle.textContent = showingForgot ? 'Passwort vergessen?' : 'Zurück zur Anmeldung';
  };

  forgotForm.onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgotEmail').value.trim();
    const errEl = document.getElementById('forgotError');
    const okEl = document.getElementById('forgotOk');
    errEl.textContent = '';
    okEl.textContent = '';
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    if (error) {
      errEl.textContent = 'Fehler: ' + error.message;
    } else {
      okEl.textContent = 'Falls dieses Konto existiert, wurde eine E-Mail zum Zurücksetzen verschickt.';
      e.target.reset();
    }
  };
}

// ---------------- Neues Passwort setzen (Einmalpasswort, Einladung oder "Passwort vergessen") ----------------
function mustChangePassword(user) {
  return !!(user && user.user_metadata && user.user_metadata.must_change_password);
}

function renderSetPassword() {
  appEl.innerHTML = `
    <main class="login-page">
      <div class="login-card">
        <div class="login-logo"><img src="${LOGO_SRC}" alt="Balance Movement"></div>
        <h1>Willkommen</h1>
        <p class="sub">Bitte lege jetzt dein eigenes Passwort fest (mind. 10 Zeichen). Das Einmalpasswort ist danach ung&uuml;ltig.</p>
        <form id="setPwForm" class="auth-form">
          <label>Neues Passwort<input type="password" id="newPassword" required minlength="10" autocomplete="new-password"></label>
          <label>Passwort wiederholen<input type="password" id="newPassword2" required minlength="10" autocomplete="new-password"></label>
          <button type="submit">Passwort speichern</button>
          <p class="error" id="setPwError"></p>
        </form>
        <p class="hint" style="text-align:center;margin-top:14px;"><a href="#" id="setPwLogout">Abmelden</a></p>
      </div>
    </main>
  `;

  document.getElementById('setPwForm').onsubmit = async (e) => {
    e.preventDefault();
    const p1 = document.getElementById('newPassword').value;
    const p2 = document.getElementById('newPassword2').value;
    const errEl = document.getElementById('setPwError');
    if (p1 !== p2) {
      errEl.textContent = 'Passwörter stimmen nicht überein.';
      return;
    }
    const { error } = await sb.auth.updateUser({ password: p1, data: { must_change_password: false } });
    if (error) {
      errEl.textContent = 'Fehler: ' + error.message;
      return;
    }
    history.replaceState(null, '', window.location.pathname);
    toast('Passwort gespeichert.');
    const { data: { user } } = await sb.auth.getUser();
    if (user) { CURRENT_USER_ID = user.id; renderDashboard(user); }
  };

  document.getElementById('setPwLogout').onclick = async (e) => {
    e.preventDefault();
    await sb.auth.signOut();
  };
}

function isRecoveryOrInviteLink() {
  const hash = window.location.hash || '';
  return hash.includes('type=recovery') || hash.includes('type=invite');
}

// ---------------- Dashboard-Router ----------------
async function renderDashboard(user) {
  appEl.innerHTML = `<main class="wrap"><p class="muted">Lade&hellip;</p></main>`;

  const { data: profile, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !profile) {
    showStartProblem('Profil konnte nicht geladen werden' + (error ? ': ' + error.message : '.'));
    return;
  }

  if (window.location.hash === '#loadmanagement') {
    history.replaceState(null, '', window.location.pathname);
    isStaff(profile) ? renderLoadHub(profile) : renderAthleteDashboard(profile);
    return;
  }
  if (window.location.hash === '#team' && isAdmin(profile)) {
    history.replaceState(null, '', window.location.pathname);
    renderTeamPage(profile);
    return;
  }
  if (window.location.hash === '#athleten' && isStaff(profile)) {
    history.replaceState(null, '', window.location.pathname);
    renderAthletesPage(profile);
    return;
  }
  if (window.location.hash === '#testungen' && isStaff(profile)) {
    history.replaceState(null, '', window.location.pathname);
    renderTestingPage(profile);
    return;
  }
  renderMenu(profile);
}

// ---------------- Load Management: Übersicht (Admin + Trainer:innen) ----------------
function renderLoadHub(profile) {
  const content = `
    <div class="menu-grid">
      <a class="menu-card tint-load" href="loadmanagement.html" style="text-decoration:none;">
        <span class="mc-icon">&#128200;</span>
        <span class="mc-title">Load-Management-Tool</span>
        <span class="mc-sub">Rohdaten-Import (Session-RPE &amp; Wellness), Ampel je Athlet:in, Wochensteuerung &amp; Trainingsempfehlung f&uuml;r Coaches, PDF/Word &mdash; mehrere Teams &amp; Layouts</span>
      </a>
      <button class="menu-card tint-plan" type="button" id="loadAppEntries">
        <span class="mc-icon">&#128241;</span>
        <span class="mc-title">sRPE-Eintr&auml;ge aus der App</span>
        <span class="mc-sub">Was Athlet:innen mit eigenem Zugang in der App eintragen &mdash; Wochen&uuml;bersicht nach Gruppe</span>
      </button>
    </div>
    <p class="hint">Die Daten im Load-Management-Tool werden im jeweiligen Browser gespeichert. Zum &Uuml;bertragen auf ein anderes Ger&auml;t im Tool &bdquo;Export (JSON)&ldquo; &rarr; &bdquo;Import&ldquo; nutzen.</p>
  `;
  renderShell(profile, 'loadmanagement', 'Load Management', content);
  document.getElementById('loadAppEntries').onclick = () => renderTrainerDashboard(profile);
}

// ---------------- Testungen & Assessments (Admin + Trainer:innen) ----------------
function renderTestingPage(profile) {
  const content = `
    <div class="menu-grid">
      <a class="menu-card tint-test" href="test-performance.html" style="text-decoration:none;">
        <span class="mc-icon">&#127941;</span>
        <span class="mc-title">Performance-Test</span>
        <span class="mc-sub">Anthropometrie, Mobility, Sprint, Jump, Agility, 30-15 IFT &mdash; Excel/Word/PDF</span>
      </a>
      <a class="menu-card tint-load" href="test-ift.html" style="text-decoration:none;">
        <span class="mc-icon">&#127939;</span>
        <span class="mc-title">30-15 IFT</span>
        <span class="mc-sub">Test mit Signalt&ouml;nen, VIFT/VO&#8322;max, Trainingszonen</span>
      </a>
      <a class="menu-card tint-plan" href="test-sprint.html" style="text-decoration:none;">
        <span class="mc-icon">&#9201;</span>
        <span class="mc-title">10m Sprint</span>
        <span class="mc-sub">Zeiten erfassen, Entwicklungskurven, Bestzeiten</span>
      </a>
    </div>
    <p class="hint">Die Testdaten werden im jeweiligen Browser gespeichert. Zum &Uuml;bertragen von einem anderen Ger&auml;t im Tool &bdquo;Sicherung speichern&ldquo; &rarr; &bdquo;Sicherung laden&ldquo; nutzen. Beim Performance-Test kommen die Athlet:innen beim Anlegen eines Tests aus der Athletenverwaltung.</p>
  `;
  renderShell(profile, 'testungen', 'Testungen & Assessments', content);
}

// ---------------- Kategorie-Menü ----------------
function renderMenu(profile) {
  const content = `
    <div class="menu-grid">
      <button class="menu-card tint-plan" type="button" data-cat="trainingsplan">
        <span class="mc-icon">&#128203;</span>
        <span class="mc-title">Trainingsplanung</span>
        <span class="mc-sub">&Uuml;bungen zusammenstellen, als Excel exportieren</span>
      </button>
      <button class="menu-card tint-load" type="button" data-cat="loadmanagement">
        <span class="mc-icon">&#128200;</span>
        <span class="mc-title">Load Management</span>
        <span class="mc-sub">T&auml;gliche sRPE-Werte, Team-&Uuml;bersicht</span>
      </button>
      ${isStaff(profile) ? `
      <button class="menu-card tint-test" type="button" data-cat="testungen">
        <span class="mc-icon">&#129514;</span>
        <span class="mc-title">Testungen &amp; Assessments</span>
        <span class="mc-sub">Performance-Test, 30-15 IFT, 10m Sprint</span>
      </button>
      <button class="menu-card tint-warm" type="button" data-cat="warmup">
        <span class="mc-icon">&#128293;</span>
        <span class="mc-title">Warm-up</span>
        <span class="mc-sub">Mobility-, Dynamic-, Runner&rsquo;s-ABC-Bibliothek, Warm-up-Sessions</span>
      </button>
      <button class="menu-card tint-ath" type="button" data-cat="athleten">
        <span class="mc-icon">&#127939;</span>
        <span class="mc-title">Athletenverwaltung</span>
        <span class="mc-sub">Athlet:innen &amp; Gruppen zentral verwalten, Import aus der Trainingsplanung</span>
      </button>` : ''}
      ${isAdmin(profile) ? `
      <button class="menu-card tint-team" type="button" data-cat="team">
        <span class="mc-icon">&#128101;</span>
        <span class="mc-title">Nutzerverwaltung</span>
        <span class="mc-sub">Athlet:innen &amp; Trainer:innen einladen, Rollen verwalten</span>
      </button>` : ''}
    </div>
  `;

  renderShell(profile, 'menu', 'Dashboard', content);

  appEl.querySelectorAll('.menu-card[data-cat]').forEach(btn => {
    btn.onclick = () => {
      const cat = btn.dataset.cat;
      if (cat === 'trainingsplan') {
        window.location.href = 'trainingsplan.html';
      } else if (cat === 'loadmanagement') {
        isStaff(profile) ? renderLoadHub(profile) : renderAthleteDashboard(profile);
      } else if (cat === 'team' && isAdmin(profile)) {
        renderTeamPage(profile);
      } else if (cat === 'testungen' && isStaff(profile)) {
        renderTestingPage(profile);
      } else if (cat === 'warmup' && isStaff(profile)) {
        window.location.href = 'warmup.html';
      } else if (cat === 'athleten' && isStaff(profile)) {
        renderAthletesPage(profile);
      }
    };
  });
}

// ---------------- Trainer-Ansicht: Load Management ----------------
let LOAD_GROUP = '';   // gewählte Gruppe in der Load-Management-Übersicht ('' = alle mit App-Zugang)

async function renderTrainerDashboard(profile) {
  const days = weekDates();
  const dayLabels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  const [profRes, entRes, mgmt] = await Promise.all([
    sb.from('profiles').select('id, name').eq('role', 'athlete').order('name'),
    sb.from('load_entries').select('user_id, entry_date, srpe, duration_min').in('entry_date', days),
    loadAthleteData().catch(() => null),
  ]);
  const profiles = profRes.data || [];
  const entries = entRes.data || [];

  const byUserDate = {};
  entries.forEach(e => {
    byUserDate[e.user_id] = byUserDate[e.user_id] || {};
    byUserDate[e.user_id][e.entry_date] = e;
  });

  // Zeilen: ohne Gruppe = alle Athlet:innen mit App-Zugang; mit Gruppe = alle Mitglieder (auch ohne Zugang)
  let people;
  const groups = mgmt ? mgmt.groups : [];
  if (LOAD_GROUP && mgmt && mgmt.groupsById[LOAD_GROUP]) {
    people = mgmt.athletes
      .filter(a => a.groupIds.includes(LOAD_GROUP))
      .sort((x, y) => x.last_name.localeCompare(y.last_name, 'de') || x.first_name.localeCompare(y.first_name, 'de'))
      .map(a => ({ name: `${a.first_name} ${a.last_name}`, userId: a.profile_id || null, athleteId: a.id }));
  } else {
    LOAD_GROUP = '';
    people = profiles.map(p => ({ name: p.name, userId: p.id }));
  }

  const rows = people.length
    ? people.map(a => {
        if (!a.userId) {
          return `<tr class="no-access"><td>${esc(a.name)}</td><td colspan="7" class="muted">kein App-Zugang${isAdmin(profile) ? ` &middot; <a href="#" data-grant="${a.athleteId}">Zugang anlegen</a>` : ''}</td></tr>`;
        }
        const cells = days.map(d => {
          const e = byUserDate[a.userId] && byUserDate[a.userId][d];
          const load = e ? e.srpe * e.duration_min : null;
          const cls = load === null ? 'load-empty' : (load >= 500 ? 'load-high' : 'load-ok');
          return `<td class="${cls}">${load === null ? '–' : load}</td>`;
        }).join('');
        return `<tr><td>${esc(a.name)}</td>${cells}</tr>`;
      }).join('')
    : `<tr><td colspan="8" class="muted">${LOAD_GROUP ? 'Keine Athlet:innen in dieser Gruppe.' : 'Noch keine Athlet:innen mit App-Zugang.'}</td></tr>`;

  const content = `
    <div class="card">
      <div class="ath-toolbar" style="margin-bottom:6px;">
        <h2 style="margin:0;">Load Management — diese Woche</h2>
        <span class="spacer"></span>
        <select id="loadGroup">
          <option value="">Alle mit App-Zugang</option>
          ${groups.map(g => `<option value="${g.id}" ${LOAD_GROUP === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}
        </select>
      </div>
      <div class="tablewrap">
        <table>
          <thead><tr><th>Name</th>${dayLabels.map(l => `<th>${l}</th>`).join('')}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="hint">Wert je Zelle = sRPE &times; Trainingsdauer in Minuten (Session-Load nach Foster). Ab 500 farblich hervorgehoben.
      Gruppen kommen aus der Athletenverwaltung; Werte tragen die Athlet:innen mit ihrem App-Zugang selbst ein.</p>
    </div>
  `;

  renderShell(profile, 'loadmanagement', 'Load Management', content);
  document.getElementById('loadGroup').onchange = (e) => { LOAD_GROUP = e.target.value; renderTrainerDashboard(profile); };
  appEl.querySelectorAll('[data-grant]').forEach(a => {
    a.onclick = (e) => { e.preventDefault(); INVITE_PRESELECT = a.dataset.grant; renderTeamPage(profile); };
  });
}

// ---------------- Admin-Ansicht: Nutzerverwaltung ----------------
let INVITE_PRESELECT = null;   // Athlet:in-ID, wenn aus dem Load Management „Zugang anlegen“ geklickt wurde

async function renderTeamPage(profile) {
  if (!isAdmin(profile)) { renderMenu(profile); return; }
  const mgmt = await loadAthleteData().catch(() => null);
  // Anmeldestatus (nur Admin, via Datenbankfunktion admin_user_status)
  const statusRes = await sb.rpc('admin_user_status');
  const statusById = {};
  (statusRes.data || []).forEach(x => { statusById[x.id] = x; });
  const fmtDT = (iso) => { const d = new Date(iso); return d.toLocaleDateString('de-DE') + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); };
  const statusCell = (u) => {
    const st = statusById[u.id];
    if (!st) return '<span class="muted">–</span>';
    const mail = `<div class="status-mail">${esc(st.email || '')}</div>`;
    if (!st.last_sign_in_at) return `<span class="status-pill open">Erste Anmeldung ausstehend</span>${mail}`;
    if (st.must_change) return `<span class="status-pill half" title="Mit Einmalpasswort angemeldet, eigenes Passwort noch nicht festgelegt">Eigenes Passwort fehlt</span>${mail}`;
    return `<span class="status-pill ok">Aktiv</span> <span class="status-when">zuletzt ${fmtDT(st.last_sign_in_at)}</span>${mail}`;
  };
  const mAthletes = mgmt ? mgmt.athletes.slice().sort((x, y) => x.last_name.localeCompare(y.last_name, 'de') || x.first_name.localeCompare(y.first_name, 'de')) : [];
  const linkedBy = {};   // profile_id -> athlete
  mAthletes.forEach(a => { if (a.profile_id) linkedBy[a.profile_id] = a; });
  const preselect = INVITE_PRESELECT; INVITE_PRESELECT = null;

  const { data: users } = await sb
    .from('profiles')
    .select('id, name, role, created_at')
    .order('role')
    .order('name');

  const roleOrder = { admin: 0, trainer: 1, athlete: 2 };
  const sorted = (users || []).slice().sort((a, b) =>
    (roleOrder[a.role] - roleOrder[b.role]) || a.name.localeCompare(b.name, 'de'));

  const userRows = sorted.length
    ? sorted.map(u => {
        const roleCell = u.role === 'admin'
          ? `<span class="pill admin">Admin</span>`
          : `<select class="role-select" data-user="${u.id}">
               <option value="athlete" ${u.role === 'athlete' ? 'selected' : ''}>Athlet:in</option>
               <option value="trainer" ${u.role === 'trainer' ? 'selected' : ''}>Trainer:in</option>
             </select>`;
        const resetCell = u.role === 'admin' ? ''
          : `<button type="button" class="secondary small-btn" data-reset="${u.id}">Einmalpasswort</button>
             <button type="button" class="danger small-btn" data-delete="${u.id}">L&ouml;schen</button>`;
        const linked = linkedBy[u.id];
        const linkCell = u.role !== 'athlete' ? '' :
          `<select class="link-select" data-user="${u.id}">
             <option value="">– nicht verknüpft –</option>
             ${mAthletes.filter(a => !a.profile_id || a.profile_id === u.id).map(a =>
               `<option value="${a.id}" ${linked && linked.id === a.id ? 'selected' : ''}>${esc(a.last_name)}, ${esc(a.first_name)}</option>`).join('')}
           </select>`;
        return `<tr><td>${esc(u.name)}</td><td>${statusCell(u)}</td><td>${roleCell}</td><td>${linkCell}</td><td>${resetCell}</td></tr>`;
      }).join('')
    : `<tr><td colspan="5" class="muted">Noch keine Nutzer:innen.</td></tr>`;

  const content = `
    <div class="card">
      <h2>Neue Person einladen</h2>
      <p class="hint">Selbstregistrierung ist deaktiviert. Name, Login-E-Mail und Rolle w&auml;hlen &mdash; die App erzeugt ein <b>Einmalpasswort</b>. Du schickst die Zugangsdaten an eine beliebige Adresse (oder per WhatsApp). Bei der ersten Anmeldung legt die Person ihr eigenes Passwort fest.</p>
      <form id="inviteForm" class="inline-form">
        <label>Aus Athletenverwaltung
          <select id="inviteAthlete">
            <option value="">– frei eintragen –</option>
            ${mAthletes.filter(a => !a.profile_id).map(a => `<option value="${a.id}" ${preselect === a.id ? 'selected' : ''}>${esc(a.last_name)}, ${esc(a.first_name)}</option>`).join('')}
          </select>
        </label>
        <label>Name<input type="text" id="inviteName" required></label>
        <label>Login-E-Mail<input type="email" id="inviteEmail" required></label>
        <label>Rolle
          <select id="inviteRole">
            <option value="athlete">Athlet:in</option>
            <option value="trainer">Trainer:in</option>
          </select>
        </label>
        <button type="submit">Zugang anlegen</button>
      </form>
      <p class="role-hint">Trainer:innen k&ouml;nnen alle Inhalte nutzen (Trainingsplanung, Load-Management-&Uuml;bersicht aller Athlet:innen), aber keine Nutzer einladen oder Rollen &auml;ndern.</p>
      <p class="notice" id="inviteMsg" hidden></p>
    </div>

    <div class="card cred-card" id="credCard" hidden></div>

    <div class="card">
      <h2>Alle Nutzer:innen</h2>
      <div class="tablewrap">
        <table class="user-table">
          <thead><tr><th>Name</th><th>Anmeldestatus</th><th>Rolle</th><th>Athletenverwaltung</th><th>Zugang</th></tr></thead>
          <tbody>${userRows}</tbody>
        </table>
      </div>
      <p class="hint">Rolle &auml;ndern: einfach im Auswahlfeld umstellen, wird sofort gespeichert. &bdquo;Einmalpasswort&ldquo; erzeugt neue Zugangsdaten (z.&nbsp;B. wenn jemand nicht reinkommt) &mdash; das alte Passwort gilt dann nicht mehr. &bdquo;L&ouml;schen&ldquo; entfernt den Zugang inkl. aller Load-Eintr&auml;ge dauerhaft. Die Admin-Rolle kann nur direkt in Supabase vergeben werden.</p>
    </div>
  `;

  renderShell(profile, 'team', 'Nutzerverwaltung', content);

  appEl.querySelectorAll('.role-select').forEach(sel => {
    sel.onchange = async () => {
      const { error } = await sb.from('profiles').update({ role: sel.value }).eq('id', sel.dataset.user);
      if (error) {
        toast('Fehler: ' + error.message);
        renderTeamPage(profile);
      } else {
        toast('Rolle gespeichert.');
      }
    };
  });

  // Athlet:in aus der Athletenverwaltung übernehmen (Name vorbelegen)
  const invAth = document.getElementById('inviteAthlete');
  const fillFromAthlete = () => {
    const a = mAthletes.find(x => x.id === invAth.value);
    if (a) { document.getElementById('inviteName').value = `${a.first_name} ${a.last_name}`; document.getElementById('inviteRole').value = 'athlete'; }
  };
  invAth.onchange = fillFromAthlete;
  if (preselect) { fillFromAthlete(); document.getElementById('inviteEmail').focus(); }

  // Bestehenden Zugang mit Athlet:in verknüpfen
  appEl.querySelectorAll('.link-select').forEach(sel => {
    sel.onchange = async () => {
      const uid = sel.dataset.user;
      let { error } = await sb.from('athletes').update({ profile_id: null }).eq('profile_id', uid);
      if (!error && sel.value) ({ error } = await sb.from('athletes').update({ profile_id: uid }).eq('id', sel.value));
      toast(error ? 'Fehler: ' + error.message : 'Verknüpfung gespeichert.');
      renderTeamPage(profile);
    };
  });

  appEl.querySelectorAll('[data-delete]').forEach(btn => {
    btn.onclick = async () => {
      const name = btn.closest('tr').firstElementChild.textContent;
      if (!confirm(name + ' wirklich löschen?\n\nDer Zugang und alle Load-Management-Einträge dieser Person werden dauerhaft entfernt.')) return;
      btn.disabled = true;
      const { data, error } = await sb.functions.invoke('invite-user', { body: { action: 'delete', userId: btn.dataset.delete } });
      if (error || (data && data.error)) {
        btn.disabled = false;
        toast('Fehler: ' + (data && data.error ? data.error : error.message));
        return;
      }
      toast(name + ' gelöscht.');
      renderTeamPage(profile);
    };
  });

  appEl.querySelectorAll('[data-reset]').forEach(btn => {
    btn.onclick = async () => {
      const name = btn.closest('tr').firstElementChild.textContent;
      if (!confirm('Neues Einmalpasswort für ' + name + ' erzeugen? Das bisherige Passwort gilt dann nicht mehr.')) return;
      btn.disabled = true;
      const { data, error } = await sb.functions.invoke('invite-user', { body: { action: 'reset', userId: btn.dataset.reset } });
      btn.disabled = false;
      if (error || (data && data.error)) {
        toast('Fehler: ' + (data && data.error ? data.error : error.message));
        return;
      }
      showCredentials(data);
    };
  });

  document.getElementById('inviteForm').onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('inviteName').value.trim();
    const email = document.getElementById('inviteEmail').value.trim();
    const role = document.getElementById('inviteRole').value;
    const msgEl = document.getElementById('inviteMsg');
    msgEl.hidden = false;
    msgEl.textContent = 'Lege Zugang an…';

    const athleteId = document.getElementById('inviteAthlete').value || null;
    const { data, error } = await sb.functions.invoke('invite-user', {
      body: { name, email, role, athleteId },
    });

    if (error || (data && data.error)) {
      msgEl.textContent = 'Fehler: ' + (data && data.error ? data.error : error.message);
      return;
    }

    toast('Zugang für ' + name + ' (' + ROLE_LABELS[role] + ') angelegt.');
    await renderTeamPage(profile);
    showCredentials(data);
  };
}

// Zugangsdaten nach Anlegen / Zurücksetzen anzeigen (nur einmalig sichtbar)
function showCredentials(d) {
  const card = document.getElementById('credCard');
  const appUrl = location.origin + '/';
  const text =
    'Hallo ' + d.name + ',\n\n' +
    'hier sind deine Zugangsdaten für die Balance Movement Trainings-App:\n\n' +
    'Adresse: ' + appUrl + '\n' +
    'Login-E-Mail: ' + d.email + '\n' +
    'Einmalpasswort: ' + d.password + '\n\n' +
    'Bei der ersten Anmeldung legst du dein eigenes Passwort fest.\n\n' +
    'Viele Grüße\nMaik';
  card.hidden = false;
  card.innerHTML = `
    <h2>Zugangsdaten f&uuml;r ${esc(d.name)}</h2>
    <div class="cred-grid">
      <span>Adresse</span><b>${esc(appUrl)}</b>
      <span>Login-E-Mail</span><b>${esc(d.email)}</b>
      <span>Einmalpasswort</span><b class="cred-pw">${esc(d.password)}</b>
    </div>
    <form id="sendForm" class="inline-form" style="margin-top:14px;">
      <label>Senden an (beliebige Adresse)<input type="email" id="sendTo" value="${esc(d.email)}" required></label>
      <button type="submit">E-Mail &ouml;ffnen</button>
      <button type="button" class="secondary" id="copyCred">Kopieren</button>
    </form>
    <div style="margin-top:16px;text-align:center;">
      <p class="hint">QR-Code zur Anmeldeseite:</p>
      <canvas id="credQr"></canvas>
    </div>
    <p class="hint">Das Einmalpasswort wird nur jetzt angezeigt. Angemeldet wird sich immer mit der Login-E-Mail &mdash; die Nachricht selbst kannst du an jede Adresse schicken.</p>
  `;
  document.getElementById('sendForm').onsubmit = (e) => {
    e.preventDefault();
    const to = document.getElementById('sendTo').value.trim();
    window.location.href = 'mailto:' + encodeURIComponent(to) +
      '?subject=' + encodeURIComponent('Dein Zugang zur Balance Movement Trainings-App') +
      '&body=' + encodeURIComponent(text);
  };
  document.getElementById('copyCred').onclick = async () => {
    try { await navigator.clipboard.writeText(text); toast('Zugangsdaten kopiert.'); }
    catch (_) { toast('Kopieren nicht möglich – bitte markieren und kopieren.'); }
  };
  QRCode.toCanvas(document.getElementById('credQr'), appUrl, { width: 180 });
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------------- Athlet:in-Ansicht ----------------
async function renderAthleteDashboard(profile) {
  const today = new Date().toISOString().slice(0, 10);

  const { data: rows } = await sb
    .from('load_entries')
    .select('*')
    .order('entry_date', { ascending: false })
    .limit(14);

  const historyRows = (rows && rows.length)
    ? rows.map(r => `
        <tr>
          <td>${esc(r.entry_date)}</td>
          <td>${r.srpe}</td>
          <td>${r.duration_min} min</td>
          <td>${r.srpe * r.duration_min}</td>
          <td>${esc(r.comment || '')}</td>
        </tr>
      `).join('')
    : `<tr><td colspan="5" class="muted">Noch keine Eintr&auml;ge.</td></tr>`;

  const srpeOptions = Array.from({ length: 10 }, (_, i) => i + 1)
    .map(n => `<option value="${n}">${n}</option>`).join('');

  const content = `
    <div class="card">
      <h2>Heutige Einheit eintragen</h2>
      <form id="entryForm" class="inline-form">
        <label>Datum<input type="date" id="entryDate" value="${today}" required></label>
        <label>sRPE (1&ndash;10)
          <select id="entrySrpe" required>
            <option value="">w&auml;hlen&hellip;</option>
            ${srpeOptions}
          </select>
        </label>
        <label>Dauer (Minuten)<input type="number" id="entryDuration" min="1" max="300" required></label>
        <label>Kommentar (optional)<input type="text" id="entryComment" maxlength="200"></label>
        <button type="submit">Speichern</button>
      </form>
      <p class="notice" id="entryMsg" hidden></p>
    </div>

    <div class="card">
      <h2>Meine letzten Eintr&auml;ge</h2>
      <div class="tablewrap">
        <table>
          <thead><tr><th>Datum</th><th>sRPE</th><th>Dauer</th><th>Load</th><th>Kommentar</th></tr></thead>
          <tbody>${historyRows}</tbody>
        </table>
      </div>
    </div>
  `;

  renderShell(profile, 'loadmanagement', 'Load Management', content);

  document.getElementById('entryForm').onsubmit = async (e) => {
    e.preventDefault();
    const entry_date = document.getElementById('entryDate').value;
    const srpe = parseInt(document.getElementById('entrySrpe').value, 10);
    const duration_min = parseInt(document.getElementById('entryDuration').value, 10);
    const comment = document.getElementById('entryComment').value.trim();

    const { data: { user } } = await sb.auth.getUser();
    const { error } = await sb
      .from('load_entries')
      .upsert(
        { user_id: user.id, entry_date, srpe, duration_min, comment },
        { onConflict: 'user_id,entry_date' }
      );

    const msg = document.getElementById('entryMsg');
    msg.hidden = false;
    msg.textContent = error ? ('Fehler: ' + error.message) : 'Gespeichert.';
    if (!error) {
      renderAthleteDashboard(profile);
    }
  };
}

// ---------------- Start ----------------
// Wichtig: Im Callback selbst keine weiteren Supabase-Aufrufe starten (sonst Deadlock der Auth-Sperre,
// z. B. beim harten Neuladen mit Token-Erneuerung) – deshalb per setTimeout entkoppeln.
let CURRENT_USER_ID = null;
sb.auth.onAuthStateChange((event, session) => {
  setTimeout(() => {
    if (session && (isRecoveryOrInviteLink() || mustChangePassword(session.user))) {
      renderSetPassword();
    } else if (session) {
      // Token-Erneuerung / Profil-Update / erneutes SIGNED_IN desselben Kontos: aktuelle Ansicht behalten
      if (CURRENT_USER_ID === session.user.id && event !== 'INITIAL_SESSION') return;
      CURRENT_USER_ID = session.user.id;
      renderDashboard(session.user);
    } else {
      CURRENT_USER_ID = null;
      renderAuth();
    }
  }, 0);
});
