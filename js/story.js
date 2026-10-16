(() => {
  'use strict';

  /* ===================================================================
   * ONE CONFIG to re-tune the art.
   * All x / y / w / h values are percentages of the house image
   * (img/house.png, 1024x1246). Spots are where Rory's FEET go
   * (x = horizontal centre). img/kid.png is a sprite sheet, 6 frames in
   * a row: 0 idle, 1-2 walk right, 3-4 walk left, 5 cheer.
   * =================================================================== */
  const CONFIG = {
    speed: 38,          // % of house per second while walking
    stairsX: 85,        // floors are joined by the staircase at this x
    maxStars: 5,
    spots: {
      board:    { x: 36, y: 65.5 },   // kitchen quest board
      bed:      { x: 20, y: 37 },
      desk:     { x: 50, y: 37 },
      bathroom: { x: 66, y: 37 },
      sofa:     { x: 60, y: 65.5 },
      dogBowl:  { x: 42, y: 88 }
    },
    dog:      { x: 32, y: 84 },     // Biscuit; "+2" pops above this point
    logoItem: { x: 60, y: 60 },     // glowing logo item (reward beat), feet position
    intro: { spot: 'board', pose: 'idle', stars: 0, phone: false, approved: false, dogHappy: false, reward: false },
    // Story steps. Step 0 of each beat lists the full state; later steps are deltas.
    // `at` = ms to wait after the previous step finished (walking included)
    beats: [
      [ { at: 0, spot: 'board', stars: 0 } ],
      [ { at: 0, spot: 'bed', stars: 0 }, { at: 300, pose: 'cheer' }, { at: 1200, pose: 'idle' } ],
      [ { at: 0, spot: 'bed', phone: true, stars: 0 }, { at: 900, approved: true }, { at: 500, stars: 1 } ],
      [ { at: 0, spot: 'dogBowl', stars: 1 }, { at: 300, dogHappy: true, stars: 3 } ],
      [ { at: 0, spot: 'desk', stars: 3 }, { at: 400, stars: 4 }, { at: 900, spot: 'bathroom' }, { at: 300, stars: 5 } ],
      [ { at: 0, spot: 'sofa', stars: 5 }, { at: 300, pose: 'cheer', reward: true } ]
    ]
  };

  const DEFAULTS = { spot: 'board', pose: 'idle', stars: 0, phone: false, approved: false, dogHappy: false, reward: false };
  const $ = (s, r = document) => r.querySelector(s);
  const stage = $('#stage');
  if (!stage) return;
  const house = $('#house');
  const kid = $('#kid');
  const hudStars = $('#hud-stars');
  const hudCount = $('#hud-count');
  const goalLbl = $('#goal-lbl');
  const cells = Array.from(stage.querySelectorAll('.bar i'));
  const reduceQ = window.matchMedia('(prefers-reduced-motion: reduce)');

  const place = (el, p) => { if (el) { el.style.left = p.x + '%'; el.style.top = p.y + '%'; } };
  place($('#dog-pop'), { x: CONFIG.dog.x, y: CONFIG.dog.y - 8 });
  place($('#logo-item'), CONFIG.logoItem);

  // ---- kid sprite + movement ----
  let pos = { ...CONFIG.spots[CONFIG.intro.spot] };
  let frameTimer = null;
  let moveTimers = [];
  const setFrame = n => kid.style.setProperty('--frame', n);
  const setPos = p => { pos = { ...p }; kid.style.left = p.x + '%'; kid.style.top = p.y + '%'; };
  const idleFrame = () => setFrame(kid.classList.contains('cheer') ? 5 : 0);
  const startWalking = frames => {
    clearInterval(frameTimer);
    let i = 0;
    setFrame(frames[0]);
    frameTimer = setInterval(() => setFrame(frames[++i % 2]), 160);   // ~6 fps
  };
  const stopWalking = () => { clearInterval(frameTimer); frameTimer = null; idleFrame(); };
  const setPose = pose => { kid.classList.toggle('cheer', pose === 'cheer'); if (!frameTimer) idleFrame(); };
  const cancelMove = () => {
    moveTimers.forEach(clearTimeout); moveTimers = [];
    // freeze where the kid currently is
    const hr = house.getBoundingClientRect(), kr = kid.getBoundingClientRect();
    if (hr.width && frameTimer) {
      pos = { x: (kr.left + kr.width / 2 - hr.left) / hr.width * 100, y: (kr.bottom - hr.top) / hr.height * 100 };
      kid.style.transitionDuration = '0s';
      setPos(pos);
    }
    stopWalking();
  };

  // Walk to a spot; changes of floor go via the staircase. Returns the total ms.
  function moveTo(name, animate) {
    const dest = CONFIG.spots[name];
    cancelMove();
    if (pos.x === dest.x && pos.y === dest.y) return 0;
    if (!animate) { kid.style.transitionDuration = '0s'; setPos(dest); return 0; }
    const sx = CONFIG.stairsX;
    const path = Math.abs(pos.y - dest.y) > 1
      ? [{ x: sx, y: pos.y }, { x: sx, y: dest.y }, dest]
      : [dest];
    let t = 0, from = { ...pos };
    path.forEach(to => {
      const dx = to.x - from.x, dy = to.y - from.y;
      const len = Math.abs(dx) + Math.abs(dy);
      if (len < 0.5) { from = to; return; }
      const ms = Math.max(350, len / CONFIG.speed * 1000);
      const frames = dx < -0.5 ? [3, 4] : [1, 2];
      const seg = to;
      moveTimers.push(setTimeout(() => {
        startWalking(frames);
        kid.style.transitionDuration = ms + 'ms';
        setPos(seg);
      }, t));
      t += ms;
      from = to;
    });
    moveTimers.push(setTimeout(() => { stopWalking(); kid.style.transitionDuration = '0s'; }, t));
    return t;
  }

  // ---- HUD ----
  let shownStars = 0;
  const setStars = n => {
    shownStars = n;
    hudCount.textContent = String(n);
    goalLbl.textContent = stage.classList.contains('reward') ? 'Approved: Movie night!' : 'Saving for: Movie night ' + n + '/' + CONFIG.maxStars;
    cells.forEach((c, i) => c.classList.toggle('on', i < n));
  };
  const flyStar = delay => {
    if (!stage.animate) return;
    const from = kid.getBoundingClientRect();
    const to = hudStars.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('class', 'fly');
    el.setAttribute('viewBox', '0 0 7 7');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<use href="#px-star"/>';
    stage.appendChild(el);
    const x0 = from.left + from.width / 2 - sr.left - 14, y0 = from.top - sr.top - 14;
    const x1 = to.left - sr.left, y1 = to.top - sr.top;
    const a = el.animate([
      { transform: `translate(${x0}px, ${y0}px) scale(.6)`, offset: 0 },
      { transform: `translate(${x0}px, ${y0 - 36}px) scale(1.2)`, offset: .3 },
      { transform: `translate(${x1}px, ${y1}px) scale(.8)`, offset: 1 }
    ], { duration: 900, delay, easing: 'steps(12)', fill: 'both' });
    a.onfinish = () => el.remove();
    a.oncancel = () => el.remove();
  };
  const pop = () => { hudStars.classList.remove('pop'); void hudStars.offsetWidth; hudStars.classList.add('pop'); };

  // ---- state application ----
  let cur = { ...DEFAULTS, ...CONFIG.intro };
  let timers = [];
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  // returns ms the step takes to finish
  function apply(next, animate) {
    const prev = cur;
    cur = { ...next };
    stage.classList.toggle('show-phone', cur.phone);
    stage.classList.toggle('approved', cur.approved);
    stage.classList.toggle('dog-happy', cur.dogHappy);
    stage.classList.toggle('reward', cur.reward);
    let dur = 0;
    if (cur.spot !== prev.spot || !animate) dur = moveTo(cur.spot, animate);
    setPose(cur.pose);
    if (cur.stars > shownStars && animate) {
      const n = Math.min(cur.stars - shownStars, 3);
      for (let i = 0; i < n; i++) flyStar(i * 300);
      const target = cur.stars, wait = 900 + (n - 1) * 300;
      timers.push(setTimeout(() => { setStars(target); pop(); }, wait));
      dur = Math.max(dur, wait);
    } else {
      setStars(cur.stars);
    }
    return dur;
  }

  let active = -2;
  function goTo(idx) {
    if (idx === active) return;
    const forward = idx > active;
    active = idx;
    clearTimers();
    document.querySelectorAll('.beat').forEach((b, i) => b.classList.toggle('is-active', i === idx));
    if (idx < 0) { apply({ ...DEFAULTS, ...CONFIG.intro }, !reduceQ.matches && active !== -2); return; }
    const steps = CONFIG.beats[idx];
    if (reduceQ.matches) {
      // jump straight to the beat's end state
      apply(steps.reduce((s, { at, ...d }) => ({ ...s, ...d }), { ...DEFAULTS }), false);
      return;
    }
    let run = { ...DEFAULTS };
    const runStep = i => {
      if (i >= steps.length) return;
      const { at, ...d } = steps[i];
      const go = () => {
        run = { ...run, ...d };
        const dur = apply(run, true);
        timers.push(setTimeout(() => runStep(i + 1), dur));
      };
      if (at === 0) go(); else timers.push(setTimeout(go, at));
    };
    runStep(0);
  }

  // ---- init ----
  setPos(pos);
  kid.style.transitionDuration = '0s';
  setStars(0);

  const beats = Array.from(document.querySelectorAll('.beat'));
  if (!('IntersectionObserver' in window)) { goTo(beats.length - 1); return; }

  const visible = new Set();
  let io = null;
  const watch = () => {
    if (io) io.disconnect();
    visible.clear();
    // reading line: low on phones (cards sit under the sticky stage), mid-viewport on desktop
    const phone = window.matchMedia('(max-width: 700px)').matches;
    const margin = phone ? '-72% 0px -24% 0px' : '-45% 0px -45% 0px';
    io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        const i = beats.indexOf(e.target);
        if (e.isIntersecting) visible.add(i); else visible.delete(i);
      });
      if (visible.size) goTo(Math.max(...visible));
      else if (beats[0].getBoundingClientRect().top > 0) goTo(-1);
    }, { rootMargin: margin });
    beats.forEach(b => io.observe(b));
  };
  watch();
  window.matchMedia('(max-width: 700px)').addEventListener('change', watch);
})();
