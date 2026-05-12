#!/usr/bin/env bash
set -euo pipefail

# === プロファイル名(実際に使うものに置き換えてください) ===
PROFILE="my-dev-profile"

echo "Logging in with profile: $PROFILE"
export AWS_PROFILE="$PROFILE"

# === SSOログイン ===
aws sso login --profile "$PROFILE"

# === 成功確認 ===
echo "Logged in as:"
aws sts get-caller-identity --profile "$PROFILE"
