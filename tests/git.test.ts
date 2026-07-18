import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync, exec } from 'child_process';

// Explicit factory (not auto-mock): a plain vi.fn() for `exec` has no
// util.promisify.custom symbol, so git.ts's module-load `promisify(exec)`
// falls back to the standard (err, result) callback convention we drive below.
vi.mock('child_process', () => ({
  execSync: vi.fn(),
  exec: vi.fn(),
}));

import {
  GitError,
  getGitRoot,
  execGit,
  execGitAsync,
  branchExists,
  checkRefFormat,
  remoteReachable,
  listLocalBranches,
  fuzzyMatchBranch,
  worktreeExists,
} from '../src/git.js';

const mockExecSync = vi.mocked(execSync);
const mockExec = vi.mocked(exec);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GitError
// ---------------------------------------------------------------------------
describe('GitError', () => {
  it('sets message and name', () => {
    const err = new GitError('oops');
    expect(err.message).toBe('oops');
    expect(err.name).toBe('GitError');
    expect(err).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// getGitRoot
// ---------------------------------------------------------------------------
describe('getGitRoot', () => {
  it('returns trimmed output on success', () => {
    mockExecSync.mockReturnValueOnce('  /repo/root\n ' as any);
    expect(getGitRoot()).toBe('/repo/root');
  });

  it('throws GitError when not in a git repo', () => {
    mockExecSync.mockImplementationOnce(() => { throw new Error('not a repo'); });
    expect(() => getGitRoot()).toThrow(GitError);
    expect(() => getGitRoot()).toThrow('Not inside a git repository.');
  });
});

// ---------------------------------------------------------------------------
// execGit
// ---------------------------------------------------------------------------
describe('execGit', () => {
  it('returns trimmed output on success', () => {
    mockExecSync.mockReturnValueOnce('  result\n' as any);
    expect(execGit(['status'])).toBe('result');
  });

  it('throws GitError with stderr when Error has stderr property', () => {
    const err: any = new Error('wrapper');
    err.stderr = '  fatal: bad repo\n';
    mockExecSync.mockImplementationOnce(() => { throw err; });
    expect(() => execGit(['status'])).toThrow(GitError);
    expect(() => {
      const e2: any = new Error('wrapper');
      e2.stderr = '  fatal: bad repo\n';
      mockExecSync.mockImplementationOnce(() => { throw e2; });
      execGit(['status']);
    }).toThrow('fatal: bad repo');
  });

  it('throws GitError with fallback when stderr is empty', () => {
    const err: any = new Error('wrapper');
    err.stderr = '   ';
    mockExecSync.mockImplementationOnce(() => { throw err; });
    expect(() => execGit(['log'])).toThrow('git log failed');
  });

  it('uses "command" in the fallback when args are empty', () => {
    const err: any = new Error('wrapper');
    err.stderr = '   ';
    mockExecSync.mockImplementationOnce(() => { throw err; });
    expect(() => execGit([])).toThrow('git command failed');
  });

  it('throws GitError with String(err) when thrown value is not an Error', () => {
    mockExecSync.mockImplementationOnce(() => { throw 'plain string error'; });
    expect(() => execGit(['fetch'])).toThrow('plain string error');
  });

  it('calls execSync with correct arguments', () => {
    mockExecSync.mockReturnValueOnce('' as any);
    execGit(['worktree', 'list']);
    expect(mockExecSync).toHaveBeenCalledWith(
      'git worktree list',
      expect.objectContaining({ stdio: ['pipe', 'pipe', 'pipe'] })
    );
  });
});

// ---------------------------------------------------------------------------
// execGitAsync (promisified exec)
// ---------------------------------------------------------------------------
describe('execGitAsync', () => {
  it('resolves with trimmed stdout on success', async () => {
    mockExec.mockImplementation(((_cmd: string, cb: any) => {
      cb(null, { stdout: '  clean output\n', stderr: '' });
    }) as any);
    await expect(execGitAsync(['status'])).resolves.toBe('clean output');
  });

  it('rejects with GitError carrying stderr when the error has one', async () => {
    const err: any = new Error('wrapper');
    err.stderr = '  fatal: bad thing\n';
    mockExec.mockImplementation(((_cmd: string, cb: any) => { cb(err); }) as any);
    await expect(execGitAsync(['status'])).rejects.toThrow(GitError);
    await expect(execGitAsync(['status'])).rejects.toThrow('fatal: bad thing');
  });

  it('falls back to "git <cmd> failed" when stderr is empty and args are empty', async () => {
    const err: any = new Error('wrapper');
    err.stderr = '   ';
    mockExec.mockImplementation(((_cmd: string, cb: any) => { cb(err); }) as any);
    await expect(execGitAsync([])).rejects.toThrow('git command failed');
  });

  it('uses String(err) when a non-Error value is thrown', async () => {
    mockExec.mockImplementation(((_cmd: string, cb: any) => { cb('plain string error'); }) as any);
    await expect(execGitAsync(['fetch'])).rejects.toThrow('plain string error');
  });

  it('uses String(err) when the Error has no stderr property', async () => {
    mockExec.mockImplementation(((_cmd: string, cb: any) => { cb(new Error('boom')); }) as any);
    await expect(execGitAsync(['pull'])).rejects.toThrow('boom');
  });
});

// ---------------------------------------------------------------------------
// branchExists
// ---------------------------------------------------------------------------
describe('branchExists', () => {
  it('returns true when execSync succeeds', () => {
    mockExecSync.mockReturnValueOnce('' as any);
    expect(branchExists('main')).toBe(true);
  });

  it('returns false when execSync throws', () => {
    mockExecSync.mockImplementationOnce(() => { throw new Error(); });
    expect(branchExists('no-such-branch')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkRefFormat
// ---------------------------------------------------------------------------
describe('checkRefFormat', () => {
  it('returns true when execSync succeeds', () => {
    mockExecSync.mockReturnValueOnce('' as any);
    expect(checkRefFormat('feat/login')).toBe(true);
  });

  it('returns false when execSync throws', () => {
    mockExecSync.mockImplementationOnce(() => { throw new Error(); });
    expect(checkRefFormat('bad..name')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// remoteReachable
// ---------------------------------------------------------------------------
describe('remoteReachable', () => {
  it('returns true when execSync succeeds', () => {
    mockExecSync.mockReturnValueOnce('' as any);
    expect(remoteReachable('origin')).toBe(true);
  });

  it('returns false when execSync throws', () => {
    mockExecSync.mockImplementationOnce(() => { throw new Error(); });
    expect(remoteReachable('origin')).toBe(false);
  });

  it('calls execSync with timeout 8000', () => {
    mockExecSync.mockReturnValueOnce('' as any);
    remoteReachable('origin/main');
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('git ls-remote'),
      expect.objectContaining({ timeout: 8000 })
    );
  });
});

// ---------------------------------------------------------------------------
// listLocalBranches
// ---------------------------------------------------------------------------
describe('listLocalBranches', () => {
  it('returns split array for non-empty output', () => {
    mockExecSync.mockReturnValueOnce('main\nfeat/login\n' as any);
    expect(listLocalBranches()).toEqual(['main', 'feat/login']);
  });

  it('returns empty array for empty output', () => {
    mockExecSync.mockReturnValueOnce('' as any);
    expect(listLocalBranches()).toEqual([]);
  });

  it('returns empty array when execSync throws', () => {
    mockExecSync.mockImplementationOnce(() => { throw new Error(); });
    expect(listLocalBranches()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// fuzzyMatchBranch
// ---------------------------------------------------------------------------
describe('fuzzyMatchBranch', () => {
  it('returns null when no branch matches', () => {
    mockExecSync.mockReturnValueOnce('main\nfeat/login\n' as any);
    expect(fuzzyMatchBranch('nonexistent')).toBeNull();
  });

  it('returns the branch when exactly one matches (case-insensitive)', () => {
    mockExecSync.mockReturnValueOnce('main\nfeat/Login\n' as any);
    expect(fuzzyMatchBranch('login')).toBe('feat/Login');
  });

  it('returns null when multiple branches match', () => {
    mockExecSync.mockReturnValueOnce('feat/login\nfeat/login-v2\n' as any);
    expect(fuzzyMatchBranch('login')).toBeNull();
  });

  it('returns null for empty branch list', () => {
    mockExecSync.mockReturnValueOnce('' as any);
    expect(fuzzyMatchBranch('anything')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// worktreeExists
// ---------------------------------------------------------------------------
describe('worktreeExists', () => {
  it('returns true when output contains the path (forward slashes)', () => {
    mockExecSync.mockReturnValueOnce('/repo/worktree/feature\n' as any);
    expect(worktreeExists('/repo/worktree/feature')).toBe(true);
  });

  it('normalises backslashes before comparing', () => {
    mockExecSync.mockReturnValueOnce('C:/repo/worktree/feature\n' as any);
    expect(worktreeExists('C:\\repo\\worktree\\feature')).toBe(true);
  });

  it('returns false when output does not contain the path', () => {
    mockExecSync.mockReturnValueOnce('/other/path\n' as any);
    expect(worktreeExists('/repo/worktree/feature')).toBe(false);
  });

  it('returns false when execSync throws', () => {
    mockExecSync.mockImplementationOnce(() => { throw new Error(); });
    expect(worktreeExists('/some/path')).toBe(false);
  });
});
