#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/apps/ai-fortune}"
SOURCE_ARCHIVE="${SOURCE_ARCHIVE:-/tmp/ai-fortune-source.tgz}"

if [ -z "${APP_DIR}" ] || [ "${APP_DIR}" = "/" ]; then
  echo "Refusing unsafe APP_DIR=${APP_DIR}" >&2
  exit 1
fi

sudo mkdir -p "$(dirname "${APP_DIR}")"
sudo chown "$(id -u):$(id -g)" "$(dirname "${APP_DIR}")"
mkdir -p "${APP_DIR}"

find "${APP_DIR}" -mindepth 1 \
  ! -name ".env.production.local" \
  ! -path "${APP_DIR}/.env.production.local" \
  -exec rm -rf {} +

tar -xzf "${SOURCE_ARCHIVE}" -C "${APP_DIR}"
