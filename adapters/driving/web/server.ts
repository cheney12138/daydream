/**
 * driving adapter：Node http server。只绑 127.0.0.1（本机回顾工具，非可分发文档）。
 *
 * 路由：
 *   GET /                → 最新有数据日期的日报页（直接 200 渲染，便于 curl 验收）
 *   GET /day/:date       → 指定日期日报页
 *   GET /api/day/:date   → JSON（api.ts）
 *   GET /api/health      → JSON（最新数据日期）
 */
import { createServer, type Server } from 'node:http';
import type { ReportQueries } from '../../../core/application/port/driving/report-queries.js';
import { handleApiRequest } from './api.js';
import { renderDayPage } from './page.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ServeOptions {
  port?: number;
  host?: string;
  queries: ReportQueries;
}

function send(res: import('node:http').ServerResponse, status: number, contentType: string, body: string): void {
  res.writeHead(status, { 'Content-Type': contentType, 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function html(res: import('node:http').ServerResponse, status: number, body: string): void {
  send(res, status, 'text/html; charset=utf-8', body);
}

export function startServer({ port = 17777, host = '127.0.0.1', queries }: ServeOptions): Promise<Server> {
  const server = createServer(async (req, res) => {
    const pathname = (req.url ?? '/').split('?')[0]!;

    try {
      // API 先行
      if (pathname.startsWith('/api/')) {
        const apiRes = await handleApiRequest(pathname, queries);
        send(res, apiRes.status, 'application/json; charset=utf-8', apiRes.body);
        return;
      }

      // 首页：最新有数据的日期（无数据则今天，渲染空态 + 健康声明）
      if (pathname === '/') {
        const latest = await queries.getLatestDate();
        const date = latest ?? localToday();
        const report = await queries.getDay(date);
        html(res, 200, renderDayPage(report));
        return;
      }

      const dayMatch = /^\/day\/(\d{4}-\d{2}-\d{2})$/.exec(pathname);
      if (dayMatch) {
        const date = dayMatch[1]!;
        const report = await queries.getDay(date);
        html(res, 200, renderDayPage(report));
        return;
      }

      if (pathname === '/healthz') {
        send(res, 200, 'text/plain; charset=utf-8', 'ok');
        return;
      }

      html(res, 404, '<!doctype html><html lang="zh-CN"><body><h1>404</h1><p><a href="/">回首页</a></p></body></html>');
    } catch (err) {
      // 非法日期格式等：400；其余 500 但给出人话
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('invalid date')) {
        html(res, 400, `<!doctype html><html lang="zh-CN"><body><h1>400</h1><p>${escapeHtml(message)}</p></body></html>`);
      } else {
        html(
          res,
          500,
          `<!doctype html><html lang="zh-CN"><body><h1>500</h1><pre>${escapeHtml(message)}</pre></body></html>`,
        );
      }
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}

function escapeHtml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function localToday(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export { DATE_RE };
