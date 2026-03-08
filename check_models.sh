#!/bin/bash
# MuseFlow - 模型诊断修复脚本

echo "🔧 ComfyUI 模型诊断工具"
echo "========================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 常见 ComfyUI 模型路径
paths=(
  "$HOME/ComfyUI/models"
  "/Volumes/AI/ComfyUI/models"
  "$HOME/Documents/ComfyUI/models"
  "$HOME/Library/Application Support/ComfyUI/models"
)

echo "📂 扫描模型文件..."
echo ""

found_models=()
corrupted_models=()

for base_path in "${paths[@]}"; do
  if [ -d "$base_path" ]; then
    echo "✅ 找到模型目录: $base_path"
    
    # 查找所有模型文件
    while IFS= read -r -d '' file; do
      filename=$(basename "$file")
      size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
      size_mb=$((size / 1024 / 1024))
      
      # 检查文件大小（小于 1MB 可能损坏）
      if [ "$size" -lt 1048576 ]; then
        echo -e "${RED}⚠️  $filename (${size_mb}MB) - 可能损坏${NC}"
        corrupted_models+=("$file")
      else
        echo "  $filename (${size_mb}MB)"
      fi
      
      found_models+=("$file")
    done < <(find "$base_path" -name "*.safetensors" -o -name "*.pth" -o -name "*.bin" -print0 2>/dev/null)
  fi
done

echo ""
echo "========================"
echo "📊 诊断结果"
echo "========================"
echo ""

if [ ${#found_models[@]} -eq 0 ]; then
  echo -e "${YELLOW}⚠️  未找到任何模型文件${NC}"
  echo ""
  echo "模型可能位于其他位置，或尚未下载。"
  echo ""
else
  echo "📦 找到 ${#found_models[@]} 个模型文件"
  
  if [ ${#corrupted_models[@]} -gt 0 ]; then
    echo -e "${RED}❌ 发现 ${#corrupted_models[@]} 个可能损坏的模型${NC}"
    echo ""
    echo "损坏的文件:"
    for f in "${corrupted_models[@]}"; do
      echo "  - $f"
    done
    echo ""
  else
    echo -e "${GREEN}✅ 所有模型文件大小正常${NC}"
  fi
fi

echo ""
echo "========================"
echo "🔧 修复建议"
echo "========================"
echo ""

if [ ${#corrupted_models[@]} -gt 0 ]; then
  echo "1. 删除损坏的模型文件，重新下载:"
  for f in "${corrupted_models[@]}"; do
    echo "   rm \"$f\""
  done
  echo ""
fi

echo "2. 检查模型完整性（safetensors）:"
echo "   python3 -c \"import json; f=open('model.safetensors','rb'); \""
echo "   print(json.loads(f.read(int.from_bytes(f.read(8),'little'))))\""
echo ""

echo "3. 重新下载模型:"
echo "   - Whisper Large V3: 791MB"
echo "   - Lynx 模型组: 约 2-4GB"
echo "   - Wav2Vec Chinese: 约 1GB"
echo ""

echo "4. 如果使用的是简化版工作流，可以禁用缺失的节点"
echo "   在工作流中删除以下节点:"
echo "   - WhisperNode"
echo "   - Wav2VecNode"
echo "   - LynxNode"
echo ""
