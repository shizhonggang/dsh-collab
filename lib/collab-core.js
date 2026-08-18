// dsh-collab core: pure Node, cross-platform multi-agent collaboration file protocol.
// No shell, no native deps, no hard-coded absolute paths.
import { promises as fs } from 'node:fs';
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROTOCOL_TYPES = ['提问', '答复', '结论', '确认', '实验', '广播', '修正'];
export const DEFAULT_PARTICIPANTS = ['dsh', 'cc', 'kimi', 'deveco'];

export function isValidParticipant(name) {
  return /^[a-z0-9_-]{1,32}$/.test(name || '');
}

export function rootDir(root) {
  return root || process.cwd();
}

export function sharedDir(root) {
  return join(rootDir(root), '.shared');
}

export function ownOutboxPath(root, me) {
  return join(sharedDir(root), `outbox-${me}.md`);
}

export function statusPath(root, me) {
  return join(sharedDir(root), 'status', `${me}.json`);
}

export function tasksPath(root, me) {
  return join(sharedDir(root), 'tasks', `${me}.md`);
}

export function readJsonSafe(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function readTextSafe(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

export function msgNumbers(content) {
  const nums = [];
  const re = /^## \[msg-(\d+)\].*$/gm;
  let m;
  while ((m = re.exec(content)) !== null) nums.push(parseInt(m[1], 10));
  return nums;
}

export function latestMsg(content) {
  const nums = msgNumbers(content);
  return nums.length ? Math.max(...nums) : 0;
}

export function listOutboxes(root) {
  const dir = sharedDir(root);
  try {
    return readdirSync(dir)
      .filter((f) => /^outbox-.*\.md$/.test(f))
      .sort();
  } catch {
    return [];
  }
}

export function getStatus(root, me) {
  if (!isValidParticipant(me)) throw new Error(`invalid participant name: ${me}`);
  const file = statusPath(root, me);
  const existing = readJsonSafe(file);
  const status = existing && typeof existing === 'object' ? existing : { writer: me, lastSeen: {}, lastUpdated: new Date().toISOString() };
  status.writer = me;
  status.lastSeen = status.lastSeen && typeof status.lastSeen === 'object' ? status.lastSeen : {};
  return { status, file };
}

export function watch(root, me) {
  if (!isValidParticipant(me)) throw new Error(`invalid participant name: ${me}`);
  const { status } = getStatus(root, me);
  const lastSeen = status.lastSeen;
  const files = listOutboxes(root).filter((f) => f !== `outbox-${me}.md`);
  const results = [];
  for (const f of files) {
    const content = readTextSafe(join(sharedDir(root), f));
    const latest = latestMsg(content);
    const seen = lastSeen[f] ?? 0;
    const headers = [];
    if (latest > seen) {
      const re = /^## \[msg-(\d+)\].*$/gm;
      let m;
      while ((m = re.exec(content)) !== null) {
        const num = parseInt(m[1], 10);
        if (num > seen) headers.push(m[0].trim());
      }
    }
    results.push({ file: f, latest, seen, newCount: Math.max(0, latest - seen), newHeaders: headers });
  }
  return { me, statusPath: statusPath(root, me), files: results };
}

export function mark(root, me) {
  const { status, file } = getStatus(root, me);
  const files = listOutboxes(root).filter((f) => f !== `outbox-${me}.md`);
  let changed = false;
  for (const f of files) {
    const content = readTextSafe(join(sharedDir(root), f));
    const latest = latestMsg(content);
    if ((status.lastSeen[f] ?? 0) !== latest) {
      status.lastSeen[f] = latest;
      changed = true;
    }
  }
  const tmp = `${file}.tmp-${Date.now()}`;
  if (changed) status.lastUpdated = new Date().toISOString();
  writeFileSync(tmp, JSON.stringify(status, null, 2) + '\n', 'utf8');
  renameSync(tmp, file);
  return { me, status, changed, file };
}

// Append to *your own* outbox only. Never writes other participants' files.
export function appendMessage(root, me, opts) {
  if (!isValidParticipant(me)) throw new Error(`invalid participant name: ${me}`);
  const { to = 'all', type = '广播', topic = '', ref = '', body = '' } = opts || {};
  if (!PROTOCOL_TYPES.includes(type)) throw new Error(`invalid type: ${type}; expected one of ${PROTOCOL_TYPES.join('/')}`);
  if (to !== 'all' && !isValidParticipant(to)) throw new Error(`invalid to: ${to}`);
  if (!body || !String(body).trim()) throw new Error('body is required');
  const file = ownOutboxPath(root, me);
  const existing = readTextSafe(file);
  const next = latestMsg(existing) + 1;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const offsetMin = -now.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const absOffset = Math.abs(offsetMin);
  const offset = `${sign}${pad(Math.floor(absOffset / 60))}:${pad(absOffset % 60)}`;
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${offset}`;
  const parts = [`## [msg-${next}] ${ts} | from=${me} | to=${to} | type=${type}`];
  if (topic) parts.push(`topic=${topic}`);
  if (ref) parts.push(`ref=${ref}`);
  const header = parts.join(' | ');
  const sep = existing && !existing.endsWith('\n') ? '\n' : '';
  const block = `${sep}\n---\n${header}\n\n${String(body).trim()}\n`;
  const tmp = `${file}.append-${Date.now()}`;
  writeFileSync(tmp, existing + block, 'utf8');
  renameSync(tmp, file);
  return { file, next, header, block };
}

async function copyTemplateIfMissing(srcDir, destDir, rel, replacements = {}, sourceRel = rel) {
  const src = join(srcDir, sourceRel);
  const dest = join(destDir, rel);
  if (!existsSync(dest) && existsSync(src)) {
    let text = readFileSync(src, 'utf8');
    for (const [k, v] of Object.entries(replacements)) {
      text = text.split(`{{${k}}}`).join(v);
    }
    await fs.mkdir(dirname(dest), { recursive: true });
    await fs.writeFile(dest, text, 'utf8');
    return dest;
  }
  return null;
}

export async function initWorkspace(root, me, { force = false } = {}) {
  if (!isValidParticipant(me)) throw new Error(`invalid participant name: ${me}`);
  const here = dirname(fileURLToPath(import.meta.url));
  const templatesDir = join(here, '..', 'templates');
  const base = sharedDir(root);
  await fs.mkdir(join(base, 'status'), { recursive: true });
  await fs.mkdir(join(base, 'tasks'), { recursive: true });
  await fs.mkdir(join(base, 'tools'), { recursive: true });
  await fs.mkdir(join(base, 'artifacts'), { recursive: true });
  await fs.mkdir(join(base, 'knowledge'), { recursive: true });
  const created = [];
  const tmpls = [
    ['PROTOCOL.md', {}],
    ['README.md', {}],
    [`outbox-${me}.md`, { NAME: me, YOU: me }, 'outbox-{{NAME}}.md'],
    [`status/${me}.json`, { NAME: me, YOU: me }, 'status/{{NAME}}.json'],
    [`tasks/${me}.md`, { NAME: me, YOU: me }, 'tasks/{{NAME}}.md'],
    ['tools/watch-outbox.mjs', {}, 'tools/watch-outbox.mjs'],
    ['knowledge/README.md', {}, 'knowledge/README.md'],
  ];
  for (const [rel, reps, sourceRel] of tmpls) {
    const dest = await copyTemplateIfMissing(templatesDir, base, rel, reps, sourceRel);
    if (dest) created.push(dest);
  }
  for (const other of DEFAULT_PARTICIPANTS) {
    if (other === me) continue;
    const rel = `outbox-${other}.md`;
    const dest = await copyTemplateIfMissing(templatesDir, base, rel, { NAME: other, YOU: other }, 'outbox-{{NAME}}.md');
    if (dest) created.push(dest);
    const statusRel = `status/${other}.json`;
    const destStatus = await copyTemplateIfMissing(templatesDir, base, statusRel, { NAME: other, YOU: other }, 'status/{{NAME}}.json');
    if (destStatus) created.push(destStatus);
    const taskRel = `tasks/${other}.md`;
    const destTask = await copyTemplateIfMissing(templatesDir, base, taskRel, { NAME: other, YOU: other }, 'tasks/{{NAME}}.md');
    if (destTask) created.push(destTask);
  }
  return { root: base, created };
}

export function summarize(watchResult) {
  const lines = [];
  for (const f of watchResult.files) {
    if (f.newCount > 0) {
      lines.push(`[${f.file}] 有新消息：${f.seen + 1}..${f.latest}（上次看到 ${f.seen}）`);
      for (const h of f.newHeaders) lines.push(`  ${h}`);
    } else {
      lines.push(`[${f.file}] 无新消息（最新 ${f.latest}）`);
    }
  }
  return lines.join('\n');
}
