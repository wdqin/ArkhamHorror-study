# ArkhamHorror-study 前后端启动教程

这份文档的目标很直接:

1. 在服务器上把项目跑起来
2. 启动前端和后端
3. 在你自己的网页浏览器里打开游戏页面

本文给你两条路线:

- 路线 A: `Docker` 一键启动，最适合“先把页面跑起来”
- 路线 B: 前后端开发模式，最适合“我要改代码并实时看效果”

如果你只是想尽快在浏览器里打开游戏页面，优先走路线 A。

## 先确认你现在在哪台机器上操作

如果仓库在远程服务器上，例如:

```bash
cd /root/ArkhamHorror-study
pwd
```

你应该看到:

```bash
/root/ArkhamHorror-study
```

后面所有命令都默认在这台部署服务器上执行。

## 路线 A: 用 Docker 启动，直接在浏览器访问

这是仓库里现成支持的最稳方案。根目录已经有 [docker-compose.yml](/root/ArkhamHorror-study/docker-compose.yml) 和 [setup.sql](/root/ArkhamHorror-study/setup.sql)。

### 第 1 步: 安装 Docker 和 Docker Compose

先检查:

```bash
docker --version
docker compose version
```

如果没有安装，可以在 Ubuntu 服务器上执行:

```bash
apt-get update
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

安装后再验证一次:

```bash
docker --version
docker compose version
```

### 第 2 步: 在项目根目录生成数据库密码文件

这个项目的 `db` 服务会读取 `config/postgres_password.txt`。

执行:

```bash
cd /root/ArkhamHorror-study
mkdir -p config
openssl rand -base64 32 > config/postgres_password.txt
```

检查文件是否生成:

```bash
ls -l config/postgres_password.txt
```

### 第 3 步: 启动服务

执行:

```bash
cd /root/ArkhamHorror-study
docker compose up -d
```

第一次启动会比较慢，因为需要拉镜像或者构建镜像。

### 第 4 步: 查看容器状态

执行:

```bash
docker compose ps
```

你至少应该看到两个服务:

- `db`
- `web`

如果 `web` 没起来，继续看日志:

```bash
docker compose logs -f web
```

如果数据库有问题，看:

```bash
docker compose logs -f db
```

看到服务正常监听后，用 `Ctrl+C` 退出日志即可，容器会继续后台运行。

### 第 5 步: 放行端口

仓库里的 [docker-compose.yml](/root/ArkhamHorror-study/docker-compose.yml) 把网页服务暴露在服务器的 `3000` 端口。

如果服务器开了防火墙，需要放行 `3000`:

```bash
ufw allow 3000/tcp
ufw status
```

如果你的服务器在云平台上，还要在安全组里放行 TCP `3000`。

### 第 6 步: 在浏览器打开页面

在你自己的电脑浏览器里访问:

```text
http://你的服务器IP:3000
```

如果你已经绑定了域名，就访问:

```text
http://你的域名:3000
```

例如:

```text
http://203.0.113.10:3000
```

打开成功后，你应该能看到游戏首页。

### 第 7 步: 如果浏览器打不开，按这个顺序排查

先在服务器本机测试:

```bash
curl http://127.0.0.1:3000/health
```

再测试首页:

```bash
curl -I http://127.0.0.1:3000
```

如果本机能通，但你电脑浏览器打不开，通常是下面几种原因:

- 服务器防火墙没放行 `3000`
- 云安全组没放行 `3000`
- 你访问错了 IP
- 服务还没完全启动完成

## 路线 B: 开发模式分别启动前端和后端

这条路线适合你准备改代码。仓库里已经写明:

- 后端开发命令见 [backend/Makefile](/root/ArkhamHorror-study/backend/Makefile)
- 前端开发命令见 [frontend/package.json](/root/ArkhamHorror-study/frontend/package.json)
- 端口配置见 [frontend/vite.config.js](/root/ArkhamHorror-study/frontend/vite.config.js) 和 [backend/arkham-api/config/settings.yml](/root/ArkhamHorror-study/backend/arkham-api/config/settings.yml)

开发模式的端口关系是:

- 前端: `8080`
- 后端: `3002`
- 前端会把 `/api` 和 `/health` 代理到 `127.0.0.1:3002`

也就是说，浏览器最终访问的是:

```text
http://你的服务器IP:8080
```

### 第 1 步: 安装系统依赖

先安装数据库和基础编译依赖:

```bash
apt-get update
apt-get install -y build-essential curl git libffi-dev libgmp-dev libncurses-dev libpq-dev libtinfo5 libz-dev postgresql postgresql-contrib pkg-config
```

### 第 2 步: 安装 Node.js

前端是 Vite 项目，建议 Node 20 或更高版本。

检查:

```bash
node -v
npm -v
```

如果没有安装，可以用 NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
```

