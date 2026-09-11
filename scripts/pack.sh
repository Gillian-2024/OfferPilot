#!/usr/bin/env bash
# OfferPilot 打包脚本 —— 生成 deploy.zip 用于服务器部署
#
# 技术栈(实测项目结构得出，非假设)：
#   Next.js 16 App Router(默认模式,非 standalone → 服务器需装依赖并 next build)
#   + client/ Vite SPA(产物 client/dist,由 app/[[...path]]/route.ts 从
#     process.cwd()/client/dist 读取 → zip 内必须保持该相对路径)
#   + PostgreSQL(db/ 迁移脚本随包上传)
#
# 用法：bash scripts/pack.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
OUT="$ROOT/deploy.zip"
STAGE="$(mktemp -d -t offerpilot-pack-XXXXXX)"   # macOS 要求模板以 XXXXXX 结尾
trap 'rm -rf "$STAGE"' EXIT

say() { printf '\033[36m==>\033[0m %s\n' "$1"; }

# ---------- 1. 构建前端(Next 在服务器构建,前端在本机构建以省服务器内存) ----------
say "构建 client(Vite: tsc -b && vite build)"
( cd client && npm run build )
[ -f "$ROOT/client/dist/index.html" ] || { echo "构建产物缺失: client/dist/index.html"; exit 1; }

# ---------- 2. 收集服务器运行必需文件 ----------
say "收集文件到暂存区"
mkdir -p "$STAGE/pkg"
cd "$STAGE/pkg"

# 应用源码(Next 需在服务器 build,故上传源码而非产物)
for d in app lib db; do
  rsync -a --exclude='.env' --exclude='backups/' "$ROOT/$d/" "./$d/"
done

# 前端构建产物(保持 client/dist 相对路径,catch-all 依赖它)
mkdir -p client
rsync -a "$ROOT/client/dist/" "./client/dist/"

# 根级运行必需配置
for f in package.json package-lock.json next.config.ts tsconfig.json proxy.ts; do
  cp "$ROOT/$f" "./$f"
done

# 部署脚本与环境模板
mkdir -p deploy
cp "$ROOT/deploy/deploy.sh" "./deploy/deploy.sh" 2>/dev/null || true
cp "$ROOT/deploy/nginx.conf" "./deploy/nginx.conf" 2>/dev/null || true
cp "$ROOT/deploy/offerpilot.service" "./deploy/offerpilot.service" 2>/dev/null || true
cp "$ROOT/deploy/env.production.example" "./.env.local.example" 2>/dev/null || true

# ---------- 3. 安全检查：确认无敏感文件混入 ----------
say "安全检查(密钥/env/数据库/构建缓存)"
LEAK="$(find . \( -name '.env' -o -name '.env.local' -o -name '*.bak' -o -name '*.bak.*' \
        -o -name '*.pem' -o -name '*.key' -o -name 'id_rsa*' -o -name 'id_ed25519*' \
        -o -name '*.db' -o -name '*.sqlite*' -o -name '.knowledge.enc' \) -print)"
if [ -n "$LEAK" ]; then echo "发现敏感文件,已中止："; echo "$LEAK"; exit 1; fi
# 内容层面再扫一次硬编码密钥
# 占位符(<...>、CHANGE_ME、your-xxx-here)不算真密钥,排除后再判
HITS="$(grep -rlEI "sk-[A-Za-z0-9]{16,}|postgres://[^ '\"]*:[^ '\"]+@" . 2>/dev/null \
  | grep -v 'client/dist' || true)"
for f in $HITS; do
  if grep -EI "sk-[A-Za-z0-9]{16,}|postgres://[^ '\"]*:[^ '\"]+@" "$f" \
     | grep -qvE "<[^>]+>|CHANGE_ME|your-[a-z-]+-here|例如|示例"; then
    echo "发现疑似硬编码密钥: $f"; exit 1
  fi
done
for x in node_modules .next .git .DS_Store; do
  [ -e "$x" ] && { echo "不该出现: $x"; exit 1; }
done

# ---------- 4. 打包 ----------
say "生成 deploy.zip"
rm -f "$OUT"
zip -rq "$OUT" . -x '*.DS_Store' -x '*/__tests__/*' -x '*.test.*'

cd "$ROOT"
say "完成: $OUT ($(du -h "$OUT" | cut -f1), $(unzip -l "$OUT" | tail -1 | awk '{print $2}') 个文件)"
echo
echo "排除项: node_modules / .next / .git / .env* / *.bak / 密钥 / *.db / server(旧架构) /"
echo "        scripts / docs / .code-review-graph / db/backups / 测试文件"
