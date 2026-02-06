// src/core/conversation-manager.js
import Anthropic from '@anthropic-ai/sdk';
import Config from '../../config.js';
import logger from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 消息类
 */
class Message {
    constructor(role, content, timestamp = Date.now()) {
        this.role = role;
        this.content = content;
        this.timestamp = timestamp;
    }

    toJSON() {
        return {
            role: this.role,
            content: this.content,
            timestamp: this.timestamp
        };
    }

    static fromJSON(json) {
        return new Message(json.role, json.content, json.timestamp);
    }
}

/**
 * 对话管理器核心类
 * 负责管理对话历史、调用API、维护上下文
 */
class ConversationManager {
    constructor(options = {}) {
        // 构建 Anthropic 客户端配置
        const clientConfig = {
            apiKey: Config.ANTHROPIC_API_KEY || Config.ANTHROPIC_AUTH_TOKEN
        };

        // 如果配置了自定义 BASE_URL，添加到配置中
        if (Config.ANTHROPIC_BASE_URL) {
            clientConfig.baseURL = Config.ANTHROPIC_BASE_URL;
        }

        // 智谱AI可能需要额外的认证头
        if (Config.ANTHROPIC_AUTH_TOKEN && !Config.ANTHROPIC_API_KEY) {
            clientConfig.defaultHeaders = {
                'Authorization': `Bearer ${Config.ANTHROPIC_AUTH_TOKEN}`
            };
        }

        this.client = new Anthropic(clientConfig);

        this.conversationHistory = [];
        this.systemPrompt = options.systemPrompt || null;
        this.model = options.model || Config.DEFAULT_MODEL;
        this.maxTokens = options.maxTokens || Config.DEFAULT_MAX_TOKENS;
        this.temperature = options.temperature || 0.7;

        // 会话ID
        this.sessionId = options.sessionId || this.generateSessionId();

        // 数据目录
        this.dataDir = path.join(process.cwd(), 'data');
        this.ensureDataDir();
    }

