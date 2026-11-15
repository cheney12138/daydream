/**
 * driving adapter：服务端拼 HTML（F7 设计集成版）。
 *
 * 视觉系统来自 design/prototype.html（F6 定稿），SSR 单文件自包含输出：
 *   设计令牌：三层明暗（米灰底 --bg / 白卡片 --card / 卡内浅底内嵌 --inset），间距 8/16/24/32
 *   模块① 顶栏 + 日期导航 + 天级头条（计数点开 = 对应验证清单，count-panel）
 *   模块② 健康声明横幅（warn 琥珀 / ok 绿两个变体）
 *   模块③ 项目分节卡片（叙事段 ✓/→ + 动作统计 + 类型分布条；无摘要项目虚线降级卡）
 *   模块④ 事件时间线（type 徽标低饱和配色；discovery 灰度降级；默认全部收起）
 *   模块⑦ sensitive 条目：琥珀虚线框折叠 + 「已折叠 · 含敏感信息」标记
 *   模块⑥ 空态两变体（采集正常 / 采集中断）
 * 交互只靠 details/summary + 少量原生 JS（展开/收起全部），无框架。
 */
import type { DailyReport, ProjectSection, TimelineItem } from '../../../core/domain/report.js';

function esc(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function weekdayOf(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '' : WEEKDAYS[d.getDay()] ?? '';
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function shortDate(date: string): string {
  return date.slice(5).replace('-', '-'); // YYYY-MM-DD → MM-DD
}

function dayHref(date: string): string {
  return `/day/${date}`;
}

/** 已知 type → 设计令牌 CSS 类；未知类型走基础灰样式（schema 漂移容错） */
const KNOWN_TYPES = new Set(['bugfix', 'feature', 'decision', 'change', 'refactor', 'discovery', 'sensitive']);
function typeClass(type: string): string {
  return KNOWN_TYPES.has(type) ? `type-${type}` : '';
}
function typeVar(type: string, kind: 'bg' | 'ink'): string {
  if (KNOWN_TYPES.has(type)) return `var(--c-${type}-${kind})`;
  return kind === 'bg' ? 'var(--inset)' : 'var(--ink-2)';
}

/* ───────────────────────── 设计令牌 + 模块样式（来自 prototype.html） ───────────────────────── */
const STYLE = `
:root {
  --bg:            #f6f5f1;
  --card:          #ffffff;
  --inset:         #f7f6f2;
  --border:        #e4e2da;
  --border-strong: #c9c6bb;
  --ink:           #23211b;
  --ink-2:         #6e6b60;
  --ink-3:         #a09c8f;
  --accent:        #3457b2;
  --warn-ink:      #8a4d0b;
  --warn-bg:       #fbf2e0;
  --warn-border:   #ecd9b4;

  --c-bugfix-ink: #a33a22;  --c-bugfix-bg: #f9eae4;
  --c-feature-ink:#25704a;  --c-feature-bg:#e7f1ea;
  --c-decision-ink:#5f43a8; --c-decision-bg:#efebf8;
  --c-change-ink: #2e5494;  --c-change-bg: #e8eef7;
  --c-refactor-ink:#8a6415; --c-refactor-bg:#f8f1de;
  --c-discovery-ink:#75726a;--c-discovery-bg:#efede6;
  --c-sensitive-ink:#8a4d0b;--c-sensitive-bg:#fbf2e0;

  --s1: 8px; --s2: 16px; --s3: 24px; --s4: 32px;
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --sans: -apple-system, "PingFang SC", "Hiragino GB", "Microsoft YaHei", system-ui, sans-serif;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-text-size-adjust: 100%; }
body { background: var(--bg); color: var(--ink); font: 14px/1.65 var(--sans); padding: var(--s4) var(--s2) 96px; }
.page { max-width: 780px; margin: 0 auto; }
a { color: inherit; }
.mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }

/* 模块①：顶栏 + 日期导航 + 项目锚点（sticky） */
.site-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: var(--s2); }
.wordmark { font-family: var(--mono); font-size: 12px; letter-spacing: .08em; color: var(--ink-2); }
.wordmark b { color: var(--ink); font-weight: 600; }
.src-note { font-size: 12px; color: var(--ink-3); }
.nav-sticky { position: sticky; top: 0; z-index: 10; background: var(--bg); padding: var(--s1) 0; margin-bottom: var(--s2); }
.date-nav { display: flex; align-items: center; gap: var(--s2); }
.proj-nav { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.proj-nav a { font-family: var(--mono); font-size: 12px; text-decoration: none; color: var(--ink-2); background: var(--card); border: 1px solid var(--border); border-radius: 99px; padding: 1px 10px; }
.proj-nav a:hover { color: var(--accent); border-color: var(--accent); }
.date-nav .arrow { font-family: var(--mono); font-size: 15px; text-decoration: none; color: var(--ink-2); padding: 2px 8px; border-radius: 6px; }
.date-nav .arrow:hover { background: var(--card); color: var(--ink); }
.date-nav .today { font-family: var(--mono); font-size: 17px; font-weight: 600; letter-spacing: .02em; }
.date-nav .weekday { font-size: 13px; color: var(--ink-2); margin-left: 2px; }

/* 模块①：天级头条（可验证计数 = 虚线下划线 inline details） */
.day-headline { font-size: 21px; font-weight: 600; line-height: 1.6; margin-bottom: var(--s3); }
.day-headline details { display: inline-block; }
.day-headline summary { list-style: none; cursor: pointer; border-bottom: 1.5px dotted var(--border-strong); font-variant-numeric: tabular-nums; }
.day-headline summary::-webkit-details-marker { display: none; }
.day-headline summary:hover { border-bottom-color: var(--accent); color: var(--accent); }
.day-headline .n { font-family: var(--mono); font-size: 23px; padding: 0 1px; }
.day-headline .sep { color: var(--ink-3); font-weight: 400; padding: 0 6px; }
.count-panel { margin-top: var(--s1); background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: var(--s2); font-size: 13px; font-weight: 400; }
.count-panel ul { list-style: none; }
.count-panel li { padding: 2px 0; color: var(--ink-2); display: flex; gap: var(--s1); }
.count-panel li b { color: var(--ink); font-weight: 500; min-width: 8em; }
.count-panel .mono { font-size: 12px; white-space: nowrap; }

/* 模块②：健康声明横幅（warn 琥珀 / ok 绿） */
.health { display: flex; gap: var(--s1); align-items: baseline; background: var(--warn-bg); border: 1px solid var(--warn-border); border-left: 3px solid var(--warn-ink); border-radius: 6px; padding: var(--s1) var(--s2); margin-bottom: var(--s4); font-size: 13px; color: var(--warn-ink); }
.health .tag { font-family: var(--mono); font-size: 11px; font-weight: 700; letter-spacing: .06em; white-space: nowrap; }
.health .time { font-family: var(--mono); }
.health p { flex: 1; }
.health .why { opacity: .75; }
.health.ok { background: var(--c-feature-bg); border-color: #cfe3d6; border-left-color: var(--c-feature-ink); color: var(--c-feature-ink); }

/* 模块③：项目分节卡片 */
.project { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: var(--s3); margin-bottom: var(--s2); }
.project.degraded { border-style: dashed; }
.proj-head { display: flex; align-items: baseline; gap: var(--s1); flex-wrap: wrap; margin-bottom: var(--s2); }
.proj-name { font-family: var(--mono); font-size: 16px; font-weight: 600; }
.proj-meta { font-size: 12px; color: var(--ink-2); }
.proj-meta .mono { font-size: 12px; }
.proj-flag { font-size: 11px; color: var(--ink-3); border: 1px dashed var(--border-strong); border-radius: 4px; padding: 0 6px; }

/* 叙事段：✓ 完成了什么 / → 下一步（原文搬运） */
.narrative { margin-bottom: var(--s2); }
.narrative .row { display: flex; gap: var(--s1); padding: 3px 0; }
.narrative .row + .row { margin-top: 2px; }
.narrative .glyph { font-family: var(--mono); flex: none; width: 1.4em; text-align: center; }
.narrative .glyph.done { color: var(--c-feature-ink); }
.narrative .glyph.next { color: var(--accent); }
.narrative .label { font-size: 12px; color: var(--ink-3); white-space: nowrap; padding-top: 1px; }
.narrative .text { flex: 1; color: var(--ink); }
.narrative .text.next { color: var(--ink-2); }

/* 动作统计：files_modified 去重数 + tool_uses 聚合 */
.tool-stats { display: flex; flex-wrap: wrap; gap: var(--s1) var(--s2); align-items: baseline; font-family: var(--mono); font-size: 12px; color: var(--ink-2); padding: var(--s1) var(--s2); background: var(--inset); border-radius: 6px; margin-bottom: var(--s2); }
.tool-stats .files b, .tool-stats .tool b { color: var(--ink); font-weight: 600; }

/* 类型分布条：时间线之下 */
.type-bar { display: flex; height: 4px; border-radius: 2px; overflow: hidden; background: var(--inset); margin: var(--s1) 0 6px; }
.type-bar i { display: block; height: 100%; }
.type-legend { font-size: 11px; color: var(--ink-3); margin-bottom: var(--s2); }
.type-legend i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin: 0 4px 0 10px; vertical-align: -1px; }
.type-legend i:first-child { margin-left: 0; }

/* 模块④：事件时间线 */
.tl-head { display: flex; align-items: baseline; justify-content: space-between; border-top: 1px solid var(--border); padding-top: var(--s2); margin-bottom: var(--s1); }
.tl-title { font-size: 12px; font-weight: 600; color: var(--ink-2); letter-spacing: .04em; }
.tl-more { margin-top: var(--s1); padding-top: var(--s1); border-top: 1px dashed var(--border); font-size: 12.5px; }
.tl-more a { color: var(--accent); text-decoration: none; font-weight: 500; }
.tl-more a:hover { text-decoration: underline; }
.tl-more span { color: var(--ink-3); font-size: 11.5px; margin-left: var(--s1); }
.tl-toggle { font-family: var(--mono); font-size: 11px; color: var(--ink-3); background: none; border: none; cursor: pointer; padding: 0 2px; }
.tl-toggle:hover { color: var(--accent); }
.tl { list-style: none; }
.tl-item { border-left: 2px solid var(--border); margin-left: 4px; }
.tl-item + .tl-item { margin-top: 2px; }
.tl-item details { border-radius: 0 6px 6px 0; }
.tl-item details[open] { background: var(--inset); border-left-color: var(--border-strong); }
.tl-item summary { list-style: none; cursor: pointer; display: flex; align-items: baseline; gap: var(--s1); padding: 5px 8px 5px 12px; border-radius: 0 6px 6px 0; }
.tl-item summary::-webkit-details-marker { display: none; }
.tl-item summary::before { content: "▸"; font-family: var(--mono); font-size: 10px; color: var(--ink-3); flex: none; width: 9px; transition: transform .12s ease; transform-origin: 40% 50%; }
.tl-item details[open] summary::before { transform: rotate(90deg); }
.tl-item summary:hover { background: var(--inset); }
.tl-item details[open] summary:hover { background: transparent; }
.tl-time { font-family: var(--mono); font-size: 12px; color: var(--ink-2); flex: none; }
.tl-title-text { font-size: 13.5px; flex: 1; min-width: 0; }

/* type 徽标：mono 小号、低饱和；discovery 最灰；未知类型走基础灰 */
.type { font-family: var(--mono); font-size: 10.5px; font-weight: 600; letter-spacing: .03em; border-radius: 4px; padding: 0 6px; line-height: 1.7; flex: none; background: var(--inset); color: var(--ink-2); }
.type-bugfix    { color: var(--c-bugfix-ink);     background: var(--c-bugfix-bg); }
.type-feature   { color: var(--c-feature-ink);    background: var(--c-feature-bg); }
.type-decision  { color: var(--c-decision-ink);   background: var(--c-decision-bg); }
.type-change    { color: var(--c-change-ink);     background: var(--c-change-bg); }
.type-refactor  { color: var(--c-refactor-ink);   background: var(--c-refactor-bg); }
.type-discovery { color: var(--c-discovery-ink);  background: var(--c-discovery-bg); }
.type-sensitive { color: var(--c-sensitive-ink);  background: var(--c-sensitive-bg); }

/* discovery 降级行：标题变灰 */
.tl-item.is-discovery summary .tl-title-text { color: var(--ink-2); }
.tl-item.is-discovery summary::before { color: var(--ink-3); }

/* 模块⑤：条目详情（narrative 原文） */
.entry-detail { padding: var(--s1) var(--s2) var(--s2) 40px; }
.entry-detail .narrative-raw { font-size: 13px; line-height: 1.7; color: var(--ink); padding: var(--s1) var(--s2); background: var(--card); border: 1px solid var(--border); border-radius: 6px; white-space: pre-wrap; overflow-wrap: anywhere; }
.entry-detail .facts { list-style: none; margin-top: var(--s1); font-family: var(--mono); font-size: 11.5px; color: var(--ink-2); display: flex; flex-wrap: wrap; gap: 2px var(--s2); }
.entry-detail .facts b { font-weight: 600; color: var(--ink-3); font-family: var(--sans); font-size: 11px; margin-right: 4px; }

/* 模块⑦：敏感条目折叠 + 标记 */
.tl-item.is-sensitive { border-left-color: var(--warn-border); }
.tl-item.is-sensitive details { border: 1px dashed var(--warn-border); border-radius: 6px; margin-left: 2px; }
.tl-item.is-sensitive details[open] { background: var(--warn-bg); border-left: 3px solid var(--warn-ink); }
.tl-item.is-sensitive summary { gap: 6px; }
.tl-item.is-sensitive .lock { font-size: 10.5px; color: var(--warn-ink); white-space: nowrap; font-family: var(--sans); opacity: .85; }
.tl-item.is-sensitive .tl-title-text { color: var(--warn-ink); }

/* 模块⑥：空态 */
.empty-card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: var(--s4) var(--s3); text-align: center; }
.empty-card .date { font-family: var(--mono); font-size: 15px; font-weight: 600; margin-bottom: var(--s1); }
.empty-card .headline { font-size: 15px; font-weight: 500; margin-bottom: 6px; }
.empty-card .sub { font-size: 13px; color: var(--ink-2); max-width: 30em; margin: 0 auto var(--s2); }
.empty-card .status { display: inline-flex; gap: 6px; align-items: center; font-size: 12px; color: var(--c-feature-ink); background: var(--c-feature-bg); border-radius: 4px; padding: 2px 10px; }
.empty-card .status.warn { color: var(--warn-ink); background: var(--warn-bg); }
.empty-card .health-note { font-size: 11.5px; color: var(--ink-3); margin-top: var(--s1); }

/* 页脚 */
.foot { margin-top: var(--s4); font-size: 11.5px; color: var(--ink-3); text-align: center; }
.foot .mono { font-size: 11px; }

@media (max-width: 560px) {
  body { padding: var(--s2) var(--s1) 64px; }
  .project { padding: var(--s2); }
  .day-headline { font-size: 18px; }
  .day-headline .n { font-size: 20px; }
  .entry-detail { padding-left: var(--s2); }
}
`;

/* ───────────────────────── 模块渲染 ───────────────────────── */

function typeBadge(type: string): string {
  return `<span class="type ${typeClass(type)}">${esc(type)}</span>`;
}

/** 模块①：天级头条。变更/事件计数可点开 → count-panel 验证清单（真数据） */
function headlineHtml(report: DailyReport): string {
  const h = report.headline;

  // 「N 处变更」点开：各项目 files_modified 清单
  let changeCountHtml: string;
  if (h.filesModifiedCount > 0) {
    const rows = report.projects
      .filter((p) => p.filesModified.length > 0)
      .map(
        (p) =>
          `<li><b>${esc(p.project)}</b><span class="mono">${p.filesModified.length} files</span><span>${esc(p.filesModified.join(', '))}</span></li>`,
      )
      .join('');
    changeCountHtml = `<details><summary><span class="n">${h.filesModifiedCount}</span> 处变更</summary><div class="count-panel"><ul>${rows}</ul></div></details>`;
  } else {
    changeCountHtml = `<span class="n">0</span> 处变更`;
  }

  // 「N 条事件」点开：各项目条数 + 类型分布
  const eventRows = report.projects
    .map((p) => {
      const types = new Map<string, number>();
      for (const t of p.timeline) types.set(t.type, (types.get(t.type) ?? 0) + 1);
      const breakdown = [...types.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => `${esc(type)}×${count}`)
        .join(' · ');
      return `<li><b>${esc(p.project)}</b><span class="mono">${p.observationCount} 条</span><span>${breakdown}</span></li>`;
    })
    .join('');
  const eventCountHtml =
    h.observationCount > 0
      ? `<details><summary><span class="n">${h.observationCount}</span> 条事件</summary><div class="count-panel"><ul>${eventRows}</ul></div></details>`
      : `<span class="n">0</span> 条事件`;

  return `
  <h1 class="day-headline">
    今天 <span class="n">${h.projectCount}</span> 个项目<span class="sep">·</span><span class="n">${h.sessionCount}</span> 个会话<span class="sep">·</span>${changeCountHtml}<span class="sep">·</span>${eventCountHtml}<span class="sep">·</span><span class="n">${h.bugfixCount}</span> 个 bugfix
  </h1>`;
}

function hoursSince(epochMs: number | null): number | null {
  if (epochMs === null) return null;
  return Math.max(0, Math.round((Date.now() - epochMs) / 3600_000));
}

/** 模块②：健康声明横幅（warn / ok 两变体） */
function healthHtml(report: DailyReport): string {
  const h = report.health;
  const label = h.lastObservationLabel ?? '—';
  const hours = hoursSince(h.lastObservationAt);
  const why = `判据：最后一条 observation 时间 + observer-health.json`;

  if (h.ok) {
    return `
  <aside class="health ok" role="status">
    <span class="tag">采集正常</span>
    <p>最后一条记录为 <span class="time">${esc(label)}</span>${hours === null ? '' : `（约 ${hours} 小时前）`}。
    <span class="why">${esc(why)}</span></p>
  </aside>`;
  }
  return `
  <aside class="health" role="status">
    <span class="tag">采集中断</span>
    <p>最后一条记录为 <span class="time">${esc(label)}</span>${hours === null ? '' : `，距今约 ${hours} 小时`}——当天的日报可能不完整。
    <span class="why">${esc(h.lastError ?? why)}</span></p>
  </aside>`;
}

/** 时间范围标签：如 09:02–17:30（取当天 timeline 首尾） */
function timeRange(project: ProjectSection): string {
  if (project.timeline.length === 0) return '';
  const first = project.timeline[0]!;
  const last = project.timeline[project.timeline.length - 1]!;
  return `${first.time}–${last.time}`;
}

/** 模块③叙事段：✓ 完成了什么 / → 下一步（session_summaries 原文，多会话多行） */
function narrativeHtml(project: ProjectSection): string {
  const rows: string[] = [];
  for (const s of project.summaries) {
    if (s.completed) {
      rows.push(`<div class="row"><span class="glyph done">✓</span><span class="label">完成了什么</span><span class="text">${esc(s.completed)}</span></div>`);
    }
    if (s.nextSteps) {
      rows.push(`<div class="row"><span class="glyph next">→</span><span class="label">下一步</span><span class="text next">${esc(s.nextSteps)}</span></div>`);
    }
  }
  if (rows.length === 0) return '';
  return `<div class="narrative">${rows.join('')}</div>`;
}

/** 动作统计：files_modified 去重数 + tool_uses 聚合 */
function toolStatsHtml(project: ProjectSection): string {
  const parts: string[] = [];
  if (project.filesModified.length > 0) {
    parts.push(`<span class="files"><b>${project.filesModifiedCount}</b> 个文件</span>`);
  }
  for (const t of project.toolUses) {
    parts.push(`<span class="tool">${esc(t.tool)}<b>×${t.count}</b></span>`);
  }
  if (parts.length === 0) return '';
  return `<div class="tool-stats">${parts.join('')}</div>`;
}

/** 类型分布条 + 图例（纯色段，回答"什么"，不抢第一眼） */
function typeBarHtml(project: ProjectSection): string {
  if (project.timeline.length === 0) return '';
  const types = new Map<string, number>();
  for (const t of project.timeline) types.set(t.type, (types.get(t.type) ?? 0) + 1);
  const entries = [...types.entries()].sort((a, b) => b[1] - a[1]);
  const total = project.timeline.length;

  const segments = entries
    .map(([type, count]) => {
      const pct = ((count / total) * 100).toFixed(1);
      const style = `width:${pct}%; background:${typeVar(type, 'bg')}; outline:1px solid ${typeVar(type, 'ink')}; outline-offset:-1px;`;
      return `<i style="${style}"></i>`;
    })
    .join('');
  const legend = entries
    .map(([type, count]) => `<i style="background:${typeVar(type, 'ink')};"></i>${esc(type)}${count > 1 ? `×${count}` : ''}`)
    .join('');
  return `
  <div class="type-bar" aria-hidden="true">${segments}</div>
  <div class="type-legend">${total} 条事件：${legend}</div>`;
}

/** 关键事件：非 discovery 类型，最多 KEY_EVENT_MAX 条（时间线倒序取最新） */
const KEY_EVENT_MAX = 6;
function keyEvents(project: ProjectSection): TimelineItem[] {
  const important = project.timeline.filter((t) => t.type !== 'discovery');
  return important.slice(-KEY_EVENT_MAX).reverse();
}

/** 摘要版时间线：只渲染关键事件 + 「查看全部」链接（长列表去全量页） */
function timelineSummaryHtml(project: ProjectSection, index: number, date: string): string {
  const important = project.timeline.filter((t) => t.type !== 'discovery');
  const keys = keyEvents(project);
  if (important.length === 0 && project.timeline.length === 0) return '';
  const items = keys.map((t) => timelineItemHtml(t)).join('');
  const omitted = project.timeline.length - keys.length;
  const moreLink =
    omitted > 0
      ? `<div class="tl-more"><a href="/day/${esc(date)}/full#proj-${index}">查看全部 ${project.timeline.length} 条事件 →</a><span>（含 ${project.timeline.filter((t) => t.type === 'discovery').length} 条 discovery）</span></div>`
      : '';
  return `
  <div class="tl-head">
    <span class="tl-title">关键事件${important.length > 0 ? ` <span class="mono">${important.length}</span>` : ''}</span>
  </div>
  <ul class="tl">${items}</ul>
  ${moreLink}`;
}

/** 模块④⑤⑦：事件时间线（全量页用；默认全部收起；discovery 灰度降级；sensitive 琥珀虚线 + lock） */
function timelineHtml(project: ProjectSection, id: string): string {
  if (project.timeline.length === 0) return '';
  const items = project.timeline.map((t) => timelineItemHtml(t)).join('');
  return `
  <div class="tl-head">
    <span class="tl-title">事件时间线</span>
    <span><button class="tl-toggle" data-scope="${esc(id)}" data-open="1">展开全部</button> · <button class="tl-toggle" data-scope="${esc(id)}" data-open="0">收起</button></span>
  </div>
  <ul class="tl" id="${esc(id)}">${items}</ul>`;
}

function timelineItemHtml(t: TimelineItem): string {
  const classes = ['tl-item'];
  if (t.type === 'discovery') classes.push('is-discovery');
  if (t.sensitive) classes.push('is-sensitive');
  const lock = t.sensitive ? '<span class="lock">已折叠 · 含敏感信息</span>' : '';
  const narrative = t.narrative ? `<p class="narrative-raw">${esc(t.narrative)}</p>` : '';
  const facts: string[] = [];
  if (t.facts.length > 0) {
    facts.push(...t.facts.map((f) => `<li>${esc(f)}</li>`));
  }
  if (t.filesModified.length > 0) {
    facts.push(`<li><b>文件</b>${esc(t.filesModified.join(', '))}</li>`);
  }
  const factsHtml = facts.length > 0 ? `<ul class="facts">${facts.join('')}</ul>` : '';
  const title = t.title || '(无标题)';
  return `
  <li class="${classes.join(' ')}">
    <details>
      <summary><time class="tl-time">${esc(t.time)}</time>${typeBadge(t.type)}${lock}<span class="tl-title-text">${esc(title)}</span></summary>
      <div class="entry-detail">${narrative}${factsHtml}</div>
    </details>
  </li>`;
}

/** 模块③：项目分节卡片（摘要版：叙事 + 统计 + 关键事件，长时间线去全量页） */
function projectHtml(project: ProjectSection, index: number, date: string): string {
  const degraded = project.summaries.length === 0;
  const classes = degraded ? 'project degraded' : 'project';
  const flag = degraded ? '<span class="proj-flag">无会话摘要 · 降级为标题列表</span>' : '';
  const range = timeRange(project);
  const meta = `<span class="proj-meta"><span class="mono">${project.sessionCount}</span> 会话${range ? ` · <span class="mono">${esc(range)}</span>` : ''}</span>`;
  const rawNote =
    project.rawProjects.length > 1
      ? `<span class="proj-flag">合并自 ${project.rawProjects.map(esc).join(' + ')}</span>`
      : '';
  return `
  <section class="${classes}" aria-labelledby="proj-${index}">
    <div class="proj-head">
      <h2 class="proj-name" id="proj-${index}">${esc(project.project)}</h2>
      ${meta}${rawNote}${flag}
    </div>
    ${narrativeHtml(project)}
    ${toolStatsHtml(project)}
    ${typeBarHtml(project)}
    ${timelineSummaryHtml(project, index, date)}
  </section>`;
}

/** 模块⑥：空态（status 芯片随采集状态切换 warn/ok 变体） */
function emptyHtml(report: DailyReport): string {
  const h = report.health;
  const chip = h.ok
    ? `<span class="status"><span class="mono">●</span> 采集正常${h.lastObservationLabel ? ` · 最后记录 ${esc(h.lastObservationLabel)}` : ''}</span>`
    : `<span class="status warn"><span class="mono">▲</span> 采集中断${h.lastObservationLabel ? ` · 最后记录 ${esc(h.lastObservationLabel)}` : ''}</span>`;
  return `
  <section class="empty-card" aria-label="空态">
    <div class="date mono">${esc(report.date)} ${esc(weekdayOf(report.date))}</div>
    <p class="headline">这一天没有记录到任何事件</p>
    <p class="sub">claude-mem 在此日期没有写入 observation。空白可能是确实没有工作，也可能只是采集中断——以采集状态为准。</p>
    ${chip}
    <p class="health-note">${esc(h.message)}</p>
  </section>`;
}

/* ───────────────────────── 页面骨架 ───────────────────────── */

function navBarHtml(report: DailyReport): string {
  const d = report.date;
  const prev = shiftDate(d, -1);
  const next = shiftDate(d, 1);
  const chips = report.projects
    .map((p, i) => `<a href="#proj-${i}">${esc(p.project)}</a>`)
    .join('');
  return `
  <div class="nav-sticky">
    <nav class="date-nav" aria-label="日期导航">
      <a class="arrow" href="${dayHref(prev)}" title="前一天">‹ ${esc(shortDate(prev))}</a>
      <span class="today mono">${esc(d)}</span><span class="weekday">${esc(weekdayOf(d))}</span>
      <a class="arrow" href="${dayHref(next)}" title="后一天">${esc(shortDate(next))} ›</a>
      <a class="arrow" href="/" title="最新有数据的日期">最新</a>
    </nav>
    ${report.projects.length > 1 ? `<nav class="proj-nav" aria-label="项目导航">${chips}</nav>` : ''}
  </div>`;
}

function pageShell(report: DailyReport, body: string, titleSuffix: string, backLink: string): string {
  const d = report.date;
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>日报 · ${esc(d)}${esc(titleSuffix)} · daily-report</title>
<style>${STYLE}</style>
</head>
<body>
<div class="page">

  <header class="site-head">
    <div class="wordmark"><b>日报</b> · daily-report</div>
    <div class="src-note">${backLink}</div>
  </header>

  ${navBarHtml(report)}

  ${body}

  <footer class="foot">
    <span class="mono">daily-report v0.1</span> · 只读消费本地记忆数据 · 本页所有数字均可在 claude-mem.db 中验证 · 生成于 ${esc(report.generatedAt)}
  </footer>
</div>

<script>
// 少量原生 JS：仅「展开/收起全部」辅助；无 JS 时 details 原生可用
document.querySelectorAll('.tl-toggle').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var scope = document.getElementById(btn.dataset.scope);
    if (!scope) return;
    scope.querySelectorAll('details').forEach(function (det) { det.open = btn.dataset.open === '1'; });
  });
});
</script>
</body>
</html>`;
}

/** 日报页（摘要版）：头条 + 健康 + 项目叙事 + 关键事件；全量时间线在全量页 */
export function renderDayPage(report: DailyReport): string {
  const body = report.empty
    ? `${report.empty ? '' : headlineHtml(report)}\n${healthHtml(report)}\n  <main>\n${emptyHtml(report)}\n  </main>`
    : `  ${headlineHtml(report)}\n  ${healthHtml(report)}\n  <main>\n${report.projects.map((p, i) => projectHtml(p, i, report.date)).join('\n')}\n  </main>`;
  return pageShell(report, body, '', '数据来源：claude-mem（只读）');
}

/** 全量页：完整事件时间线（从摘要页「查看全部」进入） */
export function renderFullPage(report: DailyReport): string {
  const sections = report.projects
    .map(
      (p, i) => `
  <section class="project" aria-labelledby="proj-${i}">
    <div class="proj-head">
      <h2 class="proj-name" id="proj-${i}">${esc(p.project)}</h2>
      <span class="proj-meta"><span class="mono">${p.timeline.length}</span> 条事件</span>
    </div>
    ${timelineHtml(p, `tl-p${i}`)}
  </section>`,
    )
    .join('\n');
  const body = `  ${headlineHtml(report)}\n  ${healthHtml(report)}\n  <main>\n${sections}\n  </main>`;
  return pageShell(report, body, ' · 全量', `<a href="${dayHref(report.date)}" style="color:var(--accent);text-decoration:none">‹ 返回日报摘要</a>`);
}
