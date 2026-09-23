// ============================================================
// Balance Movement Training App — Supabase-Version
// ============================================================
const SUPABASE_URL = "https://hbrtzjrhaluoabvfkbkb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhicnR6anJoYWx1b2FidmZrYmtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNDkxMTgsImV4cCI6MjEwNTcyNTExOH0.fSav78jlqCLFBhwObAe5CS3cTlccndJlyDaY640j0nI";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const appEl = document.getElementById('app');

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

function topbar(profile, showBack) {
  return `
    <header class="topbar">
      <div class="brand">Balance Movement <span>Training</span></div>
      <div class="who">
        ${showBack ? '<a href="#" id="backBtn">&larr; Men&uuml;</a> &middot; ' : ''}
        ${esc(profile.name)} (${profile.role === 'trainer' ? 'Trainer' : 'Athlet:in'}) &middot; <a href="#" id="logoutBtn">Abmelden</a>
      </div>
    </header>
  `;
}

function wireLogout(profile) {
  document.getElementById('logoutBtn').onclick = async (e) => {
    e.preventDefault();
    await supabase.auth.signOut();
  };
  const backBtn = document.getElementById('backBtn');
  if (backBtn) {
    backBtn.onclick = (e) => {
      e.preventDefault();
      renderMenu(profile);
    };
  }
}

// ---------------- Login ----------------
// Öffentliche Registrierung ist bewusst deaktiviert (höchster Zugriffsschutz) —
// neue Zugänge legt ausschließlich der Trainer/Administrator an.
function renderAuth() {
  appEl.innerHTML = `
    <main class="login-page">
      <div class="login-card">
        <h1>Balance Movement</h1>
        <p class="sub">Trainings-App</p>
        <form id="loginForm" class="auth-form">
          <label>E-Mail<input type="email" id="loginEmail" required autocomplete="username"></label>
          <label>Passwort<input type="password" id="loginPassword" required autocomplete="current-password"></label>
          <button type="submit">Anmelden</button>
          <p class="error" id="loginError"></p>
        </form>
        <p class="hint" style="margin-top:16px;text-align:center;">Kein Zugang? Wende dich an deinen Trainer — Konten werden ausschließlich persönlich vergeben, es gibt keine Selbstregistrierung.</p>
      </div>
    </main>
  `;

  document.getElementById('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    document.getElementById('loginError').textContent = error ? 'E-Mail oder Passwort falsch.' : '';
  };
}

// ---------------- Dashboard-Router ----------------
async function renderDashboard(user) {
  appEl.innerHTML = `<main class="wrap"><p class="muted">Lade&hellip;</p></main>`;

  const { data: profile, error } = await supabase
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
  appEl.innerHTML = `
    ${topbar(profile, false)}
    <main class="wrap">
      <div class="menu-grid">
        <button class="menu-card" type="button" data-cat="trainingsplan">
          <span class="mc-title">Trainingsplan-Builder</span>
          <span class="mc-sub">Übungen zusammenstellen, als Excel exportieren</span>
        </button>
        <button class="menu-card" type="button" data-cat="loadmanagement">
          <span class="mc-title">Load Management</span>
          <span class="mc-sub">Tägliche sRPE-Werte, Team-Übersicht</span>
        </button>
        <button class="menu-card soon" type="button" disabled>
          <span class="mc-title">Testungen &amp; Assessments</span>
          <span class="mc-sub">Bald verfügbar</span>
        </button>
        <button class="menu-card soon" type="button" disabled>
          <span class="mc-title">Warm-up &amp; Dynamics</span>
          <span class="mc-sub">Bald verfügbar</span>
        </button>
      </div>
    </main>
  `;
  wireLogout(profile);

  appEl.querySelectorAll('.menu-card[data-cat]').forEach(btn => {
    btn.onclick = () => {
      const cat = btn.dataset.cat;
      if (cat === 'trainingsplan') {
        window.location.href = 'trainingsplan.html';
      } else if (cat === 'loadmanagement') {
        if (profile.role === 'trainer') {
          renderTrainerDashboard(profile);
        } else {
          renderAthleteDashboard(profile);
        }
      }
    };
  });
}

// ---------------- Trainer-Ansicht ----------------
async function renderTrainerDashboard(profile) {
  const days = weekDates();
  const dayLabels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  const { data: athletes } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('role', 'athlete')
    .order('name');

  const { data: entries } = await supabase
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

  appEl.innerHTML = `
    ${topbar(profile, true)}
    <main class="wrap">
      <section class="card">
        <h2>Load Management — diese Woche</h2>
        <div class="tablewrap">
          <table>
            <thead><tr><th>Name</th>${dayLabels.map(l => `<th>${l}</th>`).join('')}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <p class="hint">Wert je Zelle = sRPE &times; Trainingsdauer in Minuten (Session-Load nach Foster). Ab 500 farblich hervorgehoben.</p>
      </section>

      <section class="card">
        <h2>Neue Athletin / neuen Athleten aufnehmen</h2>
        <p class="hint">Selbstregistrierung ist aus Sicherheitsgründen deaktiviert. Neue Zugänge werden ausschließlich persönlich vergeben — sag mir einfach Name + gewünschte E-Mail, ich lege das Konto direkt mit sicherem Passwort an, oder lege es selbst im Supabase-Dashboard unter „Authentication → Users" an.</p>
      </section>
    </main>
  `;
  wireLogout(profile);
}

// ---------------- Athlet:in-Ansicht ----------------
async function renderAthleteDashboard(profile) {
  const today = new Date().toISOString().slice(0, 10);

  const { data: rows } = await supabase
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

  appEl.innerHTML = `
    ${topbar(profile, true)}
    <main class="wrap">
      <section class="card">
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
      </section>

      <section class="card">
        <h2>Meine letzten Eintr&auml;ge</h2>
        <div class="tablewrap">
          <table>
            <thead><tr><th>Datum</th><th>sRPE</th><th>Dauer</th><th>Load</th><th>Kommentar</th></tr></thead>
            <tbody>${historyRows}</tbody>
          </table>
        </div>
      </section>
    </main>
  `;
  wireLogout(profile);

  document.getElementById('entryForm').onsubmit = async (e) => {
    e.preventDefault();
    const entry_date = document.getElementById('entryDate').value;
    const srpe = parseInt(document.getElementById('entrySrpe').value, 10);
    const duration_min = parseInt(document.getElementById('entryDuration').value, 10);
    const comment = document.getElementById('entryComment').value.trim();

    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
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
supabase.auth.onAuthStateChange((_event, session) => {
  if (session) {
    renderDashboard(session.user);
  } else {
    renderAuth();
  }
});
