#!/usr/bin/env bash
# OfferPilot 数据库恢复：从 db/backups/ 的 .sql.gz 还原到本机容器。
# 用法：db/restore.sh backups/offerpilot-YYYYMMDD_HHMMSS.sql.gz
# 安全：只连 127.0.0.1 的本机容器；恢复会覆盖目标库，请先备份当前库。
set -euo pipefail
cd "$(dirname "$0")"
if [ $# -lt 1 ]; then echo "用法: db/restore.sh <backups/*.sql.gz>"; exit 1; fi
if [ -f .env ]; then set -a; . ./.env; set +a; fi
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${POSTGRES_USER:-offerpilot}"
PGDATABASE="${POSTGRES_DB:-offerpilot}"
export PGPASSWORD="${POSTGRES_PASSWORD:-}"
gunzip -c "$1" | psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE"
echo "已从 $1 恢复到 ${PGDATABASE}"
