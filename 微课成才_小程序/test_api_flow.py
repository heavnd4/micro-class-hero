import requests
import time
import json

BASE_URL = "http://127.0.0.1:5000"

def test_full_flow():
    print("--- 1. 模拟小程序：发起处理请求 ---")
    payload = {"video_name": "test_video.mp4"}
    try:
        r = requests.post(f"{BASE_URL}/api/start_process", json=payload)
        print(f"响应: {r.json()}")
    except Exception as e:
        print(f"连接失败，请确保 app.py 已启动! 错误: {e}")
        return

    print("\n--- 2. 模拟小程序：轮询进度 ---")
    while True:
        try:
            r = requests.get(f"{BASE_URL}/api/get_status")
            status = r.json()
            print(f"当前阶段: {status['current_step']} | 进度: {status['progress']}%")
            
            if status['current_step'] == "已完成":
                print("\n✅ 处理圆满成功！")
                break
            
            if "失败" in status['current_step']:
                print("\n❌ 处理过程中出现异常。")
                break
                
            time.sleep(3) # 每3秒问一次
        except KeyboardInterrupt:
            print("\n停止轮询")
            break

    print("\n--- 3. 模拟小程序：获取生成的题目 ---")
    r = requests.get(f"{BASE_URL}/api/get_questions")
    questions = r.json()
    print(f"成功获取到 {len(questions)} 道题目。前两题预览：")
    print(json.dumps(questions[:2], ensure_ascii=False, indent=2))

    print("\n--- 4. 模拟小程序：尝试下载 Word 文档链接 ---")
    print(f"下载链接: {BASE_URL}/api/download_word")

if __name__ == "__main__":
    test_full_flow()
