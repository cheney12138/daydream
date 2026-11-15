/**
 * driving adapter：服务端拼 HTML。零 JS 框架，交互全靠 details/summary 原生元素。
 *
 * 页面结构 = DESIGN §3 三层金字塔：
 *   第一层 天级头条（纯计数，details 展开验证类型分布）
 *   第二层 项目分节（五段式叙事 + 文件/工具统计）
 *   第三层 事件时间线（discovery/sensitive 默认折叠；sensitive 带标记）
 * 空日期 → 空态 + 健康声明，绝不渲染无解释的空白页（DESIGN §5）。
 * 本版为功能可用版：语义化结构 + 折叠，视觉打磨由 F7 负责。
 */
import type { DailyReport, ProjectSection } from '../../../core/domain/report.js';

function esc(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function prevDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() - 1);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function nextDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + 1);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function dayHref(date: string): string {
  return `/day/${date}`;
}

const STYLE = `
  :root { color-scheme: light; }
  body { font-family: -apple-system, "PingFang SC", "Hiragino Sans GB", sans-serif; max-width: 860px; margin: 0 auto; padding: 16px; line-height: 1.6; color: #1f2328; }
  header nav a { margin-right: 8px; }
  .banner { border-radius: 6px; padding: 8px 12px; margin: 8px 0; }
  .banner.warn { background: #fff3cd; border: 1px solid #e0c36a; }
  .banner.ok { background: #e6f4ea; border: 1px solid #9ecfa8; }
  .headline { border-bottom: 1px solid #d8dee4; padding-bottom: 8px; }
  section.project { border: 1px solid #d8dee4; border-radius: 8px; padding: 8px 16px; margin: 16px 0; }
  section.project > h2 { margin: 8px 0 4px; }
  .metrics { color: #59636e; font-size: 0.95em; }
  .narrative p { margin: 4px 0; }
  .narrative b { color: #59636e; font-weight: 600; }
  ul.timeline { list-style: none; padding-left: 0; }
  ul.timeline > li { border-left: 2px solid #d8dee4; margin: 4px 0 4px 4px; padding-left: 10px; }
  .badge { display: inline-block; border-radius: 4px; padding: 0 6px; font-size: 0.8em; background: #eaeef2; color: #424a53; margin-right: 4px; }
  .badge.sensitive { background: #ffebe9; color: #9a1a12; }
  .badge.discovery { background: #f0f0f0; color: #777; }
  details > summary { cursor: pointer; }
  .muted { color: #59636e; }
  .empty { text-align: center; padding: 48px 0; color: #59636e; }
  footer { margin-top: 24px; font-size: 0.85em; color: #8c959f; border-top: 1px solid #d8dee4; padding-top: 8px; }
`;

function typeBadge(type: string): string {
  const cls = type === 'sensitive' ? 'sensitive' : type === 'discovery' ? 'discovery' : '';
  return `<span class="badge ${cls}">${esc(type)}</span>`;
}

function headlineHtml(report: DailyReport): string {
  const h = report.headline;
  const summary =
    `${h.projectCount} 个项目 · ${h.sessionCount} 个会话 · ${h.filesModifiedCount} 个文件改动 · ` +
    `${h.changeCount} 处代码变更（${h.bugfixCount} bugfix） · ${h.observationCount} 条记录`;
  const typeRows = Object.entries(h.typeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `<li>${typeBadge(type)} × ${count}</li>`)
    .join('');
  return `
  <section class="headline">
    <details>
      <summary><strong>${esc(summary)}</strong></summary>
      <ul><li class="muted">类型分布（点开验证，对应原始 observation 列表见下方各项目时间线）：</li>${typeRows}</ul>
    </details>
  </section>`;
}

