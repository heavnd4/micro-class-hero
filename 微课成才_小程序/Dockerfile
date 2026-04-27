# 腾讯云托管 Dockerfile — 微课成才后端
# 基础镜像：Python 3.11 slim（兼容 faster-whisper + ctranslate2）
FROM python:3.11-slim

# 系统依赖：FFmpeg（音视频处理）+ OpenCV 运行时库
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 安装 Python 依赖（用阿里云镜像加速）
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    -i https://mirrors.aliyun.com/pypi/simple \
    --extra-index-url https://download.pytorch.org/whl/cpu

# 复制项目代码（.dockerignore 会排除 models/ 和 temp_*/）
COPY . .

# 创建存储目录（云托管会自动挂载持久化存储）
RUN mkdir -p /app/models /app/temp_input /app/temp_output

# 环境变量
ENV PYTHONUNBUFFERED=1
ENV PORT=5000
ENV PADDLE_HOME=/app/models/.paddleocr
ENV FLAGS_use_mkldnn=0

EXPOSE 5000

# 使用 gunicorn 启动（云托管推荐，比 flask dev server 稳定）
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "1", "--threads", "4", "--timeout", "600", "app:app"]
