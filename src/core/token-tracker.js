// src/core/token-tracker.js
import Config from '../../config.js';
import logger from '../utils/logger.js';

/**
 * Token追踪器
 * 负责追踪API调用的Token使用情况和成本
 */
class TokenTracker {
    constructor(budgetLimit = Config.BUDGET_LIMIT) {
        this.reset();
        this.budgetLimit = budgetLimit;
        this.warnThreshold = Config.WARN_THRESHOLD;
        this.callHistory = [];
    }

    /**
     * 重置追踪器
     */
    reset() {
        this.totalInputTokens = 0;
        this.totalOutputTokens = 0;
        this.totalRequests = 0;
        this.callHistory = [];
        logger.info('Token追踪器已重置');
    }

    /**
     * 记录一次API调用
     * @param {number} inputTokens - 输入tokens
     * @param {number} outputTokens - 输出tokens
     * @param {string} model - 模型名称
     * @param {string} requestId - 请求ID
     */
    recordCall(inputTokens, outputTokens, model = Config.DEFAULT_MODEL, requestId = null) {
        this.totalInputTokens += inputTokens;
        this.totalOutputTokens += outputTokens;
        this.totalRequests++;

        const record = {
            timestamp: Date.now(),
            requestId: requestId || `req-${Date.now()}`,
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
            model,
            cost: this.calculateSingleCallCost(inputTokens, outputTokens, model)
        };

        this.callHistory.push(record);

        logger.info(`记录API调用: ${inputTokens} 输入, ${outputTokens} 输出, 成本 $${record.cost.toFixed(6)}`);

        // 检查预算
        this.checkBudget();

        return record;
    }

    /**
     * 计算单次调用成本
     * @param {number} inputTokens - 输入tokens
     * @param {number} outputTokens - 输出tokens
     * @param {string} model - 模型名称
     * @returns {number} 成本（美元）
     */
    calculateSingleCallCost(inputTokens, outputTokens, model = Config.DEFAULT_MODEL) {
        const price = Config.getModelPrice(model);
        const inputCost = (inputTokens / 1_000_000) * price.input;
        const outputCost = (outputTokens / 1_000_000) * price.output;
        return inputCost + outputCost;
    }

    /**
     * 获取当前总成本
     * @returns {number} 总成本（美元）
     */
    getTotalCost() {
        return this.callHistory.reduce((sum, record) => sum + record.cost, 0);
    }

    /**
     * 检查预算状态
     * @returns {object} 预算状态
     */
    checkBudget() {
        const currentCost = this.getTotalCost();
        const usagePercentage = (currentCost / this.budgetLimit) * 100;

        const status = {
            currentCost,
            budgetLimit: this.budgetLimit,
            remaining: this.budgetLimit - currentCost,
            usagePercentage: usagePercentage.toFixed(2),
            isOverBudget: currentCost >= this.budgetLimit,
            isNearLimit: currentCost >= this.budgetLimit * this.warnThreshold
        };

        if (status.isOverBudget) {
            logger.error(`⚠️ 超出预算！已使用 $${currentCost.toFixed(4)} / $${this.budgetLimit.toFixed(2)}`);
        } else if (status.isNearLimit) {
            logger.warn(`⚠️ 即将达到预算限制！已使用 ${status.usagePercentage}%`);
        }

        return status;
    }

    /**
     * 获取详细报告
     * @returns {object} 详细报告
     */
    getReport() {
        const budgetStatus = this.checkBudget();

        // 按模型统计
        const byModel = {};
        for (const record of this.callHistory) {
            if (!byModel[record.model]) {
                byModel[record.model] = {
                    calls: 0,
                    inputTokens: 0,
                    outputTokens: 0,
                    totalTokens: 0,
                    cost: 0
                };
            }
            byModel[record.model].calls++;
            byModel[record.model].inputTokens += record.inputTokens;
            byModel[record.model].outputTokens += record.outputTokens;
            byModel[record.model].totalTokens += record.totalTokens;
            byModel[record.model].cost += record.cost;
        }

        return {
            summary: {
                totalRequests: this.totalRequests,
                totalInputTokens: this.totalInputTokens,
                totalOutputTokens: this.totalOutputTokens,
                totalTokens: this.totalInputTokens + this.totalOutputTokens,
                totalCost: budgetStatus.currentCost,
                averageTokensPerRequest: this.totalRequests > 0
                    ? Math.round((this.totalInputTokens + this.totalOutputTokens) / this.totalRequests)
                    : 0
            },
            budget: budgetStatus,
            byModel,
            recentCalls: this.callHistory.slice(-10)
        };
    }