然后安装前端依赖:

```bash
cd /root/ArkhamHorror-study/frontend
npm install
```

### 第 3 步: 安装 Stack 和 GHC

后端是 Haskell + Stack 项目，编译器版本在 [backend/stack.yaml](/root/ArkhamHorror-study/backend/stack.yaml) 里写的是 `ghc-9.12.2`。

先安装 Stack:

```bash
curl -sSL https://get.haskellstack.org/ | sh
```

检查:

```bash
stack --version
```

注意:

- 这个仓库的 `stack.yaml` 里是 `system-ghc: true`
- 这意味着你需要系统里已经有对应的 GHC

最稳妥的做法是安装 `ghcup`，然后用它装 `ghc 9.12.2`:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://get-ghcup.haskell.org | sh
source ~/.ghcup/env
ghcup install ghc 9.12.2
ghcup set ghc 9.12.2
```

检查:

```bash
ghc --version
```

### 第 4 步: 初始化数据库

先启动 PostgreSQL:

```bash
systemctl enable postgresql
systemctl restart postgresql
```

创建数据库:

```bash
sudo -u postgres createuser -s root
createdb arkham-horror-backend
psql arkham-horror-backend < /root/ArkhamHorror-study/setup.sql
```

这个项目默认后端数据库连接串在 [backend/arkham-api/config/settings.yml](/root/ArkhamHorror-study/backend/arkham-api/config/settings.yml) 里是:

```text
postgres://localhost:5432/arkham-horror-backend
```

如果你本机 Postgres 身份认证比较严格，导致连接失败，可以显式设置连接串:

```bash
export DATABASE_URL=postgres://127.0.0.1:5432/arkham-horror-backend
```

### 第 5 步: 启动后端

打开第一个终端:

```bash
cd /root/ArkhamHorror-study/backend
make api.watch
```

这个命令会编译很久，第一次尤其久。成功后，后端会监听 `3002`。

你可以在第二个终端检查:

```bash
curl http://127.0.0.1:3002/health
```

### 第 6 步: 启动前端

打开第二个终端:

```bash
cd /root/ArkhamHorror-study/frontend
npm run dev -- --host 0.0.0.0
```

说明:

- 仓库默认 Vite 端口是 `8080`
- 加上 `--host 0.0.0.0` 后，远程服务器外部浏览器才能访问

### 第 7 步: 放行开发端口

如果你是远程服务器，需要放行 `8080`:

```bash
ufw allow 8080/tcp
ufw status
```

如果后端也需要被外部直接调试，再额外放行 `3002`。只是通过前端网页访问的话，通常不需要对外暴露 `3002`。

### 第 8 步: 在浏览器打开开发页面

在你自己的电脑浏览器里访问:

```text
http://你的服务器IP:8080
```

例如:

```text
http://203.0.113.10:8080
```

如果页面能打开，但接口报错，通常说明前端起来了、后端没起来。优先回去检查后端终端输出。

## 图片资源说明

这个项目默认会从 CDN 读取图片资源，所以通常不需要额外下载卡牌图片，也能正常打开页面。

相关说明在 [README.md](/root/ArkhamHorror-study/README.md) 里已经写明。

如果你确实要把图片下载到本地，可以执行:

```bash
cd /root/ArkhamHorror-study
docker compose --profile fetch-images run --rm fetch-images en
```

或者:

```bash
make fetch-images-docker
```

## 推荐你实际采用的方式

如果目标只是“部署服务器后，在浏览器里打开游戏页面”，建议直接用路线 A:

1. 生成 `config/postgres_password.txt`
2. 运行 `docker compose up -d`
3. 放行 `3000`
4. 浏览器访问 `http://服务器IP:3000`

如果目标是“我要开发和改代码”，再走路线 B。

## 一组最短可执行命令

如果你只想最快跑起来，在服务器上执行下面这组:

```bash
cd /root/ArkhamHorror-study
mkdir -p config
openssl rand -base64 32 > config/postgres_password.txt
docker compose up -d
docker compose ps
curl http://127.0.0.1:3000/health
```

然后在你自己的浏览器访问:

```text
http://你的服务器IP:3000
```