function narrativeHtml(project: ProjectSection): string {
  if (project.summaries.length === 0) {
    return `<p class="muted">（该会话无五段式摘要，降级为下方时间线 title 列表）</p>`;
  }
  const items = project.summaries
    .map((s) => {
      const seg = (label: string, text: string) =>
        text ? `<p><b>${label}</b> ${esc(text)}</p>` : '';
      return `
      <details open>
        <summary>会话 ${esc(s.memorySessionId.slice(0, 8))}…</summary>
        <div class="narrative">
          ${seg('请求：', s.request)}
          ${seg('调查：', s.investigated)}
          ${seg('学到：', s.learned)}
          ${seg('完成：', s.completed)}
          ${seg('下一步：', s.nextSteps)}
        </div>
      </details>`;
    })
    .join('');
  return `<div>${items}</div>`;
}

function statsHtml(project: ProjectSection): string {
  const files =
    project.filesModified.length > 0
      ? `<details><summary>文件改动 ${project.filesModifiedCount}（去重）</summary><ul>${project.filesModified
          .map((f) => `<li><code>${esc(f)}</code></li>`)
          .join('')}</ul></details>`
      : '';
  const tools =
    project.toolUses.length > 0
      ? `<details><summary>工具统计（共 ${project.toolUses.reduce((s, t) => s + t.count, 0)} 次）</summary><ul>${project.toolUses
          .map((t) => `<li>${esc(t.tool)} × ${t.count}</li>`)
          .join('')}</ul></details>`
      : '';
  return `<div class="metrics">${files}${tools}</div>`;
}

function timelineHtml(project: ProjectSection): string {
  if (project.timeline.length === 0) return '';
  const items = project.timeline
    .map((t) => {
      const open = t.collapsed ? '' : ' open';
      const mark = t.sensitive ? ' ⚠ sensitive' : '';
      const facts =
        t.facts.length > 0
          ? `<ul>${t.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`
          : '';
      const files =
        t.filesModified.length > 0
          ? `<p class="muted">文件：${t.filesModified.map((f) => `<code>${esc(f)}</code>`).join(', ')}</p>`
          : '';
      const body = [t.narrative ? `<p>${esc(t.narrative)}</p>` : '', facts, files]
        .filter(Boolean)
        .join('');
      return `
      <li>
        <details${open}>
          <summary><span class="muted">${esc(t.time)}</span> ${typeBadge(t.type)} ${esc(t.title || '(无标题)')}${mark}</summary>
          ${body}
        </details>
      </li>`;
    })
    .join('');
  return `<h3>时间线（${project.timeline.length} 条）</h3><ul class="timeline">${items}</ul>`;
}

function projectHtml(project: ProjectSection): string {
  const rawNote =
    project.rawProjects.length > 1
      ? ` <span class="muted">（合并自 ${project.rawProjects.map(esc).join(' + ')}）</span>`
      : '';
  return `
  <section class="project">
    <h2>${esc(project.project)}${rawNote}</h2>
    <p class="metrics">${project.sessionCount} 会话 · ${project.filesModifiedCount} 文件改动 · ${project.observationCount} 条记录</p>
    ${narrativeHtml(project)}
    ${statsHtml(project)}
    ${timelineHtml(project)}
  </section>`;
}

export function renderDayPage(report: DailyReport): string {
  const d = report.date;
  const health = report.health.ok
    ? `<div class="banner ok">${esc(report.health.message)}</div>`
    : `<div class="banner warn">${esc(report.health.message)}</div>`;

  const body = report.empty
    ? `
  <div class="empty">
    <h2>${esc(d)} 没有任何记录</h2>
    <p>当天没有 observation / session summary。空白 ≠ 没干活：请结合上方采集健康声明判断。</p>
  </div>`
    : headlineHtml(report) + report.projects.map(projectHtml).join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>日报 ${esc(d)}</title>
<style>${STYLE}</style>
</head>
<body>
<header>
  <h1>日报 · ${esc(d)}</h1>
  <nav>
    <a href="${dayHref(prevDate(d))}">← 前一天</a>
    <a href="/">最新</a>
    <a href="${dayHref(nextDate(d))}">后一天 →</a>
  </nav>
  ${health}
</header>
<main>
${body}
</main>
<footer>
数据来源 ~/.claude-mem/claude-mem.db（只读）· 生成于 ${esc(report.generatedAt)} · narrative/facts/摘要均为原文搬运，零改写
</footer>
</body>
</html>`;
}
