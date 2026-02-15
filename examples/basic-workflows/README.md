# Basic workflow examples

This folder contains the simplest workflow example for a first test.

## Files

- `ai-crash-fix.yml`

## How to use

1. Copy `ai-crash-fix.yml` into your repo as:
   - `.github/workflows/ai-crash-fix.yml`
2. The example already uses:
   - `uses: NoSpoonLab/nospoon-ai-code-issue-resolution@main`
3. Add this secret in the repo:
   - `ANTHROPIC_API_KEY`
4. `GITHUB_TOKEN` is provided automatically by GitHub Actions.

## Inputs used in this basic example

- `crash_report` (JSON serialized as string)
- `base_branch` (recommended: `main`)
- `dry_run` (`true` or `false`)
