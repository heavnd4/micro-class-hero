from flask import Flask, jsonify, request, send_from_directory
from pathlib import Path
from core_engine import VideoProcessor

app = Flask(__name__)
BASE_PATH = Path(__file__).parent
VIDEO_DIR = BASE_PATH / "temp_input"
OUTPUT_DIR = BASE_PATH / "temp_output"
processor = VideoProcessor()

@app.route('/api/start_process', methods=['POST'])
def start_process():
    video_name = request.json.get('video_name', 'test_video.mp4')
    video_path = VIDEO_DIR / video_name
    if not video_path.exists(): return jsonify({"status":"error"}), 404
    
    # 暴力强攻：直接在主进程跑，不搞异步了！
    try:
        processor.process(str(video_path), str(OUTPUT_DIR))
        return jsonify({"status": "success", "message": "炼化完成"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/get_status')
def get_status():
    return jsonify({"current_step": processor.current_step, "progress": processor.progress})

@app.route('/api/get_questions')
def get_questions():
    f = OUTPUT_DIR / "test_video" / "03_questions.json"
    import json
    if f.exists(): return jsonify(json.loads(f.read_text(encoding='utf-8')))
    return jsonify([])

@app.route('/api/get_lecture')
def get_lecture():
    f = OUTPUT_DIR / "test_video" / "02_structured.json"
    import json
    if f.exists(): return jsonify(json.loads(f.read_text(encoding='utf-8')))
    return jsonify({"chapters": []})

@app.route('/video/<path:filename>')
def serve_video(filename):
    return send_from_directory(VIDEO_DIR, filename)

if __name__ == '__main__':
    app.run(debug=True, port=5000)
