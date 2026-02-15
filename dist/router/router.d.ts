import { CrashReportData } from '../types';
export interface RouterRewrite {
    from_prefix: string;
    to_prefix: string;
}
export interface RouterTarget {
    repository: string;
    workflow: string;
    ref: string;
    crash_report_input?: string;
    dry_run_input?: string;
    extra_inputs?: Record<string, string>;
}
export interface RouterRule {
    id?: string;
    match_prefixes?: string[];
    match_namespaces?: string[];
    rewrite?: RouterRewrite;
    target: RouterTarget;
}
export interface RouteDecision {
    ruleId: string;
    matchedPrefixes: string[];
    matchedPaths: string[];
    matchedNamespaces: string[];
    target: RouterTarget;
    transformedCrashReport: CrashReportData;
}
export declare function parseRouterRules(json: string): RouterRule[];
export declare function parseRouterDefaultTarget(json: string): RouterTarget | null;
export declare function routeCrashReport(options: {
    crashReport: CrashReportData;
    rules: RouterRule[];
    mode: 'first-match' | 'fanout';
    defaultTarget?: RouterTarget | null;
}): RouteDecision[];
export declare function parseRepository(repository: string): {
    owner: string;
    repo: string;
};
