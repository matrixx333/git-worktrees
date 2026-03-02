#!/bin/bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd -- "$script_dir/.." && pwd -P)"

source_path="/c/code/pivot-backend"
remote_branch="origin/main"
config_path="$repo_root/configs/pivot.json"
worktree_folder_name=""
branch_name=""
skip_steps=false

usage="Usage: pcw --worktree <worktree_folder_name> --branch <branch_name> [--source-path <source_path>] [--remote <remote_branch>] [--config <config.json>] [--skip-steps]"

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
    echo "  --worktree      Name of the worktree folder to create"
    echo "  --branch        Name of the branch to create and switch to"
    echo "  --source-path   (Optional) Source repository path (default: /c/code/pivot-backend)"
    echo "  --remote        (Optional) Name of the remote branch to track (default: origin/main)"
    echo "  --config        (Optional) Path to JSON config containing copyOperations (default: configs/pivot.json)"
    echo "  --skip-steps    (Optional) Skip dotnet build"
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

validate_dependencies() {
    local -a missing=()

    if [[ ! -x "$script_dir/create-worktree.sh" ]]; then
        missing+=("$script_dir/create-worktree.sh")
    fi

    if ! command -v dotnet >/dev/null 2>&1 && [[ "$skip_steps" != true ]]; then
        missing+=("dotnet")
    fi

    if [[ ! -x "/c/code/shell-scripts/src/update-service-worker-appsettings.sh" ]]; then
        missing+=("/c/code/shell-scripts/src/update-service-worker-appsettings.sh")
    fi

    if [[ ${#missing[@]} -gt 0 ]]; then
        log_error "Missing required dependency(ies): ${missing[*]}"
        return 1
    fi

    return 0
}

trap 'log_error "Command failed at line $LINENO"' ERR

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
        --skip-steps)
            skip_steps=true
            shift
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

if [[ -z "$worktree_folder_name" || -z "$branch_name" ]]; then
    fail_usage "--worktree and --branch are required"
fi

source_path="${source_path%/}"
destination_path="${source_path}.worktree"
target_worktree_path="$destination_path/$worktree_folder_name"

if [[ "$config_path" != /* ]]; then
    config_path="$repo_root/$config_path"
fi

if [[ "$config_path" == "$repo_root/config/pivot.config" ]]; then
    log_warn "Config path 'config/pivot.config' is deprecated/alias; using 'configs/pivot.json'."
    config_path="$repo_root/configs/pivot.json"
fi

if [[ ! -f "$config_path" ]]; then
    log_error "Config file not found: $config_path"
    exit 1
fi

validate_dependencies

log_info "Creating Pivot worktree '$worktree_folder_name' from '$source_path'"
"$script_dir/create-worktree.sh" \
    --source-path "$source_path" \
    --worktree "$worktree_folder_name" \
    --branch "$branch_name" \
    --remote "$remote_branch" \
    --config "$config_path"

if [[ "$skip_steps" != true ]]; then
    log_info "Running dotnet build in $target_worktree_path/src"
    (
        cd -- "$target_worktree_path/src"
        dotnet build
    )
else
    log_info "Skipping dotnet build (--skip-steps)"
fi

log_info "Updating service worker appsettings for $target_worktree_path"
/c/code/shell-scripts/src/update-service-worker-appsettings.sh "$target_worktree_path"

log_info "Pivot worktree created successfully: $target_worktree_path"
exit 0