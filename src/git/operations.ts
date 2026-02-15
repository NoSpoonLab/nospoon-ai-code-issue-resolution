import * as exec from '@actions/exec';
import { GitDiffResult } from '../types';
import { BRANCH_NAME_MAX_LENGTH, COMMIT_MESSAGE_PREFIX } from '../constants';
import { logger } from '../utils/logger';

export function sanitizeBranchName(prefix: string, title: string): string {
  const timestamp = Date.now();
  const sanitized = title
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const base = `${prefix}${sanitized}`;
  const suffix = `-${timestamp}`;
  const maxBaseLength = BRANCH_NAME_MAX_LENGTH - suffix.length;
  const truncated = base.length > maxBaseLength ? base.slice(0, maxBaseLength) : base;

  return `${truncated}${suffix}`;
}

export async function createBranch(branchName: string): Promise<void> {
  logger.info(`Creating branch: ${branchName}`);
  await git(['checkout', '-b', branchName]);
}

export async function detectChanges(): Promise<GitDiffResult> {
  const modifiedRaw = await gitOutput(['diff', '--name-only']);
  const stagedRaw = await gitOutput(['diff', '--cached', '--name-only']);
  const untrackedRaw = await gitOutput(['ls-files', '--others', '--exclude-standard']);

  const modifiedFiles = splitLines(modifiedRaw).concat(splitLines(stagedRaw));
  const newFiles = splitLines(untrackedRaw);

  const unique = [...new Set([...modifiedFiles, ...newFiles])];

  return {
    modifiedFiles: [...new Set(modifiedFiles)],
    newFiles,
    hasChanges: unique.length > 0,
  };
}

export async function getCurrentHead(): Promise<string> {
  return gitOutput(['rev-parse', 'HEAD']);
}

export async function detectCommittedChangesSince(baseSha: string): Promise<string[]> {
  if (!baseSha.trim()) return [];
  const raw = await gitOutput(['diff', '--name-only', `${baseSha}..HEAD`]);
  return splitLines(raw);
}

export async function stageFiles(files: string[]): Promise<void> {
  if (files.length === 0) return;
  logger.info(`Staging ${files.length} file(s)`);
  for (const file of files) {
    await git(['add', file]);
  }
}

export async function commitChanges(title: string): Promise<void> {
  const message = `${COMMIT_MESSAGE_PREFIX}${title}`;
  logger.info(`Committing: ${message}`);
  await git(['commit', '-m', message]);
}

export async function pushBranch(branchName: string): Promise<void> {
  logger.info(`Pushing branch: ${branchName}`);
  await git(['push', 'origin', branchName]);
}

export async function configureGitUser(): Promise<void> {
  await git(['config', 'user.name', 'github-actions[bot]']);
  await git(['config', 'user.email', 'github-actions[bot]@users.noreply.github.com']);
}

async function git(args: string[]): Promise<number> {
  return exec.exec('git', args);
}

async function gitOutput(args: string[]): Promise<string> {
  let stdout = '';
  await exec.exec('git', args, {
    listeners: {
      stdout: (data: Buffer) => {
        stdout += data.toString();
      },
    },
    silent: true,
  });
  return stdout.trim();
}

function splitLines(text: string): string[] {
  return text ? text.split('\n').filter(Boolean) : [];
}
