import os
# ==========================================
# 【终极封锁】彻底关闭 Paddle 3.x 不兼容特性
os.environ["FLAGS_enable_pir_in_executor"] = "0"
os.environ["FLAGS_enable_new_ir_api"] = "0"
os.environ["FLAGS_use_mkldnn"] = "0"
os.environ["PADDLE_DISABLE_ONEDNN"] = "1"
# ==========================================

import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext
import threading
import sys
import os
import json
from pathlib import Path
import queue

# 显式将子文件夹加入路径，确保全局可用
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
VIDEO_CONV_DIR = os.path.join(SCRIPT_DIR, "视频转换")
if VIDEO_CONV_DIR not in sys.path:
    sys.path.append(VIDEO_CONV_DIR)

# 尝试导入核心逻辑
try:
    import video_to_word as v2w
except ImportError:
    # 备用方案：通过包名导入
    from 视频转换 import video_to_word as v2w

class GUIApp:
    def __init__(self, root):
        self.root = root
        self.root.title("视频知识自动化生产系统 v1.0")
        self.root.geometry("800x600")
        
        # 配置文件路径
        self.config_path = Path("gui_config.json")
        self.log_queue = queue.Queue()
        
        self.setup_ui()
        self.load_config()
        
        # 启动日志刷新循环
        self.root.after(100, self.update_logs)

    def setup_ui(self):
        # 顶部标题
        header = tk.Label(self.root, text="视频 → Word/SRT 自动化生产工具", font=("微软雅黑", 16, "bold"), pady=10)
        header.pack()

        # 配置容器
        config_frame = tk.LabelFrame(self.root, text="设置区域", padx=10, pady=10)
        config_frame.pack(fill="x", padx=20, pady=5)

        # 视频目录
        tk.Label(config_frame, text="视频输入目录:").grid(row=0, column=0, sticky="w")
        self.ent_video_dir = tk.Entry(config_frame)
        self.ent_video_dir.grid(row=0, column=1, sticky="ew", padx=5)
        tk.Button(config_frame, text="浏览...", command=self.browse_video_dir).grid(row=0, column=2)

        # 输出目录
        tk.Label(config_frame, text="结果输出目录:").grid(row=1, column=0, sticky="w", pady=5)
        self.ent_out_dir = tk.Entry(config_frame)
        self.ent_out_dir.grid(row=1, column=1, sticky="ew", padx=5)
        tk.Button(config_frame, text="浏览...", command=self.browse_out_dir).grid(row=1, column=2)

        # API Key
        tk.Label(config_frame, text="阿里百炼 API Key:").grid(row=2, column=0, sticky="w")
        
        # API Key 容器，并列存放输入框和眼睛按钮
        api_container = tk.Frame(config_frame)
        api_container.grid(row=2, column=1, sticky="ew", padx=5)
        api_container.columnconfigure(0, weight=1)

        self.ent_api_key = tk.Entry(api_container, show="*")
        self.ent_api_key.grid(row=0, column=0, sticky="ew")

        # 眼睛按钮 (使用 Unicode 👁)
        self.btn_show_key = tk.Button(api_container, text="👁", width=3, relief="flat", 
                                     command=self.toggle_api_key, cursor="hand2")
        self.btn_show_key.grid(row=0, column=1, padx=2)

        # 截图模式选择 (2026-04-24 新增)
        tk.Label(config_frame, text="截图模式:").grid(row=3, column=0, sticky="w", pady=5)
        self.var_extract_mode = tk.StringVar(value="smart")
        mode_frame = tk.Frame(config_frame)
        mode_frame.grid(row=3, column=1, sticky="w", padx=5)
        
        tk.Radiobutton(mode_frame, text="智能识别 (推荐)", variable=self.var_extract_mode, 
                       value="smart", command=self.on_mode_change).pack(side="left")
        tk.Radiobutton(mode_frame, text="固定频率", variable=self.var_extract_mode, 
                       value="fixed", command=self.on_mode_change).pack(side="left", padx=10)

        # 截图频率
        tk.Label(config_frame, text="截图频率 (秒/张):").grid(row=4, column=0, sticky="w", pady=5)
        self.ent_frame_every = tk.Entry(config_frame)
        self.ent_frame_every.insert(0, "60")
        self.ent_frame_every.grid(row=4, column=1, sticky="w", padx=5)

        config_frame.columnconfigure(1, weight=1)

        # 初始状态更新
        self.on_mode_change()

        # 控制按钮
        btn_frame = tk.Frame(self.root, pady=10)
        btn_frame.pack()
        
        self.btn_start = tk.Button(btn_frame, text="🚀 开始批量处理", font=("微软雅黑", 12, "bold"), 
                                  bg="#2C4A8C", fg="white", padx=20, pady=5, command=self.start_process)
        self.btn_start.pack(side="left", padx=10)

        self.btn_stop = tk.Button(btn_frame, text="🛑 停止处理", font=("微软雅黑", 12, "bold"), 
                                 bg="#C0392B", fg="white", padx=20, pady=5, command=self.stop_process,
                                 state="disabled") # 初始状态禁用
        self.btn_stop.pack(side="left", padx=10)

        # 日志区域
        tk.Label(self.root, text="运行日志:").pack(anchor="w", padx=20)
        self.log_area = scrolledtext.ScrolledText(self.root, height=15, font=("Consolas", 10))
        self.log_area.pack(fill="both", expand=True, padx=20, pady=5)

    def on_mode_change(self):
        """当截图模式改变时，动态启用/禁用频率输入框"""
        if self.var_extract_mode.get() == "smart":
            self.ent_frame_every.config(state="disabled")
        else:
            self.ent_frame_every.config(state="normal")

    def toggle_api_key(self):
        """切换 API Key 的显示状态"""
        if self.ent_api_key.cget("show") == "*":
            self.ent_api_key.config(show="")
            self.btn_show_key.config(text="隐藏")
        else:
            self.ent_api_key.config(show="*")
            self.btn_show_key.config(text="显示")

    def browse_video_dir(self):
        d = filedialog.askdirectory()
        if d:
            self.ent_video_dir.delete(0, tk.END)
            self.ent_video_dir.insert(0, d)

    def browse_out_dir(self):
        d = filedialog.askdirectory()
        if d:
            self.ent_out_dir.delete(0, tk.END)
            self.ent_out_dir.insert(0, d)

    def load_config(self):
        """多级加载配置：JSON > 脚本默认值"""
        config_data = {}
        
        # 1. 尝试从 gui_config.json 加载
        if self.config_path.exists():
            try:
                config_data = json.loads(self.config_path.read_text(encoding="utf-8"))
            except:
                pass
        
        # 2. 如果缺少关键字段，尝试从 video_to_word.py 源码中提取
        if not config_data.get("api_key"):
            try:
                # 显式构造路径
                script_path = Path(__file__).parent / "视频转换" / "video_to_word.py"
                if script_path.exists():
                    content = script_path.read_text(encoding="utf-8")
                    import re
                    def extract(key):
                        # 匹配 key = "value" 或 key = r"value"
                        match = re.search(fr'{key}\s*=\s*r?["\'](.*?)["\']', content)
                        return match.group(1) if match else ""
                    
                    config_data["video_dir"] = config_data.get("video_dir") or extract("VIDEO_DIR")
                    config_data["out_dir"] = config_data.get("out_dir") or extract("OUTPUT_ROOT")
                    config_data["api_key"] = config_data.get("api_key") or extract("API_KEY")
                    config_data["frame_every"] = config_data.get("frame_every") or extract("FRAME_EVERY")
            except Exception as e:
                print(f"从脚本提取默认配置失败: {e}")

        # 3. 填入界面
        if config_data.get("video_dir"): self.ent_video_dir.insert(0, config_data["video_dir"])
        if config_data.get("out_dir"): self.ent_out_dir.insert(0, config_data["out_dir"])
        if config_data.get("api_key"): self.ent_api_key.insert(0, config_data["api_key"])
        if config_data.get("extract_mode"): self.var_extract_mode.set(config_data["extract_mode"])
        
        fe = str(config_data.get("frame_every", "60"))
        self.ent_frame_every.delete(0, tk.END)
        self.ent_frame_every.insert(0, fe if fe else "60")
        
        # 加载后同步 UI 状态
        self.on_mode_change()

    def save_config(self):
        conf = {
            "video_dir": self.ent_video_dir.get(),
            "out_dir": self.ent_out_dir.get(),
            "api_key": self.ent_api_key.get(),
            "frame_every": self.ent_frame_every.get(),
            "extract_mode": self.var_extract_mode.get()
        }
        self.config_path.write_text(json.dumps(conf, indent=2, ensure_ascii=False), encoding="utf-8")

    def log(self, message):
        self.log_queue.put(message + "\n")

    def update_logs(self):
        while not self.log_queue.empty():
            msg = self.log_queue.get()
            self.log_area.insert(tk.END, msg)
            self.log_area.see(tk.END)
        self.root.after(100, self.update_logs)

    def start_process(self):
        if not self.ent_api_key.get():
            messagebox.showwarning("提示", "请输入 API Key")
            return
        
        self.save_config()
        # 按钮状态联动
        self.btn_start.config(state=tk.DISABLED, text="正在处理中...", bg="#888")
        self.btn_stop.config(state=tk.NORMAL)
        
        self.log_area.delete(1.0, tk.END)
        self.log("--- 任务开始 ---")
        
        # 重置停止标志
        v2w.STOP_REQUESTED = False
        
        # 启动后台线程
        thread = threading.Thread(target=self.worker_thread)
        thread.daemon = True
        thread.start()

    def stop_process(self):
        """点击停止按钮触发"""
        if messagebox.askyesno("确认", "确定要终止当前所有任务吗？"):
            v2w.STOP_REQUESTED = True
            self.btn_stop.config(state=tk.DISABLED, text="正在中止...")
            self.log("\n🛑 正在接收停止请求，请稍候...")

    def worker_thread(self):
        try:
            # 动态更新配置
            v2w.VIDEO_DIR = self.ent_video_dir.get()
            v2w.OUTPUT_ROOT = self.ent_out_dir.get()
            v2w.API_KEY = self.ent_api_key.get()
            v2w.FRAME_EVERY = int(self.ent_frame_every.get())
            v2w.EXTRACT_MODE = self.var_extract_mode.get()
            
            # 重定向标准输出
            class RedirectText:
                def __init__(self, log_func):
                    self.log_func = log_func
                def write(self, string):
                    if string.strip():
                        self.log_func(string.strip())
                def flush(self):
                    pass
            
            sys.stdout = RedirectText(self.log)
            
            # 运行核心逻辑
            v2w.main()
            
            if v2w.STOP_REQUESTED:
                self.log("\n⚠️ 任务已被用户手动终止")
                messagebox.showwarning("已终止", "任务已手动停止")
            else:
                self.log("\n✅ 任务处理完毕！")
                messagebox.showinfo("完成", "所有任务已处理成功！")
            
        except InterruptedError:
            self.log("\n⚠️ 任务已被用户手动终止")
            messagebox.showwarning("已终止", "任务已手动停止")
        except Exception as e:
            self.log(f"\n❌ 发生严重错误: {str(e)}")
            messagebox.showerror("错误", f"程序运行出错: {e}")
        finally:
            # 恢复初始状态
            sys.stdout = sys.__stdout__
            v2w.STOP_REQUESTED = False
            self.root.after(0, self.reset_ui)

    def reset_ui(self):
        """重置按钮状态"""
        self.btn_start.config(state=tk.NORMAL, text="🚀 开始批量处理", bg="#2C4A8C")
        self.btn_stop.config(state=tk.DISABLED, text="🛑 停止处理")

if __name__ == "__main__":
    root = tk.Tk()
    app = GUIApp(root)
    root.mainloop()
