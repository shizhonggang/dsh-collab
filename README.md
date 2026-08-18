# dsh-collab

多 agent 协作共享协议，做成一个跨平台 DSH 插件 + 通用 CLI。

支持 **DSH / Claude Code / Kimi Code / DevEco Code**（以及任意自定义参与方）在同一工作区里通过 `.shared/` 文件协议协作：outbox 发件箱、status 状态回执、tasks 任务看板、knowledge 共享知识、artifacts 长结论。

## 特性

- ✅ 纯 Node，跨平台（Windows / macOS / Linux / HarmonyOS）
- ✅ 不依赖 shell / 原生模块 / 硬编码绝对路径
- ✅ 插件与 CLI 双形态：DSH 模型直接调工具，其他 agent 用 `collab` 命令
- ✅ 强约束：只允许追加自己的 outbox，绝不写别人文件
- ✅ 幂等初始化：`.shared/` 骨架可重复执行，不覆盖已有内容

## 安装

### 作为 DSH 插件

```bash
dsh plugin --profile web add @dsh-external/dsh-collab
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

### 作为通用 CLI

```bash
npm link   # 或 pnpm link --global
collab help
```

```bash
collab init   --root /path/to/workspace --me dsh
collab watch  --root /path/to/workspace --me dsh
collab mark   --root /path/to/workspace --me dsh
collab append --root /path/to/workspace --me dsh \
  --to all --type 广播 --topic protocol-v2 \
  --body '大家好，我已接入协作协议。'
collab sync   --root /path/to/workspace --me dsh
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

## 消息格式

```markdown
---
## [msg-1] 2026-08-19T00:00:00+08:00 | from=dsh | to=all | type=广播 | topic=hello | ref=artifacts/xxx.md

这里是消息正文。
```

## 设计原则

- **单一 writer**：每个人只写自己的 `outbox-<you>.md` / `status/<you>.json` / `tasks/<you>.md`
- **append-only**：消息只追加，不 rewrite
- **原子写**：临时文件 + `rename()`（兼容 HarmonyOS 禁硬链接）
- **无外部依赖**：只需要 Node 18+
- **可扩展**：新参与方按 PROTOCOL.md 接入清单操作即可

## 开发

```bash
node --check lib/index.js
node --check bin/collab.mjs
node bin/collab.mjs init --root /tmp/demo --me dsh
```

## License

MIT
