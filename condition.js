// ============================================================
// Conditioning: Ausdauer-/Konditionseinheiten planen, individuell (vIFT aus 30-15 IFT, HFmax/HFrest)
// in die App veröffentlichen; Athlet:innen sehen persönliche Vorgaben, haken ab, tragen sRPE ein.
// Tabellen: cd_sessions, cd_assignments (personal = Werte beim Veröffentlichen), cd_logs; athletes.hr_max/hr_rest/vift_kmh
// Sprache DE/EN umschaltbar (oben auf jeder Conditioning-Seite, je Gerät gespeichert: localStorage cd_lang).
// Gespeicherte Inhalte (Titel, Notizen, Sportart-Schlüssel) bleiben unverändert, nur die Oberfläche wird übersetzt.
// ============================================================

let CD_LANG = (() => { try { return localStorage.getItem('cd_lang') === 'en' ? 'en' : 'de'; } catch (e) { return 'de'; } })();
const L = (de, en) => CD_LANG === 'en' ? en : de;
const cdLoc = () => CD_LANG === 'en' ? 'en-GB' : 'de-DE';
const cdDec = (n) => CD_LANG === 'en' ? String(n) : String(n).replace('.', ',');
// Umschalter DE/EN (oben rechts auf den Conditioning-Seiten)
function cdLangBar() {
  return `<div class="cd-langbar"><span class="cd-lang" role="group" aria-label="Sprache / Language">
    <button type="button" data-cdlang="de" class="${CD_LANG === 'de' ? 'on' : ''}">DE</button><button type="button" data-cdlang="en" class="${CD_LANG === 'en' ? 'on' : ''}">EN</button></span></div>`;
}
function cdWireLang(rerender) {
  appEl.querySelectorAll('[data-cdlang]').forEach(b => b.onclick = () => {
    if (b.dataset.cdlang === CD_LANG) return;
    CD_LANG = b.dataset.cdlang;
    try { localStorage.setItem('cd_lang', CD_LANG); } catch (e) {}
    rerender();
  });
}

const CD_PHASES = [
  { key: 'warmup', de: 'Warm-Up', en: 'Warm-up', color: '#d9822b' },
  { key: 'main', de: 'Hauptteil', en: 'Main set', color: '#1f9d55' },
  { key: 'cooldown', de: 'Cool-down', en: 'Cool-down', color: '#0ea5a5' },
];
const cdPhaseLabel = (p) => L(p.de, p.en);
// Sportart: gespeichert wird der deutsche Name (Schlüssel), angezeigt je Sprache
// Sportarten / Geräte: gemeinsame, erweiterbare Liste (Cloud: tp_builder_store „cd_modalities“), gilt für alle Methoden und Phasen.
// Im Block wird der deutsche Name gespeichert (+ englischer Name für die Athletenansicht), gelöschte Einträge bleiben in alten Einheiten lesbar.
const CD_MOD_DEFAULT = [
  { de: 'Laufen (Platz/Halle)', en: 'Running (field/gym)' }, { de: 'Laufband', en: 'Treadmill' }, { de: 'Court (Basketball)', en: 'Court (basketball)' },
  { de: 'Rad-Ergometer', en: 'Bike ergometer' }, { de: 'Air Bike', en: 'Air bike' }, { de: 'Assault Bike', en: 'Assault bike' }, { de: 'Echo Bike', en: 'Echo bike' },
  { de: 'Rudern', en: 'Rowing' }, { de: 'SkiErg', en: 'SkiErg' }, { de: 'Crosstrainer', en: 'Elliptical' }, { de: 'Stepper / StairMaster', en: 'Stair climber' },
  { de: 'Schlitten (Sled Push/Pull)', en: 'Sled push/pull' }, { de: 'Schwimmen', en: 'Swimming' }, { de: 'Aqua-Jogging', en: 'Aqua jogging' },
  { de: 'Seilspringen', en: 'Jump rope' }, { de: 'Sonstiges', en: 'Other' },
];
let CD_MODS = CD_MOD_DEFAULT.slice();
let CD_MODS_LOADED = false;
async function cdLoadModalities(force) {
  if (CD_MODS_LOADED && !force) return CD_MODS;
  try {
    const r = await sb.from('tp_builder_store').select('data').eq('key', 'cd_modalities').maybeSingle();
    if (!r.error && r.data && r.data.data && Array.isArray(r.data.data.items) && r.data.data.items.length) CD_MODS = r.data.data.items;
    CD_MODS_LOADED = true;
  } catch (e) {}
  return CD_MODS;
}
async function cdSaveModalities(items) {
  const { data: { user } } = await sb.auth.getUser();
  const r = await sb.from('tp_builder_store').upsert({ key: 'cd_modalities', data: { items }, updated_at: new Date().toISOString(), updated_by: user.id });
  if (!r.error) CD_MODS = items;
  return r;
}
// Anzeige: im Block gespeicherter Name (DE) bzw. englischer Name aus Block oder Liste
function cdModLabel(m, en) {
  if (CD_LANG !== 'en') return m || '';
  if (en) return en;
  const x = CD_MODS.find(y => y.de === m) || CD_MOD_DEFAULT.find(y => y.de === m);
  return x && x.en ? x.en : (m || '');
}
const CD_INT_TYPES = [
  { key: 'vift', de: '% vIFT (30-15)', en: '% vIFT (30-15)', unit: '%' },
  { key: 'hrmax', de: '% HFmax', en: '% HRmax', unit: '%' },
  { key: 'hrzone', de: 'HF-Zone (1–5)', en: 'HR zone (1–5)', unit: 'Zone' },
  { key: 'hrr', de: '% HF-Reserve (Karvonen)', en: '% HR reserve (Karvonen)', unit: '%' },
  { key: 'watt', de: 'Watt', en: 'Watts', unit: 'W' },
  { key: 'speed', de: 'km/h', en: 'km/h', unit: 'km/h' },
  { key: 'pace', de: 'Pace (min/km)', en: 'Pace (min/km)', unit: 'min/km' },
  { key: 'rpe', de: 'RPE (1–10)', en: 'RPE (1–10)', unit: 'RPE' },
  { key: 'allout', de: 'maximal (all-out)', en: 'maximal (all-out)', unit: '' },
];
const CD_INT = Object.fromEntries(CD_INT_TYPES.map(t => [t.key, t]));
const CD_ZONES = { 1: [50, 60], 2: [60, 70], 3: [70, 80], 4: [80, 90], 5: [90, 100] };
// Methoden mit sinnvollen Startwerten (werden beim Auswählen übernommen und sind danach frei änderbar)
const CD_METHODS = [
  { key: 'dauer', de: 'Dauermethode (GA1, locker)', en: 'Continuous (easy aerobic)', d: { sets: 1, reps: 1, work: [30, 'min'], rest: [0, 's'], setRest: [0, 's'], int: ['hrmax', 65, 75] } },
  { key: 'tempodauer', de: 'Tempodauerlauf / Schwelle', en: 'Tempo run / threshold', d: { sets: 1, reps: 1, work: [20, 'min'], rest: [0, 's'], setRest: [0, 's'], int: ['hrmax', 85, 90] } },
  { key: 'fahrtspiel', de: 'Fahrtspiel', en: 'Fartlek', d: { sets: 1, reps: 1, work: [25, 'min'], rest: [0, 's'], setRest: [0, 's'], int: ['rpe', 5, 8] } },
  { key: 'extint', de: 'Extensive Intervalle', en: 'Extensive intervals', d: { sets: 1, reps: 6, work: [3, 'min'], rest: [90, 's'], setRest: [0, 's'], int: ['hrmax', 80, 85] } },
  { key: 'intint', de: 'Intensive Intervalle', en: 'Intensive intervals', d: { sets: 1, reps: 5, work: [2, 'min'], rest: [2, 'min'], setRest: [0, 's'], int: ['hrmax', 88, 92] } },
  { key: 'hiitlong', de: 'HIIT lang (z. B. 4 × 4 min)', en: 'HIIT long (e.g. 4 × 4 min)', d: { sets: 1, reps: 4, work: [4, 'min'], rest: [3, 'min'], setRest: [0, 's'], int: ['hrmax', 90, 95] } },
  { key: 'hiit1515', de: 'HIIT kurz 15/15', en: 'HIIT short 15/15', d: { sets: 2, reps: 10, work: [15, 's'], rest: [15, 's'], setRest: [3, 'min'], int: ['vift', 90, 95] } },
  { key: 'hiit3030', de: 'HIIT kurz 30/30', en: 'HIIT short 30/30', d: { sets: 2, reps: 8, work: [30, 's'], rest: [30, 's'], setRest: [3, 'min'], int: ['vift', 85, 90] } },
  { key: 'tabata', de: 'Tabata 20/10', en: 'Tabata 20/10', d: { sets: 1, reps: 8, work: [20, 's'], rest: [10, 's'], setRest: [0, 's'], int: ['rpe', 9, 10] } },
  { key: 'sit', de: 'Sprint-Intervalle (SIT)', en: 'Sprint intervals (SIT)', d: { sets: 1, reps: 6, work: [30, 's'], rest: [4, 'min'], setRest: [0, 's'], int: ['allout', '', ''] } },
  { key: 'rsa', de: 'Repeated Sprints (RSA)', en: 'Repeated sprints (RSA)', d: { sets: 3, reps: 6, work: [20, 'm'], rest: [20, 's'], setRest: [3, 'min'], int: ['allout', '', ''] } },
  { key: 'court', de: 'Court-Shuttles / Suicides', en: 'Court shuttles / suicides', d: { sets: 3, reps: 4, work: [30, 's'], rest: [30, 's'], setRest: [2, 'min'], int: ['rpe', 8, 9] } },
  { key: 'frei', de: 'Frei (eigene Vorgabe)', en: 'Custom', d: { sets: 1, reps: 1, work: [10, 'min'], rest: [0, 's'], setRest: [0, 's'], int: ['rpe', '', ''] } },
];
// Szenarien-Bibliothek (Methoden-Vorlagen): Standardliste + eigene Vorlagen, gemeinsam für alle Trainer:innen
// (Cloud: tp_builder_store „cd_methods“). Eigene Vorlagen speichern zusätzlich Inhalt, HF-Kontrolle und Hinweis.
// Im Block werden Schlüssel + Name (mDe/mEn) gespeichert, damit gelöschte Vorlagen und die Athletenansicht lesbar bleiben.
let CD_METHOD_LIST = CD_METHODS.slice();
let CD_METHOD = Object.fromEntries(CD_METHOD_LIST.map(m => [m.key, m]));
let CD_METHODS_LOADED = false;
function cdSetMethods(items) { CD_METHOD_LIST = items; CD_METHOD = Object.fromEntries(items.map(m => [m.key, m])); }
async function cdLoadMethods(force) {
  if (CD_METHODS_LOADED && !force) return CD_METHOD_LIST;
  try {
    const r = await sb.from('tp_builder_store').select('data').eq('key', 'cd_methods').maybeSingle();
    if (!r.error && r.data && r.data.data && Array.isArray(r.data.data.items) && r.data.data.items.length) cdSetMethods(r.data.data.items);
    CD_METHODS_LOADED = true;
  } catch (e) {}
  return CD_METHOD_LIST;
}
async function cdSaveMethods(items) {
  const { data: { user } } = await sb.auth.getUser();
  const r = await sb.from('tp_builder_store').upsert({ key: 'cd_methods', data: { items }, updated_at: new Date().toISOString(), updated_by: user.id });
  if (!r.error) cdSetMethods(items);
  return r;
}
const cdMethodLabel = (k, short) => { const m = CD_METHOD[k] || CD_METHODS.find(x => x.key === k); if (!m) return 'Block'; const t = L(m.de, m.en || m.de); return short ? t.split(' (')[0] : t; };
// Bezeichnung eines Blocks: gespeicherter Vorlagenname, sonst aus der Liste
const cdBLabel = (b, short) => { if (b && b.mDe && !CD_METHOD[b.method]) { const t = L(b.mDe, b.mEn || b.mDe); return short ? t.split(' (')[0] : t; } return cdMethodLabel(b && b.method, short); };
// Standard-Titel eines Plan-Tages (alte Pläne: „Einheit n“)
const CD_DEF_TITLE_RE = /^(Woche|Week) \d+ · (Einheit|Session|Tag|Day) \d+$/;
const cdDefTitle = (w, n) => `${L('Woche', 'Week')} ${w} · ${L('Tag', 'Day')} ${n}`;
// Vorlage auf einen Block anwenden
function cdApplyMethod(b, m) {
  const d = m.d || {};
  b.method = m.key; b.mDe = m.de; b.mEn = m.en || m.de;
  Object.assign(b, { sets: d.sets ?? 1, reps: d.reps ?? 1, work: { v: (d.work || [])[0] ?? '', u: (d.work || [])[1] || 'min' }, rest: { v: (d.rest || [])[0] ?? 0, u: (d.rest || [])[1] || 's' },
    setRest: { v: (d.setRest || [])[0] ?? 0, u: (d.setRest || [])[1] || 's' }, int: { type: (d.int || [])[0] || 'rpe', min: (d.int || [])[1] ?? '', max: (d.int || [])[2] ?? '' } });
  if (d.hr) b.hr = { min: d.hr[0] ?? '', max: d.hr[1] ?? '' };
  if (d.content) b.content = d.content;
  if (d.note) b.note = d.note;
}
// Block → Vorlagen-Werte
function cdBlockToD(b) {
  return { sets: b.sets, reps: b.reps, work: [b.work.v, b.work.u], rest: [b.rest.v, b.rest.u], setRest: [b.setRest.v, b.setRest.u], int: [b.int.type, b.int.min, b.int.max],
    hr: [(b.hr || {}).min || '', (b.hr || {}).max || ''], content: b.content || '', note: b.note || '' };
}

