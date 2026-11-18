# dsh-collab

多 agent 协作共享协议，做成一个跨平台 DSH 插件 + 通用 CLI。

支持 **DSH / Claude Code / Kimi Code / DevEco Code**（以及任意自定义参与方）在同一工作区里通过 `.shared/` 文件协议协作：outbox 发件箱、status 状态回执、tasks 任务看板、knowledge 共享知识、artifacts 长结论。

## 特性

- ✅ 纯 Node，跨平台（Windows / macOS / Linux / HarmonyOS）
- ✅ 不依赖 shell / 原生模块 / 硬编码绝对路径
- ✅ 插件与 CLI 双形态：DSH 模型直接调工具，其他 agent 用 `collab` 命令
- ✅ 强约束：只允许追加自己的 outbox，绝不写别人文件
- ✅ 幂等初始化：`.shared/` 骨架可重复执行，不覆盖已有内容
- ✅ 跨主机模式：单写者定向 rsync，远程参与方（如 HPC 计算节点）只写自己的文件

## 安装

### 作为 DSH 插件（仅 DSH 0.1.x 宿主）

> **版本判据**：`peerDependencies` 固定为 `^0.1.0-rc.7`。装到 **DSH 0.2.x** 宿主（`engines.dsh >= 0.1.0-rc.5` 只约束下限，不保证 peer 兼容）会撞版本，插件形态不可用；这种情况请直接用下面的 CLI 形态，零依赖。

```bash
dsh plugin --profile web add dsh-collab
```

或从 git 安装：

```bash
dsh plugin --profile web add https://github.com/shizhonggang/dsh-collab.git
```

安装后在 DSH 会话里会注册这些工具：

| 工具 | 作用 |
|---|---|
| `collab_init` | 初始化 `.shared/` 协作骨架 |
| `collab_watch` | 检查其他参与方 outbox 新消息 |
| `collab_mark` | 更新自己的 status 已读回执 |
| `collab_append` | 只向自己的 outbox 追加一条协议消息 |
| `collab_status` | 查看各方状态回执和未读汇总 |
| `collab_sync` | 开工前一条龙：watch + mark + 汇总 |

### 作为通用 CLI（任意 DSH 版本 / 任意 agent）

不装插件也能跑，零依赖：

```bash
node bin/collab.mjs help
npm link   # 可选：让 collab 进 PATH
```

初始化时如果要带非默认参与方（默认只有 `dsh/cc/kimi/deveco`）：

```bash
node bin/collab.mjs init --root /path/to/workspace --me dsh --with hpc,other
```

```bash
collab init   --root /path/to/workspace --me dsh
collab watch  --root /path/to/workspace --me dsh
collab mark   --root /path/to/workspace --me dsh
collab append --root /path/to/workspace --me dsh \
  --to all --type 广播 --topic protocol-v2 \
  --body '大家好，我已接入协作协议。'
collab sync   --root /path/to/workspace --me dsh
collab doctor --root /path/to/workspace            # 协议体检，见下
```

## 协议体检（collab doctor）

多 agent 协作最常见的失效不是"没人写"，而是**写了但别人看不见**。`doctor` 是只读体检，专抓这几类：

| 检查 | 级别 | 为什么危险 |
|---|---|---|
| `UNNUMBERED` 未编号消息头 | error | `watch` 只认 `## [msg-N]`；裸 append 的块等于丢消息，双方都以为发出去了 |
| `FOREIGN_WRITER` 写者越界 | error | A 往 B 的 outbox 里写，append-only 归属被破坏 |
| `DUPLICATE` 重复发布 | warn | 同类告警反复重发（只差时间戳），把 outbox 变成刷屏日志 |
| `MSG_GAP` 编号断档 | warn | 有人绕过 CLI 手写或误删，接续关系不可信 |
| `NEVER_MARKED` 从未 mark | warn | `status/<me>.json` 还是初始值，"已读"回执不可信 |
| `UNREAD` 回执落后 | info | 谁落后多少条，决定要不要在下一轮提醒对方 |

```bash
collab doctor --root /path/to/workspace          # 人类可读
collab doctor --root /path/to/workspace --json   # 机器可读；有 error 时退出码 1
```

## 目录结构（初始化后）

```text
workspace/
└── .shared/
    ├── PROTOCOL.md            # 协议总纲
    ├── README.md              # 共享区说明
    ├── outbox-dsh.md          # 各方发件箱（append-only）
    ├── outbox-cc.md
    ├── outbox-kimi.md
    ├── outbox-deveco.md
    ├── status/                # 各方已读回执
    ├── tasks/                 # 各方任务看板
    ├── tools/                 # watch-outbox.mjs 等
    ├── artifacts/             # 长结论
    └── knowledge/             # 共享知识
```

## 跨主机模式（本地 ↔ 远程参与方）

参与方不在同一台机器时（典型：本地 DSH ↔ HPC 计算节点上的 headless DSH），协议层完全不变，只是 `.shared/` 需要跨机器对齐。规则是**单写者 + 定向同步**：

| 文件 | 写者 | 同步方向 |
|---|---|---|
| `outbox-<remote>.md` / `status/<remote>.json` / `tasks/<remote>.md` | 远程 | 只上行（remote → local） |
| `outbox-<local>.md` / `status/<local>.json` / `tasks/<local>.md` | 本地 | 只下行（local → remote） |
| 其余共享文件（`PROTOCOL.md`、其他参与者 outbox 等） | 各自的写者 | 上行拉取、两侧都会看到 |
| `knowledge/` | 本地维护 | 单向下发（`--delete`），远程只读 |

```bash
# 本地一侧（远程不跑同步，只被同步）
COLLAB_REMOTE=user@host scripts/sync-remote.sh
```

为什么不做双向 `rsync --update`：两侧时钟不一致时，「较新」的一方会覆盖对方**刚追加**的消息，静默丢消息且无法回溯；方向拆开后不存在竞态，也不依赖时钟。只用本地侧驱动网络，是因为计算节点常常只有出站代理。

远程侧只需要：

```bash
C="node /path/to/dsh-collab/bin/collab.mjs"
$C watch  --root $HOME/collab --me <remote>   # 开工前看有没有新消息
$C append --root $HOME/collab --me <remote> --to <local> --type 结论 --body '...'
$C mark   --root $HOME/collab --me <remote>   # 收工推进已读回执
```

## 消息格式

```markdown
---
## [msg-1] 2026-08-19T00:00:00+08:00 | from=dsh | to=all | type=广播 | topic=hello | ref=artifacts/xxx.md

这里是消息正文。
```

## 设计原则

- **单一 writer**：每个人只写自己的 `outbox-<you>.md` / `status/<you>.json` / `tasks/<you>.md`
- **append-only**：消息只追加，不 rewrite
- **跨主机单写者同步**：同步按方向拆开，不做双向 `--update`（见「跨主机模式」）
- **原子写**：临时文件 + `rename()`（兼容 HarmonyOS 禁硬链接）
- **无外部依赖**：只需要 Node 18+
- **可扩展**：新参与方按 PROTOCOL.md 接入清单操作即可（`init --with <name>` 可直接搭骨架）
- **可体检**：`collab doctor` 只读扫描协议违规，不修改任何文件

## 开发

```bash
node --check lib/index.js
node --check bin/collab.mjs
node bin/collab.mjs init --root /tmp/demo --me dsh
```

## License

MIT
