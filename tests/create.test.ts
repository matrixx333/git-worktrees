import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process');
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
vi.mock('../src/pivot.js');

import { execSync, spawnSync } from 'child_process';
import { existsSync, cpSync } from 'fs';
import * as p from '@clack/prompts';
import {
  GitError,
  branchExists,
  checkRefFormat,
  execGitAsync,
  remoteReachable,
} from '../src/git.js';
import { loadPivotConfig, runPivotSteps } from '../src/pivot.js';
import { runCreate } from '../src/create.js';

const mockExecSync = vi.mocked(execSync);
const mockSpawnSync = vi.mocked(spawnSync);
const mockExistsSync = vi.mocked(existsSync);
const mockCpSync = vi.mocked(cpSync);
const mockBranchExists = vi.mocked(branchExists);
const mockCheckRefFormat = vi.mocked(checkRefFormat);
const mockExecGitAsync = vi.mocked(execGitAsync);
const mockRemoteReachable = vi.mocked(remoteReachable);
const mockLoadPivotConfig = vi.mocked(loadPivotConfig);
const mockRunPivotSteps = vi.mocked(runPivotSteps);

const spinnerMock = { start: vi.fn(), stop: vi.fn() };

// Helpers to build p.text mock chains
type TextOpts = Parameters<typeof p.text>[0];
type ConfirmOpts = Parameters<typeof p.confirm>[0];

// Capture validate callbacks for folder, branch, remote in sequence
let folderValidate: ((v: string) => string | undefined) | undefined;
let branchValidate: ((v: string) => string | undefined) | undefined;
let remoteValidate: ((v: string) => string | undefined) | undefined;

function setupHappyPath(isPivot = false) {
  let textCallCount = 0;

  vi.mocked(p.text).mockImplementation(async (opts: TextOpts) => {
    textCallCount++;
    if (textCallCount === 1) {
      folderValidate = opts.validate as any;
      return 'my-worktree';
    }
    if (textCallCount === 2) {
      branchValidate = opts.validate as any;
      return 'feat/my-branch';
    }
    remoteValidate = opts.validate as any;
    return 'origin/main';
  });

  let confirmCallCount = 0;
  vi.mocked(p.confirm).mockImplementation(async (_opts: ConfirmOpts) => {
    confirmCallCount++;
    if (confirmCallCount === 1) return isPivot; // isPivot answer
    return false; // skipBuild answer
  });

  vi.mocked(p.isCancel).mockReturnValue(false);
}

beforeEach(() => {
  vi.clearAllMocks();
  folderValidate = undefined;
  branchValidate = undefined;
  remoteValidate = undefined;

  vi.mocked(p.spinner).mockReturnValue(spinnerMock as any);
  vi.mocked(p.log).warn = vi.fn();
  vi.mocked(p.log).success = vi.fn();
  vi.mocked(p.cancel).mockImplementation(() => {});

  mockCheckRefFormat.mockReturnValue(true);
  mockBranchExists.mockReturnValue(false);
  mockRemoteReachable.mockReturnValue(true);
  mockExistsSync.mockReturnValue(false);
  mockExecGitAsync.mockResolvedValue('');
  mockSpawnSync.mockReturnValue({ status: 0, error: undefined } as any);
  mockLoadPivotConfig.mockReturnValue({
    sourcePath: '/pivot/root',
    copyOperations: [],
  });
  mockRunPivotSteps.mockResolvedValue(undefined);

  vi.spyOn(process, 'exit').mockImplementation((_code?: any) => {
    throw new Error(`process.exit(${_code})`);
  });
});

// ---------------------------------------------------------------------------
// isPivot prompt cancellation
// ---------------------------------------------------------------------------
describe('runCreate - isPivot cancelled', () => {
  it('calls cancel and exits 0', async () => {
    vi.mocked(p.confirm).mockResolvedValueOnce(Symbol('cancel') as any);
    vi.mocked(p.isCancel).mockReturnValueOnce(true);

    await expect(runCreate('/git/root')).rejects.toThrow('process.exit(0)');
    expect(p.cancel).toHaveBeenCalledWith('Cancelled.');
  });
});

