#!/bin/bash

# Check if current directory is /c/code/pivot-backend
if [[ "$(pwd)" != "/c/code/pivot-backend" ]]; then
    echo "Changing directory to /c/code/pivot-backend"
    cd /c/code/pivot-backend || exit 1
fi

# Get list of git worktrees
worktrees=$(git worktree list --porcelain | grep -e "worktree" | awk '{print $2}')

# Check if there are any worktrees
if [ -z "$worktrees" ]; then
    echo "No git worktrees found."
    exit 1
fi

# Select a worktree using fzf
selected_worktree=$(echo "$worktrees" | fzf \
    --prompt="Select a worktree: " \
    --height=20% \
    --border \
    --color="fg:-1,bg:-1,fg+:#e5e5e5,bg+:#81659c,pointer:#ffffff,marker:#83a598,header:#8fdbbb" \
    --pointer="▸ " \
    --marker="• " \
    --header="Select a Git worktree (Use arrow keys to navigate)")

# Check if user made a selection
if [ -z "$selected_worktree" ]; then
    echo "No worktree selected."
    exit 1
fi

# Open selected worktree in VS Code
code "$selected_worktree"
