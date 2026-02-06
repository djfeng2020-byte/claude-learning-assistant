# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个基于 Anthropic Claude API 的 Node.js 实战项目，实现了一个功能完整的智能对话学习助手。项目采用 ES6 模块系统（type: "module"），使用纯 JavaScript 开发。

### 核心架构

项目采用分层架构，核心组件包括：

- **ConversationManager** (`src/core/conversation-manager.js`): 管理对话历史、调用 Claude API、维护上下文
- **TokenTracker** (`src/core/token-tracker.js`): 追踪 API 调用的 Token 使用情况和成本计算
- **CacheManager** (`src/core/cache-manager.js`): 使用 LRU 策略缓存 API 响应，减少重复调用
- **CleverAssistant** (`src/services/clever-assistant.js`): 整合上述核心功能的服务层，支持多种助手模式
- **ChatCLI** (`src/index.js`): 命令行交互界面

### 数据流

```
用户输入 → ChatCLI → CleverAssistant → CacheManager (检查缓存)
                                  ↓
                          ConversationManager (调用 API)
                                  ↓
                          TokenTracker (记录使用情况)
```

## 常用命令

### 安装依赖
```bash
npm install
# 或使用 pnpm
pnpm install
```

### 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 文件，设置 ANTHROPIC_API_KEY
```

### 运行应用
```bash
npm start          # 启动应用
npm run dev        # 开发模式（Node.js 18.17+，支持 --watch）
```

### 测试
```bash
npm test           # 运行测试（如果存在测试文件）
```

## 配置说明

### 环境变量 (.env)

- `ANTHROPIC_API_KEY`: 必需，Anthropic API 密钥（格式：sk-ant-api03-...）
- `DEFAULT_MODEL`: 默认模型（默认：claude-3-5-sonnet-20241022）
- `DEFAULT_MAX_TOKENS`: 默认最大 tokens（默认：1024）
- `BUDGET_LIMIT`: 预算限制（默认：0.50 美元）
- `WARN_THRESHOLD`: 预算警告阈值（默认：0.80，即 80%）
- `ENABLE_CACHE`: 是否启用缓存（默认：true）
- `CACHE_MAX_SIZE`: 缓存最大条目数（默认：100）
- `LOG_LEVEL`: 日志级别（默认：info）

### 模型价格配置

在 `config.js` 的 `MODEL_PRICES` 中定义了不同模型的输入/输出价格：

- Claude 3.5 Sonnet: $3/百万输入, $15/百万输出
- Claude 3 Opus: $15/百万输入, $75/百万输出
- Claude 3 Haiku: $0.25/百万输入, $1.25/百万输出

## 助手模式

在 `src/services/clever-assistant.js` 的 `ASSISTANT_PRESETS` 中定义了四种预设模式：

- **coding**: 编程助手（低温度 0.3，高 token 限制 1500）
- **learning**: 学习助手（中温度 0.7，中等 token 限制 1000）
- **writing**: 写作助手（高温度 0.8，高 token 限制 1200）
- **translator**: 翻译助手（低温度 0.2，低 token 限制 800）

切换模式会：
1. 保存当前对话
2. 清空对话历史
3. 应用新模式对应的 systemPrompt、temperature 和 maxTokens

## 重要设计决策

### 缓存键生成

`CacheManager.generateKey()` 基于以下内容生成 SHA256 哈希作为缓存键：
- 用户消息内容
- 模型名称
- 最大 tokens
- temperature
- systemPrompt

这确保只有在所有相关参数相同时才使用缓存。

### 对话历史管理

`ConversationManager` 维护完整的对话历史，包括：
- 用户和助手的所有消息
- 每条消息的时间戳
- 当前系统提示
- 会话 ID

历史记录会自动添加到每个 API 请求中，以维护上下文。使用 `trimHistory()` 方法可以限制历史记录长度。

### 预算控制

`TokenTracker` 在每次 API 调用后检查预算：
- 调用前检查：`CleverAssistant.sendMessage()` 中
- 调用后记录：`recordCall()` 方法
- 超出预算时：拒绝新的 API 请求

## 文件和目录结构

```
data/              # 自动创建，存储保存的对话和缓存
  ├── conversation-*.json
  ├── token-usage-*.csv
  └── cache.json

logs/              # 自动创建，存储应用日志
  └── app-*.log
```

## 扩展指南

### 添加新的助手模式

编辑 `src/services/clever-assistant.js`，在 `ASSISTANT_PRESETS` 中添加新配置：

```javascript
const ASSISTANT_PRESETS = {
    // 现有模式...
    custom: {
        name: '自定义助手',
        systemPrompt: '你的自定义系统提示',
        temperature: 0.5,
        maxTokens: 1000
    }
};
```

### 修改缓存策略

`CacheManager` 使用 LRU（最近最少使用）淘汰策略。可以通过修改 `evictLRU()` 方法实现其他策略。

### 自定义日志

编辑 `.env` 文件设置 `LOG_LEVEL`：
- `debug`: 详细调试信息
- `info`: 一般信息（默认）
- `warn`: 警告信息
- `error`: 仅错误信息

## 注意事项

1. **API 密钥格式**: 必须以 `sk-ant-api03-` 开头
2. **Token 限制**: `DEFAULT_MAX_TOKENS` 必须在 1-8192 之间
3. **预算单位**: 所有金额以美元为单位
4. **ES6 模块**: 使用 `import/export`，不是 `require/module.exports`
5. **中文优先**: 项目面向中文用户，所有输出应为中文

## 故障排除

- **API 调用失败**: 检查 `ANTHROPIC_API_KEY` 是否正确设置
- **预算超出**: 使用 `/reset` 命令或增加 `BUDGET_LIMIT`
- **缓存未命中**: 检查 `ENABLE_CACHE` 和相关参数是否一致
- **依赖问题**: 删除 `node_modules` 和 `pnpm-lock.yaml`，重新安装
