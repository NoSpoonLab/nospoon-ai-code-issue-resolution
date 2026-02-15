import { CrashReportData, StackFrame } from '../types';

export interface RouterRewrite {
  from_prefix: string;
  to_prefix: string;
}

export interface RouterTarget {
  repository: string; // owner/repo
  workflow: string; // file name or workflow id
  ref: string;
  crash_report_input?: string; // default: crash_report
  dry_run_input?: string; // default: dry_run
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

export function parseRouterRules(json: string): RouterRule[] {
  if (!json.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid router_rules_json: ${message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('router_rules_json must be a JSON array');
  }

  const rules: RouterRule[] = [];
  parsed.forEach((entry, index) => {
    const rule = parseRule(entry, index);
    rules.push(rule);
  });
  return rules;
}

export function parseRouterDefaultTarget(json: string): RouterTarget | null {
  if (!json.trim()) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid router_default_target_json: ${message}`);
  }

  return parseTarget(parsed, 'router_default_target_json');
}

export function routeCrashReport(options: {
  crashReport: CrashReportData;
  rules: RouterRule[];
  mode: 'first-match' | 'fanout';
  defaultTarget?: RouterTarget | null;
}): RouteDecision[] {
  const paths = extractCrashPaths(options.crashReport);
  const namespaces = extractCrashNamespaces(options.crashReport);
  const matchedDecisions: RouteDecision[] = [];

  for (let i = 0; i < options.rules.length; i++) {
    const rule = options.rules[i];

    const matchedPaths: string[] = [];
    if (rule.match_prefixes && rule.match_prefixes.length > 0) {
      const normalizedPrefixes = rule.match_prefixes.map(normalizePrefix);
      matchedPaths.push(
        ...paths.filter((path) => normalizedPrefixes.some((prefix) => path.startsWith(prefix)))
      );
    }

    const matchedNamespaces: string[] = [];
    if (rule.match_namespaces && rule.match_namespaces.length > 0) {
      matchedNamespaces.push(
        ...namespaces.filter((ns) => rule.match_namespaces!.some((prefix) => ns.startsWith(prefix)))
      );
    }

    if (matchedPaths.length === 0 && matchedNamespaces.length === 0) continue;

    matchedDecisions.push({
      ruleId: rule.id || `rule-${i + 1}`,
      matchedPrefixes: rule.match_prefixes || [],
      matchedPaths,
      matchedNamespaces,
      target: rule.target,
      transformedCrashReport: rule.rewrite
        ? applyRewrite(options.crashReport, rule.rewrite)
        : cloneCrashReport(options.crashReport),
    });

    if (options.mode === 'first-match') {
      break;
    }
  }

  if (matchedDecisions.length > 0) return matchedDecisions;

  if (options.defaultTarget) {
    return [
      {
        ruleId: 'default-target',
        matchedPrefixes: [],
        matchedPaths: [],
        matchedNamespaces: [],
        target: options.defaultTarget,
        transformedCrashReport: cloneCrashReport(options.crashReport),
      },
    ];
  }

  return [];
}

export function parseRepository(repository: string): { owner: string; repo: string } {
  const value = repository.trim();
  const parts = value.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid target repository "${repository}". Expected "owner/repo"`);
  }
  return { owner: parts[0], repo: parts[1] };
}

