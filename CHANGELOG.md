# Changelog

## 0.2.0 — 2026-11-18

跨主机协作模式（代码层 `lib/`、`bin/` 无变化，均为文档与脚本新增）。

- 新增 `scripts/sync-remote.sh`：本地 ↔ 远程参与方（如 HPC 计算节点）的**单写者定向 rsync** 同步模板。远程写的文件只上行、本地写的文件只下行、`knowledge/` 单向下发，并用一侧驱动网络。
- README 新增「部署形态：插件 vs CLI」判据：`peerDependencies` 固定 `^0.1.0-rc.7`，装到 DSH 0.2.x 宿主会撞版本；0.2.x 请直接用 CLI（`node bin/collab.mjs`），零依赖可用。
- README 新增「跨主机模式」一节：目录映射、方向规则、远程侧命令。
- `templates/PROTOCOL.md` 增加「跨主机同步」一节，把单写者定向同步写进随工作区分发的协议本身。

## 0.1.0 — 2026-08-19

- 首个版本：插件 + CLI 双形态，`outbox / status / tasks / knowledge / artifacts` 协议，幂等初始化。
