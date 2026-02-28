#!/bin/bash

# Set defaults
vscode_settings=".vscode"
remote_branch="origin/main"
config_path=""

usage="Usage: cw --source-path <source_path> --worktree <worktree_folder_name> --branch <branch_name> [--remote <remote_branch>] [--config <config.json>]"

print_usage() {
    echo "$usage"
    echo "  --source-path   Source repository path"
    echo "  --worktree      Name of the worktree folder to create"
    echo "  --branch        Name of the branch to create and switch to"
    echo "  --remote        (Optional) Name of the remote branch to track (default: origin/main)"
    echo "  --config        (Optional) Path to JSON config containing copyOperations"
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
        --branch)
            require_flag_value "$1" "$2"
            branch_name="$2"
            shift 2
            ;;
        --remote)
            require_flag_value "$1" "$2"
            remote_branch="$2"
            shift 2
            ;;
        --config)
            require_flag_value "$1" "$2"
            config_path="$2"
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

if [ -z "$source_path" ] || [ -z "$worktree_folder_name" ] || [ -z "$branch_name" ]; then
    print_usage
    exit 1
fi

source_path="${source_path%/}"
destination_path="${source_path}.worktree"

if [ ! -d "$source_path" ]; then
    echo "Source path does not exist: $source_path"
    exit 1
fi

# Change directory to source_path
cd "$source_path" || exit 1

# Create a new GitHub worktree
git worktree add --track -b "$branch_name" "$destination_path/$worktree_folder_name" "$remote_branch"

# Copy vscode_settings folder to destination_path/worktree_folder_name
if [ -d "$source_path/$vscode_settings" ]; then
    cp -r "$source_path/$vscode_settings/" "$destination_path/$worktree_folder_name"
fi

# Copy config-defined files if --config is provided
if [ -n "$config_path" ]; then
    if [ ! -f "$config_path" ]; then
        echo "Config file not found: $config_path"
        exit 1
    fi

    if ! command -v jq >/dev/null 2>&1; then
        echo "jq is required when using --config. Please install jq and try again."
        exit 1
    fi

    if ! jq -e '.copyOperations and (.copyOperations | type == "array")' "$config_path" >/dev/null 2>&1; then
        echo "Invalid config file: copyOperations array is required"
        exit 1
    fi

    while IFS= read -r operation; do
        from_rel=$(jq -r '.from // empty' <<< "$operation")
        to_rel=$(jq -r '.to // empty' <<< "$operation")

        if [ -z "$from_rel" ] || [ -z "$to_rel" ]; then
            echo "Invalid copy operation in config: both 'from' and 'to' are required"
            exit 1
        fi

        from_abs="$source_path/$from_rel"
        to_abs="$destination_path/$worktree_folder_name/$to_rel"

        if [ ! -f "$from_abs" ]; then
            echo "Source file for copy operation not found: $from_abs"
            exit 1
        fi

        if [ ! -d "$to_abs" ]; then
            echo "Destination directory for copy operation not found: $to_abs"
            exit 1
        fi

        cp "$from_abs" "$to_abs"
    done < <(jq -c '.copyOperations[]' "$config_path")
fi

# Change directory to destination_path/worktree_folder_name
cd "$destination_path/$worktree_folder_name" || exit 1

# Open Visual Studio Code
code .

exit 0