// ---------------------------------------------------------------------------
// Non-pivot happy path
// ---------------------------------------------------------------------------
describe('runCreate - non-pivot happy path', () => {
  it('uses gitRoot as effectiveRoot and does not call loadPivotConfig', async () => {
    setupHappyPath(false);
    await runCreate('/git/root');
    expect(mockLoadPivotConfig).not.toHaveBeenCalled();
    expect(mockExecGitAsync).toHaveBeenCalledWith(
      expect.arrayContaining(['worktree', 'add'])
    );
    expect(p.log.success).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Pivot happy path
// ---------------------------------------------------------------------------
describe('runCreate - pivot happy path', () => {
  it('uses sourcePath as effectiveRoot and calls runPivotSteps', async () => {
    setupHappyPath(true);
    await runCreate('/git/root');
    expect(mockLoadPivotConfig).toHaveBeenCalled();
    expect(mockRunPivotSteps).toHaveBeenCalledWith('/pivot/root', expect.any(String), false);
  });
});

// ---------------------------------------------------------------------------
// folderName validate callbacks
// ---------------------------------------------------------------------------
describe('runCreate - folderName validator', () => {
  beforeEach(async () => {
    setupHappyPath(false);
    // Run once to capture the validate fn (it doesn't matter if it "succeeds")
    await runCreate('/git/root').catch(() => {});
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

  it('returns error when destination already exists', () => {
    mockExistsSync.mockReturnValue(true);
    expect(folderValidate?.('existing')).toMatch('Destination already exists:');
  });

  it('returns undefined for a valid name', () => {
    mockExistsSync.mockReturnValue(false);
    expect(folderValidate?.('valid-name')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// folderName cancellation
// ---------------------------------------------------------------------------
describe('runCreate - folderName cancelled', () => {
  it('exits 0', async () => {
    let callCount = 0;
    vi.mocked(p.confirm).mockResolvedValue(false as any);
    vi.mocked(p.text).mockImplementation(async () => {
      callCount++;
      return 'cancel-token' as any;
    });
    vi.mocked(p.isCancel).mockImplementation((v) => callCount >= 1);

    await expect(runCreate('/git/root')).rejects.toThrow('process.exit(0)');
    expect(p.cancel).toHaveBeenCalledWith('Cancelled.');
  });
});

// ---------------------------------------------------------------------------
// branchName validate callbacks
// ---------------------------------------------------------------------------
describe('runCreate - branchName validator', () => {
  beforeEach(async () => {
    setupHappyPath(false);
    await runCreate('/git/root').catch(() => {});
  });

  it('returns error for empty value', () => {
    expect(branchValidate?.('')).toBe('Branch name is required.');
  });

  it('returns error for invalid ref format', () => {
    mockCheckRefFormat.mockReturnValue(false);
    expect(branchValidate?.('bad..name')).toBe('Invalid branch name: "bad..name"');
  });

  it('returns error when branch already exists', () => {
    mockCheckRefFormat.mockReturnValue(true);
    mockBranchExists.mockReturnValue(true);
    expect(branchValidate?.('main')).toBe('Branch already exists locally: "main"');
  });

  it('returns undefined for valid branch name', () => {
    mockCheckRefFormat.mockReturnValue(true);
    mockBranchExists.mockReturnValue(false);
    expect(branchValidate?.('feat/ok')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// branchName cancellation
// ---------------------------------------------------------------------------
describe('runCreate - branchName cancelled', () => {
  it('exits 0', async () => {
    let callCount = 0;
    vi.mocked(p.confirm).mockResolvedValue(false as any);
    vi.mocked(p.text).mockImplementation(async () => {
      callCount++;
      return 'cancel-token' as any;
    });
    // isCancel: false for folder (call 1), true for branch (call 2)
    vi.mocked(p.isCancel).mockImplementation(() => callCount >= 2);

    await expect(runCreate('/git/root')).rejects.toThrow('process.exit(0)');
  });
});

// ---------------------------------------------------------------------------
// remote validate callbacks
// ---------------------------------------------------------------------------
describe('runCreate - remote validator', () => {
  beforeEach(async () => {
    setupHappyPath(false);
    await runCreate('/git/root').catch(() => {});
  });

  it('returns error for empty value', () => {
    expect(remoteValidate?.('')).toBe('Remote is required.');
  });

  it('returns undefined for non-empty value', () => {
    expect(remoteValidate?.('origin/main')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// remote cancellation
// ---------------------------------------------------------------------------
describe('runCreate - remote cancelled', () => {
  it('exits 0', async () => {
    let callCount = 0;
    vi.mocked(p.confirm).mockResolvedValue(false as any);
    vi.mocked(p.text).mockImplementation(async () => {
      callCount++;
      return 'cancel-token' as any;
    });
    vi.mocked(p.isCancel).mockImplementation(() => callCount >= 3);

    await expect(runCreate('/git/root')).rejects.toThrow('process.exit(0)');
  });
});

// ---------------------------------------------------------------------------
// skipBuild confirm (pivot)
// ---------------------------------------------------------------------------
describe('runCreate - skipBuild confirm', () => {
  it('cancels when skipBuild confirm is cancelled', async () => {
    let confirmCount = 0;
    vi.mocked(p.confirm).mockImplementation(async () => {
      confirmCount++;
      return confirmCount === 1 ? true : (Symbol('cancel') as any);
    });
    let isTextCall = 0;
    vi.mocked(p.text).mockImplementation(async () => { isTextCall++; return 'val'; });
    vi.mocked(p.isCancel).mockImplementation((v) => {
      // cancel only on the 2nd confirm (skipBuild)
      return typeof v === 'symbol';
    });

    await expect(runCreate('/git/root')).rejects.toThrow('process.exit(0)');
    expect(p.cancel).toHaveBeenCalledWith('Cancelled.');
  });
});

// ---------------------------------------------------------------------------
// remoteReachable = false
// ---------------------------------------------------------------------------
describe('runCreate - remote unreachable', () => {
  it('logs a warning but proceeds', async () => {
    setupHappyPath(false);
    mockRemoteReachable.mockReturnValue(false);
    await runCreate('/git/root');
    expect(p.log.warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not verify remote')
    );
  });
});

// ---------------------------------------------------------------------------
// execGit throws GitError — rollback
// ---------------------------------------------------------------------------
describe('runCreate - execGit throws GitError', () => {
  it('stops spinner, cancels, attempts rollback, exits 1', async () => {
    setupHappyPath(false);
    mockExecGitAsync.mockRejectedValueOnce(new GitError('bad worktree'));
    mockExecSync.mockImplementationOnce(() => { throw new Error('rollback also failed'); });

    await expect(runCreate('/git/root')).rejects.toThrow('process.exit(1)');
    expect(spinnerMock.stop).toHaveBeenCalledWith('Failed.');
    expect(p.cancel).toHaveBeenCalledWith('bad worktree');
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('git worktree remove'),
      expect.objectContaining({ stdio: 'pipe' })
    );
  });
});

// ---------------------------------------------------------------------------
// execGit throws non-GitError
// ---------------------------------------------------------------------------
describe('runCreate - execGit throws non-GitError', () => {
  it('uses String(err) as cancel message', async () => {
    setupHappyPath(false);
    mockExecGitAsync.mockRejectedValueOnce(new Error('unexpected'));

    await expect(runCreate('/git/root')).rejects.toThrow('process.exit(1)');
    expect(p.cancel).toHaveBeenCalledWith('Error: unexpected');
  });
});

// ---------------------------------------------------------------------------
// .vscode copy
// ---------------------------------------------------------------------------
describe('runCreate - .vscode copy', () => {
  it('copies .vscode when it exists', async () => {
    setupHappyPath(false);
    mockExistsSync.mockImplementation((p: any) =>
      String(p).includes('.vscode')
    );
    await runCreate('/git/root');
    expect(mockCpSync).toHaveBeenCalled();
  });

  it('warns when cpSync throws', async () => {
    setupHappyPath(false);
    mockExistsSync.mockImplementation((p: any) => String(p).includes('.vscode'));
    mockCpSync.mockImplementationOnce(() => { throw new Error('copy failed'); });
    await runCreate('/git/root');
    expect(p.log.warn).toHaveBeenCalledWith('Could not copy .vscode — continuing.');
  });

  it('does not call cpSync when .vscode does not exist', async () => {
    setupHappyPath(false);
    mockExistsSync.mockReturnValue(false);
    await runCreate('/git/root');
    expect(mockCpSync).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// runPivotSteps throws
// ---------------------------------------------------------------------------
describe('runCreate - runPivotSteps throws', () => {
  it('cancels and exits 1', async () => {
    setupHappyPath(true);
    mockRunPivotSteps.mockRejectedValueOnce(new Error('pivot failed'));
    await expect(runCreate('/git/root')).rejects.toThrow('process.exit(1)');
    expect(p.cancel).toHaveBeenCalledWith('pivot failed');
  });
});

// ---------------------------------------------------------------------------
// runPivotSteps rejects with non-Error
// ---------------------------------------------------------------------------
describe('runCreate - runPivotSteps rejects with non-Error', () => {
  it('uses String(err) in cancel and exits 1', async () => {
    setupHappyPath(true);
    mockRunPivotSteps.mockRejectedValueOnce('plain string rejection');
    await expect(runCreate('/git/root')).rejects.toThrow('process.exit(1)');
    expect(p.cancel).toHaveBeenCalledWith('plain string rejection');
  });
});

// ---------------------------------------------------------------------------
// VS Code spawn
// ---------------------------------------------------------------------------
describe('runCreate - VS Code spawn', () => {
  it('does not warn when code launches successfully', async () => {
    setupHappyPath(false);
    mockSpawnSync.mockReturnValue({ status: 0, error: undefined } as any);
    await runCreate('/git/root');
    const warnCalls = vi.mocked(p.log.warn).mock.calls;
    expect(warnCalls.every((c) => !String(c[0]).includes('VS Code'))).toBe(true);
  });

  it('warns when VS Code CLI is not found', async () => {
    setupHappyPath(false);
    mockSpawnSync.mockReturnValue({ status: 1, error: new Error('not found') } as any);
    await runCreate('/git/root');
    expect(p.log.warn).toHaveBeenCalledWith('VS Code CLI not found — open the folder manually.');
  });
});
