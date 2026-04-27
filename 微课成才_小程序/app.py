from flask import Flask, render_template, jsonify, request, send_from_directory
import json
import os
import threading
from pathlib import Path
from core_engine import VideoProcessor

app = Flask(__name__)

# 全局状态管理
BASE_PATH = Path(__file__).parent
VIDEO_DIR = BASE_PATH / "temp_input"
OUTPUT_DIR = BASE_PATH / "temp_output"

# 初始化引擎
processor = VideoProcessor()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/start_process', methods=['POST'])
def start_process():
    """开始处理视频的任务接口"""
    video_name = request.json.get('video_name', 'test_video.mp4')
    video_path = VIDEO_DIR / video_name
    
    if not video_path.exists():
        return jsonify({"status": "error", "message": "视频文件不存在"}), 404
        
    # 异步启动处理线程
    def background_task():
        try:
            processor.process(str(video_path), str(OUTPUT_DIR))
        except Exception as e:
            print(f"后台任务失败: {e}")

    thread = threading.Thread(target=background_task)
    thread.start()
    
    return jsonify({"status": "success", "message": "任务已启动"})

@app.route('/video/<path:filename>')
def serve_video(filename):
    """输出视频流接口"""
    return send_from_directory(VIDEO_DIR, filename)

@app.route('/api/get_lecture')
def get_lecture():
    """获取整理好的教材内容接口"""
    LECTURE_FILE = OUTPUT_DIR / "test_video" / "02_structured.json"
    if LECTURE_FILE.exists():
        with open(LECTURE_FILE, 'r', encoding='utf-8') as f:
            return jsonify(json.load(f))
    return jsonify({"chapters": []})

@app.route('/api/get_status')
def get_status():
    """查询当前进度接口"""
    return jsonify({
        "current_step": processor.current_step,
        "progress": processor.progress
    })

@app.route('/api/get_questions')
def get_questions():
    # 假设目前只处理 test_video
    QUESTIONS_FILE = OUTPUT_DIR / "test_video" / "03_questions.json"
    if QUESTIONS_FILE.exists():
        with open(QUESTIONS_FILE, 'r', encoding='utf-8') as f:
            return jsonify(json.load(f))
    return jsonify([])

@app.route('/api/download_word')
def download_word():
    # 查找最新的教材 docx 文件
    target_dir = OUTPUT_DIR / "test_video"
    files = list(target_dir.glob("*_教材_*.docx"))
    if files:
        latest_file = max(files, key=os.path.getctime)
        return send_from_directory(target_dir, latest_file.name, as_attachment=True)
    return "File not found", 404

if __name__ == '__main__':
    # 确保目录存在
    VIDEO_DIR.mkdir(exist_ok=True)
    OUTPUT_DIR.mkdir(exist_ok=True)
    app.run(debug=True, port=5000)
