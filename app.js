// ============================================================
// Balance Movement Training App — Supabase-Version
// ============================================================
const SUPABASE_URL = "https://hbrtzjrhaluoabvfkbkb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhicnR6anJoYWx1b2FidmZrYmtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNDkxMTgsImV4cCI6MjEwNTcyNTExOH0.fSav78jlqCLFBhwObAe5CS3cTlccndJlyDaY640j0nI";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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
  { key: 'team', label: 'Nutzerverwaltung', icon: '&#128101;', adminOnly: true },
  { key: 'testungen', label: 'Testungen & Assessments', icon: '&#129514;', soon: true },
  { key: 'warmup', label: 'Warm-up & Dynamics', icon: '&#128293;', soon: true },
];

function renderShell(profile, activeKey, title, contentHtml) {
  const navHtml = NAV_ITEMS
    .filter(item => !item.adminOnly || isAdmin(profile))
    .map(item => {
      const isActive = item.key === activeKey;
      const cls = 'nav-item' + (isActive ? ' active' : '') + (item.soon ? ' disabled' : '');
      const soonTag = item.soon ? '<span class="soon-tag">bald</span>' : '';
      return `<button type="button" class="${cls}" data-nav="${item.key}" ${item.soon ? 'disabled' : ''}>
        <span class="ic">${item.icon}</span>${esc(item.label)}${soonTag}
      </button>`;
    }).join('');

  appEl.innerHTML = `
    <div class="shell">
      <div class="sidebar-scrim" id="sidebarScrim"></div>
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-header">
          <img src="${LOGO_SRC}" alt="Balance Movement">
          <div class="org-sub">Trainings-App</div>
        </div>
        <nav class="sidebar-nav">${navHtml}</nav>
        <div class="sidebar-footer">
          <div class="sidebar-user"><b>${esc(profile.name)}</b>${ROLE_LABELS[profile.role] || ''}</div>
          <button type="button" id="logoutBtn">Abmelden</button>
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
        isStaff(profile) ? renderTrainerDashboard(profile) : renderAthleteDashboard(profile);
      } else if (key === 'team' && isAdmin(profile)) renderTeamPage(profile);
    };
  });

  const sidebar = document.getElementById('sidebar');
  const scrim = document.getElementById('sidebarScrim');
  const toggle = document.getElementById('menuToggle');
  if (toggle) {
    toggle.onclick = () => { sidebar.classList.add('open'); scrim.classList.add('show'); };
    scrim.onclick = () => { sidebar.classList.remove('open'); scrim.classList.remove('show'); };
  }
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

// ---------------- Neues Passwort setzen (nach Einladung oder "Passwort vergessen") ----------------
function renderSetPassword() {
  appEl.innerHTML = `
    <main class="login-page">
      <div class="login-card">
        <div class="login-logo"><img src="${LOGO_SRC}" alt="Balance Movement"></div>
        <h1>Willkommen</h1>
        <p class="sub">Bitte lege dein eigenes Passwort fest (mind. 10 Zeichen).</p>
        <form id="setPwForm" class="auth-form">
          <label>Neues Passwort<input type="password" id="newPassword" required minlength="10" autocomplete="new-password"></label>
          <label>Passwort wiederholen<input type="password" id="newPassword2" required minlength="10" autocomplete="new-password"></label>
          <button type="submit">Passwort speichern</button>
          <p class="error" id="setPwError"></p>
        </form>
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
    const { error } = await sb.auth.updateUser({ password: p1 });
    if (error) {
      errEl.textContent = 'Fehler: ' + error.message;
      return;
    }
    history.replaceState(null, '', window.location.pathname);
    toast('Passwort gespeichert.');
    const { data: { user } } = await sb.auth.getUser();
    if (user) renderDashboard(user);
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
    appEl.innerHTML = `<main class="wrap"><p class="error">Profil konnte nicht geladen werden. Bitte Seite neu laden.</p></main>`;
    return;
  }

  renderMenu(profile);
}

// ---------------- Kategorie-Menü ----------------
function renderMenu(profile) {
  const content = `
    <div class="menu-grid">
      <button class="menu-card" type="button" data-cat="trainingsplan">
        <span class="mc-icon">&#128203;</span>
        <span class="mc-title">Trainingsplanung</span>
        <span class="mc-sub">&Uuml;bungen zusammenstellen, als Excel exportieren</span>
      </button>
      <button class="menu-card" type="button" data-cat="loadmanagement">
        <span class="mc-icon">&#128200;</span>
        <span class="mc-title">Load Management</span>
        <span class="mc-sub">T&auml;gliche sRPE-Werte, Team-&Uuml;bersicht</span>
      </button>
      ${isAdmin(profile) ? `
      <button class="menu-card" type="button" data-cat="team">
        <span class="mc-icon">&#128101;</span>
        <span class="mc-title">Nutzerverwaltung</span>
        <span class="mc-sub">Athlet:innen &amp; Trainer:innen einladen, Rollen verwalten</span>
      </button>` : ''}
      <button class="menu-card soon" type="button" disabled>
        <span class="mc-icon">&#129514;</span>
        <span class="mc-title">Testungen &amp; Assessments</span>
        <span class="mc-sub">Bald verf&uuml;gbar</span>
      </button>
      <button class="menu-card soon" type="button" disabled>
        <span class="mc-icon">&#128293;</span>
        <span class="mc-title">Warm-up &amp; Dynamics</span>
        <span class="mc-sub">Bald verf&uuml;gbar</span>
      </button>
    </div>
  `;

  renderShell(profile, 'menu', 'Dashboard', content);

  appEl.querySelectorAll('.menu-card[data-cat]').forEach(btn => {
    btn.onclick = () => {
      const cat = btn.dataset.cat;
      if (cat === 'trainingsplan') {
        window.location.href = 'trainingsplan.html';
      } else if (cat === 'loadmanagement') {
        isStaff(profile) ? renderTrainerDashboard(profile) : renderAthleteDashboard(profile);
      } else if (cat === 'team' && isAdmin(profile)) {
        renderTeamPage(profile);
      }
    };
  });
}

