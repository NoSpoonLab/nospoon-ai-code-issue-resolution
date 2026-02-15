import * as exec from '@actions/exec';
import { ClaudeOutput } from '../types';
import { parseClaudeOutput } from './output-parser';
import { logger } from '../utils/logger';

export interface ClaudeRunnerOptions {
  cliPath: string;
  prompt: string;
  maxTurns: number;
  allowedTools: string[];
  apiKey: string;
  workingDirectory: string;
}

export async function runClaude(options: ClaudeRunnerOptions): Promise<ClaudeOutput> {
  const toolsList = options.allowedTools.join(',');
  const permissionMode = (process.env.CLAUDE_PERMISSION_MODE || 'plan').trim();
  const includePartials = isTruthy(process.env.CLAUDE_INCLUDE_PARTIALS);
  // Always use stdin to avoid shell escaping issues on Windows and argument length limits
  const promptViaStdin = true;
  const effort = (process.env.CLAUDE_EFFORT || 'high').trim();
  const requestedBetas = parseCsv(process.env.CLAUDE_BETAS);
  const betas: string[] = [];
  for (const rawBeta of requestedBetas) {
    const normalized = normalizeBetaName(rawBeta);
    if (!normalized) {
      logger.warning(`Skipping unsupported Claude beta: ${rawBeta}`);
      continue;
    }
    if (!betas.includes(normalized)) {
      betas.push(normalized);
    }
  }
  const model = (process.env.CLAUDE_MODEL || 'claude-opus-4-6').trim();

  const baseArgs = promptViaStdin
    ? [
        '--print',
        '--input-format', 'text',
        '--output-format', 'stream-json',
        '--max-turns', String(options.maxTurns),
        '--allowedTools', toolsList,
        '--tools', toolsList,
        '--permission-mode', permissionMode,
        '--verbose',
      ]
    : [
        '--print',
        '-p', options.prompt,
        '--output-format', 'stream-json',
        '--max-turns', String(options.maxTurns),
        '--allowedTools', toolsList,
        '--tools', toolsList,
        '--permission-mode', permissionMode,
        '--verbose',
      ]; /* fallback branch — currently unreachable since promptViaStdin is always true */
  const args = [...baseArgs];
  if (effort) {
    args.push('--effort', effort);
  }
  if (model) {
    args.push('--model', model);
  }
  if (betas.length > 0) {
    args.push('--betas', ...betas);
  }
  if (includePartials) {
    args.push('--include-partial-messages');
  }

  logger.info(`Running Claude CLI with max_turns=${options.maxTurns}`);
  logger.debug(`Allowed tools: ${options.allowedTools.join(', ')}`);
  logger.debug(`Permission mode: ${permissionMode}`);
  logger.debug(`Include partials: ${includePartials ? 'true' : 'false'}`);
  logger.debug(`Prompt via stdin: ${promptViaStdin ? 'true' : 'false'}`);
  logger.debug(`Effort: ${effort || 'default'}`);
  logger.debug(`Model: ${model || 'default'}`);
  logger.debug(`Betas: ${betas.length > 0 ? betas.join(', ') : 'none'}`);
  logger.debug(`Claude CLI path: ${options.cliPath}`);
  logger.debug(`Working directory: ${options.workingDirectory}`);

  let stdout = '';
  let stderr = '';
  let lastResultMessage = '';
  let lastOutputAt = Date.now();
  const rawLineLogging = isTruthy(process.env.CLAUDE_LOG_RAW);
  const heartbeatMs = parseHeartbeatMs(process.env.CLAUDE_HEARTBEAT_MS);
  const heartbeat = setInterval(() => {
    const idleMs = Date.now() - lastOutputAt;
    if (idleMs >= heartbeatMs) {
      logger.info(`[claude] Still running (no output for ${Math.round(idleMs / 1000)}s)`);
    }
  }, heartbeatMs);

  let exitCode = 0;
  try {
    exitCode = await exec.exec(options.cliPath, args, {
      cwd: options.workingDirectory,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: options.apiKey,
      },
      input: promptViaStdin ? Buffer.from(options.prompt) : undefined,
      listeners: {
        stdout: (data: Buffer) => {
          const chunk = data.toString();
          stdout += chunk;
          lastOutputAt = Date.now();
          // Parse stream-json events for real-time logging
          for (const line of chunk.split('\n').filter(Boolean)) {
            if (rawLineLogging) {
              logger.info(`[claude:raw] ${truncate(line, 500)}`);
            }
            try {
              const event = JSON.parse(line);
              logStreamEvent(event);
              // Keep track of the last result message for final output
              if (event.type === 'result') {
                lastResultMessage = line;
              }
            } catch {
              // Not valid JSON, skip
            }
          }
        },
        stderr: (data: Buffer) => {
          const chunk = data.toString();
          stderr += chunk;
          lastOutputAt = Date.now();
          for (const line of chunk.split('\n').filter(Boolean)) {
            logger.info(`[claude:stderr] ${line}`);
          }
        },
      },
      silent: true,
      ignoreReturnCode: true,
    });
  } finally {
    clearInterval(heartbeat);
  }

  if (stderr) {
    logger.debug(`Claude CLI stderr: ${stderr}`);
  }

  if (exitCode !== 0 && !stdout) {
    throw new Error(
      `Claude CLI exited with code ${exitCode}. stderr: ${stderr}`
    );
  }

  // With stream-json, the final "result" event contains the same fields as json output
  const outputJson = lastResultMessage || extractLastJsonLine(stdout);
  const output = parseClaudeOutput(outputJson);

  if (output.is_error) {
    throw new Error(`Claude reported an error: ${output.result}`);
  }

  logger.info(`Claude finished. Cost: $${output.cost_usd.toFixed(4)}`);
  logger.info(`Tokens: ${output.total_tokens_in} in / ${output.total_tokens_out} out`);

  return output;
}

