#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/apps/ai-fortune}"
BRANCH="${BRANCH:-main}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
REPO_URL="${REPO_URL:-https://github.com/1781194749/ai-fortune.git}"
RUN_PRISMA_MIGRATE="${RUN_PRISMA_MIGRATE:-${RUN_PRISMA_PUSH:-true}}"
RUN_DB_SEED="${RUN_DB_SEED:-true}"
RUN_DB_BACKUP="${RUN_DB_BACKUP:-true}"
DB_BACKUP_DIR="${DB_BACKUP_DIR:-/opt/backups/ai-fortune/postgres}"
SKIP_GIT_SYNC="${SKIP_GIT_SYNC:-false}"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required on the server." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required on the server." >&2
  exit 1
fi

docker_cmd() {
  if docker ps >/dev/null 2>&1; then
    docker "$@"
  else
    sudo docker "$@"
  fi
}

compose() {
  docker_cmd compose --env-file .env.production.local -f "${COMPOSE_FILE}" "$@"
}

backup_postgres() {
  if [ "${RUN_DB_BACKUP}" = "false" ]; then
    return
  fi

  local backup_name
  backup_name="predeploy-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"

  sudo mkdir -p "${DB_BACKUP_DIR}"
  sudo chown "$(id -u):$(id -g)" "${DB_BACKUP_DIR}"
  compose exec -T postgres sh -lc 'pg_dump -h 127.0.0.1 -U "$POSTGRES_USER" "$POSTGRES_DB"' \
    | gzip > "${DB_BACKUP_DIR}/${backup_name}"
  find "${DB_BACKUP_DIR}" -type f -name 'predeploy-*.sql.gz' -mtime +30 -delete
  echo "PostgreSQL backup written to ${DB_BACKUP_DIR}/${backup_name}"
}

if [ "${SKIP_GIT_SYNC}" != "true" ] && [ ! -d "${APP_DIR}/.git" ]; then
  if [ ! -w "$(dirname "${APP_DIR}")" ]; then
    sudo mkdir -p "$(dirname "${APP_DIR}")"
    sudo chown "$(id -u):$(id -g)" "$(dirname "${APP_DIR}")"
  else
    mkdir -p "$(dirname "${APP_DIR}")"
  fi
  git clone --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
fi

cd "${APP_DIR}"

if [ "${SKIP_GIT_SYNC}" != "true" ] && [ -d ".git" ]; then
  git fetch origin "${BRANCH}"
  git checkout "${BRANCH}"
  git reset --hard "origin/${BRANCH}"
fi

if [ ! -f ".env.production.local" ]; then
  echo "Missing ${APP_DIR}/.env.production.local; create it from .env.production.example before deploying." >&2
  exit 1
fi

compose --profile tools build ai-fortune ai-fortune-tools
compose up -d --wait postgres redis

if [ "${RUN_PRISMA_MIGRATE}" != "false" ]; then
  backup_postgres
  compose --profile tools run -T --rm ai-fortune-tools npm run prisma:migrate:deploy
fi

if [ "${RUN_DB_SEED}" != "false" ]; then
  compose --profile tools run -T --rm ai-fortune-tools npm run db:seed
fi

compose up -d --remove-orphans
compose ps

if command -v curl >/dev/null 2>&1; then
  APP_PORT="$(compose port ai-fortune 3000 2>/dev/null | awk -F: 'END { print $NF }')"
  APP_PORT="${APP_PORT:-3000}"
  curl --fail --silent --show-error --retry 12 --retry-delay 5 "http://127.0.0.1:${APP_PORT}/" >/dev/null
fi
