import { ClaudeOutput } from '../types';

export function parseClaudeOutput(rawOutput: string): ClaudeOutput {
  const trimmed = rawOutput.trim();
  if (!trimmed) {
    throw new Error('Claude CLI produced no output');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(
      `Failed to parse Claude CLI output as JSON. Output starts with: ${trimmed.slice(0, 200)}`
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Claude CLI output is not a JSON object');
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.result !== 'string') {
    throw new Error('Claude CLI output missing "result" field');
  }

  const usage = isObject(obj.usage);
  const modelUsage = isObject(obj.modelUsage);
  const firstModelUsage = modelUsage ? firstValue(modelUsage) : null;
  const modelUsageObj = isObject(firstModelUsage);

  const costUsd = pickNumber(
    obj['cost_usd'],
    obj['total_cost_usd'],
    numberFromRecord(modelUsageObj, 'costUSD')
  );
  const totalTokensIn = pickNumber(
    obj['total_tokens_in'],
    numberFromRecord(usage, 'input_tokens'),
    numberFromRecord(modelUsageObj, 'inputTokens')
  );
  const totalTokensOut = pickNumber(
    obj['total_tokens_out'],
    numberFromRecord(usage, 'output_tokens'),
    numberFromRecord(modelUsageObj, 'outputTokens')
  );

  return {
    result: obj.result,
    session_id: typeof obj.session_id === 'string' ? obj.session_id : '',
    cost_usd: costUsd,
    is_error: obj.is_error === true,
    total_tokens_in: totalTokensIn,
    total_tokens_out: totalTokensOut,
  };
}

function isObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function firstValue(record: Record<string, unknown>): unknown {
  const keys = Object.keys(record);
  return keys.length > 0 ? record[keys[0]] : null;
}

function pickNumber(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return 0;
}

function numberFromRecord(record: Record<string, unknown> | null, key: string): number | null {
  if (!record) return null;
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
