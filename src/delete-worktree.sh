#!/bin/bash

usage="Usage: dw --source-path <source_path> --worktree <worktree_folder_name>"

print_usage() {
    echo "$usage"
    echo "  --source-path   Source repository path"
    echo "  --worktree      Name of the worktree folder to delete"
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
        --worktree)
            require_flag_value "$1" "$2"
            worktree_folder_name="$2"
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

if [ -z "$source_path" ] || [ -z "$worktree_folder_name" ]; then
    print_usage
    exit 1
fi

source_path="${source_path%/}"
worktree_path="${source_path}.worktree"
worktree_folder_name="${worktree_folder_name,,}"

if [ ! -d "$source_path" ]; then
    echo "Source path does not exist: $source_path"
    exit 1
fi

cd "$source_path" || exit 1

# Delete the git worktree
git worktree remove -f "$worktree_path/$worktree_folder_name"

# List all branch names
branches=$(git branch | cut -c 3-)

# Loop through each branch to find the one associated with the worktree name
shopt -s nocasematch  # Enable case-insensitive matching
while read -r branch; do
    if [[ "$branch" == *"$worktree_folder_name"* ]]; then
        echo "branch located: $branch"
        branch_name="$branch"
        break
    fi
done <<< "$branches"
shopt -u nocasematch  # Disable case-insensitive matching

# Delete the git branch
if [ -n "$branch_name" ]; then
    git branch -D "$branch_name"
    echo "Worktree '$worktree_folder_name' and branch '$branch_name' deleted successfully."
else
    echo "No branch associated with worktree '$worktree_folder_name' found."
fi

exit 0