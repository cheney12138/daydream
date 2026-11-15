/**
 * driven 端口：记忆数据源。adapters/driven/* 实现此接口。
 *
 * 纪律（DESIGN §4）：
 * - 一切读取按本地时区日期窗归属（[day 00:00, day 24:00)），date 格式 YYYY-MM-DD
 * - schema 容错是 adapter 的职责，端口只承诺「拿到什么就给什么」，缺列给空值
 * - sensitive 类型打标透传，不隐藏
 */
import type {
  HealthStatus,
  ObservationType,
} from '../../../domain/report.js';

/** observations 行的最小投影（缺列降级为空串/空数组） */
export interface ObservationRecord {
  id: number;
  memorySessionId: string;
  /** 原始 project 名，归一化在 domain 层做 */
  project: string;
  type: ObservationType;
  title: string;
  narrative: string;
  /** facts JSON TEXT 解析结果，解析失败为 [] */
  facts: string[];
  /** files_modified JSON TEXT 解析结果，解析失败为 [] */
  filesModified: string[];
  /** epoch 毫秒 */
  createdAtEpoch: number;
  /** 原始 created_at 字符串 */
  createdAt: string;
}

/** session_summaries 行投影（五段式，缺列给空串） */
export interface SessionSummaryRecord {
  memorySessionId: string;
  project: string;
  request: string;
  investigated: string;
  learned: string;
  completed: string;
  nextSteps: string;
  createdAtEpoch: number;
  createdAt: string;
}

/** tool_uses 聚合行 */
export interface ToolUseStat {
  project: string;
  tool: string;
  count: number;
}

/** 全时段项目统计（ListProjects 用） */
export interface ProjectStat {
  project: string;
  observationCount: number;
  /** 最后一条 observation 的 epoch 毫秒 */
  lastAtEpoch: number | null;
}

export interface MemorySource {
  /** 某天的 observations，按 createdAtEpoch 升序 */
  getDayObservations(date: string): Promise<ObservationRecord[]>;
  /** 某天的 session summaries，按 createdAtEpoch 升序 */
  getSessionSummaries(date: string): Promise<SessionSummaryRecord[]>;
  /** 某天 tool_uses 按 (project, tool) 聚合计数 */
  getToolUseStats(date: string): Promise<ToolUseStat[]>;
  /** 采集健康：observer-health.json / worker-heartbeat.json + 最后一条 observation 时间 */
  getHealth(): Promise<HealthStatus>;
  /** 最后一条 observation 的本地日期（YYYY-MM-DD），db 为空时 null。首页默认展示用 */
  getLatestObservationDate(): Promise<string | null>;
  /** 全时段项目统计，按 observationCount 降序 */
  getProjectStats(): Promise<ProjectStat[]>;
}
