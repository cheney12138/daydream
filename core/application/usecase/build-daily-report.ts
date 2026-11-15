/**
 * usecase：把一天的原始记录组装成三层金字塔日报。
 *
 * 纪律（DESIGN）：
 * - 零 LLM 加工：narrative / facts / 五段式原文搬运，仅排序、分组、content 去重
 * - 工作量主指标 = 会话数 + files_modified 去重数；observation 条数仅参考
 * - discovery 默认折叠为二级事件；sensitive 折叠 + 标记
 * - 空日期返回 empty=true 的合法 DailyReport，绝不抛错
 */
import { normalizeProject } from '../../domain/project.js';
import type {
  DailyReport,
  Headline,
  HealthStatus,
  ProjectSection,
  SessionNarrative,
  TimelineItem,
} from '../../domain/report.js';
import type {
  MemorySource,
  ObservationRecord,
  SessionSummaryRecord,
  ToolUseStat,
} from '../port/driven/memory-source.js';
import type { ReportQueries } from '../port/driving/report-queries.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** 代码变更类：headline 的「N 处代码变更」 */
const CHANGE_TYPES = new Set(['change', 'bugfix', 'feature', 'refactor']);

/** 本地时区日期窗：[day 00:00, day 24:00) 的 epoch 毫秒 */
export function dayWindowMs(date: string): { startMs: number; endMs: number } {
  if (!DATE_RE.test(date)) {
    throw new Error(`invalid date format, expected YYYY-MM-DD: ${date}`);
  }
  const startMs = new Date(`${date}T00:00:00`).getTime();
  if (Number.isNaN(startMs)) {
    throw new Error(`invalid date: ${date}`);
  }
  return { startMs, endMs: startMs + 24 * 60 * 60 * 1000 };
}

export function localDateOfEpoch(epochMs: number): string {
  const d = new Date(epochMs);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function localTimeLabel(epochMs: number): string {
  const d = new Date(epochMs);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}

/** JSON TEXT 容错解析（facts / files_modified）：非数组或解析失败一律降级为 [] */
function parseStringArray(jsonText: string | null | undefined): string[] {
  if (!jsonText) return [];
  try {
    const parsed: unknown = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === 'string')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  } catch {
    return [];
  }
}

function dedupeSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

/** adapter 降级时可能送来 null/undefined，统一按空数组处理 */
function safeArray(values: string[] | null | undefined): string[] {
  return Array.isArray(values) ? values : [];
}

export class BuildDailyReport implements ReportQueries {
  constructor(private readonly source: MemorySource) {}

  async getDay(date: string): Promise<DailyReport> {
    // 先做格式校验，非法日期直接抛错（调用方转 400），绝不渲染无解释页面
    dayWindowMs(date);

    const [observations, summaries, toolUses, health] = await Promise.all([
      this.source.getDayObservations(date),
      this.source.getSessionSummaries(date),
      this.source.getToolUseStats(date),
      this.source.getHealth(),
    ]);

    const empty = observations.length === 0 && summaries.length === 0;

    const headline = this.buildHeadline(date, observations, summaries);
    const projects = this.buildProjects(observations, summaries, toolUses);

    return {
      date,
      generatedAt: new Date().toISOString(),
      empty,
      headline,
      health: empty ? withEmptyDayNote(health, date) : health,
      projects,
    };
  }

  async getLatestDate(): Promise<string | null> {
    const latest = await this.source.getLatestObservationDate();
    return latest;
  }

  async getProjects() {
    const stats = await this.source.getProjectStats();
    // 归一化后合并同名项目（如 dash 路径名与裸名并存）
    const merged = new Map<string, { count: number; lastAt: number | null }>();
    for (const s of stats) {
      const key = normalizeProject(s.project);
      const prev = merged.get(key) ?? { count: 0, lastAt: null };
      prev.count += s.observationCount;
      if (s.lastAtEpoch !== null && (prev.lastAt === null || s.lastAtEpoch > prev.lastAt)) {
        prev.lastAt = s.lastAtEpoch;
      }
      merged.set(key, prev);
    }
    return [...merged.entries()]
      .map(([project, v]) => ({
        project,
        observationCount: v.count,
        lastAtEpoch: v.lastAt,
      }))
      .sort((a, b) => b.observationCount - a.observationCount);
  }

  // ---------- 第一层：天级头条 ----------

