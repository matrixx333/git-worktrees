import * as p from '@clack/prompts';
import { existsSync } from 'fs';
import { join } from 'path';
import { GitError, execGit, fuzzyMatchBranch } from './git.js';

export async function runDelete(gitRoot: string): Promise<void> {
  const destBase = gitRoot + '.worktree';

  const folderName = await p.text({
    message: 'Worktree folder name to delete',
    placeholder: 'feature-login',
    validate(value) {
      if (!value) return 'Folder name is required.';
      if (value.includes('/') || value === '.' || value === '..')
        return 'Must be a single folder name (no slashes or dots).';
    },
  });
  if (p.isCancel(folderName)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  const deleteBranch = await p.confirm({
    message: 'Also delete the associated branch?',
    initialValue: true,
  });
  if (p.isCancel(deleteBranch)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  const destPath = join(destBase, folderName);
  const spinner = p.spinner();

  // Remove worktree
  if (existsSync(destPath)) {
    spinner.start(`Removing worktree at ${destPath}…`);
    try {
      execGit(['worktree', 'remove', '-f', '--', destPath.replace(/\\/g, '/')]);
      spinner.stop(`Worktree removed: ${destPath}`);
    } catch (err) {
      spinner.stop('Failed to remove worktree.');
      const message = err instanceof GitError ? err.message : String(err);
      p.cancel(message);
      process.exit(1);
    }
  } else {
    p.log.warn(`Worktree path does not exist: ${destPath}`);
  }

  if (!deleteBranch) {
    p.log.info('Branch deletion skipped.');
    return;
  }

  // Fuzzy-match branch by folder name
  const branch = fuzzyMatchBranch(folderName);
  if (!branch) {
    p.log.warn(`No unique branch matched "${folderName}" — skipping branch deletion.`);
    return;
  }

  spinner.start(`Deleting branch "${branch}"…`);
  try {
    execGit(['branch', '-D', '--', branch]);
    spinner.stop(`Branch deleted: ${branch}`);
  } catch (err) {
    spinner.stop('Failed to delete branch.');
    const message = err instanceof GitError ? err.message : String(err);
    p.cancel(message);
    process.exit(1);
  }
}
