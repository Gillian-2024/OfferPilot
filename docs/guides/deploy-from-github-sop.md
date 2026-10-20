# OfferPilot：从 GitHub SSH 拉取到独立网站的小白 SOP

适用：全新 Ubuntu 24.04 服务器，有 sudo 权限；自有域名直接解析到服务器，不经过 Cloudflare 代理。整理日期：2026-10-20。

本文按当前仓库脚本编写，未在一台全新服务器上实测。不是把命令在自己电脑上全部运行：每一步标明了执行位置。已有网站/数据库的服务器不要直接照搬覆盖。

## 0. 先弄懂要做什么

SSH 有两段连接：你的电脑 → 服务器（登录服务器）；服务器 → GitHub（下载代码）。两段身份认证互相独立。不要索要或复制项目作者的私钥。

最终结构：浏览器 → 你的域名 HTTPS → Nginx → OfferPilot → 你自己的 PostgreSQL / 模型接口。

需要准备：GitHub 账号、Ubuntu 24.04 云服务器（建议至少 2 核 4GB，构建时更宽裕）、服务器登录凭据、自有域名、模型平台 API Key 及可用额度。仓库代码不包含原站的用户数据、模型额度和真实密钥。

约定：下文 `YOUR_SERVER_IP` 换成服务器公网 IP；`YOUR_DOMAIN` 换成你的域名；`YOUR_LOGIN_USER` 换成云平台提供的用户名。不要原样保留这些占位符。

云平台安全组：22 端口只允许你的管理 IP；80、443 允许网站访客访问。不开放 3000、5432。若系统还配置了防火墙，也要放行对应端口。域名在 DNS 控制台添加 A 记录指向服务器 IP；没配置 IPv6 就不要添加 AAAA 记录。大陆服务器使用域名公开提供网站前，按云服务商要求完成备案等手续。

## 1. 登录服务器

【在自己的电脑终端执行】Windows 可用 PowerShell，macOS 用“终端”。

```bash
ssh YOUR_LOGIN_USER@YOUR_SERVER_IP
```

云平台使用密钥登录时，按它提供的命令加上 `-i 私钥文件路径`。首次连接先核对服务器指纹，再确认连接。后续步骤默认都在服务器中执行。

确认系统和权限：

```bash
cat /etc/os-release
sudo -v
```

## 2. 安装运行工具

【服务器】安装基础工具：

```bash
sudo apt update
sudo apt install -y git curl ca-certificates gnupg nginx openssl xz-utils snapd
```

### Node.js