// ---------------- Trainer-Ansicht: Load Management ----------------
async function renderTrainerDashboard(profile) {
  const days = weekDates();
  const dayLabels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  const { data: athletes } = await sb
    .from('profiles')
    .select('id, name')
    .eq('role', 'athlete')
    .order('name');

  const { data: entries } = await sb
    .from('load_entries')
    .select('user_id, entry_date, srpe, duration_min')
    .in('entry_date', days);

  const byUserDate = {};
  (entries || []).forEach(e => {
    byUserDate[e.user_id] = byUserDate[e.user_id] || {};
    byUserDate[e.user_id][e.entry_date] = e;
  });

  const rows = (athletes && athletes.length)
    ? athletes.map(a => {
        const cells = days.map(d => {
          const e = byUserDate[a.id] && byUserDate[a.id][d];
          const load = e ? e.srpe * e.duration_min : null;
          const cls = load === null ? 'load-empty' : (load >= 500 ? 'load-high' : 'load-ok');
          return `<td class="${cls}">${load === null ? '–' : load}</td>`;
        }).join('');
        return `<tr><td>${esc(a.name)}</td>${cells}</tr>`;
      }).join('')
    : `<tr><td colspan="8" class="muted">Noch keine Athletinnen/Athleten registriert.</td></tr>`;

  const content = `
    <div class="card">
      <h2>Load Management — diese Woche</h2>
      <div class="tablewrap">
        <table>
          <thead><tr><th>Name</th>${dayLabels.map(l => `<th>${l}</th>`).join('')}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="hint">Wert je Zelle = sRPE &times; Trainingsdauer in Minuten (Session-Load nach Foster). Ab 500 farblich hervorgehoben.</p>
    </div>
  `;

  renderShell(profile, 'loadmanagement', 'Load Management', content);
}

// ---------------- Admin-Ansicht: Nutzerverwaltung ----------------
async function renderTeamPage(profile) {
  if (!isAdmin(profile)) { renderMenu(profile); return; }

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
        return `<tr><td>${esc(u.name)}</td><td>${roleCell}</td></tr>`;
      }).join('')
    : `<tr><td colspan="2" class="muted">Noch keine Nutzer:innen.</td></tr>`;

  const content = `
    <div class="card">
      <h2>Neue Person einladen</h2>
      <p class="hint">Selbstregistrierung ist deaktiviert. Name, E-Mail und Rolle w&auml;hlen &mdash; die Person bekommt einen sicheren Einladungslink per E-Mail und legt sich damit ihr eigenes Passwort an.</p>
      <form id="inviteForm" class="inline-form">
        <label>Name<input type="text" id="inviteName" required></label>
        <label>E-Mail<input type="email" id="inviteEmail" required></label>
        <label>Rolle
          <select id="inviteRole">
            <option value="athlete">Athlet:in</option>
            <option value="trainer">Trainer:in</option>
          </select>
        </label>
        <button type="submit">Einladen</button>
      </form>
      <p class="role-hint">Trainer:innen k&ouml;nnen alle Inhalte nutzen (Trainingsplanung, Load-Management-&Uuml;bersicht aller Athlet:innen), aber keine Nutzer einladen oder Rollen &auml;ndern.</p>
      <p class="notice" id="inviteMsg" hidden></p>
      <div id="inviteQrWrap" hidden style="margin-top:16px;text-align:center;">
        <p class="hint">QR-Code zur Anmeldeseite (f&uuml;hrt zum Login, nicht zur Einladung selbst &mdash; die kommt per E-Mail):</p>
        <canvas id="inviteQr"></canvas>
      </div>
    </div>

    <div class="card">
      <h2>Alle Nutzer:innen</h2>
      <div class="tablewrap">
        <table class="user-table">
          <thead><tr><th>Name</th><th>Rolle</th></tr></thead>
          <tbody>${userRows}</tbody>
        </table>
      </div>
      <p class="hint">Rolle &auml;ndern: einfach im Auswahlfeld umstellen, wird sofort gespeichert. Die Admin-Rolle kann nur direkt in Supabase vergeben werden.</p>
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

  document.getElementById('inviteForm').onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('inviteName').value.trim();
    const email = document.getElementById('inviteEmail').value.trim();
    const role = document.getElementById('inviteRole').value;
    const msgEl = document.getElementById('inviteMsg');
    msgEl.hidden = false;
    msgEl.textContent = 'Sende Einladung…';

    const { data, error } = await sb.functions.invoke('invite-user', {
      body: { name, email, role },
    });

    if (error || (data && data.error)) {
      msgEl.textContent = 'Fehler: ' + (data && data.error ? data.error : error.message);
      return;
    }

    msgEl.textContent = 'Einladung an ' + email + ' (' + ROLE_LABELS[role] + ') verschickt.';
    e.target.reset();

    const qrWrap = document.getElementById('inviteQrWrap');
    qrWrap.hidden = false;
    QRCode.toCanvas(document.getElementById('inviteQr'), location.origin + '/', { width: 200 });
  };
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
sb.auth.onAuthStateChange((_event, session) => {
  if (session && isRecoveryOrInviteLink()) {
    renderSetPassword();
  } else if (session) {
    renderDashboard(session.user);
  } else {
    renderAuth();
  }
});
