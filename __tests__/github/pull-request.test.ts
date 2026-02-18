import * as github from '@actions/github';
import { createPullRequest, CreatePROptions } from '../../src/github/pull-request';

jest.mock('@actions/github');
jest.mock('@actions/core');

const mockCreate = jest.fn();
const mockAddLabels = jest.fn();
const mockList = jest.fn();

const mockGetOctokit = github.getOctokit as jest.MockedFunction<typeof github.getOctokit>;

beforeEach(() => {
  mockCreate.mockResolvedValue({
    data: { html_url: 'https://github.com/owner/repo/pull/42', number: 42 },
  });
  mockAddLabels.mockResolvedValue({});

  mockGetOctokit.mockReturnValue({
    rest: {
      pulls: { create: mockCreate, list: mockList },
      issues: { addLabels: mockAddLabels },
    },
  } as unknown as ReturnType<typeof github.getOctokit>);

  Object.defineProperty(github, 'context', {
    value: { repo: { owner: 'test-owner', repo: 'test-repo' } },
    writable: true,
  });
});

const defaultOptions: CreatePROptions = {
  githubToken: 'ghp-test-token',
  branchName: 'fix/crash-a1b2c3d4-123',
  baseBranch: 'main',
  crashReport: {
    report_id: 'rpt-abc123',
    crash_report_hash: 'a1b2c3d4e5f6a7b8',
    ts: 1700000000,
    name: 'MyGame',
    version: '1.2.3',
    platform: 'Android',
    managed_exception: {
      type: 'NullReferenceException',
      message: 'Object reference not set',
      stack_trace: 'at Foo.Bar()',
    },
  },
  analysis: 'Fixed null reference in PlayerManager.',
  filesChanged: ['Assets/Scripts/PlayerManager.cs'],
  costUsd: 0.054,
  labels: ['crash-fix', 'auto-generated'],
};

