# Router workflow examples

This folder contains the workflow example that routes crash reports to another repository.

## Files

- `ai-crash-fix-with-router.yml`

## How to use

1. Copy `ai-crash-fix-with-router.yml` into your source repo as:
   - `.github/workflows/ai-crash-fix-with-router.yml`
2. The example already uses:
   - `uses: NoSpoonLab/nospoon-ai-code-issue-resolution@main`
3. Add these secrets in source repo:
   - `ANTHROPIC_API_KEY`
   - `AI_FIX_GH_TOKEN`
4. Ensure destination repo has this workflow:
   - `.github/workflows/ai-crash-fix.yml`

## Router parameters

- `use_router`
  - `"true"` enables routing flow.
  - `"false"` runs local Claude fix flow.
- `router_mode`
  - `"first-match"`: dispatch only the first matching rule.
  - `"fanout"`: dispatch all matching rules.
- `router_rules_json`
  - JSON array of routing rules.
  - Each rule contains `match_prefixes`, optional `rewrite`, and `target`.
- `router_default_target_json`
  - Optional fallback target used when no rule matches.

## `router_rules_json` example

```json
[
  {
    "id": "module-to-target",
    "match_prefixes": ["ProjectModules/CorePack/"],
    "rewrite": {
      "from_prefix": "ProjectModules/CorePack/",
      "to_prefix": "ProjectModules/"
    },
    "target": {
      "repository": "example-org/target-repo",
      "workflow": "ai-crash-fix.yml",
      "ref": "main",
      "crash_report_input": "crash_report",
      "dry_run_input": "dry_run",
      "extra_inputs": {
        "base_branch": "main"
      }
    }
  }
]
```

Meaning:
- `match_prefixes`: which paths should trigger this rule.
- `rewrite`: optional path transformation before forwarding the crash report.
- `target.repository`: destination repo in `owner/repo` format.
- `target.workflow`: destination workflow file name or workflow id.
- `target.ref`: branch/tag in destination repo.
- `target.crash_report_input` and `target.dry_run_input`: destination input names.
- `target.extra_inputs`: any extra `workflow_dispatch` inputs.

## `router_default_target_json` example

Use this only if you want a fallback when no rules match:

```json
{
  "repository": "example-org/target-repo",
  "workflow": "ai-crash-fix.yml",
  "ref": "main",
  "crash_report_input": "crash_report",
  "dry_run_input": "dry_run",
  "extra_inputs": {
    "base_branch": "main"
  }
}
```

## YAML snippet (router enabled)

```yaml
use_router: "true"
router_mode: "first-match"
router_rules_json: >-
  [{"id":"module-to-target","match_prefixes":["ProjectModules/CorePack/"],"rewrite":{"from_prefix":"ProjectModules/CorePack/","to_prefix":"ProjectModules/"},"target":{"repository":"example-org/target-repo","workflow":"ai-crash-fix.yml","ref":"main","crash_report_input":"crash_report","dry_run_input":"dry_run","extra_inputs":{"base_branch":"main"}}}]
router_default_target_json: ""
```

## Requirements for cross-repo routing

- In source repo workflow permissions, include `actions: write`.
- `github_token` must be allowed to trigger workflows in destination repo.
- Use PAT (`AI_FIX_GH_TOKEN`) for cross-repo. `GITHUB_TOKEN` usually is not enough.
- Destination repo must have the target workflow with compatible inputs.
