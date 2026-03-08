# MuseFlow Desktop 工作流更新记录

**日期**: 2026-02-09  
**变更**: 简化工作流选择，只保留两个版本

---

## 📝 变更内容

### 工作流选择简化

**之前**:
- 完整版 (full)
- 简化版 (simple)
- 无音频分离版 (no_audio_sep) ← 默认
- 大师版 (master)

**现在**:
- **普通版 (normal)** - 单镜头，快速生成
- **大师版 (master)** - 4分镜，更丰富的视觉变化

### 对应的工作流文件

| 工作流类型 | 文件路径 |
|-----------|----------|
| 普通版 | `/Users/zlw/Desktop/MuseFlow-Desktop/InfiniteTalk20251121.json` |
| 大师版 | `/Users/zlw/Desktop/MuseFlow-Desktop/最终版_AI歌手大师版+humo+infinite talk+lynx多分镜.json` |

---

## 🔧 修改的文件

1. **src/workflowInjector.js**
   - 更新 `workflowTemplates` 对象，只保留 `normal` 和 `master` 两个键

2. **src/index.html**
   - 简化下拉选项，只保留普通版和大师版
   - 更新提示文本

3. **src/app.js**
   - 更新 `workflowHints` 对象
   - 更新日志输出文本

4. **README.md**
   - 更新使用流程说明
   - 更新界面预览图中文本
   - 更新注意事项中的模板文件说明

5. **PROGRESS.md**
   - 更新测试流程说明

---

## 🎯 用户界面变化

### 下拉菜单
```
之前:
[完整版 (需完整模型: Whisper+Wav2Vec+Lynx)      ]
[无音频分离版 (立即可用，推荐)                  ] ← 默认
[大师版 - 多分镜 (需要额外配置)                 ]

现在:
[普通版 (单镜头，快速生成)                      ] ← 默认
[大师版 (4分镜，更丰富的视觉变化)               ]
```

### 提示文本
```
之前: "自动移除 AudioSeparation 节点，避免模型错误"
现在: "普通版适合快速测试，大师版适合制作高质量MV"
```

---

## ✅ 验证清单

- [x] workflowInjector.js 模板路径已更新
- [x] index.html 下拉选项已简化
- [x] app.js 提示文本已更新
- [x] README.md 文档已同步
- [x] PROGRESS.md 已更新

---

## 💡 使用建议

**普通版适用场景**:
- 快速测试视频生成效果
- 不需要复杂镜头切换的简单MV
- 对生成速度有要求

**大师版适用场景**:
- 制作专业级AI MV作品
- 需要丰富的镜头语言和视觉变化
- 已配置 MOONSHOT_API_KEY 使用AI分镜生成功能
