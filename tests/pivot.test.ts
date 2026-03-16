import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process');
vi.mock('fs');
vi.mock('@clack/prompts');

import { spawnSync } from 'child_process';
import { readFileSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import * as p from '@clack/prompts';
import { loadPivotConfig, runPivotSteps } from '../src/pivot.js';

const mockSpawnSync = vi.mocked(spawnSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockCopyFileSync = vi.mocked(copyFileSync);

// Spinner mock reused across tests
const spinnerMock = { start: vi.fn(), stop: vi.fn() };

const DEFAULT_CONFIG = {
  sourcePath: '/c/code/pivot',
  copyOperations: [
    { from: 'src/appsettings.json', to: 'dst/config' },
    { from: 'src/secrets.json', to: 'dst/config' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(p.spinner).mockReturnValue(spinnerMock as any);
  vi.mocked(p.log).warn = vi.fn();
  vi.mocked(p.log).info = vi.fn();
  mockReadFileSync.mockReturnValue(JSON.stringify(DEFAULT_CONFIG) as any);
  // Default: all paths exist
  mockExistsSync.mockReturnValue(true);
  // Default: spawnSync succeeds
  mockSpawnSync.mockReturnValue({ status: 0, stderr: '', stdout: '' } as any);
});

// ---------------------------------------------------------------------------
// loadPivotConfig
// ---------------------------------------------------------------------------
describe('loadPivotConfig', () => {
  it('parses and returns the pivot config', () => {
    const cfg = loadPivotConfig();
    expect(cfg.sourcePath).toBe('/c/code/pivot');
    expect(cfg.copyOperations).toHaveLength(2);
  });

  it('calls readFileSync with a path ending in configs/pivot.json', () => {
    loadPivotConfig();
    const [calledPath] = mockReadFileSync.mock.calls[0] as [string, ...any[]];
    expect(calledPath.replace(/\\/g, '/')).toMatch(/configs\/pivot\.json$/);
  });
});

// ---------------------------------------------------------------------------
// runPivotSteps — copy operations
// ---------------------------------------------------------------------------
describe('runPivotSteps - copy operations', () => {
  it('copies file and skips mkdirSync when dest dir already exists', async () => {
    mockExistsSync.mockReturnValue(true);
    await runPivotSteps('/src', '/dest', true);
    expect(mockMkdirSync).not.toHaveBeenCalled();
    expect(mockCopyFileSync).toHaveBeenCalledTimes(2);
  });

  it('creates dest dir when it does not exist before copying', async () => {
    // source exists (odd calls), dest dir missing (even calls)
    mockExistsSync
      .mockReturnValueOnce(true)  // fromAbs for op1
      .mockReturnValueOnce(false) // toDir for op1
      .mockReturnValueOnce(true)  // fromAbs for op2
      .mockReturnValueOnce(false); // toDir for op2
    await runPivotSteps('/src', '/dest', true);
    expect(mockMkdirSync).toHaveBeenCalledTimes(2);
    expect(mockMkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    expect(mockCopyFileSync).toHaveBeenCalledTimes(2);
  });

  it('skips file and warns when source does not exist', async () => {
    mockExistsSync.mockReturnValue(false); // all fromAbs missing
    await runPivotSteps('/src', '/dest', true);
    expect(p.log.warn).toHaveBeenCalledTimes(2);
    expect(mockCopyFileSync).not.toHaveBeenCalled();
    expect(spinnerMock.stop).toHaveBeenCalledWith('Copied 0 config file(s)');
  });

  it('reports correct copy count in spinner stop message', async () => {
    // Only first source exists
    mockExistsSync
      .mockReturnValueOnce(true)  // fromAbs op1
      .mockReturnValueOnce(true)  // toDir op1
      .mockReturnValueOnce(false); // fromAbs op2
    await runPivotSteps('/src', '/dest', true);
    expect(spinnerMock.stop).toHaveBeenCalledWith('Copied 1 config file(s)');
  });
});

// ---------------------------------------------------------------------------
// runPivotSteps — dotnet build
// ---------------------------------------------------------------------------
describe('runPivotSteps - dotnet build (skipBuild=false)', () => {
  it('succeeds and stops spinner with success message', async () => {
    await runPivotSteps('/src', '/dest', false);
    expect(mockSpawnSync).toHaveBeenCalledWith(
      'dotnet',
      ['build'],
      expect.objectContaining({ encoding: 'utf8' })
    );
    expect(spinnerMock.stop).toHaveBeenCalledWith('dotnet build succeeded');
  });

  it('throws Error with stderr output when build fails', async () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 1, stderr: 'compile error', stdout: null } as any) // dotnet
    await expect(runPivotSteps('/src', '/dest', false)).rejects.toThrow('dotnet build failed');
    await expect(async () => {
      mockSpawnSync.mockReturnValueOnce({ status: 1, stderr: 'compile error', stdout: null } as any);
      await runPivotSteps('/src', '/dest', false);
    }).rejects.toThrow('compile error');
  });

  it('falls back to stdout when stderr is null', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 1, stderr: null, stdout: 'stdout msg' } as any);
    await expect(runPivotSteps('/src', '/dest', false)).rejects.toThrow('stdout msg');
  });

  it('uses empty string when both stderr and stdout are null', async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 1, stderr: null, stdout: null } as any);
    await expect(runPivotSteps('/src', '/dest', false)).rejects.toThrow('dotnet build failed:\n');
  });

  it('passes cwd as destPath/src', async () => {
    await runPivotSteps('/my/dest', '/my/dest', false);
    const dotnetCall = mockSpawnSync.mock.calls.find((c) => c[0] === 'dotnet');
    expect(dotnetCall?.[2]).toEqual(expect.objectContaining({ cwd: expect.stringContaining('src') }));
  });
});

