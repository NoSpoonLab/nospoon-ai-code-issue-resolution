import * as core from '@actions/core';
import * as github from '@actions/github';
import { ActionInputs } from './types';
import { DEFAULTS } from './constants';
import { parseAndValidateCrashReport } from './input/validator';
import { ensureClaudeCli } from './claude/installer';
import { buildPrompt } from './claude/prompt-builder';
import { runClaude } from './claude/runner';
import {
  sanitizeBranchName,
  createBranch,
  detectChanges,
  detectCommittedChangesSince,
  stageFiles,
  commitChanges,
  pushBranch,
  configureGitUser,
  getCurrentHead,
} from './git/operations';
import { buildPRBody, buildPRTitle, createPullRequest } from './github/pull-request';
import { logger } from './utils/logger';
import { ActionError, handleError } from './utils/error-handler';
import { dispatchRoutedWorkflows } from './router/dispatcher';
import { parseRouterDefaultTarget, parseRouterRules, routeCrashReport } from './router/router';

export function getInputs(): ActionInputs {
  const crashReportRaw = core.getInput('crash_report', { required: true });
  const anthropicApiKey = core.getInput('anthropic_api_key', { required: true });
  const githubToken = core.getInput('github_token') || process.env.GITHUB_TOKEN || '';
  const baseBranch = core.getInput('base_branch') || '';
  const branchPrefix = core.getInput('branch_prefix') || DEFAULTS.BRANCH_PREFIX;
  const maxTurnsRaw = core.getInput('max_turns') || String(DEFAULTS.MAX_TURNS);
  const allowedToolsRaw = core.getInput('allowed_tools') || DEFAULTS.ALLOWED_TOOLS.join(',');
  const blockedDirsRaw = core.getInput('blocked_directories') || '';
  const prLabelsRaw = core.getInput('pr_labels') || DEFAULTS.PR_LABELS.join(',');
  const dryRunRaw = core.getInput('dry_run') || String(DEFAULTS.DRY_RUN);
  const useRouterRaw = core.getInput('use_router') || 'false';
  const routerRulesJson = core.getInput('router_rules_json') || '';
  const routerModeRaw = core.getInput('router_mode') || 'first-match';
  const routerDefaultTargetJson = core.getInput('router_default_target_json') || '';
  const additionalPrompt = core.getInput('additional_prompt') || '';
  const claudePermissionMode = core.getInput('claude_permission_mode') || process.env.CLAUDE_PERMISSION_MODE || 'plan';
  const claudeAutoApplyPlan = core.getInput('claude_auto_apply_plan') || process.env.CLAUDE_AUTO_APPLY_PLAN || 'true';
  const claudeModel = core.getInput('claude_model') || process.env.CLAUDE_MODEL || 'claude-opus-4-6';
  const claudeEffort = core.getInput('claude_effort') || process.env.CLAUDE_EFFORT || 'high';
  const claudeBetas = core.getInput('claude_betas') || process.env.CLAUDE_BETAS || '';

  core.setSecret(anthropicApiKey);
  process.env.CLAUDE_PERMISSION_MODE = claudePermissionMode;
  process.env.CLAUDE_AUTO_APPLY_PLAN = claudeAutoApplyPlan;
  process.env.CLAUDE_MODEL = claudeModel;
  process.env.CLAUDE_EFFORT = claudeEffort;
  process.env.CLAUDE_BETAS = claudeBetas;

  const crashReport = parseAndValidateCrashReport(crashReportRaw);

  const maxTurns = parseInt(maxTurnsRaw, 10);
  if (isNaN(maxTurns) || maxTurns < 1) {
    throw new ActionError('max_turns must be a positive integer', 'input-validation');
  }
  const routerMode = parseRouterMode(routerModeRaw);
  const useRouter = readBoolean(useRouterRaw);

  return {
    crashReport,
    anthropicApiKey,
    githubToken,
    baseBranch,
    branchPrefix,
    maxTurns,
    allowedTools: allowedToolsRaw.split(',').map((t) => t.trim()).filter(Boolean),
    blockedDirectories: blockedDirsRaw.split(',').map((d) => d.trim()).filter(Boolean),
    prLabels: prLabelsRaw.split(',').map((l) => l.trim()).filter(Boolean),
    dryRun: dryRunRaw.toLowerCase() === 'true',
    useRouter,
    routerRulesJson,
    routerMode,
    routerDefaultTargetJson,
    additionalPrompt,
  };
}

