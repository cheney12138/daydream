# daily-report-helper 产品设计稿

> v0.1 设计稿（advisor 工程方案 + oracle 深度分析合并版）
> 数据现状实测：claude-mem.db 1787 条 observations（discovery 1108 / change 232 / bugfix 180 / feature 125 / decision 67 / refactor 67 / sensitive 3）；session_summaries 自带五段式摘要；agent_type 全空；项目分布 honour 572 / dist 404 / glance 314 / chain-review 285。

## 1. 一句话定位

**把散落在 agent 记忆里的一天，还原成一条可扫读的时间线。**

- 不做采集器，做**聚合器**：只读消费本地已有的记忆/用量数据
- 与现有产品分工：usage-ext / ai-coding-usage = 用量与采纳度（"用了多少"）；本项目 = 内容与事件（"做了什么"）
- 读者只有一个：**自己**（回顾视角）。向上汇报、团队聚合均为 non-goal

## 2. 核心设计原则

1. **零 LLM 加工**：session_summaries（request/investigated/learned/completed/next_steps）就是 claude-mem 已生成好的会话级摘要，日报只做搬运 + 分组 + 排序。页面上每句话都能在 SQLite 里找到原文 = 零幻觉。
2. **引用而非改写**：narrative / facts 原文展示，仅排序、分组、去重（content_hash 去重）。
3. **统计数字可点开验证**：任何计数展开后是对应的原始 observation 列表。
4. **数据缺失是常态**：日报头部必须有采集健康声明（见 §5）。

## 3. 信息架构（三层金字塔）

```
第一层：天级头条
  「今天 3 个项目、7 个会话、12 处代码变更、1 个 bugfix」  ← 纯计数，零失真

第二层：项目分节（project 名归一化：路径取尾段）
  honour（4 会话）：
    ✓ 完成了什么  ← session_summaries.completed 原文
    → 下一步      ← session_summaries.next_steps 原文
    动作统计：files_modified 去重数 + tool_uses 聚合（Edit×12 Bash×8…）

第三层：事件时间线（可折叠）
  14:02 [bugfix] 修复订单详情空指针…
  15:47 [decision] 选择方案 B 因为…
  ← observation.title + narrative 原文；discovery 默认折叠（占 62%，是噪音，
    但是"为什么做"的证据链，不丢弃只降级）；点击展开详情
```

- 工作量度量以**会话数 + files_modified 去重数**为主，observation 条数只做参考（同一会话密度不均，按条数衡量失真）
- 类型分布条放时间线之下：日报回答"什么"，不回答"多少"——打开页面第一眼必须是文字不是图表

## 4. 架构（六边形，对齐 pi-usage-ext 风格）

```
adapters/driven/               ← 数据源适配器（只读）
  claude-mem-source.ts           读 ~/.claude-mem/claude-mem.db（mode=ro）
  usage-source.ts                （二期）接 pi-usage-ext 用量
  codex-source.ts                （三期）读 ~/.codex/memories_1.sqlite 等
core/
  domain/                        DailyReport / ReportEntry / Project 纯类型
  application/
    port/driven/   MemorySource   按时间窗取 observations/summaries/tool_uses
    port/driving/  ReportQueries getDay / getRange / getProjects
    usecase/        BuildDailyReport / ListProjects / GetDayDetail
adapters/driving/
  web/  server.ts（Node http）+ api.ts（JSON）+ page.ts（服务端拼 HTML，无 SPA）
  cli/  cli.ts（`daily-report serve` / `daily-report build --date 2026-11-15`）
```

**技术选型（刻意轻）**：Node + TypeScript + tsx；SQLite 用 `node:sqlite`（Node 22+ 内置，readonly 满足不侵入）；不引入打包器 / ORM / 前端框架。

