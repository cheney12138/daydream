/**
 * driven adapter：只读消费 ~/.claude-mem/claude-mem.db（DESIGN §4/§7）。
 *
 * 纪律：
 * - DatabaseSync(path, { readOnly: true })，绝不写入
 * - 只 SELECT 明确列名；缺列 try/catch 逐级降级（schema 漂移只改这个文件）
 * - created_at_epoch 为毫秒；日期窗按本地时区 [day 00:00, day 24:00)
 * - JSON TEXT（facts/files_modified）解析失败降级为 []
 * - sensitive 类型原样读出打标，折叠决策在 usecase
 * - agent_type 实测全空，不使用
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import type {
  HealthStatus,
} from '../../core/domain/report.js';
import type {
  MemorySource,
  ObservationRecord,
  ProjectStat,
  SessionSummaryRecord,
  ToolUseStat,
} from '../../core/application/port/driven/memory-source.js';
import { dayWindowMs, localDateOfEpoch, localTimeLabel } from '../../core/application/usecase/build-daily-report.js';

const DB_PATH = process.env.CLAUDE_MEM_DB ?? join(homedir(), '.claude-mem', 'claude-mem.db');
const HEALTH_PATH = process.env.CLAUDE_MEM_HEALTH ?? join(homedir(), '.claude-mem', 'observer-health.json');
const HEARTBEAT_PATH = process.env.CLAUDE_MEM_HEARTBEAT ?? join(homedir(), '.claude-mem', 'worker-heartbeat.json');
/** 超过该时长没有新 observation 视为采集中断（observer 正常时几分钟就会写入） */
const STALE_MS = 6 * 60 * 60 * 1000;

/** 列集逐级降级：新 schema 列缺失时退回老列集 */
async function selectWithFallback<T>(
  db: DatabaseSyncType,
  columnSets: string[],
  tableFrom: (cols: string) => string,
  mapRow: (row: Record<string, unknown>) => T,
): Promise<T[]> {
  let lastError: unknown = null;
  for (const cols of columnSets) {
    try {
      const rows = db.prepare(tableFrom(cols)).all() as Array<Record<string, unknown>>;
      return rows.map(mapRow);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`claude-mem query failed for all column sets: ${String(lastError)}`);
}

function parseStringArray(jsonText: unknown): string[] {
  if (typeof jsonText !== 'string' || jsonText.length === 0) return [];
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

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v);
}

export class ClaudeMemSource implements MemorySource {
  private db: DatabaseSyncType | null = null;
  private readonly dbPath: string;

  constructor(dbPath: string = DB_PATH) {
    this.dbPath = dbPath;
  }

  private getDb(): DatabaseSyncType {
    if (!this.db) {
      this.db = new DatabaseSync(this.dbPath, { readOnly: true });
    }
    return this.db;
  }

  /** 允许复用进程内单例时显式关闭（CLI build 用完即退，可不管） */
  close(): void {
    this.db?.close();
    this.db = null;
  }

  async getDayObservations(date: string): Promise<ObservationRecord[]> {
    const { startMs, endMs } = dayWindowMs(date);
    return selectWithFallback<ObservationRecord>(
      this.getDb(),
      [
        'id, memory_session_id, project, type, title, narrative, facts, files_modified, created_at, created_at_epoch',
        'id, project, type, title, narrative, facts, files_modified, created_at, created_at_epoch',
        'id, project, type, title, created_at, created_at_epoch',
      ],
      (cols) =>
        `SELECT ${cols} FROM observations WHERE created_at_epoch >= ${startMs} AND created_at_epoch < ${endMs} ORDER BY created_at_epoch ASC`,
      (row) => ({
        id: num(row.id),
        memorySessionId: str(row.memory_session_id),
        project: str(row.project),
        type: str(row.type),
        title: str(row.title),
        narrative: str(row.narrative),
        facts: parseStringArray(row.facts),
        filesModified: parseStringArray(row.files_modified),
        createdAtEpoch: num(row.created_at_epoch),
        createdAt: str(row.created_at),
      }),
    );
  }