export async function run(): Promise<void> {
  // 1. Parse inputs
  logger.info('Parsing and validating inputs...');
  const inputs = getInputs();
  const report = inputs.crashReport;
  logger.info(`Crash report: ${report.name} v${report.version} (${report.report_id})`);

  if (inputs.useRouter) {
    const rules = parseRouterRules(inputs.routerRulesJson);
    const defaultTarget = parseRouterDefaultTarget(inputs.routerDefaultTargetJson);
    const decisions = routeCrashReport({
      crashReport: report,
      rules,
      mode: inputs.routerMode,
      defaultTarget,
    });

    if (decisions.length > 0) {
      const dispatched = await logger.group('Dispatch Routed Workflows', () =>
        dispatchRoutedWorkflows(inputs.githubToken, decisions, inputs.dryRun)
      );
      const targetsSummary = dispatched
        .map((entry) => `${entry.repository}:${entry.workflow}@${entry.ref}`)
        .join(',');
      core.setOutput('router_used', 'true');
      core.setOutput('routed_targets', targetsSummary);
      core.setOutput('claude_analysis', 'Routed crash report to target workflow(s).');
      core.setOutput('files_changed', '');
      core.setOutput('cost_usd', '0.0000');
      logger.info(`Routing complete. Dispatched: ${targetsSummary}`);
      return;
    }

    logger.info('Router enabled but no rules matched. Continuing with local fix flow.');
  }

  // 2. Install/verify Claude CLI
  const cliPath = await logger.group('Install Claude CLI', () => ensureClaudeCli());

  // 3. Configure git and create branch
  const branchName = sanitizeBranchName(inputs.branchPrefix, report.crash_report_hash);
  await logger.group('Setup git', async () => {
    await configureGitUser();
    await createBranch(branchName);
  });
  const branchStartHead = await getCurrentHead();

  // 4. Build prompt
  const prompt = buildPrompt(report, inputs.additionalPrompt);
  logger.debug(`Prompt length: ${prompt.length} characters`);

  // 5. Execute Claude CLI
  const autoApplyPlan = readBooleanEnv('CLAUDE_AUTO_APPLY_PLAN', true);
  const permissionMode = (process.env.CLAUDE_PERMISSION_MODE || 'plan').trim();
  logger.debug(`Claude auto-apply plan: ${autoApplyPlan ? 'true' : 'false'}`);
  logger.debug(`Claude permission mode: ${permissionMode}`);
  let claudeOutput = await logger.group('Run Claude Code', () =>
    runClaude({
      cliPath,
      prompt,
      maxTurns: inputs.maxTurns,
      allowedTools: inputs.allowedTools,
      apiKey: inputs.anthropicApiKey,
      workingDirectory: process.cwd(),
    })
  );

  if (autoApplyPlan && permissionMode === 'plan') {
    logger.info('Plan mode completed. Re-running Claude with permission mode dontAsk to apply changes.');
    const previousPermissionMode = process.env.CLAUDE_PERMISSION_MODE;
    process.env.CLAUDE_PERMISSION_MODE = 'dontAsk';
    try {
      claudeOutput = await logger.group('Run Claude Code (apply plan)', () =>
        runClaude({
          cliPath,
          prompt,
          maxTurns: inputs.maxTurns,
          allowedTools: inputs.allowedTools,
          apiKey: inputs.anthropicApiKey,
          workingDirectory: process.cwd(),
        })
      );
    } finally {
      if (previousPermissionMode === undefined) {
        delete process.env.CLAUDE_PERMISSION_MODE;
      } else {
        process.env.CLAUDE_PERMISSION_MODE = previousPermissionMode;
      }
    }
  }

  // 6. Detect changes
  const diff = await detectChanges();
  const committedFiles = await detectCommittedChangesSince(branchStartHead);
  const allFiles = [...new Set([...diff.modifiedFiles, ...diff.newFiles, ...committedFiles])];

  if (allFiles.length === 0) {
    logger.warning('Claude did not produce any file changes.');
    core.setOutput('claude_analysis', claudeOutput.result);
    core.setOutput('cost_usd', claudeOutput.cost_usd.toFixed(4));
    core.setOutput('files_changed', '');
    return;
  }
  if (committedFiles.length > 0) {
    logger.info(`Detected ${committedFiles.length} file(s) already committed by Claude.`);
  }
  logger.info(`Files changed: ${allFiles.join(', ')}`);

  const blockedFiles = findFilesInBlockedDirectories(allFiles, inputs.blockedDirectories);
  if (blockedFiles.length > 0) {
    logger.error(`Blocked directory guard triggered. Files: ${blockedFiles.join(', ')}`);
    core.setOutput('claude_analysis', claudeOutput.result);
    core.setOutput('files_changed', allFiles.join(','));
    core.setOutput('blocked_files', blockedFiles.join(','));
    core.setOutput('cost_usd', claudeOutput.cost_usd.toFixed(4));
    throw new ActionError(
      `Detected changes in blocked directories: ${blockedFiles.join(', ')}`,
      'blocked-directory-guard'
    );
  }

  // 7. Stage, commit, and push
  const shortHash = report.crash_report_hash.slice(0, 8);
  const commitTitle = `${report.name} v${report.version} [${shortHash}]`;

  if (inputs.dryRun) {
    logger.info('Dry run mode - skipping commit and PR creation.');
    const previewTitle = buildPRTitle(report);
    const previewBody = buildPRBody({
      githubToken: inputs.githubToken,
      branchName,
      baseBranch: inputs.baseBranch || 'main',
      crashReport: report,
      analysis: claudeOutput.result,
      filesChanged: allFiles,
      costUsd: claudeOutput.cost_usd,
      labels: inputs.prLabels,
    });
    await logger.group('PR Preview', async () => {
      logger.info(`Title: ${previewTitle}`);
      logger.info('Body:');
      for (const line of previewBody.split('\n')) {
        logger.info(line);
      }
    });
    core.setOutput('claude_analysis', claudeOutput.result);
    core.setOutput('files_changed', allFiles.join(','));
    core.setOutput('cost_usd', claudeOutput.cost_usd.toFixed(4));
    core.setOutput('branch_name', branchName);
    return;
  }

  await logger.group('Commit and push', async () => {
    if (diff.hasChanges) {
      await stageFiles(allFiles);
      await commitChanges(commitTitle);
    } else {
      logger.info('No uncommitted changes detected. Skipping stage/commit.');
    }
    await pushBranch(branchName);
  });

  // 8. Create Pull Request
  const baseBranch = inputs.baseBranch || await getDefaultBranch();
  const pr = await logger.group('Create Pull Request', () =>
    createPullRequest({
      githubToken: inputs.githubToken,
      branchName,
      baseBranch,
      crashReport: report,
      analysis: claudeOutput.result,
      filesChanged: allFiles,
      costUsd: claudeOutput.cost_usd,
      labels: inputs.prLabels,
    })
  );

  // Set outputs
  core.setOutput('pr_url', pr.url);
  core.setOutput('pr_number', pr.number);
  core.setOutput('branch_name', pr.branch);
  core.setOutput('claude_analysis', claudeOutput.result);
  core.setOutput('files_changed', allFiles.join(','));
  core.setOutput('cost_usd', claudeOutput.cost_usd.toFixed(4));

  logger.info(`Done! PR #${pr.number}: ${pr.url}`);
}

