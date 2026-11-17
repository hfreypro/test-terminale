// Moteur commun des pages d'exercice (version 3)
// - panneau de dialogue à côté de l'exercice (l'androïde questionne l'élève)
// - diagnostic par paramètres : chaque erreur type (oubli, facteur inversé, conversion…) a un facteur ;
//   le moteur teste toutes les erreurs seules et toutes les combinaisons de deux erreurs
// - dialogue : constat neutre → « as-tu une idée ? » → questions qui localisent → pistes → nature de l'erreur en dernier
// - donnée mal lue : « es-tu certain ? » → « relis l'énoncé » → donnée surlignée en rouge → indice final
// - coups de pouce questionnants (« connais-tu la relation ? » avant de la donner)
// - « Voir la correction » verrouillé jusqu'à 3 valeurs proposées ou une bonne réponse
// - fiche en surimpression, toujours rouverte sur la section demandée
// - bilan de fin d'exercice (tableau imprimable en PDF)
// - sauvegarde des réponses et du dialogue dans le navigateur
(function(){
  const C = window.EXO; if(!C) return;
  const KEY = 'exo3:' + location.pathname;
  const LOCK = C.lockTries || 3;      // valeurs à proposer avant de débloquer la correction
  const DTOL = C.diagTol || 0.025;    // tolérance (relative) pour reconnaître une erreur type
  const tri = '<svg viewBox="0 0 24 24" style="width:1em;height:1em;vertical-align:-2px" aria-hidden="true"><path d="M12 2.5 1.5 21h21z" fill="#d0602a"/><rect x="11" y="9" width="2" height="6.5" fill="#fff"/><rect x="11" y="17" width="2" height="2" fill="#fff"/></svg>';
  const ACT = { fiche:'Voir la fiche', fichefull:'Retravailler toute la fiche', exemple:'Refaire l’exemple de la fiche', hint:'Un coup de pouce', retry:'Je corrige ma réponse', corr:'Voir la correction', bilan:'Voir mon bilan' };
  const state = { inputs:{}, used:{}, tries:{}, total:0, log:'', ok:{}, att:{}, corrSeen:{}, done:false };
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

  // ---------- fiche en surimpression (toujours rechargée sur la section demandée) ----------
  const ov = document.createElement('div'); ov.className = 'overlay';
  ov.innerHTML = '<div class="pane"><div class="bar"><b>Fiche</b><button type="button" class="full">Toute la fiche</button><button type="button" class="close">Revenir à l’exercice</button></div><iframe title="Fiche"></iframe></div>';
  document.body.appendChild(ov);
  const frame = ov.querySelector('iframe');
  let ficheBase = '', ficheHash = '';
  frame.addEventListener('load', () => {            // filet de sécurité : on force le défilement sur la section
    if(!ficheHash) return;
    try{ const el = frame.contentDocument.getElementById(ficheHash); if(el) el.scrollIntoView(); }catch(e){}
  });
  function openFiche(url){
    const i = url.indexOf('#');
    ficheBase = i < 0 ? url : url.slice(0, i);
    ficheHash = i < 0 ? '' : url.slice(i + 1);
    frame.src = ficheBase + '?t=' + Date.now() + (ficheHash ? '#' + ficheHash : '');   // rechargement forcé
    ov.querySelector('b').textContent = C.ficheTitle || 'Fiche'; ov.classList.add('open');
  }
  ov.querySelector('.close').addEventListener('click', () => ov.classList.remove('open'));
  ov.querySelector('.full').addEventListener('click', () => openFiche(ficheBase + '#top'));
  ov.addEventListener('click', e => { if(e.target === ov) ov.classList.remove('open'); });

  // ---------- messages ----------
  function fmt(v){
    const a = Math.abs(v);
    const d = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : a >= 0.01 ? 3 : 5;
    return v.toLocaleString('fr-FR', {maximumFractionDigits:d});
  }
  function save(){ if(!saving) return; state.log = log.innerHTML; try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){} }
  function scroll(){ log.scrollTop = log.scrollHeight; }
  function clearEmpty(){ const e = log.querySelector('.chat-empty'); if(e) e.remove(); }
  function disableOld(){ log.querySelectorAll('.choices button').forEach(b => b.disabled = true); }
  function me(text){ clearEmpty(); const d = document.createElement('div'); d.className = 'msg me'; d.innerHTML = text; log.appendChild(d); scroll(); }
  function actLabel(a){ const k = a.split('#')[0]; return ACT[k] || a; }
  function bot(q, html, kind, tag, choices, actions){
    clearEmpty(); disableOld();
    const d = document.createElement('div'); d.className = 'msg bot' + (kind ? ' ' + kind : '');
    d.innerHTML = (tag ? '<span class="tag">' + tag + '</span>' : '') + html.replace(/⚠/g, tri);
    const all = (choices || []).map(c => ({label:c.label, next:c.next})).concat((actions || []).map(a => ({label:actLabel(a), act:a})));
    if(all.length){
      const box = document.createElement('div'); box.className = 'choices';
      all.forEach(c => { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = c.label; if(c.act) b.className = 'act';
        b.dataset.q = q; if(c.next) b.dataset.next = c.next; if(c.act) b.dataset.act = c.act; box.appendChild(b); });
      d.appendChild(box);
    }
    log.appendChild(d);
    if(chat.classList.contains('min')){ chat.classList.remove('min'); chat.querySelector('.toggle').textContent = 'Réduire'; }
    scroll(); save();
    return d;
  }
  log.addEventListener('click', e => {
    const b = e.target.closest('.choices button'); if(!b || b.disabled) return;
    const q = b.dataset.q; me(b.innerHTML);
    if(b.dataset.next) go(q, b.dataset.next);
    else action(q, b.dataset.act);
  });

  // ---------- surlignage d'une donnée de l'énoncé ----------
  function highlight(id){
    document.querySelectorAll('.hl').forEach(x => x.classList.remove('hl'));
    const el = id && document.getElementById(id); if(!el) return;
    el.classList.add('hl');
    el.scrollIntoView({behavior:'smooth', block:'center'});
  }

  // ---------- actions ----------
  const Q = {};
  function action(q, a){
    const cfg = C.questions[q], el = Q[q];
    const [k, h] = a.split('#');
    if(k === 'fiche') openFiche(C.fiche + (h ? '#' + h : (cfg.fiche || '')));
    else if(k === 'fichefull') { openFiche(C.fiche + '#top'); bot(q, 'Prends le temps de relire la fiche, surtout « Je retrouve la formule », puis refais l’exemple de la fiche. Reviens ensuite à l’exercice : tes réponses sont gardées.', '', '', [], ['retry']); }
    else if(k === 'exemple') openFiche(C.fiche + '#exemple');
    else if(k === 'hint') el.hint();
    else if(k === 'corr') el.corr();
    else if(k === 'bilan') showBilan(true);
    else if(k === 'retry') { focusInput(q); bot(q, 'D’accord. Corrige ta valeur, puis clique à nouveau sur « Vérifier ».', '', ''); }
  }
  const lastK = {};
  function focusInput(q){
    const root = Q[q].root;
    const i = (lastK[q] && root.querySelector('input[data-k="' + lastK[q] + '"]')) || root.querySelector('input');
    if(i){ i.focus(); i.select(); }
  }

  // ---------- dialogue ----------
  let lastV = null;
  const pending = {};          // point « as-tu compris ? » en attente de la fin de la branche
  const diag = {};             // diagnostic en cours, par question : {k, queue:[erreurs], i, att}
  function errById(q, k, id){ return (C.questions[q].answers[k].errors || []).find(e => e.id === id); }
  function sub(s){ return s.replace(/\{v\}/g, lastV === null ? '' : fmt(lastV)); }
  function say(q, n, prefix, id){
    const cfg = C.questions[q];
    if(n.hl) highlight(n.hl);
    const dq = diag[q];
    if(n.err && dq && dq.att){                         // l'élève a localisé une erreur : on la note pour le bilan
      const id = (dq.i >= 0 && dq.queue[dq.i]) ? dq.queue[dq.i].id : n.err;
      const a = dq.att; a.conf = a.conf || []; if(!a.conf.includes(id)) a.conf.push(id);
    }
    bot(q, (prefix || '') + sub(n.say), n.kind || '', n.tag || '', n.choices, n.actions);
    if(pending[q] && !(n.choices && n.choices.length) && id !== cfg.comprendre){ pending[q] = false; node(q, cfg.comprendre); }
  }
  function node(q, id, prefix){ const n = C.questions[q].nodes[id]; if(n) say(q, n, prefix, id); }

  // nœuds communs, utilisés par toutes les questions
  const COMMON = {
    '@found':  {say:'Très bien : corrige ta valeur, puis clique à nouveau sur « Vérifier ».'},
    '@retry':  {say:'D’accord : propose une valeur, même approximative, puis clique sur « Vérifier ». Même fausse, elle m’aide à voir où tu bloques.'},
    '@lockno': {say:'Alors commence par l’exemple de la fiche : il suit la même démarche que cette question. Refais-le sur ta feuille, puis reviens proposer une valeur, même approximative.', actions:['exemple','hint']},
    '@fin':    {say:'Tes réponses à mes questions sont justes : l’erreur se cache sans doute dans l’application numérique. Refais-la pas à pas, en écrivant l’unité à chaque ligne.',
                choices:[{label:'Je ne trouve toujours pas', next:'@nature'}], actions:['retry','hint']},
    '@perdu':  {say:'Reprenons étape par étape : vérifie chaque résultat intermédiaire avec un contrôle de bon sens, ou prends un coup de pouce.', actions:['retry','hint','fiche']}
  };
  function go(q, next){
    const cfg = C.questions[q], d = diag[q];
    if(next === '@found' || next === '@retry'){ focusInput(q); say(q, COMMON[next], '', next); return; }
    if(next === '@lockno' || next === '@fin' || next === '@perdu'){ say(q, COMMON[next], '', next); return; }
    if(next === '@idee'){                          // l'élève n'a pas d'idée : on commence à localiser
      if(d && d.queue.length){ d.i = 0; node(q, d.queue[0].start, 'Cherchons ensemble. '); }
      else { const lost = d && cfg.answers[d.k].lost; if(lost && cfg.nodes[lost]) node(q, lost); else say(q, COMMON['@perdu'], '', '@perdu'); }
      return;
    }
    if(next === '@next'){                          // ce point est juste : erreur suivante de la liste
      if(d && d.i + 1 < d.queue.length){ d.i++; node(q, d.queue[d.i].start, 'D’accord, ce point-là est juste. '); }
      else say(q, COMMON['@fin'], 'D’accord, ce point-là est juste. ', '@fin');
      return;
    }
    if(next === '@nature'){                        // en tout dernier : la nature de l'erreur la plus probable
      const e = d && d.queue[0];
      if(e && e.nature) node(q, e.nature);
      else say(q, {say:'Regarde la correction détaillée de la fiche (l’exemple), puis refais ton calcul.', actions:['exemple','retry']}, '', '@x');
      return;
    }
    if(next.startsWith('@hy:') || next.startsWith('@hn:')){   // réponse à un coup de pouce questionnant
      const h = cfg.hints[+next.slice(4)];
      const yes = next[2] === 'y';
      say(q, {say: yes ? h.yes : h.no, actions: (yes ? h.yesAct : h.noAct) || ['retry','fiche']}, '', '@h');
      return;
    }
    if(cfg.nodes[next]) node(q, next);
  }

  // ---------- diagnostic ----------
  function ratioText(rho, unit, v){
    const val = '(' + fmt(v) + (unit ? ' ' + unit : '') + ')';
    const up = rho > 1, f = up ? rho : 1 / rho;
    if(f < 1.2) return 'L’ordre de grandeur de ta valeur ' + val + ' est bon, mais elle est un peu trop ' + (up ? 'forte' : 'faible') + '.';
    if(f < 1.75) return 'Ta valeur ' + val + ' est trop ' + (up ? 'grande' : 'petite') + ', d’environ ' + Math.round((up ? rho - 1 : 1 - rho) * 100) + ' %.';
    if(f < 2.3) return 'Ta valeur ' + val + ' est environ ' + (up ? 'le double' : 'la moitié') + ' de ce qu’il faut.';
    const n = f < 10 ? Math.round(f * 10) / 10 : f < 100 ? Math.round(f) : Math.round(f / 10) * 10;
    return 'Ta valeur ' + val + ' est environ ' + n.toLocaleString('fr-FR') + ' fois trop ' + (up ? 'grande' : 'petite') + '.';
  }
  function candidates(q, k, rho){
    const spec = C.questions[q].answers[k];
    const errs = (spec.errors || []).filter(e => !(e.up && state.ok[q + ':' + e.up]));
    const list = [];
    errs.forEach((e, i) => list.push({errs:[e], f:e.f, n:1, i}));
    errs.forEach((a, i) => errs.forEach((b, j) => { if(j > i && a.p !== b.p) list.push({errs:[a, b], f:a.f * b.f, n:2, i: i * 100 + j}); }));
    const tol = Math.log(1 + DTOL);
    return list.map(c => ({...c, d:Math.abs(Math.log(rho / c.f))}))
               .filter(c => c.d <= tol)
               .sort((a, b) => (a.d + (a.n - 1) * 0.008) - (b.d + (b.n - 1) * 0.008) || a.i - b.i);
  }
  function diagnose(q, k, v){
    const spec = C.questions[q].answers[k];
    const rho = v / spec.expected;
    const cands = candidates(q, k, rho);
    const queue = [];
    // dans une combinaison, on cherche d'abord l'erreur qui pèse le plus (facteur le plus éloigné de 1)
    cands.forEach(c => c.errs.slice().sort((a, b) => Math.abs(Math.log(b.f)) - Math.abs(Math.log(a.f)))
                              .forEach(e => { if(!queue.some(x => x.start === e.start)) queue.push(e); }));
    const att = {k, v, hyps: cands.slice(0, 2).map(c => c.errs.map(e => e.id))};
    state.att[q] = state.att[q] || []; state.att[q].push(att);
    diag[q] = {k, queue, i:-1, att};
    let s = ratioText(rho, spec.unit, v);
    if(spec.sense){ const x = spec.sense.find(z => rho >= z.min && rho < z.max); if(x) s += ' ' + x.say; }
    say(q, {kind:'ko', tag:'Vérification', say: s + ' D’où peut venir l’écart : as-tu une idée ?',
            choices:[{label:'Oui, je crois', next:'@found'}, {label:'Non, pas vraiment', next:'@idee'}]}, '', '@constat');
  }

  // ---------- lecture des nombres : 2,06 · 2.06 · 1/6 · 1,5e3 · 1,5×10^3 ----------
  function num(s){
    s = (s || '').trim().replace(/\s/g,'').replace(/^[≈=~]+/, '').replace(/,/g, '.').replace(/[−–]/g, '-');
    if(s === '') return NaN;
    let m = s.match(/^(-?\d*\.?\d+)\/(-?\d*\.?\d+)$/);
    if(m) return Number(m[1]) / Number(m[2]);
    m = s.match(/^(-?\d*\.?\d+)(?:[x×*·.]10\^?\(?(-?\d+)\)?)$/i);
    if(m) return Number(m[1]) * Math.pow(10, Number(m[2]));
    m = s.match(/^10\^\(?(-?\d+)\)?$/);
    if(m) return Math.pow(10, Number(m[1]));
    return Number(s);
  }

  // ---------- questions ----------
  function qDone(q){
    const cfg = C.questions[q];
    return state.corrSeen[q] || Object.keys(cfg.answers).every(k => state.ok[q + ':' + k]);
  }
  function unlocked(q){
    const cfg = C.questions[q];
    return state.tries[q] >= LOCK || Object.keys(cfg.answers).some(k => state.ok[q + ':' + k]);
  }
  document.querySelectorAll('.question').forEach(root => {
    const q = root.dataset.q, cfg = C.questions[q]; if(!cfg) return;
    state.used[q] = state.used[q] || 0; state.tries[q] = state.tries[q] || 0;
    const tools = root.querySelector('.tools');
    const hb = root.querySelector('.hint-btn'), hc = root.querySelector('.hint-count');
    const cb = root.querySelector('.corr-btn'), corr = root.querySelector('.correction');
    if(cfg.fiche !== undefined){
      const fb = document.createElement('button'); fb.type = 'button'; fb.className = 'btn fiche'; fb.textContent = 'Voir la fiche';
      fb.addEventListener('click', () => action(q, 'fiche'));
      tools.insertBefore(fb, cb);
    }
    const api = { root };
    function updH(){ hc.textContent = state.used[q] + ' / ' + cfg.hints.length + ' coup(s) de pouce utilisé(s)'; hb.disabled = state.used[q] >= cfg.hints.length; if(hb.disabled) hb.textContent = 'Plus de coup de pouce'; const t = document.getElementById('hint-total'); if(t) t.textContent = state.total; }
    function updC(){
      const open = corr.classList.contains('open');
      cb.classList.toggle('locked', !unlocked(q) && !open);
      cb.textContent = open ? 'Masquer la correction' : unlocked(q) ? 'Voir la correction' : '🔒 Voir la correction';
      cb.title = unlocked(q) ? '' : 'La correction s’ouvre après ' + LOCK + ' valeurs proposées, ou dès une bonne réponse.';
    }
    api.hint = () => {
      if(state.used[q] >= cfg.hints.length){ bot(q, 'Tu as utilisé tous les coups de pouce. Tu peux relire la fiche, ou regarder la correction si elle est débloquée.', '', '', [], ['fiche','corr']); return; }
      const i = state.used[q]; state.used[q]++; state.total++; updH();
      const h = cfg.hints[i], tag = 'Coup de pouce ' + (i + 1) + (C.penalty ? ' (' + C.penalty + ')' : '');
      if(typeof h === 'string') bot(q, h, '', tag, [], ['retry','fiche']);
      else bot(q, h.ask, '', tag, [{label:h.yesLabel || 'Oui', next:'@hy:' + i}, {label:h.noLabel || 'Non', next:'@hn:' + i}]);
    };
    hb.addEventListener('click', api.hint);
    api.corr = () => {
      if(corr.classList.contains('open')){ corr.classList.remove('open'); updC(); return; }
      if(!unlocked(q)){
        const n = state.tries[q];
        bot(q, 'La correction s’ouvre après ' + LOCK + ' valeurs proposées, ou dès que tu as trouvé une bonne réponse. Tu en as proposé ' + n + '. Veux-tu essayer une valeur ? Même fausse, elle m’aide à voir où tu bloques.', 'ko', 'Avant la correction',
            [{label:'Oui, je propose une valeur', next:'@retry'}, {label:'Je ne sais pas quoi proposer', next:'@lockno'}]);
        return;
      }
      corr.classList.add('open'); state.corrSeen[q] = true; updC(); save();
      corr.scrollIntoView({behavior:'smooth', block:'start'});
      checkDone();
    };
    cb.addEventListener('click', () => api.corr());

    root.querySelectorAll('.check-btn').forEach(btn => btn.addEventListener('click', () => {
      const k = btn.dataset.k || 'main', spec = cfg.answers[k];
      const inp = root.querySelector('input[data-k="' + k + '"]');
      lastK[q] = k;
      const v = num(inp.value); state.inputs[inp.id] = inp.value;
      const lab = (root.querySelector('label[for="' + inp.id + '"]') || {}).innerHTML || '';
      if(isNaN(v)){ bot(q, inp.value.trim() === '' ? 'Écris d’abord ta valeur numérique, sans l’unité.' : 'Je ne comprends pas cette écriture. Écris ta valeur sans l’unité, par exemple 2,06 ou 1/6.', 'ko', ''); return; }
      me(lab + ' ' + inp.value + ' ' + ((inp.parentNode.querySelector('.unit') || {}).innerHTML || ''));
      document.querySelectorAll('.hl').forEach(x => x.classList.remove('hl'));
      state.tries[q]++; lastV = v; delete diag[q];
      let good = false;
      if(Math.abs(v / spec.expected - 1) <= (spec.tol || 0.03)){
        good = true; state.ok[q + ':' + k] = true; pending[q] = false;
        state.att[q] = state.att[q] || []; state.att[q].push({k, v, ok:true});
        node(q, spec.ok);
      } else diagnose(q, k, v);
      updC();
      if(!good && state.tries[q] >= 3 && !root.dataset.asked && cfg.comprendre){
        root.dataset.asked = '1';
        pending[q] = true;                // le point « as-tu compris ? » viendra à la fin de la branche
      }
      save();
      if(good) checkDone();
    }));
    root.querySelectorAll('input').forEach(i => i.addEventListener('input', () => { state.inputs[i.id] = i.value; save(); }));
    api.updH = updH; api.updC = updC; Q[q] = api;
  });

  // ---------- bilan ----------
  const bilanBox = document.getElementById('bilan');
  function errLabel(q, k, id){ const e = errById(q, k, id); return e ? e.label : id; }
  function buildBilan(){
    const rows = Object.keys(Q).map(q => {
      const cfg = C.questions[q], att = state.att[q] || [];
      const errs = [], points = [], refs = [];
      const counts = {};
      att.filter(a => !a.ok).forEach(a => {
        const ids = (a.conf && a.conf.length) ? a.conf : (a.hyps[0] || []);
        let lab;
        if(a.conf && a.conf.length) lab = ids.map(id => errLabel(q, a.k, id)).join(' + ');
        else if(a.hyps.length) lab = a.hyps.map(h => h.map(id => errLabel(q, a.k, id)).join(' + ')).join(' ou ') + ' (probable)';
        else lab = 'valeur non reconnue (' + fmt(a.v) + ')';
        const key = (cfg.keyLabel && cfg.keyLabel[a.k] ? cfg.keyLabel[a.k] + ' : ' : '') + lab;
        counts[key] = (counts[key] || 0) + 1;
        ids.forEach(id => { const e = errById(q, a.k, id); if(!e) return;
          if(e.point && !points.includes(e.point)) points.push(e.point);
          if(e.ref && !refs.some(r => r.t === e.ref.t)) refs.push(e.ref); });
      });
      Object.entries(counts).forEach(([l, n]) => errs.push(l + (n > 1 ? ' (' + n + ' essais)' : '')));
      if(att.some(a => !a.ok && !a.hyps.length) && cfg.point && !points.includes(cfg.point)) points.push(cfg.point);
      const notes = [];
      if(state.used[q]) notes.push(state.used[q] + ' coup(s) de pouce');
      if(state.corrSeen[q]) notes.push('correction consultée');
      const fini = Object.keys(cfg.answers).every(k => state.ok[q + ':' + k]);
      if(!fini) notes.push('pas encore terminée');
      if(!refs.length && cfg.ref && (errs.length || state.used[q] || state.corrSeen[q])) refs.push(cfg.ref);
      return '<tr><td><b>' + (cfg.label || q) + '</b></td><td>' + (errs.length ? '<ul><li>' + errs.join('</li><li>') + '</li></ul>' : (fini ? 'Aucune : réussie du premier coup' : '—'))
        + (notes.length ? '<div class="bnote">' + notes.join(' · ') + '</div>' : '') + '</td><td>'
        + (points.length ? '<ul><li>' + points.join('</li><li>') + '</li></ul>' : '—') + '</td><td>'
        + (refs.length ? refs.map(r => r.a ? '<a class="fl" href="' + C.fiche + r.a + '">' + r.t + '</a>' : r.t).join('<br>') : '—') + '</td></tr>';
    }).join('');
    const d = new Date().toLocaleDateString('fr-FR');
    return '<p class="bilan-title"><b>' + (C.title || 'Exercice') + '</b> — bilan du ' + d + '</p>'
      + '<table class="data bilan-t"><tr><th>Question</th><th>Erreurs commises</th><th>Points à retravailler</th><th>Fiche</th></tr>' + rows + '</table>';
  }
  function showBilan(scrollTo){
    if(!bilanBox) return;
    bilanBox.querySelector('.bilan-body').innerHTML = buildBilan();
    if(scrollTo) bilanBox.scrollIntoView({behavior:'smooth', block:'start'});
  }
  function checkDone(){
    showBilan(false);
    if(state.done || !Object.keys(Q).every(qDone)) return;
    state.done = true;
    const q = Object.keys(Q).pop();
    bot(q, 'Tu as terminé l’exercice. Ton bilan est prêt sous les questions : erreurs commises, points à retravailler et fiches à revoir. Tu peux le télécharger en PDF.', 'ok', 'Bilan', [], ['bilan']);
  }
  if(bilanBox){
    bilanBox.addEventListener('click', e => { const a = e.target.closest('a.fl'); if(a){ e.preventDefault(); openFiche(a.getAttribute('href')); } });
    const bs = document.getElementById('bilan-show'), bp = document.getElementById('bilan-pdf');
    if(bs) bs.addEventListener('click', () => showBilan(true));
    if(bp) bp.addEventListener('click', () => {
      showBilan(false);
      const t = document.title; document.title = 'Bilan - ' + (C.title || 'exercice');
      document.body.classList.add('print-bilan');
      const end = () => { document.body.classList.remove('print-bilan'); document.title = t; window.removeEventListener('afterprint', end); };
      window.addEventListener('afterprint', end);
      window.print();
      setTimeout(end, 1500);
    });
  }

  // ---------- restauration ----------
  try{
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if(s){
      Object.assign(state, s);
      Object.entries(state.inputs || {}).forEach(([id, v]) => { const i = document.getElementById(id); if(i) i.value = v; });
      Object.entries(state.corrSeen || {}).forEach(([q, v]) => { if(v && Q[q]){ const c = Q[q].root.querySelector('.correction'); if(c) c.classList.add('open'); } });
      if(state.log){ log.innerHTML = state.log; disableOld(); const d = document.createElement('div'); d.className = 'msg bot'; d.innerHTML = 'Tu reprends là où tu t’étais arrêté : tes réponses sont revenues.'; log.appendChild(d); scroll(); }
    }
  }catch(e){}
  Object.values(Q).forEach(a => { a.updH(); a.updC(); });
  showBilan(false);

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
