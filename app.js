/*
 * 3차 전문가 조사 (델파이) 웹 설문 - 재평가
 * - 외부 라이브러리·CDN·분석 도구 없음 (보안 심사와 기관망 차단 위험 최소화)
 * - 화면에 넣는 모든 글자는 textContent로만 넣음 (스크립트 삽입 방지)
 * - 개인 링크의 토큰은 주소창에서 바로 지우고 탭 안에서만 보관
 * - 샘플은 이 기기 브라우저에만 임시 저장. 실제 운영에서는 Api 부분만 서버 연동으로 교체
 */
(() => {
  'use strict';

  const CFG = window.SURVEY_CONFIG || {};
  const SCHEMA = 'r3-4-v1';
  let S = null, META = { project: (window.SURVEY_CONFIG || {}).title || 'AI 기반 초연결 지능도시', title: (window.SURVEY_CONFIG || {}).subtitle || '전문가 조사', round: ((window.SURVEY_CONFIG || {}).round ? (window.SURVEY_CONFIG || {}).round + '차' : '3차'), period: (window.SURVEY_CONFIG || {}).surveyPeriod || '', nsvc: (window.SURVEY_CONFIG || {}).serviceCount || 40, institution: (window.SURVEY_CONFIG || {}).institution || '' }, C = [], LEGACY = [], N = 0, CID = [], PAIRS = [], OPEN = true;
  function applyConfig(cfg) {
    if (cfg.schemaVersion !== SCHEMA || cfg.criteria.length !== 4 || !Array.isArray(cfg.round1Criteria) || cfg.round1Criteria.length !== 6) throw new Error('schema_mismatch');
    S = cfg; const _m = cfg.meta || {}; META = Object.assign({}, _m); if (!META.project) META.project = CFG.title || 'AI 기반 초연결 지능도시'; if (!META.title) META.title = CFG.subtitle || '전문가 조사'; if (!META.round) META.round = CFG.round ? CFG.round + '차' : '3차'; if (CFG.serviceCount) META.nsvc = CFG.serviceCount; C = cfg.criteria; LEGACY = cfg.round1Criteria; N = C.length; CID = C.map(c => c.id);
    if (CFG.surveyPeriod) META.period = CFG.surveyPeriod; S.services = CFG.services || [];
    PAIRS = [];
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) PAIRS.push([i, j]);
  }
  const CAT = [[/교통|물류|모빌리티/, '#3767A6', 'T'], [/방범|방재|안전/, '#A0495E', 'S'], [/환경|에너지|수자원/, '#2F7D57', 'E'], [/보건|의료|복지|주거/, '#7A5BA8', 'W'], [/시설물|기반시설/, '#8A6A2F', 'I'], [/행정|근로|고용|문화|관광|기타/, '#4F6176', 'G']];
  function catOf(name) { const x = CAT.find(c => c[0].test(name || '')) || [null, '#4F6176', 'G']; return { name: name || '기타', color: x[1], icon: x[2] }; }
  const pkey = (i, j) => CID[i] + ':' + CID[j];
  const RI = { 3: 0.58, 4: 0.90, 5: 1.12, 6: 1.24, 7: 1.32, 8: 1.41, 9: 1.45 };
  const P1_LABELS = ['전혀 적절하지 않음', '적절하지 않음', '보통', '적절함', '매우 적절함'];
  const INT_SHORT = { 2: '', 3: '약간', 4: '', 5: '중요', 6: '', 7: '매우', 8: '', 9: '극히' };
  const INT_NAME = { 2: '동등~약간 중요 사이', 3: '약간 중요', 4: '약간 중요~중요 사이', 5: '중요', 6: '중요~매우 중요 사이', 7: '매우 중요', 8: '매우 중요~극히 중요 사이', 9: '극히 중요' };
  const TOKEN_RE = /(?:^|[#?&])t=([A-Za-z0-9_-]{16,64})/;
  const SKEY = 'delphi3:r3-4-v1:token';
  const KEY = t => 'delphi3:r3-4-v1:' + t;

  /* ---------- 서버 통신 (구글 앱스 스크립트 웹앱) ---------- */
  function requestUrl() {
    const u = new URL(CFG.api, location.href);
    u.searchParams.set('_cb', Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
    return u.href;
  }
  async function rpc(action, payload, timeoutMs) {
    const ctl = new AbortController();
    const tm = setTimeout(() => ctl.abort(), timeoutMs || 45000);
    try {
      const res = await fetch(requestUrl(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action, schemaVersion: SCHEMA }, payload || {})), signal: ctl.signal, cache: 'no-store', redirect: 'follow' });
      if (!res.ok) throw new Error('http');
      return await res.json();
    } finally { clearTimeout(tm); }
  }
  const Api = {
    config: () => rpc('config'),
    login: (name, p4) => rpc('login', { name, p4 }),
    load: t => rpc('load', { token: t }),
    save: (t, data) => rpc('save', { token: t, data }),
    submit: (t, data, order) => rpc('submit', { token: t, data, order }, 45000),
    beacon(t, data) { try { navigator.sendBeacon(requestUrl(), new Blob([JSON.stringify({ action: 'save', token: t, data })], { type: 'text/plain;charset=utf-8' })); } catch (e) { /* 무시 */ } },
    clear(t) {
      try { localStorage.removeItem(KEY(t)); } catch (e) { /* 무시 */ }
      try { sessionStorage.removeItem(SKEY); } catch (e) { /* 무시 */ }
    }
  };
  function localBackup() { try { localStorage.setItem(KEY(token), JSON.stringify(st)); } catch (e) { /* 저장 공간 부족 등 */ } }
  function readLocal(t) { try { return JSON.parse(localStorage.getItem(KEY(t)) || 'null'); } catch (e) { return null; } }

  /* ---------- 유틸 ---------- */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'style') Object.assign(el.style, v);
        else if (k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'value') el[k] = v;
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    add(el, kids);
    return el;
  }
  function add(el, kids) {
    for (const c of kids) {
      if (c == null || c === false) continue;
      if (Array.isArray(c)) add(el, c);
      else el.append(c instanceof Node ? c : String(c));
    }
  }
  const NS = 'http://www.w3.org/2000/svg';
  const ICONS = {
    arrowL: ['M15 18l-6-6 6-6'],
    arrowR: ['M9 18l6-6-6-6'],
    check: ['M20 6L9 17l-5-5'],
    print: ['M6 9V3h12v6', 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2', 'M6 14h12v7H6z'],
    list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3.5 6h.01', 'M3.5 12h.01', 'M3.5 18h.01'],
    doc: ['M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z', 'M14 3v6h6', 'M8 13h8', 'M8 17h5'],
    lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
    mark: ['M3 21h18', 'M5 21V11l4-2v12', 'M9 21V5l6-2v18', 'M15 21V10l4 2v9', 'M12 8h.01', 'M12 12h.01', 'M12 16h.01'],
    T: ['M5 16V6a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v10', 'M5 11h14', 'M5 16h14v2.5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5V18H8v.5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5z', 'M8.5 13.5h.01', 'M15.5 13.5h.01'],
    S: ['M12 21s7.5-3.6 7.5-9.5V5.2L12 2.5 4.5 5.2v6.3C4.5 17.4 12 21 12 21z', 'M9 11.5l2.2 2.2L15.5 9.5'],
    E: ['M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z', 'M2 21c0-3 1.9-5.4 5.1-6 2.4-.5 4.9-2 5.9-3'],
    W: ['M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z'],
    G: ['M3 21h18', 'M5 21V10', 'M19 21V10', 'M9.5 21v-7', 'M14.5 21v-7', 'M2 10l10-7 10 7'],
    I: ['M2 18h20', 'M5 18v-5.5', 'M19 18v-5.5', 'M12 18v-7.5', 'M2 12.5c4.5-5.5 15.5-5.5 20 0']
  };
  function icon(name, opts) {
    const o = opts || {};
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', o.color || 'currentColor');
    s.setAttribute('stroke-width', o.sw || '1.9');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    for (const d of ICONS[name]) { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); s.append(p); }
    return s;
  }
  function normName(v) { return String(v || '').normalize('NFC').replace(/[\s()（）:·.\-]/g, '').toLowerCase(); }
  const LOCK_KEY = 'delphi3:lock';
  function lockState() { try { return JSON.parse(localStorage.getItem(LOCK_KEY) || '{"n":0,"until":0}'); } catch (e) { return { n: 0, until: 0 }; } }
  function setLock(v) { try { localStorage.setItem(LOCK_KEY, JSON.stringify(v)); } catch (e) { /* 무시 */ } }
  function hashStr(s) { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
  function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffled(arr, seed) { const a = arr.slice(); const r = mulberry32(seed); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function ymd(d) { return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); }
  function hm(d) { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function fmtDT(iso) { const d = new Date(iso); return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${hm(d)}`; }
  function badge(t) { return h('span', { class: 'badge', 'aria-hidden': 'true' }, shortId(t)); }

  /* ---------- 상태 ---------- */
  let token = null, R = null, st = null, ORDER = [];
  const app = document.getElementById('app');
  const ui = {};

  function blank() {
    return { v: 2, schemaVersion: SCHEMA, consent: false, step: 'intro', p2: {}, p3: {}, p3note: {}, p3view: 'list', p3cur: 0, p3filter: 'all', crAck: false, submittedAt: null, receipt: null, editedAfterSubmit: false, updatedAt: null };
  }

  const p1ItemCount = () => CID.filter(id => st.p1[id] && st.p1[id].score).length;
  const p1Count = () => p1ItemCount() + (st.overallScore >= 1 && st.overallScore <= 5 ? 1 : 0);
  const P1TOTAL = () => N + 1;
  const shortId = id => String(id).replace(/^R[0-9]/, '');
  const wa = s => { const c = String(s).charCodeAt(String(s).length - 1); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 ? '과' : '와'; };
  const pairDone = k => { const a = st.p2[k]; return !!a && (a.side === 'E' || (!!a.side && !!a.v)); };
  const p2Count = () => PAIRS.filter(([i, j]) => pairDone(pkey(i, j))).length;
  const svcCount = sid => CID.filter(id => st.p3[sid] && st.p3[sid][id]).length;
  const p3Done = () => ORDER.filter(s => svcCount(s.id) === N).length;
  const p3Ratings = () => ORDER.reduce((n, s) => n + svcCount(s.id), 0);
  const TOTAL = () => PAIRS.length + ORDER.length * N;
  const overall = () => (p2Count() + p3Ratings()) / TOTAL();
  const allDone = () => p2Count() === PAIRS.length && p3Done() === ORDER.length;

  function ahp() {
    if (p2Count() < PAIRS.length) return null;
    const A = [];
    for (let i = 0; i < N; i++) { A.push([]); for (let j = 0; j < N; j++) A[i].push(i === j ? 1 : 0); }
    for (const [i, j] of PAIRS) {
      const a = st.p2[pkey(i, j)];
      const x = a.side === 'L' ? a.v : a.side === 'R' ? 1 / a.v : 1;
      A[i][j] = x; A[j][i] = 1 / x;
    }
    let w = new Array(N).fill(1 / N);
    for (let it = 0; it < 500; it++) {
      const nw = A.map(row => row.reduce((s, v, k) => s + v * w[k], 0));
      const sum = nw.reduce((a, b) => a + b, 0);
      const nn = nw.map(v => v / sum);
      const diff = nn.reduce((s, v, k) => s + Math.abs(v - w[k]), 0);
      w = nn;
      if (diff < 1e-13) break;
    }
    const Aw = A.map(row => row.reduce((s, v, k) => s + v * w[k], 0));
    const lambda = Aw.reduce((s, v, i) => s + v / w[i], 0) / N;
    const CI = (lambda - N) / (N - 1);
    const CR = Math.max(0, CI / RI[N]);
    const dev = PAIRS.map(([i, j], idx) => { const a = A[i][j]; const implied = w[i] / w[j]; return { i, j, idx, a, implied, d: Math.abs(Math.log(a / implied)) }; }).sort((x, y) => y.d - x.d);
    return { w, lambda, CI, CR, dev };
  }
  function ratioText(i, j, x, approx) {
    if (x > 1.05) return `${shortId(CID[i])} 쪽 ${approx ? '약 ' + x.toFixed(1) : Math.round(x)}`;
    if (x < 1 / 1.05) return `${shortId(CID[j])} 쪽 ${approx ? '약 ' + (1 / x).toFixed(1) : Math.round(1 / x)}`;
    return '같음';
  }

  /* ---------- 저장 (이 기기에 즉시 + 서버에 1.5초 뒤) ---------- */
  let saveTimer = null, saving = false, dirty = false, retryN = 0, lastSent = 0;
  // 서버 저장은 최대 8초에 한 번 (입력은 이 기기에 즉시 보관)
  function schedule(ms) { const wait = Math.max(ms, 8000 - (Date.now() - lastSent)); clearTimeout(saveTimer); saveTimer = setTimeout(flush, wait); }
  function persist() {
    st.updatedAt = new Date().toISOString();
    if (st.submittedAt && st.step !== 'done') st.editedAfterSubmit = true;
    localBackup();
    dirty = true;
    setSave('busy');
    schedule(1500);
    refreshChrome();
  }
  function persistQuiet() { // 화면 이동 정보 저장 (수정 표시 없이)
    if (!token || !st) return;
    localBackup();
    dirty = true;
    schedule(1500);
  }
  async function flush() {
    if (!dirty || !token || !st) return;
    if (!OPEN) { dirty = false; setSave('closed'); return; }
    if (saving) { schedule(800); return; }
    saving = true; dirty = false; lastSent = Date.now();
    let err = null;
    try {
      const r = await Api.save(token, st);
      if (!r || !r.ok) err = (r && r.error) || 'server';
    } catch (e) { err = 'network'; }
    saving = false;
    if (!err) { retryN = 0; setSave(dirty ? 'busy' : 'ok'); if (dirty) schedule(800); return; }
    if (err === 'schema_mismatch' || err === 'revision_not_ready') { OPEN = false; dirty = false; renderBoot('수정된 평가항목이 준비 중이거나 버전이 변경되어 저장을 중단했습니다. 입력 내용은 이 기기에 보관되어 있습니다.'); return; }
    if (err === 'closed') { OPEN = false; setSave('closed'); return; }
    if (err === 'invalid_token') { setSave('err'); return; }
    dirty = true; retryN++;
    setSave('err');
    schedule(Math.min(30000, 3000 * retryN));
  }
  window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirty) flush(); });
  window.addEventListener('pagehide', () => { if (dirty && token && st && OPEN) Api.beacon(token, st); });
  function setSave(state) {
    if (!ui.save) return;
    ui.save.className = 'save-state ' + (state === 'ok' ? 'ok' : state === 'busy' ? 'busy' : state === 'err' ? 'err' : '');
    ui.save.textContent = state === 'busy' ? '저장 중…' : state === 'err' ? '저장 지연 · 다시 시도 중' : state === 'closed' ? '마감되어 저장되지 않음' : '자동 저장됨 ' + hm(new Date());
    ui.save.title = state === 'err' ? '입력 내용은 이 기기에 보관되어 있고, 연결되면 자동으로 저장됩니다.' : '';
  }

  /* ---------- 공통 화면 요소 ---------- */
  const STEPS = [
    { id: 'p2', n: 1, pre: '평가항목 ', name: '중요도 재평가', cnt: () => `${p2Count()}/${PAIRS.length}`, frac: () => p2Count() / PAIRS.length },
    { id: 'p3', n: 2, pre: '후보서비스 ', name: '재평가', cnt: () => `${p3Done()}/${ORDER.length}`, frac: () => p3Ratings() / (ORDER.length * N) },
    { id: 'review', n: 3, pre: '확인·', name: '제출', cnt: () => (st.submittedAt && !st.editedAfterSubmit ? '제출 완료' : allDone() ? '제출 가능' : '미제출'), frac: () => (st.submittedAt && !st.editedAfterSubmit ? 1 : 0) }
  ];

  function header() {
    ui.save = h('span', { class: 'save-state', role: 'status', 'aria-live': 'polite' }, st && st.updatedAt ? '자동 저장됨 ' + hm(new Date(st.updatedAt)) : '자동 저장');
    if (st && st.updatedAt) ui.save.classList.add('ok');
    const showSteps = st && OPEN && ['p1', 'p2', 'p3', 'review', 'done'].includes(st.step);
    ui.steps = {};
    let stepper = null;
    if (showSteps) {
      stepper = h('nav', { class: 'stepper', 'aria-label': '조사 단계' }, STEPS.map(s => {
        const small = h('small', null, s.cnt());
        const bar = h('i');
        const cur = st.step === s.id || (s.id === 'review' && st.step === 'done');
        const btn = h('button', { class: 'step', type: 'button', 'aria-current': cur ? 'step' : null, onclick: () => go(s.id) },
          h('span', { class: 'n' }, String(s.n)),
          h('span', { class: 'l' }, h('b', null, h('span', { class: 'long' }, s.pre), s.name), small),
          h('span', { class: 'bar', 'aria-hidden': 'true' }, bar));
        ui.steps[s.id] = { small, bar, btn, s };
        return btn;
      }));
    }
    return h('header', { class: 'hdr' }, h('div', { class: 'wrap' },
      h('div', { class: 'hdr-top' },
        h('div', { class: 'brand' },
          h('span', { class: 'mark' }, icon('mark', { color: '#fff', sw: '2.2' })),
          h('span', { class: 't1' }, META.project),
          h('span', { class: 't2' }, META.title + ' 재평가'),
          h('span', { class: 'round' }, META.round)),
        st ? h('div', { class: 'hdr-right' }, ui.save, h('span', { class: 'who' }, `${R.name} 위원님`), h('button', { type: 'button', class: 'link out', onclick: logout }, '나가기')) : null),
      stepper));
  }

  function refreshChrome() {
    if (!ui.steps) return;
    for (const id in ui.steps) {
      const u = ui.steps[id];
      u.small.textContent = u.s.cnt();
      u.bar.style.width = Math.round(u.s.frac() * 100) + '%';
      u.btn.classList.toggle('done', u.s.frac() >= 1);
      const locked = gate(id) !== id;
      u.btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
      u.btn.style.opacity = locked ? '.45' : '';
      u.btn.title = locked ? '앞 단계를 먼저 완료해 주십시오' : '';
    }
    if (ui.mid) ui.mid();
  }

  function footer() {
    return h('footer', { class: 'foot no-print' }, h('div', { class: 'wrap' },
      h('span', null, `${META.project} ${META.title} 연구진`),
      META.contact ? h('span', null, `문의 ${META.contact}`) : null,
      h('span', null, '본인 확인 정보(성명·휴대폰 뒷자리)는 다른 분과 공유하지 마십시오.')));
  }

  function navbar(prev, next, mid) {
    const midEl = h('div', { class: 'mid', 'aria-live': 'polite' });
    ui.mid = mid ? () => { midEl.replaceChildren(...[].concat(mid())); } : null;
    const nb = h('nav', { class: 'navbar no-print', 'aria-label': '이전·다음' }, h('div', { class: 'wrap' },
      prev ? h('button', { class: 'btn', type: 'button', onclick: prev.on, disabled: prev.disabled || null }, icon('arrowL'), h('span', { class: 'lbl-l' }, prev.label), h('span', { class: 'lbl-s' }, prev.short || '이전')) : h('span'),
      midEl,
      next ? h('button', { class: 'btn primary', type: 'button', onclick: next.on, id: 'navNext', disabled: next.disabled || null }, h('span', { class: 'lbl-l' }, next.label), h('span', { class: 'lbl-s' }, next.short || '다음'), icon('arrowR')) : null));
    return nb;
  }

  function pageHead(eyebrow, title, desc) {
    return h('div', { class: 'page-head' },
      h('p', { class: 'eyebrow' }, eyebrow),
      h('h2', { id: 'pageTitle', tabindex: '-1' }, title),
      desc ? h('p', { class: 'desc' }, desc) : null);
  }

  /* ---------- 화면 이동 ---------- */
  /* 1부 → 2부 → 3부 순서 잠금: 앞 단계를 모두 응답해야 다음 단계가 열린다 */
  const GATE_MSG = {
    p2: '1부(평가항목 중요도 재평가)를 먼저 완료해 주십시오. 1부의 비교를 모두 마치시면 2부가 열립니다.'
  };
  function gate(step) {
    if (step === 'p3' || step === 'review') {
      if (p2Count() < PAIRS.length) return 'p2';
    }
    return step;
  }
  function go(step, after) {
    if (!st.consent && step !== 'intro') { step = 'intro'; }
    const gated = gate(step);
    if (gated !== step) { ui.notice = GATE_MSG[gated]; step = gated; after = null; }
    if (!OPEN && step !== 'done') step = st.submittedAt ? 'done' : 'closed';
    st.step = step;
    persistQuiet();
    render();
    window.scrollTo(0, 0);
    const t = document.getElementById('pageTitle');
    if (t) t.focus({ preventScroll: true });
    if (after) requestAnimationFrame(after);
  }
  function nextUnfinished() {
    if (p2Count() < PAIRS.length) return 'p2';
    if (p3Done() < ORDER.length) return 'p3';
    return 'review';
  }

  function render() {
    ui.mid = null;
    const view = (VIEWS[st.step] || VIEWS.intro)();
    const wrapEl = h('div', { class: 'wrap' }, view.body);
    if (ui.notice) {
      wrapEl.prepend(h('div', { role: 'alert', style: { margin: '0 0 16px', padding: '14px 16px', border: '1px solid #E8B96A', background: '#FFF6E6', color: '#6B4300', borderRadius: '12px', fontWeight: '600', lineHeight: '1.55' } }, ui.notice));
      ui.notice = null;
    }
    const main = h('main', { id: 'main', tabindex: '-1' }, wrapEl);
    const nodes = [];
    nodes.push(header(), main, footer());
    if (view.nav) nodes.push(view.nav);
    app.replaceChildren(...nodes);
    refreshChrome();
    if (view.after) view.after();
  }

  /* ---------- 시작 화면 ---------- */
  function viewIntro() {
    const started = overall() > 0;
    const pct = Math.round(overall() * 100);
    const startBtn = h('button', { class: 'btn primary', type: 'button', disabled: !st.consent, onclick: () => go(st.submittedAt ? 'done' : nextUnfinished()) },
      st.submittedAt ? '제출 내역 보기' : started ? `이어서 응답하기 (${pct}% 진행)` : '조사 시작하기', icon('arrowR'));
    const cb = h('input', { type: 'checkbox', id: 'consent', checked: !!st.consent });
    cb.addEventListener('change', () => { st.consent = cb.checked; startBtn.disabled = !cb.checked; persist(); });
    const fact = (k, v) => h('div', null, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v));
    const part = (n, t, d, chips) => h('article', { class: 'card part' }, h('p', { class: 'pn' }, n), h('h3', null, t), h('p', null, d), h('div', { class: 'meta' }, chips.map(c => h('span', { class: 'chip' }, c))));
    return {
      body: [
        h('section', { class: 'card', 'aria-labelledby': 'pageTitle' },
          h('div', { class: 'hero' },
            h('div', null,
              h('p', { class: 'eyebrow' }, `${META.project} · ${META.title}`),
              h('h1', { id: 'pageTitle', tabindex: '-1' }, `${META.round} 조사에 `, h('em', null, '참여해 주셔서'), ' 감사합니다'),
              h('p', { class: 'lead' }, `2차 전문가 조사와 동일한 ${N}개 평가항목의 중요도와 후보 서비스 ${META.nsvc}종을 재평가해 주십시오.`)),
            h('div', { class: 'whoami' },
              h('div', { class: 'k' }, '응답자 확인'),
              h('div', { class: 'nm' }, `${R.name} 위원님`),
              h('div', { class: 'org' }, R.org),
              h('p', { class: 'not-me' }, '본인이 아니신가요? ', h('button', { type: 'button', class: 'link', onclick: logout }, '나가기'), META.contact ? ` · 문의 ${META.contact}` : ''))),
          h('div', { class: 'facts' },
            fact('조사 기간', META.period),
            fact('저장 방식', '자동 저장 · 다시 들어오면 이어서 응답'))),
        h('div', { class: 'parts' },
          part('1부', '평가항목 중요도 재평가', '두 항목씩 비교해 어느 쪽이 더 중요한지 답합니다. 2차 조사와 동일한 항목을 재평가합니다.', [`쌍대비교 ${PAIRS.length}개`, '응답 일관성 계산']),
          part('2부', '후보 서비스 재평가', `서비스 카드를 읽고 ${N}개 평가항목별로 점수를 매깁니다. 2차 조사와 동일한 서비스를 재평가합니다.`, [`${META.nsvc}종 × ${N}항목`, '카드를 보며 평가'])),
        h('section', { class: 'card privacy', 'aria-labelledby': 'pvt' },
          h('h3', { id: 'pvt' }, '개인정보 처리 안내'),
          h('dl', null,
            h('dt', null, '수집 항목'), h('dd', null, '2차 응답 내용과 응답 시각. 본인 확인에는 1차 조사 때 받은 성명과 휴대폰 번호 뒷 4자리를 쓰며, 새로 받는 개인정보는 없습니다.'),
            h('dt', null, '이용 목적'), h('dd', null, `${META.project} 전문가 조사(델파이) 결과 분석`),
            h('dt', null, '공개 범위'), h('dd', null, '결과는 통계로만 공개하며 개인별 응답은 공개하지 않습니다.'),
            h('dt', null, '보유 기간'), h('dd', null, META.retention || '연구 종료 후 파기')),
          h('label', { class: 'check', for: 'consent' }, cb, h('span', null, '위 내용을 확인했으며 조사에 참여합니다'))),
        h('div', { class: 'start-actions' }, startBtn,
          
          h('p', { class: 'note' }, '본인만 응답해 주십시오. 중간에 나가셔도 자동 저장되며, 다시 들어오시면 이어서 응답하실 수 있습니다.'))
      ],
      nav: null
    };
  }

  /* ---------- 1부: 기존 결과 참고 / 수정안 신규 평가 ---------- */
  const P1STAGES = ['개편 안내·1차 결과', '수정 항목·전체 구성 평가'];
  function p1Go(n) { st.p1stage = n > 0 ? 1 : 0; go('p1'); }
  function officialFigure(name, title) {
    return h('figure', { class: 'official-figure' },
      h('button', { type: 'button', class: 'official-open', 'aria-label': title + ' 크게 보기', onclick: () => openImg(name, title) }, encImg(name, title)),
      h('figcaption', null, title + ' · 그림을 누르면 확대할 수 있습니다.'));
  }
  function subcriteriaList(c, provenance) {
    return h('div', { class: 'subcriteria' }, (c.sub || []).map(x => h('section', { class: 'subcriterion' },
      h('h4', null, x.id + '. ' + x.name), h('p', null, x.question),
      h('p', { class: 'checks' }, h('b', null, '세부검토 기준  '), x.checks),
      provenance ? h('p', { class: 'origin' }, h('span', { class: 'chip small' }, x.action), ' ' + x.origin) : null)));
  }
  function frameworkTable(c, context, heading) {
    const base = context + '-' + c.id;
    const labels = ['세부항목', '평가정의·핵심질문', '세부검토 기준', '기존 항목'];
    const cell = (index, content, cls, rowId) => h('td', { headers: rowId + ' ' + base + '-h' + index, class: cls || '', role: 'cell' }, h('span', { class: 'mobile-cell-label', 'aria-hidden': 'true' }, labels[index]), h('div', { class: 'cell-value' }, content));
    return h('section', { class: 'framework-group' },
      heading ? h('div', { class: 'framework-group-head' }, h('h3', { id: base + '-title' }, shortId(c.id) + '. ' + c.name), h('p', null, c.researchDecision + ' · ' + c.change)) : null,
      h('table', { class: 'framework-table', role: 'table' },
        h('caption', { class: 'sr' }, c.name + '의 세부 평가체계 4개 항목'),
        h('colgroup', null, h('col', { class: 'col-item' }), h('col', { class: 'col-question' }), h('col', { class: 'col-check' }), h('col', { class: 'col-source' })),
        h('thead', { role: 'rowgroup' }, h('tr', { role: 'row' }, labels.map((t, i) => h('th', { scope: 'col', id: base + '-h' + i, role: 'columnheader' }, t)))),
        h('tbody', { role: 'rowgroup' }, (c.sub || []).map(x => {
          const rowId = base + '-' + x.id;
          return h('tr', { role: 'row' }, h('th', { scope: 'row', id: rowId, role: 'rowheader' }, x.id + '. ' + x.name),
            cell(1, x.question, '', rowId), cell(2, x.checks, '', rowId),
            cell(3, [h('span', { class: 'source-text' }, x.origin), h('span', { class: 'revision-tag revision-' + x.action }, x.action)], 'source-cell', rowId));
        }))));
  }
  function frameworkView() {
    return h('div', { class: 'official-framework expanded-framework' }, C.map(c => frameworkTable(c, 'intro', true)));
  }
  function overallQuestion() {
    const note = h('textarea', { id: 'p1note', placeholder: '누락된 내용, 여전히 중복되는 부분, 통합·분리가 필요한 내용 등을 자유롭게 적어 주십시오.', maxlength: '2000' });
    note.value = st.p1note || '';
    note.addEventListener('input', () => { st.p1note = note.value; persist(); });
    return h('section', { class: 'card revision-overall' },
      h('h3', { id: 'overall-question' }, '전체 구성의 적절성'),
      h('p', { class: 'desc' }, '개편된 4개 주요 항목과 16개 세부항목의 전체 구성이 우수 서비스 선정 기준으로 얼마나 적절합니까?'),
      scoreControl('overall-score', 'overall-question', () => st.overallScore, v => { st.overallScore = v; }),
      h('label', { class: 'field-label', for: 'p1note' }, '종합의견', h('small', null, '선택')), note);
  }
  function viewP1() {
    const stage = Number(st.p1stage) > 0 ? 1 : 0;
    const body = stage === 0 ? [
      pageHead('1부 · 평가체계 개편 안내', '전문가 의견을 반영해 평가항목을 재조정했습니다', '조정 경위와 개편된 평가체계를 먼저 확인하신 뒤, 아래의 기존 1차 전체 결과와 본인 응답을 참고해 주십시오.'),
      h('section', { class: 'card revision-intro' },
        h('h3', null, '6개 평가항목·24개 세부항목에서 4개 평가항목·16개 세부항목으로'),
        h('p', null, '1차 전문가 설문에서는 기존 6개 항목 모두 4·5점 응답 비율 75% 이상을 충족했습니다. 다만 자유의견에서 일부 평가항목과 세부항목의 중복 등이 제기되어, 연구진이 이를 검토하고 항목을 통합·조정했습니다.'),
        h('p', null, '이번 조사에서는 개편된 4개 항목과 전체 구성의 적절성을 새로 검토해 주십시오. 기존 점수를 유지하거나 조정하는 방식의 재평가가 아닙니다.'),
        h('p', { class: 'independent' }, '집단 결과에 맞출 의무는 없으며 위원님의 판단을 존중합니다.')),
      h('section', { class: 'r17-section' }, h('h3', null, '평가항목 개편구조'), officialFigure('xbf120d257aab4a88.bin', '우수서비스 평가체계 개편: 6개 평가항목 → 4개 평가항목')),
      h('section', { class: 'r17-section framework-section' },
        h('div', { class: 'framework-title' }, h('h3', null, '개편된 평가체계표'), h('button', { type: 'button', class: 'btn small', onclick: () => openImg('x9036e67da7a625db.bin', '연구진 제공 평가체계표 원본') }, '원본 이미지 크게 보기')),
        h('p', { class: 'table-guide' }, '아래 표는 개편된 4개 평가항목과 16개 세부항목의 정의·검토 기준을 설명합니다. 기존 A1~F4는 1차 세부항목의 기호입니다.'), frameworkView()),
      h('section', { class: 'r17-section first-round-reference' },
        h('h3', null, '기존 1차 전체 결과와 나의 1차 응답'),
        h('p', { class: 'note' }, '아래는 개편 전 6개 항목에 대한 1차 결과입니다(전체 N=' + META.n1 + '). 개편된 4개 항목의 이전 점수가 아니며, 조정 경위를 이해하기 위한 참고자료입니다.'),
        h('div', { class: 'legacy-results' }, LEGACY.map(c => legacyResult(c))))
    ] : [
      pageHead('1부 · 수정 항목·전체 구성 평가', '개편된 항목과 전체 구성의 적절성을 평가해 주십시오', '4개 주요 평가항목마다 1~5점으로 답해 주십시오. 각 항목의 세부내용은 판단을 돕는 기준이며, 16개 세부항목별로 점수를 매기는 것은 아닙니다.'),
      h('div', { class: 'items revised-items' }, C.map(c => revisedItem(c))), overallQuestion()
    ];
    return {
      body: [h('nav', { class: 'p1-stages', 'aria-label': '1부 진행 단계' }, P1STAGES.map((t, i) => h('button', { class: stage === i ? 'active' : '', type: 'button', 'aria-current': stage === i ? 'step' : null, onclick: () => p1Go(i) }, h('span', null, String(i + 1)), t))), ...body],
      nav: navbar(stage ? { label: '이전: 개편 안내·1차 결과', on: () => p1Go(0) } : { label: '시작 화면', on: () => go('intro') }, !stage ? { label: '다음: 적절성 평가', on: () => p1Go(1) } : { label: '다음: 중요도 평가', on: () => go('p2') }, () => [h('b', null, p1ItemCount() + '/' + N), ' 항목 · 전체 구성 ', st.overallScore ? '응답' : '미응답'])
    };
  }
  function sourceNames(c) {
    const ids = c.sourceIds || [];
    return ids.length ? ids.map(id => { const x = LEGACY.find(o => o.id === id); return x ? id + ' ' + x.name : id; }).join(' / ') : '연구진 통합 관계 입력 대기';
  }
  function legacyGraph(c) {
    const my = R.r1[c.id], s = c.stats, max = Math.max(1, ...s.dist);
    const cols = s.dist.map((n, k) => h('div', { class: 'dist-col' + (k + 1 === my ? ' me' : '') }, h('span', { class: 'c' }, n + '명'), h('span', { class: 'b', style: { height: 'calc(' + (n / max) * 100 + '% - 20px)' } })));
    const avg = h('div', { class: 'dist-avg', style: { left: 'calc(' + (s.mean - 1).toFixed(3) + ' * (100% + 10px) / 5 + (100% - 40px) / 10 - 1px)' } }, h('span', null, '평균 ' + s.mean.toFixed(2)));
    return h('div', { class: 'dist', role: 'img', 'aria-label': '응답 분포: ' + s.dist.map((n, k) => (k + 1) + '점 ' + n + '명').join(', ') + '. 나의 1차 ' + (my || '미응답') },
      h('div', { class: 'dist-cap' }, h('span', null, '전체 응답 분포'), h('span', null, 'N=' + META.n1)),
      h('div', { class: 'dist-plot' }, cols, h('div', { style: { position: 'absolute', left: '4px', right: '4px', top: 0, bottom: 0, pointerEvents: 'none' } }, avg)),
      h('div', { class: 'dist-x' }, [1, 2, 3, 4, 5].map(v => h('span', { class: v === my ? 'me' : null }, v === my ? v + '점 · 나' : v + '점'))));
  }
  function legacyResult(c) {
    const s = c.stats, my = R.r1[c.id];
    const stat = (k, v, cls) => h('div', { class: 'stat ' + (cls || '') }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v));
    return h('article', { class: 'card legacy-row' },
      h('div', { class: 'item-h' }, badge(c.id), h('h3', null, c.name)),
      h('div', { class: 'stats' }, stat('나의 1차 응답', my ? my + '점' : '없음', 'me'), stat('전체 평균', s.mean.toFixed(2), 'avg'), stat('중앙값', s.median + '점'), stat('4·5점 비율', s.pos.toFixed(1) + '%')),
      h('details', { class: 'legacy-details' }, h('summary', null, '상세보기 · 응답 분포'), h('p', { class: 'def' }, c.def), legacyGraph(c)));
  }
  function scoreControl(name, labelId, get, set) {
    const status = h('p', { class: 'status-line', 'aria-live': 'polite' });
    const upd = () => { const v = get(); status.textContent = v ? v + '점 · ' + P1_LABELS[v - 1] : '미응답 · 적절성 점수를 선택해 주십시오.'; };
    upd();
    return h('div', { class: 'new-score' },
      h('fieldset', { class: 'scale', 'aria-labelledby': labelId }, h('div', { class: 'opts' }, [1, 2, 3, 4, 5].map(v => h('label', { class: 'opt' },
        h('input', { type: 'radio', name, value: String(v), checked: get() === v, onchange: () => { set(v); persist(); upd(); } }),
        h('span', { class: 'face' }, h('b', null, String(v)), h('small', null, P1_LABELS[v - 1])))))), h('div', { class: 'scale-ends', 'aria-hidden': 'true' }, h('span', null, '1 전혀 적절하지 않음'), h('span', null, '5 매우 적절함')), status);
  }
  function revisedItem(c) {
    const related = (c.sourceIds || []).map(id => LEGACY.find(o => o.id === id)).filter(Boolean);
    return h('article', { class: 'card revision-item', id: 'p1-' + c.id, 'aria-labelledby': 'h-' + c.id },
      h('div', { class: 'item-h' }, badge(c.id), h('h3', { id: 'h-' + c.id }, c.name)),
      h('p', { class: 'criterion-summary' }, c.def),
      frameworkTable(c, 'answer', false),
      h('p', { class: 'criterion-change' }, h('b', null, '조정 내용  '), c.change),
      h('h4', { id: 'q-' + c.id, class: 'answer-q' }, '이 항목은 우수 서비스 선정 기준으로 얼마나 적절합니까?'),
      scoreControl('p1-' + c.id, 'q-' + c.id, () => (st.p1[c.id] || {}).score, v => { st.p1[c.id] = { score: v }; }));
  }

  /* ---------- 2부: AHP 쌍대비교 ---------- */
  function r2WeightSummary() {
    const rows = [
      ['A', '데이터 연계·표준화 가능성', '19.8%'],
      ['B', '도시·시민 서비스 효과성', '38.8%'],
      ['C', 'AI 적용 실효성·고도화 가능성', '14.9%'],
      ['D', '서비스 확산·운영 지속가능성', '26.4%']
    ];
    return h('div', { class: 'card r2-weight-summary', style: { marginBottom: '18px', padding: '18px 20px' } },
      h('h3', { style: { margin: '0 0 6px', fontSize: '17px' } }, '평가항목 가중치 AHP 쌍대비교 결과'),
      h('p', { class: 'sub', style: { margin: '0 0 14px', color: '#5b6474' } }, '2차 조사(제출 100명 중 일관성 기준 CR≤0.1 충족 65명 통합)에서 산출된 평가항목별 가중치 평균입니다. 이 결과를 참고하여 본인의 쌍대비교 응답을 이번 3차 조사에서 그대로 유지하실지, 재조정하실지 자유롭게 결정해 주십시오.'),
      h('table', { class: 'r2-weight-table', style: { width: '100%', borderCollapse: 'collapse' } },
        h('thead', null, h('tr', null,
          h('th', { style: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #E3E7EC' } }, ''),
          h('th', { style: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #E3E7EC' } }, '평가항목'),
          h('th', { style: { textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #E3E7EC' } }, '2차 평균 가중치'))),
        h('tbody', null, rows.map(r => h('tr', null,
          h('td', { style: { padding: '8px' } }, h('span', { class: 'badge' }, r[0])),
          h('td', { style: { padding: '8px' } }, r[1]),
          h('td', { style: { padding: '8px', textAlign: 'right', fontWeight: '700' } }, r[2]))))));
  }

  function viewP2() {
    const panel = h('aside', { class: 'card ahp', 'aria-label': '현재 응답 기준 중요도와 일관성' });
    const fill = () => fillAhp(panel);
    const cards = PAIRS.map(([i, j], idx) => pairCard(i, j, idx, fill));
    fill();
    return {
      body: [
        r2WeightSummary(),
        pageHead('1부 · 평가항목 중요도 재평가 (쌍대비교)', '두 항목 중 더 중요한 쪽을 골라 주십시오',
          '우수 서비스를 선정할 때 두 평가항목 중 어느 쪽이 더 중요한지 고르고, 얼마나 더 중요한지 선택해 주십시오. 6개 비교를 모두 마치면 응답의 일관성 비율(CR)이 바로 계산되며, 0.1 이하이면 일관된 응답으로 봅니다.'),
        h('div', { class: 'guide', 'aria-label': '척도 안내' },
          h('span', { class: 'g' }, h('b', null, '1'), '같음'),
          h('span', { class: 'g' }, h('b', null, '3'), '약간 중요'),
          h('span', { class: 'g' }, h('b', null, '5'), '중요'),
          h('span', { class: 'g' }, h('b', null, '7'), '매우 중요'),
          h('span', { class: 'g' }, h('b', null, '9'), '극히 중요'),
          h('span', null, '2·4·6·8은 중간값')),
        h('div', { class: 'p2', style: { marginTop: '18px' } }, h('ol', { class: 'pairs' }, cards), panel)
      ],
      nav: navbar({ label: '시작 화면', on: () => go('intro') }, { label: '다음: 서비스 재평가', on: () => go('p3') },
        () => { const r = ahp(); return [h('b', null, `${p2Count()}/${PAIRS.length}`), ' 비교', r ? ` · 일관성 ${r.CR.toFixed(3)} ${r.CR <= 0.1 ? '양호' : '재검토 권장'}` : '']; })
    };
  }

  function pairCard(i, j, idx, onChange) {
    const k = pkey(i, j);
    const a = st.p2[k] || {};
    const ci = C[i], cj = C[j];
    const stChip = h('span', { class: 'chip' });
    const sum = h('p', { class: 'pair-sum', 'aria-live': 'polite' });
    const ints = [2, 3, 4, 5, 6, 7, 8, 9].map(v => h('label', { class: 'int' },
      h('input', { type: 'radio', name: `p2v-${k}`, value: String(v), checked: a.v === v, onchange: () => { st.p2[k] = Object.assign({}, st.p2[k], { v }); persist(); upd(); onChange(); } }),
      h('span', { class: 'face' }, h('b', null, String(v)), h('small', null, INT_SHORT[v] || '\u00A0'))));
    const intens = h('fieldset', { class: 'intens', hidden: !(a.side === 'L' || a.side === 'R') },
      h('legend', { id: `il-${k}` }, '얼마나 더 중요합니까?'), h('div', { class: 'row' }, ints));
    const side = (val, cls, content, label) => h('label', { class: 'side ' + cls },
      h('input', { type: 'radio', name: `p2-${k}`, value: val, checked: a.side === val, 'aria-label': label, onchange: () => { st.p2[k] = Object.assign({}, st.p2[k], { side: val }); persist(); upd(); onChange(); } }),
      h('span', { class: 'face' }, content));
    const upd = () => {
      const x = st.p2[k] || {};
      intens.hidden = !(x.side === 'L' || x.side === 'R');
      const done = pairDone(k);
      stChip.className = 'chip' + (done ? ' ok' : '');
      stChip.textContent = done ? '응답 완료' : '미응답';
      if (!x.side) sum.replaceChildren('더 중요한 항목을 고르거나 ‘같음’을 선택해 주십시오.');
      else if (x.side === 'E') sum.replaceChildren(h('b', null, `${shortId(ci.id)}와 ${shortId(cj.id)}`), '는 같은 정도로 중요 (1)');
      else {
        const [p, q] = x.side === 'L' ? [ci, cj] : [cj, ci];
        if (!x.v) sum.replaceChildren(h('b', null, `${shortId(p.id)}`), `가 더 중요 · 얼마나 더 중요한지 선택해 주십시오.`);
        else sum.replaceChildren(h('b', null, shortId(p.id)), `가 ${shortId(q.id)}보다 `, h('b', null, `‘${INT_NAME[x.v]}’`), ` (${x.v})`);
      }
    };
    upd();
    return h('li', { class: 'card pair', id: `pair-${k}` },
      h('div', { class: 'pair-top' }, h('b', null, `비교 ${idx + 1} / ${PAIRS.length}`), stChip),
      h('fieldset', { class: 'sides' },
        h('legend', { class: 'sr' }, `비교 ${idx + 1}: ${ci.name}${wa(ci.name)} ${cj.name} 중 더 중요한 항목`),
        side('L', 'l', [badge(ci.id), h('span', null, ci.name)], `${ci.name} 쪽이 더 중요`),
        side('E', 'eq', '같음', '두 항목이 같은 정도로 중요'),
        side('R', 'r', [badge(cj.id), h('span', null, cj.name)], `${cj.name} 쪽이 더 중요`)),
      intens, sum);
  }

  function fillAhp(panel) {
    const done = p2Count();
    const r = ahp();
    const kids = [
      h('h3', null, '현재 응답 기준 중요도'),
      h('p', { class: 'sub' }, `비교 ${done} / ${PAIRS.length} 완료`),
      h('div', { class: 'prog', 'aria-hidden': 'true' }, h('i', { style: { width: `${(done / PAIRS.length) * 100}%` } }))
    ];
    if (!r) {
      kids.push(h('p', { class: 'note', style: { marginTop: '12px' } }, '6개 비교를 모두 마치면 항목별 중요도(가중치)와 응답 일관성을 바로 계산해 보여 드립니다.'));
    } else {
      const order = CID.map((id, i) => ({ i, w: r.w[i] })).sort((a, b) => b.w - a.w);
      const mx = order[0].w;
      kids.push(h('div', { class: 'wlist' }, order.map(o => h('div', { class: 'w' },
        badge(CID[o.i]), h('span', { class: 'nm' }, C[o.i].name),
        h('span', { class: 'bar' }, h('i', { style: { width: `${(o.w / mx) * 100}%` } })),
        h('span', { class: 'pct' }, `${(o.w * 100).toFixed(1)}%`)))));
      const ok = r.CR <= 0.1;
      kids.push(h('div', { class: 'cr ' + (ok ? 'ok' : 'bad') },
        h('div', { class: 'k' }, '일관성 비율 (CR)'),
        h('div', { class: 'v' }, r.CR.toFixed(3)),
        h('p', null, ok ? '기준(0.1 이하)을 충족합니다.' : '기준 0.1을 넘습니다. 아래 비교를 다시 살펴봐 주십시오. 판단을 바꿀 의무는 없습니다.')));
      if (!ok) {
        kids.push(h('div', { class: 'recheck' }, r.dev.slice(0, 3).map(d => h('button', { type: 'button', onclick: () => jumpPair(pkey(d.i, d.j)) },
          h('b', null, `비교 ${d.idx + 1} · ${shortId(CID[d.i])} ↔ ${shortId(CID[d.j])}`),
          h('span', null, `응답: ${ratioText(d.i, d.j, d.a)} / 다른 응답들로 본 예상: ${ratioText(d.i, d.j, d.implied, true)}`)))));
      }
    }
    panel.replaceChildren(...kids);
    if (ui.mid) ui.mid();
  }

  function jumpPair(k) {
    const el = document.getElementById(`pair-${k}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1600);
    const inp = el.querySelector('input:checked') || el.querySelector('input');
    if (inp) inp.focus({ preventScroll: true });
  }

  /* ---------- 3부: 서비스 평가 ---------- */
  function criteriaGuide() {
    return h('details', { class: 'card criterion-guide' }, h('summary', null, '수정된 4개 평가 기준 보기'),
      C.map(c => h('section', null, h('h4', null, shortId(c.id) + '. ' + c.name), h('p', null, c.def), subcriteriaList(c, false))));
  }
  function viewP3() { return st.p3view === 'detail' ? viewP3Detail() : viewP3List(); }

  function svcChip(sid) {
    const n = svcCount(sid);
    if (n === N) return h('span', { class: 'chip ok' }, icon('check', { sw: '2.6' }), '평가 완료');
    if (n > 0) return h('span', { class: 'chip warn' }, `${n}/${N} 진행`);
    return h('span', { class: 'chip' }, '미평가');
  }
  function openSvc(idx) { st.p3view = 'detail'; st.p3cur = Math.max(0, Math.min(ORDER.length - 1, idx)); go('p3'); }
  function firstIncomplete() { const i = ORDER.findIndex(s => svcCount(s.id) < N); return i < 0 ? 0 : i; }

  function viewP3List() {
    const done = p3Done();
    const left = ORDER.length - done;
    const grid = h('ul', { class: 'svc-grid' });
    const tabs = h('div', { class: 'tabs', role: 'group', 'aria-label': '목록 보기' });
    const drawTabs = () => {
      const d = p3Done();
      tabs.replaceChildren(...[['all', `전체 ${ORDER.length}`], ['left', `남음 ${ORDER.length - d}`], ['done', `완료 ${d}`]].map(([id, label]) =>
        h('button', { type: 'button', 'aria-pressed': st.p3filter === id ? 'true' : 'false', onclick: () => { st.p3filter = id; persistQuiet(); drawTabs(); drawGrid(); } }, label)));
    };
    const drawGrid = () => {
      const list = ORDER.map((s, idx) => ({ s, idx })).filter(({ s }) => st.p3filter === 'all' ? true : st.p3filter === 'done' ? svcCount(s.id) === N : svcCount(s.id) < N);
      grid.replaceChildren(...list.map(({ s, idx }) => {
        const cat = catOf(s.cat);
        const dot = h('i', { style: { background: cat.color } });
        return h('li', null, h('button', { class: 'tile' + (svcCount(s.id) === N ? ' done' : ''), type: 'button', onclick: () => openSvc(idx), 'aria-label': `${idx + 1}번 ${s.name}, ${svcCount(s.id) === N ? '평가 완료' : `${svcCount(s.id)}/${N} 진행`}` },
          h('span', { class: 'top' }, h('span', { class: 'no' }, String(idx + 1).padStart(2, '0')), svcChip(s.id)),
          h('span', { class: 'cat', style: { color: cat.color } }, dot, cat.name),
          h('h3', null, s.name),
          h('p', null, s.sec && s.sec.summary ? s.sec.summary.map(x => x[1]).join(' ') : '')));
      }));
      if (!list.length) grid.replaceChildren(h('li', { class: 'note' }, '해당하는 서비스가 없습니다.'));
    };
    drawTabs(); drawGrid();
    return {
      body: [
        pageHead('2부 · 후보 서비스 재평가', `후보 서비스 ${ORDER.length}종을 평가해 주십시오`,
          '서비스 카드를 읽고 4개 평가항목별로 1~5점을 선택해 주십시오. 서비스 순서는 순서 효과를 줄이기 위해 위원님마다 다르게 배치됩니다. 중간에 멈추셔도 자동 저장되며 다시 들어오시면 이어서 응답하실 수 있습니다.'),
        h('section', { class: 'card p3-sum' },
          h('div', { class: 'big' }, String(done), h('small', null, ` / ${ORDER.length} 완료`)),
          h('div', { class: 'prog', 'aria-hidden': 'true' }, h('i', { style: { width: `${(p3Ratings() / (ORDER.length * N)) * 100}%` } })),
          left ? h('button', { class: 'btn primary small', type: 'button', onclick: () => openSvc(firstIncomplete()) }, done ? '남은 서비스 이어서 평가' : '첫 서비스부터 평가', icon('arrowR')) : h('span', { class: 'chip ok' }, '모든 서비스 평가 완료')),
        tabs, grid
      ],
      nav: navbar({ label: '이전: 중요도 재평가', on: () => go('p2') }, { label: left ? '확인·제출 화면' : '다음: 확인·제출', short: '확인', on: () => go('review') },
        () => [h('b', null, `${p3Done()}/${ORDER.length}`), ' 서비스 완료'])
    };
  }

  /* ---------- 서비스 카드 (요약판) ---------- */
  let IMG_KEY = null;
  const IMG_URL = new Map();
  async function imgKey() {
    if (IMG_KEY || !S.imgKey) return IMG_KEY;
    const raw = Uint8Array.from(atob(S.imgKey), c => c.charCodeAt(0));
    IMG_KEY = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    return IMG_KEY;
  }
  async function imgSrc(name) {
    if (IMG_URL.has(name)) return IMG_URL.get(name);
    const p = (async () => {
      const key = await imgKey();
      const buf = await (await fetch(name, { cache: 'force-cache' })).arrayBuffer();
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(buf, 0, 12) }, key, new Uint8Array(buf, 12));
      return URL.createObjectURL(new Blob([plain], { type: 'image/jpeg' }));
    })();
    IMG_URL.set(name, p);
    p.catch(() => IMG_URL.delete(name));
    return p;
  }
  function encImg(name, alt) {
    const im = h('img', { alt: alt || '', decoding: 'async' });
    imgSrc(name).then(u => { im.src = u; im.parentNode && im.parentNode.classList.add('ready'); }).catch(() => { if (im.parentNode) im.parentNode.classList.add('err'); });
    return im;
  }
  function openImg(name, title) {
    const dlg = h('dialog', { class: 'lightbox', 'aria-label': `${title} 서비스 이미지` },
      encImg(name, `${title} 서비스 이미지`),
      h('div', { class: 'lb-bar' }, h('span'), h('button', { type: 'button', class: 'btn small', onclick: () => dlg.close() }, '닫기')));
    dlg.addEventListener('close', () => dlg.remove());
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    document.body.append(dlg);
    dlg.showModal();
  }
  const txt = items => (items || []).map(x => x[1]);
  function list(items) { return h('ul', { class: 'sec-list' }, (items || []).map(([k, t]) => k === 'h' ? h('li', { class: 'sub-h' }, t) : h('li', { class: k === 's' ? 'sub' : null }, t))); }
  function tags(items) { return h('div', { class: 'tags' }, txt(items).map(t => h('span', null, t))); }
  function block(title, body, extra) { return h('section', { class: 'cblock' + (extra ? ' ' + extra : '') }, h('h4', null, title), body); }
  const NONE = () => h('p', { class: 'none' }, '카드에 기재 없음');

  function viewP3Detail() {
    const idx = st.p3cur;
    const s = ORDER[idx];
    const cat = catOf(s.cat);
    const sec = s.sec || {};
    const chipBox = h('span', null, svcChip(s.id));
    const doneMsg = h('div', { class: 'done-chip', 'aria-live': 'polite' });
    const updDone = () => {
      chipBox.replaceChildren(svcChip(s.id));
      const n = svcCount(s.id);
      doneMsg.replaceChildren(n === N ? h('span', { class: 'chip ok' }, icon('check', { sw: '2.6' }), idx < ORDER.length - 1 ? '이 서비스 평가 완료 · 다음 서비스로 넘어가 주십시오' : '마지막 서비스까지 평가했습니다') : h('span', { class: 'note' }, `${n}/${N}개 항목 선택`));
    };
    const rows = C.map(c => {
      const cur = st.p3[s.id] && st.p3[s.id][c.id];
      return h('fieldset', { class: 'rrow' },
        h('legend', { class: 'sr' }, `${shortId(c.id)} ${c.name}`),
        h('div', { class: 'rrow-in' },
          h('span', { class: 'rlabel', 'aria-hidden': 'true' }, badge(c.id), h('span', null, c.name)),
          h('div', { class: 'opts' }, [1, 2, 3, 4, 5].map(v => h('label', { class: 'opt' },
            h('input', { type: 'radio', name: `p3-${s.id}-${c.id}`, value: String(v), checked: cur === v, onchange: () => { st.p3[s.id] = Object.assign({}, st.p3[s.id], { [c.id]: v }); persist(); updDone(); } }),
            h('span', { class: 'face' }, h('b', null, String(v)), h('small', { class: 'sr' }, ['', '매우 낮음', '낮음', '보통', '높음', '매우 높음'][v])))))));
    });
    const ta = h('textarea', { id: `sn-${s.id}`, placeholder: '평가 근거나 보완 의견이 있으면 적어 주십시오.', maxlength: '500' });
    ta.value = st.p3note[s.id] || '';
    ta.addEventListener('input', () => { st.p3note[s.id] = ta.value; persist(); });
    updDone();
    const imgs = s.images || [];
    const band = h('div', { class: 'svc-band', style: { background: cat.color } },
      h('span', { class: 'ic' }, icon(cat.icon, { color: '#fff' })),
      h('div', null,
        h('div', { class: 'meta' }, h('span', null, cat.name), s.no ? h('span', null, `카드 번호 ${String(s.no).padStart(2, '0')}`) : null),
        h('h2', { id: 'pageTitle', tabindex: '-1' }, s.name)));
    const gallery = imgs.length ? h('div', { class: 'gallery' + (imgs.length > 1 ? ' multi' : '') }, imgs.slice(0, 4).map((im, i) =>
      h('button', { type: 'button', class: 'g-item', onclick: () => openImg(im.src, s.name), 'aria-label': `서비스 이미지 ${i + 1} 크게 보기` },
        encImg(im.src, ''),
        i === 3 && imgs.length > 4 ? h('span', { class: 'more' }, `+${imgs.length - 4}`) : null))) : null;
    const body = [
      sec.summary ? h('p', { class: 'lead2' }, txt(sec.summary).join(' ')) : null,
      h('div', { class: 'facts2' },
        h('div', null, h('div', { class: 'k' }, '서비스 대상'), h('div', { class: 'v' }, txt(sec.target).join(' / ') || '카드에 기재 없음')),
        h('div', null, h('div', { class: 'k' }, '적용 사례'), h('div', { class: 'v' }, txt(sec.cases).join(' / ') || '카드에 기재 없음'))),
      gallery,
      sec.features ? block('주요 기능', list(sec.features)) : null,
      sec.goal ? block('목표', h('p', { class: 'ptext' }, txt(sec.goal).join(' '))) : null,
      sec.background ? block('서비스 배경', list(sec.background)) : null,
      sec.status ? block('현재 수준', list(sec.status)) : null,
      block('적용 기술', sec.tech ? tags(sec.tech) : NONE()),
      block('데이터허브 연계', sec.hub ? list(sec.hub) : NONE()),
      h('div', { class: 'cgrid' },
        block('입력 데이터', sec.input ? tags(sec.input) : NONE()),
        block('출력 데이터', sec.output ? tags(sec.output) : NONE())),
      h('div', { class: 'cgrid' },
        block('후보 KPI', sec.kpi ? tags(sec.kpi) : NONE()),
        block('확산 리스크', sec.risk ? list(sec.risk) : NONE())),
      s.raw ? h('details', { class: 'raw' }, h('summary', null, '카드 원문 전체 보기'), h('div', { class: 'raw-text' }, s.raw)) : null
    ];
    return {
      body: [
        h('div', { class: 'svc-top' },
          h('button', { class: 'btn small', type: 'button', onclick: () => { st.p3view = 'list'; go('p3'); } }, icon('list'), '전체 목록'),
          h('span', { class: 'pos' }, '서비스 ', h('b', null, String(idx + 1)), ` / ${ORDER.length}`),
          chipBox),
        h('div', { class: 'svc svc-rich' },
          h('article', { class: 'card svc-card', 'aria-labelledby': 'pageTitle' }, band, h('div', { class: 'svc-body' }, body)),
          h('section', { class: 'card rate', 'aria-labelledby': 'rate-h' },
            s.r2score ? h('div', { class: 'r2-score-box', style: { margin: '0 0 18px', padding: '14px 16px', background: '#F3F6FB', borderRadius: '10px' } },
              h('h4', { style: { margin: '0 0 10px', fontSize: '14px' } }, '2차 설문 결과'),
              h('div', { style: { display: 'grid', gridTemplateColumns: '1fr auto', rowGap: '6px', columnGap: '12px' } },
                C.map(c => h('div', { style: { display: 'contents' } },
                  h('span', null, h('span', { class: 'badge' }, shortId(c.id)), ' ', c.name),
                  h('b', null, (s.r2score[shortId(c.id)] || '-') + '점'))))) : null,
            h('h3', { id: 'rate-h' }, '평가항목별 점수'),
            h('p', { class: 'sub' }, '카드 내용을 보고 이 서비스가 각 평가항목을 얼마나 충족하는지 선택해 주십시오.'),
            h('div', { class: 'rate-ends', 'aria-hidden': 'true' }, h('span'), h('div', null, h('span', null, '1 매우 낮음'), h('span', null, '3 보통'), h('span', null, '5 매우 높음'))),
            h('div', { class: 'rrows' }, rows),
            doneMsg,
            h('div', { style: { marginTop: '16px' } }, h('label', { class: 'field-label', for: `sn-${s.id}` }, '이 서비스에 대한 의견', h('small', null, '선택')), ta)))
      ],
      nav: navbar(
        idx > 0 ? { label: '이전 서비스', on: () => openSvc(idx - 1) } : { label: '목록으로', short: '목록', on: () => { st.p3view = 'list'; go('p3'); } },
        idx < ORDER.length - 1 ? { label: '다음 서비스', on: () => openSvc(idx + 1) } : { label: '확인·제출로', short: '확인', on: () => { st.p3view = 'list'; go('review'); } },
        () => [h('b', null, `${svcCount(s.id)}/${N}`), ` 항목 · 전체 ${p3Done()}/${ORDER.length} 서비스 완료`])
    };
  }

  /* ---------- 확인·제출 ---------- */
  function viewReview() {
    const r = ahp();
    const c1 = p1Count(), c2 = p2Count(), c3 = p3Done();
    const miss1 = C.filter(c => !(st.p1[c.id] && st.p1[c.id].score));
    const miss2 = PAIRS.map(([i, j], idx) => ({ i, j, idx })).filter(p => !pairDone(pkey(p.i, p.j)));
    const miss3 = ORDER.map((s, idx) => ({ s, idx })).filter(o => svcCount(o.s.id) < N);
    const remaining = (P1TOTAL() - c1) + (PAIRS.length - c2) + (ORDER.length * N - p3Ratings());
    const crBad = r && r.CR > 0.1;
    const ack = h('input', { type: 'checkbox', id: 'crack', checked: !!st.crAck });
    const complete = allDone();
    const submitBtn = h('button', { class: 'btn primary', type: 'button', disabled: !(complete && (!crBad || st.crAck)) }, st.submittedAt ? '수정 내용 다시 제출하기' : '제출하기', icon('arrowR'));
    ack.addEventListener('change', () => { st.crAck = ack.checked; persist(); submitBtn.disabled = !(complete && (!crBad || st.crAck)); });
    const subMsg = h('p', { class: 'lg-msg', role: 'alert' });
    submitBtn.addEventListener('click', async () => {
      if (!OPEN) { subMsg.textContent = '조사가 마감되어 제출할 수 없습니다.'; return; }
      submitBtn.disabled = true; submitBtn.textContent = '제출 중… 잠시만 기다려 주십시오'; subMsg.textContent = '';
      clearTimeout(saveTimer);
      let r;
      try { r = await Api.submit(token, st, ORDER.map(x => x.id)); } catch (e) { r = { ok: false, error: 'network' }; }
      if (r && r.ok) {
        st.submittedAt = r.submittedAt; st.receipt = r.receipt; st.editedAfterSubmit = false; st.step = 'done';
        dirty = false; localBackup(); go('done'); return;
      }
      submitBtn.disabled = false; submitBtn.textContent = '다시 제출하기';
      const e = r && r.error;
      subMsg.textContent = e === 'incomplete' ? `아직 빠진 문항이 있습니다 (${(r.miss || []).join(', ')}). 해당 부분을 확인해 주십시오.`
        : e === 'schema_mismatch' || e === 'revision_not_ready' ? '평가항목 버전이 변경되었습니다. 새로고침 후 연구진 안내를 확인해 주십시오.'
        : e === 'cr_ack' ? '2부 일관성 확인란에 체크해 주십시오.'
        : e === 'closed' ? '조사가 마감되어 제출할 수 없습니다.'
        : e === 'invalid_token' ? '접속 정보가 만료되었습니다. 새로고침 후 다시 들어와 주십시오. 입력 내용은 이 기기에 보관되어 있습니다.'
        : '연결이 원활하지 않아 제출하지 못했습니다. 입력 내용은 저장되어 있으니 잠시 후 다시 눌러 주십시오.';
    });
    const card = (title, chip, desc, actLabel, onAct, extra) => h('section', { class: 'card rv-card' },
      h('h3', null, title, chip), h('p', { class: 'd' }, desc),
      h('div', { class: 'act' }, h('button', { class: 'btn small', type: 'button', onclick: onAct }, actLabel)), extra);
    const okChip = done => h('span', { class: 'chip ' + (done ? 'ok' : 'warn') }, done ? '완료' : '미완료');
    return {
      body: [
        pageHead('4 · 확인 및 제출', '응답 내용을 확인하고 제출해 주십시오', st.submittedAt && st.editedAfterSubmit ? '제출 후 수정한 내용이 있습니다. 다시 제출하셔야 수정 내용이 반영됩니다.' : '모든 문항에 응답하시면 제출할 수 있습니다. 빠진 문항은 아래 버튼을 눌러 바로 이동하실 수 있습니다.'),
        h('div', { class: 'rv' },
          card('1부 수정 항목·전체 구성 적절성', okChip(c1 === P1TOTAL()), p1ItemCount() + '/' + N + ' 항목 · 전체 구성 ' + (st.overallScore ? st.overallScore + '점' : '미응답'), '1부 보기', () => p1Go(1),
            [miss1.length ? h('div', { class: 'missing' }, miss1.map(c => h('button', { type: 'button', onclick: () => { st.p1stage = 1; go('p1', () => { const el = document.getElementById('p1-' + c.id); if (el) el.scrollIntoView({ block: 'start' }); }); } }, shortId(c.id) + ' ' + c.name))) : null,
              !st.overallScore ? h('div', { class: 'missing' }, h('button', { type: 'button', onclick: () => p1Go(1) }, '전체 구성의 적절성')) : null]),
          card('2부 평가항목 중요도', okChip(c2 === PAIRS.length), `${c2}/${PAIRS.length} 비교` + (r ? ` · 일관성 비율 ${r.CR.toFixed(3)} (${r.CR <= 0.1 ? '기준 충족' : '기준 0.1 초과'})` : ''), '2부 보기', () => go('p2'),
            miss2.length ? h('div', { class: 'missing' }, miss2.map(p => h('button', { type: 'button', onclick: () => go('p2', () => jumpPair(pkey(p.i, p.j))) }, `비교 ${p.idx + 1} · ${shortId(CID[p.i])}↔${shortId(CID[p.j])}`))) : null),
          card('3부 후보 서비스 평가', okChip(c3 === ORDER.length), `${c3}/${ORDER.length} 서비스 완료 · 점수 ${p3Ratings()}/${ORDER.length * N}개 선택`, '3부 보기', () => { st.p3view = 'list'; go('p3'); },
            miss3.length ? h('div', { class: 'missing' }, miss3.slice(0, 40).map(o => h('button', { type: 'button', onclick: () => openSvc(o.idx) }, `${o.idx + 1}. ${o.s.name} (${svcCount(o.s.id)}/${N})`))) : null)),
        h('section', { class: 'card submit-box' },
          crBad ? h('label', { class: 'check', for: 'crack' }, ack, h('span', null, '2부 일관성 비율이 0.1을 넘지만, 현재 판단을 유지하고 제출합니다')) : null,
          submitBtn, subMsg,
          !complete ? h('p', { class: 'note' }, `아직 선택하지 않은 문항이 ${remaining}개 있습니다.`) : null,
          h('p', { class: 'note' }, `제출 후에도 마감(2026-11-19 23:59) 전까지 다시 들어와 수정하고 다시 제출하실 수 있습니다.`))
      ],
      nav: navbar({ label: '이전: 서비스 평가', on: () => { st.p3view = 'list'; go('p3'); } }, null, () => [complete ? '모든 문항 응답 완료' : `남은 문항 ${remaining}개`])
    };
  }

  /* ---------- 완료 ---------- */
  function viewDone() {
    if (!st.submittedAt) return viewReview();
    const r = ahp();
    const copy = h('section', { class: 'card copy', id: 'copy', hidden: true }, buildCopy(r));
    const toggle = h('button', { class: 'btn', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'copy' }, icon('doc'), '내 응답 사본 보기');
    toggle.addEventListener('click', () => { copy.hidden = !copy.hidden; toggle.setAttribute('aria-expanded', String(!copy.hidden)); toggle.lastChild.textContent = copy.hidden ? '내 응답 사본 보기' : '사본 접기'; });
    return {
      body: [
        h('section', { class: 'card done-hero' },
          h('div', { class: 'ok-ic' }, icon('check', { color: '#1F7A4D', sw: '2.6' })),
          h('h2', { id: 'pageTitle', tabindex: '-1' }, '응답이 제출되었습니다'),
          h('p', null, `${R.name} 위원님, 귀한 시간을 내어 주셔서 감사합니다.` + (META.next ? ` 2차 결과는 3차 조사(${META.next}) 때 함께 공유해 드립니다.` : '')),
          h('dl', { class: 'receipt-meta' }, h('dt', null, '접수 번호'), h('dd', null, st.receipt), h('dt', null, '제출 시각'), h('dd', null, fmtDT(st.submittedAt))),
          h('div', { class: 'done-actions' }, toggle,
            h('button', { class: 'btn', type: 'button', onclick: () => window.print() }, icon('print'), '인쇄 · PDF로 저장'),
            OPEN ? h('button', { class: 'btn ghost', type: 'button', onclick: () => go('review') }, '응답 수정하기') : null)),
        copy,
        h('section', { class: 'card copy no-print' },
          h('h3', null, '공용 PC에서 응답하셨나요?'),
          h('p', { class: 'note', style: { marginBottom: '12px' } }, '제출한 응답은 연구진에게 안전하게 전달되었습니다. 공용 PC라면 이 기기에 남은 임시 기록을 지우고 나가 주십시오.'),
          h('button', { class: 'btn small', type: 'button', onclick: () => { Api.clear(token); token = null; st = null; renderGate(false, '이 기기의 임시 기록을 지웠습니다. 제출한 응답은 그대로 보관되어 있습니다.'); } }, icon('lock'), '기록 지우고 나가기'))
      ],
      nav: null
    };
  }

  function buildCopy(r) {
    const tbl = (head, rows) => h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, head.map(x => h('th', { scope: 'col' }, x)))),
      h('tbody', null, rows.map(row => h('tr', null, row.map(x => h('td', null, x)))))));
    return [
      h('h3', null, `${R.name} 위원님 응답 사본 · 접수 ${st.receipt}`),
      h('h4', null, '1부 평가항목 적절성'),
      tbl(['수정된 평가항목', '적절성 점수', '보완 의견'], C.map(c => { const a = st.p1[c.id] || {}; return [shortId(c.id) + ' ' + c.name, a.score ? a.score + '점' : '-', a.reason || '']; })),
      h('p', null, '전체 구성의 적절성: ' + (st.overallScore ? st.overallScore + '점' : '미응답')),
      h('p', null, '종합의견: ' + (st.p1note || '없음')),
      h('h4', null, '2부 평가항목 중요도' + (r ? ` · 일관성 비율 ${r.CR.toFixed(3)}` : '')),
      r ? tbl(['평가항목', '가중치'], CID.map((id, i) => [`${shortId(id)} ${C[i].name}`, `${(r.w[i] * 100).toFixed(1)}%`])) : null,
      tbl(['비교', '응답'], PAIRS.map(([i, j], idx) => { const a = st.p2[pkey(i, j)] || {}; const x = a.side === 'L' ? a.v : a.side === 'R' ? 1 / a.v : 1; return [`${idx + 1}. ${shortId(CID[i])} ↔ ${shortId(CID[j])}`, a.side ? ratioText(i, j, x) : '-']; })),
      h('h4', null, '3부 후보 서비스 평가'),
      tbl(['서비스', ...CID.map(shortId)], ORDER.map((s, idx) => [`${idx + 1}. ${s.name}`, ...CID.map(id => (st.p3[s.id] && st.p3[s.id][id]) ? String(st.p3[s.id][id]) : '-')]))
    ];
  }

  /* ---------- 입장 화면 (공통 주소: 성명 + 휴대폰 뒷 4자리) ---------- */
  function logout() { clearTimeout(saveTimer); if (dirty && token && st && OPEN) Api.beacon(token, st); try { sessionStorage.removeItem(SKEY); } catch (e) { /* 무시 */ } token = null; st = null; dirty = false; renderGate(); }
  function renderGate(invalid, msg) {
    ui.steps = null; ui.mid = null; ui.save = null; st = null;
    const nm = h('input', { id: 'lg-name', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', maxlength: '40', placeholder: '예: 홍길동', 'aria-describedby': 'lg-msg' });
    const p4 = h('input', { id: 'lg-p4', type: 'password', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off', maxlength: '4', placeholder: '숫자 4자리', 'aria-describedby': 'lg-msg' });
    const msgEl = h('p', { class: 'lg-msg', id: 'lg-msg', role: 'alert' }, invalid ? '접속 정보가 올바르지 않습니다. 성명과 휴대폰 번호 뒷 4자리를 넣어 주십시오.' : '');
    const btn = h('button', { class: 'btn primary', type: 'submit' }, '내 설문 열기', icon('arrowR'));
    p4.addEventListener('input', () => { p4.value = p4.value.replace(/\D/g, '').slice(0, 4); });
    const form = h('form', { class: 'lg', novalidate: true },
      h('div', { class: 'lg-row' },
        h('div', null, h('label', { class: 'field-label', for: 'lg-name' }, '성명'), nm),
        h('div', null, h('label', { class: 'field-label', for: 'lg-p4' }, '휴대폰 번호 뒷 4자리'), p4)),
      msgEl, btn,
      h('p', { class: 'note' }, '1차 조사 때 적어 주신 성명과 휴대폰 번호로 본인을 확인합니다. 입력한 정보는 확인에만 쓰고 따로 저장하지 않습니다.'),
      h('p', { class: 'note' }, '응답은 자동 저장됩니다. 한 번에 한 창에서만 응답해 주세요.'));
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      if (!nm.value.trim() || p4.value.length !== 4) { msgEl.textContent = '성명과 휴대폰 번호 뒷 4자리를 모두 입력해 주십시오.'; (nm.value.trim() ? p4 : nm).focus(); return; }
      btn.disabled = true; btn.firstChild.textContent = '확인 중…';
      let r;
      try { r = await Api.login(nm.value, p4.value); } catch (e) { r = { ok: false, error: 'network' }; }
      btn.disabled = false; btn.firstChild.textContent = '내 설문 열기';
      if (r && r.ok) { try { sessionStorage.setItem(SKEY, r.token); } catch (e) { /* 무시 */ } boot(); return; }
      const e = r && r.error;
      msgEl.textContent = e === 'nomatch' ? `일치하는 정보가 없습니다. 1차 조사 때 적은 성명과 휴대폰 번호인지 확인해 주십시오. (남은 시도 ${r.left}회)`
        : e === 'locked' ? '확인에 5번 실패해 5분 동안 잠겼습니다. 정보가 맞는데도 안 되면 연구진에 문의해 주십시오.'
        : e === 'not_started' ? `조사는 ${META.period || '조사 기간'}에 진행됩니다. 시작일에 다시 접속해 주십시오.`
        : e === 'busy' ? '접속이 많습니다. 잠시 후 다시 시도해 주십시오.'
        : e === 'invalid' ? '성명과 휴대폰 번호 뒷 4자리를 모두 입력해 주십시오.'
        : '연결이 원활하지 않습니다. 잠시 후 다시 시도해 주십시오.';
      if (e === 'nomatch') { p4.value = ''; p4.focus(); }
    });
    const notice = META.notStarted ? h('p', { class: 'gate-note' }, `지금은 조사 시작 전입니다. ${META.period}에 응답하실 수 있습니다.`)
      : !META.open ? h('p', { class: 'gate-note' }, '조사가 마감되었습니다. 제출하신 분은 접수 내역을 확인하실 수 있습니다.') : null;
    const fact = (k, v) => h('li', null, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v));
    app.replaceChildren(header(), h('main', { id: 'main', tabindex: '-1' }, h('div', { class: 'wrap' },
      h('section', { class: 'card gate gate2' },
        h('div', { class: 'gate-visual' },
          h('p', { class: 'gv-eyebrow' }, `${META.project} · ${META.title}`),
          h('h1', { id: 'pageTitle', tabindex: '-1' }, `${META.round} 전문가 조사`),
          h('p', { class: 'gv-lead' }, '전문가 의견을 반영해 통합·조정한 4개 평가항목의 적절성과 중요도, 후보 서비스에 대한 의견을 여쭙습니다.'),
          h('ul', { class: 'gv-facts' }, fact('조사 기간', META.period), fact('구성', `중요도 재평가 · 후보서비스 ${META.nsvc}종`))),
        h('div', { class: 'gate-form' },
          h('h2', { class: 'gf-title' }, msg ? '나가기 완료' : '본인 확인'),
          h('p', { class: 'gf-sub' }, msg || '확인 후 위원님의 2차 결과와 3차 설문이 열립니다.'),
          notice,
          msg ? h('button', { class: 'btn', type: 'button', style: { marginTop: '18px' }, onclick: () => renderGate() }, '다시 들어가기') : form,
          META.contact ? h('p', { class: 'note', style: { marginTop: '14px' } }, `문의: ${META.contact}`) : null)))), footer());
  }

  function renderBoot(text) { ui.steps = null; app.replaceChildren(h('div', { class: 'boot', role: 'status' }, text)); }

  function viewClosed() {
    return {
      body: [h('section', { class: 'card gate' },
        h('h1', { id: 'pageTitle', tabindex: '-1' }, '조사가 마감되었습니다'),
        h('p', null, `${R.name} 위원님, 2차 조사 응답 기간이 끝나 더 이상 저장하거나 제출할 수 없습니다.`),
        META.contact ? h('p', { class: 'note', style: { marginTop: '10px' } }, `문의: ${META.contact}`) : null,
        h('button', { class: 'btn', type: 'button', style: { marginTop: '18px' }, onclick: logout }, '나가기'))],
      nav: null
    };
  }

  /* ---------- 시작 ---------- */
  function readToken() {
    const m = location.hash.match(TOKEN_RE) || location.search.match(TOKEN_RE);
    if (m) {
      try { sessionStorage.setItem(SKEY, m[1]); } catch (e) { /* 무시 */ }
      history.replaceState(null, '', location.pathname); // 주소창·방문 기록에서 토큰 제거
      return m[1];
    }
    try { return sessionStorage.getItem(SKEY); } catch (e) { return null; }
  }

  const VIEWS = { intro: viewIntro, p2: viewP2, p3: viewP3, review: viewReview, done: viewDone, closed: viewClosed };

  async function boot() {
    if (!CFG.api) { renderBoot('설정 오류: 서버 주소가 없습니다.'); return; }
    if (!S) {
      renderBoot('조사 화면을 불러오는 중입니다…');
      try { const cfg = await Api.config(); if (!cfg || !cfg.ok) throw new Error('cfg'); applyConfig(cfg); }
      catch (e) { renderBoot('조사 서버 연결이 지연되고 있습니다. 잠시 후 새로고침해 주십시오. 계속 열리지 않으면 연구진에게 수기 작성용 설문을 요청해 주십시오.'); return; }
    }
    token = readToken();
    if (!token) { renderGate(false); return; }
    renderBoot('위원님의 설문을 불러오는 중입니다…');
    let res = null;
    try { res = await Api.load(token); } catch (e) { res = { ok: false, error: 'network' }; }
    if (!res || !res.ok) {
      if (res && res.error === 'network') { renderBoot('연결이 원활하지 않습니다. 잠시 후 새로고침해 주십시오.'); return; }
      try { sessionStorage.removeItem(SKEY); } catch (e) { /* 무시 */ }
      token = null; renderGate(true); return;
    }
    if (res.schemaVersion !== SCHEMA) { renderBoot('평가항목 버전이 달라 응답을 불러오지 않았습니다. 새로고침하거나 연구진에 문의해 주십시오.'); return; }
    R = res.respondent;
    OPEN = !!res.open;
    const server = res.saved && res.saved.schemaVersion === SCHEMA ? res.saved : null;
    const localRead = readLocal(token);
    const local = localRead && localRead.schemaVersion === SCHEMA ? localRead : null;
    let base = server;
    let pushLocal = false;
    if (local && (!server || String(local.updatedAt || '') > String(server.updatedAt || ''))) { base = local; pushLocal = true; }
    st = Object.assign(blank(), base || {});
    st.submittedAt = server ? server.submittedAt || null : null;
    st.receipt = server ? server.receipt || null : null;
    if (!st.submittedAt) st.editedAfterSubmit = false;
    S.imgKey = res.imgKey || CFG.imgKey || '';
    const _r2s = CFG.r2Scores || {}; const _mapSvc = x => Object.assign({}, x, { images: (x.images || []).map(src => ({ src })), r2score: _r2s[x.id] }); S.services = (Array.isArray(res.services) && res.services.length > 0) ? res.services.map(_mapSvc) : (CFG.services || []).map(_mapSvc);
    ORDER = shuffled(S.services, hashStr(token));
    st.p3cur = Math.min(st.p3cur || 0, Math.max(0, ORDER.length - 1));
    if (!st.consent) st.step = 'intro';
    if (st.consent && st.step !== 'intro' && st.step !== 'done') { const g0 = gate(st.step); if (g0 !== st.step) { ui.notice = GATE_MSG[g0]; st.step = g0; } }
    if (!OPEN && st.step !== 'done') st.step = st.submittedAt ? 'done' : 'closed';
    render();
    window.scrollTo(0, 0);
    if (pushLocal && OPEN) { dirty = true; schedule(500); }
  }

  window.addEventListener('hashchange', boot);
  boot();
})();
