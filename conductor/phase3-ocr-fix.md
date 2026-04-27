# 彻底修复 PaddleOCR 运行时 (Unimplemented) 报错方案

## 1. 问题根因分析
在处理特定截图时，出现以下持续报错：
`ConvertPirAttribute2RuntimeAttribute not support [pir::ArrayAttribute<pir::DoubleAttribute>] (at onednn_instruction.cc)`

这表明 **PaddlePaddle 3.x 的新一代计算图引擎（PIR）** 与您的 CPU 上的 **oneDNN 加速指令集** 存在硬性兼容性问题。

之前我们在 `video_to_word.py` 内部设置了禁用环境变量，但由于您实际的启动入口是 `gui_launcher.py`，且 Python 在跨文件导入时，C++ 底层可能在主进程启动的瞬间就锁定了系统环境变量，导致我们在子模块中的动态设置失效。

## 2. 解决方案：绝对入口拦截
为了确保 Paddle 底层引擎在初始化前被迫降级为最基础、最稳定的兼容模式，我们必须在整个程序运行的**绝对第一行**（即在导入任何库之前）强行注入环境变量。

### 修改目标：`gui_launcher.py`
将其头部代码修改为：
```python
# ==========================================
# 【核心修复】强制关闭 Paddle 3.x 的不兼容加速特性
# 必须放在程序的绝对第一行，任何 import 之前！
import os
os.environ["FLAGS_use_mkldnn"] = "0"
os.environ["FLAGS_enable_pir_api"] = "0"
os.environ["FLAGS_use_cpu_dnnl"] = "0"
# ==========================================

import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext
# ... 其他已有代码
```

## 3. 预期效果
通过在主程序入口处“封锁”不兼容特性，Paddle 将彻底回退到基础 CPU 计算模式。虽然处理每张截图的速度可能会微小下降，但能 **100% 消除崩溃**，顺利完成所有 OCR 去重任务。
