import * as exec from '@actions/exec';
import { runClaude, ClaudeRunnerOptions } from '../../src/claude/runner';

jest.mock('@actions/exec');
jest.mock('@actions/core');

const mockExec = exec.exec as jest.MockedFunction<typeof exec.exec>;

const defaultOptions: ClaudeRunnerOptions = {
  cliPath: '/usr/local/bin/claude',
  prompt: 'Fix the bug',
  maxTurns: 20,
  allowedTools: ['Read', 'Edit'],
  apiKey: 'sk-test-key',
  workingDirectory: '/workspace',
};

const validResultEvent = JSON.stringify({
  type: 'result',
  result: 'Fixed the null reference in LoginButton.tsx',
  session_id: 'session-123',
  total_cost_usd: 0.0542,
  is_error: false,
  usage: {
    input_tokens: 5000,
    output_tokens: 1200,
  },
});

describe('runClaude', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.CLAUDE_INCLUDE_PARTIALS;
    delete process.env.CLAUDE_PROMPT_STDIN;
    delete process.env.CLAUDE_EFFORT;
    delete process.env.CLAUDE_BETAS;
    delete process.env.CLAUDE_MODEL;
    delete process.env.CLAUDE_PERMISSION_MODE;
    delete process.env.CLAUDE_LOG_RAW;
    delete process.env.CLAUDE_HEARTBEAT_MS;
  });

  it('should call claude CLI with stream-json and smart defaults', async () => {
    mockExec.mockImplementation(async (_cmd, _args, options) => {
      options?.listeners?.stdout?.(Buffer.from(validResultEvent + '\n'));
      return 0;
    });

    await runClaude(defaultOptions);

    const [cmd, args, options] = mockExec.mock.calls[0];
    expect(cmd).toBe('/usr/local/bin/claude');
    expect(args).toEqual([
      '--print',
      '--input-format', 'text',
      '--output-format', 'stream-json',
      '--max-turns', '20',
      '--allowedTools', 'Read,Edit',
      '--tools', 'Read,Edit',
      '--permission-mode', 'plan',
      '--verbose',
      '--effort', 'high',
      '--model', 'claude-opus-4-6',
    ]);
    expect(options).toEqual(expect.objectContaining({
      cwd: '/workspace',
      silent: true,
      ignoreReturnCode: true,
    }));
  });

  it('should set ANTHROPIC_API_KEY in environment', async () => {
    mockExec.mockImplementation(async (_cmd, _args, options) => {
      expect(options?.env?.ANTHROPIC_API_KEY).toBe('sk-test-key');
      options?.listeners?.stdout?.(Buffer.from(validResultEvent + '\n'));
      return 0;
    });

    await runClaude(defaultOptions);
  });

  it('should return parsed output on success', async () => {
    mockExec.mockImplementation(async (_cmd, _args, options) => {
      options?.listeners?.stdout?.(Buffer.from(validResultEvent + '\n'));
      return 0;
    });

    const result = await runClaude(defaultOptions);
    expect(result.result).toBe('Fixed the null reference in LoginButton.tsx');
    expect(result.cost_usd).toBe(0.0542);
    expect(result.is_error).toBe(false);
    expect(result.session_id).toBe('session-123');
    expect(result.total_tokens_in).toBe(5000);
    expect(result.total_tokens_out).toBe(1200);
  });

  it('should throw when CLI exits non-zero with no output', async () => {
    mockExec.mockImplementation(async (_cmd, _args, options) => {
      options?.listeners?.stderr?.(Buffer.from('command not found'));
      return 1;
    });

    await expect(runClaude(defaultOptions)).rejects.toThrow(
      'Claude CLI exited with code 1'
    );
  });

  it('should throw when Claude reports is_error', async () => {
    const errorEvent = JSON.stringify({
      type: 'result',
      result: 'Rate limit exceeded',
      session_id: '',
      is_error: true,
      usage: { input_tokens: 0, output_tokens: 0 },
      total_cost_usd: 0,
    });

    mockExec.mockImplementation(async (_cmd, _args, options) => {
      options?.listeners?.stdout?.(Buffer.from(errorEvent + '\n'));
      return 0;
    });

    await expect(runClaude(defaultOptions)).rejects.toThrow(
      'Claude reported an error: Rate limit exceeded'
    );
  });

  it('should normalize and filter beta aliases', async () => {
    process.env.CLAUDE_BETAS = 'interleaved-thinking,context-1m';
    mockExec.mockImplementation(async (_cmd, _args, options) => {
      options?.listeners?.stdout?.(Buffer.from(validResultEvent + '\n'));
      return 0;
    });

    await runClaude(defaultOptions);

    const [, args] = mockExec.mock.calls[0];
    expect(args).toEqual(expect.arrayContaining([
      '--betas',
      'context-1m-2025-08-07',
    ]));
    expect(args).not.toEqual(expect.arrayContaining([
      'interleaved-thinking',
      'interleaved-thinking-2025-05-14',
    ]));
  });
});
