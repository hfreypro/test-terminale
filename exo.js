// Moteur commun des pages d'exercice (version 2)
// - panneau de dialogue à côté de l'exercice (l'androïde questionne l'élève)
// - diagnostic par zones d'écart (rapport réponse / bonne réponse), puis arbre de questions oui / non
// - fiche ouverte en surimpression : l'élève ne quitte pas l'exercice
// - sauvegarde des réponses et du dialogue dans le navigateur
(function(){
  const C = window.EXO; if(!C) return;
  const KEY = 'exo:' + location.pathname;
  const tri = '<svg viewBox="0 0 24 24" style="width:1em;height:1em;vertical-align:-2px" aria-hidden="true"><path d="M12 2.5 1.5 21h21z" fill="#d0602a"/><rect x="11" y="9" width="2" height="6.5" fill="#fff"/><rect x="11" y="17" width="2" height="2" fill="#fff"/></svg>';
  const ACT = { fiche:'Voir la fiche', fichefull:'Retravailler toute la fiche', exemple:'Refaire l’exemple de la fiche', hint:'Un coup de pouce', retry:'Je corrige ma réponse', corr:'Voir la correction' };
  const state = { inputs:{}, used:{}, tries:{}, total:0, log:'' };
  let saving = true;

  // ---------- mise en page : exercice + panneau ----------
  const main = document.querySelector('main');
  const wrap = document.createElement('div'); wrap.className = 'layout';
  main.parentNode.insertBefore(wrap, main); wrap.appendChild(main);
  const chat = document.createElement('aside'); chat.className = 'chat';
  chat.innerHTML = '<div class="chat-head"><img src="' + C.avatar + '" alt=""><div><b>' + (C.botName || 'Ton assistant SI') + '</b><span>Je t’aide à trouver ton erreur, sans te donner la réponse.</span></div><button class="toggle" type="button">Réduire</button></div>'
    + '<div class="chat-log"><p class="chat-empty">Propose une réponse et clique sur « Vérifier » : je te pose des questions pour t’aider à avancer.</p></div>'
    + '<div class="chat-foot"><span>Tes réponses sont gardées sur cet appareil.</span><button type="button" class="reset">Tout effacer</button></div>';
  wrap.appendChild(chat);
  const small = window.matchMedia('(max-width:1100px)');
  if(small.matches){ chat.classList.add('min'); }
  const log = chat.querySelector('.chat-log');
  chat.querySelector('.toggle').addEventListener('click', e => { chat.classList.toggle('min'); e.target.textContent = chat.classList.contains('min') ? 'Ouvrir' : 'Réduire'; });
  chat.querySelector('.reset').addEventListener('click', () => { try{ localStorage.removeItem(KEY); }catch(e){} saving = false; location.reload(); });

  // ---------- fiche en surimpression ----------
  const ov = document.createElement('div'); ov.className = 'overlay';
  ov.innerHTML = '<div class="pane"><div class="bar"><b>Fiche</b><button type="button" class="full">Toute la fiche</button><button type="button" class="close">Revenir à l’exercice</button></div><iframe title="Fiche"></iframe></div>';
  document.body.appendChild(ov);
  const frame = ov.querySelector('iframe');
  let ficheBase = '';
  function openFiche(url){ ficheBase = url.split('#')[0]; frame.src = url; ov.querySelector('b').textContent = C.ficheTitle || 'Fiche'; ov.classList.add('open'); }
  ov.querySelector('.close').addEventListener('click', () => ov.classList.remove('open'));
  ov.querySelector('.full').addEventListener('click', () => { frame.src = ficheBase + '#top'; });
  ov.addEventListener('click', e => { if(e.target === ov) ov.classList.remove('open'); });

  // ---------- messages ----------
  function fmt(v){ return (Math.round(v * 1000) / 1000).toLocaleString('fr-FR'); }
  function save(){ if(!saving) return; state.log = log.innerHTML; try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){} }
  function scroll(){ log.scrollTop = log.scrollHeight; }
  function clearEmpty(){ const e = log.querySelector('.chat-empty'); if(e) e.remove(); }
  function disableOld(){ log.querySelectorAll('.choices button').forEach(b => b.disabled = true); }
  function me(text){ clearEmpty(); const d = document.createElement('div'); d.className = 'msg me'; d.innerHTML = text; log.appendChild(d); scroll(); }
  function bot(q, html, kind, tag, choices, actions){
    clearEmpty(); disableOld();
    const d = document.createElement('div'); d.className = 'msg bot' + (kind ? ' ' + kind : '');
    d.innerHTML = (tag ? '<span class="tag">' + tag + '</span>' : '') + html.replace(/⚠/g, tri);
    const all = (choices || []).map(c => ({label:c.label, next:c.next})).concat((actions || []).map(a => ({label:ACT[a], act:a})));
    if(all.length){
      const box = document.createElement('div'); box.className = 'choices';
      all.forEach(c => { const b = document.createElement('button'); b.type = 'button'; b.textContent = c.label; if(c.act) b.className = 'act';
        b.dataset.q = q; if(c.next) b.dataset.next = c.next; if(c.act) b.dataset.act = c.act; box.appendChild(b); });
      d.appendChild(box);
    }
    log.appendChild(d);
    if(chat.classList.contains('min')){ chat.classList.remove('min'); chat.querySelector('.toggle').textContent = 'Réduire'; }
    scroll(); save();
  }
  log.addEventListener('click', e => {
    const b = e.target.closest('.choices button'); if(!b || b.disabled) return;
    const q = b.dataset.q; me(b.textContent);
    if(b.dataset.next) node(q, b.dataset.next);
    else action(q, b.dataset.act);
  });

  // ---------- actions ----------
  const Q = {};
  function action(q, a){
    const cfg = C.questions[q], el = Q[q];
    if(a === 'fiche') openFiche(C.fiche + (cfg.fiche || ''));
    else if(a === 'fichefull') { openFiche(C.fiche + '#top'); bot(q, 'Prends le temps de relire la fiche, surtout « Je retrouve la formule », puis refais l’exemple de la fiche. Reviens ensuite à l’exercice : tes réponses sont gardées.', '', '', [], ['retry']); }
    else if(a === 'exemple') openFiche(C.fiche + '#exemple');
    else if(a === 'hint') el.hint();
    else if(a === 'corr') el.corr(true);
    else if(a === 'retry') { const i = el.root.querySelector('input'); if(i){ i.focus(); i.select(); } bot(q, 'D’accord. Corrige ta valeur, puis clique à nouveau sur « Vérifier ».', '', ''); }
  }
  let lastV = null;
  const pending = {};
  function node(q, id){
    const cfg = C.questions[q], n = cfg.nodes[id]; if(!n){ return; }
    const say = n.say.replace(/\{v\}/g, lastV === null ? '' : fmt(lastV));
    bot(q, say, n.kind || '', n.tag || '', n.choices, n.actions);
    // le point « as-tu compris ? » attend la fin de la branche en cours
    if(pending[q] && !(n.choices && n.choices.length) && id !== cfg.comprendre){ pending[q] = false; node(q, cfg.comprendre); }
  }

  // ---------- questions ----------
  function num(s){ s = (s || '').trim().replace(/\s/g,'').replace(',', '.'); return s === '' ? NaN : Number(s); }
  document.querySelectorAll('.question').forEach(root => {
    const q = root.dataset.q, cfg = C.questions[q]; if(!cfg) return;
    state.used[q] = state.used[q] || 0; state.tries[q] = state.tries[q] || 0;
    const tools = root.querySelector('.tools');
    const hb = root.querySelector('.hint-btn'), hc = root.querySelector('.hint-count');
    const cb = root.querySelector('.corr-btn'), corr = root.querySelector('.correction');
    // bouton fiche entre coup de pouce et correction
    if(cfg.fiche !== undefined){
      const fb = document.createElement('button'); fb.type = 'button'; fb.className = 'btn fiche'; fb.textContent = 'Voir la fiche';
      fb.addEventListener('click', () => action(q, 'fiche'));
      tools.insertBefore(fb, cb);
    }
    const api = { root };
    function updH(){ hc.textContent = state.used[q] + ' / ' + cfg.hints.length + ' coup(s) de pouce utilisé(s)'; hb.disabled = state.used[q] >= cfg.hints.length; if(hb.disabled) hb.textContent = 'Plus de coup de pouce'; const t = document.getElementById('hint-total'); if(t) t.textContent = state.total; }
    api.hint = () => {
      if(state.used[q] >= cfg.hints.length){ bot(q, 'Tu as utilisé tous les coups de pouce. Tu peux relire la fiche ou regarder la correction.', '', '', [], ['fiche','corr']); return; }
      const i = state.used[q]; state.used[q]++; state.total++; updH();
      bot(q, cfg.hints[i], '', 'Coup de pouce ' + (i + 1) + (C.penalty ? ' (' + C.penalty + ')' : ''), [], ['retry','fiche']);
    };
    hb.addEventListener('click', api.hint);
    api.corr = (force) => {
      if(!corr.classList.contains('open') && state.tries[q] === 0 && !force && !cb.dataset.warned){
        cb.dataset.warned = '1';
        bot(q, 'Tu n’as encore proposé aucune réponse. Essaie au moins une fois, ou prends un coup de pouce : c’est en cherchant qu’on retient. Clique à nouveau pour voir quand même la correction.', 'ko', 'Avant la correction', [], ['hint','fiche']);
        return;
      }
      corr.classList.toggle('open'); cb.textContent = corr.classList.contains('open') ? 'Masquer la correction' : 'Voir la correction';
      if(corr.classList.contains('open')) corr.scrollIntoView({behavior:'smooth', block:'start'});
    };
    cb.addEventListener('click', () => api.corr(false));

    root.querySelectorAll('.check-btn').forEach(btn => btn.addEventListener('click', () => {
      const k = btn.dataset.k || 'main', spec = cfg.answers[k];
      const inp = root.querySelector('input[data-k="' + k + '"]');
      const v = num(inp.value); state.inputs[inp.id] = inp.value;
      const lab = (root.querySelector('label[for="' + inp.id + '"]') || {}).innerHTML || '';
      if(isNaN(v)){ bot(q, 'Écris d’abord ta valeur numérique, sans l’unité.', 'ko', ''); return; }
      me(lab + ' ' + inp.value + ' ' + ((inp.parentNode.querySelector('.unit') || {}).innerHTML || ''));
      state.tries[q]++; lastV = v;
      let good = false;
      if(Array.isArray(spec)){                       // ancien format : liste de valeurs
        let best = null;
        spec.forEach(a => { const e = Math.abs(v - a.v) / Math.abs(a.v); if(e <= (a.tol || 0.03) && (!best || e < best.e)) best = {a, e}; });
        if(best && best.a.ok){ good = true; bot(q, best.a.msg, 'ok', 'Vérification'); }
        else if(best) bot(q, best.a.msg, 'ko', 'Vérification', [], ['retry','hint','fiche']);
        else bot(q, cfg.unknown || 'Ce n’est pas la valeur attendue. Fais d’abord le contrôle d’ordre de grandeur, puis demande un coup de pouce si tu bloques.', 'ko', 'Vérification', [], ['retry','hint','fiche']);
      } else {                                        // nouveau format : zones d'écart + arbre
        const rho = v / spec.expected;
        if(Math.abs(rho - 1) <= (spec.tol || 0.03)){ good = true; node(q, spec.ok); }
        else {
          const z = spec.zones.find(z => rho >= z.min && rho < z.max);
          node(q, z ? z.node : spec.other);
        }
      }
      if(!good && state.tries[q] >= 3 && !root.dataset.asked && cfg.comprendre){
        root.dataset.asked = '1';
        const last = log.lastElementChild;
        if(last && last.querySelector('.choices button:not(.act)')) pending[q] = true;   // une branche est en cours
        else node(q, cfg.comprendre);
      }
      save();
    }));
    root.querySelectorAll('input').forEach(i => i.addEventListener('input', () => { state.inputs[i.id] = i.value; save(); }));
    api.updH = updH; Q[q] = api;
  });

  // ---------- restauration ----------
  try{
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if(s){
      Object.assign(state, s);
      Object.entries(state.inputs || {}).forEach(([id, v]) => { const i = document.getElementById(id); if(i) i.value = v; });
      if(state.log){ log.innerHTML = state.log; disableOld(); const d = document.createElement('div'); d.className = 'msg bot'; d.innerHTML = 'Tu reprends là où tu t’étais arrêté : tes réponses sont revenues.'; log.appendChild(d); scroll(); }
    }
  }catch(e){}
  Object.values(Q).forEach(a => a.updH());

  // ---------- questionnaire ----------
  const copy = document.getElementById('copy-survey');
  if(copy) copy.addEventListener('click', () => {
    const f = document.getElementById('survey');
    let out = C.title + '\nCoups de pouce utilisés : ' + state.total + '\n';
    f.querySelectorAll('fieldset').forEach(fs => {
      const lg = fs.querySelector('legend').textContent;
      const ch = [...fs.querySelectorAll('input:checked')].map(i => i.value).join(', ');
      const ta = fs.querySelector('textarea');
      out += '- ' + lg + ' ' + (ch || (ta ? ta.value.trim() : '') || '(pas de réponse)') + '\n';
    });
    const done = () => { document.getElementById('copied').textContent = 'Copié : colle-le dans Classroom.'; };
    const manual = t => { const ta = document.getElementById('survey-out'); ta.hidden = false; ta.value = t; ta.select(); document.getElementById('copied').textContent = 'Sélectionne et copie ce texte.'; };
    try { navigator.clipboard.writeText(out).then(done, () => manual(out)); } catch(e){ manual(out); }
  });
})();
