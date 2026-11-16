// Logique commune aux pages d'exercice : coups de pouce, vérification, correction, questionnaire.
(function(){
  const C = window.EXO; if(!C) return;
  const tri = '<svg class="tri" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 1.5 21h21z" fill="#d0602a"/><rect x="11" y="9" width="2" height="6.5" fill="#fff"/><rect x="11" y="17" width="2" height="2" fill="#fff"/></svg>';
  let total = 0;
  const totalEl = document.getElementById('hint-total');

  function bubble(box, html, kind, who){
    const d = document.createElement('div');
    d.className = 'bubble' + (kind ? ' ' + kind : '');
    d.innerHTML = '<img src="' + C.avatar + '" alt=""><div class="txt"><span class="who">' + who + '</span>' + html.replace(/⚠/g, tri) + '</div>';
    box.appendChild(d);
    d.scrollIntoView({behavior:'smooth', block:'nearest'});
  }
  function num(s){ s = (s || '').trim().replace(/\s/g,'').replace(',', '.'); return s === '' ? NaN : Number(s); }

  document.querySelectorAll('.question').forEach(q => {
    const id = q.dataset.q, cfg = C.questions[id]; if(!cfg) return;
    const fb = q.querySelector('.feedback');
    let used = 0, tries = 0;

    q.querySelectorAll('.check-btn').forEach(btn => btn.addEventListener('click', () => {
      const key = btn.dataset.k || 'main';
      const spec = cfg.answers[key];
      const inp = q.querySelector('input[data-k="' + key + '"]');
      const v = num(inp.value);
      if(isNaN(v)){ bubble(fb, 'Écris d’abord ta valeur numérique (sans l’unité).', 'ko', 'Vérification'); return; }
      tries++;
      let best = null;
      spec.forEach(a => { const e = Math.abs(v - a.v) / Math.abs(a.v); if(e <= (a.tol || 0.03) && (!best || e < best.e)) best = {a, e}; });
      if(best && best.a.ok) bubble(fb, best.a.msg, 'ok', 'Vérification');
      else if(best) bubble(fb, best.a.msg, 'ko', 'Vérification');
      else bubble(fb, cfg.unknown || 'Ce n’est pas la valeur attendue. Fais d’abord les contrôles de bon sens de la fiche, puis demande un coup de pouce si tu bloques.', 'ko', 'Vérification');
    }));

    const hb = q.querySelector('.hint-btn');
    const hc = q.querySelector('.hint-count');
    function upd(){ hc.textContent = used + ' / ' + cfg.hints.length + ' coup(s) de pouce utilisé(s)'; if(used >= cfg.hints.length){ hb.disabled = true; hb.textContent = 'Plus de coup de pouce'; } }
    hb.addEventListener('click', () => {
      if(used >= cfg.hints.length) return;
      bubble(fb, cfg.hints[used], '', 'Coup de pouce ' + (used + 1) + (C.penalty ? ' (' + C.penalty + ')' : ''));
      used++; total++; upd(); if(totalEl) totalEl.textContent = total;
    });
    upd();

    const cb = q.querySelector('.corr-btn'), corr = q.querySelector('.correction');
    cb.addEventListener('click', () => {
      if(!corr.classList.contains('open') && tries === 0 && !cb.dataset.warned){
        cb.dataset.warned = '1';
        bubble(fb, 'Tu n’as encore proposé aucune réponse. Essaie au moins une fois, ou prends un coup de pouce : c’est en cherchant qu’on retient. Clique à nouveau pour voir quand même la correction.', 'ko', 'Avant la correction');
        return;
      }
      corr.classList.toggle('open');
      cb.textContent = corr.classList.contains('open') ? 'Masquer la correction' : 'Voir la correction';
    });
  });

  const copy = document.getElementById('copy-survey');
  if(copy) copy.addEventListener('click', () => {
    const f = document.getElementById('survey');
    let out = C.title + '\nCoups de pouce utilisés : ' + total + '\n';
    f.querySelectorAll('fieldset').forEach(fs => {
      const lg = fs.querySelector('legend').textContent;
      const ch = [...fs.querySelectorAll('input:checked')].map(i => i.value).join(', ');
      const ta = fs.querySelector('textarea');
      out += '- ' + lg + ' ' + (ch || (ta ? ta.value.trim() : '') || '(pas de réponse)') + '\n';
    });
    const done = () => { document.getElementById('copied').textContent = 'Copié : colle-le dans Classroom.'; };
    try { navigator.clipboard.writeText(out).then(done, () => { prompt0(out); }); } catch(e){ prompt0(out); }
    function prompt0(t){ const ta = document.getElementById('survey-out'); ta.hidden = false; ta.value = t; ta.select(); document.getElementById('copied').textContent = 'Sélectionne et copie ce texte.'; }
  });
})();
