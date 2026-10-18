(() => {
  'use strict';

  const THEME_KEY = 'activity-analysis-theme';
  const SIDE_LABEL = { left: '左', right: '右' };
  const OPP = { left: 'right', right: 'left' };
  const FONT_DISPLAY = '"Iowan Old Style","Palatino Linotype","Georgia","STZhongsong","Songti SC","SimSun",serif';
  const FONT_BODY = '"Aptos","Segoe UI","Microsoft YaHei UI","PingFang SC",sans-serif';
  const FONT_MONO = '"Cascadia Mono","Consolas","SFMono-Regular","Menlo",monospace';

  const PALETTES = {
    dark: {
      text: '#f2ebdf',
      muted: '#a79e90',
      faint: '#7b7265',
      line: '#332d26',
      lineSoft: '#2a251f',
      grid: 'rgba(242,235,223,.07)',
      gold: '#e07a66',
      goldStrong: '#f09a88',
      red: '#e07a66',
      jade: '#7fb9a9',
      blue: '#93aecb',
      violet: '#a99bb5',
      panel: '#1c1915',
      panel2: '#231f1a',
      tooltipBg: '#1c1915',
      tooltipBorder: '#4a4136',
      baseBar: 'rgba(167,158,144,.22)',
      coinBand: 'rgba(224,122,102,.12)',
      supportBand: 'rgba(127,185,169,.12)',
      series: ['#e07a66', '#93aecb', '#d3a65a', '#7fb9a9', '#a99bb5', '#c7b07a']
    },
    light: {
      text: '#23201c',
      muted: '#746d63',
      faint: '#a49b8e',
      line: '#e8e5df',
      lineSoft: '#f0eeea',
      grid: 'rgba(35,32,28,.07)',
      gold: '#b44536',
      goldStrong: '#8f3227',
      red: '#b44536',
      jade: '#2f6f62',
      blue: '#43617e',
      violet: '#7b6a8a',
      panel: '#ffffff',
      panel2: '#f7f7f5',
      tooltipBg: '#ffffff',
      tooltipBorder: '#d6d1c8',
      baseBar: 'rgba(116,109,99,.20)',
      coinBand: 'rgba(180,69,54,.10)',
      supportBand: 'rgba(47,111,98,.10)',
      series: ['#b44536', '#43617e', '#a8792e', '#2f6f62', '#7b6a8a', '#8a8378']
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
    '全押中（固定 50/场）': '全押中'
  }[name] || name);

  let currentTheme = document.documentElement.dataset.theme || 'light';
  let current = null;
  let loadToken = 0;
  let echartsPromise = null;
  const charts = [];

  const palette = () => PALETTES[currentTheme] || PALETTES.light;

  // ---------- activity index and data loading ----------

  const activityIndex = () => Array.isArray(window.ACTIVITY_INDEX) ? window.ACTIVITY_INDEX : [];
  const dataRegistry = () => window.ACTIVITY_DATA_BY_ID || {};
  const indexEntry = (id) => activityIndex().find((entry) => entry.id === id) || null;

  function sourceFromEntry(entry) {
    const path = entry?.dataFile || '';
    return { href: path, path, name: path.split('/').pop() || path };
  }

  function loadScript(src, activityId) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      if (activityId) script.dataset.activityData = activityId;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`无法加载数据文件：${src}`));
      document.body.appendChild(script);
    });
  }

  async function ensureActivityData(id, { reload = false } = {}) {
    const entry = indexEntry(id);
    if (!entry) throw new Error(`活动索引中不存在：${id}`);
    if (!reload && dataRegistry()[id]) return dataRegistry()[id];
    if (reload) {
      delete dataRegistry()[id];
      document.querySelectorAll('script[data-activity-data]').forEach((script) => {
        if (script.dataset.activityData === id) script.remove();
      });
    }
    const src = reload ? `${entry.dataFile}?v=${Date.now()}` : entry.dataFile;
    await loadScript(src, id);
    const data = dataRegistry()[id];
    if (!data) throw new Error(`数据文件未注册活动 ${id}：${entry.dataFile}`);
    return data;
  }

  function ensureECharts() {
    if (window.echarts) return Promise.resolve();
    if (!echartsPromise) echartsPromise = loadScript('web/vendor/echarts.min.js');
    return echartsPromise;
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
    const minority = byId.minority;
    const majority = byId.majority;
    const items = [];

    const majorityMults = majority.rows.filter((r) => r.win).map((r) => r.mult);
    const majorityMin = majorityMults.length ? Math.min(...majorityMults) : null;
    const majorityMax = majorityMults.length ? Math.max(...majorityMults) : null;
    const majorityRange = majorityMin === null ? '—'
      : (majorityMin === majorityMax ? `${majorityMin} 倍` : `${majorityMin}–${majorityMax} 倍`);
    const minorityMults = [...new Set(minority.rows.filter((r) => r.win).map((r) => r.mult))]
      .sort((a, b) => a - b);
    const minorityText = minorityMults.length === 1
      ? `全部为 ${minorityMults[0]} 倍`
      : `为 ${minorityMults.join(' / ')} 倍`;
    items.push(`热门方 ${majority.wins}/${model.matches.length} 胜，胜场倍率 ${majorityRange}；冷门方 ${minority.wins} 次获胜${minorityText}。`);

    items.push(`每场 50 券、随机选边时，达到 ${fmt(model.full)} 分的概率：均匀分布 ${pct(result.coin.stats.pFull)}，按支持率加权 ${pct(result.support.stats.pFull)}。`);

    const byOdds = new Map();
    for (const point of result.buckets.oddsPoints) {
      if (!byOdds.has(point.odds)) byOdds.set(point.odds, []);
      byOdds.get(point.odds).push(point.support);
    }
    const segments = [...byOdds.entries()]
      .sort((a, b) => Math.min(...a[1]) - Math.min(...b[1]))
      .map(([odds, supports]) => {
        const min = Math.min(...supports);
        const max = Math.max(...supports);
        return `${min === max ? `${min}%` : `${min}–${max}%`} 为 ${odds} 倍`;
      });
    items.push(`支持率与赔率呈阶梯关系：${segments.join('，')}。`);

    const oracle = result.deterministic.find((s) => s.id === 'oracle-fixed');
    items.push(`上帝视角上界 ${fmt(result.god.total)}；固定 50 券全部命中为 ${fmt(oracle?.total || 0)}。`);
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
        `<td class="${numericCols.includes(i) ? 'num' : ''}" data-label="${esc(headers[i] || '')}">${cell}</td>`
      ).join('');
      return `<tr class="${cls}">${cells}</tr>`;
    }).join('');
    return `<table>${options.caption ? `<caption>${esc(options.caption)}</caption>` : ''}<thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
  }

  function kpi(label, value, sub, accent = '') {
    return `<article class="kpi ${accent}">
      <div class="kpi-label">${esc(label)}</div>
      <div class="kpi-value">${value}</div>
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

  function renderHeader(model, result) {
    document.title = `${model.name} · 活动观测`;
    setText('#hero-eyebrow', [model.game, model.version, model.phase].filter(Boolean).join(' · ') || '活动分析');
    setText('#hero-title', model.name);
    setText('#activity-meta-main', `已记录 ${model.days.length}/${model.totalDays} 天 · ${model.matches.length}/${model.expectedMatches} 场`);
    setText('#activity-meta-updated', `更新于 ${model.lastUpdated}`);
    setText('#overview-caption', '基于已记录场次');
    setText('#data-caption', `已记录 ${model.matches.length} 场 · 赔率点 ${result.buckets.oddsPoints.length} 个`);
  }

  function renderKpis(model, result) {
    const oddsPoints = result.buckets.oddsPoints;
    const loserCount = oddsPoints.filter((p) => p.role === 'loser').length;
    const kpis = [
      kpi('已记录', `${model.days.length}<span class="unit">/ ${model.totalDays} 天</span>`,
        `${model.matches.length} / ${model.expectedMatches} 场`),
      kpi('满奖励线', fmt(model.full),
        `原始奖励线 ${fmt(model.original)}`, 'accent'),
      kpi('赔率记录', `${oddsPoints.length} 个`,
        `${oddsPoints.length - loserCount} 个胜方 · ${loserCount} 个已知败方`),
      kpi('上帝视角上界', fmt(result.god.total),
        `已用 ${fmt(result.god.used)} 券`)
    ];
    $('#kpis').innerHTML = kpis.join('');
  }

  function renderInsights(result) {
    $('#insights').innerHTML = result.insights.map((text) =>
      `<div class="insight"><span class="insight-dash">—</span><span>${text}</span></div>`
    ).join('');
  }

  // ---------- tables ----------

  function renderStrategyTable(model, result) {
    const rows = result.deterministic.map((s) => {
      const reach = s.total >= model.full
        ? '<span class="status-ok">达到</span>'
        : `<span class="status-miss">差 ${fmt(model.full - s.total)}</span>`;
      return {
        __class: s.reference ? 'ref-row' : '',
        cells: [
          `${esc(s.name)}${s.reference ? '<span class="sub-line">固定 50 券的参考上界</span>' : ''}`,
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
      ['策略', '总得分', '其中加成', '胜场', '胜场均倍率', '满奖励', '均匀分布分位', '按支持率加权分位'],
      rows,
      [1, 2, 3, 4, 6, 7]
    ) + `<p class="table-note">分位 = 该随机策略得分不超过此得分的概率。</p>`;
  }

  function renderRandomTable(model, result) {
    const rows = [
      { name: '均匀分布', stats: result.coin.stats },
      { name: '按支持率加权', stats: result.support.stats }
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
    ) + `<p class="table-note">均匀分布：每场 50 券，左右两边等概率。按支持率加权：每场 50 券，按双方支持率决定选边概率。</p>`;
  }

  function renderBucketTable(model, result) {
    const rows = result.buckets.buckets.map((b) => {
      const odds = [...new Set(b.points.map((p) => p.odds))]
        .sort((a, b2) => a - b2)
        .map((o) => `${o}×`)
        .join(' / ');
      return {
        cells: [
          `${b.min}–${b.max}%`,
          odds || '<span class="faint">—</span>',
          b.points.length || '—'
        ]
      };
    });
    $('#bucket-table').innerHTML = table(
      ['支持率区间', '倍率', '赔率点'],
      rows,
      [1, 2]
    ) + `<p class="table-note">空档表示该区间还没有赔率记录。</p>`;
  }

  function renderGodPlan(model, result) {
    const rows = result.god.plan.map((row) => {
      const m = row.match;
      const matchLabel = m ? `${m.match}` : '—';
      const side = m ? SIDE_LABEL[m.winner] : '—';
      const teamName = m?.teams?.[m.winner];
      const support = m ? `${m.support[m.winner]}%` : '—';
      const mult = m ? `${m.winnerMult}×` : '—';
      return {
        cells: [
          `第 ${row.day} 天`,
          matchLabel,
          row.stake > 0
            ? `<span class="winner-cell">${side}${teamName ? ` · ${esc(teamName)}` : ''}</span>`
            : '<span class="faint">不押</span>',
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
    $('#god-prefixes').innerHTML = `<span>如果只考虑到当天：</span>` +
      result.godPrefixes.map((g) => `<span class="pill"><b>D${g.horizon}</b> ${fmt(g.total)}</span>`).join('<span class="arrow">→</span>') +
      `<span class="muted" style="margin-left:6px">上界可能不同</span>`;
  }

  function renderMatchTable(model) {
    const rows = model.matches.map((m) => {
      const support = `<span class="${m.favorite === 'left' ? 'winner-cell' : ''}">左 ${m.support.left}</span> <span class="faint">:</span> <span class="${m.favorite === 'right' ? 'winner-cell' : ''}">右 ${m.support.right}</span>`;
      const odds = `<span class="${m.rawOdds.left === null ? 'faint' : ''}">${m.rawOdds.left === null ? '—' : m.rawOdds.left}</span> <span class="faint">:</span> <span class="${m.rawOdds.right === null ? 'faint' : ''}">${m.rawOdds.right === null ? '—' : m.rawOdds.right}</span>`;
      const settlement = `<span class="${m.winner === 'left' ? 'winner-cell' : 'loser-cell'}">${m.settlement.left}</span> <span class="faint">:</span> <span class="${m.winner === 'right' ? 'winner-cell' : 'loser-cell'}">${m.settlement.right}</span>`;
      const type = m.underdogWin === null
        ? '—'
        : (m.underdogWin
          ? '<span class="win-cold">冷门胜</span>'
          : '<span class="win-hot">热门胜</span>');
      return {
        cells: [
          `第 ${m.day} 天`,
          `${m.match}${m.teams ? `<span class="sub-line">${esc(m.teams.left)} vs ${esc(m.teams.right)}</span>` : ''}`,
          support,
          odds,
          settlement,
          `<span class="${m.winner === 'left' ? 'gold' : 'jade'}">${SIDE_LABEL[m.winner]}</span>`,
          type
        ]
      };
    });
    $('#match-table').innerHTML = table(
      ['天', '场', '支持率（左:右）', '赛前赔率', '结算倍率（左:右）', '胜方', '类型'],
      rows,
      [2, 3, 4]
    ) + `<p class="table-note">— 表示未记录。另有 ${model.missingLoserOdds} 个败方赛前赔率缺失。</p>`;
  }

  function renderMethodNotes(model, result) {
    $('#method-notes').innerHTML = `<ul>
      <li><strong>得分</strong>：押 n 券，按结算倍率获得积分；押错固定 10 倍。</li>
      <li><strong>固定策略</strong>：每场 50 券，比较全押左、全押右、押热门、押冷门四种选边方式。</li>
      <li><strong>随机策略</strong>：每场 50 券，按概率选边，穷举所有可能结果。</li>
      <li><strong>上帝视角上界</strong>：假设提前知道胜负；每天开始时发 ${model.dailyGrant} 券，最多持有 ${model.holdingCap} 券，可以攒券集中下注。</li>
      <li><strong>奖励线</strong>：${fmt(model.original)} 分原始奖励；${fmt(model.full)} 分满奖励。</li>
      <li><strong>回测范围</strong>：已记录 ${model.matches.length} 场。</li>
    </ul>`;
    $('#caveats').innerHTML = `<ul>
      <li>每场 50 券是被评估策略的假设，不是活动规则。</li>
      <li>随机策略只让选边随机，比赛结果按已记录事实固定。</li>
      <li>押热门/冷门以收盘支持率为准。</li>
      <li>上帝视角是理论上界，不是可执行策略。</li>
      <li>败方赛前赔率大多未记录，赔率观测中只包含已知点。</li>
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
        labels: { formatter: (v) => compact(v) }
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
        labels: { formatter: (v) => compact(v) }
      }),
      series: [
        {
          name: '保底',
          type: 'bar',
          stack: 'total',
          barWidth: '46%',
          data: bases,
          itemStyle: { color: p.baseBar },
          emphasis: { focus: 'series' }
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
    const labels = hist.bins.map((b) => compact(b.start));
    const fullX = hist.thresholdIndex(model.full);
    const originalX = hist.thresholdIndex(model.original);
    makeChart('hist-chart', {
      backgroundColor: 'transparent',
      textStyle: { fontFamily: FONT_BODY, color: p.text },
      animationDuration: 650,
      legend: legendStyle(p, ['均匀分布', '按支持率加权选边']),
      tooltip: tooltipStyle(p, (params) => {
        const idx = params[0].dataIndex;
        const bin = hist.bins[idx];
        return `<b>${fmt(bin.start)} – ${fmt(bin.end)}</b><br>` + params
          .map((item) => `${item.marker}${esc(item.seriesName)} <b style="float:right;margin-left:18px">${pct(item.value)}</b>`)
          .join('<br>');
      }),
      grid: { left: 62, right: 22, top: 48, bottom: 48, containLabel: true },
      xAxis: axisStyle(p, {
        data: labels,
        labels: { interval: Math.max(0, Math.ceil(labels.length / 10) - 1) }
      }),
      yAxis: axisStyle(p, {
        value: true,
        labels: { formatter: (v) => `${Math.round(v * 100)}%` }
      }),
      series: [
        {
          name: '均匀分布',
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
                label: { formatter: `满奖励 ${fmt(model.full)}`, color: p.red, fontFamily: FONT_MONO, fontSize: 9, rotate: 0, position: 'insideEndTop' }
              },
              {
                xAxis: originalX,
                lineStyle: { color: p.muted, type: 'dotted', width: 1 },
                label: { formatter: `原始 ${fmt(model.original)}`, color: p.muted, fontFamily: FONT_MONO, fontSize: 9, rotate: 0, position: 'insideEndBottom' }
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
      legend: legendStyle(p, ['均匀分布', '按支持率加权选边']),
      tooltip: tooltipStyle(p, (params) => {
        const score = params[0]?.value?.[0];
        return `<b>得分 ${fmt(score)}</b><br>` + params
          .map((item) => `${item.marker}${esc(item.seriesName)} <b style="float:right;margin-left:18px">${pct(item.value?.[1])}</b>`)
          .join('<br>');
      }),
      grid: { left: 62, right: 24, top: 48, bottom: 48, containLabel: true },
      xAxis: axisStyle(p, {
        value: true,
        min: minX,
        max: maxX,
        labels: { formatter: (v) => compact(v) }
      }),
      yAxis: axisStyle(p, {
        value: true,
        min: 0,
        max: 1,
        labels: { formatter: (v) => `${Math.round(v * 100)}%` }
      }),
      series: [
        {
          name: '均匀分布',
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
                label: { formatter: `满奖励 ${fmt(model.full)}`, color: p.red, fontFamily: FONT_MONO, fontSize: 9, rotate: 0, position: 'insideEndTop' }
              },
              {
                xAxis: model.original,
                lineStyle: { color: p.muted, type: 'dotted', width: 1 },
                label: { formatter: `原始 ${fmt(model.original)}`, color: p.muted, fontFamily: FONT_MONO, fontSize: 9, rotate: 0, position: 'insideEndBottom' }
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
      legend: legendStyle(p, ['均匀分布中位数', '按支持率加权中位数']),
      tooltip: tooltipStyle(p, (params) => {
        const idx = params[0]?.dataIndex ?? 0;
        const rows = [
          { name: '均匀分布', color: p.gold, stats: coin[idx] },
          { name: '按支持率加权', color: p.jade, stats: support[idx] }
        ];
        return `<div class="chart-tip">
          <div class="chart-tip-title">第 ${days[idx]} 天 · 累计得分</div>
          <table class="chart-tip-table">
            <thead><tr><th></th><th>P20</th><th>中位</th><th>P80</th></tr></thead>
            <tbody>${rows.map((row) => `<tr>
              <td><span class="chart-tip-dot" style="background:${row.color}"></span>${row.name}</td>
              <td>${fmt(row.stats.p20)}</td>
              <td>${fmt(row.stats.median)}</td>
              <td>${fmt(row.stats.p80)}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>`;
      }),
      grid: { left: 66, right: 24, top: 48, bottom: 44, containLabel: true },
      xAxis: axisStyle(p, { data: days.map((d) => `D${d}`), boundaryGap: false }),
      yAxis: axisStyle(p, {
        value: true,
        labels: { formatter: (v) => compact(v) }
      }),
      series: [
        ...bandSeries('均匀分布', coin, p.gold, p.coinBand, 'coinBand'),
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
      grid: { left: 58, right: 24, top: 48, bottom: 44, containLabel: true },
      xAxis: axisStyle(p, {
        value: true,
        min: 0,
        max: 100,
        labels: { formatter: (v) => `${v}%` }
      }),
      yAxis: axisStyle(p, {
        value: true,
        min: 0,
        max: 110
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
          itemStyle: { color: p.blue, opacity: 0.95, borderColor: p.panel, borderWidth: 1 },
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
        labels: { formatter: (v) => `${Math.round(v * 100)}%` }
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
        labels: { formatter: (v) => compact(v) }
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

  function renderAll(model, result) {
    renderHeader(model, result);
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

  // ---------- router ----------

  function showIndexView() {
    $('#index-view')?.classList.remove('hidden');
    $('#dashboard-view')?.classList.add('hidden');
    $('#back-btn')?.classList.add('hidden');
    disposeCharts();
    current = null;
    window.__analysis = null;
    document.title = '活动观测';
  }

  function showDashboardView() {
    $('#index-view')?.classList.add('hidden');
    $('#dashboard-view')?.classList.remove('hidden');
    $('#back-btn')?.classList.remove('hidden');
  }

  function renderIndex() {
    showIndexView();
    const entries = activityIndex();
    const rows = entries.map((entry) => {
      const kicker = [entry.version, entry.phase, entry.status].filter(Boolean).join(' · ');
      return `<a class="activity-row" href="?event=${encodeURIComponent(entry.id)}" data-activity-id="${esc(entry.id)}">
        <div class="activity-row-main">
          <div class="activity-row-kicker">${esc(kicker)}</div>
          <h3>${esc(entry.name)}</h3>
          <p>${esc(entry.description || '')}</p>
        </div>
        <div class="activity-row-side">
          <span class="activity-row-date">${entry.startDate ? `${esc(entry.startDate)} 起` : ''}</span>
          <span class="activity-row-cta">查看分析</span>
        </div>
      </a>`;
    }).join('');
    $('#activity-cards').innerHTML = rows || '<p class="muted">暂无可查看的活动。</p>';
    setText('#index-caption', entries.length ? `${entries.length} 个活动` : '');
  }

  async function openActivity(id, { push = true } = {}) {
    const entry = indexEntry(id);
    if (!entry) { renderIndex(); return; }
    if (push) {
      const url = new URL(location.href);
      url.searchParams.set('event', id);
      history.pushState({ event: id }, '', url);
    }
    showDashboardView();
    document.title = `${entry.name || '活动'} · 活动观测`;
    setText('#hero-title', entry.name || '活动分析');
    setText('#hero-eyebrow', [entry.game, entry.version, entry.phase].filter(Boolean).join(' · ') || '活动分析');
    setText('#activity-meta-main', '正在载入…');
    setText('#activity-meta-updated', '');
    showLoading();
    disposeCharts();
    document.querySelectorAll('#dashboard-view .section').forEach((section) => section.classList.add('hidden'));
    $('#error-panel')?.classList.add('hidden');
    $('#warning-panel')?.classList.add('hidden');
    const token = ++loadToken;
    try {
      const [raw] = await Promise.all([ensureActivityData(id), ensureECharts()]);
      if (token !== loadToken) return;
      renderActivity(raw, id, entry);
    } catch (err) {
      if (token !== loadToken) return;
      console.error(err);
      setText('#activity-meta-main', '暂时无法载入');
      showError('载入活动失败', '暂时无法读取这个活动的数据，请稍后再试。');
    }
  }

  async function reloadCurrentActivity() {
    if (!current) return;
    const { activityId, entry } = current;
    const token = ++loadToken;
    showLoading();
    disposeCharts();
    document.querySelectorAll('#dashboard-view .section').forEach((section) => section.classList.add('hidden'));
    try {
      const [raw] = await Promise.all([
        ensureActivityData(activityId, { reload: true }),
        ensureECharts()
      ]);
      if (token !== loadToken) return;
      renderActivity(raw, activityId, entry);
    } catch (err) {
      if (token !== loadToken) return;
      console.error(err);
      showError('刷新失败', '暂时无法读取最新数据，请稍后再试。');
    }
  }

  function closeActivity({ push = true } = {}) {
    const url = new URL(location.href);
    if (push && url.searchParams.has('event')) {
      url.searchParams.delete('event');
      history.pushState({}, '', url);
    }
    renderIndex();
  }

  function renderActivity(raw, id, entry) {
    const source = sourceFromEntry(entry);
    const model = normalize(raw);
    if (model.errors.length) {
      console.error(model.errors);
      setText('#activity-meta-main', '数据不完整');
      showError('数据暂时无法显示', '这份活动的记录还不完整，请稍后再试。');
      return;
    }
    document.querySelectorAll('#dashboard-view .section').forEach((section) => section.classList.remove('hidden'));
    showWarnings(model.warnings);
    const result = computeAnalysis(model);
    current = { model, result, source, activityId: id, entry };
    renderAll(model, result);
    window.__analysis = {
      activityId: id,
      url: source.path,
      source: source.path,
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
  }

  function route() {
    const id = new URLSearchParams(location.search).get('event');
    if (id && indexEntry(id)) {
      openActivity(id, { push: false });
    } else {
      renderIndex();
    }
  }

  function applyTheme(theme) {
    currentTheme = theme;
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* noop */ }
    const button = $('#theme-btn');
    if (button) {
      const label = theme === 'dark' ? '切换到浅色模式' : '切换到暗色模式';
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
    }
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
    $('#reload-btn')?.addEventListener('click', reloadCurrentActivity);
    $('#back-btn')?.addEventListener('click', () => closeActivity());
    $('#theme-btn')?.addEventListener('click', () => applyTheme(currentTheme === 'dark' ? 'light' : 'dark'));
    document.addEventListener('click', (event) => {
      const card = event.target.closest('[data-activity-id]');
      if (!card) return;
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      openActivity(card.dataset.activityId);
    });
    window.addEventListener('popstate', route);
    window.addEventListener('resize', debounce(() => charts.forEach((chart) => chart.resize()), 120));
    route();
  });
})();
