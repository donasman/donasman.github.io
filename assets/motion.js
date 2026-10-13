// 움직이는 설명: 화면에 들어오면 한 번 재생하고, 끝나면 "다시 보기"를 보여 준다.
// 동작 줄이기 설정이면 움직이지 않고 마지막 상태만 보여 준다.
(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const scenes = {
    // FantaSteel: 발주 100t에 60t 입고 두 건이 동시에 들어온 경우 (goods-receipt.spec.ts의 시나리오)
    receipt: {
      reset(c) {
        c.clearNodes();
        c.req('a', '', '준비');
        c.req('b', '', '준비');
        c.out('remain', '100t');
        c.out('lots', '0개');
        c.cap('같은 발주 품목에 60t 입고가 동시에 두 번 들어온 경우입니다.');
      },
      steps: [
        [500, (c) => { c.req('a', 'run', '진행'); c.req('b', '', '잠금 대기'); c.at(1, 'A'); c.cap('A가 먼저 발주 행을 FOR UPDATE로 잠급니다. B는 같은 행을 잠그려다 기다립니다.'); }],
        [1700, (c) => { c.at(2, 'A'); c.cap('미입고량 100t이 60t보다 많아 A는 통과합니다.'); }],
        [2800, (c) => { c.at(3, 'A'); c.flash('lots', '1개'); c.cap('입고를 저장하고 원료 LOT 하나를 만듭니다.'); }],
        [3900, (c) => { c.at(4, 'A'); c.flash('remain', '40t'); c.cap('발주 상태를 부분 입고로 바꿉니다. 남은 미입고량은 40t입니다.'); }],
        [5000, (c) => { c.at(5, 'A'); c.cap('작업 로그와 알림을 같은 트랜잭션에 남깁니다.'); }],
        [6100, (c) => { c.req('a', 'ok', '커밋'); c.req('b', 'run', '진행'); c.at(1, 'B'); c.cap('A가 커밋하며 잠금이 풀리고, B가 발주 행을 잠급니다.'); }],
        [7300, (c) => { c.at(2, 'B', 'no'); c.req('b', 'no', '거부'); c.cap('B가 다시 읽은 미입고량은 40t이라, 60t 입고는 PUR-003으로 거부되고 롤백됩니다.'); }],
        [8800, (c) => { c.clearNodes(); c.cap('결과: A만 입고되고 원료 LOT은 1개입니다. 이 시나리오를 테스트로 고정했습니다.'); }],
      ],
    },

    // LessonTree: blue가 운영 중일 때 green으로 전환하는 배포 (cicd.yml의 순서)
    deploy: {
      reset(c) {
        c.clearNodes();
        c.svg.setAttribute('class', 'dg traffic to-blue');
        c.out('blue', 'v1 운영 중');
        c.out('green', '비어 있음');
        c.cap('blue(8080)가 요청을 받는 중에 main에 새 버전이 반영된 경우입니다.');
      },
      steps: [
        [600, (c) => { c.at(1); c.cap('/server/env로 지금 요청을 받는 쪽을 확인합니다. 지금은 blue입니다.'); }],
        [1800, (c) => { c.at(2); c.svg.classList.add('green-up'); c.out('green', 'v2 기동 중'); c.cap('반대쪽인 green(9090)에 새 이미지로 컨테이너를 띄웁니다. 요청은 아직 blue가 받습니다.'); }],
        [3100, (c) => { c.at(3); c.svg.classList.add('hc-run'); c.out('green', '헬스체크 확인 중'); c.cap('green의 /server/env를 10초 간격으로 최대 3번 확인합니다.'); }],
        [4300, (c) => { c.svg.classList.replace('hc-run', 'hc-ok'); c.out('green', '헬스체크 통과'); }],
        [5100, (c) => { c.at(4); c.svg.classList.replace('to-blue', 'to-green'); c.out('green', 'v2 운영 중'); c.cap('Nginx 대상을 green으로 바꾸고 reload합니다. 새 요청은 green이 받습니다.'); }],
        [6400, (c) => { c.at(5); c.svg.classList.add('blue-off'); c.out('blue', '중지, 삭제'); c.cap('이전 blue 컨테이너를 멈추고 지웁니다.'); }],
        [7700, (c) => { c.clearNodes(); c.cap('다음 배포는 green에서 blue로, 같은 순서를 반대로 밟습니다.'); }],
      ],
    },

    // 실무: 중간에 실패했을 때 처음부터 다시 도는 방식과 저장 시점부터 이어 가는 방식
    resume: (() => {
      const N = 20;
      const FAIL = 12;
      const SAVE_EVERY = 5;
      const STEP = 110;
      const cells = (c, row) => [...c.root.querySelectorAll(`[data-row="${row}"] .bar i`)];
      const st = (c, row, text, ok) => {
        const el = c.root.querySelector(`[data-row="${row}"] .bar-st`);
        el.textContent = text;
        el.classList.toggle('ok', !!ok);
      };
      const fill = (c, row, k) => {
        const cell = cells(c, row)[k];
        cell.classList.remove('fail');
        cell.classList.add('on');
        if (row === 'after' && (k + 1) % SAVE_EVERY === 0) cell.classList.add('save');
      };

      const steps = [];
      const t0 = 300;
      steps.push([t0, (c) => { st(c, 'before', '처리 중'); st(c, 'after', '처리 중'); }]);
      for (let k = 0; k < FAIL; k++) {
        steps.push([t0 + k * STEP, (c) => { fill(c, 'before', k); fill(c, 'after', k); }]);
      }
      const tFail = t0 + FAIL * STEP;
      steps.push([tFail, (c) => {
        for (const row of ['before', 'after']) cells(c, row)[FAIL].classList.add('fail');
        st(c, 'before', '실패');
        st(c, 'after', '실패');
        c.cap('처리 도중 실패했습니다.');
      }]);
      const tRetry = tFail + 900;
      const lastSave = Math.floor(FAIL / SAVE_EVERY) * SAVE_EVERY;
      steps.push([tRetry, (c) => {
        cells(c, 'before').forEach((el) => el.classList.remove('on', 'fail'));
        cells(c, 'after').slice(lastSave).forEach((el) => el.classList.remove('on', 'fail', 'save'));
        st(c, 'before', '처음부터 다시');
        st(c, 'after', '저장 시점부터');
        c.cap('예전에는 실패 기록이 없어 처음부터 다시 돌았고, 바꾼 뒤에는 마지막 저장 시점부터 이어 갑니다.');
      }]);
      for (let k = 0; k < N; k++) steps.push([tRetry + 200 + k * STEP, (c) => fill(c, 'before', k)]);
      for (let k = lastSave; k < N; k++) steps.push([tRetry + 200 + (k - lastSave) * STEP, (c) => fill(c, 'after', k)]);
      steps.push([tRetry + 200 + (N - lastSave) * STEP, (c) => st(c, 'after', '완료', true)]);
      steps.push([tRetry + 200 + N * STEP, (c) => {
        st(c, 'before', '완료', true);
        c.cap('중간에 멈춰도 약 3,000만 건을 처음부터 다시 돌리지 않습니다.');
      }]);
      steps.sort((a, b) => a[0] - b[0]);

      return {
        reset(c) {
          c.root.querySelectorAll('.bar').forEach((bar) => {
            if (!bar.children.length) bar.append(...Array.from({ length: N }, () => document.createElement('i')));
            bar.querySelectorAll('i').forEach((el) => { el.className = ''; });
          });
          st(c, 'before', '준비');
          st(c, 'after', '준비');
          c.cap('같은 작업이 중간에 실패했을 때 두 방식이 어떻게 다시 도는지 비교합니다.');
        },
        steps,
      };
    })(),
  };

  document.querySelectorAll('[data-sim]').forEach((root) => {
    const scene = scenes[root.dataset.sim];
    if (!scene) return;
    const capEl = root.querySelector('.sim-cap');
    const nodes = [...root.querySelectorAll('.node2[data-step]')];
    let timers = [];

    const c = {
      root,
      svg: root.querySelector('svg.traffic'),
      cap(text) { capEl.textContent = text; },
      out(name, value) {
        const el = root.querySelector(`[data-out="${name}"]`);
        if (el) el.textContent = value;
        return el;
      },
      flash(name, value) {
        const el = this.out(name, value);
        if (!el || reduce) return;
        el.classList.add('flash');
        timers.push(setTimeout(() => el.classList.remove('flash'), 900));
      },
      req(id, state, text) {
        const el = root.querySelector(`[data-req="${id}"]`);
        el.classList.remove('run', 'ok', 'no');
        if (state) el.classList.add(state);
        el.querySelector('.st').textContent = text;
      },
      clearNodes() {
        nodes.forEach((n) => { n.classList.remove('at', 'no'); delete n.dataset.who; });
      },
      at(step, who, state = 'at') {
        this.clearNodes();
        const n = nodes.find((x) => x.dataset.step === String(step));
        if (!n) return;
        n.classList.add(state);
        if (who) n.dataset.who = who;
      },
    };

    const finish = () => { root.classList.remove('playing'); root.classList.add('done'); };
    const play = () => {
      timers.forEach(clearTimeout);
      timers = [];
      root.classList.remove('done');
      scene.reset(c);
      if (reduce) {
        scene.steps.forEach(([, fn]) => fn(c));
        finish();
        return;
      }
      root.classList.add('playing');
      let end = 0;
      for (const [ms, fn] of scene.steps) {
        timers.push(setTimeout(() => fn(c), ms));
        end = Math.max(end, ms);
      }
      timers.push(setTimeout(finish, end + 400));
    };

    root.querySelector('.replay')?.addEventListener('click', play);
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      play();
    }, { threshold: 0.35 });
    io.observe(root);
  });
})();

