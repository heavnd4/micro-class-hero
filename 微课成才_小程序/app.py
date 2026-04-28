from flask import Flask, render_template, jsonify, request, send_from_directory
from flask_cors import CORS
import json
import os
import threading
import uuid
import time
from pathlib import Path
from core_engine import VideoProcessor

app = Flask(__name__)
CORS(app)  # 云托管环境下跨域支持

# ========== 路径配置（兼容本地开发 + 云托管） ==========
BASE_PATH = Path(__file__).parent
# 云托管环境变量优先，本地开发回退到 temp_input/temp_output
VIDEO_DIR = Path(os.environ.get("VIDEO_DIR", str(BASE_PATH / "temp_input")))
OUTPUT_DIR = Path(os.environ.get("OUTPUT_DIR", str(BASE_PATH / "temp_output")))

# 确保目录存在
VIDEO_DIR.mkdir(exist_ok=True, parents=True)
OUTPUT_DIR.mkdir(exist_ok=True, parents=True)

# ========== 全局引擎（延迟初始化） ==========
processor = None
engine_ready = False
engine_loading = False


def get_processor():
    """获取或初始化引擎（带预热机制）"""
    global processor, engine_ready, engine_loading
    if processor is not None:
        return processor
    if engine_loading:
        return None  # 正在加载中，返回 None
    engine_loading = True
    try:
        processor = VideoProcessor()
        engine_ready = True
        print("✅ 引擎初始化完成（模型已加载）")
    except Exception as e:
        print(f"❌ 引擎初始化失败: {e}")
        processor = None
        engine_ready = False
    finally:
        engine_loading = False
    return processor


# ========== 页面路由 ==========

@app.route('/')
def index():
    return render_template('index.html')


# ========== 预热接口 ==========

@app.route('/api/health')
def health():
    """健康检查 + 触发模型预热"""
    global engine_ready, engine_loading

    if engine_ready:
        return jsonify({"status": "ready", "message": "引擎已就绪"})

    # 触发异步预热
    if not engine_loading:
        threading.Thread(target=get_processor, daemon=True).start()

    return jsonify({"status": "warming", "message": "模型预热中，请稍后..."}), 202


@app.route('/api/engine_status')
def engine_status():
    """查询引擎预热状态"""
    global engine_ready, engine_loading
    if engine_ready:
        return jsonify({"ready": True, "message": "引擎已就绪"})
    elif engine_loading:
        return jsonify({"ready": False, "loading": True, "message": "模型加载中..."})
    else:
        return jsonify({"ready": False, "loading": False, "message": "引擎未启动"})


# ========== 视频上传接口 ==========

@app.route('/api/upload_video', methods=['POST'])
def upload_video():
    """接收小程序上传的视频文件"""
    if 'video' not in request.files:
        return jsonify({"status": "error", "message": "未找到视频文件"}), 400

    file = request.files['video']
    if not file.filename:
        return jsonify({"status": "error", "message": "文件名为空"}), 400

    # 生成唯一文件名防止冲突
    ext = Path(file.filename).suffix or '.mp4'
    unique_name = f"{uuid.uuid4().hex[:8]}_{file.filename}"
    save_path = VIDEO_DIR / unique_name

    file.save(str(save_path))
    print(f"📤 视频已保存: {unique_name} ({save_path.stat().st_size / 1024 / 1024:.1f} MB)")

    return jsonify({
        "status": "success",
        "video_name": unique_name,
        "size_mb": round(save_path.stat().st_size / 1024 / 1024, 2)
    })


# ========== 炼化接口 ==========

@app.route('/api/start_process', methods=['POST'])
def start_process():
    """开始处理视频的任务接口"""
    global engine_ready

    # 检查引擎是否就绪
    if not engine_ready:
        proc = get_processor()
        if proc is None:
            return jsonify({"status": "error", "message": "引擎预热中，请等待 30 秒后重试"}), 503

    data = request.json or {}
    video_name = data.get('video_name', 'test_video.mp4')
    video_path = VIDEO_DIR / video_name

    if not video_path.exists():
        return jsonify({"status": "error", "message": "视频文件不存在"}), 404

    def background_task():
        try:
            processor.current_step = "炼化启动中..."
            processor.progress = 0
            processor.process(str(video_path), str(OUTPUT_DIR))
        except Exception as e:
            import traceback
            print(f"后台任务失败: {e}")
            traceback.print_exc()
            processor.current_step = f"炼化失败: {str(e)}"
            processor.progress = -1

    thread = threading.Thread(target=background_task, daemon=True)
    thread.start()

    return jsonify({"status": "success", "message": "任务已启动"})


# ========== 视频播放接口 ==========

