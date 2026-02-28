#!/bin/bash

usage="Usage: sw --source-path <source_path>"

print_usage() {
    echo "$usage"
    echo "  --source-path   Source repository path"
}

require_flag_value() {
    local flag_name="$1"
    local flag_value="$2"

    if [ -z "$flag_value" ] || [[ "$flag_value" == --* ]]; then
        echo "Missing value for $flag_name"
        print_usage
        exit 1
    fi
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --source-path)
            require_flag_value "$1" "$2"
            source_path="$2"
            shift 2
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            echo "Invalid argument: $1"
            print_usage
            exit 1
            ;;
    esac
done

if [ -z "$source_path" ]; then
    print_usage
    exit 1
fi

source_path="${source_path%/}"

if [ ! -d "$source_path" ]; then
    echo "Source path does not exist: $source_path"
    exit 1
fi

cd "$source_path" || exit 1

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
