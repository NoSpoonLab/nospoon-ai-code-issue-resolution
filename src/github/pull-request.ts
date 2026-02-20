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

  logger.info(`Creating PR: "${title}" (${options.branchName} -> ${options.baseBranch})`);

  let pr: { html_url: string; number: number };
  try {
    const { data } = await octokit.rest.pulls.create({
      owner,
      repo,
      title,
      body,
      head: options.branchName,
      base: options.baseBranch,
    });
    pr = data;
  } catch (error) {
    if (!isPullRequestAlreadyExistsError(error)) {
      throw error;
    }

    logger.warning('Pull request already exists for this branch. Reusing existing PR.');
    const existingPr = await findExistingPullRequest(octokit, owner, repo, options.branchName);
    if (!existingPr) {
      throw error;
    }
    pr = existingPr;
  }

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

function isPullRequestAlreadyExistsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('A pull request already exists');
}

async function findExistingPullRequest(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  branchName: string
): Promise<{ html_url: string; number: number } | null> {
  const { data } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: 'open',
    head: `${owner}:${branchName}`,
    per_page: 1,
  });

  if (data.length === 0) {
    return null;
  }

  return {
    html_url: data[0].html_url,
    number: data[0].number,
  };
}

export function buildPRTitle(report: CrashReportData): string {
  const shortHash = report.crash_report_hash.slice(0, 8);
  return `fix(crash): ${report.name} v${report.version} [${shortHash}]`;
}

export function buildPRBody(options: CreatePROptions): string {
  const report = options.crashReport;
  const crashSummary = getCrashSummary(report);
  const filesFormatted = formatFilesList(options.filesChanged);

  const rootCause =
    extractMarkdownSection(options.analysis, ['Root Cause', 'Crash Root Cause', 'Cause']) ||
    crashSummary;

  const extractedSolution = extractMarkdownSection(options.analysis, [
    'Solution',
    'Fix Strategy',
    'Approach',
    'Resolution',
  ]);
  const solution =
    extractedSolution ||
    buildDefaultSolution(report, options.filesChanged.length);

  const extractedChanges = extractMarkdownSection(options.analysis, [
    'Changes Made',
    'Fix Applied',
    'What Changed',
    'Implementation',
  ]);
  const changesMade =
    formatAsBulletList(extractedChanges) ||
    [
      '- Applied a targeted fix to prevent the crash condition described above.',
      `- Updated ${options.filesChanged.length} file(s) listed in "Files Modified".`,
    ].join('\n');

  const extractedTestPlan = extractMarkdownSection(options.analysis, ['Test Plan', 'Testing']);
  const testPlan = extractedTestPlan || buildDefaultReviewerTestPlan(report);

  return PR_BODY_TEMPLATE
    .replace('{{report_id}}', report.report_id)
    .replace('{{crash_report_hash}}', report.crash_report_hash)
    .replace('{{name}}', report.name)
    .replace('{{version}}', report.version)
    .replace('{{platform}}', report.platform ?? 'Unknown')
    .replace('{{root_cause}}', rootCause)
    .replace('{{solution}}', solution)
    .replace('{{changes_made}}', changesMade)
    .replace('{{files}}', filesFormatted)
    .replace('{{test_plan}}', testPlan)
    .replace('{{cost}}', options.costUsd.toFixed(4));
}

function getCrashSummary(report: CrashReportData): string {
  if (report.managed_exception) {
    return `**${report.managed_exception.type}:** ${report.managed_exception.message}`;
  }
  if (report.native_crash?.signal_name) {
    const signalCode = report.native_crash.signal_code ? ` (${report.native_crash.signal_code})` : '';
    return `**Native crash:** ${report.native_crash.signal_name}${signalCode}`;
  }
  return 'Unknown crash type';
}

function formatFilesList(filesChanged: string[]): string {
  if (filesChanged.length === 0) {
    return '- No files were reported as changed.';
  }
  return filesChanged.map((file) => `- \`${file}\``).join('\n');
}

function formatAsBulletList(content: string | null): string | null {
  if (!content) return null;
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  const bulletLike = /^(-|\*|\d+\.)\s+/;
  if (lines.every((line) => bulletLike.test(line))) {
    return lines.join('\n');
  }

  return lines.map((line) => `- ${line}`).join('\n');
}

function extractMarkdownSection(analysis: string, headings: string[]): string | null {
  if (!analysis.trim()) return null;

  const escapedHeadings = headings.map(escapeRegex).join('|');
  const headingRegex = new RegExp(`^#{1,6}\\s*(?:${escapedHeadings})\\s*$`, 'im');
  const headingMatch = analysis.match(headingRegex);
  if (!headingMatch || headingMatch.index == null) {
    return null;
  }

  const sectionStart = headingMatch.index + headingMatch[0].length;
  const remaining = analysis.slice(sectionStart);
  const nextHeadingMatch = remaining.match(/^#{1,6}\s+/m);
  const rawSection = nextHeadingMatch
    ? remaining.slice(0, nextHeadingMatch.index)
    : remaining;

  const section = rawSection.trim();
  return section || null;
}

function buildDefaultReviewerTestPlan(report: CrashReportData): string {
  const crashLabel = report.managed_exception?.type || report.native_crash?.signal_name || 'the reported crash';
  const platform = report.platform || 'the target platform';

  return [
    '- Reproduce the original user flow that previously triggered this crash.',
    `- Verify the flow now completes without ${crashLabel} on ${platform}.`,
    '- Run a quick regression check on adjacent flows touched by this fix.',
    '- Confirm logs/console show no new errors after the change.',
  ].join('\n');
}

function buildDefaultSolution(report: CrashReportData, filesChangedCount: number): string {
  const crashLabel = report.managed_exception?.type || report.native_crash?.signal_name || 'reported crash';
  return [
    `Applied a targeted, minimal fix focused on preventing ${crashLabel} without changing unrelated behavior.`,
    `The implementation updates ${filesChangedCount} file(s), prioritizing safe guards and stable fallback behavior where the crash condition is triggered.`,
  ].join('\n');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}