    /**
     * 打印格式化报告
     */
    printReport() {
        const report = this.getReport();

        console.log('\n' + '='.repeat(60));
        console.log('📊 Token使用报告');
        console.log('='.repeat(60));

        // 摘要
        console.log('\n📈 总体统计:');
        console.log(`   请求次数: ${report.summary.totalRequests}`);
        console.log(`   输入Tokens: ${report.summary.totalInputTokens.toLocaleString()}`);
        console.log(`   输出Tokens: ${report.summary.totalOutputTokens.toLocaleString()}`);
        console.log(`   总Tokens: ${report.summary.totalTokens.toLocaleString()}`);
        console.log(`   平均每请求: ${report.summary.averageTokensPerRequest} tokens`);

        // 成本
        console.log('\n💰 成本统计:');
        console.log(`   当前成本: $${report.budget.currentCost.toFixed(6)}`);
        console.log(`   预算限制: $${report.budget.budgetLimit.toFixed(2)}`);
        console.log(`   剩余预算: $${report.budget.remaining.toFixed(6)}`);
        console.log(`   使用比例: ${report.budget.usagePercentage}%`);

        // 预算状态
        if (report.budget.isOverBudget) {
            console.log('   状态: ❌ 超出预算');
        } else if (report.budget.isNearLimit) {
            console.log('   状态: ⚠️  接近限额');
        } else {
            console.log('   状态: ✅ 正常');
        }

        // 按模型统计
        if (Object.keys(report.byModel).length > 0) {
            console.log('\n🤖 按模型统计:');
            for (const [model, stats] of Object.entries(report.byModel)) {
                const modelName = Config.getModelPrice(model).name;
                console.log(`   ${modelName}:`);
                console.log(`     请求: ${stats.calls} 次`);
                console.log(`     Tokens: ${stats.totalTokens.toLocaleString()}`);
                console.log(`     成本: $${stats.cost.toFixed(6)}`);
            }
        }

        console.log('\n' + '='.repeat(60) + '\n');
    }

    /**
     * 预估算成本
     * @param {number} estimatedInputTokens - 预估输入tokens
     * @param {number} estimatedOutputTokens - 预估输出tokens
     * @param {string} model - 模型名称
     * @returns {object} 预算估算
     */
    estimate(estimatedInputTokens, estimatedOutputTokens, model = Config.DEFAULT_MODEL) {
        const estimatedCost = this.calculateSingleCallCost(
            estimatedInputTokens,
            estimatedOutputTokens,
            model
        );

        const newTotalCost = this.getTotalCost() + estimatedCost;
        const wouldExceedBudget = newTotalCost > this.budgetLimit;

        return {
            estimatedCost,
            estimatedInputTokens,
            estimatedOutputTokens,
            estimatedTotalTokens: estimatedInputTokens + estimatedOutputTokens,
            currentTotalCost: this.getTotalCost(),
            newTotalCost,
            wouldExceedBudget,
            remainingAfterCall: this.budgetLimit - newTotalCost
        };
    }

    /**
     * 导出历史记录为CSV
     * @param {string} filepath - 文件路径
     */
    exportToCSV(filepath = null) {
        if (!filepath) {
            filepath = `token-usage-${Date.now()}.csv`;
        }

        const lines = [
            'Timestamp,RequestId,Model,InputTokens,OutputTokens,TotalTokens,Cost'
        ];

        for (const record of this.callHistory) {
            const time = new Date(record.timestamp).toISOString();
            lines.push(
                `${time},${record.requestId},${record.model},` +
                `${record.inputTokens},${record.outputTokens},${record.totalTokens},` +
                `${record.cost.toFixed(6)}`
            );
        }

        try {
            const fs = require('fs');
            fs.writeFileSync(filepath, lines.join('\n'), 'utf8');
            logger.info(`Token历史已导出到: ${filepath}`);
            return filepath;
        } catch (error) {
            logger.error(`导出CSV失败: ${error.message}`);
            return null;
        }
    }
}

export default TokenTracker;
