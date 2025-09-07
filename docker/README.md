# zotero-pdf2zh Docker 使用说明

> 如果你想使用 **pdf2zh**（而不是 **pdf2zh_next**）作为翻译引擎，请直接跳到文末章节：**“（可选）切换为 pdf2zh”**。

## 0. 先确认 Docker 就绪

```bash
docker version
docker compose version
```

> 如果显示不了 `docker compose`，你可能安装的是老版 `docker-compose`，后续命令把 `docker compose` 换成 `docker-compose` 即可。

---

## 1. 下载并解压 `docker.zip`

### Windows（CMD）

```cmd
mkdir zotero-pdf2zh_docker
cd zotero-pdf2zh_docker

REM 下载
curl -L -o docker.zip https://raw.githubusercontent.com/guaguastandup/zotero-pdf2zh/main/docker.zip

REM 解压（任选一种；如命令行解压失败，可在资源管理器中右键解压到当前目录）
powershell -Command "Expand-Archive -Path '.\docker.zip' -DestinationPath '.' -Force"
REM 或者（如果 tar 可用）
REM tar -xf docker.zip

REM 进入 docker 子目录（里面有 Dockerfile 和 docker-compose.yaml）
cd docker
```

### macOS / Linux（终端）

```bash
mkdir -p zotero-pdf2zh_docker
cd zotero-pdf2zh_docker

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

## 3. 启动服务（在 `zotero-pdf2zh_docker/docker` 目录内）

```bash
docker compose up -d --build
```

看到类似输出即表示启动成功：

```cmd
* Running on http://127.0.0.1:8890
* Running on http://172.18.0.2:8890
```

常用命令：

```cmd
docker start zotero-pdf2zh
docker stop zotero-pdf2zh
docker logs -f zotero-pdf2zh   # 查看实时日志/排错
```

---

## （可选）切换为 `pdf2zh`

> 默认镜像是 `pdf2zh_next`。如果你只想用 **1.x** `pdf2zh`（`byaidu/pdf2zh:1.9.6`），按下述最小改动即可。

### 0）预拉取经典镜像

```bash
docker pull byaidu/pdf2zh:1.9.6
```

下面只给“改哪儿、怎么改”的最小改动，改完后重构即可。

---

## 1) 修改 Dockerfile

**A. 更换镜像变量，改为1.x**  

找到：

```dockerfile
    ZOTERO_PDF2ZH_FROM_IMAGE=awwaawwa/pdfmathtranslate-next:latest
```

改为：

```dockerfile
    ZOTERO_PDF2ZH_FROM_IMAGE=byaidu/pdf2zh:1.9.6
```

**B. 删除“next 包装器”整段**  

找到

```dockerfile
RUN printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -euo pipefail' \
  'img="${ZOTERO_PDF2ZH_FROM_IMAGE:-awwaawwa/pdfmathtranslate-next:latest}"' \
  'cid="$(cat /etc/hostname)"' \
  'exec docker run --rm --volumes-from "${cid}" -e TZ -e http_proxy -e https_proxy -e HF_ENDPOINT "$img" pdf2zh_next "$@"' \
  > /usr/local/bin/pdf2zh_next && chmod +x /usr/local/bin/pdf2zh_next
```

整块修改为：

```dockerfile
RUN printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -euo pipefail' \
  'img="${ZOTERO_PDF2ZH_FROM_IMAGE:-byaidu/pdf2zh:1.9.6}"' \
  'cid="$(cat /etc/hostname)"' \
  'exec docker run --rm --volumes-from "${cid}" -e TZ -e http_proxy -e https_proxy -e HF_ENDPOINT "$img" pdf2zh "$@"' \
  > /usr/local/bin/pdf2zh && chmod +x /usr/local/bin/pdf2zh
```

> 其它内容（server.zip 下载、requirements 安装、entrypoint）保持不变。

## 2) 修改 `docker-compose.yaml`

找到

```yaml
      ZOTERO_PDF2ZH_FROM_IMAGE: awwaawwa/pdfmathtranslate-next:latest
```

改为：

```yaml
      ZOTERO_PDF2ZH_FROM_IMAGE: byaidu/pdf2zh:1.9.6
```

如需挂字体（可选，字体文件与 `docker-compose.yaml` 同级）：

```yaml
volumes:
  - ./translated:/app/server/translated
  - ./config:/app/server/config
  - ./LXGWWenKai-Regular.ttf:/app/LXGWWenKai-Regular.ttf:ro   # 可选
  - /var/run/docker.sock:/var/run/docker.sock
```

## 3) 重构启动（在 `docker` 目录）

```bash
docker compose down
docker compose up -d --build
```

常用命令：

```cmd
docker start zotero-pdf2zh
docker stop zotero-pdf2zh
docker logs -f zotero-pdf2zh   # 查看实时日志/排错
```

> 插件里把 **翻译引擎** 选成 `pdf2zh`（经典版）。祝您使用愉快！
