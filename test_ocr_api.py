from paddleocr import PaddleOCR
import os

# 确保环境一致
os.environ["PADDLE_HOME"] = r"E:\.cc项目\models\.paddleocr"
os.environ["PADDLE_PDX_HOME"] = r"E:\.cc项目\models\.paddlex"

ocr = PaddleOCR(use_textline_orientation=True, lang='ch')
# 找一张刚才产生的 raw 帧进行测试（如果还没被删的话）
# 刚才日志显示 raw_0001.jpg 被处理时报错，我看看它还在不在
test_img = r"E:\.cc项目\视频转换\输出\67 数学广角：数与形（第一课时）\frames\raw_0001.jpg"

if not os.path.exists(test_img):
    print("测试图片不存在，请检查路径")
else:
    try:
        # 尝试 predict 方法
        result = ocr.ocr(test_img) # 默认不传 cls 试试
        print("ocr.ocr() 成功")
        print(f"结果预览: {result[0][:2] if result and result[0] else '无内容'}")
    except Exception as e:
        print(f"ocr.ocr() 失败: {e}")
