import { RouteDecision } from './router';
export interface DispatchResult {
    ruleId: string;
    repository: string;
    workflow: string;
    ref: string;
}
export declare function dispatchRoutedWorkflows(githubToken: string, decisions: RouteDecision[], dryRun: boolean): Promise<DispatchResult[]>;
