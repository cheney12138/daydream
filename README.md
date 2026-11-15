# daily-report-helper

**把散落在 agent 记忆里的一天，还原成一条可扫读的时间线。**

只读聚合器：消费本地 claude-mem 的记忆数据（`~/.claude-mem/claude-mem.db`，mode=ro），零 LLM 加工——页面上的每句话都能在 SQLite 里找到原文。

## 快速启动

依赖：Node ≥ 22（内置 `node:sqlite`），无其他运行时依赖。

```bash
npm install            # 仅 devDeps（tsx / typescript）

npx tsx adapters/driving/cli.ts serve            # 默认 127.0.0.1:17777
npx tsx adapters/driving/cli.ts serve --port 8080

# 浏览器/curl 打开
#   日报页  http://127.0.0.1:17777/
#   指定日期 http://127.0.0.1:17777/day/2026-11-13
#   JSON    http://127.0.0.1:17777/api/day/2026-11-13
```

导出单文件 HTML：

```bash
npx tsx adapters/driving/cli.ts build --date 2026-11-13   # 输出 out/report-2026-11-13.html
```

其他：`npm run typecheck`（tsc --noEmit）、`npx tsx adapters/driving/cli.ts projects`（列项目）。

## 说明

- Web 只绑 **127.0.0.1**：本机回顾工具，页面原样展示记忆原文（可能含内网 URL/密钥名），不作分发
- 空日期渲染明确空态 + 采集健康声明，绝不显示无解释的空白页
- 会话数口径 = 当天有 observation 的去重会话数（session_summaries 独有会话不计）
- 环境变量：`CLAUDE_MEM_DB` 可覆盖 db 路径

详见 [DESIGN.md](./DESIGN.md)（产品设计与架构）与 [TASKS.md](./TASKS.md)（feature 拆分）。