**关键纪律**：
- claude-mem 是被消费方不是依赖方；schema 演进快（有 schema_versions），adapter 只 SELECT 明确列名、容忍缺列、不建物化视图——schema 漂移只改一个文件
- 不建中间同步库：惰性即席查询，无一致性问题，数据丢失风险为零
- 查询窗口：本地时区 [day 00:00, day 24:00)，按 observation 自身时间戳归属
- Web 只绑 127.0.0.1；本产品是本机回顾工具，不是可分发文档（narrative 里可能有内网 URL/密钥名，产品不负责清洗，在边界上声明）

## 5. 采集健康监控（oracle 提议，采纳进 MVP）

当前 claude-mem observer 凭据已失效约 45h——这正是这个功能的价值证明：**日报的元价值之一是充当 claude-mem 的健康监控**。

- 日报头部显示数据完整性声明：`「11-15：claudemem 采集中断（最后一条 observation 为 11-13 14:22）」`
- 判断依据：`observer-health.json` / `worker-heartbeat.json` / 最后一条 observation 时间
- 空日期必须显示明确空态 + 采集状态，绝不渲染无解释的空白页（避免"空白 = 没干活"的信任事故）

## 6. 隐私与边界

- **sensitive（3 条实测）**：不是"不显示"，是默认折叠 + 标记（本机单人工具，藏起来破坏完整回顾）；一旦出现导出/分享功能，脱敏必须进导出管道而非 CSS 隐藏
- **不做**：金额换算（单价表易腐且模型别名易错）、团队聚合（合规，另一个产品）、跨设备 sync（技术上 claude-mem 有 sync 表，明确 non-goal）
- **不依赖 agent_type**（实测全空）：不做 agent 归因，按 project 分组已够；归因数据等新数据实际开始填充再设计

## 7. 数据流

- **触发**：打开页面惰性计算，无定时任务、无常驻采集
- **schema 映射**：
  - `observations.created_at_epoch + project` → 分组与时间线
  - `session_summaries.{request,investigated,learned,completed,next_steps}` → 项目叙事段（无 summaries 的项目降级为 title 列表）
  - `observations.{type,title,narrative,facts}` → 时间线与详情
  - `observations.files_modified`（JSON TEXT，解析去重）→ 编辑统计
  - `tool_uses.{tool_name,platform_source}` → 动作聚合
  - `observations.type='sensitive'` → 默认折叠 + 标记

## 8. MVP 验收标准

1. `npx tsx adapters/driving/cli.ts serve` 启动后浏览器打开 localhost 能看到指定日期日报页
2. 日报页正确显示 ≥3 个真实项目分组，每组含叙事段 + 时间线 + 文件/工具统计，数字与直接查 claude-mem.db 的 SQL 结果一致
3. 日期导航切换任意历史日期均能渲染；空日期显示空态 + 采集健康声明而非空白/报错
4. `type=sensitive` 条目默认折叠且带标记；db 以 mode=ro 打开，无任何写入
5. 打开页面到可交互 < 2s；断网可用

## 9. MVP 明确不做 → 二期候选（按杠杆率排序）

| 优先级 | 功能 | 备注 |
|---|---|---|
| 二期 | 周报/月报 | 天级日期范围选择的自然产物，不独立设计 |
| 二期 | Codex / pi 源接入 | 架构留 adapter 位即可 |
| 二期 | 用量侧栏（从 usage-ext 取数） | 只做用量曲线，不做金额 |
| 三期 | 天级叙事 | 若做，**抽取式**（挑最重的 3 个 session 摘要拼接）而非生成式 |
| never | 团队聚合 / 金额 / LLM 日报生成 | non-goal |

## 10. 反模式警告（三个最易做错的事）

1. **让 LLM 重写一遍日报**——摧毁零幻觉根基，引入延迟与外部依赖。本产品差异化恰恰是"记忆的可信投影"。
2. **做成 dashboard 而不是日报**——"今天做了什么"的答案是一句话、一个时间线、一列完成项，不是六个饼图。
3. **把 claude-mem schema 当稳定 API**——寄生在活跃演进项目上，读取层必须薄、容错、即席计算。
