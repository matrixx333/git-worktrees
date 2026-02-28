#!/bin/bash

# Set variables
source_path="/c/code/pivot-backend"
destination_path="/c/code/pivot-backend.worktree"
vscode_settings=".vscode"

# Truncated usage message
usage="Usage: cw <worktree_folder_name> <branch_name> [<remote_branch>] [--skip]"

# Check if the correct number of arguments are provided
if [ "$#" -lt 2 ] || [ "$#" -gt 4 ]; then
    echo "$usage"
    echo "  <worktree_folder_name>  Name of the worktree folder to create"
    echo "  <branch_name>           Name of the branch to create and switch to"
    echo "  [<remote_branch>]       (Optional) Name of the remote branch to track"
    echo "  [--skip]                (Optional) Skip dotnet build and appsettings update"
    exit 1
fi

worktree_folder_name="$1"
branch_name="$2"

# Set the remote_branch variable based on the number of arguments
if [ "$#" -eq 2 ]; then
    remote_branch="origin/main"
elif [ "$#" -eq 3 ]; then
    if [ "$3" == "--skip" ]; then
        remote_branch="origin/main"
        skip_steps=true
    else
        remote_branch="$3"
    fi
else
    if [ "$4" == "--skip" ]; then
        remote_branch="$3"
        skip_steps=true
    else
        echo "Invalid argument: $4"
        echo "$usage"
        exit 1
    fi
fi

# Change directory to source_path
cd "$source_path" || exit 1

# Create a new GitHub worktree
git worktree add --track -b "$branch_name" "../pivot-backend.worktree/$worktree_folder_name" $remote_branch

# Copy vscode_settings folder to destination_path/worktree_folder_name
cp -r "$source_path/$vscode_settings/" "$destination_path/$worktree_folder_name"

# Copy appsettings files
cp "$source_path/src/Pivot.Api/appsettings.Development.json" "$destination_path/$worktree_folder_name/src/Pivot.Api/"
cp "$source_path/src/Pivot.Api/appsettings.Epic.json" "$destination_path/$worktree_folder_name/src/Pivot.Api/"
cp "$source_path/src/Pivot.Api.Shard.Management/appsettings.Development.json" "$destination_path/$worktree_folder_name/src/Pivot.Api.Shard.Management/"
cp "$source_path/src/_Tests/Pivot.Service.Tests/appsettings.Development.json" "$destination_path/$worktree_folder_name/src/_Tests/Pivot.Service.Tests/"
cp "$source_path/src/Migrator/appsettings.Development.json" "$destination_path/$worktree_folder_name/src/Migrator/"
cp "$source_path/src/Pivot.Functions/local.settings.json" "$destination_path/$worktree_folder_name/src/Pivot.Functions/"
cp "$source_path/src/Pivot.AlertHandler/local.settings.json" "$destination_path/$worktree_folder_name/src/Pivot.AlertHandler/"
cp "$source_path/src/Pivot.JiraSync/local.settings.json" "$destination_path/$worktree_folder_name/src/Pivot.JiraSync/"
cp "$source_path/src/Pivot.Autopayments/local.settings.json" "$destination_path/$worktree_folder_name/src/Pivot.Autopayments/"
cp "$source_path/src/Pivot.HubSpotSync/local.settings.json" "$destination_path/$worktree_folder_name/src/Pivot.HubSpotSync/"

# change directory to the 'src' path for the new worktree
cd "$destination_path/$worktree_folder_name/src"

# Build dotnet if skip_steps is false
if [ "$skip_steps" != true ]; then
    dotnet build
fi

/c/tonic/shell-scripts/git/update-service-worker-appsettings.sh "$destination_path/$worktree_folder_name"

# Change directory to destination_path/worktree_folder_name
cd "$destination_path/$worktree_folder_name" || exit 1

# Open Visual Studio Code
code .

exit 0
