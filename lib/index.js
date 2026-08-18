/**
 * dsh-collab: multi-agent collaboration shared workspace for DSH.
 * Registers collab_init / collab_watch / collab_mark / collab_append / collab_status / collab_sync.
 * Pure Node, cross-platform, no native deps, no shell.
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import z from 'schemastery';
import {
  appendMessage, getStatus, initWorkspace, isValidParticipant, mark,
  rootDir, summarize, watch,
} from './collab-core.js';

export const name = 'dsh-collab';
export const inject = ['tools', 'systemPrompt'];

export const Config = z.object({
  participant: z.string().default('dsh')
    .description('This agent’s participant name (dsh/cc/kimi/deveco or custom). Used as the only writable outbox owner.'),
  root: z.string().default('')
    .description('Workspace root containing `.shared/`. Defaults to the current session workspace.'),
});

const PROMPT_TEXT = `## Multi-agent collaboration (dsh-collab)
This workspace may participate in a shared multi-agent protocol under \`.shared/\`.
Before starting any work, run \`collab_watch\` to check new outbox messages from other agents.
When contributing: only ever append to your own \`outbox-<you>.md\`; never rewrite/delete other agents' files.
Put long reports in \`.shared/artifacts/\` and reference them from messages via \`ref=\`.
Use \`collab_append\` for a new message and \`collab_mark\` after reading others' messages.`;

const textOutput = {
  schema: { type: 'object', additionalProperties: true },
  render(_args, value) {
    const text = typeof value === 'string' ? value : value?.summary || JSON.stringify(value, null, 2);
    return [{ type: 'text', text }];
  },
};

function describe(result) {
  if (typeof result === 'string') return { summary: result };
  const parts = [];
  for (const [k, v] of Object.entries(result || {})) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') parts.push(`${k}=${v}`);
  }
  return { summary: parts.join(' · '), ...result };
}

export function apply(ctx, config = {}) {
  const me = String(config.participant || process.env.COLLAB_PARTICIPANT || 'dsh').toLowerCase();

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'collab_init',
    description: 'Initialize a `.shared/` multi-agent collaboration workspace: creates PROTOCOL, outboxes, status, tasks, tools, knowledge, artifacts. Idempotent; never overwrites existing files.',
    parameters: {
      root: { type: 'string', description: 'Workspace root. Defaults to current workspace.' },
      participant: { type: 'string', description: 'Your participant name. Defaults to collab.participant config.' },
    },
    output: textOutput,
    async execute(args) {
      const root = String(args.root || config.root || '').trim() || rootDir();
      const who = String(args.participant || me).toLowerCase();
      if (!isValidParticipant(who)) throw new Error(`invalid participant: ${who}`);
      const result = await initWorkspace(root, who);
      const created = result.created.map((p) => p).join('\n') || '(nothing to create)';
      return describe({ summary: `collab workspace ready at ${result.root}\ncreated:\n${created}`, root: result.root, created: result.created.length });
    },
  }), 'dsh-collab.init'));

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'collab_watch',
    description: 'Check all other participants’ outboxes for new messages, compared with your status file. Returns new message headers and counts. Does not mark anything read.',
    parameters: {
      root: { type: 'string', description: 'Workspace root. Defaults to current workspace.' },
      participant: { type: 'string', description: 'Your participant name. Defaults to collab.participant config.' },
    },
    output: textOutput,
    execute(args) {
      const root = String(args.root || config.root || '').trim() || rootDir();
      const who = String(args.participant || me).toLowerCase();
      const result = watch(root, who);
      return describe({ summary: summarize(result), ...result });
    },
  }), 'dsh-collab.watch'));

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'collab_mark',
    description: 'Update your own status/<you>.json to mark all currently-known outbox messages as read. Only writes your own status file.',
    parameters: {
      root: { type: 'string', description: 'Workspace root. Defaults to current workspace.' },
      participant: { type: 'string', description: 'Your participant name. Defaults to collab.participant config.' },
    },
    output: textOutput,
    execute(args) {
      const root = String(args.root || config.root || '').trim() || rootDir();
      const who = String(args.participant || me).toLowerCase();
      const result = mark(root, who);
      return describe({ summary: `marked ${result.changed ? 'changes' : 'no changes'} for ${who}`, ...result });
    },
  }), 'dsh-collab.mark'));

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'collab_append',
    description: 'Append a new protocol message to YOUR OWN outbox only. Validates type/to. Never writes another participant’s outbox. Use ref= for long artifacts.',
    parameters: {
      root: { type: 'string', description: 'Workspace root. Defaults to current workspace.' },
      participant: { type: 'string', description: 'Your participant name. Defaults to collab.participant config.' },
      to: { type: 'string', description: 'Target: all or a participant name (dsh/cc/kimi/deveco).' },
      type: { type: 'string', enum: ['提问', '答复', '结论', '确认', '实验', '广播', '修正'], description: 'Message type.' },
      topic: { type: 'string', description: 'Optional topic tag.' },
      ref: { type: 'string', description: 'Optional artifact/file reference.' },
      body: { type: 'string', description: 'Message body (required).' },
    },
    output: textOutput,
    execute(args) {
      const root = String(args.root || config.root || '').trim() || rootDir();
      const who = String(args.participant || me).toLowerCase();
      const result = appendMessage(root, who, {
        to: args.to || 'all',
        type: args.type || '广播',
        topic: args.topic || '',
        ref: args.ref || '',
        body: args.body || '',
      });
      return describe({ summary: `appended msg-${result.next} to ${result.file}`, ...result });
    },
  }), 'dsh-collab.append'));

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'collab_status',
    description: 'Show all participants’ status files and task board headers, plus unread summary for your participant.',
    parameters: {
      root: { type: 'string', description: 'Workspace root. Defaults to current workspace.' },
      participant: { type: 'string', description: 'Your participant name. Defaults to collab.participant config.' },
    },
    output: textOutput,
    execute(args) {
      const root = String(args.root || config.root || '').trim() || rootDir();
      const who = String(args.participant || me).toLowerCase();
      const w = watch(root, who);
      const lines = [summarize(w)];
      const statuses = w.files.map((f) => f.file).map((f) => {
        const p = f.replace(/^outbox-/, '').replace(/\.md$/, '');
        const st = getStatus(root, p).status;
        return `${p}: lastSeen=${JSON.stringify(st.lastSeen)}`;
      });
      lines.push('\nstatus files:', ...statuses);
      return describe({ summary: lines.join('\n'), statuses });
    },
  }), 'dsh-collab.status'));

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'collab_sync',
    description: 'One-shot sync: watch all outboxes for new messages, mark them as read in your own status file, and summarize what changed. Call this before starting work.',
    parameters: {
      root: { type: 'string', description: 'Workspace root. Defaults to current workspace.' },
      participant: { type: 'string', description: 'Your participant name. Defaults to collab.participant config.' },
    },
    output: textOutput,
    execute(args) {
      const root = String(args.root || config.root || '').trim() || rootDir();
      const who = String(args.participant || me).toLowerCase();
      const before = watch(root, who);
      const summary = summarize(before);
      const result = mark(root, who);
      const changed = result.changed ? 'marked as read' : 'nothing to mark';
      return describe({ summary: `${summary}\n\n${changed}`, ...result });
    },
  }), 'dsh-collab.sync'));

  ctx.effect(() => ctx.systemPrompt.section({
    name: 'tool:dsh-collab',
    order: 110,
    text: PROMPT_TEXT,
  }), 'dsh-collab.prompt');
}
