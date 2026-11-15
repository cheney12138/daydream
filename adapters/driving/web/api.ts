/**
 * driving adapter：REST JSON API。纯函数式路由，无框架。
 *
 * GET /api/day/:date → { ok: true, data: DailyReport }（结构与 core/domain 类型一致）
 * 非法日期 → 400；未知路径 → 404。
 */
import type { DailyReport } from '../../../core/domain/report.js';
import type { ReportQueries } from '../../../core/application/port/driving/report-queries.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ApiResponse {
  status: number;
  body: string;
}

function json(status: number, payload: unknown): ApiResponse {
  return { status, body: JSON.stringify(payload, null, 2) };
}

export async function handleApiRequest(
  pathname: string,
  queries: ReportQueries,
): Promise<ApiResponse> {
  const match = /^\/api\/day\/(\d{4}-\d{2}-\d{2})$/.exec(pathname);
  if (match) {
    const date = match[1]!;
    let report: DailyReport;
    try {
      report = await queries.getDay(date);
    } catch (err) {
      // getDay 只在日期格式非法时抛错
      return json(400, { ok: false, error: `invalid date: ${date}`, detail: String(err) });
    }
    return json(200, { ok: true, data: report });
  }

  if (pathname === '/api/health') {
    const latest = await queries.getLatestDate();
    return json(200, { ok: true, data: { latestDate: latest } });
  }

  if (pathname.startsWith('/api/')) {
    return json(404, { ok: false, error: `unknown api path: ${pathname}` });
  }

  return json(404, { ok: false, error: `not found: ${pathname}` });
}

export { DATE_RE };