@app.route('/api/get_video_url')
def get_video_url():
    """获取视频播放临时链接（云托管环境通过 COS 生成，本地环境返回本地路径）"""
    video_name = request.args.get('video', 'test_video.mp4')

    # 本地环境：直接返回本地视频路径
    env_flag = os.environ.get("WX_ENV") or os.environ.get("TENCENTCLOUD_RUN_ENV")
    if not env_flag:
        return jsonify({"url": f"/video/{video_name}"})

    # 云托管环境：通过 COS 生成临时访问链接
    bucket = os.environ.get("COS_BUCKET", "")
    if not bucket:
        return jsonify({"status": "error", "message": "COS_BUCKET 未配置"}), 500

    try:
        import requests as req
        auth_resp = req.get("http://api.weixin.qq.com/_/cos/getauth", timeout=5)
        if auth_resp.status_code != 200:
            return jsonify({"status": "error", "message": "获取COS密钥失败"}), 500
        auth = auth_resp.json()

        from qcloud_cos import CosConfig, CosS3Client
        region = os.environ.get("COS_REGION", "ap-shanghai")
        config = CosConfig(Region=region, SecretId=auth["TmpSecretId"], SecretKey=auth["TmpSecretKey"], Token=auth["Token"])
        client = CosS3Client(config)

        # 生成预签名URL，有效期1小时
        url = client.get_presigned_url(
            Method='GET',
            Bucket=bucket,
            Key=video_name,
            Expires=3600
        )
        return jsonify({"url": url})
    except Exception as e:
        return jsonify({"status": "error", "message": f"获取视频链接失败: {str(e)}"}), 500


@app.route('/video/<path:filename>')
def serve_video(filename):
    """输出视频流接口（本地开发用）"""
    return send_from_directory(VIDEO_DIR, filename)


# ========== 数据查询接口 ==========

@app.route('/api/get_lecture')
def get_lecture():
    """获取整理好的教材内容接口"""
    video_name = request.args.get('video', 'test_video')
    LECTURE_FILE = OUTPUT_DIR / video_name / "02_structured.json"
    if LECTURE_FILE.exists():
        with open(LECTURE_FILE, 'r', encoding='utf-8') as f:
            return jsonify(json.load(f))
    return jsonify({"chapters": []})


@app.route('/api/get_status')
def get_status():
    """查询当前进度接口"""
    if processor is None:
        return jsonify({"current_step": "引擎未启动", "progress": 0})
    return jsonify({
        "current_step": processor.current_step,
        "progress": processor.progress
    })


@app.route('/api/get_questions')
def get_questions():
    """获取题目列表"""
    video_name = request.args.get('video', 'test_video')
    QUESTIONS_FILE = OUTPUT_DIR / video_name / "03_questions.json"
    if QUESTIONS_FILE.exists():
        with open(QUESTIONS_FILE, 'r', encoding='utf-8') as f:
            return jsonify(json.load(f))
    return jsonify([])


@app.route('/api/download_word')
def download_word():
    """下载 Word 文档"""
    video_name = request.args.get('video', 'test_video')
    target_dir = OUTPUT_DIR / video_name
    files = list(target_dir.glob("*_教材_*.docx"))
    if files:
        latest_file = max(files, key=os.path.getctime)
        return send_from_directory(target_dir, latest_file.name, as_attachment=True)
    return jsonify({"status": "error", "message": "文件不存在"}), 404


# ========== 启动 ==========

def _sync_video_from_cos():
    """云托管环境下，从对象存储下载视频到 temp_input（仅当本地不存在时）"""
    env_flag = os.environ.get("WX_ENV") or os.environ.get("TENCENTCLOUD_RUN_ENV")
    if not env_flag:
        return
    bucket = os.environ.get("COS_BUCKET", "")
    if not bucket:
        return

    try:
        import requests as req
        auth_resp = req.get("http://api.weixin.qq.com/_/cos/getauth", timeout=5)
        if auth_resp.status_code != 200:
            return
        auth = auth_resp.json()
        from qcloud_cos import CosConfig, CosS3Client
        region = os.environ.get("COS_REGION", "ap-shanghai")
        config = CosConfig(Region=region, SecretId=auth["TmpSecretId"], SecretKey=auth["TmpSecretKey"], Token=auth["Token"])
        client = CosS3Client(config)

        # 检查 test_video.mp4 是否已存在
        target = VIDEO_DIR / "test_video.mp4"
        if target.exists():
            print("✅ 测试视频已存在，跳过下载")
            return

        print("📦 从对象存储下载测试视频...")
        resp = client.get_object(Bucket=bucket, Key="test_video.mp4")
        resp["Body"].get_stream_to_file(str(target))
        print(f"✅ 测试视频下载完成 ({target.stat().st_size / 1024 / 1024:.1f} MB)")
    except Exception as e:
        print(f"⚠️ 视频同步失败: {e}")

# 模块加载时自动执行（gunicorn 启动也会触发）
_sync_video_from_cos()

if __name__ == '__main__':
    # 本地开发时自动预热引擎
    print("🔧 本地开发模式，启动时预热引擎...")
    get_processor()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