安装 Node.js 22 的最新可用补丁版，使用系统级路径，使后台服务也能找到它。打开 [Node.js 22 官方下载页](https://nodejs.org/en/download/archive/v22)，按服务器架构选择 Linux Binary：`uname -m` 输出 x86_64 对应 x64，aarch64 对应 arm64。

```bash
uname -m
```

复制官方二进制下载链接，将下面的 `PASTE_NODE_TAR_XZ_URL` 替换后运行：

```bash
curl -fL 'PASTE_NODE_TAR_XZ_URL' -o /tmp/offerpilot-node.tar.xz
sudo tar -xJf /tmp/offerpilot-node.tar.xz -C /usr/local --strip-components=1
node -v
npm -v
```

成功标准：Node 显示 v22.x。已有系统级 Node 22 可跳过安装；本文不使用 nvm，避免后台服务找不到 Node。

### Docker 与 Compose

使用 [Docker 官方 Ubuntu 安装步骤](https://docs.docker.com/engine/install/ubuntu/) 的 apt 仓库方式。全新服务器可执行：

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
printf 'Types: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: %s\nComponents: stable\nArchitectures: %s\nSigned-By: /etc/apt/keyrings/docker.asc\n' "$VERSION_CODENAME" "$(dpkg --print-architecture)" | sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker compose version
sudo docker run --rm hello-world
```

为当前部署用户开放 Docker 权限（该权限近似管理员，只给可信管理用户）：

```bash
sudo usermod -aG docker "$USER"
```

退出服务器并重新 SSH 登录，再执行：

```bash
docker ps
```

成功标准：无 permission denied。后续不要随意切换用户，以免代码、SSH 和服务归属不一致。

## 3. 为 GitHub 配置 SSH

【服务器，部署用户】生成专用密钥：

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
ssh-keygen -t ed25519 -C 'offerpilot-deploy' -f ~/.ssh/offerpilot_github
```

按提示设置口令；不会显示输入字符是正常现象。如果提示文件已经存在，不要覆盖，换文件名并同步调整后面的路径。

```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/offerpilot_github
cat ~/.ssh/offerpilot_github.pub
```

复制最后显示的整行公钥。在 GitHub 网页打开头像 → Settings → SSH and GPG keys → New SSH key，类型选择 Authentication Key，粘贴并保存。只复制 `.pub` 文件；不带 `.pub` 的文件是私钥，不要发给别人或上传到仓库。

测试时显式使用这把密钥：

```bash
ssh -i ~/.ssh/offerpilot_github -o IdentitiesOnly=yes -T git@github.com
```

首次连接核对 [GitHub 官方 SSH 指纹](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints)，一致后确认。成功提示类似 `Hi 用户名! You've successfully authenticated...`；GitHub 不提供 shell access 是正常提示。

官方参考：[生成 SSH 密钥](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent)。

## 4. 下载 OfferPilot 代码

【服务器】

```bash
sudo mkdir -p /opt/offerpilot
sudo chown "$USER":"$(id -gn)" /opt/offerpilot
GIT_SSH_COMMAND='ssh -i ~/.ssh/offerpilot_github -o IdentitiesOnly=yes' git clone git@github.com:Gillian-2024/OfferPilot.git /opt/offerpilot
cd /opt/offerpilot
git log -1 --oneline
```

如果目录非空，先检查内容，不要直接删除。公开仓库也可以用 HTTPS 下载，不配置 GitHub SSH 也能获取；本 SOP 按 SSH 路线演示。想长期独立修改，可先在 GitHub Fork 到自己的账号，再把克隆地址换成自己的仓库。

## 5. 填写自己的密钥和数据库配置

【服务器 `/opt/offerpilot`】用随机十六进制密码，避免数据库连接串特殊字符转义问题：

```bash
cd /opt/offerpilot
umask 077
OP_DB_PASSWORD=$(openssl rand -hex 24)
OP_JWT_SECRET=$(openssl rand -hex 32)
cat > db/.env <<ENV
POSTGRES_USER=offerpilot
POSTGRES_PASSWORD=$OP_DB_PASSWORD
POSTGRES_DB=offerpilot
ENV
cat > .env.local <<ENV
JWT_SECRET=$OP_JWT_SECRET
COOKIE_SECURE=true
DATABASE_URL=postgres://offerpilot:$OP_DB_PASSWORD@127.0.0.1:5432/offerpilot
PGSSL=disable
DEFAULT_PROVIDER=zhipu
ZHIPU_API_KEY=REPLACE_WITH_YOUR_API_KEY
ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4
ZHIPU_MODEL=REPLACE_WITH_YOUR_AVAILABLE_MODEL_ID
ADMIN_USERNAMES=
ENV
unset OP_DB_PASSWORD OP_JWT_SECRET
chmod 600 .env.local db/.env
nano .env.local
```

把 API Key 和模型 ID 改成自己智谱账号真实可用的值，保存退出：Ctrl+O、回车、Ctrl+X。模型 ID 从平台控制台确认，不要凭产品展示名填写。当前仓库模板中的默认模型名不保证你的账号可调用。

`JWT_SECRET` 用于登录身份签名；`DATABASE_URL` 用于连接自己的数据库；`ADMIN_USERNAMES` 是后台邮箱白名单，可留空。`COOKIE_SECURE=true` 要通过 HTTPS 使用网站，HTTP 下登录可能不生效。

这里不需要原作者的 `.env.local`。不要把真实 Key、密码或环境文件提交到 GitHub。部署脚本会把 `.env.local` 当 shell 文件读取，因此本文件保持 `变量名=值` 形式，不写空格、注释式尾缀或任意命令；粘贴含特殊字符的值时正确使用引号。

## 6. 构建前端，再部署应用

【服务器】这是直接拉 GitHub 代码时必须补上的步骤：`deploy/deploy.sh` 只构建 Next，默认前端已经构建好。

```bash
cd /opt/offerpilot/client
npm ci --no-audit --fund=false
npm run build
cd /opt/offerpilot
test -f client/dist/index.html && echo '前端构建完成'
bash deploy/deploy.sh
```

脚本会启动 PostgreSQL、安装根目录依赖、运行数据库迁移、构建 Next，并安装/启动后台服务。需要时输入 sudo 密码。

```bash
sudo systemctl status offerpilot --no-pager
curl -I http://127.0.0.1:3000/login
```

成功标准：服务 active (running)，`/login` 返回 200。这只代表应用启动，不代表模型调用和全部业务功能通过。

## 7. 配置域名入口

【域名控制台】确认 YOUR_DOMAIN 的 A 记录已指向这台服务器，且 80/443 已放行。本路线不使用 Cloudflare 代理。

【服务器】创建全新的站点配置。**不要直接复制仓库 `deploy/nginx.conf`：它写死了作者域名、证书路径和 Cloudflare 配置。**

```bash
sudo nano /etc/nginx/sites-available/offerpilot
```

粘贴下面内容，把 `YOUR_DOMAIN` 换成自己的域名：

```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN;
    client_max_body_size 20m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

启用站点：

```bash
sudo ln -s /etc/nginx/sites-available/offerpilot /etc/nginx/sites-enabled/offerpilot
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

软链接如果提示已存在，检查是否已经指向正确文件，不要重复创建。保留系统其他站点，无需删除。

## 8. 开启 HTTPS

【服务器】按 [Certbot 官方 Nginx 指南](https://certbot.eff.org/instructions?ws=nginx&os=ubuntufocal) 安装 snap 版并申请证书。已装其他来源 Certbot 时先按官方迁移说明处理，不要混装。

```bash
sudo snap install --classic certbot
sudo /snap/bin/certbot --nginx -d YOUR_DOMAIN
```

将 `YOUR_DOMAIN` 替换为实际域名，按提示填写邮箱和接受条款，启用 HTTP 跳转 HTTPS。申请失败时先检查域名解析、80 端口和错误提示，不要反复盲目申请。

```bash
sudo nginx -t
sudo /snap/bin/certbot renew --dry-run
curl -I https://YOUR_DOMAIN/login
```

成功标准：浏览器能访问 `https://你的域名`，证书有效，续期演练成功。只有同时配置了 www 的 DNS 和证书，才使用 www 地址。

## 9. 网站验收

用无痕窗口访问自己的 HTTPS 域名，逐项确认：

- 页面正常显示；注册新账号、退出、重新登录成功。
- 输入一段不含隐私的测试 JD，能得到分析，模型平台可见调用记录。
- 简历分析、面试准备、面试复盘分别测试一次。
- AI 输出能逐步出现；没有一直等待后才突然整段显示。
- 历史记录刷新后仍存在；另一测试账号看不到前一个账号的私有记录。
- 按产品支持的格式上传一份测试文件，确认解析正常。

不要为了排错向公网开放数据库或应用端口。上线前检查是否还需替换作者的品牌、联系信息、隐私条款和运营配置；技术部署成功不代表这些内容已适配你的服务。

## 10. 后续更新与备份

更新前先备份数据库，并记录当前版本：

```bash
cd /opt/offerpilot
mkdir -p db/backups
( set -o pipefail; docker exec offerpilot-db pg_dump -U offerpilot -d offerpilot | gzip > "db/backups/manual-$(date +%Y%m%d_%H%M%S).sql.gz" )
git rev-parse HEAD
git status --short
```

有自己修改的文件时先处理差异；不要用强制重置覆盖。工作区干净时更新：

```bash
GIT_SSH_COMMAND='ssh -i ~/.ssh/offerpilot_github -o IdentitiesOnly=yes' git pull --ff-only
cd client
npm ci --no-audit --fund=false
npm run build
cd ..
bash deploy/deploy.sh
```

再做第 9 步验收。重新登录后若密钥有口令，可重新启动 ssh-agent 并 ssh-add。

备份位于 `db/backups/`，还应定期复制到其他安全存储；只存在同一服务器不能防服务器丢失。注意：当前仓库 `db/backup.sh` 的保留逻辑存在问题，可能删除较新的备份，本 SOP 改用上面的直接备份命令，不自动清理。不要删除 Docker 的数据库卷。应用回退不等于数据库回退，迁移异常时不要盲目覆盖数据库。

## 常见问题

| 现象 | 先检查什么 |
|---|---|
| GitHub `Permission denied (publickey)` | 公钥是否加到自己的 GitHub，命令是否指定正确私钥 |
| GitHub 22 端口超时 | 按 [GitHub 官方 443 SSH 指南](https://docs.github.com/en/authentication/troubleshooting-ssh/using-ssh-over-the-https-port) 检查网络或改用 HTTPS 克隆 |
| Docker permission denied | 是否加组后重新登录服务器 |
| 构建失败 / 被 Killed | 看第一条错误；被 Killed 常需检查内存，不能把构建失败当成功继续 |
| 页面空白或缺资源 | 是否完成 client 构建，client/dist/index.html 是否存在 |
| 502 Bad Gateway | 应用服务是否运行，查看下方日志 |
| 数据库密码错误 | 两份环境文件是否一致；已有数据库初始化后改 db/.env 不会自动修改库内密码 |
| AI 请求失败 | Key、额度、模型 ID、服务器到模型平台网络和服务日志 |
| 登录后仍未登录 | 是否在 HTTPS 域名访问；COOKIE_SECURE=true 时不要用 HTTP 验收 |
| 证书申请失败 | 域名是否解析到这台机器，80 是否可访问，是否误留 AAAA 记录 |

排查命令：

```bash
sudo journalctl -u offerpilot -n 100 --no-pager
docker compose -f /opt/offerpilot/db/docker-compose.yml --env-file /opt/offerpilot/db/.env ps
sudo nginx -t
```

日志可能包含用户内容或配置线索，发给别人排错前先脱敏。
