#!/bin/bash
set -Eeuo pipefail

vscode_settings=".vscode"
remote_branch="origin/main"
config_path=""
source_path=""
worktree_folder_name=""
branch_name=""
worktree_created=false
script_failed=true

usage="Usage: cw --source-path <source_path> --worktree <worktree_folder_name> --branch <branch_name> [--remote <remote_branch>] [--config <config.json>]"

log_info() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $*" >&2
}

log_warn() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] WARN: $*" >&2
}

log_error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
}

print_usage() {
    echo "$usage"
    echo "  --source-path   Source repository path"
    echo "  --worktree      Name of the worktree folder to create"
    echo "  --branch        Name of the branch to create and switch to"
    echo "  --remote        (Optional) Name of the remote branch to track (default: origin/main)"
    echo "  --config        (Optional) Path to JSON config containing copyOperations"
}

fail_usage() {
    log_error "$1"
    print_usage
    exit 1
}

require_flag_value() {
    local -r flag_name="$1"
    local -r flag_value="${2:-}"

    if [[ -z "$flag_value" || "$flag_value" == --* ]]; then
        fail_usage "Missing value for $flag_name"
    fi
}

canonicalize_existing_path() {
    local -r path="$1"

    if [[ -d "$path" ]]; then
        (cd -- "$path" && pwd -P)
        return 0
    fi

    if [[ -e "$path" ]]; then
        (cd -- "$(dirname -- "$path")" && printf '%s/%s\n' "$(pwd -P)" "$(basename -- "$path")")
        return 0
    fi

    return 1
}

validate_dependencies() {
    local -a missing=()

    if ! command -v git >/dev/null 2>&1; then
        missing+=("git")
    fi

    if [[ -n "$config_path" ]] && ! command -v jq >/dev/null 2>&1; then
        missing+=("jq")
    fi

    if [[ ${#missing[@]} -gt 0 ]]; then
        log_error "Missing required command(s): ${missing[*]}"
        return 1
    fi

    return 0
}

cleanup_on_exit() {
    if [[ "$script_failed" == true && "$worktree_created" == true ]]; then
        log_warn "Failure detected after worktree creation; rolling back worktree '$worktree_folder_name'."
        if [[ -n "${source_path:-}" && -d "${source_path:-}" ]]; then
            (
                cd -- "$source_path"
                git worktree remove -f -- "$destination_path/$worktree_folder_name"
            ) || log_error "Rollback failed for $destination_path/$worktree_folder_name. Manual cleanup may be required."
        fi
    fi
}

trap 'log_error "Command failed at line $LINENO"' ERR
trap cleanup_on_exit EXIT

while [[ "$#" -gt 0 ]]; do
    case "$1" in
        --source-path)
            require_flag_value "$1" "${2:-}"
            source_path="$2"
            shift 2
            ;;
        --worktree)
            require_flag_value "$1" "${2:-}"
            worktree_folder_name="$2"
            shift 2
            ;;
        --branch)
            require_flag_value "$1" "${2:-}"
            branch_name="$2"
            shift 2
            ;;
        --remote)
            require_flag_value "$1" "${2:-}"
            remote_branch="$2"
            shift 2
            ;;
        --config)
            require_flag_value "$1" "${2:-}"
            config_path="$2"
            shift 2
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            fail_usage "Invalid argument: $1"
            ;;
    esac
done

if [[ -z "$source_path" || -z "$worktree_folder_name" || -z "$branch_name" ]]; then
    fail_usage "--source-path, --worktree, and --branch are required"
fi

if [[ "$worktree_folder_name" == */* || "$worktree_folder_name" == ".." || "$worktree_folder_name" == "." ]]; then
    fail_usage "--worktree must be a single folder name"
fi

if ! git check-ref-format --branch "$branch_name" >/dev/null 2>&1; then
    fail_usage "Invalid --branch name: $branch_name"
fi

source_path="${source_path%/}"
destination_path="${source_path}.worktree"

if [[ ! -d "$source_path" ]]; then
    log_error "Source path does not exist: $source_path"
    exit 1
fi

validate_dependencies

cd -- "$source_path"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    log_error "Source path is not a git repository: $source_path"
    exit 1
fi

if git show-ref --verify --quiet "refs/heads/$branch_name"; then
    log_error "Branch already exists locally: $branch_name"
    exit 1
fi

if [[ -e "$destination_path/$worktree_folder_name" ]]; then
    log_error "Destination already exists: $destination_path/$worktree_folder_name"
    exit 1
fi

log_info "Creating worktree: $destination_path/$worktree_folder_name (branch: $branch_name, remote: $remote_branch)"
git worktree add --track -b "$branch_name" -- "$destination_path/$worktree_folder_name" "$remote_branch"
worktree_created=true

if [[ -d "$source_path/$vscode_settings" ]]; then
    log_info "Copying $vscode_settings into new worktree"
    cp -r -- "$source_path/$vscode_settings/." "$destination_path/$worktree_folder_name/$vscode_settings"
fi

if [[ -n "$config_path" ]]; then
    if [[ ! -f "$config_path" ]]; then
        log_error "Config file not found: $config_path"
        exit 1
    fi

    if ! jq -e '.copyOperations and (.copyOperations | type == "array")' "$config_path" >/dev/null 2>&1; then
        log_error "Invalid config file: copyOperations array is required"
        exit 1
    fi

    src_root_canon=$(canonicalize_existing_path "$source_path")
    dest_root_canon=$(canonicalize_existing_path "$destination_path/$worktree_folder_name")

    while IFS= read -r operation; do
        from_rel=$(jq -r '.from // empty' <<< "$operation")
        to_rel=$(jq -r '.to // empty' <<< "$operation")

        if [[ -z "$from_rel" || -z "$to_rel" ]]; then
            log_error "Invalid copy operation in config: both 'from' and 'to' are required"
            exit 1
        fi

        from_abs="$source_path/$from_rel"
        to_abs="$destination_path/$worktree_folder_name/$to_rel"

        if [[ ! -f "$from_abs" ]]; then
            log_error "Source file for copy operation not found: $from_abs"
            exit 1
        fi

        if [[ ! -d "$to_abs" ]]; then
            log_error "Destination directory for copy operation not found: $to_abs"
            exit 1
        fi

        from_canon=$(canonicalize_existing_path "$from_abs")
        to_canon=$(canonicalize_existing_path "$to_abs")

        if [[ "$from_canon" != "$src_root_canon"* ]]; then
            log_warn "Config copy source resolves outside source root (allowed): $from_canon"
        fi

        if [[ "$to_canon" != "$dest_root_canon"* ]]; then
            log_warn "Config copy destination resolves outside worktree root (allowed): $to_canon"
        fi

        log_info "Copying config file: $from_abs -> $to_abs"
        cp -- "$from_abs" "$to_abs"
    done < <(jq -c '.copyOperations[]' "$config_path")
fi

cd -- "$destination_path/$worktree_folder_name"

if command -v code >/dev/null 2>&1; then
    code .
else
    log_warn "VS Code CLI ('code') not found; skipping editor launch."
fi

script_failed=false
log_info "Worktree created successfully: $destination_path/$worktree_folder_name"
exit 0