describe('runPivotSteps - dotnet build (skipBuild=true)', () => {
  it('skips dotnet and logs info message', async () => {
    await runPivotSteps('/src', '/dest', true);
    const dotnetCall = mockSpawnSync.mock.calls.find((c) => c[0] === 'dotnet');
    expect(dotnetCall).toBeUndefined();
    expect(p.log.info).toHaveBeenCalledWith('Skipping dotnet build.');
  });
});

// ---------------------------------------------------------------------------
// runPivotSteps — appsettings script
// ---------------------------------------------------------------------------
describe('runPivotSteps - appsettings script', () => {
  it('succeeds and stops spinner with success message', async () => {
    await runPivotSteps('/src', '/dest', true);
    const bashCall = mockSpawnSync.mock.calls.find((c) => c[0] === 'bash');
    expect(bashCall?.[1]).toContain('/c/code/shell-scripts/src/update-service-worker-appsettings.sh');
    expect(bashCall?.[1]).toContain('/dest');
    expect(spinnerMock.stop).toHaveBeenCalledWith('Service worker appsettings updated');
  });

  it('throws Error when script fails', async () => {
    mockSpawnSync.mockReturnValue({ status: 1, stderr: 'script error', stdout: null } as any);
    await expect(runPivotSteps('/src', '/dest', true)).rejects.toThrow(
      'update-service-worker-appsettings.sh failed'
    );
  });

  it('falls back to stdout when stderr is null on script failure', async () => {
    mockSpawnSync.mockReturnValue({ status: 1, stderr: null, stdout: 'out' } as any);
    await expect(runPivotSteps('/src', '/dest', true)).rejects.toThrow('out');
  });

  it('uses empty string when both outputs null on script failure', async () => {
    mockSpawnSync.mockReturnValue({ status: 1, stderr: null, stdout: null } as any);
    await expect(runPivotSteps('/src', '/dest', true)).rejects.toThrow(
      'update-service-worker-appsettings.sh failed:\n'
    );
  });
});
