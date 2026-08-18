#!/usr/bin/env node
// watch-outbox.mjs — 检查别人 outbox 是否有新消息，并可选更新自己的 status/<name>.json
// 用法:
//   node tools/watch-outbox.mjs <participant> [--mark]
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const me = (process.argv[2] || '').toLowerCase();
const mark = process.argv.includes('--mark');

if (!/^[a-z0-9_-]{1,32}$/.test(me)) {
  console.error('usage: node tools/watch-outbox.mjs <participant> [--mark]');
  console.error('example: node tools/watch-outbox.mjs dsh --mark');
  process.exit(1);
}

const statusPath = join(root, 'status', `${me}.json`);
const status = existsSync(statusPath)
  ? JSON.parse(readFileSync(statusPath, 'utf8'))
  : { writer: me, lastSeen: {}, lastUpdated: new Date().toISOString() };

const lastSeen = status.lastSeen ?? {};
const files = readdirSync(root)
  .filter((f) => /^outbox-.*\.md$/.test(f) && f !== `outbox-${me}.md`)
  .sort();

let changed = false;
for (const f of files) {
  const content = readFileSync(join(root, f), 'utf8');
  const nums = [...content.matchAll(/^## \[msg-(\d+)\].*$/gm)].map((m) => parseInt(m[1], 10));
  const latest = nums.length ? Math.max(...nums) : 0;
  const seen = lastSeen[f] ?? 0;

  if (latest <= seen) {
    console.log(`[${f}] 无新消息（最新 ${latest}）`);
    continue;
  }

  console.log(`\n[${f}] 有新消息：${seen + 1}..${latest}（上次看到 ${seen}）`);
  for (const m of content.matchAll(/^## \[msg-(\d+)\].*$/gm)) {
    const num = parseInt(m[1], 10);
    if (num > seen) console.log('  ' + m[0]);
  }

  if (mark) {
    lastSeen[f] = latest;
    changed = true;
  }
}

if (mark && changed) {
  status.lastSeen = lastSeen;
  status.lastUpdated = new Date().toISOString();
  writeFileSync(statusPath, JSON.stringify(status, null, 2) + '\n');
  console.log(`\n已更新 ${statusPath}`);
}
