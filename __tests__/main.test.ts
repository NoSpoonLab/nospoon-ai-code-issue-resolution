import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as github from '@actions/github';
import * as io from '@actions/io';

jest.mock('@actions/core');
jest.mock('@actions/exec');
jest.mock('@actions/github');
jest.mock('@actions/io');

const mockGetInput = core.getInput as jest.MockedFunction<typeof core.getInput>;
const mockSetOutput = core.setOutput as jest.MockedFunction<typeof core.setOutput>;
const mockSetSecret = core.setSecret as jest.MockedFunction<typeof core.setSecret>;
const mockGroup = core.group as jest.MockedFunction<typeof core.group>;
const mockExec = exec.exec as jest.MockedFunction<typeof exec.exec>;
const mockWhich = io.which as jest.MockedFunction<typeof io.which>;
const mockGetOctokit = github.getOctokit as jest.MockedFunction<typeof github.getOctokit>;

// Import run after mocks
import { run } from '../src/main';

const validCrashReport = JSON.stringify({
  report_id: 'rpt-abc123',
  crash_report_hash: 'a1b2c3d4e5f6a7b8',
  ts: 1700000000,
  name: 'MyGame',
  version: '1.2.3',
  platform: 'Android',
  managed_exception: {
    type: 'NullReferenceException',
    message: 'Object reference not set',
    stack_trace: 'at PlayerManager.Update()',
  },
});

const claudeOutput = JSON.stringify({
  type: 'result',
  result: 'Fixed the null reference in PlayerManager.cs by adding a null check.',
  session_id: 'sess-1',
  cost_usd: 0.05,
  is_error: false,
  total_tokens_in: 1000,
  total_tokens_out: 500,
});

function setupInputs(overrides: Record<string, string> = {}): void {
  const defaults: Record<string, string> = {
    crash_report: validCrashReport,
    anthropic_api_key: 'sk-test-key',
    github_token: 'ghp-test-token',
    base_branch: 'main',
    branch_prefix: 'fix/crash-',
    max_turns: '20',
    allowed_tools: 'Read,Edit',
    blocked_directories: '',
    pr_labels: 'crash-fix',
    dry_run: 'false',
    use_router: 'false',
    router_rules_json: '',
    router_mode: 'first-match',
    router_default_target_json: '',
    ...overrides,
  };

  mockGetInput.mockImplementation((name: string) => defaults[name] || '');
}

function setupExecForFullRun(): void {
  mockExec.mockImplementation(async (cmd, args, options) => {
    // Claude CLI call
    if (cmd.toString().includes('claude')) {
      options?.listeners?.stdout?.(Buffer.from(claudeOutput));
      return 0;
    }
    // git diff --name-only (not cached)
    if (cmd === 'git' && args?.[0] === 'diff' && args?.[1] === '--name-only' && !args?.includes('--cached')) {
      options?.listeners?.stdout?.(Buffer.from('Assets/Scripts/PlayerManager.cs\n'));
      return 0;
    }
    // All other git commands return empty
    if (cmd === 'git') {
      options?.listeners?.stdout?.(Buffer.from(''));
      return 0;
    }
    return 0;
  });
}

