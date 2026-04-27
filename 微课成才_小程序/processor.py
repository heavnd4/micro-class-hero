import os
from pathlib import Path
import core_engine

def run_process(video_name="test_video.mp4"):
    # 1. 自动定位路径 (小程序内部路径)
    current_dir = Path(__file__).parent
    input_path = current_dir / "temp_input" / video_name
    output_root = current_dir / "temp_output"
    
    # 2. 确保输出目录存在
    output_root.mkdir(exist_ok=True)

    # 3. 初始化新引擎
    # 自动向上两级查找 models 文件夹
    processor = core_engine.VideoProcessor()
    
    print(f"🚀 小程序引擎启动: 正在处理 {video_name}")
    try:
        processor.process(str(input_path), str(output_root))
        return True
    except Exception as e:
        print(f"❌ 处理失败: {e}")
        return False

if __name__ == "__main__":
    run_process()
