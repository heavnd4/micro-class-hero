import sys
import os

print("--- 诊断模式启动 ---")
print(f"Python 版本: {sys.version}")
print(f"当前工作目录: {os.getcwd()}")

try:
    print("第1行：尝试导入 faster_whisper...")
    from faster_whisper import WhisperModel
    print("第2行：导入成功")
    
    model_path = r"E:\.cc项目\models\models--Systran--faster-whisper-small\snapshots\main"
    print(f"第3行：准备从以下路径加载模型: {model_path}")
    
    if not os.path.exists(model_path):
        print(f"❌ 错误: 路径不存在!")
    else:
        print(f"✓ 路径存在，包含文件: {os.listdir(model_path)}")

    # 显式指定 cpu 和 int8，这是最稳妥的模式
    print("第4行：正在执行 WhisperModel() 构造函数...")
    m = WhisperModel(model_path, device="cpu", compute_type="int8")
    print("第5行：模型加载成功!!! 🎉")

except Exception as e:
    print(f"❌ 捕获到异常: {type(e).__name__}: {e}")
except BaseException as e:
    print(f"⚠️ 捕获到基础异常 (包括系统退出): {type(e).__name__}")
finally:
    print("--- 诊断结束 ---")
