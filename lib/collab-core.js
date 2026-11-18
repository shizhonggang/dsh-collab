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

export async function initWorkspace(root, me, { force = false, participants = [] } = {}) {
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
  const extras = (Array.isArray(participants) ? participants : [])
    .map((n) => String(n || '').toLowerCase())
    .filter((n) => n && n !== me);
  for (const extra of extras) {
    if (!isValidParticipant(extra)) throw new Error(`invalid participant: ${extra}`);
  }
  const roster = [...new Set([...DEFAULT_PARTICIPANTS, ...extras])].filter((n) => n !== me);
  for (const other of roster) {
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

// ---------- 协议体检（doctor） ----------

// 解析 outbox：只把「--- 分隔线之后的 ## 标题」当作消息头。
// 协议要求消息头形如 `## [msg-N] ...`；不编号的块 watch 看不见（等于静默丢弃）。
export function parseOutbox(content, file = '') {
  const lines = String(content || '').split('\n');
  const blocks = [];
  let cur = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const m = /^## \[msg-(\d+)\]\s*(.*)$/.exec(line);
    if (m) {
      cur = { file, num: parseInt(m[1], 10), header: line.trim(), line: i + 1, bodyLines: [] };
      blocks.push(cur);
      continue;
    }
    if (line.startsWith('## ') && i > 0 && lines[i - 1].trim() === '---') {
      cur = { file, num: null, header: line.trim(), line: i + 1, bodyLines: [] };
      blocks.push(cur);
      continue;
    }
    if (cur) cur.bodyLines.push(line);
  }
  for (const b of blocks) {
    const rest = b.header.replace(/^## \[[^\]]*\]\s*/, '');
    b.from = (/(?:^|\|)\s*from=([a-z0-9_-]+)/i.exec(rest) || [])[1]?.toLowerCase() || '';
    b.to = (/(?:^|\|)\s*to=([a-z0-9_-]+|all)/i.exec(rest) || [])[1]?.toLowerCase() || '';
    b.type = (/(?:^|\|)\s*type=([^\s|]+)/.exec(rest) || [])[1] || '';
    b.topic = (/(?:^|\|)\s*topic=([^\s|]+)/.exec(rest) || [])[1] || '';
    b.body = b.bodyLines.join('\n').trim();
    // 去重键：抹掉正文里的时间戳再比较（告警重发通常只差时间）
    b.bodyKey = b.body
      .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:[+-]\d{2}:\d{2}|Z)?/g, '<ts>')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return blocks;
}

export function writerOf(file) {
  const m = /^outbox-([a-z0-9_-]+)\.md$/.exec(file);
  return m ? m[1] : '';
}

export function doctor(root) {
  const ws = rootDir(root);
  const base = sharedDir(ws);
  const findings = [];
  const add = (level, code, file, line, message) => findings.push({ level, code, file, line: line || null, message });

  const mustHave = ['PROTOCOL.md', 'README.md', 'knowledge/README.md', 'tools/watch-outbox.mjs'];
  for (const rel of mustHave) {
    if (!existsSync(join(base, rel))) add('error', 'MISSING_FILE', rel, null, `协议骨架缺文件：${rel}（跑 collab init）`);
  }

  // 1) outbox 结构：编号、写者越界、重复、编号断档
  for (const file of listOutboxes(ws)) {
    const writer = writerOf(file);
    const blocks = parseOutbox(readTextSafe(join(base, file)), file);
    const last = new Map();
    for (const b of blocks) {
      if (b.num === null) {
        add('error', 'UNNUMBERED', file, b.line,
          `未编号消息头「${b.header}」——watch 只认 ## [msg-N]，这条对所有人不可见（等于丢消息）`);
        continue;
      }
      if (b.from && b.from !== writer) {
        add('error', 'FOREIGN_WRITER', file, b.line, `msg-${b.num} from=${b.from}，但文件属主是 ${writer}（写者越界）`);
      }
      const prevNum = last.get('num');
      if (prevNum !== undefined && b.num !== prevNum + 1) {
        add('warn', 'MSG_GAP', file, b.line, `编号不连续：msg-${prevNum} → msg-${b.num}`);
      }
      last.set('num', b.num);
      const recent = last.get('recent') || [];
      const twin = b.bodyKey ? recent.find((r) => r.bodyKey === b.bodyKey && r.topic === b.topic) : null;
      if (twin) {
        add('warn', 'DUPLICATE', file, b.line,
          `msg-${b.num} 与 msg-${twin.num} 正文相同（仅时间戳不同）——重复发布，告警应先去重再 append`);
      }
      recent.push({ num: b.num, bodyKey: b.bodyKey, topic: b.topic });
      last.set('recent', recent.slice(-5));
    }
  }

  // 2) status 回执：是否 mark 过、是否落后
  const statusDir = join(base, 'status');
  let statusFiles = [];
  try { statusFiles = readdirSync(statusDir).filter((f) => f.endsWith('.json')).sort(); } catch { statusFiles = []; }
  const latestByOutbox = new Map();
  for (const file of listOutboxes(ws)) {
    latestByOutbox.set(file, latestMsg(readTextSafe(join(base, file))));
  }
  for (const sf of statusFiles) {
    const writer = sf.replace(/\.json$/, '');
    const rel = `status/${sf}`;
    const st = readJsonSafe(join(statusDir, sf));
    if (!st) { add('error', 'STATUS_INVALID', rel, null, 'JSON 解析失败'); continue; }
    if (st.writer && st.writer !== writer) add('warn', 'STATUS_MISMATCH', rel, null, `writer=${st.writer} 与文件名 ${writer} 不符`);
    const epoch = '1970-01-01T00:00:00.000Z';
    const othersHaveMsgs = [...latestByOutbox].some(([file, latest]) => file !== `outbox-${writer}.md` && latest > 0);
    if (othersHaveMsgs && (!st.lastUpdated || st.lastUpdated === epoch)) {
      add('warn', 'NEVER_MARKED', rel, null, 'lastUpdated 是初始值：该参与方从未 mark，回执不可信');
    }
    const lastSeen = st.lastSeen && typeof st.lastSeen === 'object' ? st.lastSeen : {};
    for (const [file, latest] of latestByOutbox) {
      if (file === `outbox-${writer}.md`) {
        if ((lastSeen[file] ?? 0) > 0) add('warn', 'SELF_READ', rel, null, `lastSeen 含自己的 ${file}（不该把自己当别人读）`);
        continue;
      }
      const seen = lastSeen[file] ?? 0;
      if (latest > seen) {
        add('info', 'UNREAD', rel, null, `${writer} 落后 ${file}：已读 ${seen}，最新 ${latest}（差 ${latest - seen} 条）`);
      }
    }
  }

  const errors = findings.filter((f) => f.level === 'error').length;
  const warnings = findings.filter((f) => f.level === 'warn').length;
  const infos = findings.filter((f) => f.level === 'info').length;
  return { root: base, ok: errors === 0, findings, errors, warnings, infos };
}

export function formatDoctor(result) {
  const lines = [`collab doctor @ ${result.root}`];
  const badge = { error: '✗', warn: '!', info: '·' };
  for (const f of result.findings) {
    const loc = f.line ? `${f.file}:${f.line}` : f.file;
    lines.push(`${badge[f.level] || '·'} [${f.code}] ${loc} — ${f.message}`);
  }
  if (!result.findings.length) lines.push('干净：未发现协议违规。');
  lines.push(`合计 error=${result.errors} warn=${result.warnings} info=${result.infos}`);
  return lines.join('\n');
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
