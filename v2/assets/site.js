// 관계도: 기술(skills)과 경험(experiences)을 N:M 선으로 잇고,
// 한쪽을 고르면 연결된 항목만 강조한다.
(() => {
  const schema = document.querySelector('.schema');
  if (!schema) return;

  const svg = schema.querySelector('svg.lines');
  const skills = [...schema.querySelectorAll('.skills .node')];
  const exps = new Map([...schema.querySelectorAll('.exps .node')].map(n => [n.dataset.id, n]));
  const wide = window.matchMedia('(min-width: 861px)');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const NS = 'http://www.w3.org/2000/svg';
  let pinned = null;
  let drawnOnce = false;

  const relationsOf = (skill) => skill.dataset.rel.split(' ');

  function draw(animate) {
    svg.replaceChildren();
    if (!wide.matches) return;
    const box = schema.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);

    for (const s of skills) {
      const a = s.getBoundingClientRect();
      for (const id of relationsOf(s)) {
        const e = exps.get(id);
        if (!e) continue;
        const b = e.getBoundingClientRect();
        const x1 = a.right - box.left, y1 = a.top + a.height / 2 - box.top;
        const x2 = b.left - box.left, y2 = b.top + b.height / 2 - box.top;
        const dx = (x2 - x1) * 0.5;

        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`);
        path.dataset.skill = s.dataset.id;
        path.dataset.exp = id;
        svg.append(path);

        for (const [cx, cy] of [[x1, y1], [x2, y2]]) {
          const dot = document.createElementNS(NS, 'circle');
          dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('r', 2.6);
          dot.dataset.skill = s.dataset.id;
          dot.dataset.exp = id;
          svg.append(dot);
        }

        if (animate && !reduceMotion.matches) {
          const len = path.getTotalLength();
          path.style.strokeDasharray = len;
          path.style.setProperty('--len', len);
          path.classList.add('draw');
        }
      }
    }
    applyFocus(current());
  }

  // 지금 강조할 대상: 고정(pin)된 항목, 마우스가 올라간 항목, 자동 둘러보기 순서
  let hovered = null;
  let tour = null;
  const current = () => pinned || hovered || tour;

  function applyFocus(target) {
    schema.classList.toggle('focusing', !!target);
    const onSkills = new Set();
    const onExps = new Set();
    if (target) {
      if (target.closest('.skills')) {
        onSkills.add(target.dataset.id);
        relationsOf(target).forEach(id => onExps.add(id));
      } else {
        onExps.add(target.dataset.id);
        skills.filter(s => relationsOf(s).includes(target.dataset.id)).forEach(s => onSkills.add(s.dataset.id));
      }
    }
    skills.forEach(s => s.classList.toggle('on', onSkills.has(s.dataset.id)));
    exps.forEach((e, id) => e.classList.toggle('on', onExps.has(id)));
    svg.querySelectorAll('[data-skill]').forEach(el => {
      const on = !!target && onSkills.has(el.dataset.skill) && onExps.has(el.dataset.exp)
        && (target.closest('.skills') ? el.dataset.skill === target.dataset.id : el.dataset.exp === target.dataset.id);
      el.classList.toggle('on', on);
    });
    skills.forEach(s => s.setAttribute('aria-pressed', String(pinned === s)));
  }

  for (const s of skills) {
    s.addEventListener('mouseenter', () => { hovered = s; applyFocus(current()); });
    s.addEventListener('mouseleave', () => { hovered = null; applyFocus(current()); });
    s.addEventListener('focus', () => { hovered = s; applyFocus(current()); });
    s.addEventListener('blur', () => { hovered = null; applyFocus(current()); });
    s.addEventListener('click', () => { pinned = pinned === s ? null : s; applyFocus(current()); });
  }
  for (const e of exps.values()) {
    e.addEventListener('mouseenter', () => { hovered = e; applyFocus(current()); });
    e.addEventListener('mouseleave', () => { hovered = null; applyFocus(current()); });
    e.addEventListener('focus', () => { hovered = e; applyFocus(current()); });
    e.addEventListener('blur', () => { hovered = null; applyFocus(current()); });
    e.addEventListener('click', () => {
      document.getElementById(e.dataset.id)?.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    });
  }

  // 손대기 전까지는 경험을 하나씩 돌아가며 강조해, 관계도를 어떻게 읽는지 먼저 보여 준다.
  // 마우스를 올리거나 포커스·터치하면 그 뒤로는 멈춘다. 화면 밖이거나 탭이 가려지면 쉰다.
  const tourOrder = [...exps.values()];
  let tourIndex = -1;
  let tourTimer = 0;
  let tourStopped = reduceMotion.matches;
  let schemaVisible = false;
  const stopTour = () => {
    tourStopped = true;
    clearTimeout(tourTimer);
    if (tour) { tour = null; applyFocus(current()); }
  };
  const tourTick = () => {
    if (tourStopped) return;
    if (schemaVisible && !document.hidden && wide.matches) {
      tourIndex = (tourIndex + 1) % (tourOrder.length + 1);
      tour = tourOrder[tourIndex] || null; // 한 바퀴 끝에 한 번은 전체 관계를 보여 준다
      applyFocus(current());
    }
    tourTimer = setTimeout(tourTick, 2400);
  };
  ['pointerenter', 'focusin', 'touchstart'].forEach(ev => schema.addEventListener(ev, stopTour, { once: true, passive: true }));
  new IntersectionObserver(([entry]) => { schemaVisible = entry.isIntersecting; }, { threshold: 0.3 }).observe(schema);

  // 폰트가 준비된 뒤 한 번만 선을 그리며 등장시키고, 이후에는 크기가 실제로 바뀔 때만 다시 그린다.
  let ready = false;
  let lastSize = '';
  const sizeKey = () => { const r = schema.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; };
  const redraw = () => {
    if (!ready) return;
    const key = sizeKey();
    if (key === lastSize) return;
    lastSize = key;
    draw(false);
  };
  new ResizeObserver(redraw).observe(schema);
  wide.addEventListener('change', () => { lastSize = ''; redraw(); });
  document.fonts.ready.then(() => {
    ready = true;
    lastSize = sizeKey();
    draw(!drawnOnce);
    drawnOnce = true;
    if (!tourStopped) tourTimer = setTimeout(tourTick, 1600);
  });
})();

// 실제 화면: 탭으로 화면을 바꾼다. ←, →, Home, End 키도 쓸 수 있다.
document.querySelectorAll('[data-screens]').forEach((fig) => {
  const tabs = [...fig.querySelectorAll('[role="tab"]')];
  const select = (tab, focus) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls'));
      panel.hidden = !on;
      if (on) { panel.classList.remove('enter'); void panel.offsetWidth; panel.classList.add('enter'); }
    }
    if (focus) tab.focus();
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      select(tabs[(next + tabs.length) % tabs.length], true);
    });
  });
});

// 수집 경로 따라가기: 그림이 화면에 있는 동안 수집 순서대로 상자와 선을 강조한다.
(() => {
  const fig = document.querySelector('[data-trace-fig]');
  if (!fig || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const groups = [1, 2, 3, 4, 5].map((n) => [...fig.querySelectorAll(`[data-trace="${n}"]`)]);
  let i = -1;
  let timer = 0;
  const clear = () => groups.flat().forEach((el) => el.classList.remove('trace'));
  const tick = () => {
    clear();
    i = (i + 1) % (groups.length + 1); // 마지막 한 칸은 쉬는 시간
    groups[i]?.forEach((el) => el.classList.add('trace'));
    timer = setTimeout(tick, i === groups.length ? 1400 : 800);
  };
  new IntersectionObserver(([entry]) => {
    clearTimeout(timer);
    if (entry.isIntersecting) tick(); else { clear(); i = -1; }
  }, { threshold: 0.4 }).observe(fig);
})();
