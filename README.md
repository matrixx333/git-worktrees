# Git Worktrees Scripts

## `pcw` (Pivot create worktree)

Use `src/pivot-create-worktree.sh` to create a Pivot worktree with defaults:
- `--source-path` defaults to `/c/code/pivot-backend`
- `--config` defaults to `configs/pivot.json`
- runs `dotnet build` unless `--skip-steps` is set
- runs service worker appsettings update script after creation

Example:

```bash
bash src/pivot-create-worktree.sh --worktree my-feature --branch feature/my-feature
```

Optional alias:

```bash
alias pcw='bash /c/code/git-worktrees/src/pivot-create-worktree.sh'
```

## `cw` (Create worktree)

Use `src/create-worktree.sh` to create a new git worktree from a source repo.
- requires `--source-path`, `--worktree`, and `--branch`
- creates worktree at `<source-path>.worktree/<worktree>`
- tracks `--remote` branch (default: `origin/main`)
- can copy files using `--config` JSON `copyOperations`
- copies `.vscode` from source repo when present

Example:

```bash
bash src/create-worktree.sh --source-path /c/code/pivot-backend --worktree my-feature --branch feature/my-feature --config configs/pivot.json
```

Optional alias:

```bash
alias cw='bash /c/code/git-worktrees/src/create-worktree.sh'
```

## `dw` (Delete worktree)

Use `src/delete-worktree.sh` to remove a worktree and optionally delete its branch.
- requires `--source-path` and `--worktree`
- deletes the worktree path at `<source-path>.worktree/<worktree>`
- branch deletion is enabled by default but requires `--force`
- use `--no-delete-branch` to remove only the worktree
- use `--dry-run` to preview commands

Example:

```bash
bash src/delete-worktree.sh --source-path /c/code/pivot-backend --worktree my-feature --force
```

Optional alias:

```bash
alias dw='bash /c/code/git-worktrees/src/delete-worktree.sh'
```