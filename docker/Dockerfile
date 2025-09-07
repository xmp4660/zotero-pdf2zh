# syntax=docker/dockerfile:1

# 先声明一次，后面阶段还能复用，避免 ${PY_BASE} 为空
ARG PY_BASE=python:3.12-slim

# 取官方 docker CLI 二进制（只要客户端，不起守护进程）
FROM docker:27-cli AS dockercli

# 在使用它的阶段前再声明一次（多阶段必须这样）
ARG PY_BASE
FROM ${PY_BASE}

# 基础工具
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      curl unzip ca-certificates dumb-init && \
    rm -rf /var/lib/apt/lists/*

# 复制 docker 客户端到最终镜像
COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
RUN docker --version

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8890 \
    TZ=Asia/Shanghai \
    ZOTERO_PDF2ZH_FROM_IMAGE=awwaawwa/pdfmathtranslate-next:latest

# server.zip 下载地址（可在构建时通过 build-arg 覆盖）
ARG SERVER_ZIP_URL="https://github.com/guaguastandup/zotero-pdf2zh/releases/download/v3.0.20-beta/server.zip"

WORKDIR /app

# 下载并解压 server.zip
RUN set -euo pipefail; \
    echo "Download server from: ${SERVER_ZIP_URL}"; \
    curl -L "${SERVER_ZIP_URL}" -o /tmp/server.zip && \
    mkdir -p /app/server && \
    unzip -q /tmp/server.zip -d /app && \
    rm -f /tmp/server.zip && \
    # 备份示例配置到不会被挂载遮住的位置
    mkdir -p /opt/pdf2zh-defaults && \
    for f in config.toml.example config.json.example venv.json.example; do \
      if [ -f "/app/server/config/$f" ]; then \
        cp "/app/server/config/$f" "/opt/pdf2zh-defaults/$f"; \
      fi; \
    done

# 安装 Python 依赖（全部在容器内完成；不用 venv）
RUN pip install --no-cache-dir -r /app/server/requirements.txt

# 放置 pdf2zh_next 壳脚本：把调用转给 next 镜像
# 关键：使用 --volumes-from $HOSTNAME 继承当前容器的挂载，从而在“子容器”里也能访问 /app/server/translated 与 /app/server/config
RUN printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -euo pipefail' \
  'img="${ZOTERO_PDF2ZH_FROM_IMAGE:-awwaawwa/pdfmathtranslate-next:latest}"' \
  'cid="$(cat /etc/hostname)"' \
  'exec docker run --rm --volumes-from "${cid}" -e TZ -e http_proxy -e https_proxy -e HF_ENDPOINT "$img" pdf2zh_next "$@"' \
  > /usr/local/bin/pdf2zh_next && chmod +x /usr/local/bin/pdf2zh_next

# 生成启动脚本：若挂载目录里缺失配置，则用备份示例生成；随后启动 server.py
RUN printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -euo pipefail' \
  'mkdir -p /app/server/translated /app/server/config' \
  '# 首次启动生成 config.toml/config.json/venv.json（如果缺失）' \
  'if [ ! -f /app/server/config/config.toml ] && [ -f /opt/pdf2zh-defaults/config.toml.example ]; then' \
  '  cp /opt/pdf2zh-defaults/config.toml.example /app/server/config/config.toml' \
  'fi' \
  'if [ ! -f /app/server/config/config.json ] && [ -f /opt/pdf2zh-defaults/config.json.example ]; then' \
  '  cp /opt/pdf2zh-defaults/config.json.example /app/server/config/config.json' \
  'fi' \
  'if [ ! -f /app/server/config/venv.json ] && [ -f /opt/pdf2zh-defaults/venv.json.example ]; then' \
  '  cp /opt/pdf2zh-defaults/venv.json.example /app/server/config/venv.json' \
  'fi' \
  '# 启动 server（固定 8890；禁用 venv、禁用自动更新；env_tool 让 server 走系统环境）' \
  'exec python /app/server/server.py --enable_venv=False --check_update=False --port="${PORT:-8890}" --env_tool=system' \
  > /usr/local/bin/entrypoint.sh && chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 8890
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/usr/local/bin/entrypoint.sh"]
