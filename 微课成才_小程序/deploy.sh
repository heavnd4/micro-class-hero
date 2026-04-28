#!/bin/bash
# 微课成才 — 云托管一键部署脚本
# 使用方式：bash deploy.sh [备注信息]
# 示例：bash deploy.sh "修复视频播放问题"

REMARK="${1:-手动部署}"
ENV_ID="study-d2g0ezztf8f8798f3"
SERVICE="weike-backend"
PROJECT_DIR="e:/.cc项目/微课成才_小程序"

echo "========================================"
echo "  微课成才云托管部署"
echo "  环境: $ENV_ID"
echo "  服务: $SERVICE"
echo "  备注: $REMARK"
echo "========================================"

cd "$PROJECT_DIR" || { echo "❌ 切换目录失败"; exit 1; }

echo ""
echo "🚀 开始部署（选择：手动上传代码包）..."

# 用 echo "0" 自动选择第一项（手动上传代码包）
echo "0" | wxcloud run:deploy . \
  --envId "$ENV_ID" \
  --serviceName "$SERVICE" \
  --containerPort 5000 \
  --noConfirm \
  --override \
  --remark "$REMARK"

EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ 部署成功！"
else
  echo "❌ 部署失败（退出码: $EXIT_CODE）"
  echo "💡 如提示「已有部署任务运行中」，请稍等几分钟再执行"
  echo "💡 查看版本列表：wxcloud version:list --envId $ENV_ID --serviceName $SERVICE"
fi

echo ""
echo "📋 查看版本列表：wxcloud version:list --envId $ENV_ID --serviceName $SERVICE"
