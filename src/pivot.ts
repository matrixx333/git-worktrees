import * as p from '@clack/prompts';
import { readFileSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

function spawnAsync(
  cmd: string,
  args: string[],
  options: { cwd?: string; shell?: boolean }
): Promise<{ stdout: string; stderr: string; status: number }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += String(d); });
    proc.stderr.on('data', (d: Buffer) => { stderr += String(d); });
    proc.on('close', (code) => resolve({ stdout, stderr, status: code ?? 1 }));
  });
}

export interface PivotConfig {
  sourcePath: string;
  copyOperations: Array<{ from: string; to: string }>;
}

export function loadPivotConfig(): PivotConfig {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const configPath = join(__dirname, '..', 'configs', 'pivot.json');
  const raw = readFileSync(configPath, 'utf8');
  return JSON.parse(raw) as PivotConfig;
}

export async function runPivotSteps(
  sourceRoot: string,
  destPath: string,
  skipBuild: boolean
): Promise<void> {
  const config = loadPivotConfig();

  // Copy config files from source repo into new worktree
  const spinner = p.spinner();
  spinner.start('Copying Pivot config files…');

  let copied = 0;
  for (const op of config.copyOperations) {
    const fromAbs = join(sourceRoot, op.from);
    const toDir = join(destPath, op.to);

    if (!existsSync(fromAbs)) {
      p.log.warn(`Source file not found, skipping: ${op.from}`);
      continue;
    }

    if (!existsSync(toDir)) {
      mkdirSync(toDir, { recursive: true });
    }

    const fileName = op.from.split('/').at(-1) ?? op.from;
    copyFileSync(fromAbs, join(toDir, fileName));
    copied++;
  }

  spinner.stop(`Copied ${copied} config file(s)`);

  // dotnet build
  if (!skipBuild) {
    const buildSpinner = p.spinner();
    const buildCwd = join(destPath, 'src');
    buildSpinner.start('Running dotnet build…');

    const buildResult = await spawnAsync('dotnet', ['build'], {
      cwd: buildCwd,
      shell: process.platform === 'win32',
    });

    if (buildResult.status !== 0) {
      buildSpinner.stop('dotnet build failed.');
      const errOut = (buildResult.stderr ?? buildResult.stdout ?? '').trim();
      throw new Error(`dotnet build failed:\n${errOut}`);
    }

    buildSpinner.stop('dotnet build succeeded');
  } else {
    p.log.info('Skipping dotnet build.');
  }

  // update-service-worker-appsettings.sh
  const appsettingsSpinner = p.spinner();
  appsettingsSpinner.start('Updating service worker appsettings…');

  const scriptPath = '/c/code/shell-scripts/src/update-service-worker-appsettings.sh';
  const appsResult = await spawnAsync('bash', [scriptPath, destPath], {});

  if (appsResult.status !== 0) {
    appsettingsSpinner.stop('update-service-worker-appsettings.sh failed.');
    const errOut = (appsResult.stderr ?? appsResult.stdout ?? '').trim();
    throw new Error(`update-service-worker-appsettings.sh failed:\n${errOut}`);
  }

  appsettingsSpinner.stop('Service worker appsettings updated');
}
