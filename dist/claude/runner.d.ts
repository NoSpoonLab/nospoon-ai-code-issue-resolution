import { ClaudeOutput } from '../types';
export interface ClaudeRunnerOptions {
    cliPath: string;
    prompt: string;
    maxTurns: number;
    allowedTools: string[];
    apiKey: string;
    workingDirectory: string;
}
export declare function runClaude(options: ClaudeRunnerOptions): Promise<ClaudeOutput>;
