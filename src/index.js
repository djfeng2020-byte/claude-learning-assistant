// src/index.js
import readline from 'readline';
import Config from '../config.js';
import logger from './utils/logger.js';
import CleverAssistant from './services/clever-assistant.js';
import chalk from 'chalk';
import boxen from 'boxen';
import ora from 'ora';

/**
 * CLI应用主类
 */
class ChatCLI {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        this.assistant = null;
        this.isRunning = false;
    }

    /**
     * 显示欢迎界面
     */
    showWelcome() {
        const welcome = boxen(
            chalk.cyan.bold('🤖 Claude API 实战项目') + '\n\n' +
            chalk.white('智能对话学习助手') + '\n\n' +
            chalk.gray('输入 /help 查看可用命令'),
            {
                padding: 1,
                margin: 1,
                borderStyle: 'double',
                borderColor: 'cyan'
            }
        );
        console.log(welcome);
    }

    /**
     * 初始化应用
     */
    async initialize() {
        // 验证配置
        try {
            Config.validate();
        } catch (error) {
            console.error(chalk.red('配置错误:'));
            console.error(chalk.red(error.message));
            console.log(chalk.yellow('\n请确保已创建 .env 文件并配置 ANTHROPIC_API_KEY'));
            console.log(chalk.yellow('可以复制 .env.example 为 .env 进行配置'));
            process.exit(1);
        }

        // 显示配置
        Config.printSummary();

        // 创建助手实例
        this.assistant = new CleverAssistant({
            budgetLimit: Config.BUDGET_LIMIT
        });

        logger.success('助手初始化完成');
    }

    /**
     * 提示用户输入
     * @param {string} prompt - 提示文本
     * @returns {Promise<string>} 用户输入
     */
    question(prompt) {
        return new Promise(resolve => {
            this.rl.question(prompt, resolve);
        });
    }

    /**
     * 显示帮助信息
     */
    showHelp() {
        const help = this.assistant.getHelp();

        console.log('\n' + chalk.cyan.bold('📖 可用命令\n'));

        console.log(chalk.white.bold('命令列表:'));
        for (const cmd of help.commands) {
            console.log(`  ${chalk.green(cmd.command.padEnd(20))} ${chalk.gray(cmd.description)}`);
        }

        console.log('\n' + chalk.white.bold('可用模式:'));
        for (const mode of help.modes) {
            const isCurrent = mode.id === this.assistant.currentMode;
            const indicator = isCurrent ? chalk.green('✓') : ' ';
            console.log(`  ${indicator} ${chalk.cyan(mode.id.padEnd(15))} - ${chalk.white(mode.name)}`);
        }

        console.log('');
    }

    /**
     * 处理命令
     * @param {string} input - 用户输入
     * @returns {Promise<boolean>} 是否继续运行
     */
    async handleCommand(input) {
        const parts = input.trim().split(' ');
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);

        switch (command) {
            case '/help':
            case '/h':
                this.showHelp();
                break;

            case '/status':
            case '/s':
                this.assistant.printStatus();
                break;

            case '/mode':
                if (args.length === 0) {
                    const modes = this.assistant.getAvailableModes();
                    console.log('\n可用模式:');
                    for (const mode of modes) {
                        const isCurrent = mode.id === this.assistant.currentMode;
                        const prefix = isCurrent ? chalk.green('→') : ' ';
                        console.log(`  ${prefix} ${chalk.cyan(mode.id)}: ${mode.name}`);
                    }
                    console.log('');
                    console.log(chalk.gray('使用 /mode <名称> 切换模式'));
                } else {
                    try {
                        this.assistant.switchMode(args[0]);
                        console.log(chalk.green(`✓ 已切换到 ${args[0]} 模式`));
                    } catch (error) {
                        console.log(chalk.red(`✗ ${error.message}`));
                    }
                }
                break;

            case '/clear':
                this.assistant.conversation.clearHistory();
                console.log(chalk.green('✓ 对话历史已清空'));
                break;

            case '/save':
                const paths = this.assistant.save();
                console.log(chalk.green('✓ 对话已保存'));
                if (paths.conversation) {
                    console.log(chalk.gray(`  对话: ${paths.conversation}`));
                }
                if (paths.tokens) {
                    console.log(chalk.gray(`  Tokens: ${paths.tokens}`));
                }
                break;

            case '/report':
            case '/r':
                const report = this.assistant.getDetailedReport();
                console.log('\n' + chalk.cyan.bold('📊 详细报告\n'));

                console.log(chalk.white.bold('对话统计:'));
                console.log(`  会话ID: ${chalk.gray(report.conversation.sessionId)}`);
                console.log(`  对话轮数: ${chalk.cyan(report.conversation.rounds)}`);
                console.log(`  消息数: ${chalk.cyan(report.conversation.messageCount)}`);

                console.log('\n' + chalk.white.bold('Token统计:'));
                console.log(`  请求次数: ${chalk.cyan(report.tokens.summary.totalRequests)}`);
                console.log(`  总Tokens: ${chalk.cyan(report.tokens.summary.totalTokens.toLocaleString())}`);
                console.log(`  总成本: ${chalk.yellow('$' + report.tokens.budget.currentCost.toFixed(6))}`);
                console.log(`  剩余预算: ${chalk.yellow('$' + report.tokens.budget.remaining.toFixed(6))}`);

                console.log('\n' + chalk.white.bold('缓存统计:'));
                console.log(`  容量: ${chalk.cyan(report.cache.size + ' / ' + report.cache.maxSize)}`);
                console.log(`  命中率: ${chalk.cyan(report.cache.hitRate)}`);
                console.log('');
                break;

            case '/reset':
                const confirm = await this.question(chalk.yellow('确定要重置会话吗？(y/N): '));
                if (confirm.toLowerCase() === 'y') {
                    this.assistant.reset();
                    console.log(chalk.green('✓ 会话已重置'));
                }
                break;

            case '/cache':
                this.assistant.cache.printStats();
                break;

            case '/quit':
            case '/exit':
            case '/q':
                return false;

            default:
                console.log(chalk.red(`✗ 未知命令: ${command}`));
                console.log(chalk.gray('输入 /help 查看可用命令'));
        }

        return true;
    }

    /**
     * 处理聊天消息
     * @param {string} input - 用户输入
     */
    async handleChat(input) {
        if (!input.trim()) {
            return;
        }

        // 检查预算
        const budgetStatus = this.assistant.tokenTracker.checkBudget();
        if (budgetStatus.isOverBudget) {
            console.log(chalk.red('⚠️ 已超出预算限制，无法继续对话'));
            console.log(chalk.yellow('使用 /reset 重置或增加预算限制'));
            return;
        }

        // 显示思考动画
        const spinner = ora({
            text: 'Claude 正在思考...',
            color: 'cyan'
        }).start();

        try {
            const response = await this.assistant.sendMessage(input);
            spinner.stop();

            if (response.success) {
                // 显示响应
                console.log('\n' + chalk.cyan.bold('🤖 Claude:'));
                console.log(chalk.white(response.content));

                // 显示使用信息
                if (response.usage) {
                    console.log('\n' + chalk.gray(`└─ Tokens: ${response.usage.totalTokens} | 成本: $${this.assistant.tokenTracker.calculateSingleCallCost(response.usage.inputTokens, response.usage.outputTokens).toFixed(6)}`));
                }

                // 如果来自缓存
                if (response.fromCache) {
                    console.log(chalk.green('💾 来自缓存'));
                }
            } else {
                console.log(chalk.red(`\n✗ 错误: ${response.error}`));
            }

        } catch (error) {
            spinner.stop();
            console.log(chalk.red(`\n✗ 发生错误: ${error.message}`));
        }
    }

    /**
     * 主循环
     */
    async mainLoop() {
        while (this.isRunning) {
            try {
                const mode = this.assistant.getAvailableModes().find(
                    m => m.id === this.assistant.currentMode
                );

                const prompt = `\n${chalk.cyan('👤 你')} [${chalk.yellow(mode?.name || this.assistant.currentMode)}]> `;
                const input = await this.question(prompt);

                if (!input.trim()) {
                    continue;
                }

                // 处理命令
                if (input.startsWith('/')) {
                    const shouldContinue = await this.handleCommand(input);
                    if (!shouldContinue) {
                        break;
                    }
                } else {
                    // 处理聊天消息
                    await this.handleChat(input);
                }

            } catch (error) {
                console.log(chalk.red(`\n✗ 错误: ${error.message}`));
            }
        }
    }

    /**
     * 启动应用
     */
    async start() {
        this.isRunning = true;

        try {
            await this.initialize();
            this.showWelcome();
            await this.mainLoop();

        } catch (error) {
            console.error(chalk.red(`\n启动失败: ${error.message}`));
            throw error;
        } finally {
            this.shutdown();
        }
    }

    /**
     * 关闭应用
     */
    shutdown() {
        this.isRunning = false;

        console.log('\n' + chalk.cyan('正在关闭...'));

        // 保存对话
        if (this.assistant) {
            this.assistant.save();
        }

        this.rl.close();

        console.log(chalk.green('✓ 再见！\n'));
    }
}

// 启动应用
const app = new ChatCLI();
app.start().catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
});
