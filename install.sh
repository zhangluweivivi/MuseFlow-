#!/bin/bash
# MuseFlow Desktop 快速安装脚本

echo "🎬 MuseFlow Desktop 安装"
echo "========================"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 需要安装 Node.js"
    echo "   请访问 https://nodejs.org/ 下载安装"
    exit 1
fi

echo "✅ Node.js 版本: $(node --version)"

# 检查 FFmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️  FFmpeg 未安装，尝试安装..."
    if command -v brew &> /dev/null; then
        brew install ffmpeg
    else
        echo "❌ 请手动安装 FFmpeg: https://ffmpeg.org/download.html"
        exit 1
    fi
fi

echo "✅ FFmpeg 已安装"

# 进入目录
cd "$(dirname "$0")"

# 安装依赖
echo ""
echo "📦 安装 npm 依赖..."
npm install

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 安装完成！"
    echo ""
    echo "启动应用:"
    echo "   npm start"
    echo ""
    echo "或者打包:"
    echo "   npm run build:mac    # macOS"
    echo "   npm run build:win    # Windows"
    echo ""
else
    echo "❌ 安装失败"
    exit 1
fi
