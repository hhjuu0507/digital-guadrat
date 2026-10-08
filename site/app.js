(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const DATA = window.QUADRAT_DATA;
  const UNKNOWN = '미확인 식물';

  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  if (!DATA || !Array.isArray(DATA.submissions)) {
    $('#list').replaceChildren(h('div', { class: 'empty', text: '데이터를 불러오지 못했어요. data.js 파일이 같은 폴더에 있는지 확인해 주세요.' }));
    return;
  }

  const subs = DATA.submissions; // 최신순
  const pct1 = (v) => `${Number(v).toFixed(1)}%`;
  const isKnown = (sp) => sp.ko !== UNKNOWN;

  // ---------- 부제목: 조사 날짜 ----------
  const dates = [...new Set(subs.map((s) => s.time.slice(0, 10)))].sort();
  const fmtDate = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return `${y}년 ${m}월 ${d}일`;
  };
  if (dates.length) {
    const when = dates.length === 1 ? fmtDate(dates[0]) : `${fmtDate(dates[0])} ~ ${fmtDate(dates[dates.length - 1])}`;
    $('#subtitle').textContent = `${when} 조사 · 20cm × 20cm 방형구 사진으로 식물 종류와 초록색 비율을 AI로 분석했어요`;
  }

  // ---------- 요약 ----------
  const groups = [...new Set(subs.map((s) => s.group))].sort((a, b) => a - b);
  const sites = [...new Set(subs.map((s) => s.site))].sort((a, b) => a - b);
  const knownNames = new Set(subs.flatMap((s) => s.species.filter(isKnown).map((sp) => sp.ko)));
  const needMore = subs.filter((s) => s.status !== '완료').length;
  const spots = new Set(subs.map((s) => `${s.group}-${s.site}`)).size;

  function tile(value, label) {
    return h('div', { class: 'tile' }, h('div', { class: 'v', text: value }), h('div', { class: 'l', text: label }));
  }
  $('#tiles').append(
    tile(`${subs.length}건`, '전체 제출'),
    tile(`${spots}곳`, '조사 구역 (조 × Site)'),
    tile(`${knownNames.size}종`, '이름을 알아낸 식물'),
    tile(`${needMore}건`, '근접 사진이 필요했던 제출')
  );

  // 조 × Site 표
  const cell = (g, s) => {
    const list = subs.filter((x) => x.group === g && x.site === s);
    const names = new Set(list.flatMap((x) => x.species.filter(isKnown).map((sp) => sp.ko)));
    return { n: list.length, k: names.size };
  };
  const maxN = Math.max(1, ...groups.flatMap((g) => sites.map((s) => cell(g, s).n)));
  const matrix = h(
    'table',
    { class: 'matrix' },
    h('thead', {}, h('tr', {}, h('th', { class: 'row', text: '조' }), sites.map((s) => h('th', { text: `Site ${s}` })))),
    h(
      'tbody',
      {},
      groups.map((g) =>
        h(
          'tr',
          {},
          h('th', { class: 'row', scope: 'row', text: `${g}조` }),
          sites.map((s) => {
            const c = cell(g, s);
            if (!c.n) return h('td', { class: 'zero', text: '–' });
            const td = h('td', { title: `${g}조 Site ${s}: 제출 ${c.n}건, 식물 ${c.k}종` }, h('b', { text: `${c.n}건` }), h('span', { text: `${c.k}종` }));
            td.style.background = `rgba(34, 197, 94, ${(0.1 + 0.45 * (c.n / maxN)).toFixed(2)})`;
            return td;
          })
        )
      )
    )
  );
  $('#matrix').append(matrix);

  // 많이 나온 식물 (이름을 알아낸 식물만)
  const bySpecies = new Map();
  let unknownRows = 0;
  for (const s of subs) {
    const seen = new Set();
    for (const sp of s.species) {
      if (!isKnown(sp)) {
        unknownRows++;
        continue;
      }
      let e = bySpecies.get(sp.ko);
      if (!e) {
        e = { ko: sp.ko, sciCount: new Map(), subs: 0, ratioSum: 0, rows: 0 };
        bySpecies.set(sp.ko, e);
      }
      e.sciCount.set(sp.sci, (e.sciCount.get(sp.sci) || 0) + 1);
      e.ratioSum += sp.ratio;
      e.rows++;
      if (!seen.has(sp.ko)) {
        seen.add(sp.ko);
        e.subs++;
      }
    }
  }
  const top = [...bySpecies.values()]
    .map((e) => ({ ...e, sci: [...e.sciCount.entries()].sort((a, b) => b[1] - a[1])[0][0], avg: e.ratioSum / e.rows }))
    .sort((a, b) => b.subs - a.subs || b.avg - a.avg)
    .slice(0, 10);
  const maxSubs = Math.max(1, ...top.map((t) => t.subs));
  $('#top-note').textContent = `이름을 알아낸 식물만 보여줘요. '${UNKNOWN}' 기록 ${unknownRows}건은 제외했어요. 평균 비율은 그 식물이 나온 사진에서의 초록색 비율 평균이에요.`;
  $('#top-species').append(
    ...top.map((t) =>
      h(
        'div',
        { class: 'bar-row', title: `${t.ko}: ${t.subs}건의 제출에서 발견, 평균 ${pct1(t.avg)}` },
        h('div', { class: 'bar-name' }, t.ko, h('i', { text: t.sci })),
        h('div', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: `width:${(t.subs / maxSubs) * 100}%` })),
        h('div', { class: 'bar-val' }, `${t.subs}건`, h('small', { text: `평균 ${pct1(t.avg)}` }))
      )
    )
  );

  // ---------- 필터 ----------
  const fGroup = $('#f-group');
  const fSite = $('#f-site');
  const fStatus = $('#f-status');
  const fSearch = $('#f-search');
  groups.forEach((g) => fGroup.append(h('option', { value: g, text: `${g}조` })));
  sites.forEach((s) => fSite.append(h('option', { value: s, text: `Site ${s}` })));
  [...new Set(subs.map((s) => s.status))].forEach((st) => fStatus.append(h('option', { value: st, text: st })));

  const statusBadge = (text) => h('span', { class: `badge ${text === '완료' || text === '확인됨' ? 'ok' : 'warn'}`, text });

  function speciesRow(sp) {
    const unknown = !isKnown(sp);
    const info = h('div', {}, h('div', { class: `sp-name${unknown ? ' unknown' : ''}`, text: sp.ko }));
    if (sp.sci) info.append(h('div', { class: 'sp-sci', text: unknown ? `추정: ${sp.sci}` : sp.sci }));
    if (sp.family || sp.genus) info.append(h('div', { class: 'sp-taxa', text: [sp.family, sp.genus].filter(Boolean).join(' · ') }));
    return h(
      'div',
      { class: 'sp-row' },
      info,
      h('div', { class: 'sp-cover', title: '사진 속 초록색 픽셀 비율 (AI 참고용)' }, h('div', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: `width:${Math.min(100, sp.ratio)}%` })), h('b', { text: pct1(sp.ratio) })),
      h('div', { class: 'sp-conf' }, `${sp.conf}%`, h('small', { text: '신뢰도' })),
      h('div', { class: 'sp-status' }, statusBadge(sp.status))
    );
  }

  function card(s) {
    return h(
      'article',
      { class: 'sub-card' },
      h(
        'div',
        { class: 'sub-top' },
        h('div', {}, h('h3', { class: 'sub-name', text: s.name }), h('div', { class: 'sub-meta', text: `${s.group}조 · Site ${s.site} · ${s.timeText} · 식물 ${s.species.length}종 기록` })),
        statusBadge(s.status)
      ),
      h('div', { class: 'species' }, s.species.map(speciesRow))
    );
  }

  function render() {
    const g = fGroup.value;
    const si = fSite.value;
    const st = fStatus.value;
    const q = fSearch.value.trim().toLowerCase();
    const list = subs.filter(
      (s) =>
        (!g || s.group === Number(g)) &&
        (!si || s.site === Number(si)) &&
        (!st || s.status === st) &&
        (!q || s.species.some((sp) => `${sp.ko} ${sp.sci} ${sp.family} ${sp.genus}`.toLowerCase().includes(q)))
    );
    $('#count').textContent = list.length === subs.length ? `전체 ${subs.length}건` : `${subs.length}건 중 ${list.length}건`;
    const box = $('#list');
    box.replaceChildren();
    if (!list.length) {
      box.append(h('div', { class: 'empty', text: '조건에 맞는 제출이 없어요.' }));
      return;
    }
    list.forEach((s) => box.append(card(s)));
  }

  [fGroup, fSite, fStatus].forEach((el) => el.addEventListener('change', render));
  fSearch.addEventListener('input', render);
  render();
})();
