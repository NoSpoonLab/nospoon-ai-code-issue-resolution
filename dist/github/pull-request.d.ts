import { CrashReportData, PullRequestResult } from '../types';
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
export declare function createPullRequest(options: CreatePROptions): Promise<PullRequestResult>;
export declare function buildPRTitle(report: CrashReportData): string;
export declare function buildPRBody(options: CreatePROptions): string;