function parseRule(value: unknown, index: number): RouterRule {
  if (!isObject(value)) {
    throw new Error(`router_rules_json[${index}] must be an object`);
  }

  let prefixes: string[] | undefined;
  if (value.match_prefixes != null) {
    const matchPrefixes = value.match_prefixes;
    if (!Array.isArray(matchPrefixes) || matchPrefixes.length === 0) {
      throw new Error(`router_rules_json[${index}].match_prefixes must be a non-empty array`);
    }
    prefixes = matchPrefixes.map((prefix, prefixIndex) => {
      if (typeof prefix !== 'string' || !prefix.trim()) {
        throw new Error(
          `router_rules_json[${index}].match_prefixes[${prefixIndex}] must be a non-empty string`
        );
      }
      return prefix;
    });
  }

  let matchNamespaces: string[] | undefined;
  if (value.match_namespaces != null) {
    const raw = value.match_namespaces;
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new Error(`router_rules_json[${index}].match_namespaces must be a non-empty array`);
    }
    matchNamespaces = raw.map((ns, nsIndex) => {
      if (typeof ns !== 'string' || !ns.trim()) {
        throw new Error(
          `router_rules_json[${index}].match_namespaces[${nsIndex}] must be a non-empty string`
        );
      }
      return ns;
    });
  }

  if (!prefixes && !matchNamespaces) {
    throw new Error(
      `router_rules_json[${index}] must have at least one of match_prefixes or match_namespaces`
    );
  }

  const target = parseTarget(value.target, `router_rules_json[${index}].target`);
  const rewrite = parseRewrite(value.rewrite, index);
  const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : undefined;

  return {
    id,
    match_prefixes: prefixes,
    match_namespaces: matchNamespaces,
    rewrite,
    target,
  };
}

function parseTarget(value: unknown, location: string): RouterTarget {
  if (!isObject(value)) {
    throw new Error(`${location} must be an object`);
  }
  if (typeof value.repository !== 'string' || !value.repository.trim()) {
    throw new Error(`${location}.repository must be a non-empty string`);
  }
  if (typeof value.workflow !== 'string' || !value.workflow.trim()) {
    throw new Error(`${location}.workflow must be a non-empty string`);
  }
  if (typeof value.ref !== 'string' || !value.ref.trim()) {
    throw new Error(`${location}.ref must be a non-empty string`);
  }

  const target: RouterTarget = {
    repository: value.repository.trim(),
    workflow: value.workflow.trim(),
    ref: value.ref.trim(),
  };

  if (typeof value.crash_report_input === 'string' && value.crash_report_input.trim()) {
    target.crash_report_input = value.crash_report_input.trim();
  }
  if (typeof value.dry_run_input === 'string' && value.dry_run_input.trim()) {
    target.dry_run_input = value.dry_run_input.trim();
  }
  if (isObject(value.extra_inputs)) {
    const normalized: Record<string, string> = {};
    for (const [key, rawValue] of Object.entries(value.extra_inputs)) {
      normalized[key] = String(rawValue);
    }
    target.extra_inputs = normalized;
  }

  return target;
}

function parseRewrite(value: unknown, index: number): RouterRewrite | undefined {
  if (value == null) return undefined;
  if (!isObject(value)) {
    throw new Error(`router_rules_json[${index}].rewrite must be an object`);
  }
  if (typeof value.from_prefix !== 'string' || !value.from_prefix.trim()) {
    throw new Error(`router_rules_json[${index}].rewrite.from_prefix must be a non-empty string`);
  }
  if (typeof value.to_prefix !== 'string') {
    throw new Error(`router_rules_json[${index}].rewrite.to_prefix must be a string`);
  }

  return {
    from_prefix: value.from_prefix,
    to_prefix: value.to_prefix,
  };
}

function extractCrashNamespaces(report: CrashReportData): string[] {
  const namespaces: string[] = [];

  if (report.managed_exception?.stack_trace) {
    namespaces.push(...extractNamespacesFromStackTrace(report.managed_exception.stack_trace));
  }

  if (report.managed_exception?.type) {
    namespaces.push(report.managed_exception.type);
  }

  collectFrameNamespaces(report.managed_exception?.native_thread_info?.frames, namespaces);

  if (report.native_crash?.threads) {
    for (const thread of report.native_crash.threads) {
      collectFrameNamespaces(thread.frames, namespaces);
    }
  }

  return [...new Set(namespaces)];
}

