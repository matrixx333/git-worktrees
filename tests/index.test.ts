import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@clack/prompts');
vi.mock('../src/git.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/git.js')>();
  return {
    GitError: actual.GitError,
    getGitRoot: vi.fn(),
    execGit: vi.fn(),
    branchExists: vi.fn(),
    checkRefFormat: vi.fn(),
    remoteReachable: vi.fn(),
    listLocalBranches: vi.fn(),
    fuzzyMatchBranch: vi.fn(),
    worktreeExists: vi.fn(),
  };
});
vi.mock('../src/create.js');
vi.mock('../src/delete.js');

import { GitError } from '../src/git.js';

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

/**
 * Import fresh instances of all mocked modules (after resetModules),
 * apply default happy-path behaviours, let the caller override them,
 * then import index.ts so that main() runs.
 * process.exit is a no-op spy so the double-catch loop doesn't happen.
 * We wait a tick to let the floating main().catch() promise settle.
 */
async function runMain(
  override: (mods: {
    clack: typeof import('@clack/prompts');
    git: typeof import('../src/git.js');
    createMod: typeof import('../src/create.js');
    deleteMod: typeof import('../src/delete.js');
  }) => void = () => {}
) {
  const clack = await import('@clack/prompts');
  const git = await import('../src/git.js') as any;
  const createMod = await import('../src/create.js') as any;
  const deleteMod = await import('../src/delete.js') as any;

  // Default happy path
  vi.mocked(clack.cancel).mockImplementation(() => {});
  vi.mocked(clack.outro).mockImplementation(() => {});
  (clack.log as any).warn = vi.fn();
  git.getGitRoot.mockReturnValue('/git/root');
  vi.mocked(clack.select).mockResolvedValue('create' as any);
  vi.mocked(clack.isCancel).mockReturnValue(false);
  createMod.runCreate.mockResolvedValue(undefined);
  deleteMod.runDelete.mockResolvedValue(undefined);

  override({ clack, git, createMod, deleteMod });

  // No-op process.exit so the .catch() loop in index.ts doesn't create
  // an unhandled rejection.
  const exitSpy = vi.spyOn(process, 'exit').mockReturnValue(undefined as never);

  await import('../src/index.js');
  // Settle the floating main().catch() promise
  await new Promise<void>((resolve) => setImmediate(resolve));

  return { clack, git, createMod, deleteMod, exitSpy };
}

// ---------------------------------------------------------------------------
// getGitRoot throws GitError
// ---------------------------------------------------------------------------
describe('index - getGitRoot throws GitError', () => {
  it('cancels with err.message and calls exit(1)', async () => {
    const { clack, exitSpy } = await runMain(({ git }) => {
      git.getGitRoot.mockImplementation(() => { throw new GitError('no repo'); });
    });
    expect(clack.cancel).toHaveBeenCalledWith('no repo');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// getGitRoot throws non-GitError
// ---------------------------------------------------------------------------
describe('index - getGitRoot throws non-GitError', () => {
  it('uses String(err) in cancel call', async () => {
    const { clack, exitSpy } = await runMain(({ git }) => {
      git.getGitRoot.mockImplementation(() => { throw new Error('unexpected'); });
    });
    expect(clack.cancel).toHaveBeenCalledWith('Error: unexpected');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// action select cancelled
// ---------------------------------------------------------------------------
describe('index - action cancelled', () => {
  it('cancels and calls exit(0)', async () => {
    const { clack, exitSpy } = await runMain(({ clack }) => {
      vi.mocked(clack.select).mockResolvedValue(Symbol('cancel') as any);
      vi.mocked(clack.isCancel).mockReturnValue(true);
    });
    expect(clack.cancel).toHaveBeenCalledWith('Cancelled.');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

// ---------------------------------------------------------------------------
// action = 'create'
// ---------------------------------------------------------------------------
describe('index - action create', () => {
  it('calls runCreate with gitRoot and shows outro', async () => {
    const { createMod, clack } = await runMain(({ clack }) => {
      vi.mocked(clack.select).mockResolvedValue('create' as any);
      vi.mocked(clack.isCancel).mockReturnValue(false);
    });
    expect(createMod.runCreate).toHaveBeenCalledWith('/git/root');
    expect(clack.outro).toHaveBeenCalledWith('Done!');
  });
});

// ---------------------------------------------------------------------------
// action = 'delete'
// ---------------------------------------------------------------------------
describe('index - action delete', () => {
  it('calls runDelete with gitRoot and shows outro', async () => {
    const { deleteMod, clack } = await runMain(({ clack }) => {
      vi.mocked(clack.select).mockResolvedValue('delete' as any);
      vi.mocked(clack.isCancel).mockReturnValue(false);
    });
    expect(deleteMod.runDelete).toHaveBeenCalledWith('/git/root');
    expect(clack.outro).toHaveBeenCalledWith('Done!');
  });
});

// ---------------------------------------------------------------------------
// main().catch — runCreate rejects with Error
// ---------------------------------------------------------------------------
describe('index - unhandled rejection with Error', () => {
  it('cancels with err.message and calls exit(1)', async () => {
    const { clack, exitSpy } = await runMain(({ clack, createMod }) => {
      vi.mocked(clack.select).mockResolvedValue('create' as any);
      vi.mocked(clack.isCancel).mockReturnValue(false);
      createMod.runCreate.mockRejectedValue(new Error('boom'));
    });
    expect(clack.cancel).toHaveBeenCalledWith('boom');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// main().catch — runCreate rejects with non-Error
// ---------------------------------------------------------------------------
describe('index - unhandled rejection with non-Error', () => {
  it('uses String(err) in cancel call', async () => {
    const { clack, exitSpy } = await runMain(({ clack, createMod }) => {
      vi.mocked(clack.select).mockResolvedValue('create' as any);
      vi.mocked(clack.isCancel).mockReturnValue(false);
      createMod.runCreate.mockRejectedValue('string error');
    });
    expect(clack.cancel).toHaveBeenCalledWith('string error');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
