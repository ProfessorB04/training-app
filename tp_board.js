/* =====================================================================
   Plan-Gerüst (2026-11-21) – gemeinsam für Sportschul- und Balance-Movement-App
   Neue Form beim Erstellen: erst das Gerüst (Tage nebeneinander, je Kategorie nur die Übungsnamen),
   dann „Konkretisieren“ (die bisherigen Tages-Tabellen mit Position, Option, Vorgabe, Notiz).
   - Übungen zwischen Tagen/Kategorien ziehen, ↻ ersetzen (Vorschläge mit gleichem Bewegungsmuster
     aus der Übungsbibliothek), ✕ entfernen, ＋ Übung
   - Wird ein alter Plan geladen (Anschlussplan, Bearbeiten, Vorlage/Entwurf), merkt sich das Gerüst
     dessen Übungen als Grundlage: „alt“ = übernommen, „neu“ = neu oder ersetzt (alte Übung durchgestrichen),
     „entfällt“ = aus dem alten Plan nicht mehr dabei
   - Kopfzeile je Tag: Bewegungsmuster (Push · Pull · Knie · Hüfte), „2×“ = an mehreren Tagen
   Nutzt die globalen Objekte des Planbauers: state, DB, CATS, saveState, renderPanels, renderTabs.
   ===================================================================== */
