import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs');
vi.mock('@clack/prompts');
vi.mock('../src/git.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/git.js')>();
  return {
    GitError: actual.GitError,
    branchExists: vi.fn(),
    checkRefFormat: vi.fn(),
    execGit: vi.fn(),
    execGitAsync: vi.fn(),
    remoteReachable: vi.fn(),
    getGitRoot: vi.fn(),
    listLocalBranches: vi.fn(),
    fuzzyMatchBranch: vi.fn(),
    worktreeExists: vi.fn(),
  };
});

import { existsSync } from 'fs';
import * as p from '@clack/prompts';
import { GitError, execGitAsync, fuzzyMatchBranch } from '../src/git.js';
import { runDelete } from '../src/delete.js';

const mockExistsSync = vi.mocked(existsSync);
const mockExecGitAsync = vi.mocked(execGitAsync);
const mockFuzzyMatchBranch = vi.mocked(fuzzyMatchBranch);

const spinnerMock = { start: vi.fn(), stop: vi.fn() };

// Helpers
type TextOpts = Parameters<typeof p.text>[0];
let folderValidate: ((v: string) => string | undefined) | undefined;

function setupHappyPath(deleteBranch = true) {
  vi.mocked(p.text).mockImplementation(async (opts: TextOpts) => {
    folderValidate = opts.validate as any;
    return 'feature-login';
  });
  vi.mocked(p.confirm).mockResolvedValue(deleteBranch as any);
  vi.mocked(p.isCancel).mockReturnValue(false);
}

beforeEach(() => {
  vi.clearAllMocks();
  folderValidate = undefined;

  vi.mocked(p.spinner).mockReturnValue(spinnerMock as any);
  vi.mocked(p.log).warn = vi.fn();
  vi.mocked(p.log).info = vi.fn();
  vi.mocked(p.cancel).mockImplementation(() => {});

  mockExistsSync.mockReturnValue(true);
  mockExecGitAsync.mockResolvedValue('');
  mockFuzzyMatchBranch.mockReturnValue('feat/login');

  vi.spyOn(process, 'exit').mockImplementation((_code?: any) => {
    throw new Error(`process.exit(${_code})`);
  });
});

