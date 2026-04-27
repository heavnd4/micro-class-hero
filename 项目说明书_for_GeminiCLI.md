# 视频转Word产品 — 项目说明书
> 本文档供 Gemini CLI 接管项目使用，包含完整的环境现状、已完成工作、当前问题和下一步目标。

---

## 一、项目目标

将本地中文技术视频（约30分钟）自动化处理，生成两类产品：
- **图文教材**：章节正文 + 视频截图，输出 `.docx`
- **配套考题**：选择题、判断题、简答题，输出 `.docx`

后期增加：多视频批量处理、PDF导出。

---

## 二、项目文件位置

| 内容 | 路径 |
|---|---|
| 项目根目录 | `E:\.cc项目\` |
| 脚本文件 | `E:\.cc项目\视频转换\video_to_word.py` |
| 虚拟环境 | `E:\.cc项目\venv\` |
| 输出目录 | `E:\.cc项目\视频转换\输出\` |
| Whisper模型 | `E:\.cc项目\models\models--Systran--faster-whisper-small\snapshots\main\` |
| 测试文件 | `E:\.cc项目\test.py` |

---

## 三、当前环境状态

### 系统
- Windows 11
- 用户：Administrator
- C盘空间不足，所有项目文件放在 E 盘

### 已安装工具
| 工具 | 版本 | 位置 |
|---|---|---|
| Python | 3.13.9 | `C:\Users\Administrator\AppData\Local\Programs\Python\Python313\` |
| FFmpeg | 8.0.1 | `D:\BaiduNetdiskDownload\ffmpeg-8.0.1-essentials_build\bin\` |
| Node.js | 已装（nvm4w管理） | `C:\nvm4w\nodejs\` |
| Gemini CLI | 0.36.0 | npm 全局 |

### 虚拟环境已安装的包
| 包 | 版本 | 状态 |
|---|---|---|
| faster-whisper | 1.2.1 | ✓ 已装 |
| ctranslate2 | 4.7.1 | ⚠️ 有问题（见下） |
| anthropic | 最新 | ✓ 已装 |
| python-docx | 最新 | ✓ 已装 |

### 环境变量
- `HF_HUB_CACHE` 已设置为 `E:\.cc项目\models`（模型缓存指向E盘）
- Python、FFmpeg 已加入用户 PATH

---

## 四、当前核心问题

### 问题：faster-whisper 加载模型时静默崩溃

**现象：**
运行 `test.py` 时：
- 第1行"开始"能输出 ✓
- 第2行"导入成功"能输出 ✓
- 第3行加载模型后直接退出，无任何报错

**test.py 内容：**
```python
print("第1行：开始")
from faster_whisper import WhisperModel
print("第2行：导入成功")
m = WhisperModel(r"E:\.cc项目\models\models--Systran--faster-whisper-small\snapshots\main", device="cpu", compute_type="int8")
print("第3行：模型加载成功")
```

**已尝试的解决方案（均失败）：**
1. 降级 ctranslate2 到 4.6.0 → 报 `No module named 'pkg_resources'`（Python 3.13不兼容）
2. 安装 `pkgutil_resolve_name` → 无效
3. 重新升回 ctranslate2 4.7.1 → 仍然静默崩溃

**根本原因判断：**
Python 3.13 与 ctranslate2 / faster-whisper 当前版本存在兼容性问题。

**推荐解决方案：**
安装 Python 3.11，用 3.11 重建虚拟环境。Python 支持多版本共存，不需要卸载 3.13。

---

## 五、下一步任务（请 Gemini CLI 接管执行）

### 任务1：安装 Python 3.11
- 下载地址：`https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe`
- 安装时勾选 `Add to PATH`
- 验证：`py -3.11 --version`

### 任务2：重建虚拟环境
```cmd
cd "E:\.cc项目"
rmdir /s /q venv
py -3.11 -m venv venv
venv\Scripts\activate
```

### 任务3：重新安装依赖包（用阿里云镜像）
```cmd
pip install faster-whisper anthropic python-docx -i https://mirrors.aliyun.com/pypi/simple
```

### 任务4：验证模型加载
```cmd
python "E:\.cc项目\test.py"
```
期望输出：
```
第1行：开始
第2行：导入成功
第3行：模型加载成功
```

### 任务5：运行主脚本
```cmd
python "E:\.cc项目\视频转换\video_to_word.py"
```

---

## 六、主脚本说明

### 脚本配置区（video_to_word.py 开头）
```python
VIDEO_PATH    = r"E:\.cc项目\视频转换\燃气改造 电回路 烟机排烟 排水路由... 【厨房水电】一口气打包全解读.mp4"
OUTPUT_DIR    = r"E:\.cc项目\视频转换\输出"
API_KEY       = "sk-sp-a057b4bf1def40ad8b44d6a908b59a84"
BASE_URL      = "https://coding.dashscope.aliyuncs.com/apps/anthropic"
MODEL         = "qwen3.5-plus"
COURSE_NAME   = "厨房水电"
FRAME_EVERY   = 60
WHISPER_MODEL = "small"
```

### 脚本处理流程
1. **视频转文字**：faster-whisper 本地转录，输出 `01_transcript.txt`
2. **截取关键帧**：FFmpeg 每60秒截一张图，存入 `frames/` 文件夹
3. **AI整理结构**：调用阿里百炼API（兼容Anthropic协议），输出 `02_structured.json`
4. **AI生成考题**：逐章生成题目，输出 `03_questions.json`
5. **生成Word文档**：python-docx 生成教材和考题两个 `.docx` 文件

### 断点续跑机制
每步结果都有缓存文件，中途失败重新运行会自动跳过已完成步骤：
| 缓存文件 | 对应步骤 |
|---|---|
| `01_transcript.txt` | 转录文字 |
| `02_structured.json` | AI整理结构 |
| `03_questions.json` | AI生成考题 |

### Whisper模型路径（脚本内已硬编码）
```python
model = WhisperModel(
    r"E:\.cc项目\models\models--Systran--faster-whisper-small\snapshots\main",
    device="cpu",
    compute_type="int8"
)
```

### 阿里百炼API调用方式（兼容Anthropic协议）
```python
client = anthropic.Anthropic(
    api_key=API_KEY,
    base_url=BASE_URL
)
response = client.messages.create(
    model=MODEL,
    max_tokens=4000,
    messages=[{"role": "user", "content": prompt}]
)
raw = response.content[0].text.strip()
```

---

## 七、Whisper模型文件清单

位置：`E:\.cc项目\models\models--Systran--faster-whisper-small\snapshots\main\`

| 文件 | 大小 |
|---|---|
| config.json | 2.3 KB |
| gitattributes | 1.5 KB |
| model.bin | 461 MB |
| README.md | 2.0 KB |
| tokenizer.json | 2.1 MB |
| vocabulary.txt | 449 KB |

---

## 八、注意事项

1. **C盘空间不足**，所有文件必须放在 E 盘
2. **网络访问 HuggingFace 受限**，模型已手动下载到本地，不能删除
3. **虚拟环境激活**：每次打开新终端都需要先运行 `venv\Scripts\activate`
4. **pip安装**：网络有代理问题，必须加 `-i https://mirrors.aliyun.com/pypi/simple`
5. **阿里百炼API**已配置好，兼容Anthropic协议，直接用anthropic包调用
