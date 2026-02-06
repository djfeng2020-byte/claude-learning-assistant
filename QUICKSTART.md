# 🚀 快速开始指南

## 第一步：安装依赖

```bash
cd claude-api-practical-project
npm install
```

## 第二步：配置API Key

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，填入你的 API Key
# ANTHROPIC_API_KEY=sk-ant-api03-你的API-Key
```

## 第三步：运行应用

```bash
npm start
```

## 💬 使用示例

启动后，你可以：

1. **直接对话**
   ```
   👤 你 [学习助手]> 请解释什么是闭包？
   ```

2. **切换模式**
   ```
   👤 你 [学习助手]> /mode coding
   ```

3. **查看状态**
   ```
   👤 你 [编程助手]> /status
   ```

4. **获取帮助**
   ```
   👤 你 [编程助手]> /help
   ```

## 📋 可用命令速查

| 命令 | 功能 |
|------|------|
| `/help` | 显示帮助 |
| `/status` | 查看状态 |
| `/mode` | 列出模式 |
| `/mode <name>` | 切换模式 |
| `/clear` | 清空历史 |
| `/save` | 保存对话 |
| `/report` | 详细报告 |
| `/quit` | 退出 |

## 🔑 获取API Key

1. 访问 https://console.anthropic.com
2. 注册/登录账号
3. 进入 "API Keys" 页面
4. 点击 "Create Key" 创建
5. 复制保存到 `.env` 文件

---

需要更多帮助？查看 [README.md](README.md)
