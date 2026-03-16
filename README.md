# worktrees-cli

> Interactive CLI for creating and managing Git worktrees with guided prompts and project-specific workflows.

[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-5.x-blue)](https://www.typescriptlang.org)

Git worktrees let you check out multiple branches simultaneously in separate directories — but the raw Git commands can be verbose and error-prone. `worktrees-cli` wraps the workflow in interactive prompts that validate your inputs, handle cleanup on failure, and automate repetitive setup steps.

## Features

- **Interactive prompts** — step-by-step guidance via `@clack/prompts` with real-time input validation
- **Create worktrees** — specify folder name, branch, and remote tracking ref, with automatic `.vscode` settings copy and VS Code launch
- **Delete worktrees** — remove a worktree and optionally its associated branch with fuzzy name matching
- **Rollback on failure** — if worktree creation fails, the CLI automatically cleans up partial state
- **Pivot project support** — extended workflow for .NET projects: copies config files and runs `dotnet build` post-creation
- **Bash scripts** — standalone shell scripts for CI/CD or scripted usage without interactive prompts

## Prerequisites

- [Node.js](https://nodejs.org) >= 18
- Git

## Installation

Install globally so you can run `worktrees-cli` from any directory:

```bash
npm install
npm run build
npm link
```

Then run from anywhere:

```bash
worktrees-cli
```

To uninstall:

```bash
npm unlink -g worktrees-cli
```

## Getting Started

```bash
npm install
npm run dev
```

The CLI displays an interactive menu. Use arrow keys to select an action and follow the prompts.

## Workflows

### Create a worktree

1. Enter the **folder name** for the new worktree
2. Enter the **branch name** to create
3. Optionally specify a **remote ref** to track (defaults to `origin/main`)

The CLI validates each input, creates the worktree, copies `.vscode` settings, and opens the folder in VS Code.

### Delete a worktree

1. Enter the **folder name** of the worktree to remove
2. Choose whether to **delete the associated branch** (fuzzy-matched by folder name)

### Pivot workflow

When running inside a Pivot (.NET) project, the create workflow gains extra steps:

- Copies Pivot-specific configuration files into the new worktree
- Runs `dotnet build` (can be skipped via prompt)
- Runs `update-service-worker-appsettings`

## Bash Scripts

For non-interactive usage (CI, scripting), the underlying shell scripts are available directly:

```bash
# Create a worktree
scripts/create-worktree.sh \
  --source-path <path> \
  --worktree <name> \
  --branch <branch> \
  [--remote <ref>] \
  [--config <json-path>]

# Delete a worktree
scripts/delete-worktree.sh \
  --source-path <path> \
  --worktree <name> \
  [--no-delete-branch] \
  [--force] \
  [--dry-run]

# Pivot-specific create
scripts/pivot-create-worktree.sh \
  --worktree <name> \
  --branch <branch> \
  [--source-path <path>] \
  [--remote <ref>] \
  [--skip-steps]
```

## Development

```bash
npm run type-check       # TypeScript type checking
npm run test             # Run unit tests
npm run test:coverage    # Run tests with coverage report
```

> [!NOTE]
> The project enforces 100% code coverage across all lines, branches, functions, and statements.

## Project Structure

```
src/
├── index.ts     # Entry point and interactive menu
├── create.ts    # Create worktree workflow
├── delete.ts    # Delete worktree workflow
├── git.ts       # Git operations (execSync wrappers)
└── pivot.ts     # Pivot-specific post-creation steps
scripts/
├── create-worktree.sh
├── delete-worktree.sh
└── pivot-create-worktree.sh
tests/           # Unit tests (Vitest)
configs/
└── pivot.json   # Copy operations config for Pivot projects
```