describe('createPullRequest', () => {
  it('should create a PR with crash report title format', async () => {
    const result = await createPullRequest(defaultOptions);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'test-owner',
        repo: 'test-repo',
        title: 'fix(crash): MyGame v1.2.3 [a1b2c3d4]',
        head: 'fix/crash-a1b2c3d4-123',
        base: 'main',
      })
    );
    expect(result.url).toBe('https://github.com/owner/repo/pull/42');
    expect(result.number).toBe(42);
  });

  it('should add labels', async () => {
    await createPullRequest(defaultOptions);

    expect(mockAddLabels).toHaveBeenCalledWith(
      expect.objectContaining({
        issue_number: 42,
        labels: ['crash-fix', 'auto-generated'],
      })
    );
  });

  it('should include crash report details in PR body', async () => {
    await createPullRequest(defaultOptions);

    const body = mockCreate.mock.calls[0][0].body as string;
    expect(body).toContain('`rpt-abc123`');
    expect(body).toContain('`a1b2c3d4e5f6a7b8`');
    expect(body).toContain('MyGame v1.2.3');
    expect(body).toContain('Android');
  });

  it('should include root cause with managed exception', async () => {
    await createPullRequest(defaultOptions);

    const body = mockCreate.mock.calls[0][0].body as string;
    expect(body).toContain('### Root Cause');
    expect(body).toContain('NullReferenceException');
    expect(body).toContain('Object reference not set');
  });

  it('should include root cause with native crash', async () => {
    const opts: CreatePROptions = {
      ...defaultOptions,
      crashReport: {
        report_id: 'rpt-002',
        crash_report_hash: 'bbbb1111cccc2222',
        ts: 1700000000,
        name: 'MyGame',
        version: '1.0.0',
        native_crash: {
          signal_name: 'SIGSEGV',
          signal_code: 'SEGV_MAPERR',
          threads: [],
        },
      },
    };
    await createPullRequest(opts);

    const body = mockCreate.mock.calls[0][0].body as string;
    expect(body).toContain('SIGSEGV');
    expect(body).toContain('SEGV_MAPERR');
  });

  it('should include cost and files in PR body', async () => {
    await createPullRequest(defaultOptions);

    const body = mockCreate.mock.calls[0][0].body as string;
    expect(body).toContain('$0.0540 USD');
    expect(body).toContain('`Assets/Scripts/PlayerManager.cs`');
  });

  it('should always include Root Cause, Solution, Changes Made, Files Modified and Test Plan sections', async () => {
    await createPullRequest(defaultOptions);

    const body = mockCreate.mock.calls[0][0].body as string;
    expect(body).toContain('### Root Cause');
    expect(body).toContain('### Solution');
    expect(body).toContain('### Changes Made');
    expect(body).toContain('### Files Modified');
    expect(body).toContain('### Test Plan (Reviewer, if needed)');
  });

  it('should include default Test Plan when analysis does not provide one', async () => {
    await createPullRequest(defaultOptions);

    const body = mockCreate.mock.calls[0][0].body as string;
    expect(body).toContain('### Solution');
    expect(body).toContain('Applied a targeted, minimal fix focused on preventing');
    expect(body).toContain('### Test Plan (Reviewer, if needed)');
    expect(body).toContain('Reproduce the original user flow');
  });

  it('should use extracted analysis sections when present', async () => {
    const opts: CreatePROptions = {
      ...defaultOptions,
      analysis: [
        '## Root Cause',
        'Currency symbol lookup used First() on an empty sequence.',
        '',
        '## Solution',
        'Use FirstOrDefault() and fallback to the billing-provided symbol.',
        '',
        '## Changes Made',
        '- Replaced First() with FirstOrDefault().',
        '- Added fallback symbol.',
        '',
        '## Test Plan',
        '- Open paywall with locale lacking currency mapping.',
      ].join('\n'),
    };

    await createPullRequest(opts);

    const body = mockCreate.mock.calls[0][0].body as string;
    expect(body).toContain('Currency symbol lookup used First() on an empty sequence.');
    expect(body).toContain('Use FirstOrDefault() and fallback to the billing-provided symbol.');
    expect(body).toContain('- Replaced First() with FirstOrDefault().');
    expect(body).toContain('- Open paywall with locale lacking currency mapping.');
    expect(body).toContain('### Test Plan (Reviewer, if needed)');
  });

  it('should include default Test Plan section for higher-risk changes', async () => {
    const opts: CreatePROptions = {
      ...defaultOptions,
      filesChanged: [
        'Assets/Scripts/HUD/ParentalArea/PaymentHUD.cs',
        'Assets/Scripts/HUD/Onboarding/PaymentHUD.cs',
      ],
    };

    await createPullRequest(opts);

    const body = mockCreate.mock.calls[0][0].body as string;
    expect(body).toContain('### Test Plan (Reviewer, if needed)');
    expect(body).toContain('Reproduce the original user flow');
  });

  it('should handle label addition failure gracefully', async () => {
    mockAddLabels.mockRejectedValue(new Error('Label not found'));

    const result = await createPullRequest(defaultOptions);
    expect(result.number).toBe(42);
  });

  it('should reuse existing PR when GitHub says one already exists for branch', async () => {
    mockCreate.mockRejectedValue(
      new Error(
        'Validation Failed: {"resource":"PullRequest","code":"custom","message":"A pull request already exists for owner:branch."}'
      )
    );
    mockList.mockResolvedValue({
      data: [{ html_url: 'https://github.com/owner/repo/pull/99', number: 99 }],
    });

    const result = await createPullRequest(defaultOptions);

    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'test-owner',
        repo: 'test-repo',
        state: 'open',
        head: 'test-owner:fix/crash-a1b2c3d4-123',
      })
    );
    expect(result.url).toBe('https://github.com/owner/repo/pull/99');
    expect(result.number).toBe(99);
  });
});
