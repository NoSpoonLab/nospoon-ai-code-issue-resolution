import * as github from '@actions/github';
import { CrashReportData, PullRequestResult } from '../types';
import { PR_BODY_TEMPLATE } from '../constants';
import { logger } from '../utils/logger';

export interface CreatePROptions {
  githubToken: string;
  branchName: string;
  baseBranch: string;
  crashReport: CrashReportData;
  analysis: string;
  filesChanged: string[];
  costUsd: number;
  labels: string[];
}

export async function createPullRequest(options: CreatePROptions): Promise<PullRequestResult> {
  const octokit = github.getOctokit(options.githubToken);
  const { owner, repo } = github.context.repo;

  const title = buildPRTitle(options.crashReport);
  const body = buildPRBody(options);

  logger.info(`Creating PR: "${title}" (${options.branchName} → ${options.baseBranch})`);

  const { data: pr } = await octokit.rest.pulls.create({
    owner,
    repo,
    title,
    body,
    head: options.branchName,
    base: options.baseBranch,
  });

  if (options.labels.length > 0) {
    try {
      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: pr.number,
        labels: options.labels,
      });
    } catch (err) {
      logger.warning(`Failed to add labels: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  logger.info(`PR created: ${pr.html_url}`);

  return {
    url: pr.html_url,
    number: pr.number,
    branch: options.branchName,
  };
}

export function buildPRTitle(report: CrashReportData): string {
  const shortHash = report.crash_report_hash.slice(0, 8);
  return `fix(crash): ${report.name} v${report.version} [${shortHash}]`;
}

export function buildPRBody(options: CreatePROptions): string {
  const report = options.crashReport;
  const filesFormatted = options.filesChanged.map((f) => `- \`${f}\``).join('\n');

  let crashSummary = '';
  if (report.managed_exception) {
    crashSummary = `**${report.managed_exception.type}:** ${report.managed_exception.message}`;
  } else if (report.native_crash?.signal_name) {
    crashSummary = `**Native crash:** ${report.native_crash.signal_name}`;
    if (report.native_crash.signal_code) {
      crashSummary += ` (${report.native_crash.signal_code})`;
    }
  } else {
    crashSummary = 'Unknown crash type';
  }

  return PR_BODY_TEMPLATE
    .replace('{{report_id}}', report.report_id)
    .replace('{{crash_report_hash}}', report.crash_report_hash)
    .replace('{{name}}', report.name)
    .replace('{{version}}', report.version)
    .replace('{{platform}}', report.platform ?? 'Unknown')
    .replace('{{crash_summary}}', crashSummary)
    .replace('{{analysis}}', options.analysis)
    .replace('{{files}}', filesFormatted)
    .replace('{{cost}}', options.costUsd.toFixed(4));
}
