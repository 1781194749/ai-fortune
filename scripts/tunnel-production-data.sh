#!/usr/bin/env bash
set -euo pipefail

SERVER_HOST="${SERVER_HOST:-120.53.234.90}"
SERVER_USER="${SERVER_USER:-ubuntu}"
SERVER_PORT="${SERVER_PORT:-22}"
SSH_KEY="${SSH_KEY:-${HOME}/.ssh/id_ed25519}"
LOCAL_POSTGRES_PORT="${LOCAL_POSTGRES_PORT:-15432}"
LOCAL_REDIS_PORT="${LOCAL_REDIS_PORT:-16379}"
REMOTE_POSTGRES_PORT="${REMOTE_POSTGRES_PORT:-5432}"
REMOTE_REDIS_PORT="${REMOTE_REDIS_PORT:-6379}"

if [ ! -f "${SSH_KEY}" ]; then
  echo "SSH key not found: ${SSH_KEY}" >&2
  exit 1
fi

cat <<INFO
Opening production data tunnel:
  PostgreSQL localhost:${LOCAL_POSTGRES_PORT} -> ${SERVER_HOST}:127.0.0.1:${REMOTE_POSTGRES_PORT}
  Redis      localhost:${LOCAL_REDIS_PORT} -> ${SERVER_HOST}:127.0.0.1:${REMOTE_REDIS_PORT}

Keep this terminal open while your local app or database client is connected.
INFO

exec ssh \
  -i "${SSH_KEY}" \
  -p "${SERVER_PORT}" \
  -N \
  -T \
  -o ExitOnForwardFailure=yes \
  -L "127.0.0.1:${LOCAL_POSTGRES_PORT}:127.0.0.1:${REMOTE_POSTGRES_PORT}" \
  -L "127.0.0.1:${LOCAL_REDIS_PORT}:127.0.0.1:${REMOTE_REDIS_PORT}" \
  "${SERVER_USER}@${SERVER_HOST}"
