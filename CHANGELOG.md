# Changelog

## 0.2.1 — 2026-11-18

发件箱模式的可验证性（对应实盘发现的失效：写了但别人看不见、告警重复刷屏、回执从不推进）。

- 新增 `collab doctor`（CLI `doctor [--json]`、插件工具 `collab_doctor`、`doctor()`/`formatDoctor()`）：只读体检 `UNNUMBERED` 未编号消息 / `FOREIGN_WRITER` 写者越界 / `DUPLICATE` 重复发布（时间戳归一）/ `MSG_GAP` 编号断档 / `NEVER_MARKED` 从未 mark / `UNREAD` 回执落后。有 error 时 CLI 退出码 1。
- `init` 新增 `--with a,b`：给非默认参与方（如 `hpc`）一次搭好 outbox/status/tasks 骨架，不再手工复制。
- `templates/PROTOCOL.md` → v2.2：消息编号约束写成硬规则（裸追加 = 不可见）、同类事件去重、定期 doctor。
- README 增加「协议体检」一节。

## 0.2.0 — 2026-11-18

跨主机协作模式（代码层 `lib/`、`bin/` 无变化，均为文档与脚本新增）。

- 新增 `scripts/sync-remote.sh`：本地 ↔ 远程参与方（如 HPC 计算节点）的**单写者定向 rsync** 同步模板。远程写的文件只上行、本地写的文件只下行、`knowledge/` 单向下发，并用一侧驱动网络。
- README 新增「部署形态：插件 vs CLI」判据：`peerDependencies` 固定 `^0.1.0-rc.7`，装到 DSH 0.2.x 宿主会撞版本；0.2.x 请直接用 CLI（`node bin/collab.mjs`），零依赖可用。
- README 新增「跨主机模式」一节：目录映射、方向规则、远程侧命令。
- `templates/PROTOCOL.md` 增加「跨主机同步」一节，把单写者定向同步写进随工作区分发的协议本身。

## 0.1.0 — 2026-08-19

- 首个版本：插件 + CLI 双形态，`outbox / status / tasks / knowledge / artifacts` 协议，幂等初始化。