function logStreamEvent(event: Record<string, unknown>): void {
  switch (event.type) {
    case 'system': {
      const subtype = event.subtype as string | undefined;
      if (subtype === 'init' && typeof event.model === 'string') {
        logger.info(`[claude] Model: ${event.model}`);
      }
      break;
    }
    case 'assistant': {
      const msg = event.message as Record<string, unknown> | undefined;
      if (msg?.role === 'assistant') {
        const content = msg.content as Array<Record<string, unknown>> | undefined;
        if (content) {
          for (const block of content) {
            if (block.type === 'tool_use') {
              logger.info(`[claude] Tool: ${block.name}${block.input ? ` -> ${summarizeToolInput(block.input as Record<string, unknown>)}` : ''}`);
            } else if (block.type === 'text' && typeof block.text === 'string') {
              const preview = block.text.length > 150 ? block.text.slice(0, 150) + '...' : block.text;
              logger.info(`[claude] ${preview}`);
            }
          }
        }
      }
      break;
    }
    case 'result':
      logger.info(`[claude] Completed (cost: $${extractResultCost(event)})`);
      break;
    default:
      // system, user (tool results), etc. - skip verbose logging
      break;
  }
}

function summarizeToolInput(input: Record<string, unknown>): string {
  // Show key info without flooding logs
  if (typeof input.command === 'string') {
    return input.command.length > 100 ? input.command.slice(0, 100) + '...' : input.command;
  }
  if (typeof input.file_path === 'string') {
    return input.file_path;
  }
  if (typeof input.pattern === 'string') {
    return input.pattern;
  }
  return '';
}

function extractLastJsonLine(stdout: string): string {
  // Fallback: find the last valid JSON line (the result event)
  const lines = stdout.trim().split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i]);
      if (parsed.type === 'result' || parsed.result) return lines[i];
    } catch {
      continue;
    }
  }
  // Last resort: return last line
  return lines[lines.length - 1] || '';
}

function parseHeartbeatMs(rawValue: string | undefined): number {
  if (!rawValue) return 60000;
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60000;
}

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) + '...' : value;
}

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeBetaName(value: string): string | null {
  switch (value) {
    case 'interleaved-thinking':
    case 'interleaved-thinking-2025-05-14':
      return null;
    case 'context-1m':
      return 'context-1m-2025-08-07';
    default:
      return value;
  }
}

function extractResultCost(event: Record<string, unknown>): string {
  const directCost = event.cost_usd;
  if (typeof directCost === 'number' && Number.isFinite(directCost)) {
    return directCost.toFixed(4);
  }
  const totalCost = event.total_cost_usd;
  if (typeof totalCost === 'number' && Number.isFinite(totalCost)) {
    return totalCost.toFixed(4);
  }
  return '?';
}
