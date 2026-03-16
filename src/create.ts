import * as p from '@clack/prompts';
import { execSync, spawnSync } from 'child_process';
import { existsSync, cpSync } from 'fs';
import { join } from 'path';
import {
  GitError,
  branchExists,
  checkRefFormat,
  execGit,
  remoteReachable,
} from './git.js';
import { loadPivotConfig, runPivotSteps } from './pivot.js';

export async function runCreate(gitRoot: string): Promise<void> {
  // Pivot project check
  const isPivot = await p.confirm({
    message: 'Is this for the Pivot project?',
    initialValue: false,
  });
  if (p.isCancel(isPivot)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  let effectiveRoot = gitRoot;
  if (isPivot) {
    const cfg = loadPivotConfig();
    effectiveRoot = cfg.sourcePath;
  }

  const destBase = effectiveRoot + '.worktree';

  const folderName = await p.text({
    message: 'Worktree folder name',
    placeholder: 'feature-login',
    validate(value) {
      if (!value) return 'Folder name is required.';
      if (value.includes('/') || value === '.' || value === '..')
        return 'Must be a single folder name (no slashes or dots).';
      const destPath = join(destBase, value);
      if (existsSync(destPath))
        return `Destination already exists: ${destPath}`;
    },
  });
  if (p.isCancel(folderName)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  const branchName = await p.text({
    message: 'Branch name',
    placeholder: 'feat/login',
    validate(value) {
      if (!value) return 'Branch name is required.';
      if (!checkRefFormat(value)) return `Invalid branch name: "${value}"`;
      if (branchExists(value)) return `Branch already exists locally: "${value}"`;
    },
  });
  if (p.isCancel(branchName)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  const remote = await p.text({
    message: 'Remote to track',
    placeholder: 'origin/main',
    defaultValue: 'origin/main',
    validate(value) {
      if (!value) return 'Remote is required.';
    },
  });
  if (p.isCancel(remote)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  // Skip build prompt (pivot only)
  let skipBuild = false;
  if (isPivot) {
    const skip = await p.confirm({
      message: 'Skip dotnet build?',
      initialValue: false,
    });
    if (p.isCancel(skip)) {
      p.cancel('Cancelled.');
      process.exit(0);
    }
    skipBuild = skip;
  }

  // Soft-warn if remote is unreachable (don't block)
  if (!remoteReachable(remote)) {
    p.log.warn(`Could not verify remote "${remote}" — proceeding anyway.`);
  }

  const destPath = join(destBase, folderName);

  const spinner = p.spinner();
  spinner.start(`Creating worktree at ${destPath}…`);

  try {
    execGit([
      'worktree', 'add', '--track',
      '-b', branchName,
      '--',
      destPath.replace(/\\/g, '/'),
      remote,
    ]);
  } catch (err) {
    spinner.stop('Failed.');
    const message = err instanceof GitError ? err.message : String(err);
    p.cancel(message);
    // Rollback if partially created
    try {
      execSync(`git worktree remove -f -- "${destPath}"`, { stdio: 'pipe' });
    } catch {
      // best-effort rollback
    }
    process.exit(1);
  }

  // Copy .vscode if present
  const vscodeSrc = join(effectiveRoot, '.vscode');
  if (existsSync(vscodeSrc)) {
    try {
      cpSync(vscodeSrc, join(destPath, '.vscode'), { recursive: true });
    } catch {
      p.log.warn('Could not copy .vscode — continuing.');
    }
  }

  spinner.stop(`Worktree created: ${destPath}`);
  p.log.success(`Branch "${branchName}" tracking "${remote}"`);

  // Pivot-specific post-creation steps
  if (isPivot) {
    try {
      await runPivotSteps(effectiveRoot, destPath, skipBuild);
    } catch (err) {
      p.cancel(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  }

  // Open in VS Code if available
  const codeResult = spawnSync('code', [destPath], {
    shell: process.platform === 'win32',
    stdio: 'ignore',
  });
  if (codeResult.error) {
    p.log.warn('VS Code CLI not found — open the folder manually.');
  }
}
