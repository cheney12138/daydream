/**
 * 领域层纯类型 —— daily-report-helper
 *
 * 零行为、零 IO：所有字段都能在 claude-mem.db 原始数据里找到出处（零幻觉原则）。
 * 时间戳统一使用 epoch 毫秒（与 claude-mem 的 created_at_epoch 一致）。
 */

/** observation 类型。claude-mem schema 演进快，允许未知类型透传（如 gotcha / pattern）。 */
export type ObservationType =
  | 'discovery'
  | 'change'
  | 'bugfix'
  | 'feature'
  | 'decision'
  | 'refactor'
  | 'sensitive'
  | (string & {});

/** 时间线单条事件：observation.title + narrative 原文，仅排序/分组/去重，不改写。 */
export interface TimelineItem {
  /** observation.id */
  id: number;
  /** epoch 毫秒 */
  atEpoch: number;
  /** ISO 字符串（原样来自 db 的 created_at） */
  at: string;
  /** 本地时间 HH:mm，用于时间线展示 */
  time: string;
  type: ObservationType;
  title: string;
  /** narrative 原文 */
  narrative: string;
  /** facts 原文列表（JSON TEXT 解析，失败降级为空） */
  facts: string[];
  /** files_modified 去重列表 */
  filesModified: string[];
  /** type === 'sensitive'：默认折叠 + 标记（不隐藏，见 DESIGN §6） */
  sensitive: boolean;
  /** discovery / sensitive 默认折叠 */
  collapsed: boolean;
}

/** 会话级五段式摘要，session_summaries 原文搬运。 */
export interface SessionNarrative {
  memorySessionId: string;
  /** epoch 毫秒 */
  atEpoch: number;
  request: string;
  investigated: string;
  learned: string;
  completed: string;
  nextSteps: string;
}

/** 第二层：项目分节。工作量主指标 = 会话数 + files_modified 去重数。 */
export interface ProjectSection {
  /** 归一化后的项目名（路径取尾段） */
  project: string;
  /** 归一化前合并掉的原始 project 名（如 -Users-qianyuchen-work-honour） */
  rawProjects: string[];
  sessionCount: number;
  /** 该项目当天 files_modified 去重后的文件列表 */
  filesModified: string[];
  filesModifiedCount: number;
  /** 工具聚合，按次数降序 */
  toolUses: Array<{ tool: string; count: number }>;
  /** 五段式会话摘要（无 summaries 的项目降级为时间线 title 列表） */
  summaries: SessionNarrative[];
  /** 按时间升序的事件时间线 */
  timeline: TimelineItem[];
  /** 该项目当天 observation 条数（仅参考指标，不用于衡量工作量） */
  observationCount: number;
}

/** 第一层：天级头条，纯计数零失真。任何数字可点开验证。 */
export interface Headline {
  date: string;
  projectCount: number;
  /** 当天去重会话数（observations + summaries 的 memory_session_id 并集） */
  sessionCount: number;
  observationCount: number;
  /** 全天 files_modified 去重数 */
  filesModifiedCount: number;
  /** 类型分布：type → 条数 */
  typeCounts: Record<string, number>;
  /** 代码变更数（change/bugfix/feature/refactor 之和），头条用 */
  changeCount: number;
  /** bugfix 条数，头条用 */
  bugfixCount: number;
}

/**
 * 采集健康声明。空日期必须显示明确空态 + 采集状态，
 * 绝不渲染无解释的空白页（DESIGN §5）。
 */
export interface HealthStatus {
  /** true = 采集正常；false = 中断/存疑 */
  ok: boolean;
  /** 最后一条 observation 的 epoch 毫秒（null = db 无记录） */
  lastObservationAt: number | null;
  /** 本地时间标签，如 「11-13 14:22」 */
  lastObservationLabel: string | null;
  /** 人读的健康声明整句，如 「claudemem 采集中断（最后一条 observation 为 11-13 14:22，连续失败 3885 次）」 */
  message: string;
  consecutiveFailures: number | null;
  lastError: string | null;
  /** 判断依据来源 */
  basis: 'observer-health' | 'last-observation' | 'none';
}

/** 日报聚合根：三层金字塔的完整投影。 */
export interface DailyReport {
  /** YYYY-MM-DD（本地时区归属） */
  date: string;
  /** 生成时刻 ISO 字符串 */
  generatedAt: string;
  /** 当天无任何 observation / summary → 空态，页面必须渲染空态 + 健康声明 */
  empty: boolean;
  headline: Headline;
  health: HealthStatus;
  /** 按 sessionCount 降序，其次 observationCount 降序 */
  projects: ProjectSection[];
}
