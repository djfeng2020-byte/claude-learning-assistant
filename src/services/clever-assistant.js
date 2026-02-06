// src/services/clever-assistant.js
import ConversationManager from '../core/conversation-manager.js';
import TokenTracker from '../core/token-tracker.js';
import CacheManager from '../core/cache-manager.js';
import Config from '../../config.js';
import logger from '../utils/logger.js';

/**
 * 预设的助手角色配置
 */
const ASSISTANT_PRESETS = {
    coding: {
        name: '编程助手',
        systemPrompt: '你是一个专业的编程助手，擅长多种编程语言，能够帮助用户理解代码、调试问题、编写新功能。请提供清晰、有注释的代码示例。',
        temperature: 0.3,
        maxTokens: 1500
    },
    learning: {
        name: '学习助手',
        systemPrompt: '你是一个友好的学习助手，擅长用简单易懂的方式解释复杂概念。请使用例子、类比和循序渐进的方法来帮助用户学习。',
        temperature: 0.7,
        maxTokens: 1000
    },
    writing: {
        name: '写作助手',
        systemPrompt: '你是一个专业的写作助手，能够帮助用户改进文章的语法、结构和表达方式。请提供建设性的反馈和改进建议。',
        temperature: 0.8,
        maxTokens: 1200
    },
    translator: {
        name: '翻译助手',
        systemPrompt: '你是一个专业的翻译助手，擅长中英文互译。请提供准确、自然的翻译，必要时提供上下文解释。',
        temperature: 0.2,
        maxTokens: 800
    }
};

/**
 * 智能助手服务
 * 整合对话管理、Token追踪和缓存功能
 */
class CleverAssistant {
    constructor(options = {}) {
        // 初始化核心组件
        this.conversation = new ConversationManager(options.conversation);
        this.tokenTracker = new TokenTracker(options.budgetLimit);
        this.cache = new CacheManager(options.cache);

        // 当前模式
        this.currentMode = options.mode || 'learning';
        this.applyPreset(this.currentMode);
    }

    /**
     * 应用预设模式
     * @param {string} mode - 模式名称
     */
    applyPreset(mode) {
        const preset = ASSISTANT_PRESETS[mode];
        if (preset) {
            this.conversation.setSystemPrompt(preset.systemPrompt);
            this.conversation.temperature = preset.temperature;
            this.conversation.maxTokens = preset.maxTokens;
            this.currentMode = mode;
            logger.info(`已切换到 ${preset.name} 模式`);
        }
    }

    /**
     * 获取可用模式
     */
    getAvailableModes() {
        return Object.keys(ASSISTANT_PRESETS).map(key => ({
            id: key,
            ...ASSISTANT_PRESETS[key]
        }));
    }

    /**
     * 发送消息
     * @param {string} userInput - 用户输入
     * @param {object} options - 可选参数
     * @returns {Promise<object>} 响应结果
     */
    async sendMessage(userInput, options = {}) {
        // 检查预算
        const budgetStatus = this.tokenTracker.checkBudget();
        if (budgetStatus.isOverBudget) {
            return {
                success: false,
                error: '已超出预算限制',
                content: null
            };
        }

        // 尝试从缓存获取
        const cacheKey = this.cache.generateKey(userInput, {
            model: this.conversation.model,
            temperature: this.conversation.temperature,
            systemPrompt: this.conversation.systemPrompt
        });

        const cachedResponse = this.cache.get(cacheKey);
        if (cachedResponse && !options.disableCache) {
            // 即使是缓存响应，也要添加到对话历史
            this.conversation.addMessage('user', userInput);
            this.conversation.addMessage('assistant', cachedResponse);

            return {
                success: true,
                content: cachedResponse,
                fromCache: true,
                usage: null
            };
        }

        // 调用API
        const response = await this.conversation.chat(userInput, options);

        if (response.success) {
            // 记录Token使用
            this.tokenTracker.recordCall(
                response.usage.inputTokens,
                response.usage.outputTokens,
                response.model
            );

            // 缓存响应
            this.cache.set(cacheKey, response.content);
        }

        return response;
    }

    /**
     * 获取状态摘要
     */
    getStatus() {
        return {
            mode: this.currentMode,
            modeName: ASSISTANT_PRESETS[this.currentMode]?.name,
            conversation: this.conversation.getSummary(),
            tokens: this.tokenTracker.getReport().summary,
            budget: this.tokenTracker.checkBudget(),
            cache: this.cache.getStats()
        };
    }

    /**
     * 打印状态
     */
    printStatus() {
        const status = this.getStatus();

        console.log('\n' + '='.repeat(60));
        console.log('🤖 助手状态');
        console.log('='.repeat(60));
        console.log(`   当前模式: ${status.modeName} (${status.mode})`);
        console.log(`   对话轮数: ${status.conversation.rounds}`);
        console.log(`   请求次数: ${status.tokens.totalRequests}`);
        console.log(`   总Tokens: ${status.tokens.totalTokens.toLocaleString()}`);
        console.log(`   当前成本: $${status.budget.currentCost.toFixed(6)}`);
        console.log(`   缓存命中率: ${status.cache.hitRate}`);
        console.log('='.repeat(60) + '\n');
    }

    /**
     * 切换模式
     * @param {string} mode - 模式名称
     */
    switchMode(mode) {
        if (!ASSISTANT_PRESETS[mode]) {
            const available = Object.keys(ASSISTANT_PRESETS).join(', ');
            throw new Error(`未知模式: ${mode}。可用模式: ${available}`);
        }

        // 保存当前对话
        this.conversation.saveConversation();

        // 清空历史并应用新模式
        this.conversation.clearHistory();
        this.applyPreset(mode);

        logger.success(`已切换到 ${ASSISTANT_PRESETS[mode].name} 模式`);
    }

    /**
     * 获取详细报告
     */
    getDetailedReport() {
        return {
            conversation: this.conversation.getSummary(),
            tokens: this.tokenTracker.getReport(),
            cache: this.cache.getStats(),
            availableModes: this.getAvailableModes()
        };
    }

    /**
     * 重置会话
     */
    reset() {
        this.conversation.clearHistory();
        this.tokenTracker.reset();
        this.cache.clear();
        logger.info('会话已重置');
    }

    /**
     * 保存会话
     */
    save() {
        const conversationPath = this.conversation.saveConversation();
        const tokenPath = this.tokenTracker.exportToCSV();

        return {
            conversation: conversationPath,
            tokens: tokenPath
        };
    }

    /**
     * 获取帮助信息
     */
    getHelp() {
        return {
            commands: [
                { command: '/help', description: '显示帮助信息' },
                { command: '/status', description: '查看当前状态' },
                { command: '/mode', description: '列出可用模式' },
                { command: '/mode <name>', description: '切换模式' },
                { command: '/clear', description: '清空对话历史' },
                { command: '/save', description: '保存当前对话' },
                { command: '/report', description: '显示详细报告' },
                { command: '/reset', description: '重置会话' },
                { command: '/quit', description: '退出程序' }
            ],
            modes: this.getAvailableModes()
        };
    }
}

export default CleverAssistant;
