import json
import subprocess
import os
import time
from pathlib import Path
import anthropic
from docx import Document
from docx.shared import Inches

class VideoProcessor:
    def __init__(self, base_dir=None, api_key=None):
        self.base_dir = Path(base_dir) if base_dir else Path(__file__).parent.parent
        self.models_dir = self.base_dir / "models"
        self.api_key = api_key or "sk-sp-a057b4bf1def40ad8b44d6a908b59a84"
        self.client = anthropic.Anthropic(api_key=self.api_key, base_url="https://coding.dashscope.aliyuncs.com/apps/anthropic")
        self.current_step = "待机中"
        self.progress = 0

    def process(self, video_path: str, out_root: str):
        v_path = Path(video_path)
        out_dir = Path(out_root) / v_path.stem
        out_dir.mkdir(parents=True, exist_ok=True)

        # 1. 语音转文字
        self.current_step = "正在听课..."
        from faster_whisper import WhisperModel
        m_path = self.models_dir / "models--Systran--faster-whisper-small" / "snapshots" / "main"
        model = WhisperModel(str(m_path), device="cpu", compute_type="int8")
        segments, _ = model.transcribe(video_path, language="zh")
        transcript = "\n".join([s.text.strip() for s in segments])
        (out_dir / "01_transcript.txt").write_text(transcript, encoding="utf-8")

        # 2. 物理截图 (跳过 OCR，直接截)
        self.current_step = "正在抓拍..."
        frames_dir = out_dir / "frames"
        frames_dir.mkdir(exist_ok=True)
        subprocess.run(["ffmpeg", "-i", video_path, "-vf", "fps=1/60", "-q:v", "2", str(frames_dir / "frame_%03d.jpg"), "-y"], capture_output=True)

        # 3. AI 结构化 (带时间戳)
        self.current_step = "正在思考总结..."
        prompt = f"请将以下字幕划分为章节并提供每个章节起始秒数(timestamp)和正文，以JSON格式返回：\n\n{transcript[:8000]}"
        response = self.client.messages.create(model="qwen3.5-plus", max_tokens=4000, messages=[{"role":"user","content":prompt}])
        raw = response.content[0].text
        # 简单提取 JSON
        if "```json" in raw: raw = raw.split("```json")[1].split("```")[0].strip()
        data = json.loads(raw)
        (out_dir / "02_structured.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

        # 4. AI 出题
        self.current_step = "正在出卷..."
        prompt_q = f"请根据以下内容出20道测试题，以JSON数组格式返回：\n\n{raw}"
        response_q = self.client.messages.create(model="qwen3.5-plus", max_tokens=4000, messages=[{"role":"user","content":prompt_q}])
        raw_q = response_q.content[0].text
        if "[" in raw_q: raw_q = raw_q[raw_q.find("["):raw_q.rfind("]")+1]
        questions = json.loads(raw_q)
        (out_dir / "03_questions.json").write_text(json.dumps(questions, ensure_ascii=False, indent=2), encoding="utf-8")

        self.current_step = "已完成"
        self.progress = 100
        return True
