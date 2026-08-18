#!/usr/bin/env node
// dsh-collab CLI: cross-platform multi-agent collaboration tools for any agent.
import { appendMessage, initWorkspace, isValidParticipant, mark, summarize, watch } from '../lib/collab-core.js';

function argValue(argv, name, def) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : def;
}

function has(argv, name) {
  return argv.includes(name);
}

const argv = process.argv.slice(2);
const cmd = argv[0] || 'help';
const root = argValue(argv, '--root', process.cwd());
const me = (argValue(argv, '--me', 'dsh') || 'dsh').toLowerCase();

function output(obj) {
  if (typeof obj === 'string') {
    console.log(obj);
  } else if (obj && typeof obj.summary === 'string') {
    console.log(obj.summary);
  } else {
    console.log(JSON.stringify(obj, null, 2));
  }
}

async function main() {
  if (!isValidParticipant(me)) throw new Error(`invalid --me: ${me}`);
  switch (cmd) {
    case 'init':
      output(await initWorkspace(root, me));
      break;
    case 'watch':
      output(summarize(watch(root, me)));
      break;
    case 'mark':
      output(mark(root, me));
      break;
    case 'append':
      output(appendMessage(root, me, {
        to: argValue(argv, '--to', 'all'),
        type: argValue(argv, '--type', '广播'),
        topic: argValue(argv, '--topic', ''),
        ref: argValue(argv, '--ref', ''),
        body: argValue(argv, '--body', ''),
      }));
      break;
    case 'sync': {
      const before = watch(root, me);
      const summary = summarize(before);
      const result = mark(root, me);
      output(`${summary}\n\n${result.changed ? 'marked as read' : 'nothing to mark'}`);
      break;
    }
    default:
      console.log(`Usage:
  collab init   --root <workspace> --me <name>
  collab watch  --root <workspace> --me <name>
  collab mark   --root <workspace> --me <name>
  collab append --root <workspace> --me <name> --to all|name --type 广播|提问|答复|... --topic t --ref r --body '...'
  collab sync   --root <workspace> --me <name>
`);
  }
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