  private buildHeadline(
    date: string,
    observations: ObservationRecord[],
    summaries: SessionSummaryRecord[],
  ): Headline {
    const typeCounts: Record<string, number> = {};
    let changeCount = 0;
    let bugfixCount = 0;
    for (const o of observations) {
      typeCounts[o.type] = (typeCounts[o.type] ?? 0) + 1;
      if (CHANGE_TYPES.has(o.type)) changeCount += 1;
      if (o.type === 'bugfix') bugfixCount += 1;
    }

    // 口径统一（F7）：会话数 = 当天有 observation 的去重会话数。
    // session_summaries 独有的会话（如 openai-compat 全程零 observation）不计入，
    // 否则同一数字在 API 与页面会出现两套口径；摘要仍用于叙事段展示。
    const sessionIds = new Set<string>();
    for (const o of observations) {
      if (o.memorySessionId) sessionIds.add(o.memorySessionId);
    }

    const allFiles = new Set<string>();
    for (const o of observations) {
      for (const f of safeArray(o.filesModified)) allFiles.add(f);
    }

    return {
      date,
      projectCount: new Set(observations.map((o) => normalizeProject(o.project))).size,
      sessionCount: sessionIds.size,
      observationCount: observations.length,
      filesModifiedCount: allFiles.size,
      typeCounts,
      changeCount,
      bugfixCount,
    };
  }

  // ---------- 第二层 + 第三层 ----------

  private buildProjects(
    observations: ObservationRecord[],
    summaries: SessionSummaryRecord[],
    toolUses: ToolUseStat[],
  ): ProjectSection[] {
    interface Bucket {
      rawProjects: Set<string>;
      observations: ObservationRecord[];
      summaries: SessionSummaryRecord[];
      toolUses: Map<string, number>;
      files: Set<string>;
    }
    const buckets = new Map<string, Bucket>();

    const bucketOf = (rawProject: string): Bucket => {
      const key = normalizeProject(rawProject);
      let b = buckets.get(key);
      if (!b) {
        b = { rawProjects: new Set(), observations: [], summaries: [], toolUses: new Map(), files: new Set() };
        buckets.set(key, b);
      }
      b.rawProjects.add(rawProject);
      return b;
    };

    for (const o of observations) {
      const b = bucketOf(o.project);
      b.observations.push(o);
      for (const f of safeArray(o.filesModified)) b.files.add(f);
    }
    for (const s of summaries) bucketOf(s.project).summaries.push(s);
    for (const t of toolUses) {
      // 工具统计只挂到当天有 observation/summary 的项目上；孤立项目也保留（真实动作可验证）
      const key = normalizeProject(t.project);
      const b = buckets.get(key) ?? bucketOf(t.project);
      b.toolUses.set(t.tool, (b.toolUses.get(t.tool) ?? 0) + t.count);
    }

    const sections: ProjectSection[] = [];
    for (const [project, b] of buckets) {
      sections.push({
        project,
        rawProjects: [...b.rawProjects].sort(),
        // 口径同 headline：只数有 observation 的会话
        sessionCount: new Set(
          b.observations.map((o) => o.memorySessionId).filter((id) => id.length > 0),
        ).size,
        filesModified: dedupeSorted(b.files),
        filesModifiedCount: b.files.size,
        toolUses: [...b.toolUses.entries()]
          .map(([tool, count]) => ({ tool, count }))
          .sort((a, z) => z.count - a.count || a.tool.localeCompare(z.tool)),
        summaries: b.summaries
          .sort((a, z) => a.createdAtEpoch - z.createdAtEpoch)
          .map((s) => this.toNarrative(s)),
        timeline: b.observations
          .sort((a, z) => a.createdAtEpoch - z.createdAtEpoch)
          .map((o) => this.toTimelineItem(o)),
        observationCount: b.observations.length,
      });
    }

    // 主指标排序：会话数优先，其次 observation 数，再按名字稳定序
    return sections.sort(
      (a, z) =>
        z.sessionCount - a.sessionCount ||
        z.observationCount - a.observationCount ||
        a.project.localeCompare(z.project),
    );
  }

  private toNarrative(s: SessionSummaryRecord): SessionNarrative {
    return {
      memorySessionId: s.memorySessionId,
      atEpoch: s.createdAtEpoch,
      request: s.request,
      investigated: s.investigated,
      learned: s.learned,
      completed: s.completed,
      nextSteps: s.nextSteps,
    };
  }

  private toTimelineItem(o: ObservationRecord): TimelineItem {
    const sensitive = o.type === 'sensitive';
    return {
      id: o.id,
      atEpoch: o.createdAtEpoch,
      at: o.createdAt,
      time: localTimeLabel(o.createdAtEpoch).slice(6), // 时间线内当天只需要 HH:mm
      type: o.type,
      title: o.title,
      narrative: o.narrative,
      facts: safeArray(o.facts),
      filesModified: safeArray(o.filesModified),
      sensitive,
      collapsed: sensitive || o.type === 'discovery',
    };
  }
}

/** 空日期的声明要连着采集状态说清楚：空白 ≠ 没干活（DESIGN §5） */
function withEmptyDayNote(health: HealthStatus, date: string): HealthStatus {
  const note = `「${date}」没有任何 observation / session summary 记录。`;
  return { ...health, message: `${note} ${health.message}` };
}

export { localTimeLabel };
