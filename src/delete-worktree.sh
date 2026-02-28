#!/bin/bash
set -Eeuo pipefail

source_path=""
worktree_folder_name=""
delete_branch=true
force=false
dry_run=false

usage="Usage: dw --source-path <source_path> --worktree <worktree_folder_name> [--no-delete-branch] [--force] [--dry-run]"

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
    echo "  --source-path        Source repository path"
    echo "  --worktree           Name of the worktree folder to delete"
    echo "  --no-delete-branch   Remove worktree only"
    echo "  --force              Required to delete branch"
    echo "  --dry-run            Show commands without executing"
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

    if ! command -v git >/dev/null 2>&1; then
        missing+=("git")
    fi

    if [[ ${#missing[@]} -gt 0 ]]; then
        log_error "Missing required command(s): ${missing[*]}"
        return 1
    fi

    return 0
}

run_cmd() {
    if [[ "$dry_run" == true ]]; then
        log_info "[DRY RUN] Would execute: $*"
        return 0
    fi

    "$@"
}

resolve_branch_by_worktree_name() {
    local -r requested_name="$1"
    local -a matches=()
    local branch=""

    while IFS= read -r branch; do
        [[ -n "$branch" ]] || continue
        if [[ "${branch,,}" == *"${requested_name,,}"* ]]; then
            matches+=("$branch")
        fi
    done < <(git for-each-ref --format='%(refname:short)' refs/heads)

    if [[ ${#matches[@]} -eq 1 ]]; then
        printf '%s\n' "${matches[0]}"
        return 0
    fi

    if [[ ${#matches[@]} -gt 1 ]]; then
        log_warn "Multiple branches matched '$requested_name': ${matches[*]}"
        return 2
    fi

    return 1
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
        --no-delete-branch)
            delete_branch=false
            shift
            ;;
        --force)
            force=true
            shift
            ;;
        --dry-run)
            dry_run=true
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

if [[ -z "$source_path" || -z "$worktree_folder_name" ]]; then
    fail_usage "--source-path and --worktree are required"
fi

if [[ "$worktree_folder_name" == */* || "$worktree_folder_name" == ".." || "$worktree_folder_name" == "." ]]; then
    fail_usage "--worktree must be a single folder name"
fi

source_path="${source_path%/}"
worktree_path="${source_path}.worktree"
target_worktree_path="$worktree_path/$worktree_folder_name"

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

if [[ ! -d "$target_worktree_path" ]]; then
    log_error "Worktree path does not exist: $target_worktree_path"
    exit 1
fi

log_info "Removing worktree: $target_worktree_path"
run_cmd git worktree remove -f -- "$target_worktree_path"

if [[ "$delete_branch" != true ]]; then
    log_info "Worktree removed. Branch deletion skipped (--no-delete-branch)."
    exit 0
fi

if ! branch_name="$(resolve_branch_by_worktree_name "$worktree_folder_name")"; then
    resolve_status=$?
    if [[ $resolve_status -eq 2 ]]; then
        log_warn "Skipping branch deletion due to ambiguous branch match."
    else
        log_warn "No branch associated with worktree '$worktree_folder_name' found."
    fi
    log_info "Worktree removed successfully."
    exit 0
fi

if [[ "$force" != true ]]; then
    log_warn "Branch deletion is blocked by default. Use --force to delete: $branch_name"
    log_info "Worktree removed successfully."
    exit 0
fi

log_info "Deleting branch: $branch_name"
run_cmd git branch -D -- "$branch_name"
log_info "Worktree '$worktree_folder_name' and branch '$branch_name' deleted successfully."

exit 0