#!/usr/bin/env node
import * as p from '@clack/prompts';
import { getGitRoot, GitError } from './git.js';
import { runCreate } from './create.js';
import { runDelete } from './delete.js';

const RESET = '\x1b[0m';
const GRAYS = [
  '\x1b[38;5;250m',
  '\x1b[38;5;248m',
  '\x1b[38;5;245m',
  '\x1b[38;5;243m',
  '\x1b[38;5;240m',
  '\x1b[38;5;238m',
];

const LOGO_LINES = [
  '██╗    ██╗ ██████╗ ██████╗ ██╗  ██╗████████╗██████╗ ███████╗███████╗███████╗',
  '██║    ██║██╔═══██╗██╔══██╗██║ ██╔╝╚══██╔══╝██╔══██╗██╔════╝██╔════╝██╔════╝',
  '██║ █╗ ██║██║   ██║██████╔╝█████╔╝    ██║   ██████╔╝█████╗  █████╗  ███████╗',
  '██║███╗██║██║   ██║██╔══██╗██╔═██╗    ██║   ██╔══██╗██╔══╝  ██╔══╝  ╚════██║',
  '╚███╔███╔╝╚██████╔╝██║  ██║██║  ██╗   ██║   ██║  ██║███████╗███████╗███████║',
  ' ╚══╝╚══╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝  ╚═╝   ╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝',
];

function showBanner(): void {
  console.log();
  LOGO_LINES.forEach((line, i) => {
    console.log(`${GRAYS[i] ?? RESET}${line}${RESET}`);
  });
  console.log();
}

async function main(): Promise<void> {
  showBanner();

  // Resolve git root
  let gitRoot: string;
  try {
    gitRoot = getGitRoot();
  } catch (err) {
    const message = err instanceof GitError ? err.message : String(err);
    p.cancel(message);
    process.exit(1);
  }

  const action = await p.select({
    message: 'What would you like to do?',
    options: [
      { value: 'create', label: 'Create a worktree' },
      { value: 'delete', label: 'Delete a worktree' },
    ],
  });

  if (p.isCancel(action)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  if (action === 'create') {
    await runCreate(gitRoot);
  } else {
    await runDelete(gitRoot);
  }

  p.outro('Done!');
}

main().catch((err) => {
  p.cancel(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
