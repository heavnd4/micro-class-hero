# 腾讯云托管 Dockerfile — 微课成才后端
# 基础镜像：Python 3.11 slim（兼容 faster-whisper + ctranslate2）
FROM python:3.11-slim

# 系统依赖：FFmpeg（音视频处理）+ OpenCV 运行时库
RUN sed -i 's|deb.debian.org|mirrors.cloud.tencent.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || \
    sed -i 's|deb.debian.org|mirrors.cloud.tencent.com|g' /etc/apt/sources.list 2>/dev/null; \
    apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 复制模型文件（whisper ~464MB，利用 Docker 层缓存，代码改动不会重新复制）
COPY models/ ./models/

# 安装 Python 依赖（用腾讯云镜像加速，超时 120s）
COPY requirements.txt .
RUN pip install --no-cache-dir --timeout 120 -r requirements.txt \
    -i https://mirrors.cloud.tencent.com/pypi/simple \
    --extra-index-url https://download.pytorch.org/whl/cpu \
    --trusted-host mirrors.cloud.tencent.com

# 复制项目代码（.dockerignore 会排除 models/ 和 temp_*/）
COPY . .

# 创建临时目录（云托管会自动挂载持久化存储）
RUN mkdir -p /app/temp_input /app/temp_output

# 环境变量
ENV PYTHONUNBUFFERED=1
ENV PORT=5000
ENV PADDLE_HOME=/app/models/.paddleocr
ENV FLAGS_use_mkldnn=0

EXPOSE 5000

# 使用 gunicorn 启动（云托管推荐，比 flask dev server 稳定）
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "1", "--threads", "4", "--timeout", "600", "app:app"]
