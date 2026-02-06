// config.js
import dotenv from 'dotenv';

dotenv.config();

/**
 * 配置管理类
 * 负责加载和验证应用配置
 */
class Config {
    // API配置
    static ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    static ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL;
    static ANTHROPIC_AUTH_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN;
    static DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'claude-3-5-sonnet-20241022';
    static DEFAULT_MAX_TOKENS = parseInt(process.env.DEFAULT_MAX_TOKENS || '1024');

    // 成本控制配置
    static BUDGET_LIMIT = parseFloat(process.env.BUDGET_LIMIT || '0.50');
    static WARN_THRESHOLD = parseFloat(process.env.WARN_THRESHOLD || '0.80');

    // 缓存配置
    static ENABLE_CACHE = process.env.ENABLE_CACHE === 'true';
    static CACHE_MAX_SIZE = parseInt(process.env.CACHE_MAX_SIZE || '100');

    // 日志配置
    static LOG_LEVEL = process.env.LOG_LEVEL || 'info';

    // 模型价格配置（美元/百万tokens）
    static MODEL_PRICES = {
        'claude-3-5-sonnet-20241022': { input: 3, output: 15, name: 'Claude 3.5 Sonnet' },
        'claude-3-opus-20240229': { input: 15, output: 75, name: 'Claude 3 Opus' },
        'claude-3-haiku-20240307': { input: 0.25, output: 1.25, name: 'Claude 3 Haiku' },
        'GLM-4.7': { input: 0.5, output: 0.5, name: '智谱 GLM-4.7' }
    };

    /**
     * 验证配置
     * @throws {Error} 如果配置无效
     */
    static validate() {
        const errors = [];

        // 智谱AI兼容模式：如果有 AUTH_TOKEN，则不需要 API_KEY
        if (this.ANTHROPIC_AUTH_TOKEN) {
            // 智谱模式，不需要验证 API_KEY 格式
            if (!this.ANTHROPIC_BASE_URL) {
                errors.push('❌ 使用智谱AI时必须配置 ANTHROPIC_BASE_URL');
            }
        } else if (!this.ANTHROPIC_API_KEY) {
            errors.push('❌ 未找到 ANTHROPIC_API_KEY！请在.env文件中配置');
        } else if (!this.ANTHROPIC_API_KEY.startsWith('sk-ant-')) {
            errors.push('❌ ANTHROPIC_API_KEY 格式无效');
        }

        if (this.DEFAULT_MAX_TOKENS < 1 || this.DEFAULT_MAX_TOKENS > 8192) {
            errors.push('❌ DEFAULT_MAX_TOKENS 必须在 1-8192 之间');
        }

        if (this.BUDGET_LIMIT <= 0) {
            errors.push('❌ BUDGET_LIMIT 必须大于0');
        }

        if (errors.length > 0) {
            throw new Error(errors.join('\n'));
        }

        return true;
    }

    /**
     * 获取模型价格信息
     * @param {string} model - 模型名称
     * @returns {object} 价格信息
     */
    static getModelPrice(model = this.DEFAULT_MODEL) {
        return this.MODEL_PRICES[model] || this.MODEL_PRICES[this.DEFAULT_MODEL];
    }

    /**
     * 打印配置摘要
     */
    static printSummary() {
        console.log('\n📋 配置信息:');
        console.log(`   模型: ${this.getModelPrice().name}`);
        console.log(`   最大Tokens: ${this.DEFAULT_MAX_TOKENS}`);
        console.log(`   预算限制: $${this.BUDGET_LIMIT.toFixed(2)}`);
        console.log(`   缓存: ${this.ENABLE_CACHE ? '✅ 启用' : '❌ 禁用'}`);
        console.log('');
    }
}

export default Config;