// 쇼릴: 사이트 테마에 맞는 영상을 고르고, 화면에 보일 때만 재생한다.
// 동작 줄이기 설정이면 자동 재생하지 않고, 누르면 재생한다.
(() => {
  const video = document.querySelector('.reel-video');
  if (!video) return;
  const btn = document.querySelector('.reel-toggle');
  const dark = window.matchMedia('(prefers-color-scheme: dark)');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let userPaused = reduce;
  let visible = false;

  const pick = () => {
    const theme = dark.matches ? 'dark' : 'light';
    const src = video.dataset[theme];
    if (video.getAttribute('src') === src) return;
    const t = video.currentTime;
    video.poster = video.dataset[theme === 'dark' ? 'posterDark' : 'posterLight'];
    video.src = src;
    video.currentTime = t;
    if (visible && !userPaused) video.play().catch(() => {});
  };
  const label = () => { btn.textContent = video.paused ? '재생' : '일시 정지'; };
  const toggle = () => {
    if (video.paused) { userPaused = false; video.play().catch(() => {}); } else { userPaused = true; video.pause(); }
  };

  pick();
  dark.addEventListener('change', pick);
  btn.addEventListener('click', toggle);
  video.addEventListener('click', toggle);
  video.addEventListener('play', label);
  video.addEventListener('pause', label);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !userPaused) video.play().catch(() => {});
    else if (!visible) video.pause();
  }, { threshold: 0.4 }).observe(video);
  label();
})();
