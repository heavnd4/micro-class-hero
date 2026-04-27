# 视频转Word产品生成器 - 项目操作说明书

本手册旨在指导用户在本地环境下部署和运行“视频转Word”自动化工具。该工具通过 AI 技术将技术视频转化为高质量的图文教材及配套考题。

---

## 一、 环境要求

### 1. 核心软件
*   **操作系统**: Windows 11 (推荐)
*   **Python 版本**: **3.11.x** (必须使用 3.11，以确保 `faster-whisper` 的兼容性)
*   **FFmpeg**: 必须安装并加入系统环境变量 `PATH` (用于视频截图)

### 2. 关键依赖库
项目使用虚拟环境 (`venv`) 管理依赖，以下是确保运行成功的核心版本组合：
*   `faster-whisper`: 1.2.1 (本地语音转文字)
*   `ctranslate2`: **4.4.0** (关键：必须降级至此版本以防止 CPU 环境下的静默崩溃)
*   `setuptools`: **69.5.1** (关键：必须使用此版本以提供 `pkg_resources`)
*   `anthropic`: 最新版 (用于调用阿里百炼 API)
*   `python-docx`: 最新版 (用于生成 Word 文档)

---

## 二、 目录结构说明

项目根目录位于 `E:\.cc项目\`：
*   `\视频转换\video_to_word.py`: **主程序脚本**
*   `\视频转换\输出\`: 存放所有中间文件和最终生成的 Word 文档
*   `\models\`: 预下载的 Whisper `small` 模型文件 (避免由于网络问题导致加载失败)
*   `\venv\`: Python 3.11 虚拟环境

---

## 三、 配置与运行

### 1. 脚本配置
运行前，请打开 `video_to_word.py` 顶部的配置区进行调整：
```python
VIDEO_PATH    = r"E:\.cc项目\视频转换\你的视频名.mp4" # 视频绝对路径
API_KEY       = "sk-sp-..." # 阿里百炼 API Key
BASE_URL      = "https://coding.dashscope.aliyuncs.com/apps/anthropic"
MODEL         = "qwen3.5-plus" # 使用的模型
FRAME_EVERY   = 60 # 每隔多少秒截一张图
```

### 2. 运行步骤
1.  **打开终端**: 进入项目根目录。
2.  **激活环境**: 执行 `venv\Scripts\activate`。
3.  **启动脚本**: 执行 `python "视频转换\video_to_word.py"`。

---

## 四、 处理流程全解析

工具按顺序执行以下五个步骤：

1.  **视频转文字**: 调用 `faster-whisper` 进行本地转录，输出 `01_transcript.txt`。
2.  **截取关键帧**: 使用 FFmpeg 每隔固定时间截取视频画面，存入 `frames/` 文件夹。
3.  **AI 整理文稿**: 调用大模型将口语化的文稿整理为排版整齐的章节正文，输出 `02_structured.json`。
4.  **AI 生成考题**: 根据全文内容，自动生成包含单选(15)、多选(5)、判断(5)、简答(2)的综合题库，输出 `03_questions.json`。
5.  **生成 Word**: 将文字与截图匹配，生成带封面的《教材.docx》和带解析的《考题.docx》。

---

## 五、 故障排除与维护

### 1. 权限拒绝 (Permission Denied)
如果报错 `PermissionError: [Errno 13]`, 说明生成的 Word 文档正被 Word 软件打开。
*   **解决**: 关闭打开的 Word 文档后重试。脚本会自动在文件名后添加时间戳以避免部分冲突。

### 2. JSON 解析失败
如果 AI 返回的内容格式不规范，脚本内置了“正则清洗”和“自动补全”逻辑，能自动尝试修复损坏的 JSON 字符串。

### 3. 环境重建
如需重新配置环境，请按以下顺序执行：
1. `py -3.11 -m venv venv`
2. `venv\Scripts\pip install faster-whisper anthropic python-docx -i https://mirrors.aliyun.com/pypi/simple`
3. `venv\Scripts\pip install ctranslate2==4.4.0 setuptools==69.5.1 -i https://mirrors.aliyun.com/pypi/simple`

---

创建日期：2026年4月22日