// ---------- Rechenhilfen ----------
function cdNum(v) { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? null : n; }
function cdSec(v, u) { const n = cdNum(v); if (n == null) return null; return u === 'min' ? n * 60 : (u === 's' ? n : null); }
function cdFmtDur(sec) { if (sec == null) return '–'; const m = Math.floor(sec / 60), s = Math.round(sec % 60); return s ? `${m}:${String(s).padStart(2, '0')} min` : `${m} min`; }
function cdFmtVal(v, u) { const n = cdNum(v); if (n == null) return ''; return `${cdDec(n)} ${u}`; }
function cdPaceToSec(p) { const m = String(p || '').match(/^(\d+):(\d{1,2})$/); return m ? +m[1] * 60 + +m[2] : null; }
function cdRange(a, b, u) { const x = String(a ?? '').trim(), y = String(b ?? '').trim(); if (!x && !y) return ''; return (x && y && x !== y ? `${x}–${y}` : (x || y)) + (u ? ' ' + u : ''); }
function cdNewId() { return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function cdDate(iso, opts) { return iso ? new Date(iso + 'T00:00:00').toLocaleDateString(cdLoc(), opts) : ''; }
function cdNewBlock(phase, methodKey) {
  const mk = methodKey || (phase === 'main' ? 'hiit1515' : 'dauer');
  const m = CD_METHOD[mk] || CD_METHODS.find(x => x.key === mk) || CD_METHODS[0];
  const d = m.d;
  // Sportart/Gerät steht seit 10/2026 im Feld „Inhalt / Übung“ (modality bleibt nur in älteren Blöcken)
  const b = { id: cdNewId(), phase, method: m.key, mDe: m.de, mEn: m.en, content: '', modality: '', modalityEn: '', sets: d.sets, reps: d.reps,
    work: { v: d.work[0], u: d.work[1] }, rest: { v: d.rest[0], u: d.rest[1] }, setRest: { v: d.setRest[0], u: d.setRest[1] },
    int: { type: d.int[0], min: d.int[1], max: d.int[2] }, hr: { min: '', max: '' }, note: '' };
  if (phase !== 'main') { b.work = { v: phase === 'warmup' ? 10 : 8, u: 'min' }; b.int = { type: 'hrmax', min: 60, max: 70 }; b.method = 'dauer'; b.mDe = CD_METHODS[0].de; b.mEn = CD_METHODS[0].en; b.sets = 1; b.reps = 1; }
  return b;
}
// Pyramiden / Einzelzeiten: Belastung und Pause dürfen mehrere Werte enthalten, z. B. „45-60-75-90-75-60-45“
// (Trenner - / ; oder Leerzeichen; Komma bleibt Dezimalzeichen). Belastungsliste = eine Wiederholung je Wert (Wdh = Anzahl),
// Pausenliste gilt der Reihe nach für die Pausen dazwischen (kürzere Liste wird wiederholt).
function cdList(v) {
  const p = String(v ?? '').trim().split(/\s*[-–/;]\s*|\s+/).filter(x => x !== '');
  if (p.length < 2) return null;
  const n = p.map(cdNum);
  return n.every(x => x != null) ? n : null;
}
function cdSecs(v, u) { const l = cdList(v); if (!l) return null; return u === 'min' ? l.map(x => x * 60) : (u === 's' ? l : null); }
// Belastung je Wiederholung (Werte in Einheit), Pause nach Wiederholung i
function cdWorkVals(b) { const l = cdList(b.work.v); if (l) return l; const n = cdNum(b.work.v); const reps = Math.max(1, cdNum(b.reps) || 1); return n == null ? null : Array(reps).fill(n); }
function cdRestAt(b, i) { const l = cdList(b.rest.v); if (l) return l[i % l.length]; return cdNum(b.rest.v); }
const cdIsSeq = (b) => !!(cdList(b.work.v) || cdList(b.rest.v));
// Gesamtdauer eines Blocks (s); bei Belastung in Metern ohne Tempo nicht bestimmbar
function cdBlockSec(b, workSecOverride) {
  const sets = Math.max(1, cdNum(b.sets) || 1);
  const sr = cdSec(b.setRest.v, b.setRest.u) || 0;
  if (cdIsSeq(b)) {
    const wv = cdWorkVals(b); if (!wv) return null;
    const ws = workSecOverride != null ? wv.map(() => workSecOverride) : wv.map(x => cdSec(x, b.work.u));
    if (ws.some(x => x == null)) return null;
    let one = 0;
    ws.forEach((w, i) => { one += w; if (i < ws.length - 1) one += cdSec(cdRestAt(b, i), b.rest.u) || 0; });
    return sets * one + (sets - 1) * sr;
  }
  const reps = Math.max(1, cdNum(b.reps) || 1);
  const w = workSecOverride != null ? workSecOverride : cdSec(b.work.v, b.work.u);
  const r = cdSec(b.rest.v, b.rest.u) || 0;
  if (w == null) return null;
  return sets * reps * w + sets * (reps - 1) * r + (sets - 1) * sr;
}
function cdStructText(b) {
  const sets = cdNum(b.sets) || 1, reps = cdNum(b.reps) || 1;
  let t;
  if (cdIsSeq(b)) {
    const wv = cdWorkVals(b) || [];
    const wl = cdList(b.work.v), rl = cdList(b.rest.v);
    t = (wl ? L('Pyramide ', 'Pyramid ') + wl.map(cdDec).join('-') + ' ' + b.work.u : `${wv.length} × ${cdFmtVal(b.work.v, b.work.u)}`)
      + (rl ? ` / ${rl.map(cdDec).join('-')} ${b.rest.u} ${L('Pause', 'rest')}` : (cdNum(b.rest.v) ? ` / ${cdFmtVal(b.rest.v, b.rest.u)} ${L('Pause', 'rest')}` : ''));
  } else {
    const w = cdFmtVal(b.work.v, b.work.u), r = cdNum(b.rest.v) ? cdFmtVal(b.rest.v, b.rest.u) : '';
    t = (reps > 1 ? `${reps} × ${w}` : w) + (r && reps > 1 ? ` / ${r} ${L('Pause', 'rest')}` : '');
  }
  if (sets > 1) t = L(`${sets} Serien à ${t}`, `${sets} sets of ${t}`) + (cdNum(b.setRest.v) ? ` · ${cdFmtVal(b.setRest.v, b.setRest.u)} ${L('Serienpause', 'between sets')}` : '');
  return t;
}
// Ablauf Schritt für Schritt (für Athletenansicht): „1. 45 s → 90 s Pause · 2. 60 s → 120 s Pause …“
function cdSeqSteps(b, metresOf) {
  if (!cdIsSeq(b)) return null;
  const wv = cdWorkVals(b); if (!wv) return null;
  return wv.map((w, i) => ({ n: i + 1, work: `${cdDec(w)} ${b.work.u}`, extra: metresOf ? metresOf(w) : '', rest: i < wv.length - 1 && cdNum(cdRestAt(b, i)) ? `${cdDec(cdRestAt(b, i))} ${b.rest.u}` : '' }));
}
function cdSeqHtml(b, p) {
  // persönliche Strecke je Belastung bei % vIFT
  let mOf = null;
  const i = b.int || {}, lo = cdNum(i.min), hi = cdNum(i.max) ?? lo;
  if (p && i.type === 'vift' && cdNum(p.vift) && (lo ?? hi) != null) {
    const v1 = p.vift * (lo ?? hi) / 100, v2 = p.vift * hi / 100;
    mOf = (w) => { const ws = cdSec(w, b.work.u); if (ws == null) return ''; const m1 = Math.round(v1 / 3.6 * ws / 5) * 5, m2 = Math.round(v2 / 3.6 * ws / 5) * 5; return `≈ ${m1}${m2 !== m1 ? '–' + m2 : ''} m`; };
  }
  const st = cdSeqSteps(b, mOf); if (!st) return '';
  return `<ol class="cd-seq">${st.map(x => `<li><b>${esc(x.work)}</b>${x.extra ? ` <span class="muted-inline">${esc(x.extra)}</span>` : ''}${x.rest ? ` <span class="cd-seqrest">&rarr; ${esc(x.rest)} ${L('Pause', 'rest')}</span>` : ''}</li>`).join('')}</ol>`;
}
function cdIntText(b) {
  const i = b.int || {}, t = CD_INT[i.type];
  let s = !t ? '' : (i.type === 'allout' ? L('maximal (all-out)', 'maximal (all-out)') : (i.type === 'hrzone' ? L('HF-Zone ', 'HR zone ') + cdRange(i.min, i.max, '') : cdRange(i.min, i.max, t.unit)));
  if (s && ['vift', 'hrmax', 'hrr'].includes(i.type)) s += ' ' + { vift: 'vIFT', hrmax: L('HFmax', 'HRmax'), hrr: L('HF-Reserve', 'HR reserve') }[i.type];
  const h = b.hr || {};
  if (cdNum(h.min) || cdNum(h.max)) s += (s ? ' · ' : '') + L('HF ', 'HR ') + cdRange(h.min, h.max, L('% HFmax', '% HRmax'));
  return s;
}
// ---------- Wissenschaftliche Standards / Rückfallwerte, wenn keine Messwerte vorliegen ----------
// HFmax geschätzt nach Tanaka et al. 2001: 208 − 0,7 × Alter (Streuung ca. ± 10 Schläge; gemessene HFmax ist immer besser)
function cdAge(birthdate) { if (!birthdate) return null; const b = new Date(birthdate + 'T00:00:00'), n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a > 5 && a < 100 ? a : null; }
function cdHrMaxEst(age) { return age ? Math.round(208 - 0.7 * age) : null; }
// Borg CR10 + Sprechtest als Ersatz, wenn keine persönlichen Werte berechnet werden können
const CD_TALK = {
  2: ['lockeres Gespräch möglich', 'easy conversation'], 4: ['Unterhaltung möglich', 'can hold a conversation'],
  6: ['nur kurze Sätze', 'short sentences only'], 8: ['nur einzelne Worte', 'single words only'], 10: ['Sprechen nicht möglich', 'cannot speak'],
};
function cdRpeEquiv(b) {
  const i = b.int || {}, lo = cdNum(i.min), hi = cdNum(i.max) ?? lo, v = lo ?? hi;
  if (v == null && i.type !== 'allout') return null;
  const band = (x, t) => { for (const [lim, r] of t) if (x < lim) return r; return t[t.length - 1][1]; };
  let r = null;
  if (i.type === 'allout') r = [10, 10];
  else if (i.type === 'vift') { const t = [[75, [3, 4]], [85, [5, 6]], [90, [7, 8]], [100, [8, 9]], [999, [9, 10]]]; r = [band(v, t)[0], band(hi, t)[1]]; }
  else if (i.type === 'hrmax') { const t = [[60, [1, 2]], [70, [3, 4]], [80, [5, 6]], [90, [7, 8]], [999, [9, 10]]]; r = [band(v, t)[0], band(hi, t)[1]]; }
  else if (i.type === 'hrzone') { const z = { 1: [1, 2], 2: [3, 4], 3: [5, 6], 4: [7, 8], 5: [9, 10] }; r = [(z[Math.round(v)] || [5])[0], (z[Math.round(hi)] || [6, 6])[1]]; }
  else if (i.type === 'hrr') { const t = [[40, [1, 2]], [60, [3, 4]], [80, [5, 6]], [90, [7, 8]], [999, [9, 10]]]; r = [band(v, t)[0], band(hi, t)[1]]; }
  if (!r) return null;
  const tk = CD_TALK[Math.min(10, Math.max(2, Math.ceil(r[0] / 2) * 2))];
  const talk = tk ? L(tk[0], tk[1]) : '';
  return `≈ RPE ${r[0] === r[1] ? r[0] : r[0] + '–' + r[1]} (Borg CR10)${talk ? ' · ' + L('Sprechtest: ', 'Talk test: ') + talk : ''}`;
}
// Persönliche Vorgabe aus vIFT/HFmax/HFrest: { text, workSec, est, fallback }
function cdPersonalText(b, p) {
  p = Object.assign({}, p || {});
  let est = false;
  if (!cdNum(p.hr_max) && cdNum(p.age)) { p.hr_max = cdHrMaxEst(cdNum(p.age)); est = true; }
  const i = b.int || {}, out = [];
  const HR = L('Puls', 'HR');
  let workSec = null, usedHr = false;
  const lo = cdNum(i.min), hi = cdNum(i.max) ?? lo, loV = lo ?? hi;
  if (i.type === 'vift' && cdNum(p.vift) && loV != null) {
    const v1 = p.vift * loV / 100, v2 = p.vift * hi / 100;
    out.push(`${cdDec(v1.toFixed(1))}${v2 !== v1 ? '–' + cdDec(v2.toFixed(1)) : ''} km/h`);
    const ws = cdIsSeq(b) ? null : cdSec(b.work.v, b.work.u);
    if (cdList(b.work.v)) out.push(L('Strecke je Belastung siehe Ablauf', 'distance per rep: see steps'));
    else if (ws != null) { const m1 = Math.round(v1 / 3.6 * ws / 5) * 5, m2 = Math.round(v2 / 3.6 * ws / 5) * 5; out.push(`≈ ${m1}${m2 !== m1 ? '–' + m2 : ''} ${L('m je Belastung', 'm per rep')}`); }
    else if (b.work.u === 'm' && cdNum(b.work.v)) { workSec = cdNum(b.work.v) / (v1 / 3.6); out.push(`≈ ${Math.round(workSec)} s ${L('je', 'per')} ${cdNum(b.work.v)} m`); }
  } else if ((i.type === 'hrmax' || i.type === 'hrzone') && cdNum(p.hr_max) && loV != null) {
    const pr = i.type === 'hrzone' ? [CD_ZONES[Math.round(loV)] ? CD_ZONES[Math.round(loV)][0] : null, CD_ZONES[Math.round(hi)] ? CD_ZONES[Math.round(hi)][1] : null] : [loV, hi];
    if (pr[0] != null) { out.push(`${HR} ${Math.round(p.hr_max * pr[0] / 100)}–${Math.round(p.hr_max * pr[1] / 100)}`); usedHr = true; }
  } else if (i.type === 'hrr' && cdNum(p.hr_max) && cdNum(p.hr_rest) && loV != null) {
    const r = p.hr_max - p.hr_rest;
    out.push(`${HR} ${Math.round(p.hr_rest + r * loV / 100)}–${Math.round(p.hr_rest + r * hi / 100)}`); usedHr = true;
  }
  const h = b.hr || {};
  if (cdNum(p.hr_max) && (cdNum(h.min) || cdNum(h.max))) {
    const a = cdNum(h.min) ?? cdNum(h.max), c = cdNum(h.max) ?? a;
    out.push(`${HR} ${Math.round(p.hr_max * a / 100)}–${Math.round(p.hr_max * c / 100)}`); usedHr = true;
  }
  if (est && usedHr) out.push(L('HFmax geschätzt', 'HRmax estimated'));
  // keine persönliche Umrechnung möglich → Richtwert nach Borg-Skala + Sprechtest
  if (!out.length && ['vift', 'hrmax', 'hrzone', 'hrr', 'allout'].includes(i.type)) { const r = cdRpeEquiv(b); if (r) return { text: r, workSec, est, fallback: true }; }
  return { text: out.join(' · '), workSec, est };
}
const CD_SOURCES_REFS = `Buchheit M. (2008) The 30-15 Intermittent Fitness Test: accuracy for individualizing interval training of young intermittent sport players. J Strength Cond Res 22(2):365&ndash;374 &middot; Buchheit M, Laursen PB (2013) High-intensity interval training, solutions to the programming puzzle, Part I. Sports Med 43:313&ndash;338 &middot; Tanaka H, Monahan KD, Seals DR (2001) Age-predicted maximal heart rate revisited. J Am Coll Cardiol 37:153&ndash;156 &middot; Karvonen MJ, Kentala E, Mustala O (1957) The effects of training on heart rate. Ann Med Exp Biol Fenn 35:307&ndash;315 &middot; Helgerud J et al. (2007) Aerobic high-intensity intervals improve VO2max more than moderate training. Med Sci Sports Exerc 39:665&ndash;671 &middot; Seiler S (2010) What is best practice for training intensity and duration distribution in endurance athletes? Int J Sports Physiol Perform 5:276&ndash;291 &middot; Borg GA (1982) Psychophysical bases of perceived exertion. Med Sci Sports Exerc 14:377&ndash;381 &middot; Foster C et al. (2001) A new approach to monitoring exercise training. J Strength Cond Res 15:109&ndash;115.`;
function cdSourcesHtml() {
  if (CD_LANG === 'en') return `
  <details class="lm-refs cd-refs"><summary>&#128218; Methods &amp; sources <span>(gold standards &amp; guide values without test data)</span></summary>
  <div class="cd-refs-body">
    <p><b>Speed: 30-15 Intermittent Fitness Test (vIFT)</b> &ndash; intervals are prescribed as % of the final running speed vIFT, giving each athlete a personal speed and distance per rep (e.g. 15/15 at 90&ndash;95&nbsp;% vIFT, 30/30 at 85&ndash;90&nbsp;%). Gold standard for intermittent team sports because changes of direction and recovery ability are included.</p>
    <p><b>Heart rate</b> &ndash; the gold standard is the <b>measured HRmax</b> (chest strap, highest value at the end of a maximal test such as the final 30-15 IFT stage). Without a measurement it is estimated with <b>Tanaka: 208 &minus; 0.7 &times; age</b> (spread approx. &plusmn;&nbsp;10 bpm &ndash; therefore marked &ldquo;estimated&rdquo;). The heart-rate-reserve method (<b>Karvonen</b>) also uses the resting heart rate measured in the morning and is more precise than % HRmax.</p>
    <p><b>Zones</b> &ndash; 5 zones in % HRmax (Z1 50&ndash;60, Z2 60&ndash;70, Z3 70&ndash;80, Z4 80&ndash;90, Z5 90&ndash;100&nbsp;%); the 3-zone model (Seiler) groups them around the thresholds. Long HIIT according to Helgerud: 4&nbsp;&times;&nbsp;4&nbsp;min at 90&ndash;95&nbsp;% HRmax, 3&nbsp;min active recovery.</p>
    <p><b>Without test data</b> (neither vIFT nor HRmax/age): prescription via perceived exertion (<b>Borg CR10</b>) and the <b>talk test</b> &ndash; e.g. HIIT &asymp; RPE 8&ndash;9, &ldquo;single words only&rdquo;; easy continuous &asymp; RPE 3&ndash;4, &ldquo;can hold a conversation&rdquo;. The load of the whole session is recorded as <b>session RPE</b> (RPE &times; duration) in Load Management.</p>
    <p class="hint">Sources: ${CD_SOURCES_REFS}</p>
  </div></details>`;
  return `
  <details class="lm-refs cd-refs"><summary>&#128218; Methodik &amp; Quellen <span>(Goldstandards &amp; Richtwerte ohne Messdaten)</span></summary>
  <div class="cd-refs-body">
    <p><b>Tempo: 30-15 Intermittent Fitness Test (vIFT)</b> &ndash; Intervalle werden in % der Endgeschwindigkeit vIFT vorgegeben; daraus ergeben sich pers&ouml;nliches Tempo und Strecke je Belastung (z.&nbsp;B. 15/15 bei 90&ndash;95&nbsp;% vIFT, 30/30 bei 85&ndash;90&nbsp;%). Goldstandard f&uuml;r intermittierende Teamsportarten, da Richtungswechsel und Erholungsf&auml;higkeit mit erfasst werden.</p>
    <p><b>Herzfrequenz</b> &ndash; Goldstandard ist die <b>gemessene HFmax</b> (Brustgurt, h&ouml;chster Wert am Ende eines Maximaltests wie der 30-15-IFT-Endstufe). Ohne Messung wird sie nach <b>Tanaka: 208 &minus; 0,7 &times; Alter</b> gesch&auml;tzt (Streuung ca. &plusmn;&nbsp;10 Schl&auml;ge &ndash; daher als &bdquo;gesch&auml;tzt&ldquo; markiert). Die HF-Reserve-Methode (<b>Karvonen</b>) ber&uuml;cksichtigt zus&auml;tzlich den morgens gemessenen Ruhepuls und ist genauer als % HFmax.</p>
    <p><b>Zonen</b> &ndash; 5 Zonen in % HFmax (Z1 50&ndash;60, Z2 60&ndash;70, Z3 70&ndash;80, Z4 80&ndash;90, Z5 90&ndash;100&nbsp;%); das 3-Zonen-Modell (Seiler) fasst sie um die Schwellen zusammen. HIIT lang nach Helgerud: 4&nbsp;&times;&nbsp;4&nbsp;min bei 90&ndash;95&nbsp;% HFmax, 3&nbsp;min aktive Pause.</p>
    <p><b>Ohne Messwerte</b> (weder vIFT noch HFmax/Alter): Vorgabe &uuml;ber das subjektive Anstrengungsempfinden (<b>Borg CR10</b>) und den <b>Sprechtest</b> &ndash; z.&nbsp;B. HIIT &asymp; RPE 8&ndash;9, &bdquo;nur einzelne Worte&ldquo;; lockere Dauer &asymp; RPE 3&ndash;4, &bdquo;Unterhaltung m&ouml;glich&ldquo;. Die Belastung der ganzen Einheit wird als <b>Session-RPE</b> (RPE &times; Dauer) im Load Management erfasst.</p>
    <p class="hint">Quellen: ${CD_SOURCES_REFS}</p>
  </div></details>`;
}
function cdSessionSec(content) {
  let t = 0, unknown = false;
  (content.blocks || []).forEach(b => { const s = cdBlockSec(b); if (s == null) unknown = true; else t += s; });
  return { sec: t, unknown };
}

// ============================================================
// Admin/Trainer: Übersicht
// ============================================================
async function renderConditionHub(profile) {
  const T = 'Conditioning';
  renderShell(profile, 'trainingsplan', T, `<p class="muted">${L('Lade', 'Loading')}&hellip;</p>`, { label: 'Trainingsplanung', go: () => renderTpHub(profile) });
  const [sRes, aRes, lRes, prRes, plRes] = await Promise.all([
    sb.from('cd_sessions').select('*').eq('archived', false).order('planned_date', { ascending: false, nullsFirst: true }).order('created_at', { ascending: false }),
    sb.from('cd_assignments').select('session_id, user_id, active').eq('active', true),
    sb.from('cd_logs').select('session_id, user_id, completed, srpe, duration_min'),
    sb.from('profiles').select('id, name'),
    sb.from('cd_plans').select('*').eq('archived', false).order('created_at', { ascending: false }),
  ]);
  const err = [sRes, aRes, lRes, prRes].map(r => r.error).filter(Boolean)[0];
  if (err) { renderShell(profile, 'trainingsplan', T, `<div class="card"><p class="error">${L('Fehler', 'Error')}: ${esc(err.message)}${/cd_sessions|relation/.test(err.message) ? '<br>' + L('Die Datenbank f&uuml;r Conditioning ist noch nicht eingerichtet (Migration supabase_migration_condition.sql).', 'The Conditioning database is not set up yet (migration supabase_migration_condition.sql).') : ''}</p></div>`); return; }
  const names = Object.fromEntries((prRes.data || []).map(p => [p.id, p.name]));
  const today = new Date().toISOString().slice(0, 10);
  const plans = plRes.error ? null : (plRes.data || []);
  const planCards = (plans || []).map(pl => {
    const ss = (sRes.data || []).filter(s => s.plan_id === pl.id);
    const as = (aRes.data || []).filter(a => ss.some(s => s.id === a.session_id));
    const done = (lRes.data || []).filter(l => l.completed && ss.some(s => s.id === l.session_id)).length;
    const cw = cdPlanWeekNow(pl);
    return `<div class="card cd-card cd-plancard">
      <div class="tpo-head">
        <div><div class="tpo-title">&#128197; ${esc(pl.title || L('Conditioning-Plan', 'Conditioning plan'))}</div>
          <div class="muted-inline">${pl.for_name ? L('f&uuml;r ', 'for ') + '<b>' + esc(pl.for_name) + '</b> &middot; ' : ''}${pl.weeks} ${L('Wochen', 'weeks')} &times; ${pl.per_week} ${L('Tage', 'days')}${pl.start_date ? ' &middot; ' + L('ab ', 'from ') + cdDate(pl.start_date) : ''} &middot; ${ss.length}/${pl.weeks * pl.per_week} ${L('geplant', 'planned')}</div></div>
        <span class="tpo-week">${(pl.members || []).length ? `${L('Woche', 'Week')} ${cw} &middot; ${done} ${L('erledigt', 'done')}` : L('nicht ver&ouml;ffentlicht', 'not published')}</span>
      </div>
      ${(pl.members || []).length ? `<div class="tpo-people">${pl.members.map(u => `<span class="tpo-chip static">${esc(names[u] || '?')}</span>`).join('')}</div>` : ''}
      <div class="tpo-actions">
        <button type="button" class="small-btn" data-plan="${pl.id}">&#128197; ${L('&Ouml;ffnen', 'Open')}</button>
        <button type="button" class="danger small-btn" data-pldel="${pl.id}">&#128465; ${L('L&ouml;schen', 'Delete')}</button>
      </div></div>`;
  }).join('');
  const cards = (sRes.data || []).filter(s => !s.plan_id).map(s => {
    const as = (aRes.data || []).filter(a => a.session_id === s.id);
    const done = (lRes.data || []).filter(l => l.session_id === s.id && l.completed).length;
    const dur = cdSessionSec(s.content || {});
    const past = s.planned_date && s.planned_date < today;
    return `<div class="card cd-card${past ? ' past' : ''}">
      <div class="tpo-head">
        <div><div class="tpo-title">${esc(s.title || L('Conditioning-Einheit', 'Conditioning session'))}</div>
          <div class="muted-inline">${s.planned_date ? cdDate(s.planned_date, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) : L('ohne Datum', 'no date')}${s.content && s.content.forName ? ' &middot; ' + L('f&uuml;r ', 'for ') + '<b>' + esc(s.content.forName) + '</b>' : ''}${s.team ? ' &middot; ' + esc(s.team) : ''} &middot; ${(s.content.blocks || []).length} ${L('Bl&ouml;cke', 'blocks')} &middot; ${dur.sec ? '&asymp; ' + Math.round(dur.sec / 60) + ' min' : ''}${dur.unknown ? ' +' : ''}</div></div>
        <span class="tpo-week">${as.length ? `${done}/${as.length} ${L('erledigt', 'done')}` : L('nicht ver&ouml;ffentlicht', 'not published')}</span>
      </div>
      ${as.length ? `<div class="tpo-people">${as.map(a => `<span class="tpo-chip static">${esc(names[a.user_id] || '?')}</span>`).join('')}</div>` : ''}
      <div class="tpo-actions">
        <button type="button" class="small-btn" data-edit="${s.id}">&#9998; ${L('Bearbeiten', 'Edit')}</button>
        <button type="button" class="secondary small-btn" data-res="${s.id}">&#128202; ${L('Eintragungen', 'Entries')}</button>
        <button type="button" class="secondary small-btn" data-dup="${s.id}">${L('Duplizieren', 'Duplicate')}</button>
        <button type="button" class="danger small-btn" data-del="${s.id}">&#128465; ${L('L&ouml;schen', 'Delete')}</button>
      </div>
    </div>`;
  }).join('');
  const content = `
    ${cdLangBar()}
    <div class="card cd-intro">
      <div class="ath-toolbar">
        <div><b>${L('Conditioning-Einheiten', 'Conditioning sessions')}</b> <span class="muted-inline">${L('Ausdauer &amp; Kondition planen, individuell nach vIFT (30-15 IFT) und Herzfrequenz', 'Plan endurance &amp; conditioning, individualised by vIFT (30-15 IFT) and heart rate')}</span></div>
        <span class="spacer"></span>
        <button type="button" class="secondary" id="cdTpls">&#128218; ${L('Szenarien / Vorlagen', 'Scenarios / templates')}</button>
        <button type="button" class="secondary" id="cdMods">&#128692; ${L('Ger&auml;te-Liste', 'Equipment list')}</button>
        <button type="button" class="secondary" id="cdValues">&#128200; ${L('Leistungswerte (vIFT / HFmax)', 'Test values (vIFT / HRmax)')}</button>
        <button type="button" class="secondary" id="cdNewPlan">&#128197; ${L('Neuer Plan', 'New plan')}</button>
        <button type="button" id="cdNew">+ ${L('Neue Einheit', 'New session')}</button>
      </div>
    </div>
    ${plans === null ? `<p class="hint">${L('Conditioning-Pl&auml;ne: Datenbank-Erweiterung fehlt noch (supabase_migration_condition_plan.sql).', 'Conditioning plans: database extension missing (supabase_migration_condition_plan.sql).')}</p>` : ''}
    ${planCards ? `<h2 class="cd-ov-h">&#128197; ${L('Pl&auml;ne (Wochen &times; Tage)', 'Plans (weeks &times; days)')}</h2>${planCards}<h2 class="cd-ov-h">${L('Einzelne Einheiten', 'Single sessions')}</h2>` : ''}
    ${cards || `<div class="card"><p class="muted">${L('Noch keine Conditioning-Einheiten. &bdquo;+ Neue Einheit&ldquo; anklicken.', 'No conditioning sessions yet. Click &ldquo;+ New session&rdquo;.')}</p></div>`}
    ${cdSourcesHtml()}`;
  renderShell(profile, 'trainingsplan', T, content, { label: 'Trainingsplanung', go: () => renderTpHub(profile) });
  cdWireLang(() => renderConditionHub(profile));
  document.getElementById('cdNew').onclick = () => renderCdEditor(profile, null);
  document.getElementById('cdNewPlan').onclick = () => { if (plans === null) { alert(L('Bitte zuerst die Datenbank-Erweiterung ausführen (supabase_migration_condition_plan.sql).', 'Please run the database extension first (supabase_migration_condition_plan.sql).')); return; } renderCdPlan(profile, null); };
  appEl.querySelectorAll('[data-plan]').forEach(b => b.onclick = () => renderCdPlan(profile, b.dataset.plan));
  appEl.querySelectorAll('[data-pldel]').forEach(b => b.onclick = async () => {
    const pl = plans.find(x => x.id === b.dataset.pldel);
    const n = (sRes.data || []).filter(s => s.plan_id === pl.id).length;
    if (!confirm(L('Plan „' + (pl.title || '') + '“ mit ' + n + ' Einheit(en) löschen?\n\nEintragungen der Athlet:innen zu diesen Einheiten werden mitgelöscht (sRPE im Load Management bleibt).', 'Delete plan “' + (pl.title || '') + '” with ' + n + ' session(s)?\n\nAthlete entries for these sessions are deleted as well (sRPE in Load Management is kept).'))) return;
    const r = await sb.from('cd_plans').delete().eq('id', pl.id);
    if (r.error) { toast(L('Fehler: ', 'Error: ') + r.error.message); return; }
    toast(L('Plan gelöscht.', 'Plan deleted.')); renderConditionHub(profile);
  });
  document.getElementById('cdValues').onclick = () => renderCdValues(profile);
  document.getElementById('cdMods').onclick = () => cdModalitiesDialog();
  document.getElementById('cdTpls').onclick = () => cdMethodsDialog();
  appEl.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => renderCdEditor(profile, (sRes.data || []).find(s => s.id === b.dataset.edit)));
  appEl.querySelectorAll('[data-res]').forEach(b => b.onclick = () => renderCdResults(profile, (sRes.data || []).find(s => s.id === b.dataset.res), names));
  appEl.querySelectorAll('[data-dup]').forEach(b => b.onclick = () => {
    const s = (sRes.data || []).find(x => x.id === b.dataset.dup);
    const c = JSON.parse(JSON.stringify(s.content || {}));
    (c.blocks || []).forEach(x => { x.id = cdNewId(); });
    renderCdEditor(profile, { id: null, title: (s.title || '') + L(' (Kopie)', ' (copy)'), team: s.team, planned_date: null, content: c });
  });
  appEl.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const s = (sRes.data || []).find(x => x.id === b.dataset.del);
    const n = (lRes.data || []).filter(l => l.session_id === s.id).length;
    if (!confirm(L('Conditioning-Einheit „' + (s.title || '') + '“ löschen?', 'Delete conditioning session “' + (s.title || '') + '”?') + (n ? '\n\n' + L(n + ' Eintragung(en) der Athlet:innen werden mitgelöscht (sRPE im Load Management bleibt).', n + ' athlete entr(y/ies) will be deleted as well (sRPE in Load Management is kept).') : ''))) return;
    const r = await sb.from('cd_sessions').delete().eq('id', s.id);
    if (r.error) { toast(L('Fehler: ', 'Error: ') + r.error.message); return; }
    toast(L('Gelöscht.', 'Deleted.')); renderConditionHub(profile);
  });
}

// ============================================================
// Leistungswerte je Athlet:in (vIFT, HFmax, HFrest) + Übernahme aus dem 30-15-IFT-Tool
// ============================================================
async function renderCdValues(profile) {
  const back = { label: 'Conditioning', go: () => renderConditionHub(profile) };
  const T = () => L('Leistungswerte', 'Test values');
  renderShell(profile, 'trainingsplan', T(), `<p class="muted">${L('Lade', 'Loading')}&hellip;</p>`, back);
  let mgmt;
  try { mgmt = await loadAthleteData(); } catch (e) { renderShell(profile, 'trainingsplan', T(), `<div class="card"><p class="error">${L('Fehler', 'Error')}: ${esc(e.message)}</p></div>`, back); return; }
  let grp = '';
  // 30-15-IFT-Daten dieses Geräts (Tool „30-15 IFT“, gleicher Browser): je Name letzter vIFT + HFmax/Ruhepuls
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const iftIdx = new Map();
  try {
    const d = JSON.parse(localStorage.getItem('ift3015_data_v1'));
    if (d && Array.isArray(d.athletes)) {
      const latest = {};
      (d.sessions || []).slice().sort((x, y) => (x.date || '').localeCompare(y.date || '')).forEach(se => (se.results || []).forEach(r => { if (r.vift) latest[r.athleteId] = { vift: r.vift, date: se.date }; }));
      d.athletes.forEach(ia => {
        const rec = { vift: latest[ia.id] ? Math.round(latest[ia.id].vift * 10) / 10 : null, date: latest[ia.id] ? latest[ia.id].date : null, hr_max: ia.maxpuls ? Math.round(ia.maxpuls) : null, hr_rest: ia.ruhepuls ? Math.round(ia.ruhepuls) : null };
        if (!rec.vift && !rec.hr_max && !rec.hr_rest) return;
        [norm((ia.vorname || '') + ' ' + (ia.nachname || '')), norm(ia.name)].forEach(k => { if (k) iftIdx.set(k, rec); });
      });
    }
  } catch (e) {}
  const iftFor = a => iftIdx.get(norm(a.first_name + ' ' + a.last_name)) || null;
  const applyIft = async (a) => {
    const r = iftFor(a); if (!r) return false;
    const patch = {};
    if (r.vift) { patch.vift_kmh = r.vift; patch.vift_date = r.date || null; }
    if (r.hr_max) patch.hr_max = r.hr_max;
    if (r.hr_rest) patch.hr_rest = r.hr_rest;
    const res = await sb.from('athletes').update(patch).eq('id', a.id);
    if (res.error) { toast(L('Fehler: ', 'Error: ') + res.error.message); return false; }
    Object.assign(a, patch); return true;
  };
  const draw = () => {
    const list = mgmt.athletes.filter(a => !grp || a.groupIds.includes(grp))
      .sort((x, y) => x.last_name.localeCompare(y.last_name, 'de') || x.first_name.localeCompare(y.first_name, 'de'));
    const iftTitle = r => [r.vift ? 'vIFT ' + cdDec(r.vift) + ' km/h' + (r.date ? ' (' + cdDate(r.date) + ')' : '') : '', r.hr_max ? L('HFmax ', 'HRmax ') + r.hr_max : '', r.hr_rest ? L('Ruhepuls ', 'Resting HR ') + r.hr_rest : ''].filter(Boolean).join(' · ');
    const html = `
      ${cdLangBar()}
      <div class="card">
        <div class="ath-toolbar">
          <select id="cdvGrp" style="width:auto;"><option value="">${L('Alle Gruppen', 'All groups')}</option>${mgmt.groups.map(g => `<option value="${g.id}" ${g.id === grp ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>
          <span class="spacer"></span>
          <button type="button" class="secondary" id="cdvIft" ${iftIdx.size ? '' : `disabled title="${L('Auf diesem Ger&auml;t sind keine 30-15-IFT-Daten gespeichert', 'No 30-15 IFT data stored on this device')}"`}>&#8595; ${L('Alle aus 30-15 IFT &uuml;bernehmen', 'Import all from 30-15 IFT')}</button>
        </div>
        <p class="hint">${L('Je Athlet:in <b>&bdquo;&#8595; 30-15&ldquo;</b> (letzter Test aus dem 30-15-IFT-Tool dieses Ger&auml;ts) oder Werte <b>manuell eintragen</b>. Ohne HFmax wird sie aus dem Alter gesch&auml;tzt (Tanaka) &ndash; grau als Vorschlag angezeigt. vIFT = Endgeschwindigkeit im 30-15 Intermittent Fitness Test (km/h). HFmax und Ruhepuls f&uuml;r Pulsbereiche (% HFmax, Zonen, Karvonen). Werte werden beim Ver&ouml;ffentlichen einer Einheit f&uuml;r die pers&ouml;nlichen Vorgaben verwendet. &Auml;nderungen speichern automatisch.',
          'Per athlete <b>&ldquo;&#8595; 30-15&rdquo;</b> (latest test from the 30-15 IFT tool on this device) or <b>enter values manually</b>. Without HRmax it is estimated from age (Tanaka) &ndash; shown in grey as a suggestion. vIFT = final speed in the 30-15 Intermittent Fitness Test (km/h). HRmax and resting HR for heart-rate ranges (% HRmax, zones, Karvonen). Values are used for personal targets when a session is published. Changes save automatically.')}</p>
        <div class="tablewrap"><table class="user-table cd-vals">
          <thead><tr><th>Name</th><th>${L('Alter', 'Age')}</th><th>vIFT (km/h)</th><th>${L('Test vom', 'Test date')}</th><th>${L('HFmax', 'HRmax')}</th><th>${L('Ruhepuls', 'Resting HR')}</th><th>30-15 IFT</th><th>App</th></tr></thead>
          <tbody>${list.map(a => `<tr data-id="${a.id}">
            <td>${esc(a.last_name)}, ${esc(a.first_name)}</td>
            <td>${cdAge(a.birthdate) ?? '<span class="muted">–</span>'}</td>
            <td><input type="text" inputmode="decimal" data-f="vift_kmh" value="${a.vift_kmh ?? ''}" placeholder="${L('z. B. 18,5', 'e.g. 18.5')}"></td>
            <td><input type="date" data-f="vift_date" value="${a.vift_date || ''}"></td>
            <td><input type="text" inputmode="numeric" data-f="hr_max" value="${a.hr_max ?? ''}" placeholder="${cdAge(a.birthdate) ? '≈ ' + cdHrMaxEst(cdAge(a.birthdate)) + L(' geschätzt', ' estimated') : L('z. B. 200', 'e.g. 200')}"></td>
            <td><input type="text" inputmode="numeric" data-f="hr_rest" value="${a.hr_rest ?? ''}" placeholder="${L('z. B. 55', 'e.g. 55')}"></td>
            <td>${(r => r ? `<button type="button" class="secondary small-btn" data-ift="${a.id}" title="${iftTitle(r)}">&#8595; 30-15</button>` : '<span class="muted">–</span>')(iftFor(a))}</td>
            <td>${a.profile_id ? '&#10003;' : `<span class="muted" title="${L('Kein App-Zugang verkn&uuml;pft', 'No app account linked')}">–</span>`}</td></tr>`).join('') || `<tr><td colspan="8" class="muted">${L('Keine Athlet:innen.', 'No athletes.')}</td></tr>`}</tbody>
        </table></div>
        ${cdSourcesHtml()}
      </div>`;
    renderShell(profile, 'trainingsplan', T(), html, back);
    cdWireLang(draw);
    appEl.querySelectorAll('[data-ift]').forEach(b => b.onclick = async () => {
      const a = mgmt.athletes.find(x => x.id === b.dataset.ift);
      if (await applyIft(a)) { toast(L('Aus 30-15 IFT übernommen: ', 'Imported from 30-15 IFT: ') + a.first_name + ' ' + a.last_name); draw(); }
    });
    document.getElementById('cdvGrp').onchange = e => { grp = e.target.value; draw(); };
    appEl.querySelectorAll('.cd-vals input[data-f]').forEach(inp => {
      inp.onchange = async () => {
        const id = inp.closest('tr').dataset.id, f = inp.dataset.f;
        let v = inp.value.trim();
        if (f === 'vift_kmh') v = v ? Math.round(cdNum(v) * 10) / 10 : null;
        else if (f === 'hr_max' || f === 'hr_rest') v = v ? Math.round(cdNum(v)) : null;
        else v = v || null;
        const r = await sb.from('athletes').update({ [f]: v }).eq('id', id);
        if (r.error) { toast(L('Fehler: ', 'Error: ') + r.error.message); inp.classList.add('err'); return; }
        inp.classList.remove('err');
        const a = mgmt.athletes.find(x => x.id === id); if (a) a[f] = v;
        toast(L('Gespeichert.', 'Saved.'));
      };
    });
    document.getElementById('cdvIft').onclick = async () => {
      if (!iftIdx.size) return;
      const list = mgmt.athletes.filter(a => (!grp || a.groupIds.includes(grp)) && iftFor(a));
      if (!confirm(L(list.length + ' Athlet:innen mit 30-15-IFT-Daten gefunden. Werte übernehmen (vorhandene werden überschrieben)?', list.length + ' athletes with 30-15 IFT data found. Import values (existing values will be overwritten)?'))) return;
      let n = 0; for (const a of list) if (await applyIft(a)) n++;
      toast(L(n + ' Athlet:innen aktualisiert', n + ' athletes updated'));
      draw();
    };
  };
  draw();
}

// ============================================================
// Editor
// ============================================================
async function renderCdEditor(profile, session, ctx) {
  // ctx (Tag in einem Plan): { plan, back } – oben Reiter Woche ‹ › und Tag 1, 2, 3 … (+ Tag)
  const back = { label: ctx ? L('Wochenraster', 'Week grid') : 'Conditioning', go: () => { if (!dirty || confirm(L('Ungespeicherte Änderungen verwerfen?', 'Discard unsaved changes?'))) (ctx ? ctx.back() : renderConditionHub(profile)); } };
  const T = () => ctx ? (ctx.plan.title || L('Conditioning-Plan', 'Conditioning plan')) : (session && session.id ? L('Conditioning bearbeiten', 'Edit conditioning') : L('Neue Conditioning-Einheit', 'New conditioning session'));
  renderShell(profile, 'trainingsplan', T(), `<p class="muted">${L('Lade', 'Loading')}&hellip;</p>`, back);
  const S = session ? JSON.parse(JSON.stringify(session)) : { id: null, title: '', team: '', planned_date: new Date().toISOString().slice(0, 10), content: {} };
  S.content = S.content || {};
  if (!Array.isArray(S.content.blocks) || !S.content.blocks.length) S.content.blocks = [cdNewBlock('warmup'), cdNewBlock('main'), cdNewBlock('cooldown')];
  if (ctx && !S.content.forName && ctx.plan.for_name) S.content.forName = ctx.plan.for_name;
  let dirty = false;
  const [mgmt, lib, asg, prof, pss] = await Promise.all([
    loadAthleteData().catch(() => null).then(async x => { await Promise.all([cdLoadModalities(), cdLoadMethods()]); return x; }),
    sb.from('tp_builder_store').select('data').eq('key', 'tp_builder_db_v2').maybeSingle(),
    S.id ? sb.from('cd_assignments').select('user_id, active').eq('session_id', S.id) : Promise.resolve({ data: [] }),
    sb.from('profiles').select('id, name, role, permissions').eq('role', 'athlete').order('name'),
    ctx ? sb.from('cd_sessions').select('*').eq('plan_id', ctx.plan.id) : Promise.resolve({ data: [] }),
  ]);
  const planSess = pss.data || [];
  // Vorschläge für „Inhalt“: Geräte-/Sportartenliste + Conditioning-Bibliothek der Trainingsplanung
  const modNames = CD_MODS.map(m => CD_LANG === 'en' ? (m.en || m.de) : m.de);
  const libNames = [...new Set(modNames.concat(((lib.data && lib.data.data && lib.data.data.conditioning) || []).map(x => x.name).filter(Boolean).sort((a, b) => a.localeCompare(b, 'de'))))];
  const athletes = mgmt ? mgmt.athletes : [], groups = mgmt ? mgmt.groups : [];
  const athByProfile = {}; athletes.forEach(a => { if (a.profile_id) athByProfile[a.profile_id] = a; });
  const users = (prof.data || []);
  const picked = new Set((asg.data || []).filter(a => a.active).map(a => a.user_id));
  const teamGroups = groups.map(g => g.name);
  const athNames = athletes.map(a => `${a.first_name} ${a.last_name}`.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, 'de'));
  const normN = t => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
  // „Für wen?“ → passende:r Athlet:in mit App-Zugang (für Vorschau und Vorauswahl beim Veröffentlichen)
  const forUser = () => { const n = normN(S.content.forName); if (!n) return null; const u = users.find(u => { const a = athByProfile[u.id]; return (a && normN(a.first_name + ' ' + a.last_name) === n) || normN(u.name) === n; }); return u || null; };
  let previewGrp = forUser() ? '__for' : '';

  const intInputs = (b) => {
    const t = b.int.type;
    if (t === 'allout') return '';
    if (t === 'pace') return `<input type="text" data-k="int.min" value="${esc(b.int.min ?? '')}" placeholder="4:30"> – <input type="text" data-k="int.max" value="${esc(b.int.max ?? '')}" placeholder="4:10">`;
    return `<input type="text" inputmode="decimal" data-k="int.min" value="${esc(b.int.min ?? '')}" placeholder="${L('von', 'from')}"> – <input type="text" inputmode="decimal" data-k="int.max" value="${esc(b.int.max ?? '')}" placeholder="${L('bis', 'to')}">`;
  };
  const unitSel = (k, v, opts) => `<select data-k="${k}">${opts.map(o => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
  const bsum = (b) => { const sec = cdBlockSec(b); return `${esc(cdStructText(b))}${cdIntText(b) ? ' &middot; ' + esc(cdIntText(b)) : ''} &middot; ${sec != null ? '&asymp; ' + cdFmtDur(sec) : L('Dauer je nach Tempo', 'duration depends on speed')}`; };
  const totHtml = () => { const tot = cdSessionSec(S.content); return `${L('Gesamt', 'Total')} &asymp; <b>${tot.sec ? Math.round(tot.sec / 60) + ' min' : '–'}</b>${tot.unknown ? L(' (+ Bl&ouml;cke nach Strecke)', ' (+ distance-based blocks)') : ''} &middot; ${S.content.blocks.length} ${L('Bl&ouml;cke', 'blocks')}`; };
  // Vorlagen-Auswahl: Standard + eigene (optgroups); gelöschte Vorlage des Blocks bleibt als Eintrag sichtbar
  const methodOpts = (b) => {
    const own = CD_METHOD_LIST.filter(m => /^u_/.test(m.key)), std = CD_METHOD_LIST.filter(m => !/^u_/.test(m.key));
    const o = m => `<option value="${esc(m.key)}" ${m.key === b.method ? 'selected' : ''}>${esc(L(m.de, m.en || m.de))}</option>`;
    return (CD_METHOD[b.method] ? '' : `<option value="${esc(b.method || '')}" selected>${esc(cdBLabel(b))}</option>`)
      + (own.length ? `<optgroup label="${L('Eigene Vorlagen', 'My templates')}">${own.map(o).join('')}</optgroup>` : '')
      + `<optgroup label="${L('Standard', 'Standard')}">${std.map(o).join('')}</optgroup>`;
  };
  const blockCard = (b, idx) => {
    const ph = CD_PHASES.find(p => p.key === b.phase) || CD_PHASES[1];
    return `<div class="cd-block" data-i="${idx}" style="--cat:${ph.color}">
      <div class="cd-bhead">
        <select data-k="method" class="cd-method" title="${L('Szenario / Vorlage', 'Scenario / template')}">${methodOpts(b)}</select>
        <button type="button" class="mini cd-tplsave" data-a="tpl" title="${L('Diesen Block als eigene Vorlage speichern', 'Save this block as my own template')}">&#9734; ${L('Vorlage', 'Template')}</button>
        <select data-k="phase" class="cd-phsel" title="${L('Phase', 'Phase')}">${CD_PHASES.map(p => `<option value="${p.key}" ${p.key === b.phase ? 'selected' : ''}>${cdPhaseLabel(p)}</option>`).join('')}</select>
        <span class="cd-bsum">${bsum(b)}</span>
        <span class="cd-btools">
          <button type="button" class="mini" data-a="up" title="${L('nach oben', 'move up')}">&uarr;</button><button type="button" class="mini" data-a="down" title="${L('nach unten', 'move down')}">&darr;</button>
          <button type="button" class="mini" data-a="dup" title="${L('duplizieren', 'duplicate')}">&#10697;</button><button type="button" class="mini danger" data-a="del" title="${L('l&ouml;schen', 'delete')}">&times;</button>
        </span>
      </div>
      <div class="cd-grid">
        <label class="c6">${L('Inhalt / &Uuml;bung / Ger&auml;t', 'Content / exercise / equipment')}<input type="text" data-k="content" list="cdLib" value="${esc(b.content || '')}" placeholder="${L('z. B. Air Bike, Pendell&auml;ufe 20 m &hellip;', 'e.g. air bike, 20 m shuttles &hellip;')}"></label>
        <label class="c6">${L('Intensit&auml;t', 'Intensity')}<span class="cd-pair"><select data-k="int.type">${CD_INT_TYPES.map(t => `<option value="${t.key}" ${t.key === b.int.type ? 'selected' : ''}>${L(t.de, t.en)}</option>`).join('')}</select>${intInputs(b)}</span></label>
        <label class="c1">${L('Serien', 'Sets')}<input type="text" inputmode="numeric" data-k="sets" value="${esc(b.sets ?? '')}"></label>
        <label class="c1">${L('Wdh', 'Reps')}<input type="text" inputmode="numeric" data-k="reps" value="${esc(cdList(b.work.v) ? cdList(b.work.v).length : (b.reps ?? ''))}" ${cdList(b.work.v) ? `readonly class="cd-auto" title="${L('aus der Pyramide', 'from the pyramid')}"` : ''}></label>
        <label class="c2">${L('Belastung', 'Work')}<span class="cd-pair"><input type="text" data-k="work.v" value="${esc(b.work.v ?? '')}" title="${L('Pyramide / Einzelzeiten: Werte mit Bindestrich, z. B. 45-60-75-90-75-60-45', 'Pyramid / individual times: values with hyphens, e.g. 45-60-75-90-75-60-45')}">${unitSel('work.u', b.work.u, ['s', 'min', 'm'])}</span></label>
        <label class="c2">${L('Pause', 'Rest')}<span class="cd-pair"><input type="text" data-k="rest.v" value="${esc(b.rest.v ?? '')}" title="${L('Mehrere Pausen der Reihe nach, z. B. 90-120-90', 'Several rests in order, e.g. 90-120-90')}">${unitSel('rest.u', b.rest.u, ['s', 'min'])}</span></label>
        <label class="c2">${L('Serienpause', 'Set rest')}<span class="cd-pair"><input type="text" inputmode="decimal" data-k="setRest.v" value="${esc(b.setRest.v ?? '')}">${unitSel('setRest.u', b.setRest.u, ['s', 'min'])}</span></label>
        <label class="c4">${L('HF-Kontrolle (% HFmax)', 'HR check (% HRmax)')}<span class="cd-pair"><input type="text" inputmode="numeric" data-k="hr.min" value="${esc(b.hr.min ?? '')}" placeholder="${L('von', 'from')}"> – <input type="text" inputmode="numeric" data-k="hr.max" value="${esc(b.hr.max ?? '')}" placeholder="${L('bis', 'to')}"></span></label>
        <label class="c12">${L('Hinweis', 'Note')}<textarea data-k="note" rows="1" placeholder="${L('z. B. Richtungswechsel alle 20 m, Pause aktiv gehen', 'e.g. change direction every 20 m, walk during rest')}">${esc(b.note || '')}</textarea></label>
      </div>
    </div>`;
  };
  const previewHtml = () => {
    const mains = S.content.blocks.slice().sort((x, y) => CD_PHASES.findIndex(p => p.key === x.phase) - CD_PHASES.findIndex(p => p.key === y.phase));
    const fu = forUser();
    const who = users.filter(u => previewGrp === '__for' ? (fu && u.id === fu.id) : previewGrp === '__pub' ? picked.has(u.id) : (!previewGrp || (athByProfile[u.id] && athByProfile[u.id].groupIds.includes(previewGrp))));
    if (!mains.length) return `<p class="hint">${L('Noch keine Bl&ouml;cke.', 'No blocks yet.')}</p>`;
    return `<div class="tablewrap"><table class="user-table cd-prev"><thead><tr><th>${L('Athlet:in', 'Athlete')}</th><th>vIFT</th><th>${L('HFmax', 'HRmax')}</th>${mains.map(b => { const ph = CD_PHASES.find(p => p.key === b.phase) || CD_PHASES[1]; return `<th style="border-top:3px solid ${ph.color};"><span class="cd-prevph" style="color:${ph.color}">${cdPhaseLabel(ph)}</span><br>${esc(b.content || cdBLabel(b, true))}<div class="hint" style="margin:0;">${esc(cdStructText(b))}</div></th>`; }).join('')}<th></th></tr></thead>
      <tbody>${who.map(u => { const a = athByProfile[u.id] || {}; const p = { vift: cdNum(a.vift_kmh), hr_max: a.hr_max, hr_rest: a.hr_rest, age: cdAge(a.birthdate) };
        const hm = p.hr_max || (p.age ? `<span class="muted" title="${L('gesch&auml;tzt nach Tanaka (208 &minus; 0,7 &times; Alter)', 'estimated with Tanaka (208 &minus; 0.7 &times; age)')}">&asymp; ${cdHrMaxEst(p.age)}</span>` : '<span class="muted">–</span>');
        return `<tr><td>${esc(u.name)}</td><td>${p.vift ? cdDec(p.vift) : '<span class="muted">–</span>'}</td><td>${hm}</td>${mains.map(b => { const r = cdPersonalText(b, p); const t = r.text || cdIntText(b); return `<td class="${r.fallback ? 'cd-fb' : ''}">${esc(t) || '<span class="muted">–</span>'}</td>`; }).join('')}<td><button type="button" class="secondary small-btn" data-av="${u.id}">&#128065; ${L('Ansicht', 'View')}</button></td></tr>`; }).join('') || `<tr><td colspan="${4 + mains.length}" class="muted">${L('Keine Athlet:innen mit App-Zugang in der Auswahl.', 'No athletes with an app account in this selection.')}</td></tr>`}</tbody></table></div>`;
  };
  // Reiter: Woche ‹ › + Tag 1 … n (+ Tag). Einzel-Einheit: „Tag 1“ + „+ Tag“ macht daraus einen Plan.
  const tabsHtml = () => {
    if (!ctx) return `<div class="cd-tabs"><span class="cd-tabs-days"><button type="button" class="cd-tab on">${L('Tag', 'Day')} 1</button>
      <button type="button" class="cd-tab add" id="cdToPlan" title="${L('Weitere Tage / Wochen planen &ndash; macht aus dieser Einheit einen Plan', 'Plan more days / weeks &ndash; turns this session into a plan')}">+ ${L('Tag', 'Day')}</button></span>
      <span class="hint" style="margin:0;">${L('Mehrere Tage oder Wochen? &bdquo;+ Tag&ldquo; macht daraus einen Plan, der auf einmal zugewiesen wird.', 'Several days or weeks? &ldquo;+ Day&rdquo; turns this into a plan you assign in one go.')}</span></div>`;
    const P = ctx.plan, w = S.plan_week;
    const days = Array.from({ length: P.per_week }, (_, i) => i + 1);
    const has = n => n === S.plan_slot ? !!S.id : planSess.some(x => x.plan_week === w && x.plan_slot === n);
    return `<div class="cd-tabs">
      <span class="cd-wk"><button type="button" class="mini" data-wk="${w - 1}" ${w <= 1 ? 'disabled' : ''} title="${L('vorige Woche', 'previous week')}">&lsaquo;</button>
        <select id="cdWkSel">${Array.from({ length: P.weeks }, (_, i) => `<option value="${i + 1}" ${i + 1 === w ? 'selected' : ''}>${L('Woche', 'Week')} ${i + 1} / ${P.weeks}</option>`).join('')}</select>
        <button type="button" class="mini" data-wk="${w + 1}" ${w >= P.weeks ? 'disabled' : ''} title="${L('n&auml;chste Woche', 'next week')}">&rsaquo;</button>
        ${w >= P.weeks && P.weeks < 26 ? `<button type="button" class="mini cd-addwk" id="cdAddWk" title="${L('Woche anh&auml;ngen', 'add a week')}">+ ${L('Woche', 'Week')}</button>` : ''}</span>
      <span class="cd-tabs-days">${days.map(n => `<button type="button" class="cd-tab${n === S.plan_slot ? ' on' : ''}${has(n) ? ' has' : ''}" data-day="${n}">${L('Tag', 'Day')} ${n}${has(n) ? ' <i>&#9679;</i>' : ''}</button>`).join('')}
        ${P.per_week < 7 ? `<button type="button" class="cd-tab add" id="cdAddDay">+ ${L('Tag', 'Day')}</button>` : ''}</span>
      <button type="button" class="secondary small-btn" id="cdCopyDay" title="${L('Diesen Tag auf andere Tage / Wochen kopieren', 'Copy this day to other days / weeks')}">&#10697; ${L('Tag kopieren', 'Copy day')}</button>
    </div>`;
  };
  // zu Woche/Tag wechseln: aktuelle Seite speichern, wenn geändert
  const goTo = async (w, n) => {
    if (dirty && !(await save())) return;
    const P = ctx.plan;
    let s = w === S.plan_week && n === S.plan_slot ? S : null;
    if (!s) { const r = await sb.from('cd_sessions').select('*').eq('plan_id', P.id).eq('plan_week', w).eq('plan_slot', n).maybeSingle(); s = r.data || null; }
    if (!s) s = { id: null, title: cdDefTitle(w, n), team: P.team, planned_date: null, content: { blocks: [cdNewBlock('warmup'), cdNewBlock('main'), cdNewBlock('cooldown')] }, plan_id: P.id, plan_week: w, plan_slot: n };
    dirty = false;
    renderCdEditor(profile, s, ctx);
  };
  const updPlan = async (patch) => {
    const r = await sb.from('cd_plans').update(Object.assign({ updated_at: new Date().toISOString() }, patch)).eq('id', ctx.plan.id).select('*').single();
    if (r.error) { alert(L('Fehler: ', 'Error: ') + r.error.message); return false; }
    ctx.plan = r.data; return true;
  };
  // Aktuellen Tag auf andere Tage/Wochen kopieren (vorhandene Tage werden überschrieben, Tage mit Eintragungen bleiben)
  const copyDay = async () => {
    if ((dirty || !S.id) && !(await save())) return;
    const P = ctx.plan;
    const [ssR, lgR] = await Promise.all([
      sb.from('cd_sessions').select('id, title, plan_week, plan_slot').eq('plan_id', P.id),
      sb.from('cd_logs').select('session_id'),
    ]);
    const ss = ssR.data || [], logged = new Set((lgR.data || []).map(l => l.session_id));
    const at = (w, n) => ss.find(x => x.plan_week === w && x.plan_slot === n);
    const host = document.createElement('div');
    const weeks = Array.from({ length: P.weeks }, (_, i) => i + 1), days = Array.from({ length: P.per_week }, (_, i) => i + 1);
    host.innerHTML = `<div class="modal-scrim"><div class="modal" style="max-width:620px;">
      <h2>&#10697; ${L('Woche', 'Week')} ${S.plan_week} &middot; ${L('Tag', 'Day')} ${S.plan_slot} ${L('kopieren nach', 'copy to')} &hellip;</h2>
      <p class="hint" style="margin-top:0;">${L('Ziel-Tage anhaken. Belegte Tage (&#9679;) werden &uuml;berschrieben; Tage, f&uuml;r die schon Eintragungen der Athlet:innen vorliegen (&#128274;), bleiben unver&auml;ndert.', 'Tick the target days. Filled days (&#9679;) are overwritten; days that already have athlete entries (&#128274;) stay unchanged.')}</p>
      <div class="tablewrap"><table class="cd-copygrid"><thead><tr><th></th>${days.map(n => `<th>${L('Tag', 'Day')} ${n}</th>`).join('')}${P.per_week < 7 ? `<th>${L('neuer Tag', 'new day')}</th>` : ''}</tr></thead>
      <tbody>${weeks.map(w => `<tr><th>${L('Woche', 'Week')} ${w}</th>${days.map(n => { const x = at(w, n), me = w === S.plan_week && n === S.plan_slot, lock = x && logged.has(x.id);
        return `<td>${me ? '<span class="muted-inline">' + L('Quelle', 'source') + '</span>' : `<label><input type="checkbox" data-t="${w},${n}" ${lock ? 'disabled' : ''}> ${lock ? '&#128274;' : (x ? '&#9679;' : '')}</label>`}</td>`; }).join('')}
        ${P.per_week < 7 ? `<td><label><input type="checkbox" data-t="${w},new"> +</label></td>` : ''}</tr>`).join('')}</tbody></table></div>
      <div class="chips" style="margin-top:8px;"><button type="button" class="secondary small-btn" id="cdcWeek">${L('Alle Tage dieser Woche', 'All days this week')}</button><button type="button" class="secondary small-btn" id="cdcSame">${L('Tag', 'Day')} ${S.plan_slot} ${L('in allen Wochen', 'in all weeks')}</button></div>
      <div class="modal-actions"><span class="spacer"></span><button type="button" class="secondary" id="cdcX">${L('Abbrechen', 'Cancel')}</button><button type="button" id="cdcGo">${L('Kopieren', 'Copy')}</button></div></div></div>`;
    document.body.appendChild(host);
    const boxes = () => [...host.querySelectorAll('[data-t]')].filter(c => !c.disabled);
    host.querySelector('#cdcWeek').onclick = () => boxes().forEach(c => { const [w, n] = c.dataset.t.split(','); if (+w === S.plan_week && n !== 'new') c.checked = true; });
    host.querySelector('#cdcSame').onclick = () => boxes().forEach(c => { const [, n] = c.dataset.t.split(','); if (+n === S.plan_slot) c.checked = true; });
    host.querySelector('#cdcX').onclick = () => host.remove();
    host.querySelector('#cdcGo').onclick = async () => {
      const targets = boxes().filter(c => c.checked).map(c => c.dataset.t.split(','));
      if (!targets.length) { alert(L('Bitte mindestens einen Ziel-Tag anhaken.', 'Please tick at least one target day.')); return; }
      const btn = host.querySelector('#cdcGo'); btn.disabled = true;
      // „neuer Tag“: Tage pro Woche einmal erhöhen
      let newSlot = null;
      if (targets.some(t => t[1] === 'new')) { if (!(await updPlan({ per_week: P.per_week + 1 }))) { btn.disabled = false; return; } newSlot = ctx.plan.per_week; }
      const { data: { user } } = await sb.auth.getUser();
      const custom = S.title && !CD_DEF_TITLE_RE.test(S.title) ? S.title : null;
      let n = 0, newIds = [];
      for (const [ws, ns] of targets) {
        const w = +ws, d = ns === 'new' ? newSlot : +ns;
        const content = cdProgress(S.content, 'none');   // neue Block-IDs
        const old = at(w, d);
        const title = custom || cdDefTitle(w, d);
        let r;
        if (old) r = await sb.from('cd_sessions').update({ content, title, updated_at: new Date().toISOString() }).eq('id', old.id);
        else { r = await sb.from('cd_sessions').insert({ title, team: S.team || P.team || null, planned_date: null, content, plan_id: P.id, plan_week: w, plan_slot: d, created_by: user.id }).select('id').single(); if (!r.error) newIds.push(r.data.id); }
        if (r.error) { alert(L('Fehler: ', 'Error: ') + r.error.message); break; }
        n++;
      }
      if (newIds.length && (ctx.plan.members || []).length) await cdAssignSessions(newIds, ctx.plan.members, athByProfile);
      host.remove(); toast(L(n + ' Tag(e) kopiert.', n + ' day(s) copied.'));
      goTo(S.plan_week, S.plan_slot);
    };
  };
  // Einzel-Einheit → Plan (Woche 1 · Tag 1), dann Tag 2 öffnen
  const toPlan = () => {
    const host = document.createElement('div');
    host.innerHTML = `<div class="modal-scrim"><div class="modal" style="max-width:480px;">
      <h2>&#128197; ${L('Mehrere Tage / Wochen planen', 'Plan several days / weeks')}</h2>
      <p class="hint" style="margin-top:0;">${L('Diese Einheit wird zu <b>Woche 1 &middot; Tag 1</b> eines Plans. Titel, &bdquo;F&uuml;r wen?&ldquo; und Team gelten f&uuml;r den ganzen Plan; ver&ouml;ffentlicht wird der Plan auf einmal.', 'This session becomes <b>week 1 &middot; day 1</b> of a plan. Title, &ldquo;for whom&rdquo; and team apply to the whole plan; the plan is published in one go.')}</p>
      <div class="cd-top" style="grid-template-columns:1fr 1fr;">
        <label>${L('Wochen', 'Weeks')}<input type="number" id="tpW" min="1" max="26" value="1"></label>
        <label>${L('Tage pro Woche', 'Days per week')}<input type="number" id="tpD" min="2" max="7" value="2"></label>
        <label style="grid-column:span 2;">${L('Start (optional)', 'Start (optional)')}<input type="date" id="tpS" value="${S.planned_date || ''}"></label>
      </div>
      <div class="modal-actions"><span class="spacer"></span><button type="button" class="secondary" id="tpX">${L('Abbrechen', 'Cancel')}</button><button type="button" id="tpGo">${L('Plan anlegen', 'Create plan')}</button></div></div></div>`;
    document.body.appendChild(host);
    host.querySelector('#tpX').onclick = () => host.remove();
    host.querySelector('#tpGo').onclick = async () => {
      if (!(S.title || '').trim()) { alert(L('Bitte zuerst einen Titel eingeben (wird der Plan-Titel).', 'Please enter a title first (becomes the plan title).')); return; }
      const btn = host.querySelector('#tpGo'); btn.disabled = true;
      const { data: { user } } = await sb.auth.getUser();
      const weeks = Math.max(1, Math.min(26, parseInt(host.querySelector('#tpW').value, 10) || 1)), per = Math.max(2, Math.min(7, parseInt(host.querySelector('#tpD').value, 10) || 2));
      const r = await sb.from('cd_plans').insert({ created_by: user.id, title: S.title.trim(), team: (S.team || '').trim() || null, for_name: (S.content.forName || '').trim() || null,
        start_date: host.querySelector('#tpS').value || null, weeks, per_week: per, members: [...picked], note: null }).select('*').single();
      if (r.error) { alert(L('Fehler: ', 'Error: ') + r.error.message + (/cd_plans|relation/.test(r.error.message) ? '\n' + L('Datenbank-Erweiterung fehlt (supabase_migration_condition_plan.sql).', 'Database extension missing (supabase_migration_condition_plan.sql).') : '')); btn.disabled = false; return; }
      const P = r.data;
      ctx = { plan: P, back: () => renderCdPlan(profile, P.id) };
      Object.assign(S, { plan_id: P.id, plan_week: 1, plan_slot: 1, title: cdDefTitle(1, 1), planned_date: null });
      if (!(await save())) { btn.disabled = false; return; }
      host.remove(); toast(L('Plan angelegt – weiter mit Tag 2.', 'Plan created – continue with day 2.'));
      goTo(1, 2);
    };
  };
  const draw = () => {
    const tot = cdSessionSec(S.content);
    const phaseHtml = CD_PHASES.map(ph => {
      const list = S.content.blocks.map((b, i) => [b, i]).filter(([b]) => b.phase === ph.key);
      return `<div class="cd-phase"><div class="cd-phead" style="--cat:${ph.color}">${cdPhaseLabel(ph)}<button type="button" class="secondary small-btn" data-add="${ph.key}">+ Block</button></div>
        ${list.map(([b, i]) => blockCard(b, i)).join('') || `<p class="hint" style="margin:4px 0 10px;">${L('Kein Block.', 'No block.')}</p>`}</div>`;
    }).join('');
    const html = `
      ${cdLangBar()}
      <datalist id="cdLib">${libNames.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      ${tabsHtml()}
      <div class="card">
        <div class="cd-top">
          ${ctx ? `<label class="w2">${L('Bezeichnung des Tages (optional)', 'Name of this day (optional)')}<input type="text" id="cdTitle" value="${esc(CD_DEF_TITLE_RE.test(S.title || '') ? '' : (S.title || ''))}" placeholder="${L('z. B. Air Bike Intervalle', 'e.g. air bike intervals')}"></label>`
          : `<label class="w2">${L('Titel', 'Title')}<input type="text" id="cdTitle" value="${esc(S.title || '')}" placeholder="${L('z. B. HIIT 15/15 &ndash; Vorbereitung', 'e.g. HIIT 15/15 &ndash; pre-season')}"></label>
          <label>${L('Datum', 'Date')}<input type="date" id="cdDate" value="${S.planned_date || ''}"></label>
          <label>${L('Team / Gruppe', 'Team / group')}<input type="text" id="cdTeam" list="cdTeams" value="${esc(S.team || '')}"><datalist id="cdTeams">${teamGroups.map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>
          <label class="w2">${L('F&uuml;r wen?', 'For whom?')}<input type="text" id="cdFor" list="cdAthNames" value="${esc(S.content.forName || '')}" placeholder="${L('Name der Athletin / des Athleten (optional)', 'Athlete name (optional)')}"><datalist id="cdAthNames">${athNames.map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>`}
          <label class="w2">${L('Hinweis f&uuml;r alle', 'Note for everyone')}<input type="text" id="cdNote" value="${esc(S.content.note || '')}" placeholder="${L('z. B. Pulsgurt anlegen, Trinkflasche mitbringen', 'e.g. wear HR strap, bring a water bottle')}"></label>
        </div>
        <div class="cd-total">${totHtml()}</div>
      </div>
      ${phaseHtml}
      <div class="card">
        <div class="ath-toolbar"><h2 style="margin:0;">${L('Pers&ouml;nliche Vorgaben (Vorschau)', 'Personal targets (preview)')}</h2><span class="spacer"></span>
          <select id="cdPrevGrp" style="width:auto;">${forUser() ? `<option value="__for" ${previewGrp === '__for' ? 'selected' : ''}>${L('Nur', 'Only')} ${esc(S.content.forName)}</option>` : ''}<option value="">${L('Alle mit App-Zugang', 'Everyone with an app account')}</option><option value="__pub" ${previewGrp === '__pub' ? 'selected' : ''}>${L('Nur ausgew&auml;hlte (Ver&ouml;ffentlichen)', 'Selected only (publish)')}</option>${groups.map(g => `<option value="${g.id}" ${g.id === previewGrp ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div>
        <div id="cdPrevWrap">${previewHtml()}</div>
        <p class="hint">${L('Fehlende vIFT/HFmax unter &bdquo;Conditioning &rarr; Leistungswerte&ldquo; eintragen oder aus dem 30-15 IFT &uuml;bernehmen. Ohne HFmax wird sie aus dem Alter gesch&auml;tzt (&asymp;), ohne jegliche Werte gilt der Richtwert nach Borg-Skala + Sprechtest (kursiv).',
          'Enter missing vIFT/HRmax under &ldquo;Conditioning &rarr; Test values&rdquo; or import them from the 30-15 IFT. Without HRmax it is estimated from age (&asymp;); without any values the Borg scale + talk test guide value applies (italic).')}</p>
        ${cdSourcesHtml()}
      </div>
      <div class="cd-savebar">
        <button type="button" class="secondary" id="cdSave">&#128190; ${L('Speichern', 'Save')}</button>
        ${ctx ? `<span class="hint" style="align-self:center;margin:0;">${L('Woche', 'Week')} ${S.plan_week} &middot; ${L('Tag', 'Day')} ${S.plan_slot}${(ctx.plan.members || []).length ? ' &middot; ' + L('automatisch f&uuml;r die Plan-Teilnehmer:innen sichtbar', 'automatically visible to plan members') : ''}</span>
          <button type="button" id="cdPlanPub">&#128242; ${L('Plan ver&ouml;ffentlichen', 'Publish plan')}${(ctx.plan.members || []).length ? ' (' + ctx.plan.members.length + ')' : ''}</button>` : `<button type="button" id="cdPub">&#128242; ${L('In App ver&ouml;ffentlichen', 'Publish to app')}${picked.size ? ' (' + picked.size + ')' : ''}</button>`}
      </div>`;
    renderShell(profile, 'trainingsplan', T(), html, back);
    cdWireLang(draw);
    wire();
  };
  // Teil-Aktualisierung ohne Neuaufbau (Fokus/Cursor bleibt im Eingabefeld)
  const refresh = (card, b) => {
    const bs = card.querySelector('.cd-bsum'); if (bs) bs.innerHTML = bsum(b);
    const tt = appEl.querySelector('.cd-total'); if (tt) tt.innerHTML = totHtml();
    const pw = document.getElementById('cdPrevWrap'); if (pw) { pw.innerHTML = previewHtml(); wirePreview(); }
  };
  const wirePreview = () => appEl.querySelectorAll('[data-av]').forEach(b => b.onclick = () => {
    const u = users.find(x => x.id === b.dataset.av), a = athByProfile[u.id] || {};
    cdAthletePreview(S, { vift: cdNum(a.vift_kmh), hr_max: a.hr_max, hr_rest: a.hr_rest, age: cdAge(a.birthdate) }, u.name);
  });
  const setPath = (o, k, v) => { const p = k.split('.'); if (p.length === 2) o[p[0]][p[1]] = v; else o[k] = v; };
  const wire = () => {
    const top = (id, f) => { const el = document.getElementById(id); if (el) el.oninput = () => { f(el.value); dirty = true; }; };
    top('cdTitle', v => S.title = v); top('cdDate', v => S.planned_date = v || null); top('cdTeam', v => S.team = v); top('cdNote', v => S.content.note = v);
    const fe = document.getElementById('cdFor');
    if (fe) {
      fe.oninput = () => { S.content.forName = fe.value.trim(); dirty = true; };
      fe.onchange = () => { S.content.forName = fe.value.trim(); previewGrp = forUser() ? '__for' : (previewGrp === '__for' ? '' : previewGrp); draw(); };
    }
    // Reiter
    const tp = document.getElementById('cdToPlan'); if (tp) tp.onclick = toPlan;
    appEl.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { const n = +b.dataset.day; if (n !== S.plan_slot) goTo(S.plan_week, n); });
    appEl.querySelectorAll('[data-wk]').forEach(b => b.onclick = () => goTo(+b.dataset.wk, S.plan_slot));
    const ws = document.getElementById('cdWkSel'); if (ws) ws.onchange = () => goTo(+ws.value, S.plan_slot);
    const ad = document.getElementById('cdAddDay'); if (ad) ad.onclick = async () => { if (await updPlan({ per_week: ctx.plan.per_week + 1 })) goTo(S.plan_week, ctx.plan.per_week); };
    const aw = document.getElementById('cdAddWk'); if (aw) aw.onclick = async () => {
      // neue Woche: optional die aktuelle Woche hineinkopieren
      if (dirty && !(await save())) return;
      if (!(await updPlan({ weeks: ctx.plan.weeks + 1 }))) return;
      const nw = ctx.plan.weeks;
      const src = (await sb.from('cd_sessions').select('*').eq('plan_id', ctx.plan.id).eq('plan_week', S.plan_week)).data || [];
      if (src.length && confirm(L('Woche ' + nw + ' angelegt. Die Tage von Woche ' + S.plan_week + ' hineinkopieren?', 'Week ' + nw + ' added. Copy the days of week ' + S.plan_week + ' into it?'))) {
        const { data: { user } } = await sb.auth.getUser();
        const rows = src.map(x => ({ title: CD_DEF_TITLE_RE.test(x.title || '') ? cdDefTitle(nw, x.plan_slot) : x.title, team: x.team, planned_date: null, content: cdProgress(x.content, 'none'), plan_id: ctx.plan.id, plan_week: nw, plan_slot: x.plan_slot, created_by: user.id }));
        const r = await sb.from('cd_sessions').insert(rows).select('id');
        if (r.error) alert(L('Fehler: ', 'Error: ') + r.error.message);
        else if ((ctx.plan.members || []).length) await cdAssignSessions(r.data.map(x => x.id), ctx.plan.members, athByProfile);
      }
      dirty = false; goTo(nw, S.plan_slot);
    };
    const cdc = document.getElementById('cdCopyDay'); if (cdc) cdc.onclick = copyDay;
    const pp = document.getElementById('cdPlanPub'); if (pp) pp.onclick = async () => { if (dirty && !(await save())) return; renderCdPlan(profile, ctx.plan.id, { publish: true }); };
    document.getElementById('cdPrevGrp').onchange = e => { previewGrp = e.target.value; draw(); };
    wirePreview();
    appEl.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { S.content.blocks.push(cdNewBlock(b.dataset.add)); dirty = true; draw(); });
    appEl.querySelectorAll('.cd-block').forEach(card => {
      const i = +card.dataset.i, b = S.content.blocks[i];
      card.querySelectorAll('[data-k]').forEach(el => {
        const k = el.dataset.k;
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          const upd = () => {
            setPath(b, k, el.value); dirty = true;
            if (k === 'work.v') {   // Pyramide: Wdh = Anzahl Werte
              const l = cdList(el.value), ri = card.querySelector('[data-k="reps"]');
              if (l) b.reps = l.length;
              if (ri) { ri.readOnly = !!l; ri.classList.toggle('cd-auto', !!l); if (l) ri.value = l.length; }
            }
            refresh(card, b);
          };
          el.oninput = upd; el.onchange = upd;
          return;
        }
        el.onchange = () => {
          dirty = true;
          if (k === 'method') {
            const m = CD_METHOD[el.value];
            if (m) cdApplyMethod(b, m); else b.method = el.value;
            draw(); return;
          }
          setPath(b, k, el.value);
          if (k === 'modality') { const m = CD_MODS.find(x => x.de === el.value); b.modalityEn = m ? (m.en || '') : ''; }
          if (k === 'int.type') { b.int.min = ''; b.int.max = ''; if (el.value === 'hrzone') { b.int.min = 2; b.int.max = 2; } }
          draw();
        };
      });
      card.querySelectorAll('[data-a]').forEach(btn => btn.onclick = () => {
        const a = btn.dataset.a, arr = S.content.blocks;
        if (a === 'tpl') { cdSaveBlockAsTemplate(b, () => { dirty = true; draw(); }); return; }
        if (a === 'del') { if (!confirm(L('Block löschen?', 'Delete block?'))) return; arr.splice(i, 1); }
        else if (a === 'dup') { const c = JSON.parse(JSON.stringify(b)); c.id = cdNewId(); arr.splice(i + 1, 0, c); }
        else {
          // innerhalb derselben Phase verschieben
          const same = arr.map((x, k) => [x, k]).filter(([x]) => x.phase === b.phase).map(([, k]) => k);
          const pos = same.indexOf(i), j = same[pos + (a === 'up' ? -1 : 1)];
          if (j == null) return;
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        dirty = true; draw();
      });
    });
    document.getElementById('cdSave').onclick = async () => { if (await save()) { toast(L('Gespeichert.', 'Saved.')); draw(); } };
    const pub = document.getElementById('cdPub'); if (pub) pub.onclick = () => publishDialog();
  };
  const save = async () => {
    if (ctx && !(S.title || '').trim()) S.title = cdDefTitle(S.plan_week, S.plan_slot);
    if (!(S.title || '').trim()) { alert(L('Bitte einen Titel eingeben.', 'Please enter a title.')); return false; }
    const { data: { user } } = await sb.auth.getUser();
    if (ctx && !S.team && ctx.plan.team) S.team = ctx.plan.team;
    const row = { title: S.title.trim(), team: (S.team || '').trim() || null, planned_date: S.planned_date || null, content: S.content, updated_at: new Date().toISOString() };
    if (S.plan_id) Object.assign(row, { plan_id: S.plan_id, plan_week: S.plan_week, plan_slot: S.plan_slot });
    let r;
    if (S.id) r = await sb.from('cd_sessions').update(row).eq('id', S.id).select('id').single();
    else r = await sb.from('cd_sessions').insert(Object.assign({ created_by: user.id }, row)).select('id').single();
    if (r.error) { alert(L('Speichern fehlgeschlagen: ', 'Saving failed: ') + r.error.message); return false; }
    S.id = r.data.id; dirty = false;
    // Plan-Einheit: automatisch den Plan-Teilnehmer:innen zuordnen
    if (ctx && (ctx.plan.members || []).length) await cdAssignSessions([S.id], ctx.plan.members, athByProfile);
    return true;
  };
  const publishDialog = () => {
    const host = document.createElement('div');
    const sel = new Set(picked);
    const fu = forUser();
    if (!sel.size && fu) sel.add(fu.id);   // „Für wen?“ vorauswählen
    const render = () => {
      host.innerHTML = `<div class="modal-scrim"><div class="modal" style="max-width:640px;">
        <h2>&#128242; ${L('In App ver&ouml;ffentlichen', 'Publish to app')}</h2>
        <p class="hint" style="margin-top:0;">${L('Die Ausgew&auml;hlten sehen die Einheit im Men&uuml; unter &bdquo;Conditioning&ldquo; mit ihren pers&ouml;nlichen Vorgaben. Sp&auml;tere &Auml;nderungen an der Einheit sind sofort sichtbar.', 'Selected athletes see the session in the menu under &ldquo;Conditioning&rdquo; with their personal targets. Later changes to the session are visible immediately.')}</p>
        <div class="chips" style="margin-bottom:8px;">${groups.map(g => `<button type="button" class="secondary small-btn" data-g="${g.id}">${esc(g.name)}</button>`).join('')}<button type="button" class="secondary small-btn" data-g="__all">${L('Alle', 'All')}</button><button type="button" class="secondary small-btn" data-g="__none">${L('Keine', 'None')}</button></div>
        <div class="cd-pick">${users.map(u => { const a = athByProfile[u.id]; const miss = !a || (!cdNum(a.vift_kmh) && !a.hr_max); const noPerm = !!u.permissions && u.permissions.condition === 'none';
          return `<label><input type="checkbox" data-u="${u.id}" ${sel.has(u.id) ? 'checked' : ''}> ${esc(u.name)}${miss ? ` <span class="muted-inline">${L('(ohne Messwerte &rarr; Richtwerte)', '(no test data &rarr; guide values)')}</span>` : ''}${noPerm ? ` <b style="color:#b0281c;">${L('Recht fehlt', 'no permission')}</b>` : ''}</label>`; }).join('') || `<p class="muted">${L('Keine Athlet:innen mit App-Zugang.', 'No athletes with an app account.')}</p>`}</div>
        <div class="modal-actions"><span class="spacer">${sel.size} ${L('ausgew&auml;hlt', 'selected')}</span>
          <button type="button" class="secondary" id="cdpX">${L('Abbrechen', 'Cancel')}</button>
          <button type="button" id="cdpGo">${L('Ver&ouml;ffentlichen', 'Publish')}</button></div>
      </div></div>`;
      host.querySelectorAll('[data-u]').forEach(c => c.onchange = () => { if (c.checked) sel.add(c.dataset.u); else sel.delete(c.dataset.u); render(); });
      host.querySelectorAll('[data-g]').forEach(b => b.onclick = () => {
        const g = b.dataset.g;
        if (g === '__all') users.forEach(u => sel.add(u.id));
        else if (g === '__none') sel.clear();
        else { sel.clear(); users.forEach(u => { const a = athByProfile[u.id]; if (a && a.groupIds.includes(g)) sel.add(u.id); }); }
        render();
      });
      host.querySelector('#cdpX').onclick = () => host.remove();
      host.querySelector('#cdpGo').onclick = async () => {
        if (!sel.size && !picked.size) { alert(L('Bitte mindestens eine Person auswählen.', 'Please select at least one person.')); return; }
        const btn = host.querySelector('#cdpGo'), label = btn.textContent; btn.disabled = true; btn.textContent = L('Veröffentliche …', 'Publishing …');
        if (!(await save())) { btn.disabled = false; btn.textContent = label; return; }
        const rows = [...sel].map(uid => { const a = athByProfile[uid] || {}; return { session_id: S.id, user_id: uid, active: true,
          personal: { vift: cdNum(a.vift_kmh), hr_max: a.hr_max || null, hr_rest: a.hr_rest || null, age: cdAge(a.birthdate) } }; });
        let r = rows.length ? await sb.from('cd_assignments').upsert(rows, { onConflict: 'session_id,user_id' }) : { error: null };
        const removed = [...picked].filter(u => !sel.has(u));
        if (!r.error && removed.length) r = await sb.from('cd_assignments').update({ active: false }).eq('session_id', S.id).in('user_id', removed);
        if (r.error) { alert(L('Veröffentlichen fehlgeschlagen: ', 'Publishing failed: ') + r.error.message); btn.disabled = false; btn.textContent = label; return; }
        picked.clear(); sel.forEach(u => picked.add(u));
        host.remove(); toast(L('Veröffentlicht für ' + picked.size + ' Athlet:innen', 'Published for ' + picked.size + ' athletes')); draw();
      };
    };
    document.body.appendChild(host); render();
  };
  draw();
}

// ---------- Eintragungen einer Einheit (Admin/Trainer) ----------
async function renderCdResults(profile, s, names, backOverride) {
  const back = backOverride || { label: 'Conditioning', go: () => renderConditionHub(profile) };
  const T = s.title || L('Conditioning-Einheit', 'Conditioning session');
  renderShell(profile, 'trainingsplan', T, `<p class="muted">${L('Lade', 'Loading')}&hellip;</p>`, back);
  const [aRes, lRes] = await Promise.all([
    sb.from('cd_assignments').select('*').eq('session_id', s.id).eq('active', true),
    sb.from('cd_logs').select('*').eq('session_id', s.id),
  ]);
  const blocks = (s.content && s.content.blocks) || [];
  const draw = () => {
    const rows = (aRes.data || []).sort((x, y) => (names[x.user_id] || '').localeCompare(names[y.user_id] || '', 'de')).map(a => {
      const l = (lRes.data || []).find(x => x.user_id === a.user_id);
      const bd = (l && l.data && l.data.blocks) || {};
      const done = blocks.filter(b => bd[b.id] && bd[b.id].done).length;
      const extras = blocks.map(b => { const x = bd[b.id]; if (!x) return ''; const t = [x.hr ? '&Oslash; ' + esc(x.hr) + ' bpm' : '', x.dist ? esc(x.dist) + ' m' : '', x.note ? esc(x.note) : ''].filter(Boolean).join(' · '); return t ? `<div class="hint" style="margin:0;"><b>${esc(cdBLabel(b, true))}:</b> ${t}</div>` : ''; }).join('');
      return `<tr><td>${esc(names[a.user_id] || '?')}</td>
        <td>${l && l.completed ? `<span class="status-pill ok">${L('erledigt', 'done')}</span>` : (l ? `<span class="status-pill half">${L('angefangen', 'started')}</span>` : `<span class="status-pill open">${L('offen', 'open')}</span>`)}</td>
        <td>${done}/${blocks.length}</td><td>${l && l.srpe ? l.srpe : '–'}</td><td>${l && l.duration_min ? l.duration_min + ' min' : '–'}</td>
        <td>${extras}${l && l.data && l.data.note ? `<div class="hint" style="margin:0;">&#128221; ${esc(l.data.note)}</div>` : ''}</td></tr>`;
    }).join('');
    renderShell(profile, 'trainingsplan', T, `${cdLangBar()}<div class="card"><div class="tablewrap"><table class="user-table">
      <thead><tr><th>${L('Athlet:in', 'Athlete')}</th><th>Status</th><th>${L('Bl&ouml;cke', 'Blocks')}</th><th>sRPE</th><th>${L('Dauer', 'Duration')}</th><th>${L('Eintr&auml;ge', 'Entries')}</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="6" class="muted">${L('Noch nicht ver&ouml;ffentlicht.', 'Not published yet.')}</td></tr>`}</tbody></table></div></div>`, back);
    cdWireLang(draw);
  };
  draw();
}

// ============================================================
// Athlet:innen: eigener Menüpunkt „Conditioning“ + Einheit ansehen/eintragen
// ============================================================
async function cdLoadMine() {
  const { data: { user } } = await sb.auth.getUser();
  const { data: asg, error } = await sb.from('cd_assignments').select('session_id, personal, active').eq('user_id', user.id).eq('active', true);
  if (error || !asg || !asg.length) return [];
  const ids = asg.map(a => a.session_id);
  const [sRes, lRes] = await Promise.all([
    sb.from('cd_sessions').select('*').in('id', ids),
    sb.from('cd_logs').select('*').eq('user_id', user.id).in('session_id', ids),
  ]);
  const planIds = [...new Set((sRes.data || []).map(s => s.plan_id).filter(Boolean))];
  const plRes = planIds.length ? await sb.from('cd_plans').select('*').in('id', planIds) : { data: [] };
  const plans = plRes.data || [];
  return (sRes.data || []).map(s => ({ s, plan: plans.find(p => p.id === s.plan_id) || null, personal: (asg.find(a => a.session_id === s.id) || {}).personal || {}, log: (lRes.data || []).find(l => l.session_id === s.id) || null, uid: user.id }))
    .sort((x, y) => (x.log && x.log.completed ? 1 : 0) - (y.log && y.log.completed ? 1 : 0) || (x.s.planned_date || '9999').localeCompare(y.s.planned_date || '9999'));
}
function cdMyListHtml(list) {
  if (!list || !list.length) return '';
  // Pläne: aktuelle Woche oben, alle Wochen aufklappbar
  const plans = [...new Map(list.filter(x => x.plan).map(x => [x.plan.id, x.plan])).values()];
  const planHtml = plans.map(pl => {
    const mine = list.filter(x => x.plan && x.plan.id === pl.id).sort((a, b) => a.s.plan_week - b.s.plan_week || a.s.plan_slot - b.s.plan_slot);
    const cw = cdPlanWeekNow(pl, mine.map(x => x.s), mine.filter(x => x.log).map(x => Object.assign({ session_id: x.s.id }, x.log)));
    const pItem = x => {
      const dur = cdSessionSec(x.s.content || {});
      const st = x.log && x.log.completed ? '&#10003;' : (x.log ? '&#9680;' : '');
      const main = ((x.s.content || {}).blocks || []).filter(b => b.phase === 'main').map(b => b.content || cdBLabel(b, true)).join(' + ');
      return `<button type="button" class="cd-mine${x.log && x.log.completed ? ' done' : ''}" data-cd="${x.s.id}">
        <span><b>${L('Tag', 'Day')} ${x.s.plan_slot}${x.s.title && !CD_DEF_TITLE_RE.test(x.s.title) ? ' &middot; ' + esc(x.s.title) : (main ? ' &middot; ' + esc(main) : '')}</b><span class="muted-inline">${dur.sec ? '&asymp; ' + Math.round(dur.sec / 60) + ' min' : ''}</span></span><span class="cd-st">${st}</span></button>`;
    };
    const weekList = w => mine.filter(x => x.s.plan_week === w);
    const thisW = weekList(cw), doneW = thisW.filter(x => x.log && x.log.completed).length;
    const others = Array.from({ length: pl.weeks }, (_, i) => i + 1).filter(w => w !== cw && weekList(w).length);
    return `<div class="card"><h2>&#128197; ${esc(pl.title || 'Conditioning')}</h2>
      ${pl.note ? `<p class="hint" style="margin-top:-6px;">${esc(pl.note)}</p>` : ''}
      <div class="cd-weekhead">${L('Diese Woche', 'This week')}: ${L('Woche', 'Week')} ${cw} ${L('von', 'of')} ${pl.weeks} <span class="muted-inline">&middot; ${doneW}/${thisW.length} ${L('erledigt', 'done')} &middot; ${L('Reihenfolge frei', 'any order')}</span></div>
      <div class="cd-mylist">${thisW.map(pItem).join('') || `<p class="muted">${L('Keine Einheiten in dieser Woche.', 'No sessions this week.')}</p>`}</div>
      ${others.length ? `<details style="margin-top:10px;"><summary class="hint" style="cursor:pointer;">${L('Alle Wochen', 'All weeks')}</summary>${others.map(w => `<div class="cd-weekhead small">${L('Woche', 'Week')} ${w}</div><div class="cd-mylist">${weekList(w).map(pItem).join('')}</div>`).join('')}</details>` : ''}
    </div>`;
  }).join('');
  const single = list.filter(x => !x.plan);
  if (!single.length) return planHtml;
  const open = single.filter(x => !(x.log && x.log.completed)), done = single.filter(x => x.log && x.log.completed);
  const item = x => {
    const dur = cdSessionSec(x.s.content || {});
    const st = x.log && x.log.completed ? '&#10003;' : (x.log ? '&#9680;' : '');
    return `<button type="button" class="cd-mine${x.log && x.log.completed ? ' done' : ''}" data-cd="${x.s.id}">
      <span><b>${esc(x.s.title || 'Conditioning')}</b><span class="muted-inline">${x.s.planned_date ? cdDate(x.s.planned_date, { weekday: 'short', day: '2-digit', month: '2-digit' }) : ''}${dur.sec ? ' &middot; &asymp; ' + Math.round(dur.sec / 60) + ' min' : ''}</span></span><span class="cd-st">${st}</span></button>`;
  };
  return planHtml + `<div class="card"><h2>&#9201;&#65039; ${plans.length ? L('Einzelne Einheiten', 'Single sessions') : 'Conditioning'}</h2>
    <div class="cd-mylist">${open.map(item).join('')}</div>
    ${done.length ? `<details style="margin-top:8px;"><summary class="hint" style="cursor:pointer;">${L('Erledigt', 'Done')} (${done.length})</summary><div class="cd-mylist">${done.map(item).join('')}</div></details>` : ''}</div>`;
}
async function renderMyConditionList(profile) {
  renderShell(profile, 'condition', 'Conditioning', `<p class="muted">${L('Lade', 'Loading')}&hellip;</p>`);
  const list = await cdLoadMine().catch(() => []);
  const draw = () => {
    renderShell(profile, 'condition', 'Conditioning', cdLangBar() + (list.length ? cdMyListHtml(list)
      : `<div class="card"><h2>${L('Noch keine Conditioning-Einheit', 'No conditioning session yet')}</h2><p class="muted">${L('Sobald dein Trainer eine Ausdauer-/Konditionseinheit f&uuml;r dich ver&ouml;ffentlicht, erscheint sie hier &ndash; mit deinen pers&ouml;nlichen Tempo- und Pulsvorgaben.', 'As soon as your coach publishes a conditioning session for you, it appears here &ndash; with your personal speed and heart-rate targets.')}</p></div>`));
    cdWireLang(draw);
    cdWireMyList(profile, list);
  };
  draw();
}
function cdWireMyList(profile, list) {
  appEl.querySelectorAll('[data-cd]').forEach(b => b.onclick = () => renderMyCondition(profile, list.find(x => x.s.id === b.dataset.cd)));
}

function renderMyCondition(profile, x) {
  const canEdit = perm(profile, 'condition') === 'edit';
  const s = x.s, p = x.personal || {}, blocks = (s.content && s.content.blocks) || [];
  const data = JSON.parse(JSON.stringify((x.log && x.log.data) || {})); data.blocks = data.blocks || {};
  const back = { label: 'Conditioning', go: () => renderMyConditionList(profile) };
  let timer = null;
  const persist = async (completed, extra) => {
    if (!canEdit) return;
    const row = Object.assign({ session_id: s.id, user_id: x.uid, data, completed: !!completed, updated_at: new Date().toISOString(),
      entry_date: (x.log && x.log.entry_date) || new Date().toISOString().slice(0, 10) }, extra || {});
    const r = await sb.from('cd_logs').upsert(row, { onConflict: 'session_id,user_id' }).select('*').single();
    if (r.error) toast(L('Nicht gespeichert: ', 'Not saved: ') + r.error.message); else x.log = r.data;
  };
  const soon = () => { clearTimeout(timer); timer = setTimeout(() => persist(x.log && x.log.completed), 900); };
  const draw = () => {
    const html = CD_PHASES.map(ph => {
      const list = blocks.filter(b => b.phase === ph.key);
      if (!list.length) return '';
      return `<div class="cd-phead" style="--cat:${ph.color}">${cdPhaseLabel(ph)}</div>` + list.map(b => {
        const d = data.blocks[b.id] || {};
        const pers = cdPersonalText(b, p);
        return `<div class="card cd-myblock${d.done ? ' done' : ''}" style="--cat:${ph.color}">
          <div class="cd-mytitle"><b>${esc(b.content || cdBLabel(b))}</b><span class="muted-inline">${esc(cdModLabel(b.modality || '', b.modalityEn))}</span></div>
          <div class="cd-mystruct">${esc(cdStructText(b))}</div>${cdSeqHtml(b, p)}
          ${cdIntText(b) ? `<div class="cd-myint">${esc(cdIntText(b))}</div>` : ''}
          ${pers.text ? `<div class="cd-mypers">&#127919; ${L('Deine Vorgabe', 'Your target')}: <b>${esc(pers.text)}</b></div>` : ''}
          ${b.note ? `<div class="tpo-note">&#128204; ${esc(b.note)}</div>` : ''}
          <div class="cd-mylog">
            <label class="mp-check"><input type="checkbox" data-b="${b.id}" data-f="done" ${d.done ? 'checked' : ''} ${canEdit ? '' : 'disabled'}> ${L('erledigt', 'done')}</label>
            <input type="text" inputmode="numeric" data-b="${b.id}" data-f="hr" value="${esc(d.hr || '')}" placeholder="${L('&Oslash; Puls', 'avg HR')}" ${canEdit ? '' : 'disabled'}>
            <input type="text" inputmode="numeric" data-b="${b.id}" data-f="dist" value="${esc(d.dist || '')}" placeholder="${L('Meter', 'metres')}" ${canEdit ? '' : 'disabled'}>
            <input type="text" data-b="${b.id}" data-f="note" value="${esc(d.note || '')}" placeholder="${L('Notiz', 'Note')}" ${canEdit ? '' : 'disabled'}>
          </div>
        </div>`;
      }).join('');
    }).join('');
    const dur = cdSessionSec(s.content || {});
    const content = `
      ${cdLangBar()}
      <div class="card mp-sesshead" style="--lay-main:#1f9d55;--lay-dark:#157a42;--lay-accent:#a1d7ff;">
        <div><div class="mp-kicker">Conditioning${s.planned_date ? ' &middot; ' + cdDate(s.planned_date, { weekday: 'long', day: '2-digit', month: '2-digit' }) : ''}</div>
        <div class="mp-big">${esc(x.plan ? `${x.plan.title} · ${L('Woche', 'Week')} ${s.plan_week} · ${L('Tag', 'Day')} ${s.plan_slot}${s.title && !CD_DEF_TITLE_RE.test(s.title) ? ' · ' + s.title : ''}` : (s.title || 'Conditioning'))}</div>
        ${s.content && s.content.forName ? `<div class="muted-inline">${L('f&uuml;r', 'for')} ${esc(s.content.forName)}</div>` : ''}
        <div class="muted-inline">${dur.sec ? '&asymp; ' + Math.round(dur.sec / 60) + ' min' : ''}${x.log && x.log.completed ? ' &middot; ' + L('abgeschlossen', 'completed') : ''}</div></div>
      </div>
      ${s.content && s.content.note ? `<div class="card mp-info">&#128221; ${esc(s.content.note)}</div>` : ''}
      ${!p.vift && !p.hr_max ? `<p class="hint">${p.age ? L('Deine Pulswerte sind aus dem Alter gesch&auml;tzt', 'Your heart-rate values are estimated from your age') : L('Ohne Testwerte gelten Richtwerte nach Anstrengung (Borg-Skala 1&ndash;10) und Sprechtest', 'Without test data, guide values based on effort (Borg scale 1&ndash;10) and the talk test apply')} &ndash; ${L('genauer wird es mit deinem 30-15-IFT-Ergebnis und gemessener HFmax.', 'your 30-15 IFT result and a measured HRmax make it more precise.')}</p>` : ''}
      ${html}
      <input type="text" class="mp-anote" id="cdMyNote" value="${esc(data.note || '')}" placeholder="${L('Notiz zur Einheit (optional)', 'Note on the session (optional)')}" ${canEdit ? '' : 'disabled'}>
      ${canEdit ? `<button type="button" id="cdFinish" class="mp-finish">${L('Einheit abschlie&szlig;en', 'Finish session')}</button>` : ''}`;
    renderShell(profile, 'condition', 'Conditioning', content, back);
    cdWireLang(draw);
    appEl.querySelectorAll('[data-b]').forEach(el => {
      const d = () => (data.blocks[el.dataset.b] = data.blocks[el.dataset.b] || {});
      if (el.dataset.f === 'done') el.onchange = () => { d().done = el.checked; el.closest('.cd-myblock').classList.toggle('done', el.checked); soon(); };
      else el.oninput = () => { d()[el.dataset.f] = el.value.trim(); soon(); };
    });
    const n = document.getElementById('cdMyNote'); if (n) n.oninput = () => { data.note = n.value; soon(); };
    const fin = document.getElementById('cdFinish'); if (fin) fin.onclick = finish;
  };
  const finish = () => {
    const needRpe = perm(profile, 'srpe') === 'edit';
    const dur0 = cdSessionSec(s.content || {}).sec;
    const mins = dur0 ? Math.max(5, Math.round(dur0 / 60)) : 45;
    const host = document.createElement('div');
    host.innerHTML = `<div class="modal-scrim"><div class="modal">
      <h2>${L('Einheit abschlie&szlig;en', 'Finish session')}</h2>
      ${needRpe ? `<p class="hint" style="margin-top:0;">${L('Wie anstrengend war die Einheit insgesamt? (1 = sehr leicht &hellip; 10 = maximal)', 'How hard was the session overall? (1 = very easy &hellip; 10 = maximal)')}</p>
      <div class="mp-rpe">${Array.from({ length: 10 }, (_, k) => `<button type="button" class="secondary" data-rpe="${k + 1}">${k + 1}</button>`).join('')}</div>
      <label class="wq-date" style="margin-top:12px;">${L('Dauer (Minuten)', 'Duration (minutes)')}<input type="number" inputmode="numeric" id="cdDur" min="1" max="300" value="${x.log && x.log.duration_min ? x.log.duration_min : ''}" placeholder="${mins}"></label>` : `<p>${L('Einheit als erledigt speichern?', 'Save session as done?')}</p>`}
      <div class="modal-actions"><span class="spacer"></span><button type="button" class="secondary" id="cdfX">${L('Zur&uuml;ck', 'Back')}</button><button type="button" id="cdfGo" ${needRpe && !(x.log && x.log.srpe) ? 'disabled' : ''}>${L('Speichern', 'Save')}</button></div>
    </div></div>`;
    document.body.appendChild(host);
    let rpe = (x.log && x.log.srpe) || null;
    const mark = () => host.querySelectorAll('[data-rpe]').forEach(b => b.classList.toggle('on', +b.dataset.rpe === rpe));
    mark();
    host.querySelectorAll('[data-rpe]').forEach(b => b.onclick = () => { rpe = +b.dataset.rpe; mark(); host.querySelector('#cdfGo').disabled = false; });
    host.querySelector('#cdfX').onclick = () => host.remove();
    host.querySelector('#cdfGo').onclick = async () => {
      clearTimeout(timer);
      const dur = needRpe ? (parseInt(host.querySelector('#cdDur').value, 10) || mins) : null;
      await persist(true, needRpe ? { srpe: rpe, duration_min: dur } : {});
      if (needRpe) {
        // wie „Mein Trainingsplan“: sRPE ins Load Management als eigene Session (mehrere pro Tag)
        const date = new Date().toISOString().slice(0, 10), tag = 'Conditioning: ' + (s.title || '');
        await saveSessionLoad(x.uid, date, rpe, dur, tag);
      }
      host.remove(); toast(L('Einheit gespeichert – stark! 💪', 'Session saved – great work! 💪')); renderMyConditionList(profile);
    };
  };
  draw();
}

// ============================================================
// Einbindung in Trainingsübersicht & Auswertung (Admin/Trainer)
// ============================================================
// alle aktiven Conditioning-Einheiten mit Zuordnungen und Eintragungen
async function cdLoadAll() {
  const [s, a, l, p] = await Promise.all([
    sb.from('cd_sessions').select('*').eq('archived', false),
    sb.from('cd_assignments').select('session_id, user_id, personal, active').eq('active', true),
    sb.from('cd_logs').select('*'),
    sb.from('cd_plans').select('*').eq('archived', false),
  ]);
  if (s.error || a.error) return { sessions: [], asg: [], logs: [], plans: [] };
  return { sessions: s.data || [], asg: a.data || [], logs: l.data || [], plans: p.error ? [] : (p.data || []) };
}
const cdAU = (l) => l && l.srpe && l.duration_min ? l.srpe * l.duration_min : 0;
function cdStatusOf(log) { return log && log.completed ? 'done' : (log ? 'part' : 'open'); }
function cdStatusIcon(st) { return st === 'done' ? '&#10003;' : (st === 'part' ? '&#9680;' : '&#9675;'); }

// Abschnitt „Conditioning“ in der Aktuellen Trainingsübersicht
function cdOverviewHtml(CD, names) {
  // Plan-Einheiten: nur die der aktuellen Plan-Woche
  const list = CD.sessions.filter(s => CD.asg.some(a => a.session_id === s.id))
    .filter(s => { if (!s.plan_id) return true; const pl = (CD.plans || []).find(p => p.id === s.plan_id); return !pl || s.plan_week === cdPlanWeekNow(pl, CD.sessions, CD.logs); })
    .sort((x, y) => (x.plan_id || '').localeCompare(y.plan_id || '') || (x.plan_slot || 0) - (y.plan_slot || 0) || (y.planned_date || '').localeCompare(x.planned_date || ''));
  if (!list.length) return '';
  return `<h2 class="cd-ov-h">&#9201;&#65039; Conditioning</h2>` + list.map(s => {
    const as = CD.asg.filter(a => a.session_id === s.id).sort((x, y) => (names[x.user_id] || '').localeCompare(names[y.user_id] || '', 'de'));
    const logOf = u => CD.logs.find(l => l.session_id === s.id && l.user_id === u);
    const done = as.filter(a => (logOf(a.user_id) || {}).completed).length;
    const dur = cdSessionSec(s.content || {});
    return `<div class="card tpo-card cd-ov">
      <div class="tpo-head">
        <div><div class="tpo-title">${s.plan_id ? '&#128197; ' : ''}${esc(cdSessLabel(s, CD.plans))}</div>
          <div class="muted-inline">${s.plan_id ? L('aktuelle Plan-Woche', 'current plan week') : (s.planned_date ? cdDate(s.planned_date, { weekday: 'short', day: '2-digit', month: '2-digit' }) : 'ohne Datum')}${s.content && s.content.forName ? ' &middot; f&uuml;r ' + esc(s.content.forName) : ''}${s.team ? ' &middot; ' + esc(s.team) : ''}${dur.sec ? ' &middot; &asymp; ' + Math.round(dur.sec / 60) + ' min' : ''}</div></div>
        <span class="tpo-week">${done}/${as.length} erledigt</span>
      </div>
      <div class="tpo-people">
        <button type="button" class="tpo-chip group" data-cdres="${s.id}">&#128202; Alle Eintragungen</button>
        ${as.map(a => { const l = logOf(a.user_id), st = cdStatusOf(l); return `<button type="button" class="tpo-chip cd-st-${st}" data-cds="${s.id}" data-cdu="${a.user_id}">${cdStatusIcon(st)} ${esc(names[a.user_id] || '?')}${l && l.srpe ? ` <span class="tpo-cnt">RPE ${l.srpe}</span>` : ''}</button>`; }).join('')}
      </div>
    </div>`;
  }).join('');
}
function cdWireOverview(profile, CD, names, back) {
  appEl.querySelectorAll('[data-cdres]').forEach(b => b.onclick = () => renderCdResults(profile, CD.sessions.find(s => s.id === b.dataset.cdres), names, back));
  appEl.querySelectorAll('[data-cds]').forEach(b => b.onclick = () => {
    const s = CD.sessions.find(x => x.id === b.dataset.cds);
    renderCdAthleteDetail(profile, s, b.dataset.cdu, names[b.dataset.cdu] || '', CD, back);
  });
}

// Einheit einer Person mit Vorgaben und Eintragungen (Ansicht für Admin/Trainer)
function renderCdAthleteDetail(profile, s, uid, name, CD, back) {
  const a = CD.asg.find(x => x.session_id === s.id && x.user_id === uid) || {};
  const l = CD.logs.find(x => x.session_id === s.id && x.user_id === uid) || null;
  const p = a.personal || {}, bd = (l && l.data && l.data.blocks) || {};
  const draw = () => {
    const blocks = (s.content && s.content.blocks) || [];
    const html = CD_PHASES.map(ph => {
      const list = blocks.filter(b => b.phase === ph.key);
      if (!list.length) return '';
      return `<div class="cd-phead" style="--cat:${ph.color}">${cdPhaseLabel(ph)}</div>` + list.map(b => {
        const d = bd[b.id] || {}, pers = cdPersonalText(b, p);
        const got = [d.hr ? L('&Oslash; Puls ', 'avg HR ') + esc(d.hr) : '', d.dist ? esc(d.dist) + ' m' : '', d.note ? '&#128221; ' + esc(d.note) : ''].filter(Boolean).join(' &middot; ');
        return `<div class="card cd-myblock${d.done ? ' done' : ''}" style="--cat:${ph.color}">
          <div class="cd-mytitle"><b>${esc(b.content || cdBLabel(b))}</b><span class="muted-inline">${d.done ? '&#10003; ' + L('erledigt', 'done') : L('nicht abgehakt', 'not ticked')}</span></div>
          <div class="cd-mystruct">${esc(cdStructText(b))}</div>${cdSeqHtml(b, p)}
          ${cdIntText(b) ? `<div class="cd-myint">${esc(cdIntText(b))}</div>` : ''}
          ${pers.text ? `<div class="cd-mypers">&#127919; ${L('Vorgabe', 'Target')}: <b>${esc(pers.text)}</b></div>` : ''}
          ${got ? `<div class="cd-got">${L('Eingetragen', 'Entered')}: ${got}</div>` : ''}
        </div>`;
      }).join('');
    }).join('');
    const st = cdStatusOf(l);
    const content = `${cdLangBar()}
      <div class="card"><div class="ath-toolbar">
        <div><b class="tpo-name">${esc(name)}</b> <span class="muted-inline">${esc(s.title || 'Conditioning')}${s.planned_date ? ' &middot; ' + cdDate(s.planned_date, { weekday: 'short', day: '2-digit', month: '2-digit' }) : ''}</span></div>
        <span class="spacer"></span>
        <span class="tpo-week">${cdStatusIcon(st)} ${st === 'done' ? L('erledigt', 'done') : st === 'part' ? L('angefangen', 'started') : L('offen', 'open')}${l && l.srpe ? ` &middot; RPE ${l.srpe} &times; ${l.duration_min} min = ${cdAU(l)} AU` : ''}</span>
      </div>
      <p class="hint" style="margin:6px 0 0;">vIFT ${p.vift ? cdDec(p.vift) + ' km/h' : '–'} &middot; ${L('HFmax', 'HRmax')} ${p.hr_max || (p.age ? '&asymp; ' + cdHrMaxEst(p.age) + ' ' + L('(gesch&auml;tzt)', '(estimated)') : '–')}${p.hr_rest ? ' &middot; ' + L('Ruhepuls', 'resting HR') + ' ' + p.hr_rest : ''}${l && l.data && l.data.note ? ' &middot; &#128221; ' + esc(l.data.note) : ''}</p></div>
      ${html}`;
    renderShell(profile, 'trainingsplan', s.title || 'Conditioning', content, back);
    cdWireLang(draw);
  };
  draw();
}

// Conditioning je Plan-Woche einer Person (für die Auswertung): { week -> { n, au } }
function cdWeeksFor(CD, uid, plan) {
  const out = {};
  if (!plan.start_date) return out;
  const start = new Date(plan.start_date + 'T00:00:00').getTime();
  CD.logs.filter(l => l.user_id === uid && l.completed).forEach(l => {
    const w = Math.floor((new Date(l.entry_date + 'T00:00:00').getTime() - start) / 604800000) + 1;
    if (w < 1 || w > plan.weeks) return;
    const o = out[w] = out[w] || { n: 0, au: 0 };
    o.n++; o.au += cdAU(l);
  });
  return out;
}
// Liste der Conditioning-Einheiten einer Person (Auswertung → Detail)
function cdAthleteListHtml(CD, uid) {
  const rows = CD.asg.filter(a => a.user_id === uid).map(a => ({ s: CD.sessions.find(s => s.id === a.session_id), l: CD.logs.find(l => l.session_id === a.session_id && l.user_id === uid) }))
    .filter(x => x.s).sort((x, y) => (y.s.planned_date || '').localeCompare(x.s.planned_date || ''));
  if (!rows.length) return '';
  return `<div class="card"><h2>&#9201;&#65039; Conditioning</h2><div class="tablewrap"><table class="tp-table">
    <thead><tr><th>Einheit</th><th>Datum</th><th></th><th>Bl&ouml;cke</th><th>sRPE</th><th>Notizen</th></tr></thead>
    <tbody>${rows.map(x => { const blocks = (x.s.content && x.s.content.blocks) || [], bd = (x.l && x.l.data && x.l.data.blocks) || {};
      const notes = blocks.map(b => { const d = bd[b.id]; return d && (d.hr || d.dist || d.note) ? `<li><b>${esc(cdBLabel(b, true))}:</b> ${[d.hr ? '&Oslash; ' + esc(d.hr) + ' bpm' : '', d.dist ? esc(d.dist) + ' m' : '', d.note ? esc(d.note) : ''].filter(Boolean).join(' · ')}</li>` : ''; }).join('') + (x.l && x.l.data && x.l.data.note ? `<li>&#128221; ${esc(x.l.data.note)}</li>` : '');
      return `<tr class="tp-row" data-cds="${x.s.id}" data-cdu="${uid}"><td>${esc(cdSessLabel(x.s, CD.plans))}</td><td>${x.s.planned_date ? cdDate(x.s.planned_date) : '–'}</td><td>${cdStatusIcon(cdStatusOf(x.l))}</td>
        <td>${blocks.filter(b => bd[b.id] && bd[b.id].done).length}/${blocks.length}</td><td>${x.l && x.l.srpe ? `${x.l.srpe} &times; ${x.l.duration_min} min = ${cdAU(x.l)}` : '–'}</td><td><ul class="tp-ul">${notes}</ul></td></tr>`; }).join('')}</tbody>
  </table></div><p class="hint">Zeile anklicken f&uuml;r Vorgaben und Eintragungen je Block.</p></div>`;
}

// ---------- Sportarten / Geräte verwalten (hinzufügen, umbenennen DE/EN, sortieren, löschen) ----------
async function cdModalitiesDialog() {
  await cdLoadModalities(true);
  let items = JSON.parse(JSON.stringify(CD_MODS));
  const host = document.createElement('div');
  const render = () => {
    host.innerHTML = `<div class="modal-scrim"><div class="modal" style="max-width:620px;">
      <h2>&#128692; ${L('Ger&auml;te-Liste', 'Equipment list')}</h2>
      <p class="hint" style="margin-top:0;">${L('Vorschl&auml;ge f&uuml;r das Feld &bdquo;Inhalt / &Uuml;bung / Ger&auml;t&ldquo; in jedem Block, f&uuml;r alle Trainer:innen. Gel&ouml;schte Eintr&auml;ge bleiben in bestehenden Einheiten erhalten.', 'Suggestions for the &ldquo;Content / exercise / equipment&rdquo; field in each block, for all coaches. Deleted entries stay in existing sessions.')}</p>
      <div class="cd-modlist">${items.map((m, i) => `<div class="cd-modrow" data-i="${i}">
        <input type="text" data-f="de" value="${esc(m.de)}" placeholder="Deutsch">
        <input type="text" data-f="en" value="${esc(m.en || '')}" placeholder="English">
        <button type="button" class="mini" data-a="up" title="${L('nach oben', 'up')}">&uarr;</button><button type="button" class="mini" data-a="down" title="${L('nach unten', 'down')}">&darr;</button>
        <button type="button" class="mini danger" data-a="del" title="${L('l&ouml;schen', 'delete')}">&times;</button></div>`).join('')}</div>
      <div class="cd-modrow cd-modnew"><input type="text" id="cdmDe" placeholder="${L('Neu, z. B. Assault Bike', 'New, e.g. assault bike')}"><input type="text" id="cdmEn" placeholder="English"><button type="button" class="secondary small-btn" id="cdmAdd">+ ${L('Hinzuf&uuml;gen', 'Add')}</button></div>
      <div class="modal-actions"><button type="button" class="secondary small-btn" id="cdmReset" title="${L('Standardliste wiederherstellen', 'Restore default list')}">${L('Standard', 'Default')}</button><span class="spacer"></span>
        <button type="button" class="secondary" id="cdmX">${L('Abbrechen', 'Cancel')}</button><button type="button" id="cdmSave">${L('Speichern', 'Save')}</button></div>
    </div></div>`;
    host.querySelectorAll('.cd-modrow[data-i]').forEach(row => {
      const i = +row.dataset.i;
      row.querySelectorAll('input').forEach(inp => inp.oninput = () => { items[i][inp.dataset.f] = inp.value; });
      row.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'del') items.splice(i, 1);
        else { const j = i + (a === 'up' ? -1 : 1); if (j < 0 || j >= items.length) return; [items[i], items[j]] = [items[j], items[i]]; }
        render();
      });
    });
    host.querySelector('#cdmAdd').onclick = () => {
      const de = host.querySelector('#cdmDe').value.trim(), en = host.querySelector('#cdmEn').value.trim();
      if (!de) return;
      if (items.some(m => m.de.toLowerCase() === de.toLowerCase())) { toast(L('Gibt es schon.', 'Already exists.')); return; }
      items.push({ de, en: en || de }); render();
      host.querySelector('#cdmDe').focus();
    };
    host.querySelector('#cdmDe').onkeydown = e => { if (e.key === 'Enter') host.querySelector('#cdmAdd').click(); };
    host.querySelector('#cdmReset').onclick = () => { if (confirm(L('Standardliste wiederherstellen? Eigene Einträge gehen verloren.', 'Restore the default list? Your own entries will be removed.'))) { items = JSON.parse(JSON.stringify(CD_MOD_DEFAULT)); render(); } };
    host.querySelector('#cdmX').onclick = () => host.remove();
    host.querySelector('#cdmSave').onclick = async () => {
      const clean = items.map(m => ({ de: String(m.de || '').trim(), en: String(m.en || '').trim() })).filter(m => m.de);
      if (!clean.length) { alert(L('Mindestens ein Eintrag nötig.', 'At least one entry is required.')); return; }
      const r = await cdSaveModalities(clean);
      if (r.error) { alert(L('Speichern fehlgeschlagen: ', 'Saving failed: ') + r.error.message); return; }
      host.remove(); toast(L('Sportarten gespeichert.', 'Modalities saved.'));
    };
  };
  document.body.appendChild(host); render();
}

// ---------- Szenarien-Bibliothek: eigene Vorlagen (z. B. Air-Bike-Intervalle) ----------
// Block im Editor → „☆ Vorlage“: Name eingeben, Werte des Blocks werden als eigene Vorlage gespeichert (oder eine gleichnamige überschrieben)
async function cdSaveBlockAsTemplate(b, done) {
  await cdLoadMethods(true);
  const def = (b.content ? b.content + ' – ' : '') + cdStructText(b);
  const name = prompt(L('Name der Vorlage (erscheint in der Auswahl unter „Eigene Vorlagen“):', 'Template name (shown under “My templates”):'), def);
  if (!name || !name.trim()) return;
  const items = JSON.parse(JSON.stringify(CD_METHOD_LIST));
  const ex = items.find(m => /^u_/.test(m.key) && (m.de.toLowerCase() === name.trim().toLowerCase() || (m.en || '').toLowerCase() === name.trim().toLowerCase()));
  if (ex && !confirm(L('Vorlage „' + ex.de + '“ gibt es schon – überschreiben?', 'Template “' + ex.de + '” exists – overwrite?'))) return;
  let m = ex;
  if (!m) { m = { key: 'u_' + Date.now().toString(36), de: name.trim(), en: name.trim() }; items.unshift(m); }
  m.d = cdBlockToD(b);
  const r = await cdSaveMethods(items);
  if (r.error) { alert(L('Speichern fehlgeschlagen: ', 'Saving failed: ') + r.error.message); return; }
  b.method = m.key; b.mDe = m.de; b.mEn = m.en;
  toast(L('Vorlage gespeichert.', 'Template saved.'));
  if (done) done();
}
// Verwalten: Name DE/EN, Werte, Reihenfolge, löschen, neu, Standard wiederherstellen
async function cdMethodsDialog() {
  await cdLoadMethods(true);
  let items = JSON.parse(JSON.stringify(CD_METHOD_LIST));
  items.forEach(m => { m.d = Object.assign({ sets: 1, reps: 1, work: ['', 'min'], rest: [0, 's'], setRest: [0, 's'], int: ['rpe', '', ''], hr: ['', ''], content: '', note: '' }, m.d || {}); });
  const host = document.createElement('div');
  const uSel = (i, f, v, opts) => `<select data-i="${i}" data-f="${f}">${opts.map(o => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
  const render = () => {
    host.innerHTML = `<div class="modal-scrim"><div class="modal cd-tplmodal">
      <h2>&#128218; ${L('Szenarien / Vorlagen', 'Scenarios / templates')}</h2>
      <p class="hint" style="margin-top:0;">${L('Erscheinen im Block oben links in der Auswahl. Beim Ausw&auml;hlen werden die Werte in den Block &uuml;bernommen (danach frei &auml;nderbar). Am schnellsten: im Editor einen Block einstellen und &bdquo;&#9734; Vorlage&ldquo; dr&uuml;cken. Gilt f&uuml;r alle Trainer:innen.', 'Shown in the selector at the top left of each block. Selecting one copies its values into the block (editable afterwards). Quickest: set up a block in the editor and press &ldquo;&#9734; Template&rdquo;. Shared by all coaches.')}</p>
      <div class="tablewrap cd-tplwrap"><table class="cd-tpltab"><thead><tr>
        <th>${L('Name (DE)', 'Name (DE)')}</th><th>${L('Name (EN)', 'Name (EN)')}</th><th>${L('Inhalt / Ger&auml;t', 'Content / equipment')}</th><th>${L('Serien', 'Sets')}</th><th>${L('Wdh', 'Reps')}</th><th>${L('Belastung', 'Work')}</th><th>${L('Pause', 'Rest')}</th><th>${L('Serienp.', 'Set rest')}</th><th>${L('Intensit&auml;t', 'Intensity')}</th><th></th></tr></thead>
        <tbody>${items.map((m, i) => `<tr class="${/^u_/.test(m.key) ? 'own' : ''}">
          <td><input data-i="${i}" data-f="de" value="${esc(m.de)}"></td><td><input data-i="${i}" data-f="en" value="${esc(m.en || '')}"></td>
          <td><input data-i="${i}" data-f="d.content" value="${esc(m.d.content || '')}" list="cdTplMods"></td>
          <td><input class="n" data-i="${i}" data-f="d.sets" value="${esc(m.d.sets ?? '')}"></td><td><input class="n" data-i="${i}" data-f="d.reps" value="${esc(m.d.reps ?? '')}"></td>
          <td class="pr"><input class="n" data-i="${i}" data-f="d.work.0" value="${esc(m.d.work[0] ?? '')}">${uSel(i, 'd.work.1', m.d.work[1], ['s', 'min', 'm'])}</td>
          <td class="pr"><input class="n" data-i="${i}" data-f="d.rest.0" value="${esc(m.d.rest[0] ?? '')}">${uSel(i, 'd.rest.1', m.d.rest[1], ['s', 'min'])}</td>
          <td class="pr"><input class="n" data-i="${i}" data-f="d.setRest.0" value="${esc(m.d.setRest[0] ?? '')}">${uSel(i, 'd.setRest.1', m.d.setRest[1], ['s', 'min'])}</td>
          <td class="pr"><select data-i="${i}" data-f="d.int.0">${CD_INT_TYPES.map(t => `<option value="${t.key}" ${t.key === m.d.int[0] ? 'selected' : ''}>${L(t.de, t.en)}</option>`).join('')}</select><input class="n" data-i="${i}" data-f="d.int.1" value="${esc(m.d.int[1] ?? '')}"><input class="n" data-i="${i}" data-f="d.int.2" value="${esc(m.d.int[2] ?? '')}"></td>
          <td class="pr"><button type="button" class="mini" data-a="up" data-i="${i}">&uarr;</button><button type="button" class="mini" data-a="down" data-i="${i}">&darr;</button><button type="button" class="mini danger" data-a="del" data-i="${i}">&times;</button></td></tr>`).join('')}</tbody></table></div>
      <datalist id="cdTplMods">${CD_MODS.map(m => `<option value="${esc(CD_LANG === 'en' ? (m.en || m.de) : m.de)}">`).join('')}</datalist>
      <div class="modal-actions"><button type="button" class="secondary small-btn" id="cdtNew">+ ${L('Neue Vorlage', 'New template')}</button><button type="button" class="secondary small-btn" id="cdtReset">${L('Standard wiederherstellen', 'Restore defaults')}</button><span class="spacer"></span>
        <button type="button" class="secondary" id="cdtX">${L('Abbrechen', 'Cancel')}</button><button type="button" id="cdtSave">${L('Speichern', 'Save')}</button></div>
    </div></div>`;
    host.querySelectorAll('[data-f]').forEach(el => {
      const set = () => {
        const m = items[+el.dataset.i], p = el.dataset.f.split('.');
        if (p[0] !== 'd') { m[p[0]] = el.value; return; }
        if (p.length === 2) m.d[p[1]] = el.value; else m.d[p[1]][+p[2]] = el.value;
      };
      el.oninput = set; el.onchange = set;
    });
    host.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      const i = +b.dataset.i, a = b.dataset.a;
      if (a === 'del') { if (!confirm(L('Vorlage „' + items[i].de + '“ löschen? Bestehende Blöcke behalten ihre Werte.', 'Delete template “' + items[i].de + '”? Existing blocks keep their values.'))) return; items.splice(i, 1); }
      else { const j = i + (a === 'up' ? -1 : 1); if (j < 0 || j >= items.length) return; [items[i], items[j]] = [items[j], items[i]]; }
      render();
    });
    host.querySelector('#cdtNew').onclick = () => { items.unshift({ key: 'u_' + Date.now().toString(36), de: L('Neue Vorlage', 'New template'), en: 'New template', d: { sets: 1, reps: 6, work: [30, 's'], rest: [30, 's'], setRest: [0, 's'], int: ['rpe', 7, 8], hr: ['', ''], content: '', note: '' } }); render(); const f = host.querySelector('input[data-f="de"]'); f.focus(); f.select(); };
    host.querySelector('#cdtReset').onclick = () => { if (confirm(L('Standardliste wiederherstellen? Eigene Vorlagen bleiben erhalten, gelöschte Standard-Vorlagen kommen zurück.', 'Restore defaults? Your own templates are kept, deleted standard templates come back.'))) { const own = items.filter(m => /^u_/.test(m.key)); items = own.concat(JSON.parse(JSON.stringify(CD_METHODS))); items.forEach(m => { m.d = Object.assign({ hr: ['', ''], content: '', note: '' }, m.d); }); render(); } };
    host.querySelector('#cdtX').onclick = () => host.remove();
    host.querySelector('#cdtSave').onclick = async () => {
      const clean = items.filter(m => String(m.de || '').trim()).map(m => Object.assign(m, { de: m.de.trim(), en: String(m.en || '').trim() || m.de.trim() }));
      if (!clean.length) { alert(L('Mindestens eine Vorlage nötig.', 'At least one template is required.')); return; }
      const r = await cdSaveMethods(clean);
      if (r.error) { alert(L('Speichern fehlgeschlagen: ', 'Saving failed: ') + r.error.message); return; }
      host.remove(); toast(L('Vorlagen gespeichert.', 'Templates saved.'));
    };
  };
  document.body.appendChild(host); render();
}

// Vorschau: Einheit so, wie die Athletin sie in der App sieht (ohne Eingabefelder)
function cdAthletePreview(S, p, name) {
  const blocks = (S.content && S.content.blocks) || [];
  const dur = cdSessionSec(S.content || {});
  const body = CD_PHASES.map(ph => {
    const list = blocks.filter(b => b.phase === ph.key);
    if (!list.length) return '';
    return `<div class="cd-phead" style="--cat:${ph.color}">${cdPhaseLabel(ph)}</div>` + list.map(b => {
      const pers = cdPersonalText(b, p);
      return `<div class="card cd-myblock" style="--cat:${ph.color}">
        <div class="cd-mytitle"><b>${esc(b.content || cdBLabel(b))}</b><span class="muted-inline">${esc(cdModLabel(b.modality || '', b.modalityEn))}</span></div>
        <div class="cd-mystruct">${esc(cdStructText(b))}</div>${cdSeqHtml(b, p)}
        ${cdIntText(b) ? `<div class="cd-myint">${esc(cdIntText(b))}</div>` : ''}
        ${pers.text ? `<div class="cd-mypers">&#127919; ${L('Deine Vorgabe', 'Your target')}: <b>${esc(pers.text)}</b></div>` : ''}
        ${b.note ? `<div class="tpo-note">&#128204; ${esc(b.note)}</div>` : ''}
      </div>`;
    }).join('');
  }).join('');
  const host = document.createElement('div');
  host.innerHTML = `<div class="modal-scrim"><div class="modal cd-avmodal">
    <div class="ath-toolbar"><h2 style="margin:0;">&#128065; ${L('Ansicht f&uuml;r', 'View for')} ${esc(name)}</h2><span class="spacer"></span><button type="button" class="secondary" id="cdavX">${L('Schlie&szlig;en', 'Close')}</button></div>
    <div class="cd-avphone">
      <div class="card mp-sesshead" style="--lay-main:#1f9d55;--lay-dark:#157a42;--lay-accent:#a1d7ff;">
        <div><div class="mp-kicker">Conditioning${S.planned_date ? ' &middot; ' + cdDate(S.planned_date, { weekday: 'long', day: '2-digit', month: '2-digit' }) : ''}</div>
        <div class="mp-big">${esc(S.title || 'Conditioning')}</div>
        ${S.content && S.content.forName ? `<div class="muted-inline">${L('f&uuml;r', 'for')} ${esc(S.content.forName)}</div>` : ''}
        <div class="muted-inline">${dur.sec ? '&asymp; ' + Math.round(dur.sec / 60) + ' min' : ''}</div></div>
      </div>
      ${S.content && S.content.note ? `<div class="card mp-info">&#128221; ${esc(S.content.note)}</div>` : ''}
      ${!p.vift && !p.hr_max ? `<p class="hint">${p.age ? L('Pulswerte aus dem Alter gesch&auml;tzt.', 'Heart-rate values estimated from age.') : L('Keine Testwerte &ndash; Richtwerte nach Borg-Skala und Sprechtest.', 'No test data &ndash; guide values from Borg scale and talk test.')}</p>` : ''}
      ${body || `<p class="muted">${L('Keine Bl&ouml;cke.', 'No blocks.')}</p>`}
    </div>
  </div></div>`;
  document.body.appendChild(host);
  host.querySelector('#cdavX').onclick = () => host.remove();
  host.querySelector('.modal-scrim').addEventListener('click', e => { if (e.target.classList.contains('modal-scrim')) host.remove(); });
}

// ============================================================
// Conditioning-Pläne: Wochen × Einheit 1, 2, 3 … (Reihenfolge innerhalb der Woche frei)
// ============================================================
// aktuelle Plan-Woche: nach Startdatum, sonst erste Woche mit offenen Einheiten (logs optional)
function cdPlanWeekNow(pl, sessions, logs) {
  if (pl.start_date) {
    const d = Math.floor((Date.now() - new Date(pl.start_date + 'T00:00:00').getTime()) / 86400000);
    return d < 0 ? 1 : Math.min(pl.weeks, Math.floor(d / 7) + 1);
  }
  if (sessions && logs) {
    for (let w = 1; w <= pl.weeks; w++) {
      const ss = sessions.filter(s => s.plan_id === pl.id && s.plan_week === w);
      if (ss.some(s => !logs.some(l => l.session_id === s.id && l.completed))) return w;
    }
  }
  return 1;
}
// Einheiten Athlet:innen zuordnen (mit persönlichen Werten zum Zeitpunkt der Zuordnung)
async function cdAssignSessions(sessionIds, userIds, athByProfile) {
  if (!sessionIds.length || !userIds.length) return { error: null };
  const rows = [];
  sessionIds.forEach(sid => userIds.forEach(uid => { const a = (athByProfile || {})[uid] || {};
    rows.push({ session_id: sid, user_id: uid, active: true, personal: { vift: cdNum(a.vift_kmh), hr_max: a.hr_max || null, hr_rest: a.hr_rest || null, age: cdAge(a.birthdate) } }); }));
  return sb.from('cd_assignments').upsert(rows, { onConflict: 'session_id,user_id' });
}
// Anzeigename einer Einheit (mit Plan, Woche, Einheit)
function cdSessLabel(s, plans) {
  if (!s || !s.plan_id) return (s && s.title) || 'Conditioning';
  const pl = (plans || []).find(p => p.id === s.plan_id);
  return `${pl ? pl.title + ' · ' : ''}${L('W', 'W')}${s.plan_week} · ${L('T', 'D')}${s.plan_slot}${s.title && !CD_DEF_TITLE_RE.test(s.title) ? ' – ' + s.title : ''}`;
}
// Progression beim Kopieren einer Woche
const CD_PROG = [
  { key: 'none', de: 'unverändert kopieren', en: 'copy unchanged' },
  { key: 'rep', de: '+1 Wiederholung je Block', en: '+1 rep per block' },
  { key: 'set', de: '+1 Serie je Block', en: '+1 set per block' },
  { key: 'work', de: '+10 % Belastungsdauer', en: '+10 % work duration' },
  { key: 'int', de: '+2,5 % Intensität (vIFT, HF, Watt, km/h)', en: '+2.5 % intensity (vIFT, HR, watts, km/h)' },
  { key: 'deload', de: 'Deload: −30 % Wiederholungen', en: 'Deload: −30 % reps' },
];
function cdProgress(content, key) {
  const c = JSON.parse(JSON.stringify(content || {}));
  (c.blocks || []).forEach(b => {
    b.id = cdNewId();
    if (b.phase !== 'main' && key !== 'deload') return;           // Warm-Up/Cool-down bleiben gleich
    const n = v => cdNum(v);
    if (key === 'rep' && n(b.reps) && !cdList(b.work.v)) b.reps = n(b.reps) + 1;
    if (key === 'set' && n(b.sets)) b.sets = n(b.sets) + 1;
    if (key === 'work' && cdList(b.work.v)) b.work.v = cdList(b.work.v).map(x => cdDec(Math.round(x * 1.1 * 10) / 10)).join('-');
    else if (key === 'work' && n(b.work.v)) b.work.v = Math.round(n(b.work.v) * 1.1 * 10) / 10;
    if (key === 'deload' && cdList(b.work.v)) return;   // Pyramide: Anzahl ergibt sich aus der Liste
    if (key === 'int' && ['vift', 'hrmax', 'hrr', 'watt', 'speed'].includes(b.int.type)) {
      ['min', 'max'].forEach(k => { if (n(b.int[k])) b.int[k] = Math.round(n(b.int[k]) * 1.025 * 10) / 10; });
    }
    if (key === 'deload' && b.phase === 'main' && n(b.reps)) b.reps = Math.max(1, Math.round(n(b.reps) * 0.7));
  });
  return c;
}

async function renderCdPlan(profile, planId, opts) {
  const back = { label: 'Conditioning', go: () => renderConditionHub(profile) };
  renderShell(profile, 'trainingsplan', L('Conditioning-Plan', 'Conditioning plan'), `<p class="muted">${L('Lade', 'Loading')}&hellip;</p>`, back);
  let P = { id: null, title: '', team: '', for_name: '', start_date: null, weeks: 4, per_week: 2, members: [], note: '' };
  let sessions = [], logs = [];
  const [mgmt, prof, lib] = await Promise.all([
    loadAthleteData().catch(() => null),
    sb.from('profiles').select('id, name, role, permissions').eq('role', 'athlete').order('name'),
    sb.from('cd_sessions').select('id, title, plan_id, plan_week, plan_slot, content, planned_date').eq('archived', false).order('created_at', { ascending: false }),
    Promise.all([cdLoadModalities(), cdLoadMethods()]),
  ]);
  const reload = async () => {
    if (!P.id) return;
    const [p, s, l] = await Promise.all([
      sb.from('cd_plans').select('*').eq('id', P.id).single(),
      sb.from('cd_sessions').select('*').eq('plan_id', P.id),
      sb.from('cd_logs').select('session_id, user_id, completed, srpe, duration_min'),
    ]);
    if (!p.error) P = p.data;
    sessions = s.data || [];
    logs = (l.data || []).filter(x => sessions.some(y => y.id === x.session_id));
  };
  if (planId) { P.id = planId; await reload(); }
  const athletes = mgmt ? mgmt.athletes : [], groups = mgmt ? mgmt.groups : [];
  const athByProfile = {}; athletes.forEach(a => { if (a.profile_id) athByProfile[a.profile_id] = a; });
  const users = prof.data || [];
  const athNames = athletes.map(a => `${a.first_name} ${a.last_name}`.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, 'de'));
  let clip = null;   // kopierte Einheit (content + title)

  const savePlan = async (quiet) => {
    if (!(P.title || '').trim()) { alert(L('Bitte einen Titel für den Plan eingeben.', 'Please enter a plan title.')); return false; }
    const { data: { user } } = await sb.auth.getUser();
    const row = { title: P.title.trim(), team: (P.team || '').trim() || null, for_name: (P.for_name || '').trim() || null, start_date: P.start_date || null,
      weeks: Math.max(1, Math.min(26, parseInt(P.weeks, 10) || 4)), per_week: Math.max(1, Math.min(7, parseInt(P.per_week, 10) || 2)), note: P.note || null, updated_at: new Date().toISOString() };
    const r = P.id ? await sb.from('cd_plans').update(row).eq('id', P.id).select('*').single()
                   : await sb.from('cd_plans').insert(Object.assign({ created_by: user.id }, row)).select('*').single();
    if (r.error) { alert(L('Speichern fehlgeschlagen: ', 'Saving failed: ') + r.error.message); return false; }
    P = r.data;
    if (!quiet) toast(L('Plan gespeichert.', 'Plan saved.'));
    return true;
  };
  const insertSession = async (w, n, content, title) => {
    const { data: { user } } = await sb.auth.getUser();
    const r = await sb.from('cd_sessions').insert({ title: title || cdDefTitle(w, n), team: P.team || null, planned_date: null, content, plan_id: P.id, plan_week: w, plan_slot: n, created_by: user.id }).select('id').single();
    if (r.error) { alert(L('Fehler: ', 'Error: ') + r.error.message); return null; }
    if ((P.members || []).length) await cdAssignSessions([r.data.id], P.members, athByProfile);
    return r.data.id;
  };
  const openSession = (s) => renderCdEditor(profile, s, { plan: P, back: () => renderCdPlan(profile, P.id) });
  const blocksSummary = (s) => {
    const main = ((s.content && s.content.blocks) || []).filter(b => b.phase === 'main');
    return main.map(b => `${cdBLabel(b, true)}: ${cdStructText(b)}`).join(' | ');
  };

  const draw = () => {
    const cw = cdPlanWeekNow(P, sessions, logs);
    const weeks = Array.from({ length: P.weeks }, (_, i) => i + 1), slots = Array.from({ length: P.per_week }, (_, i) => i + 1);
    const outside = sessions.filter(s => s.plan_week > P.weeks || s.plan_slot > P.per_week).length;
    const cell = (w, n) => {
      const s = sessions.find(x => x.plan_week === w && x.plan_slot === n);
      if (!s) return `<td class="cd-pcell empty"><button type="button" class="secondary small-btn" data-new="${w},${n}">+ ${L('Neu', 'New')}</button>
        <button type="button" class="secondary small-btn" data-lib="${w},${n}" title="${L('Aus vorhandenen Einheiten', 'From existing sessions')}">&#128218;</button>
        ${clip ? `<button type="button" class="secondary small-btn" data-paste="${w},${n}" title="${L('Kopierte Einheit einf&uuml;gen', 'Paste copied session')}">&#128203;</button>` : ''}</td>`;
      const dur = cdSessionSec(s.content || {});
      const done = logs.filter(l => l.session_id === s.id && l.completed).length;
      return `<td class="cd-pcell"><div class="cd-pc" data-open="${s.id}">
        <b>${esc(CD_DEF_TITLE_RE.test(s.title) ? (((s.content || {}).blocks || []).filter(b => b.phase === 'main').map(b => b.content || cdBLabel(b, true))[0] || s.title) : s.title)}</b>
        <small>${esc(blocksSummary(s))}</small>
        <small>${dur.sec ? '&asymp; ' + Math.round(dur.sec / 60) + ' min' : ''}${(P.members || []).length ? ` &middot; ${done}/${P.members.length} &#10003;` : ''}</small></div>
        <div class="cd-pcbtns"><button type="button" class="mini" data-copy="${s.id}" title="${L('Kopieren', 'Copy')}">&#10697;</button><button type="button" class="mini danger" data-rm="${s.id}" title="${L('Entfernen', 'Remove')}">&times;</button></div></td>`;
    };
    const weekMin = w => Math.round(sessions.filter(s => s.plan_week === w).reduce((n, s) => n + (cdSessionSec(s.content || {}).sec || 0), 0) / 60);
    const html = `${cdLangBar()}
      <div class="card">
        <div class="cd-top">
          <label class="w2">${L('Titel', 'Title')}<input type="text" id="cpTitle" value="${esc(P.title || '')}" placeholder="${L('z. B. HIIT-Block Vorbereitung', 'e.g. HIIT block pre-season')}"></label>
          <label>${L('F&uuml;r wen?', 'For whom?')}<input type="text" id="cpFor" list="cpNames" value="${esc(P.for_name || '')}" placeholder="${L('Name oder Gruppe', 'Name or group')}"><datalist id="cpNames">${athNames.concat(groups.map(g => g.name)).map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>
          <label>${L('Start (optional)', 'Start (optional)')}<input type="date" id="cpStart" value="${P.start_date || ''}"></label>
          <label>${L('Wochen', 'Weeks')}<input type="number" id="cpWeeks" min="1" max="26" value="${P.weeks}"></label>
          <label>${L('Tage pro Woche', 'Days per week')}<input type="number" id="cpPer" min="1" max="7" value="${P.per_week}"></label>
          <label class="w2">${L('Hinweis', 'Note')}<input type="text" id="cpNote" value="${esc(P.note || '')}" placeholder="${L('z. B. Reihenfolge der Einheiten innerhalb der Woche frei, mind. 1 Tag Pause dazwischen', 'e.g. any order within the week, at least 1 rest day in between')}"></label>
        </div>
        <div class="cd-savebar" style="position:static;background:none;padding:12px 0 0;">
          ${P.id ? `<span class="hint" style="margin:0 auto 0 0;align-self:center;">${(P.members || []).length ? L('Ver&ouml;ffentlicht f&uuml;r ', 'Published for ') + P.members.length + ' &middot; ' + L('aktuelle Woche ', 'current week ') + cw : L('Noch nicht ver&ouml;ffentlicht', 'Not published yet')}</span>` : ''}
          <button type="button" class="secondary" id="cpSave">&#128190; ${L('Plan speichern', 'Save plan')}</button>
          ${P.id ? `<button type="button" id="cpPub">&#128242; ${L('Plan ver&ouml;ffentlichen', 'Publish plan')}${(P.members || []).length ? ' (' + P.members.length + ')' : ''}</button>` : ''}
        </div>
      </div>
      ${P.id ? `<div class="card">
        <div class="tablewrap"><table class="cd-plangrid">
          <thead><tr><th>${L('Woche', 'Week')}</th>${slots.map(n => `<th>${L('Tag', 'Day')} ${n}</th>`).join('')}<th>${L('Summe', 'Total')}</th></tr></thead>
          <tbody>${weeks.map(w => `<tr class="${w === cw && (P.members || []).length ? 'cur' : ''}">
            <th><div>${L('Woche', 'Week')} ${w}</div>${P.start_date ? `<small>${cdDate(new Date(new Date(P.start_date + 'T00:00:00').getTime() + (w - 1) * 604800000).toISOString().slice(0, 10), { day: '2-digit', month: '2-digit' })}</small>` : ''}
              ${w < P.weeks ? `<button type="button" class="secondary small-btn" data-copyw="${w}" title="${L('Woche in die n&auml;chste(n) Woche(n) kopieren, optional mit Progression', 'Copy week to the next week(s), optionally with progression')}">&#10697; &rarr;</button>` : ''}</th>
            ${slots.map(n => cell(w, n)).join('')}
            <td class="cd-psum">${weekMin(w) ? '&asymp; ' + weekMin(w) + ' min' : '–'}</td></tr>`).join('')}</tbody>
        </table></div>
        ${outside ? `<p class="hint" style="color:#8a5a00;">${outside} ${L('Einheit(en) liegen au&szlig;erhalb der aktuellen Wochen-/Einheitenzahl und werden nicht angezeigt (Zahl wieder erh&ouml;hen, um sie zu sehen).', 'session(s) lie outside the current number of weeks/sessions and are hidden (increase the numbers to see them).')}</p>` : ''}
        <p class="hint">${L('Einheit anklicken zum Bearbeiten (gleicher Editor wie Einzel-Einheiten). &#10697; kopiert eine Einheit, &#128203; f&uuml;gt sie in ein leeres Feld ein. &bdquo;&#10697; &rarr;&ldquo; in der Wochenspalte kopiert die ganze Woche &ndash; unver&auml;ndert oder mit Progression (Wdh, Serien, Dauer, Intensit&auml;t, Deload). Die Reihenfolge der Einheiten innerhalb der Woche ist f&uuml;r die Athlet:innen frei.', 'Click a session to edit it (same editor as single sessions). &#10697; copies a session, &#128203; pastes it into an empty cell. &ldquo;&#10697; &rarr;&rdquo; in the week column copies the whole week &ndash; unchanged or with progression (reps, sets, duration, intensity, deload). Athletes may do the sessions of a week in any order.')}</p>
      </div>` : `<p class="hint">${L('Plan speichern, dann Wochen mit Einheiten f&uuml;llen.', 'Save the plan, then fill the weeks with sessions.')}</p>`}`;
    renderShell(profile, 'trainingsplan', P.title || L('Neuer Conditioning-Plan', 'New conditioning plan'), html, back);
    cdWireLang(draw);
    const f = (id, k) => { const el = document.getElementById(id); el.oninput = () => { P[k] = el.value; }; };
    f('cpTitle', 'title'); f('cpFor', 'for_name'); f('cpStart', 'start_date'); f('cpWeeks', 'weeks'); f('cpPer', 'per_week'); f('cpNote', 'note');
    document.getElementById('cpSave').onclick = async () => {
      const isNew = !P.id;
      if (!(await savePlan())) return;
      await reload();
      // neuer Plan: direkt Woche 1 · Tag 1 in der Eingabemaske öffnen
      if (isNew) openSession({ id: null, title: cdDefTitle(1, 1), team: P.team, planned_date: null, content: { blocks: [cdNewBlock('warmup'), cdNewBlock('main'), cdNewBlock('cooldown')] }, plan_id: P.id, plan_week: 1, plan_slot: 1 });
      else draw();
    };
    const pubB = document.getElementById('cpPub'); if (pubB) pubB.onclick = () => publishPlan();
    appEl.querySelectorAll('[data-open]').forEach(el => el.onclick = () => openSession(sessions.find(s => s.id === el.dataset.open)));
    appEl.querySelectorAll('[data-new]').forEach(b => b.onclick = () => {
      const [w, n] = b.dataset.new.split(',').map(Number);
      const blocks = [cdNewBlock('warmup'), cdNewBlock('main'), cdNewBlock('cooldown')];
      openSession({ id: null, title: cdDefTitle(w, n), team: P.team, planned_date: null, content: { blocks }, plan_id: P.id, plan_week: w, plan_slot: n });
    });
    appEl.querySelectorAll('[data-paste]').forEach(b => b.onclick = async () => {
      const [w, n] = b.dataset.paste.split(',').map(Number);
      if (await insertSession(w, n, cdProgress(clip.content, 'none'), clip.title && !CD_DEF_TITLE_RE.test(clip.title) ? clip.title : null)) { await reload(); draw(); toast(L('Eingefügt.', 'Pasted.')); }
    });
    appEl.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => { const s = sessions.find(x => x.id === b.dataset.copy); clip = { content: s.content, title: s.title }; draw(); toast(L('Kopiert – 📋 in einem leeren Feld einfügen.', 'Copied – paste with 📋 in an empty cell.')); });
    appEl.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
      const s = sessions.find(x => x.id === b.dataset.rm);
      const n = logs.filter(l => l.session_id === s.id).length;
      if (!confirm(L('Einheit aus dem Plan entfernen?', 'Remove session from the plan?') + (n ? '\n\n' + L(n + ' Eintragung(en) der Athlet:innen werden mitgelöscht.', n + ' athlete entr(y/ies) will be deleted as well.') : ''))) return;
      const r = await sb.from('cd_sessions').delete().eq('id', s.id);
      if (r.error) { toast(L('Fehler: ', 'Error: ') + r.error.message); return; }
      await reload(); draw();
    });
    appEl.querySelectorAll('[data-lib]').forEach(b => b.onclick = () => pickFromLibrary(...b.dataset.lib.split(',').map(Number)));
    appEl.querySelectorAll('[data-copyw]').forEach(b => b.onclick = () => copyWeek(+b.dataset.copyw));
  };

  const pickFromLibrary = (w, n) => {
    const list = (lib.data || []).filter(s => s.plan_id !== P.id || true);
    const host = document.createElement('div');
    let q = '';
    const render = () => {
      const rows = list.filter(s => !q || (s.title || '').toLowerCase().includes(q) || JSON.stringify(s.content || {}).toLowerCase().includes(q)).slice(0, 80);
      host.innerHTML = `<div class="modal-scrim"><div class="modal" style="max-width:640px;">
        <h2>&#128218; ${L('Einheit &uuml;bernehmen', 'Use existing session')} &middot; ${L('Woche', 'Week')} ${w}, ${L('Tag', 'Day')} ${n}</h2>
        <input type="text" id="cplQ" value="${esc(q)}" placeholder="${L('Suchen &hellip;', 'Search &hellip;')}" style="width:100%;margin-bottom:10px;">
        <div class="cd-libl">${rows.map(s => `<button type="button" class="cd-mine" data-pick="${s.id}"><span><b>${esc(s.title || 'Conditioning')}</b><span class="muted-inline">${esc(((s.content || {}).blocks || []).filter(b => b.phase === 'main').map(b => cdBLabel(b, true) + ' ' + cdStructText(b)).join(' | '))}</span></span></button>`).join('') || `<p class="muted">${L('Keine Einheiten gefunden.', 'No sessions found.')}</p>`}</div>
        <div class="modal-actions"><span class="spacer"></span><button type="button" class="secondary" id="cplX">${L('Abbrechen', 'Cancel')}</button></div></div></div>`;
      const qi = host.querySelector('#cplQ'); qi.oninput = () => { q = qi.value.toLowerCase(); const pos = qi.selectionStart; render(); const n2 = host.querySelector('#cplQ'); n2.focus(); n2.setSelectionRange(pos, pos); };
      host.querySelector('#cplX').onclick = () => host.remove();
      host.querySelectorAll('[data-pick]').forEach(b => b.onclick = async () => {
        const s = list.find(x => x.id === b.dataset.pick);
        host.remove();
        if (await insertSession(w, n, cdProgress(s.content, 'none'), s.plan_id ? null : s.title)) { await reload(); draw(); toast(L('Übernommen.', 'Added.')); }
      });
    };
    document.body.appendChild(host); render(); host.querySelector('#cplQ').focus();
  };

  const copyWeek = (w) => {
    const host = document.createElement('div');
    host.innerHTML = `<div class="modal-scrim"><div class="modal" style="max-width:520px;">
      <h2>&#10697; ${L('Woche', 'Week')} ${w} ${L('kopieren', 'copy')}</h2>
      <label class="wq-date">${L('Ziel', 'Target')}<select id="cwTo"><option value="next">${L('in Woche', 'to week')} ${w + 1}</option><option value="all">${L('in alle folgenden Wochen', 'to all following weeks')} (${w + 1}&ndash;${P.weeks})</option></select></label>
      <label class="wq-date" style="margin-top:10px;">${L('Progression je Woche', 'Progression per week')}<select id="cwProg">${CD_PROG.filter(p => p.key !== 'deload').map(p => `<option value="${p.key}">${L(p.de, p.en)}</option>`).join('')}</select></label>
      <label class="mp-check" style="margin-top:10px;"><input type="checkbox" id="cwDeload"> ${L('Jede 4. Woche Deload (&minus;30 % Wiederholungen)', 'Deload every 4th week (&minus;30 % reps)')}</label>
      <p class="hint">${L('Vorhandene Einheiten in den Zielwochen werden ersetzt (Einheiten mit Eintragungen bleiben erhalten). Progression gilt f&uuml;r den Hauptteil; Warm-Up und Cool-down bleiben gleich.', 'Existing sessions in the target weeks are replaced (sessions with entries are kept). Progression applies to the main set; warm-up and cool-down stay the same.')}</p>
      <div class="modal-actions"><span class="spacer"></span><button type="button" class="secondary" id="cwX">${L('Abbrechen', 'Cancel')}</button><button type="button" id="cwGo">${L('Kopieren', 'Copy')}</button></div></div></div>`;
    document.body.appendChild(host);
    host.querySelector('#cwX').onclick = () => host.remove();
    host.querySelector('#cwGo').onclick = async () => {
      const to = host.querySelector('#cwTo').value, prog = host.querySelector('#cwProg').value, deload = host.querySelector('#cwDeload').checked;
      const src = sessions.filter(s => s.plan_week === w && s.plan_slot <= P.per_week);
      if (!src.length) { alert(L('Woche ' + w + ' hat noch keine Einheiten.', 'Week ' + w + ' has no sessions yet.')); return; }
      host.querySelector('#cwGo').disabled = true;
      const targets = to === 'next' ? [w + 1] : Array.from({ length: P.weeks - w }, (_, i) => w + 1 + i);
      let prev = Object.fromEntries(src.map(s => [s.plan_slot, s])), made = 0, kept = 0;
      for (const tw of targets) {
        const isDeload = deload && tw % 4 === 0;
        const next = {};
        for (const slot of Object.keys(prev).map(Number)) {
          const base = prev[slot];
          const content = cdProgress(base.content, isDeload ? 'deload' : prog);
          const old = sessions.find(s => s.plan_week === tw && s.plan_slot === slot);
          if (old && logs.some(l => l.session_id === old.id)) { kept++; next[slot] = old; continue; }
          if (old) await sb.from('cd_sessions').delete().eq('id', old.id);
          const title = CD_DEF_TITLE_RE.test(base.title) ? null : base.title;
          const id = await insertSession(tw, slot, content, title);
          if (id) made++;
          // Deload-Woche wirkt nicht als Basis für die nächste Progression
          next[slot] = isDeload ? base : { content, title: base.title };
        }
        prev = next;
      }
      host.remove(); await reload(); draw();
      toast(L(made + ' Einheit(en) erstellt', made + ' session(s) created') + (kept ? L(', ' + kept + ' mit Eintragungen behalten', ', ' + kept + ' with entries kept') : ''));
    };
  };

  const publishPlan = () => {
    const host = document.createElement('div');
    const sel = new Set(P.members || []);
    if (!sel.size && P.for_name) { const n = P.for_name.toLowerCase().trim(); users.forEach(u => { const a = athByProfile[u.id]; if ((a && (a.first_name + ' ' + a.last_name).toLowerCase() === n) || u.name.toLowerCase() === n) sel.add(u.id); }); const g = groups.find(x => x.name.toLowerCase() === n); if (g) users.forEach(u => { const a = athByProfile[u.id]; if (a && a.groupIds.includes(g.id)) sel.add(u.id); }); }
    const render = () => {
      host.innerHTML = `<div class="modal-scrim"><div class="modal" style="max-width:640px;">
        <h2>&#128242; ${L('Plan ver&ouml;ffentlichen', 'Publish plan')}</h2>
        <p class="hint" style="margin-top:0;">${L('Die Ausgew&auml;hlten sehen alle Einheiten des Plans unter &bdquo;Conditioning&ldquo; (aktuelle Woche oben). Sp&auml;ter hinzugef&uuml;gte Einheiten werden automatisch zugeordnet.', 'Selected athletes see all plan sessions under &ldquo;Conditioning&rdquo; (current week on top). Sessions added later are assigned automatically.')}</p>
        <div class="chips" style="margin-bottom:8px;">${groups.map(g => `<button type="button" class="secondary small-btn" data-g="${g.id}">${esc(g.name)}</button>`).join('')}<button type="button" class="secondary small-btn" data-g="__all">${L('Alle', 'All')}</button><button type="button" class="secondary small-btn" data-g="__none">${L('Keine', 'None')}</button></div>
        <div class="cd-pick">${users.map(u => { const noPerm = !!u.permissions && (u.permissions.condition === 'none' || !u.permissions.condition);
          return `<label><input type="checkbox" data-u="${u.id}" ${sel.has(u.id) ? 'checked' : ''}> ${esc(u.name)}${noPerm ? ` <b style="color:#b0281c;">${L('Recht fehlt', 'no permission')}</b>` : ''}</label>`; }).join('')}</div>
        <div class="modal-actions"><span class="spacer">${sel.size} ${L('ausgew&auml;hlt', 'selected')}</span>
          <button type="button" class="secondary" id="cppX">${L('Abbrechen', 'Cancel')}</button><button type="button" id="cppGo">${L('Ver&ouml;ffentlichen', 'Publish')}</button></div></div></div>`;
      host.querySelectorAll('[data-u]').forEach(c => c.onchange = () => { if (c.checked) sel.add(c.dataset.u); else sel.delete(c.dataset.u); render(); });
      host.querySelectorAll('[data-g]').forEach(b => b.onclick = () => {
        const g = b.dataset.g;
        if (g === '__all') users.forEach(u => sel.add(u.id)); else if (g === '__none') sel.clear();
        else { sel.clear(); users.forEach(u => { const a = athByProfile[u.id]; if (a && a.groupIds.includes(g)) sel.add(u.id); }); }
        render();
      });
      host.querySelector('#cppX').onclick = () => host.remove();
      host.querySelector('#cppGo').onclick = async () => {
        const btn = host.querySelector('#cppGo'); btn.disabled = true;
        if (!(await savePlan(true))) { btn.disabled = false; return; }
        const members = [...sel], removed = (P.members || []).filter(u => !sel.has(u));
        let r = await sb.from('cd_plans').update({ members }).eq('id', P.id);
        if (!r.error) r = await cdAssignSessions(sessions.map(s => s.id), members, athByProfile);
        if (!r.error && removed.length && sessions.length) r = await sb.from('cd_assignments').update({ active: false }).in('session_id', sessions.map(s => s.id)).in('user_id', removed);
        if (r.error) { alert(L('Veröffentlichen fehlgeschlagen: ', 'Publishing failed: ') + r.error.message); btn.disabled = false; return; }
        host.remove(); await reload(); draw(); toast(L('Plan veröffentlicht für ' + members.length + ' Athlet:innen', 'Plan published for ' + members.length + ' athletes'));
      };
    };
    document.body.appendChild(host); render();
  };
  draw();
  if (opts && opts.publish && P.id) publishPlan();
}
