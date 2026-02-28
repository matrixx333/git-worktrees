#!/bin/bash

# Settings
worktree_path="/c/code/pivot-backend.worktree"

# Truncated usage message
usage="Usage: dw <worktree_folder_name>"

# Check if the correct number of arguments are provided
if [ "$#" -ne 1 ]; then
    echo "$usage"
    echo "  <worktree_folder_name>  Name of the worktree folder to delete"
    exit 1
fi

# Get the worktree name from the input parameter
worktree_folder_name="${1,,}"  # Convert to lowercase

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