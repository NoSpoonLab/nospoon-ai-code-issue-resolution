import * as exec from '@actions/exec';
import {
  sanitizeBranchName,
  createBranch,
  detectChanges,
  detectCommittedChangesSince,
  getCurrentHead,
  stageFiles,
  commitChanges,
  pushBranch,
  configureGitUser,
} from '../../src/git/operations';

jest.mock('@actions/exec');
jest.mock('@actions/core');

const mockExec = exec.exec as jest.MockedFunction<typeof exec.exec>;

describe('sanitizeBranchName', () => {
  it('should create a valid branch name from title', () => {
    const name = sanitizeBranchName('fix/claude-', 'Login Bug Fix');
    expect(name).toMatch(/^fix\/claude-login-bug-fix-\d+$/);
  });

  it('should remove special characters', () => {
    const name = sanitizeBranchName('fix/claude-', 'Bug: can\'t login! @#$%');
    expect(name).toMatch(/^fix\/claude-bug-can-t-login-\d+$/);
  });

  it('should truncate long names', () => {
    const longTitle = 'a'.repeat(200);
    const name = sanitizeBranchName('fix/claude-', longTitle);
    expect(name.length).toBeLessThanOrEqual(100);
  });

  it('should handle empty title', () => {
    const name = sanitizeBranchName('fix/claude-', '');
    expect(name).toMatch(/^fix\/claude--\d+$/);
  });
});

describe('git operations', () => {
  beforeEach(() => {
    mockExec.mockResolvedValue(0);
  });

  describe('createBranch', () => {
    it('should call git checkout -b with branch name', async () => {
      await createBranch('fix/claude-test-123');
      expect(mockExec).toHaveBeenCalledWith('git', [
        'checkout',
        '-b',
        'fix/claude-test-123',
      ]);
    });
  });

  describe('detectChanges', () => {
    it('should detect modified and new files', async () => {
      mockExec
        .mockImplementationOnce(async (_cmd, _args, options) => {
          options?.listeners?.stdout?.(Buffer.from('src/a.ts\nsrc/b.ts\n'));
          return 0;
        })
        .mockImplementationOnce(async (_cmd, _args, options) => {
          options?.listeners?.stdout?.(Buffer.from(''));
          return 0;
        })
        .mockImplementationOnce(async (_cmd, _args, options) => {
          options?.listeners?.stdout?.(Buffer.from('src/new-file.ts\n'));
          return 0;
        });

      const result = await detectChanges();
      expect(result.hasChanges).toBe(true);
      expect(result.modifiedFiles).toContain('src/a.ts');
      expect(result.modifiedFiles).toContain('src/b.ts');
      expect(result.newFiles).toContain('src/new-file.ts');
    });

    it('should report no changes when clean', async () => {
      mockExec.mockImplementation(async (_cmd, _args, options) => {
        options?.listeners?.stdout?.(Buffer.from(''));
        return 0;
      });

      const result = await detectChanges();
      expect(result.hasChanges).toBe(false);
      expect(result.modifiedFiles).toHaveLength(0);
      expect(result.newFiles).toHaveLength(0);
    });
  });

  describe('getCurrentHead', () => {
    it('should return current git HEAD sha', async () => {
      mockExec.mockImplementationOnce(async (_cmd, _args, options) => {
        options?.listeners?.stdout?.(Buffer.from('abc123\n'));
        return 0;
      });

      const head = await getCurrentHead();
      expect(head).toBe('abc123');
    });
  });

  describe('detectCommittedChangesSince', () => {
    it('should return files changed between base sha and HEAD', async () => {
      mockExec.mockImplementationOnce(async (_cmd, _args, options) => {
        options?.listeners?.stdout?.(Buffer.from('src/x.ts\nsrc/y.ts\n'));
        return 0;
      });

      const files = await detectCommittedChangesSince('abc123');
      expect(files).toEqual(['src/x.ts', 'src/y.ts']);
    });

    it('should return empty list when base sha is empty', async () => {
      const files = await detectCommittedChangesSince('');
      expect(files).toEqual([]);
      expect(mockExec).not.toHaveBeenCalled();
    });
  });

  describe('stageFiles', () => {
    it('should call git add for each file individually', async () => {
      await stageFiles(['src/a.ts', 'src/b.ts']);
      expect(mockExec).toHaveBeenCalledWith('git', ['add', 'src/a.ts']);
      expect(mockExec).toHaveBeenCalledWith('git', ['add', 'src/b.ts']);
    });

    it('should do nothing for empty file list', async () => {
      await stageFiles([]);
      expect(mockExec).not.toHaveBeenCalled();
    });
  });

  describe('commitChanges', () => {
    it('should create a commit with prefixed message', async () => {
      await commitChanges('Login button fix');
      expect(mockExec).toHaveBeenCalledWith('git', [
        'commit',
        '-m',
        'fix(crash): Login button fix',
      ]);
    });
  });

  describe('pushBranch', () => {
    it('should push to origin', async () => {
      await pushBranch('fix/claude-test-123');
      expect(mockExec).toHaveBeenCalledWith('git', [
        'push',
        'origin',
        'fix/claude-test-123',
      ]);
    });
  });

  describe('configureGitUser', () => {
    it('should set git user name and email', async () => {
      await configureGitUser();
      expect(mockExec).toHaveBeenCalledWith('git', [
        'config',
        'user.name',
        'github-actions[bot]',
      ]);
      expect(mockExec).toHaveBeenCalledWith('git', [
        'config',
        'user.email',
        'github-actions[bot]@users.noreply.github.com',
      ]);
    });
  });
});