function extractNamespacesFromStackTrace(stackTrace: string): string[] {
  const namespaces: string[] = [];
  // Match fully qualified type names at the start of Unity stack trace lines.
  // Examples:
  //   Games.WeDrawGames.Base.BaseCommunityPanel.BaseCommunityPanelController.OnOpen ()
  //   System.Collections.Generic.Dictionary`2[TKey,TValue].TryInsert (...)
  const regex = /^([\w`]+(?:\.[\w`]+)+)\s*[[.(]/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(stackTrace)) !== null) {
    // Strip generic arity suffixes like `2 for cleaner matching
    namespaces.push(match[1].replace(/`\d+/g, ''));
  }
  return namespaces;
}

function collectFrameNamespaces(frames: StackFrame[] | undefined, namespaces: string[]): void {
  if (!frames) return;
  for (const frame of frames) {
    if (!frame.function_name) continue;
    // function_name may contain fully qualified names like "Games.Foo.Bar.Method"
    // Extract the qualified name portion (everything with dots before parentheses/space)
    const fnMatch = frame.function_name.match(/^([\w`]+(?:\.[\w`]+)+)/);
    if (fnMatch) {
      namespaces.push(fnMatch[1].replace(/`\d+/g, ''));
    }
  }
}

function extractCrashPaths(report: CrashReportData): string[] {
  const paths: string[] = [];

  if (report.managed_exception?.stack_trace) {
    const stackPaths = extractPathsFromStackTrace(report.managed_exception.stack_trace);
    paths.push(...stackPaths);
  }

  collectFramePaths(report.managed_exception?.native_thread_info?.frames, paths);

  if (report.native_crash?.threads) {
    for (const thread of report.native_crash.threads) {
      collectFramePaths(thread.frames, paths);
    }
  }

  return [...new Set(paths)];
}

function extractPathsFromStackTrace(stackTrace: string): string[] {
  const paths: string[] = [];
  // Support Unity stack traces in both relative and absolute Windows/Unix paths.
  // Examples:
  // - (at Assets/Foo/Bar.cs:12)
  // - (at C:/workspace/p/Assets/Foo/Bar.cs:12)
  const regex = /\(at (.+):\d+\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(stackTrace)) !== null) {
    const normalized = canonicalizePath(match[1]);
    if (normalized) paths.push(normalized);
  }
  return paths;
}

function collectFramePaths(frames: StackFrame[] | undefined, paths: string[]): void {
  if (!frames) return;
  for (const frame of frames) {
    if (!frame.file_name) continue;
    const normalized = canonicalizePath(frame.file_name);
    if (normalized) paths.push(normalized);
  }
}

function canonicalizePath(pathValue: string): string {
  const normalizedSlashes = pathValue.replace(/\\/g, '/').trim();
  const assetsIndex = normalizedSlashes.indexOf('Assets/');
  if (assetsIndex >= 0) {
    return normalizedSlashes.slice(assetsIndex);
  }
  return normalizedSlashes.replace(/^\.\//, '').replace(/^\/+/, '');
}

function normalizePrefix(prefix: string): string {
  const normalized = canonicalizePath(prefix).replace(/\/+$/, '');
  return normalized ? `${normalized}/` : '';
}

function applyRewrite(report: CrashReportData, rewrite: RouterRewrite): CrashReportData {
  const cloned = cloneCrashReport(report);
  const fromPrefix = rewrite.from_prefix.replace(/\\/g, '/');
  const toPrefix = rewrite.to_prefix.replace(/\\/g, '/');

  const replaceText = (value: string): string => {
    let result = value;
    // Rewrite slash variants to support both Windows and Unix traces.
    result = result.split(fromPrefix).join(toPrefix);
    result = result.split(fromPrefix.replace(/\//g, '\\')).join(toPrefix.replace(/\//g, '\\'));
    return result;
  };

  if (cloned.managed_exception?.stack_trace) {
    cloned.managed_exception.stack_trace = replaceText(cloned.managed_exception.stack_trace);
  }

  rewriteFrames(cloned.managed_exception?.native_thread_info?.frames, replaceText);
  if (cloned.native_crash?.threads) {
    for (const thread of cloned.native_crash.threads) {
      rewriteFrames(thread.frames, replaceText);
    }
  }

  return cloned;
}

function rewriteFrames(
  frames: StackFrame[] | undefined,
  replaceText: (value: string) => string
): void {
  if (!frames) return;
  for (const frame of frames) {
    if (!frame.file_name) continue;
    frame.file_name = replaceText(frame.file_name);
  }
}

function cloneCrashReport(report: CrashReportData): CrashReportData {
  return JSON.parse(JSON.stringify(report)) as CrashReportData;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
