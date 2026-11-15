# TASKS.md — Feature 拆分

> 依据 DESIGN.md 拆分。粒度原则：每个 feature 可独立验收（实跑验证，不写单测不做 mock）。
> 分支：feat/mvp

## F0 基建（主会话完成）✅
- git init + feat/mvp 分支
- package.json / tsconfig / 目录骨架（六边形）
- DESIGN.md / TASKS.md

## F1 domain 层
- `core/domain/report.ts`：DailyReport / ReportEntry / ProjectSummary / HealthStatus / TimeLineItem 纯类型
- `core/domain/project.ts`：项目名归一化（`-Users-qianyuchen-work-honour` → `honour`，取尾段 + 去重映射）
- 验收：typecheck 通过

## F2 application 层
- `port/driven/memory-source.ts`：MemorySource 接口（getDayObservations / getSessionSummaries / getToolUseStats / getHealth / getProjects）
- `port/driving/report-queries.ts`：ReportQueries 接口（getDay(date) / getProjects()）
- `usecase/build-daily-report.ts`：组装三层金字塔（天级头条计数 → 项目分节 → 时间线）；
  - discovery 折叠为二级事件；sensitive 折叠+标记；files_modified JSON 解析去重；
  - 会话数 + files_modified 去重数为主指标
- 验收：typecheck 通过 + usecase 能跑通假数据（仅本地手工 node -e 验证，不留测试文件）

## F3 claude-mem adapter（driven）
- `adapters/driven/claude-mem-source.ts`：
  - `node:sqlite` readonly（`new DatabaseSync(path, {readOnly: true})`）
  - 只 SELECT 明确列名，缺列 try/catch 降级（schema 容错）
  - 健康判断：最后一条 observation 时间 + `~/.claude-mem/observer-health.json` / `worker-heartbeat.json`
  - sensitive 读取但打标，由 usecase 决定折叠
- 验收：node 脚本实跑，能打印某天的 observations 计数 / summaries / 工具统计，与直接 sqlite3 查询一致

## F4 Web driving 层
- `adapters/driving/web/server.ts`：Node http，**只绑 127.0.0.1**
- `adapters/driving/web/api.ts`：`GET /api/day/:date` → JSON（date 格式 YYYY-MM-DD）
- `adapters/driving/web/page.ts`：服务端拼 HTML，三层金字塔 + 日期导航 + 空态 + 健康声明横幅 + 数字点开展开原始列表（details/summary 原生元素，无 JS 框架）
- 验收：浏览器打开能看到真实数据的日报页，验收标准见 DESIGN.md §8

## F5 CLI 入口
- `adapters/driving/cli.ts`：`serve [--port 17777]` / `build --date 2026-11-15`（build 输出单文件 HTML 到 out/）
- 验收：`npx tsx adapters/driving/cli.ts serve` 可启动

## F6 页面设计稿（frontend-designer，与 F1-F5 并行）
- `design/prototype.html`：静态设计稿（假数据），遵循 DESIGN.md §3 信息架构
- 三层金字塔 + 时间线 + 折叠交互 + 健康横幅 + 空态示意
- 视觉基调：本机工具，信息密度高、可扫读、克制的色彩（非 dashboard 风）
- 验收：浏览器打开是一版可评审的完整页面

## F7 设计集成（依赖 F6 + F4 完成）
- 把 prototype.html 的视觉/结构落到 page.ts（服务端渲染 + 真数据）
- 验收：真数据页面与设计稿视觉一致，功能全保留

## 开发约束（所有子任务）
- 不写单测、不 mock；验证 = 实际运行 + 日志
- 只绑 127.0.0.1；不写 claude-mem.db（readonly）
- TS strict；不引入新依赖（除非必须，说明理由）
