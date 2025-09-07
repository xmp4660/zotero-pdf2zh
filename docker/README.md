# zotero-pdf2zh Docker 使用说明

## 0. 先确认 Docker 就绪

> 当前docker仅适配了pdf2zh_next

```bash
docker version
docker compose version
```

> 如果显示不了 `docker compose`，你可能安装的是老版 `docker-compose`，后续命令把 `docker compose` 换成 `docker-compose` 即可。

---

## 1. 下载并解压 `docker.zip`

### Windows（CMD）

```cmd
mkdir zotero-pdf2zh_next-3.0
cd zotero-pdf2zh_next-3.0

REM 下载
curl -L -o docker.zip https://raw.githubusercontent.com/guaguastandup/zotero-pdf2zh/main/docker.zip

REM 解压（任选一种）
powershell -Command "Expand-Archive -Path '.\docker.zip' -DestinationPath '.' -Force"
REM 或者（如果 tar 可用）
REM tar -xf docker.zip

REM 进入 docker 子目录（里面有 Dockerfile 和 docker-compose.yaml）
cd docker
```

### macOS / Linux（终端）

```bash
mkdir -p zotero-pdf2zh_next-3.0
cd zotero-pdf2zh_next-3.0

# 下载
curl -L -o docker.zip https://raw.githubusercontent.com/guaguastandup/zotero-pdf2zh/main/docker.zip

# 解压（任选其一）
unzip -o docker.zip -d .
# 或
# tar -xf docker.zip

# 进入 docker 子目录（里面有官方 Dockerfile 和 docker-compose.yaml）
cd docker
```

解压后的 `docker/` 目录包含：

```txt
Dockerfile
docker-compose.yaml
config/         （空文件夹，用于挂载配置）
translated/     （空文件夹，用于挂载输出）
```

---

## 2. 预拉取 `pdf2zh_next` 镜像

运行时临时拉镜像容易超时，先拉更稳。

```bash
docker pull awwaawwa/pdfmathtranslate-next:latest
```

---

## 3. 启动服务（在 `zotero-pdf2zh_next-3.0/docker` 目录内）

```bash
docker compose up -d
docker compose logs -f pdf2zh-server
```

看到类似输出即表示启动成功：

```cmd
* Running on http://127.0.0.1:8890
* Running on http://172.18.0.2:8890
```

祝您使用愉快！
