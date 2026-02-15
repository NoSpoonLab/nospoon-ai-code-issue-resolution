# NoSpoon AI Code Issue Resolution

[![Node](https://img.shields.io/badge/runtime-node20-2ea44f)](action.yml)
[![TypeScript](https://img.shields.io/badge/source-typescript-3178c6)](src/main.ts)
[![Router](https://img.shields.io/badge/router-cross--repo-orange)](examples/router-workflows/README.md)

GitHub Action to analyze Unity/Backtrace crash reports, apply a fix with Claude Code CLI, and create a Pull Request automatically (with human review).

## Why this action

- Analyze real crash reports (managed/native).
- Apply fixes automatically with controlled tool access.
- Create branch, commit, push, and PR with technical summary.
- Support router mode to forward crashes to another repository.

## Flow

1. Parse and validate `crash_report`.
2. If `use_router=true`, try routing using rules.
3. If no route matches, run Claude in the local repository.
4. Detect changes, commit/push, and create a PR.

## Quick Start (basic)

Copy a workflow like this into your repository (`.github/workflows/ai-crash-fix.yml`):

```yaml
name: AI Crash Fix

on:
  workflow_dispatch:
    inputs:
      crash_report:
        description: "Crash report JSON (string)"
        required: true
        type: string
      base_branch:
        required: false
        default: "main"
        type: string
      dry_run:
        required: false
        default: "true"
        type: string

jobs:
  fix:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          persist-credentials: true

      - uses: NoSpoonLab/nospoon-ai-code-issue-resolution@main
        with:
          crash_report: ${{ inputs.crash_report }}
          base_branch: ${{ inputs.base_branch }}
          dry_run: ${{ inputs.dry_run }}
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          github_token: ${{ secrets.GITHUB_TOKEN }}

          max_turns: "100"
          allowed_tools: "Read,Edit,Write,Bash,Grep,Glob,WebSearch,WebFetch"
          claude_permission_mode: "plan"
          claude_auto_apply_plan: "true"
          claude_model: "claude-opus-4-6"
          claude_effort: "high"
          use_router: "false"
```

Minimum secrets:

- `ANTHROPIC_API_KEY`
- `GITHUB_TOKEN` (provided automatically by GitHub Actions; you do not need to create it)

## Router mode (Repo A -> Repo B)

When affected code lives in another repository (example: `ProjectModules/CorePack/`), enable router mode in Repo A to dispatch to Repo B.

Quick example:

```yaml
permissions:
  contents: write
  pull-requests: write
  actions: write

with:
  github_token: ${{ secrets.AI_FIX_GH_TOKEN }}
  use_router: "true"
  router_mode: "first-match"
  router_rules_json: >-
    [{"id":"module-to-target","match_prefixes":["ProjectModules/CorePack/"],"rewrite":{"from_prefix":"ProjectModules/CorePack/","to_prefix":"ProjectModules/"},"target":{"repository":"example-org/target-repo","workflow":"ai-crash-fix.yml","ref":"main","crash_report_input":"crash_report","dry_run_input":"dry_run","extra_inputs":{"base_branch":"main"}}}]
  router_default_target_json: ""
```

Important notes:

- `target.ref` = branch in the destination repository where the workflow runs.
- `extra_inputs.base_branch` = PR base branch in the destination repository.
- The destination repository must contain the workflow defined in `target.workflow`.
- For cross-repo routing, use a PAT (`AI_FIX_GH_TOKEN`), not `GITHUB_TOKEN`.

## Key inputs

| Input | Required | Default | Usage |
|---|---|---|---|
| `crash_report` | yes | - | Crash report JSON serialized as string |
| `anthropic_api_key` | yes | - | Claude API key |
| `github_token` | no | `github.token` | Token used for push/PR/dispatch (PAT recommended for advanced use) |
| `base_branch` | no | auto-detect | PR base branch |
| `dry_run` | no | `false` | Analyze only, without commit/PR |
| `use_router` | no | `false` | Enable cross-repo routing |
| `router_rules_json` | no | `""` | Routing rules |
| `router_default_target_json` | no | `""` | Fallback target when no rule matches |
| `claude_model` | no | `claude-opus-4-6` | Claude model |

Full reference: `action.yml`.

## Outputs

| Output | Description |
|---|---|
| `pr_url` | Created PR URL |
| `pr_number` | Created PR number |
| `branch_name` | Generated branch name |
| `claude_analysis` | Claude technical summary |
| `files_changed` | Comma-separated changed files |
| `blocked_files` | Changed files blocked by directory guards |
| `router_used` | `true` when routing was used |
| `routed_targets` | Dispatched targets in `owner/repo:workflow@ref` format |
| `cost_usd` | Claude reported cost |

## Examples

- Basic: `examples/basic-workflows/README.md`
- Router: `examples/router-workflows/README.md`

## Troubleshooting

### `Router enabled but no rules matched`

- Verify prefixes in `match_prefixes`.
- Verify the crash trace contains expected paths (for example, `ProjectModules/CorePack/...`).

### `github_token is required when use_router is enabled`

- Router mode is enabled without a valid token.
- Pass `github_token` and verify the secret exists.

### `Repository not found` when pushing/dispatching

- Token has no access to destination repository (GitHub may return 404 instead of 403).
- Use a PAT with proper permissions and `actions: write` when router mode is enabled.

### `Validation Failed: field base invalid`

- `base_branch` is invalid or resolved to `HEAD`.
- Pass an explicit `base_branch` (`main`, `master`, `develop`, etc.).

## Local development

```bash
npm ci
npm test
npm run build
node test-local.js
```

`test-local.js` allows local simulation against a target repository.
