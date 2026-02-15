import * as exec from '@actions/exec';
import * as io from '@actions/io';
import * as os from 'os';
import * as path from 'path';
import { CLAUDE_INSTALL_URL_UNIX, CLAUDE_INSTALL_URL_WINDOWS } from '../constants';
import { logger } from '../utils/logger';

export async function ensureClaudeCli(): Promise<string> {
  const existing = await findClaudeCli();
  if (existing) {
    logger.info(`Claude CLI found at: ${existing}`);
    return existing;
  }

  logger.info('Claude CLI not found, installing via native installer...');
  await installClaudeCli();

  const installed = await findClaudeCli();
  if (!installed) {
    throw new Error(
      'Failed to find Claude CLI after installation. Ensure ~/.local/bin is in PATH.'
    );
  }

  logger.info(`Claude CLI installed at: ${installed}`);
  return installed;
}

async function findClaudeCli(): Promise<string | null> {
  // First try PATH lookup
  try {
    return await io.which('claude', true);
  } catch {
    // Not in PATH, check common native install locations
  }

  const localBin = getLocalBinPath();
  const claudePath = path.join(localBin, os.platform() === 'win32' ? 'claude.exe' : 'claude');

  try {
    // Check if the binary exists at the expected native install location
    await io.which(claudePath, true);
    // Add to PATH for subsequent commands
    const core = await import('@actions/core');
    core.addPath(localBin);
    logger.info(`Added ${localBin} to PATH`);
    return claudePath;
  } catch {
    return null;
  }
}

function getLocalBinPath(): string {
  const home = os.homedir();
  return path.join(home, '.local', 'bin');
}

async function installClaudeCli(): Promise<void> {
  const platform = os.platform();

  if (platform === 'win32') {
    await installOnWindows();
  } else {
    await installOnUnix();
  }

  // Add native install location to PATH
  const localBin = getLocalBinPath();
  const core = await import('@actions/core');
  core.addPath(localBin);
  logger.info(`Added ${localBin} to PATH`);
}

async function installOnUnix(): Promise<void> {
  logger.info(`Installing Claude CLI from ${CLAUDE_INSTALL_URL_UNIX}`);

  const exitCode = await exec.exec('bash', ['-c', `curl -fsSL ${CLAUDE_INSTALL_URL_UNIX} | bash`], {
    silent: false,
  });

  if (exitCode !== 0) {
    throw new Error(`Failed to install Claude CLI via native installer (exit code ${exitCode})`);
  }
}

async function installOnWindows(): Promise<void> {
  logger.info(`Installing Claude CLI from ${CLAUDE_INSTALL_URL_WINDOWS}`);

  // Download and run the Windows install script
  const exitCode = await exec.exec('cmd', [
    '/c',
    `curl -fsSL ${CLAUDE_INSTALL_URL_WINDOWS} -o install.cmd && install.cmd && del install.cmd`,
  ], {
    silent: false,
  });

  if (exitCode !== 0) {
    throw new Error(`Failed to install Claude CLI via native installer (exit code ${exitCode})`);
  }
}