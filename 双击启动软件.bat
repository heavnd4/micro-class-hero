@echo off
title 视频转Word自动化系统启动器
echo 正在启动程序，请稍候...
E:
cd "E:\.cc项目"
if not exist venv (
    echo [错误] 未找到虚拟环境，请检查 E:\.cc项目\venv 是否存在。
    pause
    exit
)
call venv\Scripts\activate
python gui_launcher.py
if %errorlevel% neq 0 (
    echo [错误] 程序异常退出。
    pause
)
