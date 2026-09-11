#!/usr/bin/env bash
# OfferPilot 服务器一键部署 —— 在服务器上 unzip 后执行
#   bash deploy/deploy.sh
#
# 幂等：可重复执行(升级部署直接重跑)。
# 前置：已上传并解压 deploy.zip 到 /opt/offerpilot，且已写好 .env.local
set -euo pipefail
cd "$(dirname "$0")/.."
APP_DIR="$PWD"
SERVICE=offerpilot

say() { printf '\033[36m==>\033[0m %s\n' "$1"; }
die() { printf '\033[31m✗\033[0m %s\n' "$1"; exit 1; }

[ -f .env.local ] || die "缺少 .env.local(参考 .env.local.example 填写后重跑)"
grep -q '^JWT_SECRET=.\+' .env.local || die ".env.local 缺 JWT_SECRET(生成: openssl rand -hex 32)"
grep -q '^DATABASE_URL=.\+' .env.local || die ".env.local 缺 DATABASE_URL"

# ---------- 1. 系统依赖 ----------
say "检查系统依赖"
command -v node >/dev/null || die "未装 Node(见文档步骤1)"
NODE_MAJOR="$(node -v | sed 's/^v\([0-9]*\).*/\1/')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node 版本过低($(node -v)),需 >= 20"
command -v docker >/dev/null || die "未装 Docker(见文档步骤1)"

# ---------- 2. 数据库容器 ----------
say "启动 PostgreSQL 容器"
[ -f db/.env ] || die "缺少 db/.env(参考 db/.env.example,密码要与 .env.local 的 DATABASE_URL 一致)"
docker compose -f db/docker-compose.yml --env-file db/.env up -d
say "等待数据库就绪"
for i in $(seq 1 60); do
  if docker compose -f db/docker-compose.yml --env-file db/.env ps --format json 2>/dev/null | grep -q healthy; then break; fi
  [ "$i" = 60 ] && die "数据库 60s 未就绪,查看: docker compose -f db/docker-compose.yml logs"
  sleep 2
done

# ---------- 3. 应用依赖 ----------
say "安装依赖(npm ci --omit=dev 之外的构建期依赖也需要,故用完整 ci)"
npm ci --no-audit --fund=false

# ---------- 4. 数据库迁移(幂等) ----------
say "应用 schema + 认证列迁移 + 验收"
set -a; . ./.env.local; set +a
node db/apply.mjs
node db/migrate-auth.mjs
node db/verify.mjs

# ---------- 5. 构建 Next ----------
# 只构建 Next：client/dist 已随包上传(zip 内无 client 源码,不能跑 npm run build)
say "构建 Next(next.config.ts 已设 cpus:1,防 2G 内存被构建打满)"
NODE_ENV=production npx next build

# ---------- 6. systemd 守护 ----------
say "安装/重启 systemd 服务"
sed "s|__APP_DIR__|$APP_DIR|g; s|__USER__|$(id -un)|g" deploy/offerpilot.service \
  | sudo tee /etc/systemd/system/$SERVICE.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable $SERVICE
sudo systemctl restart $SERVICE

say "等待应用就绪"
for i in $(seq 1 40); do
  code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login || true)"
  [ "$code" = 200 ] && { say "应用已就绪 (/login 200)"; break; }
  [ "$i" = 40 ] && die "应用未就绪,查看: sudo journalctl -u $SERVICE -n 50 --no-pager"
  sleep 2
done

echo
say "部署完成"
echo "  状态: sudo systemctl status $SERVICE"
echo "  日志: sudo journalctl -u $SERVICE -f"
echo "  下一步(仅首次): 配置 Nginx + SSL,见部署文档步骤 6-7"
