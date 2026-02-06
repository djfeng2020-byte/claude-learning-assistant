// src/utils/logger.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 日志工具类
 */
class Logger {
    constructor() {
        this.logDir = path.join(process.cwd(), 'logs');
        this.logFile = path.join(this.logDir, `app-${this.getDateString()}.log`);
        this.ensureLogDir();
    }

    ensureLogDir() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    getDateString() {
        const now = new Date();
        return now.toISOString().split('T')[0];
    }

    getTimestamp() {
        return new Date().toISOString();
    }

    formatMessage(level, message) {
        return `[${this.getTimestamp()}] [${level.toUpperCase()}] ${message}`;
    }

    writeToFile(message) {
        try {
            fs.appendFileSync(this.logFile, message + '\n', 'utf8');
        } catch (error) {
            console.error('写入日志文件失败:', error.message);
        }
    }

    log(level, message) {
        const formattedMessage = this.formatMessage(level, message);
        console.log(formattedMessage);
        this.writeToFile(formattedMessage);
    }

    info(message) {
        this.log('info', message);
    }

    warn(message) {
        this.log('warn', `⚠️  ${message}`);
    }

    error(message) {
        this.log('error', `❌ ${message}`);
    }

    success(message) {
        this.log('success', `✅ ${message}`);
    }
}

export default new Logger();
