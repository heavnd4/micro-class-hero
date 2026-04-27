# 使用 Python 3.11 基础镜像
FROM python:3.11-slim

# 安装系统依赖 (FFmpeg 和 OpenCV 基础库)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /app

# 复制依赖文件并安装
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple

# 复制项目代码
COPY . .

# 环境变量：指明模型存储位置 (云端建议挂载云存储或预下载)
ENV PADDLE_HOME=/app/models/.paddleocr
ENV FLAGS_use_mkldnn=0

# 暴露 Flask 端口
EXPOSE 5000

# 启动命令
CMD ["python", "app.py"]
