# Implementation: AI Code Issue Resolution - GitHub Action

## Table of Contents

1. [Overview](#overview)
2. [Changelog](#changelog)
3. [Project Architecture](#project-architecture)
4. [Scaffold and Base Configuration](#scaffold-and-base-configuration)
5. [Input Layer](#input-layer)
6. [Claude Layer](#claude-layer)
7. [Git Layer](#git-layer)
8. [GitHub Layer](#github-layer)
9. [Utilities](#utilities)
10. [Main Orchestrator (main.ts)](#main-orchestrator-maints)
11. [Testing](#testing)
12. [Build and Distribution](#build-and-distribution)
13. [CI/CD](#cicd)
14. [Security](#security)
15. [Technical Decisions and Trade-offs](#technical-decisions-and-trade-offs)
16. [Usage](#usage)

---

## Changelog

### 2026-02-20

#### Fix: Remove duplicate Claude analysis section from PR body (`src/constants.ts`, `src/github/pull-request.ts`)

The `PR_BODY_TEMPLATE` included a `### Claude Analysis` section that appended the full raw Claude output after the structured sections (Root Cause, Solution, Changes Made, Test Plan). Since those sections are extracted directly from the raw analysis, the content was duplicated verbatim.

**Changes:**
- `src/constants.ts` — Removed `### Claude Analysis` and `{{analysis}}` from `PR_BODY_TEMPLATE`.
- `src/github/pull-request.ts` — Removed `.replace('{{analysis}}', options.analysis)` from `buildPRBody()`. The `analysis` field on `CreatePROptions` is retained as source for `extractMarkdownSection()`.

---

#### Feat: Support `crash_report_file` input for large payloads (`action.yml`, `src/main.ts`)

GitHub Actions inputs are passed as environment variables and are limited to ~65KB. Large payloads (e.g. 100 crash reports with full stack traces) exceed this limit and cause the action to fail.

**New input: `crash_report_file`** — Accepts a local path or a remote URL (`http`/`https`) to a JSON file containing crash report data. Takes priority over `crash_report` when both are provided.

Resolution priority in `getInputs()`:
1. `crash_report_file` is a URL → `fetch()` with HTTP status validation.
2. `crash_report_file` is a local path → `fs.readFileSync()`.
3. `crash_report_file` is empty, `crash_report` has a value → original inline behavior.
4. Both empty → `ActionError: Either crash_report or crash_report_file must be provided`.

**Changes:**
- `action.yml` — Added `crash_report_file` input (optional). Changed `crash_report` to `required: false`.
- `src/main.ts` — Imported `fs` and `path`. Made `getInputs()` async to support `await fetch()`. Added URL/path detection logic with descriptive errors. Updated `run()` to `await getInputs()`.

---

#### Feat: `fix_strategy` input to control Claude's fix scope (`action.yml`, `src/types.ts`, `src/main.ts`, `src/claude/prompt-builder.ts`)

Previously the prompt always instructed Claude to apply the smallest possible fix. Now callers can choose the fix scope.

**New input: `fix_strategy`** — Three values:

| Value | Default | Behavior |
|---|---|---|
| `minimal` | ✓ | Smallest targeted change to stop the crash. No surrounding refactoring. |
| `refactor` | | May reorganize the affected code if it improves correctness, safety, or maintainability. |
| `aggressive` | | Full freedom to improve code quality, fix latent issues nearby, restructure patterns, extract helpers. |

The strategy affects three parts of the prompt: the role intro sentence, instruction step 4 (how to fix), and instruction step 5 (which files to touch). Any value outside the three valid ones causes an immediate `ActionError` with a descriptive message.

**Changes:**
- `action.yml` — Added `fix_strategy` input with default `minimal`.
- `src/types.ts` — Added `FixStrategy = 'minimal' | 'refactor' | 'aggressive'` type and `fixStrategy: FixStrategy` to `ActionInputs`.
- `src/main.ts` — Added `parseFixStrategy()` helper. Reads `fix_strategy` input and passes it through `ActionInputs`. Passes `inputs.fixStrategy` to `buildPrompt()`.
- `src/claude/prompt-builder.ts` — Added `fixStrategy: FixStrategy = 'minimal'` parameter to `buildPrompt()`. Strategy-specific strings for intro, step 4, and step 5 using ternary chains.

---

## Overview

This project implements a **GitHub Action** that acts as an automated code issue resolution agent. The complete flow is:

1. Receives bug/issue data in JSON format
2. Uses **Claude Code CLI** to analyze the source code, understand the problem, and apply a fix
3. Creates a new branch with the changes
4. Opens a **Pull Request** for human review

The Action never performs automatic merges — it always requires human approval, following the "human-in-the-loop" principle.

### Technology Stack

| Technology | Purpose |
|------------|---------|
| TypeScript | Primary language |
| `@actions/core` | GitHub Actions logging, inputs/outputs |
| `@actions/exec` | Process execution (Claude CLI, git) |
| `@actions/github` | Pre-authenticated Octokit client |
| `@actions/io` | IO utilities (locate binaries in PATH) |
| `ajv` | JSON Schema validation |
| `@vercel/ncc` | Bundling into a single `dist/index.js` |
| `jest` + `ts-jest` | Testing framework |
| `eslint` | Linting |

---

## Project Architecture

```
nospoon-ai-code-issue-resolution/
├── action.yml                          # GitHub Action definition
├── package.json                        # Dependencies and scripts
├── tsconfig.json                       # TypeScript configuration
├── jest.config.js                      # Jest configuration
├── .eslintrc.json                      # ESLint configuration
├── .gitignore
├── dist/
│   └── index.js                        # Compiled bundle (committed to repo)
├── src/
│   ├── main.ts                         # Main orchestrator
│   ├── types.ts                        # TypeScript interfaces
│   ├── constants.ts                    # Default values and templates
│   ├── input/
│   │   ├── schema.ts                   # JSON Schema (ajv)
│   │   └── validator.ts               # Parsing and validation
│   ├── claude/
│   │   ├── installer.ts               # Install/verify Claude CLI
│   │   ├── prompt-builder.ts          # Build structured prompt
│   │   ├── runner.ts                  # Execute Claude CLI
│   │   └── output-parser.ts           # Parse JSON response
│   ├── git/
│   │   └── operations.ts             # Branch, commit, push, diff
│   ├── github/
│   │   └── pull-request.ts           # Create PR, labels, comments
│   └── utils/
│       ├── logger.ts                  # Logging wrapper
│       └── error-handler.ts           # Typed errors
├── __tests__/                          # 7 suites, 60 tests
│   ├── input/validator.test.ts
│   ├── claude/prompt-builder.test.ts
│   ├── claude/runner.test.ts
│   ├── claude/output-parser.test.ts
│   ├── git/operations.test.ts
│   ├── github/pull-request.test.ts
│   └── main.test.ts
└── .github/workflows/
    └── ci.yml                          # CI pipeline
```

### Flow Diagram

```
┌─────────────────┐
│  GitHub Action   │
│  Trigger Event   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│ 1. Parse and    │────►│ input/validator   │
│    Validate JSON│     │ input/schema      │
└────────┬────────┘     └──────────────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│ 2. Install      │────►│ claude/installer  │
│    Claude CLI   │     │                  │
└────────┬────────┘     └──────────────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│ 3. Create       │────►│ git/operations    │
│    branch       │     │                  │
└────────┬────────┘     └──────────────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│ 4. Build        │────►│ claude/           │
│    prompt       │     │  prompt-builder   │
└────────┬────────┘     └──────────────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│ 5. Execute      │────►│ claude/runner     │
│    Claude CLI   │     │ claude/output-    │
│                 │     │  parser           │
└────────┬────────┘     └──────────────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│ 6. Detect       │────►│ git/operations    │
│    changes      │     │  detectChanges()  │
└────────┬────────┘     └──────────────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│ 7. Commit +     │────►│ git/operations    │
│    Push         │     │  stageFiles()     │
│                 │     │  commitChanges()  │
│                 │     │  pushBranch()     │
└────────┬────────┘     └──────────────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│ 8. Create Pull  │────►│ github/           │
│    Request      │     │  pull-request     │
└─────────────────┘     └──────────────────┘
```

---

## Scaffold and Base Configuration

### `package.json`

Defines project dependencies split into two groups:

**Production dependencies** (included in the bundle):
- `@actions/core` (v1.10.1) — Main GitHub Actions API: read inputs, write outputs, logging, mark secrets
- `@actions/exec` (v1.1.1) — Safely execute child processes with stdout/stderr capture
- `@actions/github` (v6.0.0) — Pre-authenticated Octokit client for the GitHub API
- `@actions/io` (v1.1.3) — IO utilities like `which` to locate binaries in PATH
- `ajv` (v8.17.1) — JSON Schema validator, the fastest available for Node.js

**Development dependencies**:
- `typescript` (v5.4.5) — TypeScript compiler
- `@vercel/ncc` (v0.38.1) — Bundles the entire project + node_modules into a single JS file
- `jest` (v29.7.0) + `ts-jest` (v29.1.4) — Testing framework with native TypeScript support
- `eslint` (v8.57.0) + TypeScript plugins — Linting

**Defined scripts**:
```json
{
  "build": "ncc build src/main.ts -o dist --source-map --license licenses.txt",
  "test": "jest --coverage",
  "lint": "eslint src/ __tests__/",
  "typecheck": "tsc --noEmit",
  "all": "npm run lint && npm run typecheck && npm test && npm run build"
}
```

### `tsconfig.json`

TypeScript configuration targeting Node.js 20 (the GitHub Actions runtime):

- **target: ES2020** — Enables native `Promise.allSettled`, optional chaining, nullish coalescing
- **module: commonjs** — Required by `@vercel/ncc` for bundling
- **strict: true** — Enables all strict checks (strictNullChecks, noImplicitAny, etc.)
- **esModuleInterop: true** — Allows `import * as core from '@actions/core'` without issues
- **rootDir: ./src** — Only compiles files in `src/`
- **exclude: ["__tests__"]** — Tests are not compiled to output (executed via ts-jest)

### `action.yml`

Defines the GitHub Action with metadata, inputs, and outputs:

**10 inputs:**

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `issue_data` | Yes | — | JSON string with issue data |
| `anthropic_api_key` | Yes | — | Anthropic API key (gets masked) |
| `github_token` | No | `github.token` | Token for creating PRs |
| `base_branch` | No | repo default branch | Base branch for the PR |
| `branch_prefix` | No | `fix/claude-` | Branch name prefix |
| `max_turns` | No | `20` | Maximum Claude turns |
| `allowed_tools` | No | `Read,Edit,Bash,Grep,Glob` | Allowed tools |
| `pr_labels` | No | `ai-fix,auto-generated` | PR labels |
| `dry_run` | No | `false` | Analyze only, don't create PR |

**6 outputs:**

| Output | Description |
|--------|-------------|
| `pr_url` | URL of the created Pull Request |
| `pr_number` | PR number |
| `branch_name` | Name of the created branch |
| `claude_analysis` | Claude's analysis summary |
| `files_changed` | Comma-separated list of changed files |
| `cost_usd` | Cost of the Claude API call in USD |

**Runtime**: `node20` — The Action runs directly on Node.js 20, without Docker, making it compatible with Ubuntu, macOS, and Windows.

### `src/types.ts`

Defines all TypeScript interfaces for the project:

```typescript
// Individual file within the issue
interface IssueFile {
  path: string;
  line_start?: number;
  line_end?: number;
}

// Complete issue data (what the Action receives)
interface IssueData {
  title: string;
  description: string;
  error_message?: string;
  files: IssueFile[];          // Minimum 1 file
  stack_trace?: string;
  severity?: 'critical' | 'high' | 'medium' | 'low';
  language?: string;
  additional_context?: string;
  labels?: string[];
  source_issue_number?: number;  // To link with source issue
}

// Processed Action inputs
interface ActionInputs {
  issueData: IssueData;
  anthropicApiKey: string;
  githubToken: string;
  baseBranch: string;
  branchPrefix: string;
  maxTurns: number;
  allowedTools: string[];
  prLabels: string[];
  dryRun: boolean;
}

// Claude Code CLI JSON response
interface ClaudeOutput {
  result: string;
  session_id: string;
  cost_usd: number;
  is_error: boolean;
  total_tokens_in: number;
  total_tokens_out: number;
}

// git diff result
interface GitDiffResult {
  modifiedFiles: string[];
  newFiles: string[];
  hasChanges: boolean;
}

// PR creation result
interface PullRequestResult {
  url: string;
  number: number;
  branch: string;
}
```

### `src/constants.ts`

Centralizes all default values and templates:

- **DEFAULTS** — Object with default values for branch prefix, max turns, allowed tools, PR labels
- **CLAUDE_CLI_PACKAGE** — `'@anthropic-ai/claude-code'` — The npm package for Claude CLI (deprecated, kept for reference)
- **CLAUDE_INSTALL_URL_UNIX** — `'https://claude.ai/install.sh'` — Native installer script for Linux/macOS
- **CLAUDE_INSTALL_URL_WINDOWS** — `'https://claude.ai/install.cmd'` — Native installer script for Windows
- **BRANCH_NAME_MAX_LENGTH** — 100 characters maximum for branch names
- **COMMIT_MESSAGE_PREFIX** — `'fix: '` — Follows Conventional Commits
- **PR_BODY_TEMPLATE** — PR body template with placeholders `{{title}}`, `{{analysis}}`, `{{files}}`, etc.

The PR template is defined as an array of strings joined with `\n` instead of a template literal, because the `${{cost}}` syntax in TypeScript template literals is interpreted as variable interpolation and causes compilation errors.

---

## Input Layer

### `src/input/schema.ts`

Defines the JSON Schema using ajv's strict typing (`JSONSchemaType<IssueData>`). This guarantees that the schema and TypeScript interface are synchronized at compile time.

Validation rules:
- `title`: string, minimum 1 character (cannot be empty)
- `description`: string, minimum 1 character
- `files`: array with minimum 1 element
  - Each file: `path` (string, required, non-empty), `line_start` and `line_end` (optional integers, >= 1)
- `severity`: enum restricted to `'critical' | 'high' | 'medium' | 'low'`
- `source_issue_number`: integer >= 1
- **`additionalProperties: false`** at all levels — Rejects unknown properties to prevent unexpected data

### `src/input/validator.ts`

Function `parseAndValidateIssueData(jsonString: string): IssueData`:

1. **JSON parsing** — Attempts `JSON.parse()`. On failure, throws error with descriptive message "Invalid JSON: ..."
2. **Schema validation** — Uses the compiled ajv instance. On failure, concatenates all validation errors with their paths (e.g., `/files must NOT have fewer than 1 items`)
3. **Typed return** — If validation passes, ajv guarantees the type is `IssueData` (type narrowing)

The ajv compiler is instantiated once at module level (`const validate = ajv.compile(schema)`) to reuse the compiled function on each invocation.

### Tests: `__tests__/input/validator.test.ts` (12 tests)

| Test | What it verifies |
|------|-----------------|
| Valid issue data with all fields | Correct parsing and complete return |
| Minimal valid issue data | Only title + description + files works |
| Invalid JSON | Throws "Invalid JSON" |
| Missing title | Validation fails |
| Missing description | Validation fails |
| Empty files array | Validation fails (minItems: 1) |
| Missing files | Validation fails |
| Empty title | Validation fails (minLength: 1) |
| Invalid severity | Validation fails (enum) |
| Additional properties | Validation fails (additionalProperties: false) |
| Empty file path | Validation fails (minLength: 1) |
| Negative line numbers | Validation fails (minimum: 1) |

---

## Claude Layer

### `src/claude/installer.ts`

Function `ensureClaudeCli(): Promise<string>`:

1. Searches for `claude` in PATH using `io.which('claude', true)`
2. If not in PATH, checks the native install location (`~/.local/bin/claude`)
3. If found, adds `~/.local/bin` to PATH via `core.addPath()` and returns the path
4. If not found, runs the official native installer:
   - **Linux/macOS:** `curl -fsSL https://claude.ai/install.sh | bash`
   - **Windows:** Downloads and executes `https://claude.ai/install.cmd`
5. After installation, adds `~/.local/bin` to PATH
6. Searches again to confirm installation; throws error if still not found

> **Note:** The npm installation method (`npm install -g @anthropic-ai/claude-code`) is deprecated per [Claude Code official docs](https://code.claude.com/docs/en/setup). The native installer is recommended as it includes automatic updates.

The `findClaudeCli()` function wraps `io.which` in a try/catch because it throws an exception when the binary is not found (instead of returning null). It also checks the expected native install location (`~/.local/bin/claude`) as a fallback.

### `src/claude/prompt-builder.ts`

Function `buildPrompt(issue: IssueData): string`:

Builds a structured Markdown prompt with the following sections:

1. **Role and objective** — "You are an expert software engineer tasked with fixing a code issue."
2. **Issue title** — `## Issue: {title}`
3. **Description** — The full issue text
4. **Error message** (conditional) — In code block
5. **Stack trace** (conditional) — In code block
6. **Affected files** — List with paths and line ranges (e.g., `` `src/file.ts` (lines 42-55) ``)
7. **Language/Framework** (conditional)
8. **Severity** (conditional)
9. **Additional context** (conditional)
10. **Explicit instructions** — 6 rules:
    - Read and analyze the files
    - Identify the root cause
    - Apply a minimal, targeted fix
    - Only modify necessary files
    - Follow existing code style
    - Don't add unnecessary comments/docstrings/refactoring

Optional sections (error_message, stack_trace, severity, etc.) are only included if they have values, to avoid polluting the prompt with empty sections.

### `src/claude/runner.ts`

Function `runClaude(options: ClaudeRunnerOptions): Promise<ClaudeOutput>`:

Executes Claude Code CLI in headless mode with these arguments:
```bash
claude -p "<prompt>" --output-format stream-json --max-turns 100 --allowedTools "Read,Edit,Bash,Grep,Glob" --tools "Read,Edit,Bash,Grep,Glob" --permission-mode plan --betas interleaved-thinking --effort high --model claude-opus-4-6 --verbose
```

Execution details:
- **`-p`** - Non-interactive mode (pipe mode). Claude receives the full prompt and works without human interaction
- **`--output-format stream-json`** - Response is a stream of JSON events; the final `result` event contains `result`, `session_id`, `cost_usd`, `is_error`, tokens
- **`--allowedTools`** - Pre-approves tools without requiring interactive confirmation
- **`--tools`** - Limits the available tools to the allowed list
- **`--permission-mode plan`** - Starts in plan mode (analysis only) for safer, more deliberate reasoning
- **`--betas`** - Optional beta flags such as `interleaved-thinking`
- **`--effort`** - Requests more deliberate reasoning (low, medium, high)
- **`--model`** - Forces a specific model (e.g., `sonnet` or full model name). Default: `claude-opus-4-6`
- **`--verbose`** - Enables richer event output from Claude CLI
- **`ANTHROPIC_API_KEY`** - Passed as environment variable (never as CLI argument)
- **`silent: true`** - Suppresses output in GitHub Actions logs
- **`ignoreReturnCode: true`** - Allows capturing output even if exit code is non-zero
- **stdout/stderr** - Captured via listeners for later processing
- **Heartbeat logging** - If no output is seen for 60s, logs a "Still running" line (configurable)
- **Raw line logging** - Optional env flag to log each raw stream line for debugging
- **Partial streaming** - Optional env flag to include partial message chunks in stream-json
- **Prompt via stdin** - If enabled, uses --print and pipes the prompt on stdin to avoid command-line length limits

Error handling:
- If exit code != 0 AND no stdout -> Execution error
- If the JSON response has `is_error: true` -> Error reported by Claude (e.g., rate limit)
- If everything is fine -> Logs cost and tokens, returns `ClaudeOutput`

Debug env vars:
- `CLAUDE_HEARTBEAT_MS` - Overrides heartbeat interval (default 60000)
- `CLAUDE_LOG_RAW` - If truthy (`1`, `true`, `yes`, `on`), logs each raw stream line (truncated)
- `CLAUDE_PERMISSION_MODE` - Overrides permission mode (default plan)
- `CLAUDE_AUTO_APPLY_PLAN` - If `true`, runs once in plan mode then re-runs with permission mode `dontAsk` to apply changes
- `CLAUDE_BETAS` - Comma-separated beta flags passed to --betas
- `CLAUDE_EFFORT` - Overrides effort (low, medium, high)
- `CLAUDE_MODEL` - Overrides model (alias like `sonnet` or full model name). Default: `claude-opus-4-6`
- `CLAUDE_INCLUDE_PARTIALS` - If truthy, adds --include-partial-messages
- `CLAUDE_PROMPT_STDIN` - If truthy, forces prompt to be sent over stdin
- `CLAUDE_LOG_RAW` - If truthy (`1`, `true`, `yes`, `on`), logs each raw stream line (truncated)
- `CLAUDE_PERMISSION_MODE` - Overrides permission mode (default plan)
- `CLAUDE_BETAS` - Comma-separated beta flags passed to --betas
- `CLAUDE_EFFORT` - Overrides effort (low, medium, high)
- `CLAUDE_MODEL` - Overrides model (alias like `sonnet` or full model name). Default: `claude-opus-4-6`
- `CLAUDE_INCLUDE_PARTIALS` - If truthy, adds --include-partial-messages
- `CLAUDE_PROMPT_STDIN` - If truthy, forces prompt to be sent over stdin
- `CLAUDE_LOG_RAW` - If truthy (`1`, `true`, `yes`, `on`), logs each raw stream line (truncated)
- `CLAUDE_PERMISSION_MODE` - Overrides permission mode (default dontAsk)
- `CLAUDE_BETAS` - Comma-separated beta flags passed to --betas
- `CLAUDE_EFFORT` - Overrides effort (low, medium, high)
- `CLAUDE_MODEL` - Overrides model (alias like `sonnet` or full model name). Default: `claude-opus-4-6`
- `CLAUDE_INCLUDE_PARTIALS` - If truthy, adds --include-partial-messages
- `CLAUDE_PROMPT_STDIN` - If truthy, forces prompt to be sent over stdin
- `CLAUDE_LOG_RAW` - If truthy (`1`, `true`, `yes`, `on`), logs each raw stream line (truncated)
- `CLAUDE_PERMISSION_MODE` - Overrides permission mode (default dontAsk)
- `CLAUDE_BETAS` - Comma-separated beta flags passed to --betas
- `CLAUDE_EFFORT` - Overrides effort (low, medium, high)
- `CLAUDE_MODEL` - Overrides model (alias like `sonnet` or full model name). Default: `claude-opus-4-6`
- `CLAUDE_INCLUDE_PARTIALS` - If truthy, adds --include-partial-messages
- `CLAUDE_PROMPT_STDIN` - If truthy, forces prompt to be sent over stdin
- `CLAUDE_LOG_RAW` - If truthy (`1`, `true`, `yes`, `on`), logs each raw stream line (truncated)
- `CLAUDE_PERMISSION_MODE` - Overrides permission mode (default dontAsk)
- `CLAUDE_BETAS` - Comma-separated beta flags passed to --betas
- `CLAUDE_EFFORT` - Overrides effort (low, medium, high)
- `CLAUDE_MODEL` - Overrides model (alias like `sonnet` or full model name)
- `CLAUDE_INCLUDE_PARTIALS` - If truthy, adds --include-partial-messages
- `CLAUDE_PROMPT_STDIN` - If truthy, forces prompt to be sent over stdin
- `CLAUDE_LOG_RAW` - If truthy (`1`, `true`, `yes`, `on`), logs each raw stream line (truncated)
- `CLAUDE_PERMISSION_MODE` - Overrides permission mode (default dontAsk)
- `CLAUDE_BETAS` - Comma-separated beta flags passed to --betas
- `CLAUDE_EFFORT` - Overrides effort (low, medium, high)
- `CLAUDE_INCLUDE_PARTIALS` - If truthy, adds --include-partial-messages
- `CLAUDE_PROMPT_STDIN` - If truthy, forces prompt to be sent over stdin
- `CLAUDE_HEARTBEAT_MS` - Overrides heartbeat interval (default 60000)
- `CLAUDE_LOG_RAW` - If truthy (`1`, `true`, `yes`, `on`), logs each raw stream line (truncated)
- `CLAUDE_PERMISSION_MODE` - Overrides permission mode (default dontAsk)
- `CLAUDE_EFFORT` - Overrides effort (low, medium, high)
- `CLAUDE_INCLUDE_PARTIALS` - If truthy, adds --include-partial-messages
- `CLAUDE_PROMPT_STDIN` - If truthy, forces prompt to be sent over stdin
- `CLAUDE_HEARTBEAT_MS` - Overrides heartbeat interval (default 60000)
- `CLAUDE_LOG_RAW` - If truthy (`1`, `true`, `yes`, `on`), logs each raw stream line (truncated)
- `CLAUDE_PERMISSION_MODE` - Overrides permission mode (default dontAsk)
- `CLAUDE_INCLUDE_PARTIALS` - If truthy, adds --include-partial-messages
- `CLAUDE_PROMPT_STDIN` - If truthy, forces prompt to be sent over stdin
- `CLAUDE_HEARTBEAT_MS` - Overrides heartbeat interval (default 60000)
- `CLAUDE_LOG_RAW` - If truthy (`1`, `true`, `yes`, `on`), logs each raw stream line (truncated)
- `CLAUDE_PERMISSION_MODE` - Overrides permission mode (default dontAsk)
- `CLAUDE_INCLUDE_PARTIALS` - If truthy, adds --include-partial-messages

### `src/claude/output-parser.ts`

Function `parseClaudeOutput(rawOutput: string): ClaudeOutput`:

Parses Claude CLI's JSON response with defensive validation:

1. **Trim** — Removes whitespace
2. **Empty check** — If empty, throws "no output" error
3. **JSON.parse** — On failure, throws error with preview of first 200 characters
4. **Type check** — Must be an object (not null, not array, not primitive). The `Array.isArray(parsed)` check was added because `typeof [] === 'object'` in JavaScript
5. **Required field** — `result` must be a string
6. **Optional fields** — `session_id`, `cost_usd`, `is_error`, tokens are extracted with defaults if missing

### Claude Layer Tests (16 tests across 3 suites)

**prompt-builder.test.ts (11 tests):**
- Verifies inclusion of each section (title, description, error, stack trace, files, severity, language, context, instructions)
- Verifies line format (e.g., `lines 42-55` vs `line 10`)
- Verifies optional sections don't appear with minimal data

**runner.test.ts (5 tests):**
- Correct arguments passed to CLI
- ANTHROPIC_API_KEY in the environment
- Correct parsing of successful output
- Error on non-zero exit code without output
- Error when Claude reports is_error

**output-parser.test.ts (7 tests):**
- Correct parsing of valid JSON
- Defaults for missing optional fields
- Error on empty output
- Error on non-JSON
- Error on non-object (string, array)
- Error on missing `result` field
- Whitespace handling

---

## Git Layer

### `src/git/operations.ts`

Contains all necessary Git operations:

**`sanitizeBranchName(prefix, title): string`**
- Converts the title to lowercase
- Replaces non-alphanumeric characters with hyphens
- Collapses multiple hyphens
- Removes leading and trailing hyphens
- Appends timestamp (milliseconds) as suffix for uniqueness
- Truncates if exceeding `BRANCH_NAME_MAX_LENGTH` (100 chars)
- Example: `"Login Button: not responding!"` → `fix/claude-login-button-not-responding-1707849600000`

**`createBranch(branchName): Promise<void>`**
- Executes `git checkout -b <branchName>`

**`detectChanges(): Promise<GitDiffResult>`**
- Executes 3 commands in sequence:
  - `git diff --name-only` — Modified files (unstaged)
  - `git diff --cached --name-only` — Modified files (staged)
  - `git ls-files --others --exclude-standard` — New files (untracked)
- Deduplicates with `Set` and returns `{ modifiedFiles, newFiles, hasChanges }`

**`stageFiles(files): Promise<void>`**
- Runs `git add <file>` individually for each file
- **Does not use `git add -A`** for security — prevents accidentally including sensitive files

**`commitChanges(title): Promise<void>`**
- Executes `git commit -m "fix: <title>"` (Conventional Commits prefix)

**`pushBranch(branchName): Promise<void>`**
- Executes `git push origin <branchName>`

**`configureGitUser(): Promise<void>`**
- Configures git user as `github-actions[bot]` — The standard bot for automated commits in GitHub Actions

### Tests: `__tests__/git/operations.test.ts` (12 tests)

**sanitizeBranchName (4 tests):**
- Valid name from normal title
- Special character removal
- Long name truncation
- Empty title handling

**git operations (8 tests):**
- createBranch calls git checkout -b
- detectChanges with modified and new files
- detectChanges with no changes
- stageFiles runs git add per file
- stageFiles does nothing with empty list
- commitChanges with prefixed message
- pushBranch to origin
- configureGitUser with bot name and email

---

## GitHub Layer

### `src/github/pull-request.ts`

Function `createPullRequest(options: CreatePROptions): Promise<PullRequestResult>`:

1. **Gets Octokit client** — `github.getOctokit(token)` — Pre-authenticated with the provided token
2. **Extracts owner/repo** — From `github.context.repo` (automatically injected by GitHub Actions)
3. **Creates the PR** — `octokit.rest.pulls.create()` with:
   - Title: `fix: <issue title>`
   - Body: Rendered template with analysis, files, cost, severity
   - Head: fix branch
   - Base: base branch (main, develop, etc.)
4. **Adds labels** — Combines Action labels with issue labels (deduplicated). If it fails (e.g., label doesn't exist), only logs a warning without aborting
5. **Comments on source issue** (if exists) — Creates a comment linking the PR: "An automated fix has been proposed in PR #42". If it fails, only warning
6. **Returns** — URL, number, and branch name

**`buildPRBody(options): string`** (internal function)
- Renders the template by replacing placeholders:
  - `{{title}}` → Issue title
  - `{{analysis}}` → Claude's analysis (textual result)
  - `{{changes}}` → Same analysis (Claude describes what it did)
  - `{{files}}` → File list in Markdown format (`` - `path` ``)
  - `{{cost}}` → Cost formatted to 4 decimal places
  - `{{severity}}` → Severity or "unspecified"
  - `{{sourceIssue}}` → Link to source issue if exists

**`mergeLabels(prLabels, issueLabels): string[]`** (internal function)
- Combines Action labels with issue labels without duplicates

### Tests: `__tests__/github/pull-request.test.ts` (7 tests)

| Test | What it verifies |
|------|-----------------|
| PR with correct title and body | Prefixed title, correct owner/repo |
| Labels including issue labels | Merge without duplicates |
| Comment on source issue | PR link in the comment |
| No source issue | Doesn't attempt to comment |
| Cost and severity in body | Correct format in the PR |
| Files listed in body | Markdown format |
| Graceful label failure | Doesn't abort if addLabels fails |

---

## Utilities

### `src/utils/logger.ts`

Thin wrapper over `@actions/core` with 5 methods:

- `info(message)` → `core.info()` — Informational messages (always visible)
- `debug(message)` → `core.debug()` — Only visible if `ACTIONS_STEP_DEBUG=true`
- `warning(message)` → `core.warning()` — Warning annotation in the UI
- `error(message)` → `core.error()` — Error annotation in the UI
- `group(name, fn)` → `core.group()` — Groups output in collapsible sections

The wrapper enables:
1. Changing the logging implementation without modifying the rest of the code
2. Easy mocking in tests (only `@actions/core` needs to be mocked)

### `src/utils/error-handler.ts`

**`ActionError`** — Custom error class extending `Error`:
- `step: string` — Which step failed (e.g., "input-validation", "claude-execution")
- `cause?: Error` — Original error that caused the failure

**`handleError(error: unknown): never`**
- If `ActionError` → Logs step and message, marks the Action as failed
- If `Error` → Logs and marks as failed
- If other type → Converts to string, logs and marks as failed
- Always terminates with `process.exit(1)`

---

## Main Orchestrator (main.ts)

### `getInputs(): ActionInputs`

Reads and processes all Action inputs:

1. **Reads raw inputs** via `core.getInput()` with fallbacks to DEFAULTS
2. **Masks API key** — `core.setSecret(anthropicApiKey)` — GitHub Actions replaces the key with `***` in all logs
3. **Validates issue_data** — Calls `parseAndValidateIssueData()`
4. **Parses max_turns** — Converts to integer, validates it's positive
5. **Array splitting** — `allowed_tools` and `pr_labels` are split by comma and trimmed

### `run(): Promise<void>`

Orchestrates the 8-step flow:

**Step 1: Parse inputs**
```
logger.info → getInputs() → logger.info with summary
```

**Step 2: Install Claude CLI**
```
logger.group('Install Claude CLI') → ensureClaudeCli()
```
Grouped in a collapsible section in the logs.

**Step 3: Git setup and branch creation**
```
sanitizeBranchName() → logger.group('Setup git') → configureGitUser() + createBranch()
```

**Step 4: Build prompt**
```
buildPrompt(issueData) → logger.debug with length
```

**Step 5: Execute Claude CLI**
```
logger.group('Run Claude Code') → runClaude({...})
```
Claude works in the runner's current directory, with the allowed tools.

**Step 6: Detect changes**
```
detectChanges() → check hasChanges
```
If there are no changes, sets partial outputs and returns early (Claude analyzed but found nothing to change).

**Step 7: Commit and push** (skipped in dry_run)
```
logger.group('Commit and push') → stageFiles() + commitChanges() + pushBranch()
```

**Step 8: Create Pull Request** (skipped in dry_run)
```
getDefaultBranch() if not specified → logger.group('Create Pull Request') → createPullRequest()
```

**Final outputs:**
- `pr_url`, `pr_number`, `branch_name`, `claude_analysis`, `files_changed`, `cost_usd`

### `getDefaultBranch(): Promise<string>`

If `base_branch` is not specified:
- Executes `git rev-parse --abbrev-ref origin/HEAD`
- Parses the result removing `origin/`
- Falls back to `'main'` on failure

### Auto-execution

```typescript
if (!process.env.JEST_WORKER_ID) {
  run().catch(handleError);
}
```

The `JEST_WORKER_ID` condition prevents the module from auto-executing during tests. In production (GitHub Actions), `JEST_WORKER_ID` doesn't exist, so `run()` executes immediately when the module loads.

---

## Testing

### Strategy

- **Unit tests** for each individual module with mocked dependencies
- **Integration test** for `main.ts` that verifies the complete flow
- All `@actions/*` and `@actions/exec` modules are mocked to avoid depending on the GitHub Actions environment
- `clearMocks: true` in jest.config.js for automatic cleanup between tests

### Coverage Summary

```
File                | % Stmts | % Branch | % Funcs | % Lines
--------------------|---------|----------|---------|--------
All files           |   86.25 |    78.94 |    87.5 |   86.12
 constants.ts       |     100 |      100 |     100 |     100
 installer.ts       |      50 |    33.33 |   66.66 |      50  ← Requires real CLI
 output-parser.ts   |     100 |      100 |     100 |     100
 prompt-builder.ts  |     100 |      100 |     100 |     100
 runner.ts          |     100 |      100 |     100 |     100
 operations.ts      |     100 |      100 |     100 |     100
 pull-request.ts    |   96.87 |    66.66 |     100 |   96.77
 schema.ts          |     100 |      100 |     100 |     100
 validator.ts       |     100 |       80 |     100 |     100
 error-handler.ts   |      20 |        0 |       0 |      20  ← Tested via integration
 logger.ts          |   85.71 |      100 |      80 |   85.71
```

**60 tests across 7 suites**, all passing.

Areas with lower coverage:
- `installer.ts` — The `findClaudeCli` and `installClaudeCli` functions require a real environment with npm global
- `error-handler.ts` — `handleError` calls `process.exit(1)`, which is difficult to test directly without special matchers

### Integration Tests (`main.test.ts`)

6 tests that verify the complete `run()` flow:

1. **API key as secret** — Verifies `core.setSecret` is called with the key
2. **PR outputs** — Verifies `core.setOutput` is called with pr_url, pr_number, cost_usd, files_changed
3. **Dry run** — Verifies PR is not created, only partial outputs are set
4. **No changes** — Verifies that if Claude changes nothing, files_changed is empty and no PR is created
5. **Invalid JSON** — Verifies "Invalid JSON" error is thrown
6. **Missing required fields** — Verifies "validation failed" error is thrown

---

## Build and Distribution

### `@vercel/ncc`

The `npm run build` command executes:
```bash
ncc build src/main.ts -o dist --source-map --license licenses.txt
```

This generates:
- `dist/index.js` — Single bundle (~1.3MB) with all code + dependencies
- `dist/index.js.map` — Source map for debugging
- `dist/licenses.txt` — Licenses for all included dependencies

**Why bundle?** GitHub Actions requires code to be ready to execute. The options are:
1. Commit `node_modules/` (thousands of files) — Bad
2. Use Docker — Slower, Linux only
3. **Bundle with ncc** — Single file, fast, cross-platform ✓

The `dist/` directory **is committed to the repository**. This is standard practice for JavaScript Actions (this is what `actions/checkout`, `actions/setup-node`, and Anthropic's own `claude-code-action` do).

---

## CI/CD

### `.github/workflows/ci.yml`

Pipeline that runs on:
- Push to `main`
- Pull Requests to `main`

**Steps:**

1. **Checkout** — `actions/checkout@v4`
2. **Setup Node.js 20** — With npm cache for faster runs
3. **Install** — `npm ci` (clean install from lockfile)
4. **Lint** — `npm run lint` — ESLint on src/ and __tests__/
5. **Type check** — `npm run typecheck` — TypeScript without emitting
6. **Test** — `npm test` — Jest with coverage
7. **Build** — `npm run build` — Generates dist/
8. **Verify dist/ is up to date** — If `git diff --name-only dist/` shows changes, fails with error indicating build and commit are needed

The last step is crucial: it prevents someone from modifying source code without regenerating the bundle.

---

## Security

### Implemented Measures

1. **API key masking** — `core.setSecret(anthropicApiKey)` guarantees the key never appears in logs, even if an error accidentally includes it

2. **Individual file staging** — `git add <file>` for each file instead of `git add -A` or `git add .`. This prevents accidentally including sensitive files like `.env`, credentials, or large binaries

3. **Restricted Claude tools** — Via `--allowedTools`, Claude can only use explicitly allowed tools (default: Read, Edit, Bash, Grep, Glob). It cannot access network tools or arbitrary execution beyond these

4. **Separate branch** — Changes always go to a new branch (`fix/claude-*`), never directly to the base branch

5. **No automatic merge** — The PR requires human review and approval

6. **Strictly validated JSON** — Schema with `additionalProperties: false` at all levels. Unknown fields that could be injection vectors are rejected

7. **Minimal permissions** — The CI workflow uses `permissions: contents: read`

---

## Technical Decisions and Trade-offs

### 1. TypeScript over Python

**Decision:** TypeScript compiled with ncc.

**Reasons:**
- GitHub Actions has an official toolkit in JS/TS (`@actions/core`, `@actions/github`, `@actions/exec`)
- Distribution as a JavaScript Action (no Docker needed)
- Works on Ubuntu, macOS, and Windows
- Pre-authenticated Octokit via `@actions/github`
- Anthropic's own `claude-code-action` uses TypeScript
- Python would require Docker (slower, Linux only)

### 2. ajv over manual validation

**Decision:** JSON Schema validated with ajv.

**Reasons:**
- Declarative schema — Reads like documentation
- Descriptive error messages with paths (e.g., `/files/0/path must NOT have fewer than 1 characters`)
- `allErrors: true` — Reports all errors, not just the first one
- Automatic type narrowing with `JSONSchemaType<T>`
- One-time compilation, fast validation on each invocation

### 3. PR template as string array

**Decision:** `PR_BODY_TEMPLATE` defined as `[...].join('\n')` instead of a template literal.

**Reason:** The `${{cost}}` syntax in TypeScript template literals is interpreted as `${...}` (interpolation), causing compilation error `TS18004: No value exists in scope for the shorthand property 'cost'`.

### 4. `JEST_WORKER_ID` guard in main.ts

**Decision:** Condition auto-execution with `!process.env.JEST_WORKER_ID`.

**Reason:** `main.ts` has `run().catch(handleError)` at the end of the module. Without the guard, importing the module in tests (even with mocks) would immediately execute `run()`, causing `process.exit(1)` if inputs aren't configured. `JEST_WORKER_ID` is an environment variable that Jest always defines in its workers.

### 5. `ignoreReturnCode: true` for Claude CLI

**Decision:** Don't fail immediately if Claude CLI returns a non-zero exit code.

**Reason:** Claude can produce useful output (partial analysis, detailed error message) even with a non-zero exit code. The `is_error` field in the JSON is checked instead.

### 6. Exporting `run()` from main.ts

**Decision:** `run()` is `export async function` instead of a private function.

**Reason:** Allows testing the flow directly by calling `await run()` in integration tests, instead of relying on `jest.isolateModulesAsync` which creates isolated module registries where `beforeEach` mocks aren't shared.

---

## Usage

### Basic usage with workflow_dispatch

```yaml
name: AI Fix Issue
on:
  workflow_dispatch:
    inputs:
      issue_data:
        description: 'JSON with issue data'
        required: true
        type: string

jobs:
  fix:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: your-user/nospoon-ai-code-issue-resolution@main
        with:
          issue_data: ${{ inputs.issue_data }}
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Automatic trigger when labeling an issue

```yaml
name: Auto Fix on Issue
on:
  issues:
    types: [labeled]

jobs:
  fix:
    if: contains(github.event.label.name, 'ai-fix')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: your-user/nospoon-ai-code-issue-resolution@main
        with:
          issue_data: |
            {
              "title": "${{ github.event.issue.title }}",
              "description": "${{ github.event.issue.body }}",
              "files": [{"path": "src/"}],
              "source_issue_number": ${{ github.event.issue.number }}
            }
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Example JSON for testing

```json
{
  "title": "Login button not responding",
  "description": "The login button on the main page does not trigger the authentication flow when clicked.",
  "error_message": "TypeError: Cannot read property 'submit' of null",
  "files": [
    { "path": "src/components/LoginButton.tsx", "line_start": 42, "line_end": 55 },
    { "path": "src/auth/handler.ts", "line_start": 10 }
  ],
  "stack_trace": "at LoginButton.handleClick (LoginButton.tsx:42)\nat HTMLButtonElement.dispatch (react-dom.js:3945)",
  "severity": "high",
  "language": "TypeScript/React",
  "additional_context": "This only happens after session timeout (30 min idle)",
  "labels": ["frontend", "auth"],
  "source_issue_number": 123
}
```
