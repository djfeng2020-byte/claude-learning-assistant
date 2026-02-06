// src/server/server.js
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import CleverAssistant from '../services/clever-assistant.js';
import chatRoutes from './routes/chat.js';
import Config from '../../config.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Express 服务器
 * 提供Web界面和RESTful API
 */
class WebServer {
    constructor(port = 3000) {
        this.port = port;
        this.app = express();

        // 全局单例 CleverAssistant 实例（简化设计，单会话模式）
        this.assistant = new CleverAssistant({
            budgetLimit: Config.BUDGET_LIMIT,
            cache: {
                maxSize: Config.CACHE_MAX_SIZE,
                enabled: Config.ENABLE_CACHE
            }
        });

        this.setupMiddleware();
        this.setupRoutes();
        this.setupStaticFiles();
        this.setupErrorHandling();
    }

    setupMiddleware() {
        // CORS 配置
        this.app.use(cors());

        // JSON 解析
        this.app.use(express.json());

        // 请求日志
        this.app.use((req, res, next) => {
            logger.info(`${req.method} ${req.path}`);
            next();
        });
    }

    setupRoutes() {
        // 将助手实例注入到路由中
        this.app.use((req, res, next) => {
            req.assistant = this.assistant;
            next();
        });

        // API 路由
        this.app.use('/api', chatRoutes);

        // 健康检查
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            });
        });
    }

    setupStaticFiles() {
        // 静态文件服务
        const publicDir = path.join(__dirname, '../../public');

        this.app.use(express.static(publicDir));

        // SPA 路由支持（所有其他路由返回 index.html）
        this.app.get('*', (req, res) => {
            // 排除 API 路由
            if (!req.path.startsWith('/api') && !req.path.startsWith('/health')) {
                res.sendFile(path.join(publicDir, 'index.html'));
            }
        });
    }

    setupErrorHandling() {
        // 404 处理
        this.app.use((req, res) => {
            res.status(404).json({
                success: false,
                error: '未找到请求的资源'
            });
        });

        // 错误处理
        this.app.use((err, req, res, next) => {
            logger.error(`服务器错误: ${err.message}`);

            res.status(500).json({
                success: false,
                error: err.message || '服务器内部错误'
            });
        });
    }

    async start() {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.port, () => {
                    logger.success(`\n🚀 Web 服务器已启动`);
                    logger.info(`📍 访问地址: http://localhost:${this.port}`);
                    logger.info(`💡 按 Ctrl+C 停止服务器\n`);
                    resolve();
                });

                this.server.on('error', (err) => {
                    if (err.code === 'EADDRINUSE') {
                        logger.error(`❌ 端口 ${this.port} 已被占用`);
                    } else {
                        logger.error(`❌ 服务器启动失败: ${err.message}`);
                    }
                    reject(err);
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    async stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    logger.info('服务器已停止');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

// 启动服务器
const isMainModule = (process.argv[1] && process.argv[1].endsWith('server.js')) ||
                      (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`);

if (isMainModule) {
    const port = process.env.PORT || 3000;
    const server = new WebServer(port);

    server.start().catch((err) => {
        logger.error(`启动失败: ${err.message}`);
        process.exit(1);
    });

    // 优雅退出
    process.on('SIGINT', async () => {
        logger.info('\n收到退出信号，正在关闭服务器...');
        await server.stop();
        process.exit(0);
    });
}

export default WebServer;
