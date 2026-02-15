import * as github from '@actions/github';
import { logger } from '../utils/logger';
import { parseRepository, RouteDecision } from './router';

export interface DispatchResult {
  ruleId: string;
  repository: string;
  workflow: string;
  ref: string;
}

export async function dispatchRoutedWorkflows(
  githubToken: string,
  decisions: RouteDecision[],
  dryRun: boolean
): Promise<DispatchResult[]> {
  if (!githubToken.trim()) {
    throw new Error('github_token is required when use_router is enabled');
  }

  const octokit = github.getOctokit(githubToken);
  const results: DispatchResult[] = [];

  for (const decision of decisions) {
    const { owner, repo } = parseRepository(decision.target.repository);
    const crashReportInputKey = decision.target.crash_report_input || 'crash_report';
    const dryRunInputKey = decision.target.dry_run_input || 'dry_run';

    const inputs: Record<string, string> = {
      [crashReportInputKey]: JSON.stringify(decision.transformedCrashReport),
      [dryRunInputKey]: dryRun ? 'true' : 'false',
      ...(decision.target.extra_inputs || {}),
    };

    logger.info(
      `Dispatching routed workflow (${decision.ruleId}) to ${owner}/${repo} (${decision.target.workflow}@${decision.target.ref})`
    );

    await octokit.rest.actions.createWorkflowDispatch({
      owner,
      repo,
      workflow_id: decision.target.workflow,
      ref: decision.target.ref,
      inputs,
    });

    results.push({
      ruleId: decision.ruleId,
      repository: `${owner}/${repo}`,
      workflow: decision.target.workflow,
      ref: decision.target.ref,
    });
  }

  return results;
}
