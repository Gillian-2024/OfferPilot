#!/usr/bin/env bash
# OfferPilot 数据库备份：容器内 pg_dump 到 db/backups/，gzip 压缩，保留最近 N 份。
# 用法：
#   db/backup.sh                 # 备份到 db/backups/offerpilot-<本地时间>.sql.gz
#   db/backup.sh --keep 7        # 只保留最近 7 份，其余删除
# 连接信息取 db/.env（POSTGRES_*）；容器名取 db/docker-compose.yml 的 container_name。
# 不依赖本机 postgres 客户端——优先用容器内 pg_dump（docker exec）。
# 生产自建建议 cron 每天一次（示例，换成你的绝对路径）：
#   0 3 * * * /opt/offerpilot/db/backup.sh --keep 7 >> /var/log/offerpilot-backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")"
# 读同级 db/.env（POSTGRES_USER/PASSWORD/DB），密码由容器/环境变量提供，不出现在命令行。
if [ -f .env ]; then set -a; . ./.env; set +a; fi

# 容器名（与 docker-compose.yml 的 container_name 一致）
CONTAINER="${POSTGRES_CONTAINER:-offerpilot-db}"
# 备份方式：exec=走容器内 pg_dump(默认，本机无客户端也能用)；host=走本机 postgres 客户端
MODE="${POSTGRES_BACKUP_MODE:-exec}"
PGUSER="${POSTGRES_USER:-offerpilot}"
PGDATABASE="${POSTGRES_DB:-offerpilot}"

KEEP="${2:-7}"
if [ "${1:-}" = "--keep" ]; then KEEP="${2:-7}"; fi

mkdir -p backups
OUT="backups/offerpilot-$(date +%Y%m%d_%H%M%S).sql.gz"

if [ "$MODE" = "exec" ]; then
  # 容器内 pg_dump 直出管道 → gzip；密码继承容器 env，命令行无密码
  docker exec "$CONTAINER" pg_dump -U "$PGUSER" -d "$PGDATABASE" | gzip > "$OUT"
else
  export PGPASSWORD="${POSTGRES_PASSWORD:-}"
  PGHOST="${PGHOST:-127.0.0.1}"; PGPORT="${PGPORT:-5432}"
  pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" | gzip > "$OUT"
fi
echo "已备份: $OUT ($( du -h "$OUT" | cut -f1 ))"

# 只保留最近 KEEP 份（BSD/macOS head 不支持负数行号，用排序+tail 兼容）
find backups -name 'offerpilot-*.sql.gz' -type f | sort | tail -n +"$((KEEP+1))" | xargs -r rm -f
echo "保留最近 ${KEEP} 份。"