  async getSessionSummaries(date: string): Promise<SessionSummaryRecord[]> {
    const { startMs, endMs } = dayWindowMs(date);
    return selectWithFallback<SessionSummaryRecord>(
      this.getDb(),
      [
        'memory_session_id, project, request, investigated, learned, completed, next_steps, created_at, created_at_epoch',
        'memory_session_id, project, created_at, created_at_epoch',
      ],
      (cols) =>
        `SELECT ${cols} FROM session_summaries WHERE created_at_epoch >= ${startMs} AND created_at_epoch < ${endMs} ORDER BY created_at_epoch ASC`,
      (row) => ({
        memorySessionId: str(row.memory_session_id),
        project: str(row.project),
        request: str(row.request),
        investigated: str(row.investigated),
        learned: str(row.learned),
        completed: str(row.completed),
        nextSteps: str(row.next_steps),
        createdAtEpoch: num(row.created_at_epoch),
        createdAt: str(row.created_at),
      }),
    );
  }

  async getToolUseStats(date: string): Promise<ToolUseStat[]> {
    const { startMs, endMs } = dayWindowMs(date);
    const rows = this.getDb()
      .prepare(
        `SELECT project, tool_name, COUNT(*) AS c FROM tool_uses WHERE created_at_epoch >= ${startMs} AND created_at_epoch < ${endMs} GROUP BY project, tool_name ORDER BY c DESC`,
      )
      .all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      project: str(row.project),
      tool: str(row.tool_name),
      count: num(row.c),
    }));
  }

  async getHealth(): Promise<HealthStatus> {
    const lastObs = this.getLastObservationEpoch();
    const healthFile = readJsonFile(HEALTH_PATH) as Record<string, unknown> | null;
    const failures = healthFile && typeof healthFile['consecutiveFailures'] === 'number' ? healthFile['consecutiveFailures'] : null;
    const lastError = str(healthFile?.['lastErrorMessage']) || null;

    const now = Date.now();
    const stale = lastObs === null || now - lastObs > STALE_MS;
    const label = lastObs === null ? null : localTimeLabel(lastObs);

    if (lastObs === null) {
      return {
        ok: false,
        lastObservationAt: null,
        lastObservationLabel: null,
        message: 'claudemem db 中没有任何 observation 记录，采集状态未知',
        consecutiveFailures: failures,
        lastError,
        basis: 'none',
      };
    }

    if (stale) {
      const since = failures !== null && failures > 0 ? `，连续失败 ${failures} 次` : '';
      const err = lastError ? `（${lastError}）` : '';
      return {
        ok: false,
        lastObservationAt: lastObs,
        lastObservationLabel: label,
        message: `claudemem 采集中断（最后一条 observation 为 ${label}${since}）${err}`,
        consecutiveFailures: failures,
        lastError,
        basis: failures !== null ? 'observer-health' : 'last-observation',
      };
    }

    return {
      ok: true,
      lastObservationAt: lastObs,
      lastObservationLabel: label,
      message: `claudemem 采集正常（最后一条 observation 为 ${label}）`,
      consecutiveFailures: failures,
      lastError,
      basis: 'last-observation',
    };
  }

  async getLatestObservationDate(): Promise<string | null> {
    const lastObs = this.getLastObservationEpoch();
    return lastObs === null ? null : localDateOfEpoch(lastObs);
  }

  async getProjectStats(): Promise<ProjectStat[]> {
    const rows = this.getDb()
      .prepare(
        'SELECT project, COUNT(*) AS c, MAX(created_at_epoch) AS last_at FROM observations GROUP BY project ORDER BY c DESC',
      )
      .all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      project: str(row.project),
      observationCount: num(row.c),
      lastAtEpoch: row.last_at == null ? null : num(row.last_at),
    }));
  }

  /** 最后一条 observation 的 epoch 毫秒；表不存在/db 打不开时 null */
  private getLastObservationEpoch(): number | null {
    try {
      const row = this.getDb().prepare('SELECT MAX(created_at_epoch) AS m FROM observations').get() as
        | { m: unknown }
        | undefined;
      return row && row.m != null ? num(row.m) : null;
    } catch {
      return null;
    }
  }
}

function readJsonFile(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}
