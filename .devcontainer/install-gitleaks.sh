#!/usr/bin/env bash
# gitleaks を公式リリースから取得し、チェックサムを検証してから /usr/local/bin に配置する。
# devcontainer（postCreateCommand）と CI の両方で使う。版はここだけで管理する。
set -euo pipefail

GITLEAKS_VERSION="8.30.1"

case "$(uname -m)" in
x86_64) ARCH="x64" ;;
aarch64 | arm64) ARCH="arm64" ;;
*)
	echo "未対応の CPU アーキテクチャです: $(uname -m)" >&2
	exit 1
	;;
esac

if command -v gitleaks >/dev/null 2>&1 && [ "$(gitleaks version)" = "${GITLEAKS_VERSION}" ]; then
	echo "gitleaks ${GITLEAKS_VERSION} はインストール済みです"
	exit 0
fi

BASE_URL="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}"
TARBALL="gitleaks_${GITLEAKS_VERSION}_linux_${ARCH}.tar.gz"
CHECKSUMS="gitleaks_${GITLEAKS_VERSION}_checksums.txt"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "${WORK_DIR}"' EXIT
cd "${WORK_DIR}"

curl -fsSL -o "${TARBALL}" "${BASE_URL}/${TARBALL}"
curl -fsSL -o "${CHECKSUMS}" "${BASE_URL}/${CHECKSUMS}"

# 該当する行が無い場合も sha256sum -c が失敗するので、検証を飛ばすことはない
if ! grep " ${TARBALL}\$" "${CHECKSUMS}" | sha256sum -c -; then
	echo "チェックサムが一致しません。インストールを中止します" >&2
	exit 1
fi

tar -xzf "${TARBALL}" gitleaks
sudo install -m 0755 gitleaks /usr/local/bin/gitleaks
gitleaks version
