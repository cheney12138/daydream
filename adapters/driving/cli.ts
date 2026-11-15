#!/usr/bin/env npx tsx
/**
 * CLI 入口：
 *   npx tsx adapters/driving/cli.ts serve [--port 17777]
 *   npx tsx adapters/driving/cli.ts build --date 2026-11-15 [--out out/]
 *   npx tsx adapters/driving/cli.ts projects            （列出项目，辅助验证）
 *
 * 组装组合根：ClaudeMemSource（driven）→ BuildDailyReport（usecase）→ web/cli（driving）。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ClaudeMemSource } from '../driven/claude-mem-source.js';
import { BuildDailyReport } from '../../core/application/usecase/build-daily-report.js';
import { startServer } from './web/server.js';
import { renderDayPage } from './web/page.js';

function argValue(flag: string): string | undefined {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const [cmd = 'serve'] = process.argv.slice(2);
  const source = new ClaudeMemSource();
  const queries = new BuildDailyReport(source);

  if (cmd === 'serve') {
    const port = Number(argValue('--port') ?? 17777);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      console.error(`invalid --port: ${argValue('--port')}`);
      process.exit(1);
    }
    const server = await startServer({ port, queries });
    const addr = server.address();
    console.log(`daily-report serving on http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : port}`);
    console.log('  日报页  http://127.0.0.1:' + port + '/');
    console.log('  JSON   http://127.0.0.1:' + port + '/api/day/YYYY-MM-DD');
  } else if (cmd === 'build') {
    const date = argValue('--date');
    if (!date) {
      console.error('usage: build --date YYYY-MM-DD [--out out/]');
      process.exit(1);
    }
    const outDir = argValue('--out') ?? 'out';
    const report = await queries.getDay(date);
    const html = renderDayPage(report);
    mkdirSync(outDir, { recursive: true });
    const file = join(outDir, `report-${report.date}.html`);
    writeFileSync(file, html, 'utf8');
    console.log(
      `written: ${file}（${report.headline.observationCount} 条记录 / ${report.headline.projectCount} 项目 / empty=${report.empty}）`,
    );
    source.close();
  } else if (cmd === 'projects') {
    const projects = await queries.getProjects();
    for (const p of projects) {
      console.log(`${p.project}\t${p.observationCount} obs\tlast=${p.lastAtEpoch ? new Date(p.lastAtEpoch).toISOString() : '-'}`);
    }
    source.close();
  } else {
    console.error(`unknown command: ${cmd}`);
    console.error('usage: cli.ts serve [--port 17777] | build --date YYYY-MM-DD | projects');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
