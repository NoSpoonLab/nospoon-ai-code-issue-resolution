import { routeCrashReport, parseRouterRules, parseRouterDefaultTarget } from '../../src/router/router';
import { CrashReportData } from '../../src/types';

const crashReport: CrashReportData = {
  report_id: 'rpt-1',
  crash_report_hash: 'hash-1',
  ts: 1771140000,
  name: 'app',
  version: '1.0.0',
  managed_exception: {
    type: 'NullReferenceException',
    message: 'Object reference not set',
    stack_trace:
      'at Example.Foo() (at Assets/Plugins/Infrastructure/Scripts/Foo.cs:12)\n' +
      'at Example.Bar() (at Assets/App/Scripts/Bar.cs:34)',
  },
};

describe('router', () => {
  it('should parse valid router rules', () => {
    const rules = parseRouterRules(
      JSON.stringify([
        {
          id: 'plugins',
          match_prefixes: ['Assets/Plugins/'],
          target: {
            repository: 'org/target-repo',
            workflow: 'ai-fix.yml',
            ref: 'main',
          },
        },
      ])
    );
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe('plugins');
  });

  it('should route and rewrite matching crash paths', () => {
    const rules = parseRouterRules(
      JSON.stringify([
        {
          id: 'plugins',
          match_prefixes: ['Assets/Plugins/'],
          rewrite: {
            from_prefix: 'Assets/Plugins/',
            to_prefix: 'Assets/',
          },
          target: {
            repository: 'org/target-repo',
            workflow: 'ai-fix.yml',
            ref: 'main',
          },
        },
      ])
    );

    const decisions = routeCrashReport({
      crashReport,
      rules,
      mode: 'first-match',
      defaultTarget: null,
    });

    expect(decisions).toHaveLength(1);
    expect(decisions[0].ruleId).toBe('plugins');
    expect(decisions[0].matchedPaths).toEqual(
      expect.arrayContaining(['Assets/Plugins/Infrastructure/Scripts/Foo.cs'])
    );
    expect(decisions[0].transformedCrashReport.managed_exception?.stack_trace).toContain(
      'Assets/Infrastructure/Scripts/Foo.cs'
    );
  });

  it('should match Windows absolute paths in stack trace', () => {
    const windowsCrashReport: CrashReportData = {
      ...crashReport,
      managed_exception: {
        type: 'NullReferenceException',
        message: 'Object reference not set',
        stack_trace:
          'at Example.Foo() (at C:/workspace/project/Assets/Plugins/Infrastructure/Scripts/Foo.cs:12)\n' +
          'at Example.Bar() (at C:/workspace/project/Assets/App/Scripts/Bar.cs:34)',
      },
    };

    const rules = parseRouterRules(
      JSON.stringify([
        {
          id: 'plugins',
          match_prefixes: ['Assets/Plugins/'],
          rewrite: {
            from_prefix: 'Assets/Plugins/',
            to_prefix: 'Assets/',
          },
          target: {
            repository: 'org/target-repo',
            workflow: 'ai-fix.yml',
            ref: 'main',
          },
        },
      ])
    );

    const decisions = routeCrashReport({
      crashReport: windowsCrashReport,
      rules,
      mode: 'first-match',
      defaultTarget: null,
    });

    expect(decisions).toHaveLength(1);
    expect(decisions[0].matchedPaths).toEqual(
      expect.arrayContaining(['Assets/Plugins/Infrastructure/Scripts/Foo.cs'])
    );
    expect(decisions[0].transformedCrashReport.managed_exception?.stack_trace).toContain(
      'C:/workspace/project/Assets/Infrastructure/Scripts/Foo.cs'
    );
  });

  it('should apply default target when no rule matches', () => {
    const decisions = routeCrashReport({
      crashReport,
      rules: [],
      mode: 'first-match',
      defaultTarget: parseRouterDefaultTarget(
        JSON.stringify({
          repository: 'org/repo-a',
          workflow: 'ai-fix.yml',
          ref: 'main',
        })
      ),
    });

    expect(decisions).toHaveLength(1);
    expect(decisions[0].ruleId).toBe('default-target');
  });

  it('should fanout when multiple rules match', () => {
    const rules = parseRouterRules(
      JSON.stringify([
        {
          id: 'rule-a',
          match_prefixes: ['Assets/'],
          target: {
            repository: 'org/repo-a',
            workflow: 'ai-fix.yml',
            ref: 'main',
          },
        },
        {
          id: 'rule-b',
          match_prefixes: ['Assets/Plugins/'],
          target: {
            repository: 'org/repo-b',
            workflow: 'ai-fix.yml',
            ref: 'main',
          },
        },
      ])
    );

    const decisions = routeCrashReport({
      crashReport,
      rules,
      mode: 'fanout',
      defaultTarget: null,
    });

    expect(decisions).toHaveLength(2);
  });

  it('should match namespace-only rule on IL2CPP crash report with no file paths', () => {
    const il2cppCrashReport: CrashReportData = {
      report_id: 'rpt-il2cpp',
      crash_report_hash: 'hash-il2cpp',
      ts: 1771140000,
      name: 'app',
      version: '1.0.0',
      managed_exception: {
        type: 'ArgumentOutOfRangeException',
        message: 'Index was out of range',
        stack_trace:
          'Acme.Studio.Core.UI.PanelController.OnOpen () (at <00000000000000000000000000000000>:0)\n' +
          'Acme.Studio.Core.UI.PanelController.Open (System.Object data) (at <00000000000000000000000000000000>:0)\n' +
          'System.Collections.Generic.Dictionary`2[TKey,TValue].TryInsert (TKey key, TValue value) (at <00000000000000000000000000000000>:0)',
      },
    };

    const rules = parseRouterRules(
      JSON.stringify([
        {
          id: 'acme-ns',
          match_namespaces: ['Acme.'],
          target: {
            repository: 'org/target-repo',
            workflow: 'ai-fix.yml',
            ref: 'main',
          },
        },
      ])
    );

    const decisions = routeCrashReport({
      crashReport: il2cppCrashReport,
      rules,
      mode: 'first-match',
      defaultTarget: null,
    });

    expect(decisions).toHaveLength(1);
    expect(decisions[0].ruleId).toBe('acme-ns');
    expect(decisions[0].matchedNamespaces).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Acme.Studio'),
      ])
    );
    expect(decisions[0].matchedPaths).toEqual([]);
  });

  it('should match on namespace when rule has both match_prefixes and match_namespaces but paths are missing', () => {
    const il2cppCrashReport: CrashReportData = {
      report_id: 'rpt-both',
      crash_report_hash: 'hash-both',
      ts: 1771140000,
      name: 'app',
      version: '1.0.0',
      managed_exception: {
        type: 'NullReferenceException',
        message: 'Object reference not set',
        stack_trace:
          'Acme.Studio.Gameplay.PlayerManager.Update () (at <00000000000000000000000000000000>:0)',
      },
    };

    const rules = parseRouterRules(
      JSON.stringify([
        {
          id: 'combined-rule',
          match_prefixes: ['Assets/Plugins/'],
          match_namespaces: ['Acme.'],
          target: {
            repository: 'org/target-repo',
            workflow: 'ai-fix.yml',
            ref: 'main',
          },
        },
      ])
    );

    const decisions = routeCrashReport({
      crashReport: il2cppCrashReport,
      rules,
      mode: 'first-match',
      defaultTarget: null,
    });

    expect(decisions).toHaveLength(1);
    expect(decisions[0].ruleId).toBe('combined-rule');
    expect(decisions[0].matchedPaths).toEqual([]);
    expect(decisions[0].matchedNamespaces.length).toBeGreaterThan(0);
  });

  it('should parse rules with match_namespaces only (no match_prefixes)', () => {
    const rules = parseRouterRules(
      JSON.stringify([
        {
          id: 'ns-only',
          match_namespaces: ['Acme.', 'Contoso.'],
          target: {
            repository: 'org/repo',
            workflow: 'ai-fix.yml',
            ref: 'main',
          },
        },
      ])
    );

    expect(rules).toHaveLength(1);
    expect(rules[0].match_namespaces).toEqual(['Acme.', 'Contoso.']);
    expect(rules[0].match_prefixes).toBeUndefined();
  });

  it('should reject rules with neither match_prefixes nor match_namespaces', () => {
    expect(() =>
      parseRouterRules(
        JSON.stringify([
          {
            id: 'bad',
            target: {
              repository: 'org/repo',
              workflow: 'ai-fix.yml',
              ref: 'main',
            },
          },
        ])
      )
    ).toThrow('must have at least one of match_prefixes or match_namespaces');
  });
});
