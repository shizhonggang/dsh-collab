#!/usr/bin/env bash
# dsh-collab 跨主机同步（单写者定向 rsync）
#
# 场景：参与方不在同一台机器上（典型是本地 DSH ↔ HPC/远程 DSH），
# 共享目录靠 SSH + rsync 对齐。协议层不变，只解决「谁写谁的文件」。
#
# 三条规则（与 .shared/PROTOCOL.md「跨主机同步」一致）：
#   1. 每个文件只有一个写者：outbox-<me>.md / status/<me>.json / tasks/<me>.md 只有本人写。
#   2. 同步按方向拆开，绝不双向 --update：远程写的只上行，本地写的只下行。
#      （双向 --update 在两侧时钟不一致时会让"较新"的一方覆盖对方刚追加的消息，静默丢消息且无法回溯。）
#   3. 只用一侧驱动网络（通常是本地/发起方）；远程侧不主动联网（计算节点常只有出站代理）。
#
# 用法：
#   COLLAB_REMOTE=user@host scripts/sync-remote.sh
#   COLLAB_REMOTE=user@host COLLAB_ME=dsh COLLAB_PEER=hpc scripts/sync-remote.sh
#
# 环境变量（都可选，除 COLLAB_REMOTE）：
#   COLLAB_REMOTE          必填，形如 user@host
#   COLLAB_ME              本地参与方名，默认 dsh
#   COLLAB_LOCAL_SHARED    本地 .shared 路径，默认 $HOME/dsh-collab/.shared
#   COLLAB_REMOTE_ROOT     远程工作区根（相对 $HOME 或绝对路径），默认 collab
#   COLLAB_SSH_ARGS        额外 ssh 参数，默认 "-o ConnectTimeout=15"
#   COLLAB_SYNC_KNOWLEDGE  1=同步 knowledge/（默认 1），0=跳过
#   COLLAB_PROJECT_KEY     可选：同步前从该路径覆盖 .shared/knowledge/project-KEY.md（只读镜像）
set -euo pipefail

: "${COLLAB_REMOTE:?needs COLLAB_REMOTE (user@host)}"

ME="${COLLAB_ME:-dsh}"
LOCAL_SHARED="${COLLAB_LOCAL_SHARED:-$HOME/dsh-collab/.shared}"
REMOTE_ROOT="${COLLAB_REMOTE_ROOT:-collab}"
REMOTE_SHARED="${REMOTE_ROOT%/}/.shared"
SSH_ARGS="${COLLAB_SSH_ARGS:--o ConnectTimeout=15}"
SYNC_KNOWLEDGE="${COLLAB_SYNC_KNOWLEDGE:-1}"

if [ ! -d "$LOCAL_SHARED" ]; then
  echo "local .shared not found: $LOCAL_SHARED（先跑 collab init）" >&2
  exit 1
fi

# 本写者拥有的文件 —— 只下行、绝不从远程覆盖
OWN_FILES=("outbox-$ME.md" "status/$ME.json" "tasks/$ME.md")

echo "== pull（远程写的 → 本地；排除本写者自己的文件与 knowledge）"
rsync -az -e "ssh $SSH_ARGS" \
  --exclude "outbox-$ME.md" \
  --exclude "status/$ME.json" \
  --exclude "tasks/$ME.md" \
  --exclude "knowledge/" \
  "$COLLAB_REMOTE:$REMOTE_SHARED/" "$LOCAL_SHARED/"

echo "== push（本地写的 → 远程；只推本写者自己的文件）"
rsync -az -e "ssh $SSH_ARGS" \
  "${OWN_FILES[@]/#/$LOCAL_SHARED/}" \
  "$COLLAB_REMOTE:$REMOTE_SHARED/"

if [ "$SYNC_KNOWLEDGE" = "1" ]; then
  if [ -n "${COLLAB_PROJECT_KEY:-}" ] && [ -f "$COLLAB_PROJECT_KEY" ]; then
    cp "$COLLAB_PROJECT_KEY" "$LOCAL_SHARED/knowledge/project-KEY.md"
  fi
  echo "== knowledge（单向下发，远程只读）"
  rsync -az --delete -e "ssh $SSH_ARGS" \
    "$LOCAL_SHARED/knowledge/" "$COLLAB_REMOTE:$REMOTE_SHARED/knowledge/"
fi

echo "== done"
