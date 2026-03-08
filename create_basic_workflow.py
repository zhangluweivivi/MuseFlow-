#!/usr/bin/env python3
"""
创建简化版 ComfyUI 工作流 - 仅使用基础 WanVideo 模型
移除所有需要额外模型的节点（Lynx, Whisper, Wav2Vec, InfiniteTalk 等）
"""

import json
import sys

# 读取完整工作流
with open('/Users/zlw/Desktop/🈚️对口型+动作迁移+表情+运镜_翻唱+Multitalk_InfiniteTalk-wan2.1.json', 'r') as f:
    workflow = json.load(f)

print("🎬 创建简化版工作流")
print("="*60)

# 基础 WanVideo 所需的节点类型（保留这些）
keep_types = {
    'LoadImage',           # 加载图片
    'LoadAudio',           # 加载音频
    'WanVideoModelLoader', # WanVideo 模型加载
    'WanVideoVAE',         # VAE
    'WanVideoTextEncode',  # 文本编码
    'WanVideoTextEncodeCached',
    'WanVideoEmptyEmbeds', # 空嵌入
    'WanVideoSampler',     # 采样器
    'EmptyLTXVideoLatent', # 潜在空间
    'SaveVideo',           # 保存视频
    'WanVideoDecode',      # 解码
    'CLIPTextEncode',      # CLIP 编码
    'CheckpointLoaderSimple', # 基础模型加载
}

# 需要移除的节点类型（需要额外模型的）
remove_types = {
    'WhisperNode',
    'Wav2VecNode', 
    'LynxNode',
    'InfiniteTalkNode',
    'SoundFlow_GetLength',
    'SoundFlow_Pitch',
    'SoundFlow_Beats',
    'SoundFlow_Segment',
    'MultitalkNode',
    'WanVideoUni3C_ControlnetLoader', # ControlNet（可选）
    'LoadVideo',
    'VHS_LoadAudio',
}

nodes = workflow.get('nodes', [])
links = workflow.get('links', [])

print(f"原始节点数: {len(nodes)}")
print(f"原始连接数: {len(links)}")

# 保留的节点
keep_nodes = []
remove_node_ids = set()

for node in nodes:
    node_type = node.get('type', '')
    node_id = node.get('id')
    
    # 检查是否是保留类型
    should_keep = any(keep in node_type for keep in keep_types)
    should_remove = any(remove in node_type for remove in remove_types)
    
    if should_keep and not should_remove:
        keep_nodes.append(node)
    else:
        remove_node_ids.add(node_id)
        if should_remove:
            print(f"  移除: {node_type} (ID: {node_id})")

# 过滤连接 - 只保留两端节点都存在的连接
keep_links = []
for link in links:
    # link 格式: [id, from_node, from_slot, to_node, to_slot, type]
    from_node = link[1]
    to_node = link[3]
    
    if from_node not in remove_node_ids and to_node not in remove_node_ids:
        keep_links.append(link)

print(f"\n保留节点数: {len(keep_nodes)}")
print(f"保留连接数: {len(keep_links)}")

# 更新工作流
workflow['nodes'] = keep_nodes
workflow['links'] = keep_links

# 保存简化版
output_path = '/Users/zlw/Desktop/MuseFlow-Desktop/templates/workflow_basic.json'
import os
os.makedirs(os.path.dirname(output_path), exist_ok=True)

with open(output_path, 'w') as f:
    json.dump(workflow, f, indent=2, ensure_ascii=False)

print(f"\n✅ 简化版工作流已保存: {output_path}")
print("\n💡 说明:")
print("   - 仅使用 WanVideo 基础模型")
print("   - 无需 Whisper/Wav2Vec/Lynx 等模型")
print("   - 适合快速测试和基础视频生成")
