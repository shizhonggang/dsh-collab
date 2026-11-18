# `.shared/` 多方协作通信协议（DSH ↔ Claude Code ↔ Kimi Code ↔ DevEco Code）

> 版本：v2.1（2026-08-17 优化，2026-08-19 插件化通用版，2026-11-18 增加跨主机同步规则）
> 核心三条铁律：append-only / 引用而非复制 / 一回合一条消息。

本目录是多个 agent 之间唯一的通信区。参与方都是「受触发才行动」的 agent，协议保证：内容零搬运、冲突零发生、回合可追溯、可扩展到任意方。

## 参与方与发件箱

| 参与方 | 发件箱文件 | 谁写入 | 谁读取 |
|---|---|---|---|
| DSH agent | `outbox-dsh.md` | DSH | CC、Kimi、DevEco |
| Claude Code | `outbox-cc.md` | CC | DSH、Kimi、DevEco |
| Kimi Code | `outbox-kimi.md` | Kimi | DSH、CC、DevEco |
| DevEco Code | `outbox-deveco.md` | DevEco | DSH、CC、Kimi |
| 新参与方 | `outbox-<你>.md` | 自己 | 其他各方 |

每个参与方还维护：

- `status/<你>.json`：已读回执
- `tasks/<你>.md`：任务看板
- 长篇结论 → `artifacts/`，消息里 `ref=artifacts/xxx.md` 引用
- 共享知识 → `knowledge/`

## 三条铁律（不可破坏）

1. **append-only + 各写各的文件**：只在自己的 outbox 末尾追加；永不 rewrite、删除、插队任何已写的行，也绝不写别人的 outbox。
2. **引用而非复制**：长内容写进 `artifacts/`，消息里用 `ref=` 引用。
3. **一回合一条消息**：问答各占一条，带明确 type，不混杂。

## 消息格式

```
---
## [编号] 时间 | from=<writer> | to=<单个写者|all> | type=<提问|答复|结论|确认|实验|广播|修正> | topic=<可选主题> | ref=<artifacts/...，可选>
```

- `to=all` 表示广播全体；`to=CC` / `to=DSH` / `to=Kimi` / `to=DevEco` 表示点对点。
- `topic` 可选，用于检索/过滤。
- 正文可含全文，也可只写摘要 + ref 指向 artifacts。

## 状态推进

- 无“已读/未读”字段，推进靠下一条消息；A 答复 B 时在新消息里引用 B 的那条即视为已回应。
- 每条消息 append 后即历史化，不回头改；要修正就发一条 `type=修正` 的新消息。
- 每个参与方维护 `status/<你>.json`，记录已读到各 outbox 的最大 `msg-编号`。

## 跨主机同步（参与方不在同一台机器时）

远程参与方（如 HPC 计算节点上的 headless DSH）通过 rsync/网盘/git 同步 `.shared/`，必须遵守**单写者定向同步**：

- 每个文件只有一个写者：`outbox-<你>.md`、`status/<你>.json`、`tasks/<你>.md` 只有本人写，别人只能读。
- 同步按方向拆开，**不要双向 `--update`**：远程写的只上行，本地写的只下行。
  - 失败模式：两侧时钟不一致时，「较新」的一方会覆盖对方刚追加的消息——静默丢消息，且 append-only 的前提被破坏、无法回溯。
- 只用一侧驱动网络（通常是本地/发起方）；远程侧不主动联网（计算节点常只有出站代理）。
- `knowledge/` 由本地单向下发（`--delete`），远程侧只读；需要回传的知识写进自己的 `outbox-<你>.md` 或 `artifacts/`。
- 实现参考：仓库 `scripts/sync-remote.sh`，用法 `COLLAB_REMOTE=user@host scripts/sync-remote.sh`。

## 工作前检查（参与方必须遵守）

1. 读 `knowledge/README.md` 索引，检查知识库是否更新。
2. 跑 `tools/watch-outbox.mjs <你>`（或 `collab watch --me <你>`）确认有没有漏读的 outbox 消息。
3. 有更新或不确定时，按需读对应文档。
4. 发现知识库缺内容 → 补进 `knowledge/` 并在自己的 outbox 发广播。

## 记忆固化

- DSH → 工作区 `AGENTS.md`
- CC → `~/.claude/CLAUDE.md`
- Kimi → 自身 memory/会话机制
- DevEco Code → 可复用 `~/.claude/CLAUDE.md`，待自行固化确认
- 规则以本 PROTOCOL 为准。

## 新参与方接入清单

1. 新建 `outbox-<你>.md`（头部照抄现有 outbox 的说明，改署名）。
2. 新建 `status/<你>.json`，`lastSeen` 先记录各 outbox 当前最新 msg 编号。
3. 新建 `tasks/<你>.md`，写一个简单的任务看板头部。
4. 在自己的 outbox 发一条 `type=广播`，自我介绍 + 你已读的进度。
5. 欢迎与同步由 DSH 发广播。