// ---------------------------------------------------------------------------
// folderName validate callbacks
// ---------------------------------------------------------------------------
describe('runDelete - folderName validator', () => {
  beforeEach(async () => {
    setupHappyPath();
    await runDelete('/git/root').catch(() => {});
  });

  it('returns error for empty value', () => {
    expect(folderValidate?.('')).toBe('Folder name is required.');
  });

  it('returns error when value contains a slash', () => {
    expect(folderValidate?.('foo/bar')).toBe('Must be a single folder name (no slashes or dots).');
  });

  it('returns error for single dot', () => {
    expect(folderValidate?.('.')).toBe('Must be a single folder name (no slashes or dots).');
  });

  it('returns error for double dot', () => {
    expect(folderValidate?.('..')).toBe('Must be a single folder name (no slashes or dots).');
  });

  it('returns undefined for a valid name', () => {
    expect(folderValidate?.('valid-folder')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// folderName cancellation
// ---------------------------------------------------------------------------
describe('runDelete - folderName cancelled', () => {
  it('exits 0', async () => {
    vi.mocked(p.text).mockResolvedValue('cancel' as any);
    vi.mocked(p.isCancel).mockReturnValue(true);

    await expect(runDelete('/git/root')).rejects.toThrow('process.exit(0)');
    expect(p.cancel).toHaveBeenCalledWith('Cancelled.');
  });
});

// ---------------------------------------------------------------------------
// deleteBranch confirm cancellation
// ---------------------------------------------------------------------------
describe('runDelete - deleteBranch confirm cancelled', () => {
  it('exits 0', async () => {
    vi.mocked(p.text).mockResolvedValue('feature-login' as any);
    vi.mocked(p.confirm).mockResolvedValue(Symbol('cancel') as any);
    vi.mocked(p.isCancel).mockImplementation((v) => typeof v === 'symbol');

    await expect(runDelete('/git/root')).rejects.toThrow('process.exit(0)');
    expect(p.cancel).toHaveBeenCalledWith('Cancelled.');
  });
});

// ---------------------------------------------------------------------------
// Worktree path exists — removal succeeds
// ---------------------------------------------------------------------------
describe('runDelete - worktree removal succeeds', () => {
  it('starts and stops spinner correctly', async () => {
    setupHappyPath(false);
    mockExistsSync.mockReturnValue(true);
    await runDelete('/git/root');
    expect(spinnerMock.start).toHaveBeenCalledWith(expect.stringContaining('Removing worktree'));
    expect(spinnerMock.stop).toHaveBeenCalledWith(expect.stringContaining('Worktree removed'));
  });

  it('normalises backslashes in the path passed to execGitAsync', async () => {
    setupHappyPath(false);
    mockFuzzyMatchBranch.mockReturnValue(null);
    await runDelete('C:\\git\\root');
    const removeCall = mockExecGitAsync.mock.calls.find((c) => c[0].includes('remove'));
    expect(removeCall?.[0].join(' ')).not.toContain('\\');
  });
});

// ---------------------------------------------------------------------------
// Worktree path exists — removal fails with GitError
// ---------------------------------------------------------------------------
describe('runDelete - removal fails with GitError', () => {
  it('cancels with err.message and exits 1', async () => {
    setupHappyPath(true);
    mockExecGitAsync.mockRejectedValueOnce(new GitError('locked'));

    await expect(runDelete('/git/root')).rejects.toThrow('process.exit(1)');
    expect(spinnerMock.stop).toHaveBeenCalledWith('Failed to remove worktree.');
    expect(p.cancel).toHaveBeenCalledWith('locked');
  });
});

// ---------------------------------------------------------------------------
// Worktree path exists — removal fails with non-GitError
// ---------------------------------------------------------------------------
describe('runDelete - removal fails with non-GitError', () => {
  it('cancels with String(err) and exits 1', async () => {
    setupHappyPath(true);
    mockExecGitAsync.mockRejectedValueOnce(new Error('unexpected'));

    await expect(runDelete('/git/root')).rejects.toThrow('process.exit(1)');
    expect(p.cancel).toHaveBeenCalledWith('Error: unexpected');
  });
});

// ---------------------------------------------------------------------------
// Worktree path does not exist
// ---------------------------------------------------------------------------
describe('runDelete - worktree path missing', () => {
  it('warns without calling execGitAsync for removal', async () => {
    setupHappyPath(false);
    mockExistsSync.mockReturnValue(false);
    await runDelete('/git/root');
    expect(p.log.warn).toHaveBeenCalledWith(expect.stringContaining('does not exist'));
    expect(mockExecGitAsync).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteBranch = false
// ---------------------------------------------------------------------------
describe('runDelete - deleteBranch skipped', () => {
  it('logs info and does not call fuzzyMatchBranch', async () => {
    setupHappyPath(false);
    await runDelete('/git/root');
    expect(p.log.info).toHaveBeenCalledWith('Branch deletion skipped.');
    expect(mockFuzzyMatchBranch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// fuzzyMatchBranch returns null
// ---------------------------------------------------------------------------
describe('runDelete - no unique branch match', () => {
  it('warns and returns without deleting', async () => {
    setupHappyPath(true);
    mockFuzzyMatchBranch.mockReturnValue(null);
    await runDelete('/git/root');
    expect(p.log.warn).toHaveBeenCalledWith(
      expect.stringContaining('No unique branch matched')
    );
    // Only one execGitAsync call (worktree remove), no branch -D call
    expect(mockExecGitAsync.mock.calls.every((c) => !c[0].includes('-D'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Branch deletion succeeds
// ---------------------------------------------------------------------------
describe('runDelete - branch deletion succeeds', () => {
  it('calls execGitAsync with branch -D and stops spinner', async () => {
    setupHappyPath(true);
    await runDelete('/git/root');
    const deleteCall = mockExecGitAsync.mock.calls.find((c) => c[0].includes('-D'));
    expect(deleteCall).toBeDefined();
    expect(spinnerMock.stop).toHaveBeenCalledWith(expect.stringContaining('Branch deleted'));
  });
});

// ---------------------------------------------------------------------------
// Branch deletion fails with GitError
// ---------------------------------------------------------------------------
describe('runDelete - branch deletion fails with GitError', () => {
  it('cancels and exits 1', async () => {
    setupHappyPath(true);
    mockExecGitAsync
      .mockResolvedValueOnce('') // worktree remove succeeds
      .mockRejectedValueOnce(new GitError('cannot delete'));

    await expect(runDelete('/git/root')).rejects.toThrow('process.exit(1)');
    expect(spinnerMock.stop).toHaveBeenCalledWith('Failed to delete branch.');
    expect(p.cancel).toHaveBeenCalledWith('cannot delete');
  });
});

// ---------------------------------------------------------------------------
// Branch deletion fails with non-GitError
// ---------------------------------------------------------------------------
describe('runDelete - branch deletion fails with non-GitError', () => {
  it('uses String(err) in cancel message', async () => {
    setupHappyPath(true);
    mockExecGitAsync
      .mockResolvedValueOnce('')
      .mockRejectedValueOnce(new Error('other'));

    await expect(runDelete('/git/root')).rejects.toThrow('process.exit(1)');
    expect(p.cancel).toHaveBeenCalledWith('Error: other');
  });
});
