/**
 * driving 端口：日报查询。adapters/driving/{web,cli} 只依赖此接口。
 */
import type { DailyReport } from '../../../domain/report.js';
import type { ProjectStat } from '../driven/memory-source.js';

export interface ReportQueries {
  /** 某天的完整日报（三层金字塔）。date 格式 YYYY-MM-DD；空日期返回 empty=true 的合法报告 */
  getDay(date: string): Promise<DailyReport>;
  /** 最后一条 observation 的本地日期，首页默认展示用；无数据时 null */
  getLatestDate(): Promise<string | null>;
  /** 项目列表（全时段统计，project 名已归一化合并） */
  getProjects(): Promise<ProjectStat[]>;
}
