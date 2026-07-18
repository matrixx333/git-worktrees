#!/usr/bin/env node
import * as p from '@clack/prompts';
import { getGitRoot, GitError } from './git.js';
import { runCreate } from './create.js';
import { runDelete } from './delete.js';

const RESET = '\x1b[0m';

// Each banner line paired with its gradient color. Pairing (rather than
// indexing two parallel arrays) keeps every access statically defined, so
// there is no unreachable "missing color" fallback.
const BANNER_LINES: ReadonlyArray<readonly [color: string, text: string]> = [
  ['\x1b[38;5;194m', '██╗    ██╗ ██████╗ ██████╗ ██╗  ██╗████████╗██████╗ ███████╗███████╗███████╗'],
  ['\x1b[38;5;157m', '██║    ██║██╔═══██╗██╔══██╗██║ ██╔╝╚══██╔══╝██╔══██╗██╔════╝██╔════╝██╔════╝'],
  ['\x1b[38;5;120m', '██║ █╗ ██║██║   ██║██████╔╝█████╔╝    ██║   ██████╔╝█████╗  █████╗  ███████╗'],
  ['\x1b[38;5;83m', '██║███╗██║██║   ██║██╔══██╗██╔═██╗    ██║   ██╔══██╗██╔══╝  ██╔══╝  ╚════██║'],
  ['\x1b[38;5;77m', '╚███╔███╔╝╚██████╔╝██║  ██║██║  ██╗   ██║   ██║  ██║███████╗███████╗███████║'],
  ['\x1b[38;5;71m', ' ╚══╝╚══╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝  ╚═╝   ╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝'],
];

function showBanner(): void {
  console.log();
  for (const [color, text] of BANNER_LINES) {
    console.log(`${color}${text}${RESET}`);
  }
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