describe('main', () => {
  beforeEach(() => {
    mockGroup.mockImplementation(async (_name, fn) => fn());
    mockWhich.mockResolvedValue('/usr/local/bin/claude');

    const mockPrCreate = jest.fn().mockResolvedValue({
      data: { html_url: 'https://github.com/test/repo/pull/1', number: 1 },
    });
    mockGetOctokit.mockReturnValue({
      rest: {
        pulls: { create: mockPrCreate },
        issues: { addLabels: jest.fn().mockResolvedValue({}) },
      },
    } as unknown as ReturnType<typeof github.getOctokit>);

    Object.defineProperty(github, 'context', {
      value: {
        repo: { owner: 'test-owner', repo: 'test-repo' },
        payload: { repository: { default_branch: 'main' } },
      },
      writable: true,
    });
  });

  it('should mask the API key as a secret', async () => {
    setupInputs();
    setupExecForFullRun();

    await run();

    expect(mockSetSecret).toHaveBeenCalledWith('sk-test-key');
  });

  it('should set PR outputs on success', async () => {
    setupInputs();
    setupExecForFullRun();

    await run();

    expect(mockSetOutput).toHaveBeenCalledWith('pr_url', expect.stringContaining('pull/1'));
    expect(mockSetOutput).toHaveBeenCalledWith('pr_number', 1);
    expect(mockSetOutput).toHaveBeenCalledWith('cost_usd', '0.0500');
    expect(mockSetOutput).toHaveBeenCalledWith('files_changed', 'Assets/Scripts/PlayerManager.cs');
  });

  it('should skip PR creation in dry_run mode', async () => {
    setupInputs({ dry_run: 'true' });
    setupExecForFullRun();

    await run();

    expect(mockSetOutput).toHaveBeenCalledWith('claude_analysis', expect.any(String));
    expect(mockSetOutput).toHaveBeenCalledWith('files_changed', 'Assets/Scripts/PlayerManager.cs');
    expect(mockSetOutput).not.toHaveBeenCalledWith('pr_url', expect.anything());
  });

  it('should handle no changes from Claude', async () => {
    setupInputs();
    mockExec.mockImplementation(async (cmd, _args, options) => {
      if (cmd.toString().includes('claude')) {
        options?.listeners?.stdout?.(Buffer.from(claudeOutput));
        return 0;
      }
      // All git commands return empty (no changes)
      options?.listeners?.stdout?.(Buffer.from(''));
      return 0;
    });

    await run();

    expect(mockSetOutput).toHaveBeenCalledWith('files_changed', '');
    expect(mockSetOutput).not.toHaveBeenCalledWith('pr_url', expect.anything());
  });

  it('should continue and create PR when Claude already committed changes', async () => {
    setupInputs();

    let diffNameOnlyCalls = 0;
    mockExec.mockImplementation(async (cmd, args, options) => {
      if (cmd.toString().includes('claude')) {
        options?.listeners?.stdout?.(Buffer.from(claudeOutput));
        return 0;
      }
      if (cmd === 'git' && args?.[0] === 'rev-parse' && args?.[1] === 'HEAD') {
        options?.listeners?.stdout?.(Buffer.from('abc123\n'));
        return 0;
      }
      if (cmd === 'git' && args?.[0] === 'diff' && args?.[1] === '--name-only' && !args?.includes('--cached')) {
        diffNameOnlyCalls += 1;
        if (args.length === 3) {
          // working tree diff
          options?.listeners?.stdout?.(Buffer.from(''));
        } else {
          // committed diff since base sha
          options?.listeners?.stdout?.(Buffer.from('Assets/Scripts/PlayerManager.cs\n'));
        }
        return 0;
      }
      if (cmd === 'git') {
        options?.listeners?.stdout?.(Buffer.from(''));
        return 0;
      }
      return 0;
    });

    await run();

    expect(mockSetOutput).toHaveBeenCalledWith('pr_url', expect.stringContaining('pull/1'));
    expect(mockSetOutput).toHaveBeenCalledWith('files_changed', 'Assets/Scripts/PlayerManager.cs');
    expect(diffNameOnlyCalls).toBeGreaterThanOrEqual(2);
  });

  it('should use repository default branch from context when base_branch is empty', async () => {
    setupInputs({ base_branch: '' });
    const mockPrCreate = jest.fn().mockResolvedValue({
      data: { html_url: 'https://github.com/test/repo/pull/2', number: 2 },
    });
    mockGetOctokit.mockReturnValue({
      rest: {
        pulls: { create: mockPrCreate },
        issues: { addLabels: jest.fn().mockResolvedValue({}) },
      },
    } as unknown as ReturnType<typeof github.getOctokit>);

    Object.defineProperty(github, 'context', {
      value: {
        repo: { owner: 'test-owner', repo: 'test-repo' },
        payload: { repository: { default_branch: 'develop' } },
      },
      writable: true,
    });

    mockExec.mockImplementation(async (cmd, args, options) => {
      if (cmd.toString().includes('claude')) {
        options?.listeners?.stdout?.(Buffer.from(claudeOutput));
        return 0;
      }
      if (cmd === 'git' && args?.[0] === 'diff' && args?.[1] === '--name-only' && !args?.includes('--cached')) {
        options?.listeners?.stdout?.(Buffer.from('Assets/Scripts/PlayerManager.cs\n'));
        return 0;
      }
      if (cmd === 'git' && args?.[0] === 'symbolic-ref') {
        options?.listeners?.stdout?.(Buffer.from('origin/HEAD\n'));
        return 0;
      }
      if (cmd === 'git' && args?.[0] === 'rev-parse' && args?.[1] === '--abbrev-ref' && args?.[2] === 'origin/HEAD') {
        options?.listeners?.stdout?.(Buffer.from('origin/HEAD\n'));
        return 0;
      }
      if (cmd === 'git') {
        options?.listeners?.stdout?.(Buffer.from(''));
        return 0;
      }
      return 0;
    });

    await run();

    expect(mockPrCreate).toHaveBeenCalledWith(expect.objectContaining({
      base: 'develop',
    }));
  });

  it('should stop when changes are in blocked directories', async () => {
    setupInputs({ blocked_directories: 'Assets/Scripts' });
    setupExecForFullRun();

    await expect(run()).rejects.toThrow('blocked directories');
    expect(mockSetOutput).toHaveBeenCalledWith(
      'blocked_files',
      'Assets/Scripts/PlayerManager.cs'
    );
    expect(mockSetOutput).not.toHaveBeenCalledWith('pr_url', expect.anything());
  });

  it('should throw on invalid crash report JSON', async () => {
    setupInputs({ crash_report: 'not json' });

    await expect(run()).rejects.toThrow('Invalid JSON');
  });

  it('should throw on missing required fields', async () => {
    setupInputs({ crash_report: JSON.stringify({ report_id: 'test' }) });

    await expect(run()).rejects.toThrow('validation failed');
  });

  it('should dispatch route and skip local claude flow when router matches', async () => {
    const routedCrashReport = JSON.stringify({
      report_id: 'rpt-abc123',
      crash_report_hash: 'a1b2c3d4e5f6a7b8',
      ts: 1700000000,
      name: 'MyGame',
      version: '1.2.3',
      managed_exception: {
        type: 'NullReferenceException',
        message: 'Object reference not set',
        stack_trace:
          'at Foo.Bar() (at Assets/NativeGames/Infrastructure/Scripts/Feature.cs:42)',
      },
    });

    setupInputs({
      crash_report: routedCrashReport,
      use_router: 'true',
      router_rules_json: JSON.stringify([
        {
          id: 'games',
          match_prefixes: ['Assets/NativeGames/'],
          rewrite: {
            from_prefix: 'Assets/NativeGames/',
            to_prefix: 'Assets/',
          },
          target: {
            repository: 'test-owner/games-repo',
            workflow: 'ai-fix.yml',
            ref: 'main',
          },
        },
      ]),
    });
    setupExecForFullRun();

    const dispatchMock = jest.fn().mockResolvedValue({});
    mockGetOctokit.mockReturnValue({
      rest: {
        actions: { createWorkflowDispatch: dispatchMock },
        pulls: { create: jest.fn().mockResolvedValue({ data: { html_url: '', number: 1 } }) },
        issues: { addLabels: jest.fn().mockResolvedValue({}) },
      },
    } as unknown as ReturnType<typeof github.getOctokit>);

    await run();

    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(dispatchMock).toHaveBeenCalledWith(expect.objectContaining({
      owner: 'test-owner',
      repo: 'games-repo',
      workflow_id: 'ai-fix.yml',
      ref: 'main',
    }));
    expect(mockSetOutput).toHaveBeenCalledWith('router_used', 'true');
    expect(mockSetOutput).toHaveBeenCalledWith(
      'routed_targets',
      expect.stringContaining('test-owner/games-repo')
    );
    expect(mockSetOutput).not.toHaveBeenCalledWith('pr_url', expect.anything());
  });
});