    generateSessionId() {
        return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    ensureDataDir() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    /**
     * 设置系统提示
     * @param {string} prompt - 系统提示内容
     */
    setSystemPrompt(prompt) {
        this.systemPrompt = prompt;
        logger.info(`系统提示已设置: ${prompt.substring(0, 50)}...`);
    }

    /**
     * 添加消息到历史记录
     * @param {string} role - 角色 (user/assistant)
     * @param {string} content - 消息内容
     */
    addMessage(role, content) {
        const message = new Message(role, content);
        this.conversationHistory.push(message);
        logger.info(`添加${role}消息: ${content.substring(0, 50)}...`);
        return message;
    }

    /**
     * 获取格式化的消息历史（用于API调用）
     */
    getFormattedHistory() {
        return this.conversationHistory.map(msg => ({
            role: msg.role,
            content: msg.content
        }));
    }

    /**
     * 智能裁剪历史记录
     * 保留系统提示和最近N轮对话
     * @param {number} maxRounds - 保留的最大轮数
     */
    trimHistory(maxRounds = 5) {
        const maxMessages = maxRounds * 2; // 每轮包含user和assistant

        if (this.conversationHistory.length <= maxMessages) {
            return;
        }

        const trimmed = this.conversationHistory.slice(-maxMessages);
        logger.warn(`历史记录已裁剪: 保留最近 ${maxRounds} 轮对话`);
        this.conversationHistory = trimmed;
    }

    /**
     * 发送聊天消息
     * @param {string} userInput - 用户输入
     * @param {object} options - 可选参数
     * @returns {Promise<object>} 响应结果
     */
    async chat(userInput, options = {}) {
        // 添加用户消息
        this.addMessage('user', userInput);

        // 准备API参数
        const apiParams = {
            model: options.model || this.model,
            max_tokens: options.maxTokens || this.maxTokens,
            messages: this.getFormattedHistory()
        };

        if (this.systemPrompt) {
            apiParams.system = this.systemPrompt;
        }

        if (options.temperature !== undefined) {
            apiParams.temperature = options.temperature;
        }

        // 调用API
        try {
            logger.info('正在调用Claude API...');
            const response = await this.client.messages.create(apiParams);

            // 提取回复
            const assistantText = response.content[0].text;

            // 保存助手回复
            this.addMessage('assistant', assistantText);

            // 返回结果
            return {
                success: true,
                content: assistantText,
                usage: {
                    inputTokens: response.usage.input_tokens,
                    outputTokens: response.usage.output_tokens,
                    totalTokens: response.usage.input_tokens + response.usage.output_tokens
                },
                model: response.model,
                stopReason: response.stop_reason
            };

        } catch (error) {
            logger.error(`API调用失败: ${error.message}`);

            // 移除失败的用户消息
            this.conversationHistory.pop();

            return {
                success: false,
                error: error.message,
                content: null
            };
        }
    }

    /**
     * 发送聊天消息（流式响应）
     * @param {string} userInput - 用户输入
     * @param {object} options - 可选参数
     * @param {function} onChunk - 接收数据块的回调函数
     * @returns {Promise<object>} 最终响应结果
     */
    async chatStream(userInput, options = {}, onChunk = null) {
        // 添加用户消息
        this.addMessage('user', userInput);

        // 准备API参数
        const apiParams = {
            model: options.model || this.model,
            max_tokens: options.maxTokens || this.maxTokens,
            messages: this.getFormattedHistory(),
            stream: true
        };

        if (this.systemPrompt) {
            apiParams.system = this.systemPrompt;
        }

        if (options.temperature !== undefined) {
            apiParams.temperature = options.temperature;
        }

        let fullContent = '';
        let inputTokens = 0;
        let outputTokens = 0;
        let model = this.model;
        let stopReason = null;

        try {
            logger.info('正在调用Claude API（流式）...');

            const stream = await this.client.messages.create(apiParams);

            for await (const event of stream) {
                if (event.type === 'content_block_delta') {
                    const chunk = event.delta.text;
                    fullContent += chunk;

                    // 调用回调函数处理每个数据块
                    if (onChunk && chunk) {
                        onChunk({
                            type: 'content',
                            content: chunk
                        });
                    }
                } else if (event.type === 'message_start') {
                    if (event.message && event.message.usage) {
                        inputTokens = event.message.usage.input_tokens;
                    }
                } else if (event.type === 'message_delta') {
                    if (event.usage) {
                        outputTokens = event.usage.output_tokens;
                    }
                    if (event.delta) {
                        stopReason = event.delta.stop_reason;
                    }
                } else if (event.type === 'message_stop') {
                    // 流结束
                }
            }

            // 保存助手回复
            this.addMessage('assistant', fullContent);

            // 返回最终结果
            return {
                success: true,
                content: fullContent,
                usage: {
                    inputTokens,
                    outputTokens,
                    totalTokens: inputTokens + outputTokens
                },
                model,
                stopReason
            };

        } catch (error) {
            logger.error(`API调用失败: ${error.message}`);

            // 移除失败的用户消息
            this.conversationHistory.pop();

            // 通知错误
            if (onChunk) {
                onChunk({
                    type: 'error',
                    error: error.message
                });
            }

            return {
                success: false,
                error: error.message,
                content: null
            };
        }
    }

    /**
     * 发送聊天消息（非流式，保持向后兼容）
     * @param {string} userInput - 用户输入
     * @param {object} options - 可选参数
     * @returns {Promise<object>} 响应结果
     */
    async chat(userInput, options = {}) {
        // 添加用户消息
        this.addMessage('user', userInput);

        // 准备API参数
        const apiParams = {
            model: options.model || this.model,
            max_tokens: options.maxTokens || this.maxTokens,
            messages: this.getFormattedHistory()
        };

        if (this.systemPrompt) {
            apiParams.system = this.systemPrompt;
        }

        if (options.temperature !== undefined) {
            apiParams.temperature = options.temperature;
        }

        // 调用API
        try {
            logger.info('正在调用Claude API...');
            const response = await this.client.messages.create(apiParams);

            // 提取回复
            const assistantText = response.content[0].text;

            // 保存助手回复
            this.addMessage('assistant', assistantText);

            // 返回结果
            return {
                success: true,
                content: assistantText,
                usage: {
                    inputTokens: response.usage.input_tokens,
                    outputTokens: response.usage.output_tokens,
                    totalTokens: response.usage.input_tokens + response.usage.output_tokens
                },
                model: response.model,
                stopReason: response.stop_reason
            };

        } catch (error) {
            logger.error(`API调用失败: ${error.message}`);

            // 移除失败的用户消息
            this.conversationHistory.pop();

            return {
                success: false,
                error: error.message,
                content: null
            };
        }
    }

    /**
     * 获取对话历史摘要
     */
    getSummary() {
        return {
            sessionId: this.sessionId,
            messageCount: this.conversationHistory.length,
            rounds: Math.floor(this.conversationHistory.length / 2),
            model: this.model,
            hasSystemPrompt: !!this.systemPrompt
        };
    }

    /**
     * 清空对话历史
     */
    clearHistory() {
        this.conversationHistory = [];
        logger.info('对话历史已清空');
    }

    /**
     * 保存对话到文件
     * @param {string} filename - 文件名（可选）
     */
    saveConversation(filename = null) {
        if (!filename) {
            filename = `conversation-${this.sessionId}.json`;
        }

        const filepath = path.join(this.dataDir, filename);

        const data = {
            sessionId: this.sessionId,
            systemPrompt: this.systemPrompt,
            model: this.model,
            createdAt: new Date().toISOString(),
            messages: this.conversationHistory.map(msg => msg.toJSON())
        };

        try {
            fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
            logger.info(`对话已保存到: ${filename}`);
            return filepath;
        } catch (error) {
            logger.error(`保存对话失败: ${error.message}`);
            return null;
        }
    }

    /**
     * 从文件加载对话
     * @param {string} filename - 文件名
     */
    loadConversation(filename) {
        const filepath = path.join(this.dataDir, filename);

        try {
            const content = fs.readFileSync(filepath, 'utf8');
            const data = JSON.parse(content);

            this.sessionId = data.sessionId;
            this.systemPrompt = data.systemPrompt;
            this.model = data.model;
            this.conversationHistory = data.messages.map(msg => Message.fromJSON(msg));

            logger.info(`对话已加载: ${filename}`);
            return true;
        } catch (error) {
            logger.error(`加载对话失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 导出对话为可读文本
     * @param {string} filename - 文件名
     */
    exportToText(filename = null) {
        if (!filename) {
            filename = `conversation-${this.sessionId}.txt`;
        }

        const filepath = path.join(this.dataDir, filename);

        const lines = [
            '='.repeat(60),
            `对话记录 - ${this.sessionId}`,
            `模型: ${this.model}`,
            `系统提示: ${this.systemPrompt || '无'}`,
            `导出时间: ${new Date().toLocaleString('zh-CN')}`,
            '='.repeat(60),
            ''
        ];

        for (const msg of this.conversationHistory) {
            const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN');
            const role = msg.role === 'user' ? '👤 用户' : '🤖 Claude';
            lines.push(`[${time}] ${role}`);
            lines.push(msg.content);
            lines.push('');
        }

        try {
            fs.writeFileSync(filepath, lines.join('\n'), 'utf8');
            logger.info(`对话已导出: ${filename}`);
            return filepath;
        } catch (error) {
            logger.error(`导出对话失败: ${error.message}`);
            return null;
        }
    }

    /**
     * 获取所有保存的对话
     */
    listSavedConversations() {
        try {
            const files = fs.readdirSync(this.dataDir)
                .filter(f => f.startsWith('conversation-') && f.endsWith('.json'));

            return files.map(f => {
                const filepath = path.join(this.dataDir, f);
                const stats = fs.statSync(filepath);
                return {
                    filename: f,
                    size: stats.size,
                    modified: stats.mtime
                };
            });
        } catch (error) {
            logger.error(`读取对话列表失败: ${error.message}`);
            return [];
        }
    }
}

export default ConversationManager;