function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function readBoolean(value: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function parseRouterMode(value: string): 'first-match' | 'fanout' {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'first-match' || normalized === 'fanout') {
    return normalized;
  }
  throw new ActionError(
    `router_mode must be either "first-match" or "fanout" (received: ${value})`,
    'input-validation'
  );
}

function findFilesInBlockedDirectories(files: string[], blockedDirectories: string[]): string[] {
  if (blockedDirectories.length === 0) return [];

  const normalizedDirs = blockedDirectories
    .map(normalizeDirectoryPrefix)
    .filter(Boolean);
  if (normalizedDirs.length === 0) return [];
  const blocked: string[] = [];

  for (const file of files) {
    const normalizedFile = normalizeRepoPath(file);
    if (normalizedDirs.some((dir) => normalizedFile.startsWith(dir))) {
      blocked.push(file);
    }
  }

  return blocked;
}

function normalizeRepoPath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
}

function normalizeDirectoryPrefix(value: string): string {
  const normalized = normalizeRepoPath(value).replace(/\/+$/, '');
  return normalized ? `${normalized}/` : '';
}

async function getDefaultBranch(): Promise<string> {
  const { exec } = await import('@actions/exec');
  const fromContext = normalizeBranchName(
    github.context.payload?.repository?.default_branch as string | undefined
  );
  if (fromContext) {
    return fromContext;
  }

  const candidates: string[][] = [
    ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
    ['rev-parse', '--abbrev-ref', 'origin/HEAD'],
  ];

  for (const args of candidates) {
    let stdout = '';
    await exec('git', args, {
      listeners: {
        stdout: (data: Buffer) => {
          stdout += data.toString();
        },
      },
      silent: true,
      ignoreReturnCode: true,
    });
    const branch = normalizeBranchName(stdout);
    if (branch) {
      return branch;
    }
  }

  return normalizeBranchName(process.env.GITHUB_REF_NAME) || 'main';
}

function normalizeBranchName(rawValue: string | undefined): string | null {
  if (!rawValue) return null;
  const value = rawValue.trim();
  if (!value) return null;

  const normalized = value
    .replace(/^refs\/heads\//, '')
    .replace(/^refs\/remotes\/origin\//, '')
    .replace(/^origin\//, '');

  if (!normalized || normalized.toUpperCase() === 'HEAD') {
    return null;
  }

  return normalized;
}

/* istanbul ignore next */
if (!process.env.JEST_WORKER_ID) {
  run().catch(handleError);
}
