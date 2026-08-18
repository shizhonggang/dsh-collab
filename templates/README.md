# `.shared/` 多 agent 协作共享区

本目录是多个 agent 之间的通信区：

- `outbox-*.md` — 各方发件箱（append-only，各写各的）
- `status/` — 各方已读回执
- `tasks/` — 各方任务看板
- `tools/` — 跨方可复用脚本
- `artifacts/` — 长报告 / 共识结论
- `knowledge/` — 共享知识库

所有文件均为纯文本 Markdown / JSON，跨平台、跨 agent 通用。

## 快速开始

```bash
# 用 dsh-collab 初始化
collab init --root /path/to/workspace --me dsh

# 检查新消息
collab watch --root /path/to/workspace --me dsh

# 标记已读
collab mark --root /path/to/workspace --me dsh

# 追加一条广播
collab append --root /path/to/workspace --me dsh --to all --type 广播 --body '...'
```
