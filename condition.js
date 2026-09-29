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
const CD_MODALITIES = ['Laufen (Platz/Halle)', 'Laufband', 'Court (Basketball)', 'Rad-Ergometer', 'Air Bike', 'Rudern', 'SkiErg', 'Schwimmen', 'Seilspringen', 'Sonstiges'];
const CD_MOD_EN = { 'Laufen (Platz/Halle)': 'Running (field/gym)', 'Laufband': 'Treadmill', 'Court (Basketball)': 'Court (basketball)', 'Rad-Ergometer': 'Bike ergometer', 'Air Bike': 'Air bike', 'Rudern': 'Rowing', 'SkiErg': 'SkiErg', 'Schwimmen': 'Swimming', 'Seilspringen': 'Jump rope', 'Sonstiges': 'Other' };
const cdModLabel = (m) => CD_LANG === 'en' ? (CD_MOD_EN[m] || m) : m;
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
const CD_METHOD = Object.fromEntries(CD_METHODS.map(m => [m.key, m]));
const cdMethodLabel = (k, short) => { const m = CD_METHOD[k]; if (!m) return 'Block'; const t = L(m.de, m.en); return short ? t.split(' (')[0] : t; };

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
  const m = CD_METHOD[methodKey || (phase === 'main' ? 'hiit1515' : 'dauer')] || CD_METHODS[0];
  const d = m.d;
  const b = { id: cdNewId(), phase, method: m.key, content: '', modality: CD_MODALITIES[0], sets: d.sets, reps: d.reps,
    work: { v: d.work[0], u: d.work[1] }, rest: { v: d.rest[0], u: d.rest[1] }, setRest: { v: d.setRest[0], u: d.setRest[1] },
    int: { type: d.int[0], min: d.int[1], max: d.int[2] }, hr: { min: '', max: '' }, note: '' };
  if (phase !== 'main') { b.work = { v: phase === 'warmup' ? 10 : 8, u: 'min' }; b.int = { type: 'hrmax', min: 60, max: 70 }; b.method = 'dauer'; b.sets = 1; b.reps = 1; }
  return b;
}
// Gesamtdauer eines Blocks (s); bei Belastung in Metern ohne Tempo nicht bestimmbar
function cdBlockSec(b, workSecOverride) {
  const sets = Math.max(1, cdNum(b.sets) || 1), reps = Math.max(1, cdNum(b.reps) || 1);
  const w = workSecOverride != null ? workSecOverride : cdSec(b.work.v, b.work.u);
  const r = cdSec(b.rest.v, b.rest.u) || 0, sr = cdSec(b.setRest.v, b.setRest.u) || 0;
  if (w == null) return null;
  return sets * reps * w + sets * (reps - 1) * r + (sets - 1) * sr;
}
function cdStructText(b) {
  const sets = cdNum(b.sets) || 1, reps = cdNum(b.reps) || 1;
  const w = cdFmtVal(b.work.v, b.work.u), r = cdNum(b.rest.v) ? cdFmtVal(b.rest.v, b.rest.u) : '';
  let t = (reps > 1 ? `${reps} × ${w}` : w) + (r && reps > 1 ? ` / ${r} ${L('Pause', 'rest')}` : '');
  if (sets > 1) t = L(`${sets} Serien à ${t}`, `${sets} sets of ${t}`) + (cdNum(b.setRest.v) ? ` · ${cdFmtVal(b.setRest.v, b.setRest.u)} ${L('Serienpause', 'between sets')}` : '');
  return t;
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
    const ws = cdSec(b.work.v, b.work.u);
    if (ws != null) { const m1 = Math.round(v1 / 3.6 * ws / 5) * 5, m2 = Math.round(v2 / 3.6 * ws / 5) * 5; out.push(`≈ ${m1}${m2 !== m1 ? '–' + m2 : ''} ${L('m je Belastung', 'm per rep')}`); }
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
  const [sRes, aRes, lRes, prRes] = await Promise.all([
    sb.from('cd_sessions').select('*').eq('archived', false).order('planned_date', { ascending: false, nullsFirst: true }).order('created_at', { ascending: false }),
    sb.from('cd_assignments').select('session_id, user_id, active').eq('active', true),
    sb.from('cd_logs').select('session_id, user_id, completed, srpe, duration_min'),
    sb.from('profiles').select('id, name'),
  ]);
  const err = [sRes, aRes, lRes, prRes].map(r => r.error).filter(Boolean)[0];
  if (err) { renderShell(profile, 'trainingsplan', T, `<div class="card"><p class="error">${L('Fehler', 'Error')}: ${esc(err.message)}${/cd_sessions|relation/.test(err.message) ? '<br>' + L('Die Datenbank f&uuml;r Conditioning ist noch nicht eingerichtet (Migration supabase_migration_condition.sql).', 'The Conditioning database is not set up yet (migration supabase_migration_condition.sql).') : ''}</p></div>`); return; }
  const names = Object.fromEntries((prRes.data || []).map(p => [p.id, p.name]));
  const today = new Date().toISOString().slice(0, 10);
  const cards = (sRes.data || []).map(s => {
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
        <button type="button" class="secondary" id="cdValues">&#128200; ${L('Leistungswerte (vIFT / HFmax)', 'Test values (vIFT / HRmax)')}</button>
        <button type="button" id="cdNew">+ ${L('Neue Einheit', 'New session')}</button>
      </div>
    </div>
    ${cards || `<div class="card"><p class="muted">${L('Noch keine Conditioning-Einheiten. &bdquo;+ Neue Einheit&ldquo; anklicken.', 'No conditioning sessions yet. Click &ldquo;+ New session&rdquo;.')}</p></div>`}
    ${cdSourcesHtml()}`;
  renderShell(profile, 'trainingsplan', T, content, { label: 'Trainingsplanung', go: () => renderTpHub(profile) });
  cdWireLang(() => renderConditionHub(profile));
  document.getElementById('cdNew').onclick = () => renderCdEditor(profile, null);
  document.getElementById('cdValues').onclick = () => renderCdValues(profile);
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
async function renderCdEditor(profile, session) {
  const back = { label: 'Conditioning', go: () => { if (!dirty || confirm(L('Ungespeicherte Änderungen verwerfen?', 'Discard unsaved changes?'))) renderConditionHub(profile); } };
  const T = () => session && session.id ? L('Conditioning bearbeiten', 'Edit conditioning') : L('Neue Conditioning-Einheit', 'New conditioning session');
  renderShell(profile, 'trainingsplan', T(), `<p class="muted">${L('Lade', 'Loading')}&hellip;</p>`, back);
  const S = session ? JSON.parse(JSON.stringify(session)) : { id: null, title: '', team: '', planned_date: new Date().toISOString().slice(0, 10), content: {} };
  S.content = S.content || {};
  if (!Array.isArray(S.content.blocks) || !S.content.blocks.length) S.content.blocks = [cdNewBlock('warmup'), cdNewBlock('main'), cdNewBlock('cooldown')];
  let dirty = false;
  const [mgmt, lib, asg, prof] = await Promise.all([
    loadAthleteData().catch(() => null),
    sb.from('tp_builder_store').select('data').eq('key', 'tp_builder_db_v2').maybeSingle(),
    S.id ? sb.from('cd_assignments').select('user_id, active').eq('session_id', S.id) : Promise.resolve({ data: [] }),
    sb.from('profiles').select('id, name, role, permissions').eq('role', 'athlete').order('name'),
  ]);
  const libNames = ((lib.data && lib.data.data && lib.data.data.conditioning) || []).map(x => x.name).filter(Boolean).sort((a, b) => a.localeCompare(b, 'de'));
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
  const blockCard = (b, idx) => {
    const ph = CD_PHASES.find(p => p.key === b.phase) || CD_PHASES[1];
    const sec = cdBlockSec(b);
    return `<div class="cd-block" data-i="${idx}" style="--cat:${ph.color}">
      <div class="cd-bhead">
        <select data-k="method" class="cd-method">${CD_METHODS.map(m => `<option value="${m.key}" ${m.key === b.method ? 'selected' : ''}>${esc(L(m.de, m.en))}</option>`).join('')}</select>
        <span class="cd-bsum">${esc(cdStructText(b))}${cdIntText(b) ? ' &middot; ' + esc(cdIntText(b)) : ''} &middot; ${sec != null ? '&asymp; ' + cdFmtDur(sec) : L('Dauer je nach Tempo', 'duration depends on speed')}</span>
        <span class="cd-btools">
          <button type="button" class="mini" data-a="up" title="${L('nach oben', 'move up')}">&uarr;</button><button type="button" class="mini" data-a="down" title="${L('nach unten', 'move down')}">&darr;</button>
          <button type="button" class="mini" data-a="dup" title="${L('duplizieren', 'duplicate')}">&#10697;</button><button type="button" class="mini danger" data-a="del" title="${L('l&ouml;schen', 'delete')}">&times;</button>
        </span>
      </div>
      <div class="cd-grid">
        <label class="w2">${L('Inhalt / &Uuml;bung', 'Content / exercise')}<input type="text" data-k="content" list="cdLib" value="${esc(b.content || '')}" placeholder="${L('z. B. Pendell&auml;ufe 20 m, lockeres Einlaufen &hellip;', 'e.g. 20 m shuttles, easy jog &hellip;')}"></label>
        <label>${L('Sportart', 'Modality')}<select data-k="modality">${CD_MODALITIES.map(m => `<option value="${esc(m)}" ${m === b.modality ? 'selected' : ''}>${esc(cdModLabel(m))}</option>`).join('')}</select></label>
        <label>${L('Phase', 'Phase')}<select data-k="phase">${CD_PHASES.map(p => `<option value="${p.key}" ${p.key === b.phase ? 'selected' : ''}>${cdPhaseLabel(p)}</option>`).join('')}</select></label>
        <label>${L('Serien', 'Sets')}<input type="text" inputmode="numeric" data-k="sets" value="${esc(b.sets ?? '')}"></label>
        <label>${L('Wiederholungen', 'Reps')}<input type="text" inputmode="numeric" data-k="reps" value="${esc(b.reps ?? '')}"></label>
        <label>${L('Belastung', 'Work')}<span class="cd-pair"><input type="text" inputmode="decimal" data-k="work.v" value="${esc(b.work.v ?? '')}">${unitSel('work.u', b.work.u, ['s', 'min', 'm'])}</span></label>
        <label>${L('Pause', 'Rest')}<span class="cd-pair"><input type="text" inputmode="decimal" data-k="rest.v" value="${esc(b.rest.v ?? '')}">${unitSel('rest.u', b.rest.u, ['s', 'min'])}</span></label>
        <label>${L('Serienpause', 'Rest between sets')}<span class="cd-pair"><input type="text" inputmode="decimal" data-k="setRest.v" value="${esc(b.setRest.v ?? '')}">${unitSel('setRest.u', b.setRest.u, ['s', 'min'])}</span></label>
        <label class="w2">${L('Intensit&auml;t', 'Intensity')}<span class="cd-pair"><select data-k="int.type">${CD_INT_TYPES.map(t => `<option value="${t.key}" ${t.key === b.int.type ? 'selected' : ''}>${L(t.de, t.en)}</option>`).join('')}</select>${intInputs(b)}</span></label>
        <label>${L('HF-Kontrolle (% HFmax)', 'HR check (% HRmax)')}<span class="cd-pair"><input type="text" inputmode="numeric" data-k="hr.min" value="${esc(b.hr.min ?? '')}" placeholder="${L('von', 'from')}"> – <input type="text" inputmode="numeric" data-k="hr.max" value="${esc(b.hr.max ?? '')}" placeholder="${L('bis', 'to')}"></span></label>
        <label class="w3">${L('Hinweis', 'Note')}<input type="text" data-k="note" value="${esc(b.note || '')}" placeholder="${L('z. B. Richtungswechsel alle 20 m, Pause aktiv gehen', 'e.g. change direction every 20 m, walk during rest')}"></label>
      </div>
    </div>`;
  };
  const previewHtml = () => {
    const mains = S.content.blocks.filter(b => ['vift', 'hrmax', 'hrzone', 'hrr'].includes(b.int.type) || cdNum(b.hr.min) || cdNum(b.hr.max));
    const fu = forUser();
    const who = users.filter(u => previewGrp === '__for' ? (fu && u.id === fu.id) : previewGrp === '__pub' ? picked.has(u.id) : (!previewGrp || (athByProfile[u.id] && athByProfile[u.id].groupIds.includes(previewGrp))));
    if (!mains.length) return `<p class="hint">${L('Pers&ouml;nliche Werte entstehen bei Intensit&auml;t in % vIFT, % HFmax, HF-Zone oder Karvonen.', 'Personal targets are calculated for intensity in % vIFT, % HRmax, HR zone or Karvonen.')}</p>`;
    return `<div class="tablewrap"><table class="user-table cd-prev"><thead><tr><th>${L('Athlet:in', 'Athlete')}</th><th>vIFT</th><th>${L('HFmax', 'HRmax')}</th>${mains.map(b => `<th>${esc(cdMethodLabel(b.method, true))}<div class="hint" style="margin:0;">${esc(cdStructText(b))}</div></th>`).join('')}</tr></thead>
      <tbody>${who.map(u => { const a = athByProfile[u.id] || {}; const p = { vift: cdNum(a.vift_kmh), hr_max: a.hr_max, hr_rest: a.hr_rest, age: cdAge(a.birthdate) };
        const hm = p.hr_max || (p.age ? `<span class="muted" title="${L('gesch&auml;tzt nach Tanaka (208 &minus; 0,7 &times; Alter)', 'estimated with Tanaka (208 &minus; 0.7 &times; age)')}">&asymp; ${cdHrMaxEst(p.age)}</span>` : '<span class="muted">–</span>');
        return `<tr><td>${esc(u.name)}</td><td>${p.vift ? cdDec(p.vift) : '<span class="muted">–</span>'}</td><td>${hm}</td>${mains.map(b => { const r = cdPersonalText(b, p); return `<td class="${r.fallback ? 'cd-fb' : ''}">${esc(r.text) || '<span class="muted">–</span>'}</td>`; }).join('')}</tr>`; }).join('') || `<tr><td colspan="${3 + mains.length}" class="muted">${L('Keine Athlet:innen mit App-Zugang in der Auswahl.', 'No athletes with an app account in this selection.')}</td></tr>`}</tbody></table></div>`;
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
      <div class="card">
        <div class="cd-top">
          <label class="w2">${L('Titel', 'Title')}<input type="text" id="cdTitle" value="${esc(S.title || '')}" placeholder="${L('z. B. HIIT 15/15 &ndash; Vorbereitung', 'e.g. HIIT 15/15 &ndash; pre-season')}"></label>
          <label>${L('Datum', 'Date')}<input type="date" id="cdDate" value="${S.planned_date || ''}"></label>
          <label>${L('Team / Gruppe', 'Team / group')}<input type="text" id="cdTeam" list="cdTeams" value="${esc(S.team || '')}"><datalist id="cdTeams">${teamGroups.map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>
          <label class="w2">${L('F&uuml;r wen?', 'For whom?')}<input type="text" id="cdFor" list="cdAthNames" value="${esc(S.content.forName || '')}" placeholder="${L('Name der Athletin / des Athleten (optional)', 'Athlete name (optional)')}"><datalist id="cdAthNames">${athNames.map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>
          <label class="w2">${L('Hinweis f&uuml;r alle', 'Note for everyone')}<input type="text" id="cdNote" value="${esc(S.content.note || '')}" placeholder="${L('z. B. Pulsgurt anlegen, Trinkflasche mitbringen', 'e.g. wear HR strap, bring a water bottle')}"></label>
        </div>
        <div class="cd-total">${L('Gesamt', 'Total')} &asymp; <b>${tot.sec ? Math.round(tot.sec / 60) + ' min' : '–'}</b>${tot.unknown ? L(' (+ Bl&ouml;cke nach Strecke)', ' (+ distance-based blocks)') : ''} &middot; ${S.content.blocks.length} ${L('Bl&ouml;cke', 'blocks')}</div>
      </div>
      ${phaseHtml}
      <div class="card">
        <div class="ath-toolbar"><h2 style="margin:0;">${L('Pers&ouml;nliche Vorgaben (Vorschau)', 'Personal targets (preview)')}</h2><span class="spacer"></span>
          <select id="cdPrevGrp" style="width:auto;">${forUser() ? `<option value="__for" ${previewGrp === '__for' ? 'selected' : ''}>${L('Nur', 'Only')} ${esc(S.content.forName)}</option>` : ''}<option value="">${L('Alle mit App-Zugang', 'Everyone with an app account')}</option><option value="__pub" ${previewGrp === '__pub' ? 'selected' : ''}>${L('Nur ausgew&auml;hlte (Ver&ouml;ffentlichen)', 'Selected only (publish)')}</option>${groups.map(g => `<option value="${g.id}" ${g.id === previewGrp ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div>
        ${previewHtml()}
        <p class="hint">${L('Fehlende vIFT/HFmax unter &bdquo;Conditioning &rarr; Leistungswerte&ldquo; eintragen oder aus dem 30-15 IFT &uuml;bernehmen. Ohne HFmax wird sie aus dem Alter gesch&auml;tzt (&asymp;), ohne jegliche Werte gilt der Richtwert nach Borg-Skala + Sprechtest (kursiv).',
          'Enter missing vIFT/HRmax under &ldquo;Conditioning &rarr; Test values&rdquo; or import them from the 30-15 IFT. Without HRmax it is estimated from age (&asymp;); without any values the Borg scale + talk test guide value applies (italic).')}</p>
        ${cdSourcesHtml()}
      </div>
      <div class="cd-savebar">
        <button type="button" class="secondary" id="cdSave">&#128190; ${L('Speichern', 'Save')}</button>
        <button type="button" id="cdPub">&#128242; ${L('In App ver&ouml;ffentlichen', 'Publish to app')}${picked.size ? ' (' + picked.size + ')' : ''}</button>
      </div>`;
    renderShell(profile, 'trainingsplan', T(), html, back);
    cdWireLang(draw);
    wire();
  };
  const setPath = (o, k, v) => { const p = k.split('.'); if (p.length === 2) o[p[0]][p[1]] = v; else o[k] = v; };
  const wire = () => {
    const top = (id, f) => { const el = document.getElementById(id); el.oninput = () => { f(el.value); dirty = true; }; };
    top('cdTitle', v => S.title = v); top('cdDate', v => S.planned_date = v || null); top('cdTeam', v => S.team = v); top('cdNote', v => S.content.note = v);
    const fe = document.getElementById('cdFor');
    fe.oninput = () => { S.content.forName = fe.value.trim(); dirty = true; };
    fe.onchange = () => { S.content.forName = fe.value.trim(); previewGrp = forUser() ? '__for' : (previewGrp === '__for' ? '' : previewGrp); draw(); };
    document.getElementById('cdPrevGrp').onchange = e => { previewGrp = e.target.value; draw(); };
    appEl.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { S.content.blocks.push(cdNewBlock(b.dataset.add)); dirty = true; draw(); });
    appEl.querySelectorAll('.cd-block').forEach(card => {
      const i = +card.dataset.i, b = S.content.blocks[i];
      card.querySelectorAll('[data-k]').forEach(el => {
        const k = el.dataset.k;
        el.onchange = () => {
          dirty = true;
          if (k === 'method') {
            const m = CD_METHOD[el.value]; b.method = el.value;
            if (m) { const d = m.d; Object.assign(b, { sets: d.sets, reps: d.reps, work: { v: d.work[0], u: d.work[1] }, rest: { v: d.rest[0], u: d.rest[1] }, setRest: { v: d.setRest[0], u: d.setRest[1] }, int: { type: d.int[0], min: d.int[1], max: d.int[2] } }); }
            draw(); return;
          }
          setPath(b, k, el.value);
          if (k === 'int.type') { b.int.min = ''; b.int.max = ''; if (el.value === 'hrzone') { b.int.min = 2; b.int.max = 2; } }
          draw();
        };
        if (el.tagName === 'INPUT') el.oninput = () => { setPath(b, k, el.value); dirty = true; };
      });
      card.querySelectorAll('[data-a]').forEach(btn => btn.onclick = () => {
        const a = btn.dataset.a, arr = S.content.blocks;
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
    document.getElementById('cdPub').onclick = () => publishDialog();
  };
  const save = async () => {
    if (!(S.title || '').trim()) { alert(L('Bitte einen Titel eingeben.', 'Please enter a title.')); return false; }
    const { data: { user } } = await sb.auth.getUser();
    const row = { title: S.title.trim(), team: (S.team || '').trim() || null, planned_date: S.planned_date || null, content: S.content, updated_at: new Date().toISOString() };
    let r;
    if (S.id) r = await sb.from('cd_sessions').update(row).eq('id', S.id).select('id').single();
    else r = await sb.from('cd_sessions').insert(Object.assign({ created_by: user.id }, row)).select('id').single();
    if (r.error) { alert(L('Speichern fehlgeschlagen: ', 'Saving failed: ') + r.error.message); return false; }
    S.id = r.data.id; dirty = false;
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
      const extras = blocks.map(b => { const x = bd[b.id]; if (!x) return ''; const t = [x.hr ? '&Oslash; ' + esc(x.hr) + ' bpm' : '', x.dist ? esc(x.dist) + ' m' : '', x.note ? esc(x.note) : ''].filter(Boolean).join(' · '); return t ? `<div class="hint" style="margin:0;"><b>${esc(cdMethodLabel(b.method, true))}:</b> ${t}</div>` : ''; }).join('');
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
  return (sRes.data || []).map(s => ({ s, personal: (asg.find(a => a.session_id === s.id) || {}).personal || {}, log: (lRes.data || []).find(l => l.session_id === s.id) || null, uid: user.id }))
    .sort((x, y) => (x.log && x.log.completed ? 1 : 0) - (y.log && y.log.completed ? 1 : 0) || (x.s.planned_date || '9999').localeCompare(y.s.planned_date || '9999'));
}
function cdMyListHtml(list) {
  if (!list || !list.length) return '';
  const open = list.filter(x => !(x.log && x.log.completed)), done = list.filter(x => x.log && x.log.completed);
  const item = x => {
    const dur = cdSessionSec(x.s.content || {});
    const st = x.log && x.log.completed ? '&#10003;' : (x.log ? '&#9680;' : '');
    return `<button type="button" class="cd-mine${x.log && x.log.completed ? ' done' : ''}" data-cd="${x.s.id}">
      <span><b>${esc(x.s.title || 'Conditioning')}</b><span class="muted-inline">${x.s.planned_date ? cdDate(x.s.planned_date, { weekday: 'short', day: '2-digit', month: '2-digit' }) : ''}${dur.sec ? ' &middot; &asymp; ' + Math.round(dur.sec / 60) + ' min' : ''}</span></span><span class="cd-st">${st}</span></button>`;
  };
  return `<div class="card"><h2>&#9201;&#65039; Conditioning</h2>
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
          <div class="cd-mytitle"><b>${esc(b.content || cdMethodLabel(b.method))}</b><span class="muted-inline">${esc(cdModLabel(b.modality || ''))}</span></div>
          <div class="cd-mystruct">${esc(cdStructText(b))}</div>
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
        <div class="mp-big">${esc(s.title || 'Conditioning')}</div>
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
        // wie „Mein Trainingsplan“: sRPE ins Load Management, bei vorhandenem Tages-Eintrag zusammenrechnen
        const date = new Date().toISOString().slice(0, 10), tag = 'Conditioning: ' + (s.title || '');
        const { data: ex } = await sb.from('load_entries').select('*').eq('user_id', x.uid).eq('entry_date', date).maybeSingle();
        let row = { user_id: x.uid, entry_date: date, srpe: rpe, duration_min: dur, comment: tag };
        if (ex && !(ex.comment || '').includes(tag)) {
          const totalDur = ex.duration_min + dur;
          row = { user_id: x.uid, entry_date: date, duration_min: totalDur,
            srpe: Math.max(1, Math.min(10, Math.round((ex.srpe * ex.duration_min + rpe * dur) / totalDur))),
            comment: [ex.comment, '+ ' + tag].filter(Boolean).join(' ') };
        }
        await sb.from('load_entries').upsert(row, { onConflict: 'user_id,entry_date' });
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
  const [s, a, l] = await Promise.all([
    sb.from('cd_sessions').select('*').eq('archived', false),
    sb.from('cd_assignments').select('session_id, user_id, personal, active').eq('active', true),
    sb.from('cd_logs').select('*'),
  ]);
  if (s.error || a.error) return { sessions: [], asg: [], logs: [] };
  return { sessions: s.data || [], asg: a.data || [], logs: l.data || [] };
}
const cdAU = (l) => l && l.srpe && l.duration_min ? l.srpe * l.duration_min : 0;
function cdStatusOf(log) { return log && log.completed ? 'done' : (log ? 'part' : 'open'); }
function cdStatusIcon(st) { return st === 'done' ? '&#10003;' : (st === 'part' ? '&#9680;' : '&#9675;'); }

// Abschnitt „Conditioning“ in der Aktuellen Trainingsübersicht
function cdOverviewHtml(CD, names) {
  const list = CD.sessions.filter(s => CD.asg.some(a => a.session_id === s.id))
    .sort((x, y) => (y.planned_date || '').localeCompare(x.planned_date || ''));
  if (!list.length) return '';
  return `<h2 class="cd-ov-h">&#9201;&#65039; Conditioning</h2>` + list.map(s => {
    const as = CD.asg.filter(a => a.session_id === s.id).sort((x, y) => (names[x.user_id] || '').localeCompare(names[y.user_id] || '', 'de'));
    const logOf = u => CD.logs.find(l => l.session_id === s.id && l.user_id === u);
    const done = as.filter(a => (logOf(a.user_id) || {}).completed).length;
    const dur = cdSessionSec(s.content || {});
    return `<div class="card tpo-card cd-ov">
      <div class="tpo-head">
        <div><div class="tpo-title">${esc(s.title || 'Conditioning')}</div>
          <div class="muted-inline">${s.planned_date ? cdDate(s.planned_date, { weekday: 'short', day: '2-digit', month: '2-digit' }) : 'ohne Datum'}${s.content && s.content.forName ? ' &middot; f&uuml;r ' + esc(s.content.forName) : ''}${s.team ? ' &middot; ' + esc(s.team) : ''}${dur.sec ? ' &middot; &asymp; ' + Math.round(dur.sec / 60) + ' min' : ''}</div></div>
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
          <div class="cd-mytitle"><b>${esc(b.content || cdMethodLabel(b.method))}</b><span class="muted-inline">${d.done ? '&#10003; ' + L('erledigt', 'done') : L('nicht abgehakt', 'not ticked')}</span></div>
          <div class="cd-mystruct">${esc(cdStructText(b))}</div>
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
      const notes = blocks.map(b => { const d = bd[b.id]; return d && (d.hr || d.dist || d.note) ? `<li><b>${esc(cdMethodLabel(b.method, true))}:</b> ${[d.hr ? '&Oslash; ' + esc(d.hr) + ' bpm' : '', d.dist ? esc(d.dist) + ' m' : '', d.note ? esc(d.note) : ''].filter(Boolean).join(' · ')}</li>` : ''; }).join('') + (x.l && x.l.data && x.l.data.note ? `<li>&#128221; ${esc(x.l.data.note)}</li>` : '');
      return `<tr class="tp-row" data-cds="${x.s.id}" data-cdu="${uid}"><td>${esc(x.s.title || 'Conditioning')}</td><td>${x.s.planned_date ? cdDate(x.s.planned_date) : '–'}</td><td>${cdStatusIcon(cdStatusOf(x.l))}</td>
        <td>${blocks.filter(b => bd[b.id] && bd[b.id].done).length}/${blocks.length}</td><td>${x.l && x.l.srpe ? `${x.l.srpe} &times; ${x.l.duration_min} min = ${cdAU(x.l)}` : '–'}</td><td><ul class="tp-ul">${notes}</ul></td></tr>`; }).join('')}</tbody>
  </table></div><p class="hint">Zeile anklicken f&uuml;r Vorgaben und Eintragungen je Block.</p></div>`;
}