(function(){
  'use strict';
  if(!document.getElementById('dayPanels') || typeof CATS === 'undefined') return;
  const H = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const LS_MODE = 'tp_board_mode';
  const PAT_SHORT = { 'Push':'Push', 'Pull':'Pull', 'Kniedominant':'Knie', 'Hüftdominant':'Hüfte' };
  const PREP = ['mobility','dynamic'];
  let mode = 'board', showPrep = false, lastState, drag = null;
  try { mode = localStorage.getItem(LS_MODE) || 'board'; showPrep = localStorage.getItem(LS_MODE + '_prep') === '1'; } catch(e){}

  const S = () => state;
  const days = () => Math.max(1, parseInt(S().days, 10) || 1);
  const norm = n => String(n || '').trim().toLowerCase();
  const items = (d, k) => { const p = S().plan || {}; return (p[d] && p[d][k]) || []; };
  // Bewegungsmuster einer Übung (aus der Übungsbibliothek)
  // Schreibweisen angleichen: „Pull-Up“ = „Pull-Ups“, „Romanian Deadlift (RDL)“ = „Romanian Deadlift“
  const key = n => norm(n).replace(/\(.*?\)/g, '').replace(/[^a-z0-9äöüß]/g, '').replace(/s$/, '');
  let PAT_CACHE = null, PAT_DB = null;
  function patternOf(name){
    const n = key(name); if(!n) return '';
    if(PAT_DB !== DB || !PAT_CACHE){ PAT_DB = DB; PAT_CACHE = {};
      ['strength','accessory','power'].concat(Object.keys(DB || {})).forEach(k => { if(Array.isArray(DB[k])) DB[k].forEach(x => { const kk = key(x.name); if(x.pattern && kk && !PAT_CACHE[kk]) PAT_CACHE[kk] = x.pattern; }); }); }
    return PAT_CACHE[n] || '';
  }
  // Bibliothek je Kategorie (Accessory zusätzlich Strength – wie im Planbauer)
  function libOf(k){
    const src = k === 'accessory' ? ['accessory','strength'] : [k];
    const seen = new Set(), out = [];
    src.forEach(c => (Array.isArray(DB[c]) ? DB[c] : []).forEach(e => { const n = norm(e.name); if(n && !seen.has(n)){ seen.add(n); out.push(e); } }));
    return out.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }
  function hasExercises(st){
    const p = (st && st.plan) || {};
    return Object.keys(p).some(d => Object.keys(p[d] || {}).some(k => (p[d][k] || []).length));
  }
  // Grundlage = Übungen des geladenen Plans (je Tag und Kategorie, nur Namen)
  function setBase(){
    const st = S(), base = {};
    Object.keys(st.plan || {}).forEach(d => { base[d] = {}; Object.keys(st.plan[d] || {}).forEach(k => {
      base[d][k] = (st.plan[d][k] || []).map(x => x.name); (st.plan[d][k] || []).forEach(x => { delete x.was; }); }); });
    st.boardBase = base; st.boardBaseName = (st.title || '').replace(/\s*\(Folgeplan\)$/, '');
    saveState(true);
  }
  const baseNames = () => { const b = S().boardBase; if(!b) return null; const s = new Set(); Object.keys(b).forEach(d => Object.keys(b[d] || {}).forEach(k => (b[d][k] || []).forEach(n => s.add(norm(n))))); return s; };
  const countAll = () => { const c = {}; for(let d = 1; d <= days(); d++) CATS.forEach(cat => items(d, cat.key).forEach(x => { const n = norm(x.name); c[n] = (c[n] || 0) + 1; })); return c; };

  function balance(d){
    const c = { Push:0, Pull:0, Knie:0, 'Hüfte':0 };
    ['power','strength','accessory'].forEach(k => items(d, k).forEach(x => { const p = PAT_SHORT[patternOf(x.name)]; if(p) c[p]++; }));
    return Object.keys(c).map(k => `<span class="tpb-bal${c[k] ? '' : ' zero'}">${k} ${c[k]}</span>`).join('');
  }
  function changed(){ saveState(true); renderPanels(); }

  /* ---------- Darstellung ---------- */
  function host(){
    let el = document.getElementById('tpBoardWrap');
    if(el) return el;
    const row = document.querySelector('.tabs-row') || document.getElementById('dayTabs');
    el = document.createElement('div'); el.id = 'tpBoardWrap';
    row.parentNode.insertBefore(el, row);
    return el;
  }
  function applyMode(){
    const row = document.querySelector('.tabs-row'), panels = document.getElementById('dayPanels');
    const hide = mode === 'board';
    if(row) row.style.display = hide ? 'none' : '';
    if(panels) panels.style.display = hide ? 'none' : '';
  }
  function render(){
    if(typeof state === 'undefined' || !state) return;
    // neuer Plan-Stand geladen (Anschlussplan, Bearbeiten, Vorlage) → dessen Übungen als Grundlage merken
    if(state !== lastState){
      if(lastState !== undefined){ if(!state.boardBase && hasExercises(state)) setBase(); mode = 'board'; try { localStorage.setItem(LS_MODE, mode); } catch(e){} }
      lastState = state;
    }
    const el = host();
    const base = baseNames(), cnt = countAll(), N = days();
    const cats = CATS.filter(c => showPrep || PREP.indexOf(c.key) === -1);
    const prepCount = PREP.reduce((s, k) => { let n = 0; for(let d = 1; d <= N; d++) n += items(d, k).length; return s + n; }, 0);
    let grid = '';
    for(let d = 1; d <= N; d++) grid += `<div class="tpb-col-h"><b>Tag ${d}</b><span class="tpb-bals">${balance(d)}</span>${N > 1 ? `<button type="button" class="tpb-day" data-day="${d}" title="Tag ${d} kopieren oder mit einem anderen Tag tauschen">⇄</button>` : ''}</div>`;
    cats.forEach(c => {
      const pr = S().prescription && S().prescription[c.key];
      grid += `<div class="tpb-cat"><i style="background:${c.color}"></i>${H(c.label)}${pr ? `<span>${H([pr.sets && pr.reps ? pr.sets + ' × ' + pr.reps : '', pr.tempo].filter(Boolean).join(' · '))}</span>` : ''}</div>`;
      for(let d = 1; d <= N; d++){
        grid += `<div class="tpb-cell" data-d="${d}" data-k="${c.key}">` + items(d, c.key).map((x, i) => {
          const n = norm(x.name), isOld = base && base.has(n) && !x.was, isNew = base && !isOld;
          const pat = PAT_SHORT[patternOf(x.name)];
          return `<div class="tpb-ex${isOld ? ' old' : ''}${isNew ? ' new' : ''}" draggable="true" data-d="${d}" data-k="${c.key}" data-i="${i}" style="--c:${c.color}">
            <span class="tpb-n">${H(x.name)}${x.was ? `<s>${H(x.was)}</s>` : ''}</span>
            <span class="tpb-m">${pat ? `<em>${pat}</em>` : ''}${cnt[n] > 1 ? `<u title="kommt an mehreren Tagen vor">${cnt[n]}×</u>` : ''}${base ? `<b>${isOld ? 'alt' : 'neu'}</b>` : ''}</span>
            <button type="button" class="tpb-b" data-act="rep" title="Ersetzen (Vorschläge aus der Übungsbibliothek)">↻</button><button type="button" class="tpb-b" data-act="del" title="Entfernen">✕</button>
          </div>`; }).join('') + `<button type="button" class="tpb-add" data-d="${d}" data-k="${c.key}">＋ Übung</button></div>`;
      }
    });
    // aus dem alten Plan entfallen
    let gone = '';
    if(S().boardBase){
      const now = new Set(); for(let d = 1; d <= N; d++) CATS.forEach(c => items(d, c.key).forEach(x => { now.add(norm(x.name)); if(x.was) now.add('__was_' + norm(x.was)); }));
      const b = S().boardBase, list = [];
      Object.keys(b).forEach(d => Object.keys(b[d] || {}).forEach(k => (b[d][k] || []).forEach(nm => { const n = norm(nm); if(!now.has(n) && !now.has('__was_' + n) && list.indexOf(nm) === -1) list.push(nm); })));
      if(list.length) gone = `<div class="tpb-gone">Aus „${H(S().boardBaseName || 'altem Plan')}“ entfallen: ${list.map(H).join(', ')}</div>`;
    }
    el.innerHTML = `<div class="card tpb-card">
      <div class="tpb-top">
        <div class="tpb-mode"><button type="button" data-mode="board" class="${mode === 'board' ? 'on' : ''}"><b>1 · Gerüst</b><span>Welche Übung an welchem Tag?</span></button><button type="button" data-mode="detail" class="${mode === 'detail' ? 'on' : ''}"><b>2 · Konkretisieren</b><span>Position, Option, Vorgabe, Notiz</span></button></div>
      </div>
      ${mode === 'board' ? `
      <div class="tpb-tools">
        ${S().boardBase ? `<span class="tpb-basis">Grundlage: <b>${H(S().boardBaseName || 'geladener Plan')}</b> &middot; <span class="tpb-leg old">alt</span> übernommen &middot; <span class="tpb-leg new">neu</span> neu oder ersetzt <button type="button" class="tpb-link" data-base="clear" title="Markierungen ausblenden">Vergleich aus</button></span>`
          : (hasExercises(S()) ? `<button type="button" class="tpb-link" data-base="set" title="Aktuellen Stand als Grundlage merken – danach siehst du, was neu ist">Aktuellen Stand als „alt“ markieren</button>` : '<span class="tpb-basis">Zahl der Trainingstage oben einstellen oder einen alten Plan laden – dann hier die Übungen je Tag eintragen.</span>')}
        <span style="flex:1"></span>
        <label class="tpb-chk"><input type="checkbox" id="tpbPrep" ${showPrep ? 'checked' : ''}> Mobility &amp; Dynamic zeigen${!showPrep && prepCount ? ` (${prepCount})` : ''}</label>
      </div>
      <div class="tpb-grid" style="grid-template-columns:repeat(${N}, minmax(190px, 1fr));">${grid}</div>
      ${gone}
      <div class="tpb-next"><span class="hint" style="margin:0;flex:1;">Ziehen = verschieben &middot; ↻ = ersetzen &middot; ⇄ am Tag = kopieren/tauschen &middot; Details (Position, Option, Sätze/Wdh/Zeit, Notiz) im nächsten Schritt.</span><button type="button" class="primary" data-mode="detail">Gerüst fertig → Konkretisieren</button></div>` : ''}
    </div>`;
    wire(el);
    applyMode();
    refreshSums();
  }

  /* ---------- Bedienung ---------- */
  function wire(el){
    el.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { mode = b.dataset.mode; try { localStorage.setItem(LS_MODE, mode); } catch(e){} render(); if(mode === 'detail'){ const r = document.querySelector('.tabs-row'); if(r) r.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
    const prep = el.querySelector('#tpbPrep'); if(prep) prep.onchange = () => { showPrep = prep.checked; try { localStorage.setItem(LS_MODE + '_prep', showPrep ? '1' : '0'); } catch(e){} render(); };
    el.querySelectorAll('[data-base]').forEach(b => b.onclick = () => { if(b.dataset.base === 'set') setBase(); else { delete S().boardBase; delete S().boardBaseName; Object.keys(S().plan || {}).forEach(d => Object.keys(S().plan[d] || {}).forEach(k => (S().plan[d][k] || []).forEach(x => delete x.was))); saveState(true); } render(); });
    el.querySelectorAll('.tpb-ex').forEach(x => {
      const d = x.dataset.d, k = x.dataset.k, i = +x.dataset.i;
      x.querySelector('[data-act=del]').onclick = () => { items(d, k).splice(i, 1); changed(); };
      x.querySelector('[data-act=rep]').onclick = e => { e.stopPropagation(); pick(e.currentTarget, k, d, items(d, k)[i]); };
      x.addEventListener('dragstart', ev => { drag = { d, k, i }; x.classList.add('drag'); try { ev.dataTransfer.setData('text/plain', 'tpb'); ev.dataTransfer.effectAllowed = 'move'; } catch(er){} });
      x.addEventListener('dragend', () => { x.classList.remove('drag'); drag = null; });
    });
    el.querySelectorAll('.tpb-day').forEach(b => b.onclick = e => { e.stopPropagation(); dayMenu(e.currentTarget, +b.dataset.day); });
    el.querySelectorAll('.tpb-add').forEach(b => b.onclick = e => { e.stopPropagation(); pick(e.currentTarget, b.dataset.k, b.dataset.d, null); });
    el.querySelectorAll('.tpb-cell').forEach(c => {
      c.addEventListener('dragover', ev => { if(!drag) return; ev.preventDefault(); c.classList.add('over');
        const tgt = ev.target.closest('.tpb-ex'); c.querySelectorAll('.tpb-ex').forEach(z => z.classList.toggle('before', z === tgt)); });
      c.addEventListener('dragleave', ev => { if(!c.contains(ev.relatedTarget)){ c.classList.remove('over'); c.querySelectorAll('.before').forEach(z => z.classList.remove('before')); } });
      c.addEventListener('drop', ev => {
        ev.preventDefault(); c.classList.remove('over'); if(!drag) return;
        const tgt = ev.target.closest('.tpb-ex'), D2 = c.dataset.d, K2 = c.dataset.k;
        const src = items(drag.d, drag.k), it = src[drag.i]; if(!it) return;
        let at = tgt ? +tgt.dataset.i : null;
        src.splice(drag.i, 1);
        if(at != null && drag.d === D2 && drag.k === K2 && drag.i < at) at--;
        const st = S(); if(!st.plan[D2]) st.plan[D2] = {}; if(!st.plan[D2][K2]) st.plan[D2][K2] = [];
        if(at == null) st.plan[D2][K2].push(it); else st.plan[D2][K2].splice(at, 0, it);
        drag = null; changed();
      });
    });
  }
  // Auswahl aus der Übungsbibliothek (Ersetzen: gleiches Bewegungsmuster zuerst)
  function pick(anchor, k, d, item){
    closePop();
    const lib = libOf(k), pat = item ? patternOf(item.name) : '';
    const inDay = new Set(items(d, k).map(x => norm(x.name)));
    const pop = document.createElement('div'); pop.className = 'tpb-pop'; pop.id = 'tpbPop';
    pop.innerHTML = `<div class="tpb-pop-h">${item ? 'Ersetzen: <b>' + H(item.name) + '</b>' + (pat ? ' · gleiches Muster (' + H(PAT_SHORT[pat] || pat) + ') zuerst' : '') : 'Übung hinzufügen · Tag ' + d}</div>
      <input type="search" placeholder="Übungsbibliothek durchsuchen …"><div class="tpb-pop-l"></div>`;
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(r.left + scrollX, scrollX + innerWidth - 330)) + 'px'; pop.style.top = (r.bottom + scrollY + 4) + 'px';
    const inp = pop.querySelector('input'), list = pop.querySelector('.tpb-pop-l');
    const draw = () => {
      const q = norm(inp.value);
      let arr = lib.filter(e => !inDay.has(norm(e.name)) && (!q || norm(e.name).indexOf(q) !== -1));
      if(pat && !q) arr = arr.filter(e => e.pattern === pat).concat(arr.filter(e => e.pattern !== pat));
      const rows = arr.slice(0, 60).map(e => `<button type="button" data-n="${H(e.name)}">${H(e.name)}${PAT_SHORT[e.pattern] ? `<small>${PAT_SHORT[e.pattern]}</small>` : ''}</button>`).join('');
      const own = q && !lib.some(e => norm(e.name) === q) ? `<button type="button" data-n="${H(inp.value.trim())}" class="own">＋ „${H(inp.value.trim())}“ übernehmen</button>` : '';
      list.innerHTML = own + (rows || '<div class="tpb-pop-e">Keine passende Übung.</div>');
      list.querySelectorAll('[data-n]').forEach(b => b.onclick = () => {
        const n = b.dataset.n;
        if(item){ if(!item.was && norm(item.name) !== norm(n)) item.was = item.name; item.name = n; if(item.was && norm(item.was) === norm(n)) delete item.was; }
        else { const st = S(); if(!st.plan[d]) st.plan[d] = {}; if(!st.plan[d][k]) st.plan[d][k] = []; st.plan[d][k].push({ name: n, note: '', position: '', option: '', preset: '' }); }
        closePop(); changed();
      });
    };
    inp.oninput = draw; draw(); inp.focus();
    inp.addEventListener('keydown', e => { if(e.key === 'Escape') closePop(); if(e.key === 'Enter'){ const b = list.querySelector('[data-n]'); if(b) b.click(); } });
    setTimeout(() => document.addEventListener('mousedown', outside), 0);
  }
  // Tag kopieren / tauschen (wie die Leiste unter den Tages-Reitern: Übungen, Vorbereitung, Cool-down)
  function dayMenu(anchor, src){
    closePop();
    const st = S(), N = days();
    const pop = document.createElement('div'); pop.className = 'tpb-pop'; pop.id = 'tpbPop';
    let rows = '';
    for(let d = 1; d <= N; d++) if(d !== src) rows += `<div class="tpb-dm"><b>Tag ${d}</b><button type="button" data-copy="${d}" title="Inhalt von Tag ${src} nach Tag ${d} kopieren (überschreibt Tag ${d})">📋 Tag ${src} → Tag ${d}</button><button type="button" data-swap="${d}">⇄ tauschen</button></div>`;
    pop.innerHTML = `<div class="tpb-pop-h">Tag ${src} kopieren / tauschen mit:</div>${rows}`;
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(r.right + scrollX - 320, scrollX + innerWidth - 330)) + 'px'; pop.style.top = (r.bottom + scrollY + 4) + 'px';
    const ens = d => { if(typeof ensureDayStructure === 'function') ensureDayStructure(d); if(!st.cooldown) st.cooldown = {}; if(!st.prepNote) st.prepNote = {}; };
    pop.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => {
      const t = +b.dataset.copy; ens(src); ens(t);
      const has = CATS.some(c => items(t, c.key).length) || String(st.cooldown[t] || '').trim() || String(st.prepNote[t] || '').trim();
      if(has && !confirm(`Tag ${t} enthält bereits Übungen. Mit den Inhalten von Tag ${src} überschreiben?`)) return;
      st.plan[t] = JSON.parse(JSON.stringify(st.plan[src] || {})); st.cooldown[t] = st.cooldown[src]; st.prepNote[t] = st.prepNote[src];
      closePop(); changed(); if(typeof toast === 'function') toast(`Tag ${src} → Tag ${t} kopiert`);
    });
    pop.querySelectorAll('[data-swap]').forEach(b => b.onclick = () => {
      const t = +b.dataset.swap; ens(src); ens(t);
      [st.plan[src], st.plan[t]] = [st.plan[t], st.plan[src]];
      [st.cooldown[src], st.cooldown[t]] = [st.cooldown[t], st.cooldown[src]];
      [st.prepNote[src], st.prepNote[t]] = [st.prepNote[t], st.prepNote[src]];
      closePop(); changed(); if(typeof toast === 'function') toast(`Tag ${src} ⇄ Tag ${t} getauscht`);
    });
    setTimeout(() => document.addEventListener('mousedown', outside), 0);
  }
  function outside(e){ const p = document.getElementById('tpbPop'); if(p && !p.contains(e.target)) closePop(); }
  function closePop(){ const p = document.getElementById('tpbPop'); if(p) p.remove(); document.removeEventListener('mousedown', outside); }

  /* ---------- Einklappen (1.2.1): Karten mit Kurzfassung, Zustand je Karte gemerkt ---------- */
  const COLLS = [];
  function collapsible(card, key, head, summary){
    if(!card || !head || card.dataset.tpc) return;
    card.dataset.tpc = key; card.classList.add('tpc-card');
    head.classList.add('tpc-keep', 'tpc-head');
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'tpc-tog tpc-keep';
    card.insertBefore(btn, card.firstChild);
    const sum = document.createElement('div'); sum.className = 'tpc-sum tpc-keep';
    head.insertAdjacentElement('afterend', sum);
    const set = c => {
      card.classList.toggle('tpc-collapsed', c);
      btn.innerHTML = c ? '&#9656; Aufklappen' : '&#9662; Einklappen';
      sum.innerHTML = c ? summary() : '';
      try { localStorage.setItem('tp_collapse_' + key, c ? '1' : '0'); } catch(e){}
    };
    btn.onclick = () => set(!card.classList.contains('tpc-collapsed'));
    head.addEventListener('click', e => { if(e.target.closest('button, input, select, a, label')) return; btn.click(); });
    COLLS.push({ card, sum, summary });
    let c0 = false; try { c0 = localStorage.getItem('tp_collapse_' + key) === '1'; } catch(e){}
    set(c0);
  }
  function refreshSums(){ COLLS.forEach(c => { if(c.card.classList.contains('tpc-collapsed')) try { c.sum.innerHTML = c.summary(); } catch(e){} }); }
  const val = id => { const e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; };
  const deD = iso => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('de-DE') : '';
  function ensureCollapsibles(){
    const pt = document.getElementById('prescriptionTable'), pc = pt && pt.closest('.card');
    if(pc) collapsible(pc, 'presc', pc.querySelector('h2'), () => (typeof PRESCRIPTION_CATS !== 'undefined' ? PRESCRIPTION_CATS : Object.keys(S().prescription || {})).map(k => {
      const p = (S().prescription || {})[k] || {}, c = (typeof CAT_MAP !== 'undefined' && CAT_MAP[k]) || { label: k, color: '#999' };
      return `<span class="tpc-pill"><i style="background:${c.color}"></i>${H(c.label)} ${H([p.sets, p.reps].filter(Boolean).join(' × '))}</span>`; }).join(''));
    const st = id => document.getElementById(id);
    if(st('tpsStep1')){   // Sportschul-App: Schritte 1, 2, 4
      collapsible(st('tpsStep1'), 'step1', st('tpsStep1').querySelector('.tps-head'), () => 'Gruppe: <b>' + H(S().team || '–') + '</b>');
      collapsible(st('tpsStep2'), 'step2', st('tpsStep2') && st('tpsStep2').querySelector('.tps-head'), () => '<b>' + H(S().title || 'Ohne Titel') + '</b>'
        + (S().appTitle ? ' &middot; &#128241; ' + H(S().appTitle) : '') + ' &middot; ' + days() + ' Tage' + (S().rotate ? ' im Wechsel' : '') + ' &times; ' + (S().weeks || '?') + ' Wochen' + (S().start ? ' &middot; ab ' + deD(S().start) : ''));
      collapsible(st('tpsStep4'), 'step4', st('tpsStep4') && st('tpsStep4').querySelector('.tps-head'), () => H((st('tpsCount') || {}).textContent || ''));
    } else {              // BM-App: Konfigurations-Karte
      const cfg = st('cfgTeam') && st('cfgTeam').closest('.card');
      if(cfg) collapsible(cfg, 'cfg', cfg.querySelector('h2') || cfg.firstElementChild, () => '<b>' + H(S().title || 'Ohne Titel') + '</b>' + (S().team ? ' &middot; ' + H(S().team) : '')
        + ' &middot; ' + days() + ' Tage' + (S().rotate ? ' im Wechsel' : '') + ' &times; ' + (S().weeks || '?') + ' Wochen' + (S().start ? ' &middot; ab ' + deD(S().start) : ''));
    }
  }
  let sumT = null;
  ['input', 'change'].forEach(ev => document.addEventListener(ev, () => { clearTimeout(sumT); sumT = setTimeout(refreshSums, 150); }, true));

  /* ---------- Einhängen ---------- */
  function css(){
    if(document.getElementById('tpbCss')) return;
    const st = document.createElement('style'); st.id = 'tpbCss';
    st.textContent = `
      .tpb-card{ padding-bottom:14px; }
      .tpb-mode{ display:flex; border:1px solid #e1e4ea; border-radius:11px; overflow:hidden; margin-bottom:12px; }
      .tpb-mode button{ flex:1; text-align:left; background:#f8f9fc !important; color:#141824 !important; border:0 !important; border-radius:0 !important; padding:9px 14px !important; display:flex; flex-direction:column; box-shadow:none !important; }
      .tpb-mode button + button{ border-left:1px solid #e1e4ea !important; }
      .tpb-mode button span{ font-size:12px; color:#5a6072; font-weight:400; }
      .tpb-mode button.on{ background:#eef4ff !important; box-shadow:inset 0 -3px 0 var(--accent, var(--brand, #010d6e)) !important; }
      .tpb-tools{ display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; margin-bottom:10px; font-size:13px; }
      .tpb-basis{ color:#5a6072; } .tpb-chk{ display:flex; gap:6px; align-items:center; font-size:13px; } .tpb-chk input{ width:auto; margin:0; }
      .tpb-link{ background:none !important; border:0 !important; color:var(--accent, #1257b0) !important; text-decoration:underline; padding:0 4px !important; font-size:13px; box-shadow:none !important; }
      .tpb-leg{ font-size:11px; font-weight:700; border-radius:4px; padding:0 5px; } .tpb-leg.old{ background:#ffe2a8; color:#9a6400; } .tpb-leg.new{ background:#c9ecd9; color:#1f8f5f; }
      .tpb-grid{ display:grid; gap:8px; overflow-x:auto; }
      .tpb-col-h{ background:var(--accent, var(--brand, #010d6e)); color:#fff; border-radius:9px; padding:6px 10px; display:flex; flex-wrap:wrap; gap:4px 8px; align-items:center; }
      .tpb-col-h b{ flex:1; }
      .tpb-day{ background:rgba(255,255,255,.14) !important; color:#fff !important; border:1px solid rgba(255,255,255,.45) !important; border-radius:6px !important; padding:0 7px !important; font-size:13px !important; line-height:20px; min-height:0 !important; box-shadow:none !important; }
      .tpb-day:hover{ background:rgba(255,255,255,.3) !important; }
      .tpb-dm{ display:flex; align-items:center; gap:6px; padding:5px 2px; border-top:1px solid #eef0f4; }
      .tpb-dm b{ flex:1; font-size:13px; }
      .tpb-dm button{ background:#fff !important; color:#141824 !important; border:1px solid #e1e4ea !important; border-radius:7px !important; padding:3px 8px !important; font-size:12.5px !important; box-shadow:none !important; min-height:0 !important; } .tpb-bals{ display:flex; gap:6px; font-size:11px; } .tpb-bal.zero{ opacity:.55; }
      .tpb-cat{ grid-column:1/-1; display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#5a6072; margin-top:6px; }
      .tpb-cat i{ width:10px; height:10px; border-radius:3px; display:inline-block; } .tpb-cat span{ font-weight:400; text-transform:none; letter-spacing:0; }
      .tpb-cell{ min-height:42px; border:1px dashed #d6dbe6; border-radius:10px; padding:5px; display:flex; flex-direction:column; gap:4px; background:#fcfdff; }
      .tpb-cell.over{ background:#eef4ff; border-color:var(--accent, #010d6e); }
      .tpb-ex{ display:flex; align-items:center; flex-wrap:wrap; gap:4px 6px; background:#fff; border:1px solid #e1e4ea; border-left:4px solid var(--c); border-radius:8px; padding:4px 6px; font-size:13px; cursor:grab; }
      .tpb-ex.before{ box-shadow:0 -3px 0 var(--accent, #010d6e); } .tpb-ex.drag{ opacity:.4; }
      .tpb-ex.old{ background:#fff6e3; } .tpb-ex.new{ background:#e8f6ef; }
      .tpb-n{ flex:1 1 110px; min-width:0; } .tpb-n s{ display:block; font-size:11px; color:#8a8f9c; }
      .tpb-m{ display:flex; gap:4px; align-items:center; font-size:10.5px; } .tpb-m em{ font-style:normal; color:#5a6072; }
      .tpb-m u{ text-decoration:none; background:#fff0c2; color:#7a5a00; border-radius:4px; padding:0 4px; }
      .tpb-m b{ border-radius:4px; padding:0 5px; } .tpb-ex.old .tpb-m b{ background:#ffe2a8; color:#9a6400; } .tpb-ex.new .tpb-m b{ background:#c9ecd9; color:#1f8f5f; }
      .tpb-b{ background:#fff !important; color:#141824 !important; border:1px solid #e1e4ea !important; border-radius:6px !important; padding:0 6px !important; font-size:12px !important; line-height:20px; min-height:0 !important; box-shadow:none !important; }
      .tpb-add{ background:none !important; border:0 !important; color:var(--accent, #1257b0) !important; font-size:12.5px; text-align:left; padding:2px 4px !important; box-shadow:none !important; }
      .tpb-gone{ margin-top:10px; font-size:13px; color:#9a6400; background:#fff6e3; border-radius:8px; padding:6px 10px; }
      .tpb-next{ display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-top:12px; padding-top:10px; border-top:1px solid #e1e4ea; }
      .tpb-pop{ position:absolute; z-index:10000; background:#fff; border:1px solid #e1e4ea; border-radius:12px; box-shadow:0 12px 34px rgba(0,0,0,.18); padding:10px; width:320px; font-size:13.5px; }
      .tpb-pop-h{ font-size:12.5px; margin-bottom:6px; } .tpb-pop input{ width:100%; margin-bottom:6px; box-sizing:border-box; }
      .tpb-pop-l{ max-height:280px; overflow-y:auto; display:flex; flex-direction:column; }
      .tpb-pop-l button{ display:flex; justify-content:space-between; gap:8px; background:none !important; color:#141824 !important; border:0 !important; text-align:left; padding:5px 6px !important; border-radius:7px; font-weight:400; box-shadow:none !important; }
      .tpb-pop-l button:hover{ background:#eef4ff !important; } .tpb-pop-l button.own{ color:var(--accent, #1257b0) !important; font-weight:600; }
      .tpb-pop-l small{ color:#8a8f9c; } .tpb-pop-e{ color:#8a8f9c; padding:6px; }
      .tpc-card{ position:relative; }
      .tpc-tog{ position:absolute; top:16px; right:18px; z-index:2; background:#fff !important; color:#52514e !important; border:1px solid #e1e4ea !important; border-radius:8px !important; padding:4px 10px !important; font-size:12.5px !important; font-weight:600; box-shadow:none !important; min-height:0 !important; }
      .tpc-head{ cursor:pointer; padding-right:130px; }
      .tpc-card.tpc-collapsed > :not(.tpc-keep){ display:none !important; }
      .tpc-card.tpc-collapsed .tpc-head{ margin-bottom:0 !important; }
      .tpc-card.tpc-collapsed .tps-sub{ display:none; }
      .tpc-sum{ font-size:13px; color:#52514e; display:flex; flex-wrap:wrap; gap:6px 12px; align-items:center; }
      .tpc-card:not(.tpc-collapsed) .tpc-sum{ display:none; }
      .tpc-card.tpc-collapsed .tpc-sum{ margin-top:6px; }
      .tpc-pill{ display:inline-flex; align-items:center; gap:5px; } .tpc-pill i{ width:9px; height:9px; border-radius:50%; display:inline-block; }
      @media (max-width:760px){ .tpc-tog{ position:static; float:right; margin:0 0 6px 8px; } .tpc-head{ padding-right:0; } .tpb-mode{ flex-direction:column; } .tpb-mode button + button{ border-left:0 !important; border-top:1px solid #e1e4ea !important; } }`;
    document.head.appendChild(st);
  }
  function hook(){
    ['renderPanels','renderTabs'].forEach(fn => {
      const o = window[fn]; if(typeof o !== 'function' || o.__tpb) return;
      const w = function(){ const r = o.apply(this, arguments); try { render(); } catch(e){ console.warn('Gerüst', e); } return r; };
      w.__tpb = true; window[fn] = w;
    });
  }
  css(); hook(); render();
  ensureCollapsibles(); setTimeout(ensureCollapsibles, 600); setTimeout(ensureCollapsibles, 2000);
  window.TpBoard = { render, setBase, mode: m => { if(m){ mode = m; render(); } return mode; } };
})();
