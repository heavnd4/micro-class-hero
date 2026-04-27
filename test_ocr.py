from paddleocr import PaddleOCR
try:
    ocr = PaddleOCR(use_textline_orientation=True, lang='ch')
    print("成功初始化 (无 show_log)")
except Exception as e:
    print(f"初始化失败: {e}")
