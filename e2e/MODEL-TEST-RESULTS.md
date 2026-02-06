# AI 模型测试结果

测试时间：2026-02-05

## 测试环境
- Stagehand: 3.0.8
- OpenAI SDK: 4.87.1
- new-api 代理: http://127.0.0.1:3000/v1
- CleanJsonOpenAIClient: 自定义实现

## 测试结果

### ✅ glm-4.7
- **状态**: 完全可用
- **响应速度**: 约 14 秒
- **响应质量**: 优秀
- **特点**:
  - 提供详细的 reasoning_content（推理过程）
  - JSON 格式规范
  - 元素定位准确
  - 支持复杂的 accessibility tree 分析
- **推荐**: ⭐⭐⭐⭐⭐ 主要模型

### ✅ MiniMax-M2.1
- **状态**: 完全可用
- **响应速度**: 约 12 秒
- **响应质量**: 良好
- **特点**:
  - 返回 markdown 包裹的 JSON（已通过 CleanJsonOpenAIClient 处理）
  - 理解能力强
  - 元素定位准确
- **推荐**: ⭐⭐⭐⭐ 备用模型

### ❌ gemini-3-flash-preview
- **状态**: 配额用完（429 错误）
- **备注**: 模型本身能力强，但当前不可用

## 配置建议

**推荐配置**（已应用到 .env）:
```bash
OPENAI_MODEL_NAME=glm-4.7,MiniMax-M2.1,gemini-3-flash-preview
```

**优先级**:
1. glm-4.7 - 主要模型（速度、质量平衡最佳）
2. MiniMax-M2.1 - 备用模型（质量可靠）
3. gemini-3-flash-preview - 兜底（如果配额恢复）

## 关键发现

1. **所有模型都需要正确的页面状态**
   - 必须先创建项目和会话
   - message input 才会在 accessibility tree 中可见

2. **响应格式至关重要**
   - Stagehand 期望: `{ data: parsedJSON, usage: stats }`
   - 不能直接返回 OpenAI 原始响应

3. **Temperature 设置**
   - 强制使用 0.7 而不是 Stagehand 默认的 0.1
   - 0.1 太低会导致不稳定输出

4. **Markdown 清理**
   - MiniMax 等模型会返回 ```json ... ``` 格式
   - CleanJsonOpenAIClient 自动清理

## 下一步

继续执行原计划：
- [ ] 实现 41 个未完成的测试用例
- [ ] 重构 40 个现有测试使用 AI 模式
