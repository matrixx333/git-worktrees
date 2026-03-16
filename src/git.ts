import { execSync } from 'child_process';

export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitError';
  }
}

export function getGitRoot(): string {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  } catch {
    throw new GitError('Not inside a git repository.');
  }
}

export function execGit(args: string[]): string {
  try {
    return execSync(`git ${args.join(' ')}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (err: unknown) {
    const stderr =
      err instanceof Error && 'stderr' in err
        ? String((err as NodeJS.ErrnoException & { stderr: unknown }).stderr).trim()
        : String(err);
    const cmd = args[0] ?? 'command';
    throw new GitError(stderr || `git ${cmd} failed`);
  }
}

export function branchExists(name: string): boolean {
  try {
    execSync(`git show-ref --verify --quiet refs/heads/${name}`, {
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

export function checkRefFormat(name: string): boolean {
  try {
    execSync(`git check-ref-format --branch "${name}"`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function remoteReachable(remote: string): boolean {
  try {
    execSync(`git ls-remote --heads ${remote}`, {
      stdio: 'pipe',
      timeout: 8000,
    });
    return true;
  } catch {
    return false;
  }
}

export function listLocalBranches(): string[] {
  try {
    const output = execSync(
      `git for-each-ref --format="%(refname:short)" refs/heads`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    return output ? output.split('\n').map((b) => b.trim()) : [];
  } catch {
    return [];
  }
}

export function fuzzyMatchBranch(worktreeName: string): string | null {
  const branches = listLocalBranches();
  const lower = worktreeName.toLowerCase();
  const matches = branches.filter((b) => b.toLowerCase().includes(lower));
  /* v8 ignore next */
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

export function worktreeExists(path: string): boolean {
  try {
    const output = execSync('git worktree list --porcelain', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output.includes(path.replace(/\\/g, '/'));
  } catch {
    return false;
  }
}
