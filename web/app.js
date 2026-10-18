(() => {
  'use strict';

  const DEFAULT_DATA = '../data/7.1-261012.json';
  const THEME_KEY = 'activity-analysis-theme';
  const SIDE_LABEL = { left: '左', right: '右' };
  const OPP = { left: 'right', right: 'left' };
  const FONT_DISPLAY = '"Iowan Old Style","Palatino Linotype","Georgia","STZhongsong","Songti SC","SimSun",serif';
  const FONT_BODY = '"Aptos","Segoe UI","Microsoft YaHei UI","PingFang SC",sans-serif';
  const FONT_MONO = '"Cascadia Mono","Consolas","SFMono-Regular","Menlo",monospace';

  const PALETTES = {
    dark: {
      text: '#efe8da',
      muted: '#999184',
      faint: '#6f695f',
      line: 'rgba(214,168,79,.20)',
      lineSoft: 'rgba(239,232,218,.07)',
      grid: 'rgba(239,232,218,.06)',
      gold: '#d8aa54',
      goldStrong: '#edc879',
      red: '#d76b55',
      jade: '#6ab5a3',
      blue: '#86a4d9',
      violet: '#b58bd0',
      panel: '#141821',
      panel2: '#181d28',
      tooltipBg: '#0b0e14',
      tooltipBorder: 'rgba(216,170,84,.35)',
      baseBar: 'rgba(153,145,132,.34)',
      coinBand: 'rgba(216,170,84,.15)',
      supportBand: 'rgba(106,181,163,.15)',
      series: ['#d8aa54', '#86a4d9', '#d76b55', '#6ab5a3', '#b58bd0', '#9aab72']
    },
    light: {
      text: '#241f18',
      muted: '#746a5b',
      faint: '#9c917f',
      line: 'rgba(122,87,32,.24)',
      lineSoft: 'rgba(36,31,24,.10)',
      grid: 'rgba(36,31,24,.07)',
      gold: '#92651b',
      goldStrong: '#7a5215',
      red: '#a33f2d',
      jade: '#2d7768',
      blue: '#3f6198',
      violet: '#76518f',
      panel: '#fbf7ee',
      panel2: '#f5efe2',
      tooltipBg: '#fffaf0',
      tooltipBorder: 'rgba(146,101,27,.35)',
      baseBar: 'rgba(116,106,91,.24)',
      coinBand: 'rgba(146,101,27,.12)',
      supportBand: 'rgba(45,119,104,.12)',
      series: ['#92651b', '#3f6198', '#a33f2d', '#2d7768', '#76518f', '#6f7d3f']
    }
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const fmt = (n) => Number.isFinite(Number(n))
    ? Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 0 })
    : '—';
  const fmt1 = (n) => Number.isFinite(Number(n))
    ? Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 1 })
    : '—';
  const pct = (x, digits = 1) => Number.isFinite(Number(x))
    ? `${(Number(x) * 100).toFixed(digits)}%`
    : '—';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const sum = (arr) => arr.reduce((a, b) => a + b, 0);
  const compact = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(n % 10000 === 0 ? 0 : 1)}万`;
    if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
    return fmt(n);
  };
  const shortName = (name) => ({
    '全押左': '全左',
    '全押右': '全右',
    '押支持率高的一方': '押热门',
    '押支持率低的一方': '押冷门',
    '全押中（固定 50/场）': '全押中*'
  }[name] || name);

  let currentTheme = document.documentElement.dataset.theme || 'dark';
  let current = null;
  let loadToken = 0;
  const charts = [];

  const palette = () => PALETTES[currentTheme] || PALETTES.dark;

  // ---------- data loading and validation ----------

  function dataUrl() {
    const params = new URLSearchParams(location.search);
    const url = params.get('data') || DEFAULT_DATA;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url) && !url.startsWith(location.origin)) {
      throw new Error('只允许读取同源或相对路径的 JSON 数据。');
    }
    return url;
  }

  async function fetchData(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`读取 JSON 失败：HTTP ${res.status}`);
    return res.json();
  }

  function nullableNumber(v) {
    return v === null || v === undefined || v === '' ? null : Number(v);
  }

  function normalize(raw) {
    const activity = raw.activity || {};
    const errors = [];
    const warnings = [];
    const rawMatches = Array.isArray(raw.matches) ? raw.matches : [];
    if (!rawMatches.length) errors.push('matches 数组为空，无法分析。');

    const losing = Number(activity.settlement?.losingMultiplier ?? 10);
    const maxMultiplier = Number(activity.settlement?.maxMultiplier ?? 105);
    const dailyGrant = Number(activity.dailyGrant ?? 100);
    const matchesPerDay = Number(activity.matchesPerDay ?? 2);
    const holdingCap = Number(activity.holdingCap ?? 300);
    const totalDays = Number(activity.totalDays ?? 8);
    const stake = Number(activity.analysis?.stakePerMatch ?? Math.round(dailyGrant / matchesPerDay));
    const full = Number(activity.rewards?.full ?? 16000);
    const original = Number(activity.rewards?.original ?? 8000);
    const expectedMatches = totalDays * matchesPerDay;

    const matches = rawMatches.map((m, index) => {
      const support = {
        left: Number(m.support?.left),
        right: Number(m.support?.right)
      };
      const settlement = {
        left: Number(m.settlement?.left),
        right: Number(m.settlement?.right)
      };
      const rawOdds = {
        left: nullableNumber(m.odds?.left),
        right: nullableNumber(m.odds?.right)
      };
      const winner = m.winner;
      const validWinner = winner === 'left' || winner === 'right';
      const loser = validWinner ? OPP[winner] : null;
      const odds = { ...rawOdds };
      if (validWinner && odds[winner] === null && Number.isFinite(settlement[winner])) {
        odds[winner] = settlement[winner];
      }
      const id = String(m.id || `d${String(m.day ?? '?').padStart(2, '0')}m${String(m.match ?? index + 1).padStart(2, '0')}`);
      const day = Number(m.day);
      const match = Number(m.match);
      const favorite = Number.isFinite(support.left) && Number.isFinite(support.right)
        ? (support.left === support.right ? null : (support.left > support.right ? 'left' : 'right'))
        : null;
      const underdog = favorite ? OPP[favorite] : null;

      if (!validWinner) errors.push(`${id}: winner 必须是 left 或 right。`);
      if (!Number.isFinite(day) || !Number.isFinite(match)) errors.push(`${id}: day / match 必须是数字。`);
      if (!Number.isFinite(support.left) || !Number.isFinite(support.right)) {
        errors.push(`${id}: 支持率必须是数字。`);
      } else if (support.left + support.right !== 100) {
        warnings.push(`${id}: 支持率之和为 ${support.left + support.right}，不是 100。`);
      }
      if (!Number.isFinite(settlement.left) || !Number.isFinite(settlement.right)) {
        errors.push(`${id}: 结算倍率必须是数字。`);
      }
      if (validWinner && Number.isFinite(settlement[loser]) && settlement[loser] !== losing) {
        warnings.push(`${id}: 败方结算倍率为 ${settlement[loser]}，规则值为 ${losing}。`);
      }
      if (validWinner && Number.isFinite(settlement[winner]) && settlement[winner] < losing) {
        warnings.push(`${id}: 胜方结算倍率低于败方保底 ${losing}。`);
      }
      if (validWinner && rawOdds[winner] !== null && Number.isFinite(settlement[winner]) && rawOdds[winner] !== settlement[winner]) {
        warnings.push(`${id}: 胜方赛前赔率 ${rawOdds[winner]} 与结算倍率 ${settlement[winner]} 不一致。`);
      }

      return {
        ...m,
        id,
        day,
        match,
        support,
        settlement,
        rawOdds,
        odds,
        winner,
        loser,
        winnerMult: validWinner ? settlement[winner] : null,
        favorite,
        underdog,
        margin: Number.isFinite(support.left) && Number.isFinite(support.right)
          ? Math.abs(support.left - support.right)
          : null,
        underdogWin: favorite ? winner === underdog : null
      };
    }).sort((a, b) => a.day - b.day || a.match - b.match);

    const days = [...new Set(matches.map((m) => m.day))].sort((a, b) => a - b);
    const byDay = new Map(days.map((d) => [d, matches.filter((m) => m.day === d)]));
    const missingLoserOdds = matches.filter((m) => m.loser && m.rawOdds[m.loser] === null).length;

    for (const d of days) {
      const count = byDay.get(d).length;
      if (count < matchesPerDay) warnings.push(`第 ${d} 天只记录了 ${count}/${matchesPerDay} 场。`);
    }
    for (let d = 1; d <= Math.max(0, ...days); d += 1) {
      if (!byDay.has(d)) warnings.push(`第 ${d} 天没有记录。`);
    }
    const duplicates = matches.map((m) => m.id).filter((id, i, arr) => arr.indexOf(id) !== i);
    if (duplicates.length) errors.push(`重复的场次 ID：${[...new Set(duplicates)].join(', ')}`);

    return {
      raw,
      activity,
      name: activity.name || '活动数据分析',
      game: activity.game || '',
      version: activity.version || '',
      phase: activity.phase || '',
      startDate: activity.startDate || '',
      lastUpdated: activity.lastUpdated || '—',
      dataSource: activity.dataSource || '',
      totalDays,
      matchesPerDay,
      expectedMatches,
      dailyGrant,
      holdingCap,
      stake,
      losing,
      maxMultiplier,
      full,
      original,
      matches,
      days,
      byDay,
      missingLoserOdds,
      errors,
      warnings
    };
  }

  // ---------- analysis ----------

  const STRATEGY_DEFS = [
    { id: 'all-left', name: '全押左', pick: () => 'left' },
    { id: 'all-right', name: '全押右', pick: () => 'right' },
    { id: 'majority', name: '押支持率高的一方', pick: (m) => m.favorite || 'left' },
    { id: 'minority', name: '押支持率低的一方', pick: (m) => m.underdog || 'right' },
    { id: 'oracle-fixed', name: '全押中（固定 50/场）', pick: (m) => m.winner, reference: true }
  ];

  function runFixedStrategy(model, def) {
    const rows = model.matches.map((m) => {
      const side = def.pick(m);
      const mult = m.settlement[side];
      return {
        day: m.day,
        match: m.match,
        id: m.id,
        side,
        mult,
        points: mult * model.stake,
        win: side === m.winner
      };
    });
    const byDay = model.days.map((d) => sum(rows.filter((r) => r.day === d).map((r) => r.points)));
    const cumulative = [];
    let acc = 0;
    for (const value of byDay) {
      acc += value;
      cumulative.push(acc);
    }
    const wins = rows.filter((r) => r.win).length;
    const winningMults = rows.filter((r) => r.win).map((r) => r.mult);
    const total = acc;
    const base = model.stake * model.losing * model.matches.length;
    return {
      ...def,
      rows,
      byDay,
      cumulative,
      total,
      wins,
      avgWinMult: winningMults.length ? sum(winningMults) / winningMults.length : null,
      bonus: total - base
    };
  }

  function distStats(dist, stake, full, original) {
    let totalP = 0;
    for (const p of dist.values()) totalP += p;
    if (!totalP) return null;
    const items = [...dist.entries()]
      .map(([multSum, p]) => ({ score: multSum * stake, p: p / totalP }))
      .sort((a, b) => a.score - b.score);
    const mean = items.reduce((acc, it) => acc + it.score * it.p, 0);
    const quantile = (q) => {
      let acc = 0;
      for (const it of items) {
        acc += it.p;
        if (acc >= q - 1e-12) return it.score;
      }
      return items[items.length - 1].score;
    };
    const atLeast = (threshold) => items.reduce((acc, it) => acc + (it.score >= threshold ? it.p : 0), 0);
    return {
      items,
      mean,
      median: quantile(0.5),
      p20: quantile(0.2),
      p80: quantile(0.8),
      p05: quantile(0.05),
      p95: quantile(0.95),
      min: items[0].score,
      max: items[items.length - 1].score,
      pFull: atLeast(full),
      pOriginal: atLeast(original),
      states: items.length
    };
  }

  function randomStrategy(model, probFn) {
    let dist = new Map([[0, 1]]);
    const dayDists = [];
    for (const day of model.days) {
      for (const m of model.byDay.get(day)) {
        const next = new Map();
        for (const side of ['left', 'right']) {
          const p = Math.max(0, probFn(m, side));
          if (p === 0) continue;
          const mult = m.settlement[side];
          for (const [key, weight] of dist) {
            const nextKey = key + mult;
            next.set(nextKey, (next.get(nextKey) || 0) + weight * p);
          }
        }
        dist = next;
      }
      dayDists.push({
        day,
        stats: distStats(dist, model.stake, model.full, model.original)
      });
    }
    const stats = distStats(dist, model.stake, model.full, model.original);
    return {
      dayDists,
      stats,
      percentileOf: (score) => stats.items.reduce((acc, it) => acc + (it.score <= score ? it.p : 0), 0)
    };
  }

  function computeGodView(model, horizon) {
    const days = model.days.filter((d) => d <= horizon);
    const cap = model.holdingCap;
    const grant = model.dailyGrant;
    const bestByDay = new Map();
    for (const day of days) {
      const dayMatches = model.byDay.get(day) || [];
      if (!dayMatches.length) {
        bestByDay.set(day, null);
      } else {
        bestByDay.set(day, [...dayMatches].sort((a, b) =>
          b.winnerMult - a.winnerMult || a.match - b.match
        )[0]);
      }
    }

    let next = new Array(cap + 1).fill(0);
    const layers = [];
    for (let i = days.length - 1; i >= 0; i -= 1) {
      const day = days[i];
      const match = bestByDay.get(day);
      const currentLayer = new Array(cap + 1).fill(0);
      const choice = new Array(cap + 1).fill(0);
      for (let bal = 0; bal <= cap; bal += 1) {
        const available = Math.min(cap, bal + grant);
        if (!match) {
          currentLayer[bal] = next[available];
          choice[bal] = 0;
          continue;
        }
        let bestValue = -Infinity;
        let bestStake = 0;
        for (let stake = available; stake >= 0; stake -= 1) {
          const value = stake * match.winnerMult + next[available - stake];
          if (value > bestValue + 1e-9) {
            bestValue = value;
            bestStake = stake;
          }
        }
        currentLayer[bal] = bestValue;
        choice[bal] = bestStake;
      }
      layers.push({ day, match, choice });
      next = currentLayer;
    }

    let balance = 0;
    const plan = [];
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      const layer = layers[i];
      const available = Math.min(cap, balance + grant);
      const stake = layer.choice[balance];
      plan.push({
        day: layer.day,
        match: layer.match,
        stake,
        points: layer.match ? stake * layer.match.winnerMult : 0,
        balanceStart: available,
        balanceAfter: available - stake
      });
      balance = available - stake;
    }

    const byDay = plan.map((p) => p.points);
    const cumulative = [];
    let acc = 0;
    for (const value of byDay) {
      acc += value;
      cumulative.push(acc);
    }
    return {
      horizon,
      plan,
      byDay,
      cumulative,
      total: acc,
      used: sum(plan.map((p) => p.stake)),
      granted: days.length * grant
    };
  }

  function computeBuckets(model) {
    const buckets = Array.from({ length: 10 }, (_, i) => ({
      min: i * 10,
      max: i * 10 + 10,
      points: [],
      favoriteWins: 0,
      favoriteN: 0
    }));
    const oddsPoints = [];
    for (const m of model.matches) {
      if (m.favorite) {
        const idx = Math.min(9, Math.floor(m.support[m.favorite] / 10));
        buckets[idx].favoriteN += 1;
        if (m.winner === m.favorite) buckets[idx].favoriteWins += 1;
      }
      for (const side of ['left', 'right']) {
        if (m.odds[side] !== null && Number.isFinite(m.odds[side])) {
          const point = {
            support: m.support[side],
            odds: m.odds[side],
            side,
            match: m,
            role: side === m.winner ? 'winner' : 'loser',
            known: m.rawOdds[side] !== null
          };
          oddsPoints.push(point);
          const idx = Math.min(9, Math.floor(point.support / 10));
          buckets[idx].points.push(point);
        }
      }
    }
    return { buckets, oddsPoints };
  }

  function computeInsights(model, result) {
    const byId = Object.fromEntries(result.deterministic.map((s) => [s.id, s]));
    const naive = result.deterministic.filter((s) => !s.reference);
    const reached = naive.filter((s) => s.total >= model.full).length;
    const best = [...naive].sort((a, b) => b.total - a.total)[0];
    const minority = byId.minority;
    const majority = byId.majority;
    const remaining = model.expectedMatches - model.matches.length;
    const items = [];

    const minorityMults = [...new Set(minority.rows.filter((r) => r.win).map((r) => r.mult))]
      .sort((a, b) => a - b);
    const minorityText = minorityMults.length
      ? `胜场倍率 ${minorityMults.map((m) => `${m}×`).join(' / ')}`
      : '没有胜场';
    items.push(`固定 50 券：押冷门 <b>${fmt(minority.total)}</b> 分，押热门 <b>${fmt(majority.total)}</b> 分。冷门方 ${minority.wins}/${model.matches.length} 胜，${minorityText}。`);

    items.push(`随机策略：抛硬币期望 <b>${fmt(result.coin.stats.mean)}</b>，P(≥${fmt(model.full)}) 为 <b>${pct(result.coin.stats.pFull)}</b>；按支持率加权期望 <b>${fmt(result.support.stats.mean)}</b>，P(≥${fmt(model.full)}) 为 <b>${pct(result.support.stats.pFull)}</b>。`);

    items.push(`满奖励线 <b>${fmt(model.full)}</b>：${naive.length} 个朴素固定策略中有 <b>${reached}</b> 个在样本内达到；上帝视角上限为 <b>${fmt(result.god.total)}</b>。`);

    const oddsValues = [...new Set(result.buckets.oddsPoints.map((p) => p.odds))].sort((a, b) => a - b);
    const emptyBuckets = result.buckets.buckets
      .filter((b) => b.points.length === 0)
      .map((b) => `${b.min}–${b.max}%`);
    const sortedPoints = [...result.buckets.oddsPoints]
      .sort((a, b) => a.support - b.support || a.odds - b.odds);
    let jump = null;
    for (let i = 1; i < sortedPoints.length; i += 1) {
      if (sortedPoints[i].odds !== sortedPoints[i - 1].odds) {
        const gap = sortedPoints[i].support - sortedPoints[i - 1].support;
        if (!jump || gap < jump.gap) {
          jump = { gap, a: sortedPoints[i - 1], b: sortedPoints[i] };
        }
      }
    }
    items.push(`赔率档位 ${oddsValues.map((v) => `${v}×`).join(' / ') || '—'}${jump ? `；最密集跳变 ${jump.a.support}%→${jump.a.odds}×、${jump.b.support}%→${jump.b.odds}×` : ''}；空档 ${emptyBuckets.join('、') || '无'}。`);

    if (remaining > 0) {
      items.push(`已记录 ${model.matches.length}/${model.expectedMatches} 场；剩余 ${remaining} 场可能改变排序，以上均为样本内观察。`);
    } else {
      items.push(`已记录全部 ${model.matches.length} 场；以上仍为样本内观察，不构成对未来比赛的预测。`);
    }
    if (best) items[0] += ` 样本内最佳朴素策略是「${best.name}」，${fmt(best.total)} 分。`;
    return items;
  }

  function computeAnalysis(model) {
    const deterministic = STRATEGY_DEFS.map((def) => runFixedStrategy(model, def));
    const coin = randomStrategy(model, () => 0.5);
    const support = randomStrategy(model, (m, side) => {
      const totalSupport = m.support.left + m.support.right;
      return totalSupport > 0 ? m.support[side] / totalSupport : 0.5;
    });
    for (const strategy of deterministic) {
      strategy.pctCoin = coin.percentileOf(strategy.total);
      strategy.pctSupport = support.percentileOf(strategy.total);
    }
    const godPrefixes = model.days.map((day) => computeGodView(model, day));
    const god = godPrefixes[godPrefixes.length - 1] || computeGodView(model, 0);
    const buckets = computeBuckets(model);
    const result = {
      deterministic,
      coin,
      support,
      god,
      godPrefixes,
      buckets,
      base: model.stake * model.losing * model.matches.length
    };
    result.insights = computeInsights(model, result);
    return result;
  }

  // ---------- DOM helpers ----------

  function table(headers, rows, numericCols = [], options = {}) {
    const headerHtml = headers.map((h, i) =>
      `<th class="${numericCols.includes(i) ? 'num' : ''}">${esc(h)}</th>`
    ).join('');
    const bodyHtml = rows.map((row) => {
      const cls = row.__class || '';
      const cells = row.cells.map((cell, i) =>
        `<td class="${numericCols.includes(i) ? 'num' : ''}">${cell}</td>`
      ).join('');
      return `<tr class="${cls}">${cells}</tr>`;
    }).join('');
    return `<table>${options.caption ? `<caption>${esc(options.caption)}</caption>` : ''}<thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
  }

  function kpi(label, value, sub, accent = '', tag = '', smallValue = false) {
    return `<article class="kpi ${accent}">
      <div class="kpi-top">
        <span class="kpi-label">${esc(label)}</span>
        ${tag ? `<span class="badge">${esc(tag)}</span>` : ''}
      </div>
      <div class="kpi-value ${smallValue ? 'small' : ''}">${value}</div>
      <div class="kpi-sub">${sub}</div>
    </article>`;
  }

  function setText(selector, text) {
    const el = $(selector);
    if (el) el.textContent = text;
  }

  function showError(title, detail, hint = '') {
    const panel = $('#error-panel');
    if (!panel) return;
    panel.classList.remove('hidden');
    panel.innerHTML = `<div class="notice-title">${esc(title)}</div>
      <p>${esc(detail)}</p>
      ${hint ? `<pre>${esc(hint)}</pre>` : ''}`;
    $('#loading')?.classList.add('hidden');
  }

  function showWarnings(warnings) {
    const panel = $('#warning-panel');
    if (!panel) return;
    if (!warnings.length) {
      panel.classList.add('hidden');
      panel.innerHTML = '';
      return;
    }
    panel.classList.remove('hidden');
    panel.innerHTML = `<div class="notice-title">数据提示 · ${warnings.length}</div>
      <ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`;
  }

  function showLoading() {
    $('#loading')?.classList.remove('hidden');
    $('#error-panel')?.classList.add('hidden');
    $('#warning-panel')?.classList.add('hidden');
  }

  function hideLoading() {
    $('#loading')?.classList.add('hidden');
  }

  // ---------- header and KPIs ----------

  function renderHeader(model, result, url) {
    document.title = `${model.name} · 支持率与倍率分析`;
    setText('#status-badge', `已记录 ${model.days.length}/${model.totalDays} 天 · ${model.matches.length}/${model.expectedMatches} 场`);
    setText('#last-updated', `更新 ${model.lastUpdated}`);
    setText('#meta-activity', [model.game, model.version, model.phase, model.startDate].filter(Boolean).join(' · ') || '—');
    setText('#meta-source', url.split('/').pop() || url);
    setText('#meta-multiplier', `败方 ${model.losing}× · 上限 ${model.maxMultiplier}×`);
    setText('#meta-score', `押 n 券 → n × 结算倍率积分`);

    const dataLink = $('#data-link');
    if (dataLink) {
      dataLink.href = url;
      dataLink.textContent = url;
    }

    const badgeWrap = $('#status-badge-wrap');
    if (badgeWrap) {
      badgeWrap.className = model.warnings.length ? 'badge warn' : 'badge gold';
    }
    setText('#overview-caption', `已记录 ${model.days.length}/${model.totalDays} 天 · ${model.matches.length}/${model.expectedMatches} 场 · 每场 ${model.stake} 券`);
    setText('#data-caption', `${url.split('/').pop()} · 记录 ${model.dataSource || '—'} · 赔率点 ${result.buckets.oddsPoints.length} 个`);
  }

  function renderKpis(model, result) {
    const naive = result.deterministic.filter((s) => !s.reference);
    const best = [...naive].sort((a, b) => b.total - a.total)[0];
    const fullReached = naive.filter((s) => s.total >= model.full).length;
    const completionFloor = model.stake * model.losing * model.expectedMatches;
    const oracle = result.deterministic.find((s) => s.id === 'oracle-fixed');
    const kpis = [
      kpi('已记录', `${model.days.length}<span class="muted" style="font-size:.55em"> / ${model.totalDays} 天</span>`,
        `${model.matches.length} / ${model.expectedMatches} 场 · 每场 ${model.stake} 券`, 'blue', 'LIVE', true),
      kpi('满奖励线', fmt(model.full),
        `${naive.length} 个朴素固定策略中 ${fullReached} 个在样本内达到`, 'red', 'THRESHOLD'),
      kpi('固定 50 券保底', fmt(result.base),
        `当前 ${model.matches.length} 场全押错；完赛 ${fmt(completionFloor)}`, '', 'FLOOR'),
      kpi('样本内最佳固定策略', `${esc(shortName(best?.name || '—'))}<span class="muted" style="font-size:.55em"> ${fmt(best?.total)}</span>`,
        best ? `${best.name} · 胜率 ${best.wins}/${model.matches.length} · 胜场均倍率 ${fmt1(best.avgWinMult)}` : '—', 'gold', 'IN-SAMPLE', true),
      kpi('上帝视角最高分', fmt(result.god.total),
        `已用 ${fmt(result.god.used)} 券 · 截至第 ${model.days[model.days.length - 1] || 0} 天`, 'jade', 'HINDSIGHT'),
      kpi('随机策略期望', `<span style="font-size:.72em">${fmt(result.support.stats.mean)} – ${fmt(result.coin.stats.mean)}</span>`,
        `加权 / 抛硬币 · P(≥${fmt(model.full)}) ${pct(result.support.stats.pFull)} / ${pct(result.coin.stats.pFull)}`, 'blue', 'EXPECTED', true)
    ];
    $('#kpis').innerHTML = kpis.join('');

    const godKpis = [
      kpi('上帝视角最高分', fmt(result.god.total), `截至第 ${model.days[model.days.length - 1] || 0} 天`, 'gold', 'MAX'),
      kpi('固定 50 全押中', fmt(oracle?.total || 0), '每场 50 券的参考上限，不是动态最优', '', 'REFERENCE'),
      kpi('满奖励线', fmt(model.full), `高出 ${fmt(Math.max(0, result.god.total - model.full))} 分`, 'red', 'TARGET'),
      kpi('券使用', `${fmt(result.god.used)} <span class="muted" style="font-size:.6em">/ ${fmt(result.god.granted)}</span>`, '已发放券（截至当前场次）', 'jade', 'BANKROLL', true)
    ];
    $('#god-kpis').innerHTML = godKpis.join('');
  }

  function renderInsights(result) {
    $('#insights').innerHTML = result.insights.map((text, i) =>
      `<div class="insight">
        <span class="insight-num">${String(i + 1).padStart(2, '0')}</span>
        <div>${text}</div>
      </div>`
    ).join('');
  }

  // ---------- tables ----------

  function renderStrategyTable(model, result) {
    const rows = result.deterministic.map((s) => {
      const reach = s.total >= model.full
        ? '<span class="badge gold">达到</span>'
        : `<span class="badge">差 ${fmt(model.full - s.total)}</span>`;
      return {
        __class: s.reference ? 'ref-row' : '',
        cells: [
          `${esc(s.name)}${s.reference ? '<span class="sub-line">固定 50 券的参考上限</span>' : ''}`,
          `<span class="${s.reference ? 'gold' : ''}">${fmt(s.total)}</span>`,
          fmt(s.bonus),
          `${s.wins}/${model.matches.length}`,
          fmt1(s.avgWinMult),
          reach,
          pct(s.pctCoin),
          pct(s.pctSupport)
        ]
      };
    });
    $('#strategy-table').innerHTML = table(
      ['策略', '总得分', '相对保底加成', '胜场', '胜场均倍率', '满奖励', '抛硬币分位', '加权分位'],
      rows,
      [1, 2, 3, 4, 6, 7]
    ) + `<p class="muted" style="margin:10px 2px 0;font-size:11.5px">分位 = 该随机策略得分不超过此确定性策略的概率。确定性策略是事后选出的，不能当作预测。</p>`;
  }

  function renderRandomTable(model, result) {
    const rows = [
      { name: '抛硬币选边', stats: result.coin.stats },
      { name: '按支持率加权选边', stats: result.support.stats }
    ].map(({ name, stats }) => ({
      cells: [
        esc(name),
        fmt(stats.mean),
        fmt(stats.median),
        fmt(stats.p20),
        fmt(stats.p80),
        fmt(stats.p05),
        fmt(stats.p95),
        fmt(stats.min),
        fmt(stats.max),
        `<span class="gold">${pct(stats.pFull)}</span>`,
        pct(stats.pOriginal)
      ]
    }));
    $('#random-table').innerHTML = table(
      ['策略', '期望', '中位数', 'P20', 'P80', 'P5', 'P95', '最低', '最高', `P(≥${fmt(model.full)})`, `P(≥${fmt(model.original)})`],
      rows,
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    ) + `<p class="muted" style="margin:10px 2px 0;font-size:11.5px">按支持率加权 = 每场独立以双方支持率为概率选边。该假设不代表真实人群的联合分布，只能作为随机策略的定义。</p>`;
  }

  function renderBucketTable(model, result) {
    const rows = result.buckets.buckets.map((b) => {
      const points = b.points
        .slice()
        .sort((a, b2) => a.support - b2.support)
        .map((p) => `${p.support}%→${p.odds}×`)
        .join('、');
      const odds = [...new Set(b.points.map((p) => p.odds))].sort((a, b2) => a - b2).join(' / ');
      const fav = b.favoriteN ? `${b.favoriteWins}/${b.favoriteN}` : '—';
      return {
        cells: [
          `${b.min}–${b.max}%`,
          points || '<span class="faint">—</span>',
          odds || '<span class="faint">—</span>',
          b.points.length || '—',
          fav
        ]
      };
    });
    $('#bucket-table').innerHTML = table(
      ['支持率区间', '观测点（支持率→赔率）', '倍率', '赔率点', '热门方胜率'],
      rows,
      [2, 3, 4]
    ) + `<p class="muted" style="margin:10px 2px 0;font-size:11.5px">包含 ${result.buckets.oddsPoints.length} 个赔率点：${result.buckets.oddsPoints.filter((p) => p.role === 'winner').length} 个胜方点 + ${result.buckets.oddsPoints.filter((p) => p.role === 'loser').length} 个已知败方赛前赔率点。败方赔率被结算值 10 覆盖，因此缺失较多。</p>`;
  }

  function renderGodPlan(model, result) {
    const rows = result.god.plan.map((row) => {
      const m = row.match;
      const matchLabel = m ? `${m.match}` : '—';
      const side = m ? SIDE_LABEL[m.winner] : '—';
      const support = m ? `${m.support[m.winner]}%` : '—';
      const mult = m ? `${m.winnerMult}×` : '—';
      return {
        cells: [
          `第 ${row.day} 天`,
          `${matchLabel}${m && m.teams ? `<span class="sub-line">${esc(m.teams.left)} vs ${esc(m.teams.right)}</span>` : ''}`,
          row.stake > 0 ? `<span class="winner-cell">${side}</span>` : '<span class="faint">不押</span>',
          support,
          mult,
          row.stake > 0 ? fmt(row.stake) : '<span class="faint">0</span>',
          row.points > 0 ? `<span class="gold">${fmt(row.points)}</span>` : '<span class="faint">0</span>',
          fmt(row.balanceAfter)
        ]
      };
    });
    rows.push({
      __class: 'total-row',
      cells: [
        '合计',
        `${result.god.plan.filter((p) => p.stake > 0).length} 次下注`,
        '—',
        '—',
        '—',
        fmt(result.god.used),
        fmt(result.god.total),
        fmt(result.god.plan[result.god.plan.length - 1]?.balanceAfter ?? 0)
      ]
    });
    $('#god-plan-table').innerHTML = table(
      ['天', '场', '方向', '支持率', '倍率', '押注券', '当日得分', '日终余额'],
      rows,
      [3, 4, 5, 6, 7]
    );
    $('#god-prefixes').innerHTML = `<span>逐日重算上限：</span>` +
      result.godPrefixes.map((g) => `<span class="pill"><b>D${g.horizon}</b> ${fmt(g.total)}</span>`).join('<span class="arrow">→</span>') +
      `<span class="muted" style="margin-left:6px">若只考虑到当天，最优计划可能不同</span>`;
  }

  function renderMatchTable(model) {
    const rows = model.matches.map((m) => {
      const support = `<span class="${m.favorite === 'left' ? 'winner-cell' : ''}">左 ${m.support.left}</span> <span class="faint">:</span> <span class="${m.favorite === 'right' ? 'winner-cell' : ''}">右 ${m.support.right}</span>`;
      const odds = `<span class="${m.rawOdds.left === null ? 'faint' : ''}">${m.rawOdds.left === null ? '—' : m.rawOdds.left}</span> <span class="faint">:</span> <span class="${m.rawOdds.right === null ? 'faint' : ''}">${m.rawOdds.right === null ? '—' : m.rawOdds.right}</span>`;
      const settlement = `<span class="${m.winner === 'left' ? 'winner-cell' : 'loser-cell'}">${m.settlement.left}</span> <span class="faint">:</span> <span class="${m.winner === 'right' ? 'winner-cell' : 'loser-cell'}">${m.settlement.right}</span>`;
      const type = m.underdogWin === null
        ? '—'
        : (m.underdogWin
          ? '<span class="badge gold">冷门胜</span>'
          : '<span class="badge jade">热门胜</span>');
      return {
        cells: [
          `第 ${m.day} 天`,
          `${m.match}${m.teams ? `<span class="sub-line">${esc(m.teams.left)} vs ${esc(m.teams.right)}</span>` : ''}`,
          support,
          odds,
          settlement,
          `<span class="${m.winner === 'left' ? 'gold' : 'jade'}">${SIDE_LABEL[m.winner]}</span>`,
          `${m.winnerMult}×`,
          type
        ]
      };
    });
    $('#match-table').innerHTML = table(
      ['天', '场', '支持率（左:右）', '赛前赔率（记录）', '结算倍率（左:右）', '胜方', '胜方倍率', '类型'],
      rows,
      [2, 3, 4, 6]
    ) + `<p class="muted" style="margin:10px 2px 0;font-size:11.5px">赛前赔率列保留 JSON 原始记录；散点图中的胜方赔率会在缺失时用结算倍率补全。另有 ${model.missingLoserOdds} 个败方赛前赔率未记录。</p>`;
  }

  function renderMethodNotes(model, result) {
    const count = result.buckets.oddsPoints.length;
    const states = result.coin.stats.states;
    const threshold = model.full;
    const emptyBuckets = result.buckets.buckets
      .filter((b) => b.points.length === 0)
      .map((b) => `${b.min}–${b.max}%`);
    const minorityWins = result.deterministic.find((s) => s.id === 'minority')?.wins ?? 0;
    $('#method-notes').innerHTML = `<ul>
      <li><strong>得分</strong>：押 n 券，结算时获得 n × 结算倍率积分；押错固定 10×。已按你的说明确认。</li>
      <li><strong>固定策略</strong>：每场 ${model.stake} 券，当前 ${model.matches.length} 场共 ${fmt(model.stake * model.matches.length)} 券；完赛 ${model.expectedMatches} 场共 ${fmt(model.stake * model.expectedMatches)} 券。</li>
      <li><strong>随机策略</strong>：逐场把两种结算倍率的分布做精确卷积，共 ${states} 个不同得分；没有使用蒙特卡洛。</li>
      <li><strong>上帝视角</strong>：动态规划；每日开始时发 ${model.dailyGrant} 券、持有上限 ${model.holdingCap}、可攒券、单场不限金额；每天只押当天胜方倍率更高的一场。</li>
      <li><strong>奖励线</strong>：${fmt(model.original)} = ${model.expectedMatches} 场全押错的保底，可拿满原始奖励；8,000 分后的奖励非原石；${fmt(threshold)} = 满奖励线。</li>
      <li><strong>赔率点</strong>：当前 ${count} 个（${result.buckets.oddsPoints.filter((p) => p.role === 'winner').length} 胜方 + ${result.buckets.oddsPoints.filter((p) => p.role === 'loser').length} 已知败方）。</li>
    </ul>`;
    $('#caveats').innerHTML = `<ul>
      <li>随机策略的随机性<strong>只来自选边</strong>，比赛结果按已记录事实固定；这是条件于历史的回测，不是预测。</li>
      <li>押热门/冷门使用<strong>收盘支持率</strong>；现实中只能在临近收盘时按实时支持率决策，存在轻微前视偏差。</li>
      <li>当前只有 ${model.matches.length} 场，冷门策略的领先主要来自 ${minorityWins} 次获胜，样本量不足以证明稳定优势。</li>
      <li>支持率—倍率关系仍有空档${emptyBuckets.length ? `（${emptyBuckets.join('、')}）` : ''}；败方赛前赔率缺失最多，记录双方赔率能显著提高这一节的信息量。</li>
      <li>上帝视角基于已记录场次；明后天出现更高倍率时，最优计划会改变。页面重新读取 JSON 后自动重算，无需重建。</li>
    </ul>`;
  }

  // ---------- charts ----------

  function disposeCharts() {
    for (const chart of charts) {
      try { chart.dispose(); } catch (e) { /* noop */ }
    }
    charts.length = 0;
  }

  function makeChart(id, option) {
    const el = document.getElementById(id);
    if (!el) return null;
    const chart = echarts.init(el, null, { renderer: 'canvas' });
    chart.setOption(option);
    charts.push(chart);
    return chart;
  }

  function axisStyle(p, { value = false, labels = {}, line = {}, ...rest } = {}) {
    return {
      type: value ? 'value' : 'category',
      axisLine: { lineStyle: { color: p.line, ...line } },
      axisTick: { show: false },
      axisLabel: { color: p.muted, fontFamily: FONT_MONO, fontSize: 10.5, ...labels },
      splitLine: value
        ? { show: true, lineStyle: { color: p.grid, type: 'dashed' } }
        : { show: false },
      ...rest
    };
  }

  function tooltipStyle(p, formatter, trigger = 'axis') {
    return {
      trigger,
      backgroundColor: p.tooltipBg,
      borderColor: p.tooltipBorder,
      borderWidth: 1,
      padding: [10, 12],
      textStyle: { color: p.text, fontFamily: FONT_BODY, fontSize: 12 },
      extraCssText: 'box-shadow:0 14px 34px rgba(0,0,0,.28);max-width:420px;white-space:normal;',
      formatter
    };
  }

  function legendStyle(p, data) {
    return {
      data,
      type: 'scroll',
      top: 0,
      left: 0,
      itemWidth: 12,
      itemHeight: 7,
      icon: 'roundRect',
      textStyle: { color: p.muted, fontFamily: FONT_BODY, fontSize: 11 },
      inactiveColor: p.faint,
      pageIconColor: p.gold,
      pageIconInactiveColor: p.faint,
      pageTextStyle: { color: p.muted, fontFamily: FONT_MONO, fontSize: 10 }
    };
  }

  function thresholdMarkLines(p, full, original, labelPos = 'insideEndTop') {
    return {
      silent: true,
      symbol: 'none',
      data: [
        {
          yAxis: full,
          lineStyle: { color: p.red, type: 'dashed', width: 1 },
          label: {
            formatter: `满奖励 ${fmt(full)}`,
            color: p.red,
            fontFamily: FONT_MONO,
            fontSize: 10,
            position: labelPos
          }
        },
        {
          yAxis: original,
          lineStyle: { color: p.muted, type: 'dotted', width: 1 },
          label: {
            formatter: `原始奖励 ${fmt(original)}`,
            color: p.muted,
            fontFamily: FONT_MONO,
            fontSize: 10,
            position: 'insideEndBottom'
          }
        }
      ]
    };
  }

  function renderStrategyCumChart(model, result) {
    const p = palette();
    const names = result.deterministic.map((s) => s.name);
    const series = result.deterministic.map((strategy, index) => {
      const color = strategy.reference ? p.muted : p.series[index % p.series.length];
      return {
        name: strategy.name,
        type: 'line',
        data: [0, ...strategy.cumulative],
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { width: strategy.reference ? 1.8 : 2, type: strategy.reference ? 'dashed' : 'solid', color },
        itemStyle: { color },
        emphasis: { focus: 'series' },
        z: strategy.reference ? 1 : 2,
        markLine: index === 0 ? thresholdMarkLines(p, model.full, model.original) : undefined
      };
    });
    makeChart('strategy-cum-chart', {
      backgroundColor: 'transparent',
      textStyle: { fontFamily: FONT_BODY, color: p.text },
      animationDuration: 650,
      legend: legendStyle(p, names),
      tooltip: tooltipStyle(p, (params) => {
        const idx = params[0].dataIndex;
        const title = idx === 0 ? '开始' : `第 ${model.days[idx - 1]} 天结束`;
        return `<b>${title}</b><br>` + params
          .filter((item) => item.value !== undefined)
          .map((item) => `${item.marker}${esc(item.seriesName)} <b style="float:right;margin-left:18px">${fmt(item.value)}</b>`)
          .join('<br>');
      }),
      grid: { left: 68, right: 26, top: 46, bottom: 42, containLabel: true },
      xAxis: axisStyle(p, { data: ['开始', ...model.days.map((d) => `D${d}`)], boundaryGap: false }),
      yAxis: axisStyle(p, {
        value: true,
        labels: { formatter: (v) => compact(v) },
        name: '累计得分',
        nameTextStyle: { color: p.muted, fontFamily: FONT_BODY, fontSize: 10 }
      }),
      series
    });
  }

  function renderStrategyFinalChart(model, result) {
    const p = palette();
    const names = result.deterministic.map((s) => shortName(s.name));
    const totals = result.deterministic.map((s) => s.total);
    const bases = result.deterministic.map(() => result.base);
    const bonuses = result.deterministic.map((s) => Math.max(0, s.total - result.base));
    makeChart('strategy-final-chart', {
      backgroundColor: 'transparent',
      textStyle: { fontFamily: FONT_BODY, color: p.text },
      animationDuration: 650,
      legend: legendStyle(p, ['保底', '加成']),
      tooltip: tooltipStyle(p, (params) => {
        const idx = params[0].dataIndex;
        const strategy = result.deterministic[idx];
        return `<b>${esc(strategy.name)}</b><br>保底 <b>${fmt(result.base)}</b><br>加成 <b>${fmt(strategy.bonus)}</b><br>合计 <b>${fmt(strategy.total)}</b>`;
      }),
      grid: { left: 66, right: 24, top: 52, bottom: 46, containLabel: true },
      xAxis: axisStyle(p, {
        data: names,
        labels: { rotate: names.some((n) => n.length > 5) ? 18 : 0, interval: 0 }
      }),
      yAxis: axisStyle(p, {
        value: true,
        labels: { formatter: (v) => compact(v) },
        name: '得分',
        nameTextStyle: { color: p.muted, fontFamily: FONT_BODY, fontSize: 10 }
      }),
      series: [
        {
          name: '保底',
          type: 'bar',
          stack: 'total',
          barWidth: '46%',
          data: bases,
          itemStyle: { color: p.baseBar },
          emphasis: { focus: 'series' },
          markLine: thresholdMarkLines(p, model.full, model.original)
        },
        {
          name: '加成',
          type: 'bar',
          stack: 'total',
          data: bonuses,
          itemStyle: { color: p.gold },
          label: {
            show: true,
            position: 'top',
            color: p.text,
            fontFamily: FONT_MONO,
            fontSize: 10,
            formatter: (params) => fmt(totals[params.dataIndex])
          },
          emphasis: { focus: 'series' }
        }
      ]
    });
  }

  function niceBinWidth(range) {
    if (!Number.isFinite(range) || range <= 0) return 500;
    const raw = range / 18;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const candidates = [1, 2, 2.5, 5, 10].map((x) => x * pow);
    return candidates.find((c) => c >= raw) || candidates[candidates.length - 1];
  }

  function buildHistogram(model, result) {
    const allScores = [
      ...result.coin.stats.items.map((it) => it.score),
      ...result.support.stats.items.map((it) => it.score)
    ];
    const minScore = Math.min(...allScores, model.original);
    const maxScore = Math.max(...allScores, model.full, model.original);
    const width = niceBinWidth(maxScore - minScore);
    const start = Math.floor(minScore / width) * width;
    const end = Math.ceil(maxScore / width) * width;
    const bins = [];
    for (let x = start; x < end; x += width) bins.push({ start: x, end: x + width });
    const fill = (stats) => {
      const values = bins.map(() => 0);
      for (const item of stats.items) {
        const idx = Math.min(bins.length - 1, Math.max(0, Math.floor((item.score - start) / width)));
        values[idx] += item.p;
      }
      return values;
    };
    return {
      bins,
      width,
      start,
      coin: fill(result.coin.stats),
      support: fill(result.support.stats),
      thresholdIndex: (value) => Math.min(bins.length - 1, Math.max(0, Math.floor((value - start) / width)))
    };
  }

  function renderHistChart(model, result) {
    const p = palette();
    const hist = buildHistogram(model, result);
    const labels = hist.bins.map((b) => `${compact(b.start)}–${compact(b.end)}`);
    const fullX = hist.thresholdIndex(model.full);
    const originalX = hist.thresholdIndex(model.original);
    makeChart('hist-chart', {
      backgroundColor: 'transparent',
      textStyle: { fontFamily: FONT_BODY, color: p.text },
      animationDuration: 650,
      legend: legendStyle(p, ['抛硬币选边', '按支持率加权选边']),
      tooltip: tooltipStyle(p, (params) => {
        const idx = params[0].dataIndex;
        const bin = hist.bins[idx];
        return `<b>${fmt(bin.start)} – ${fmt(bin.end)}</b><br>` + params
          .map((item) => `${item.marker}${esc(item.seriesName)} <b style="float:right;margin-left:18px">${pct(item.value)}</b>`)
          .join('<br>');
      }),
      grid: { left: 62, right: 22, top: 48, bottom: 58, containLabel: true },
      xAxis: axisStyle(p, {
        data: labels,
        labels: { rotate: 34, interval: Math.max(0, Math.ceil(labels.length / 12) - 1) }
      }),
      yAxis: axisStyle(p, {
        value: true,
        labels: { formatter: (v) => `${Math.round(v * 100)}%` },
        name: '概率',
        nameTextStyle: { color: p.muted, fontFamily: FONT_BODY, fontSize: 10 }
      }),
      series: [
        {
          name: '抛硬币选边',
          type: 'bar',
          data: hist.coin,
          barGap: '8%',
          itemStyle: { color: p.gold, opacity: 0.9 },
          emphasis: { focus: 'series' },
          markLine: {
            silent: true,
            symbol: 'none',
            data: [
              {
                xAxis: fullX,
                lineStyle: { color: p.red, type: 'dashed', width: 1 },
                label: { formatter: `满奖励 ${fmt(model.full)}`, color: p.red, fontFamily: FONT_MONO, fontSize: 10, position: 'insideEndTop' }
              },
              {
                xAxis: originalX,
                lineStyle: { color: p.muted, type: 'dotted', width: 1 },
                label: { formatter: `原始 ${fmt(model.original)}`, color: p.muted, fontFamily: FONT_MONO, fontSize: 10, position: 'insideEndBottom' }
              }
            ]
          }
        },
        {
          name: '按支持率加权选边',
          type: 'bar',
          data: hist.support,
          itemStyle: { color: p.jade, opacity: 0.82 },
          emphasis: { focus: 'series' }
        }
      ]
    });
  }

  function renderCdfChart(model, result) {
    const p = palette();
    const toCdf = (stats) => {
      let acc = 0;
      return stats.items.map((it) => {
        acc += it.p;
        return [it.score, Math.min(1, acc)];
      });
    };
    const coinCdf = toCdf(result.coin.stats);
    const supportCdf = toCdf(result.support.stats);
    const minX = Math.min(coinCdf[0]?.[0] ?? 0, supportCdf[0]?.[0] ?? 0);
    const maxX = Math.max(coinCdf.at(-1)?.[0] ?? 0, supportCdf.at(-1)?.[0] ?? 0, model.full);
    makeChart('cdf-chart', {
      backgroundColor: 'transparent',
      textStyle: { fontFamily: FONT_BODY, color: p.text },
      animationDuration: 650,
      legend: legendStyle(p, ['抛硬币选边', '按支持率加权选边']),
      tooltip: tooltipStyle(p, (params) => {
        const score = params[0]?.value?.[0];
        return `<b>得分 ${fmt(score)}</b><br>` + params
          .map((item) => `${item.marker}${esc(item.seriesName)} <b style="float:right;margin-left:18px">${pct(item.value?.[1])}</b>`)
          .join('<br>');
      }),
      grid: { left: 62, right: 24, top: 48, bottom: 64, containLabel: true },
      xAxis: axisStyle(p, {
        value: true,
        min: minX,
        max: maxX,
        labels: { formatter: (v) => compact(v) },
        name: '得分',
        nameLocation: 'middle',
        nameGap: 30,
        nameTextStyle: { color: p.muted, fontFamily: FONT_BODY, fontSize: 10 }
      }),
      yAxis: axisStyle(p, {
        value: true,
        min: 0,
        max: 1,
        labels: { formatter: (v) => `${Math.round(v * 100)}%` },
        name: '累计概率',
        nameTextStyle: { color: p.muted, fontFamily: FONT_BODY, fontSize: 10 }
      }),
      series: [
        {
          name: '抛硬币选边',
          type: 'line',
          step: 'end',
          showSymbol: false,
          data: coinCdf,
          lineStyle: { color: p.gold, width: 2 },
          itemStyle: { color: p.gold },
          emphasis: { focus: 'series' },
          markLine: {
            silent: true,
            symbol: 'none',
            data: [
              {
                xAxis: model.full,
                lineStyle: { color: p.red, type: 'dashed', width: 1 },
                label: { formatter: `满奖励 ${fmt(model.full)}`, color: p.red, fontFamily: FONT_MONO, fontSize: 10, position: 'insideEndTop' }
              },
              {
                xAxis: model.original,
                lineStyle: { color: p.muted, type: 'dotted', width: 1 },
                label: { formatter: `原始 ${fmt(model.original)}`, color: p.muted, fontFamily: FONT_MONO, fontSize: 10, position: 'insideEndBottom' }
              }
            ]
          }
        },
        {
          name: '按支持率加权选边',
          type: 'line',
          step: 'end',
          showSymbol: false,
          data: supportCdf,
          lineStyle: { color: p.jade, width: 2 },
          itemStyle: { color: p.jade },
          emphasis: { focus: 'series' }
        }
      ]
    });
  }

  function renderDailyBandChart(model, result) {
    const p = palette();
    const days = model.days;
    const coin = result.coin.dayDists.map((d) => d.stats);
    const support = result.support.dayDists.map((d) => d.stats);
    const bandSeries = (prefix, stats, color, bandColor, stack) => [
      {
        name: `${prefix}下界`,
        type: 'line',
        stack,
        data: stats.map((s) => s.p20),
        lineStyle: { opacity: 0 },
        symbol: 'none',
        areaStyle: { opacity: 0 },
        silent: true,
        tooltip: { show: false },
        legendHoverLink: false
      },
      {
        name: `${prefix} 20–80%`,
        type: 'line',
        stack,
        data: stats.map((s) => Math.max(0, s.p80 - s.p20)),
        lineStyle: { opacity: 0 },
        symbol: 'none',
        areaStyle: { color: bandColor },
        silent: true,
        tooltip: { show: false },
        legendHoverLink: false
      },
      {
        name: `${prefix}中位数`,
        type: 'line',
        data: stats.map((s) => s.median),
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color, width: 2 },
        itemStyle: { color },
        emphasis: { focus: 'series' }
      }
    ];
    makeChart('daily-band-chart', {
      backgroundColor: 'transparent',
      textStyle: { fontFamily: FONT_BODY, color: p.text },
      animationDuration: 650,
      legend: legendStyle(p, ['抛硬币中位数', '按支持率加权中位数']),
      tooltip: tooltipStyle(p, (params) => {
        const idx = params[0]?.dataIndex ?? 0;
        const c = coin[idx];
        const s = support[idx];
        return `<b>第 ${days[idx]} 天</b><br>
          <span style="color:${p.gold}">●</span> 抛硬币：P20 ${fmt(c.p20)} · 中位 <b>${fmt(c.median)}</b> · P80 ${fmt(c.p80)}<br>
          <span style="color:${p.jade}">●</span> 按支持率加权：P20 ${fmt(s.p20)} · 中位 <b>${fmt(s.median)}</b> · P80 ${fmt(s.p80)}`;
      }),
      grid: { left: 66, right: 24, top: 48, bottom: 44, containLabel: true },
      xAxis: axisStyle(p, { data: days.map((d) => `D${d}`), boundaryGap: false }),
      yAxis: axisStyle(p, {
        value: true,
        labels: { formatter: (v) => compact(v) },
        name: '累计得分',
        nameTextStyle: { color: p.muted, fontFamily: FONT_BODY, fontSize: 10 }
      }),
      series: [
        ...bandSeries('抛硬币', coin, p.gold, p.coinBand, 'coinBand'),
        ...bandSeries('按支持率加权', support, p.jade, p.supportBand, 'supportBand')
      ].map((series, index) => {
        if (index === 2) series.markLine = thresholdMarkLines(p, model.full, model.original);
        return series;
      })
    });
  }

  function renderOddsChart(model, result) {
    const p = palette();
    const winners = result.buckets.oddsPoints
      .filter((pt) => pt.role === 'winner')
      .map((pt) => [pt.support, pt.odds, pt]);
    const losers = result.buckets.oddsPoints
      .filter((pt) => pt.role === 'loser')
      .map((pt) => [pt.support, pt.odds, pt]);
    const pointTooltip = (params) => {
      const pt = params.data?.[2];
      if (!pt) return '';
      return `<b>${esc(pt.match.id)}</b> · ${pt.role === 'winner' ? '胜方赛前赔率' : '已知败方赛前赔率'}<br>
        支持率 <b>${pt.support}%</b> → 赔率 <b>${pt.odds}×</b><br>
        胜方：${SIDE_LABEL[pt.match.winner]} · 结算倍率 ${pt.match.winnerMult}×`;
    };
    makeChart('odds-chart', {
      backgroundColor: 'transparent',
      textStyle: { fontFamily: FONT_BODY, color: p.text },
      animationDuration: 650,
      legend: legendStyle(p, ['胜方赔率点', '已知败方赔率点']),
      tooltip: tooltipStyle(p, pointTooltip, 'item'),
      grid: { left: 58, right: 24, top: 48, bottom: 60, containLabel: true },
      xAxis: axisStyle(p, {
        value: true,
        min: 0,
        max: 100,
        labels: { formatter: (v) => `${v}%` },
        name: '支持率',
        nameLocation: 'middle',
        nameGap: 30,
        nameTextStyle: { color: p.muted, fontFamily: FONT_BODY, fontSize: 10 }
      }),
      yAxis: axisStyle(p, {
        value: true,
        min: 0,
        max: 110,
        name: '赛前赔率',
        nameTextStyle: { color: p.muted, fontFamily: FONT_BODY, fontSize: 10 }
      }),
      series: [
        {
          name: '胜方赔率点',
          type: 'scatter',
          data: winners,
          symbolSize: 11,
          itemStyle: { color: p.gold, opacity: 0.92, borderColor: p.panel, borderWidth: 1 },
          emphasis: { scale: 1.5 },
          markLine: {
            silent: true,
            symbol: 'none',
            data: [
              {
                yAxis: 105,
                lineStyle: { color: p.red, type: 'dashed', width: 1 },
                label: { formatter: '上限 105×', color: p.red, fontFamily: FONT_MONO, fontSize: 10, position: 'insideEndTop' }
              },
              {
                yAxis: 10,
                lineStyle: { color: p.muted, type: 'dotted', width: 1 },
                label: { formatter: '保底 10×', color: p.muted, fontFamily: FONT_MONO, fontSize: 10, position: 'insideEndBottom' }
              }
            ]
          }
        },
        {
          name: '已知败方赔率点',
          type: 'scatter',
          data: losers,
          symbolSize: 12,
          symbol: 'diamond',
          itemStyle: { color: p.red, opacity: 0.95, borderColor: p.panel, borderWidth: 1 },
          emphasis: { scale: 1.5 }
        }
      ]
    });
  }

  function renderFavoriteChart(model, result) {
    const p = palette();
    const buckets = result.buckets.buckets.slice(5);
    const labels = buckets.map((b) => `${b.min}–${b.max}%`);
    const rates = buckets.map((b) => b.favoriteN ? b.favoriteWins / b.favoriteN : null);
    const labelsText = buckets.map((b) => b.favoriteN ? `${b.favoriteWins}/${b.favoriteN}` : '无样本');
    makeChart('favorite-chart', {
      backgroundColor: 'transparent',
      textStyle: { fontFamily: FONT_BODY, color: p.text },
      animationDuration: 650,
      tooltip: tooltipStyle(p, (params) => {
        const idx = params[0].dataIndex;
        const b = buckets[idx];
        if (!b.favoriteN) return `<b>${labels[idx]}</b><br>无样本`;
        return `<b>${labels[idx]}</b><br>热门方胜率 <b>${pct(rates[idx])}</b><br>样本 ${b.favoriteWins}/${b.favoriteN}`;
      }),
      grid: { left: 58, right: 24, top: 34, bottom: 42, containLabel: true },
      xAxis: axisStyle(p, { data: labels, labels: { interval: 0 } }),
      yAxis: axisStyle(p, {
        value: true,
        min: 0,
        max: 1,
        labels: { formatter: (v) => `${Math.round(v * 100)}%` },
        name: '热门方胜率',
        nameTextStyle: { color: p.muted, fontFamily: FONT_BODY, fontSize: 10 }
      }),
      series: [
        {
          name: '热门方胜率',
          type: 'bar',
          barWidth: '46%',
          data: rates.map((v, i) => ({
            value: v,
            itemStyle: { color: buckets[i].favoriteN ? p.gold : p.faint, opacity: buckets[i].favoriteN ? 0.9 : 0.25 }
          })),
          label: {
            show: true,
            position: 'top',
            color: p.muted,
            fontFamily: FONT_MONO,
            fontSize: 10,
            formatter: (params) => labelsText[params.dataIndex]
          },
          markLine: {
            silent: true,
            symbol: 'none',
            data: [{
              yAxis: 0.5,
              lineStyle: { color: p.line, type: 'dashed', width: 1 },
              label: { formatter: '50%', color: p.muted, fontFamily: FONT_MONO, fontSize: 10, position: 'insideEndTop' }
            }]
          }
        }
      ]
    });
  }

  function renderGodChart(model, result) {
    const p = palette();
    const plan = result.god.plan;
    const oracle = result.deterministic.find((s) => s.id === 'oracle-fixed');
    makeChart('god-chart', {
      backgroundColor: 'transparent',
      textStyle: { fontFamily: FONT_BODY, color: p.text },
      animationDuration: 650,
      legend: legendStyle(p, ['每日得分', '累计得分', '固定 50 全押中']),
      tooltip: tooltipStyle(p, (params) => {
        const idx = params[0].dataIndex;
        const row = plan[idx];
        const m = row.match;
        if (!m) return `<b>第 ${row.day} 天</b><br>无比赛记录`;
        return `<b>第 ${row.day} 天 · 第 ${m.match} 场</b><br>
          ${row.stake > 0 ? `押 ${SIDE_LABEL[m.winner]} · ${m.support[m.winner]}% · ${m.winnerMult}×<br>押注 <b>${fmt(row.stake)}</b> 券 → <b>${fmt(row.points)}</b> 分` : '不押'}<br>
          日终余额 <b>${fmt(row.balanceAfter)}</b> 券`;
      }),
      grid: { left: 66, right: 26, top: 48, bottom: 44, containLabel: true },
      xAxis: axisStyle(p, { data: model.days.map((d) => `D${d}`) }),
      yAxis: axisStyle(p, {
        value: true,
        labels: { formatter: (v) => compact(v) },
        name: '得分',
        nameTextStyle: { color: p.muted, fontFamily: FONT_BODY, fontSize: 10 }
      }),
      series: [
        {
          name: '每日得分',
          type: 'bar',
          barWidth: '42%',
          data: result.god.byDay,
          itemStyle: { color: p.gold, opacity: 0.9 },
          label: {
            show: true,
            position: 'top',
            color: p.muted,
            fontFamily: FONT_MONO,
            fontSize: 10,
            formatter: (params) => params.value > 0 ? compact(params.value) : ''
          },
          markLine: thresholdMarkLines(p, model.full, model.original)
        },
        {
          name: '累计得分',
          type: 'line',
          data: result.god.cumulative,
          symbol: 'circle',
          symbolSize: 5,
          lineStyle: { color: p.jade, width: 2.2 },
          itemStyle: { color: p.jade },
          emphasis: { focus: 'series' }
        },
        {
          name: '固定 50 全押中',
          type: 'line',
          data: oracle ? oracle.cumulative : [],
          symbol: 'none',
          lineStyle: { color: p.muted, width: 1.4, type: 'dashed' },
          itemStyle: { color: p.muted },
          emphasis: { focus: 'series' }
        }
      ]
    });
  }

  function renderCharts(model, result) {
    disposeCharts();
    renderStrategyCumChart(model, result);
    renderStrategyFinalChart(model, result);
    renderHistChart(model, result);
    renderCdfChart(model, result);
    renderDailyBandChart(model, result);
    renderOddsChart(model, result);
    renderFavoriteChart(model, result);
    renderGodChart(model, result);
    requestAnimationFrame(() => charts.forEach((chart) => chart.resize()));
  }

  // ---------- render all ----------

  function renderAll(model, result, url) {
    renderHeader(model, result, url);
    renderKpis(model, result);
    renderInsights(result);
    renderStrategyTable(model, result);
    renderRandomTable(model, result);
    renderBucketTable(model, result);
    renderGodPlan(model, result);
    renderMatchTable(model);
    renderMethodNotes(model, result);
    renderCharts(model, result);
    hideLoading();
  }

  // ---------- boot ----------

  async function boot() {
    const token = ++loadToken;
    showLoading();
    disposeCharts();
    let url;
    try {
      url = dataUrl();
      const raw = await fetchData(url);
      if (token !== loadToken) return;
      const model = normalize(raw);
      if (model.errors.length) {
        showError('数据校验失败', model.errors.join('；'), location.protocol === 'file:'
          ? '当前通过 file:// 打开页面，浏览器通常不允许读取本地 JSON。请运行：\npython scripts/serve.py'
          : '');
        document.querySelectorAll('.section').forEach((section) => section.classList.add('hidden'));
        return;
      }
      document.querySelectorAll('.section').forEach((section) => section.classList.remove('hidden'));
      showWarnings(model.warnings);
      const result = computeAnalysis(model);
      current = { model, result, url };
      renderAll(model, result, url);
      window.__analysis = {
        url,
        activity: model.activity,
        matchCount: model.matches.length,
        stamp: {
          recordedDays: model.days.length,
          expectedDays: model.totalDays,
          expectedMatches: model.expectedMatches,
          full: model.full,
          original: model.original,
          base: result.base
        },
        totals: Object.fromEntries(result.deterministic.map((s) => [s.id, s.total])),
        wins: Object.fromEntries(result.deterministic.map((s) => [s.id, s.wins])),
        random: {
          coin: result.coin.stats,
          support: result.support.stats
        },
        god: {
          total: result.god.total,
          used: result.god.used,
          plan: result.god.plan.map((p) => ({
            day: p.day,
            match: p.match ? p.match.match : null,
            stake: p.stake,
            points: p.points,
            balanceAfter: p.balanceAfter
          })),
          prefixes: result.godPrefixes.map((g) => ({ day: g.horizon, total: g.total }))
        }
      };
    } catch (err) {
      if (token !== loadToken) return;
      const isFile = location.protocol === 'file:';
      showError('读取数据失败', err?.message || String(err), isFile
        ? '当前通过 file:// 打开页面，浏览器通常不允许读取本地 JSON。请在项目根目录运行：\npython scripts/serve.py\n然后打开脚本输出的地址。'
        : '请确认 JSON 路径正确，并通过本地 HTTP 服务访问页面。');
    }
  }

  function applyTheme(theme) {
    currentTheme = theme;
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* noop */ }
    const button = $('#theme-btn');
    if (button) button.textContent = theme === 'dark' ? '切换亮色' : '切换暗色';
    if (current) renderCharts(current.model, current.result);
  }

  function debounce(fn, wait) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(currentTheme);
    $('#reload-btn')?.addEventListener('click', () => boot());
    $('#theme-btn')?.addEventListener('click', () => applyTheme(currentTheme === 'dark' ? 'light' : 'dark'));
    window.addEventListener('resize', debounce(() => charts.forEach((chart) => chart.resize()), 120));
    boot();
  });
})();
