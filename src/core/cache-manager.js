// src/core/cache-manager.js
import crypto from 'crypto';
import Config from '../../config.js';
import logger from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

/**
 * 缓存项
 */
class CacheItem {
    constructor(key, value, ttl = 3600000) {
        this.key = key;
        this.value = value;
        this.createdAt = Date.now();
        this.ttl = ttl; // 毫秒
        this.hits = 0;
    }

    isExpired() {
        return Date.now() - this.createdAt > this.ttl;
    }

    touch() {
        this.hits++;
    }
}

/**
 * 缓存管理器
 * 使用LRU策略缓存API响应，减少重复调用
 */
class CacheManager {
    constructor(options = {}) {
        this.enabled = options.enabled !== undefined ? options.enabled : Config.ENABLE_CACHE;
        this.maxSize = options.maxSize || Config.CACHE_MAX_SIZE;
        this.defaultTTL = options.ttl || 3600000; // 默认1小时
        this.cache = new Map();
        this.accessOrder = []; // 用于LRU

        // 持久化配置
        this.persistenceEnabled = options.persist !== false;
        this.cacheFile = path.join(process.cwd(), 'data', 'cache.json');

        // 统计
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            evictions: 0
        };

        if (this.persistenceEnabled) {
            this.load();
        }
    }

    /**
     * 生成缓存键
     * @param {string} message - 消息内容
     * @param {object} options - 选项（会影响缓存键）
     * @returns {string} 缓存键
     */
    generateKey(message, options = {}) {
        const keyData = {
            message: message,
            model: options.model || Config.DEFAULT_MODEL,
            maxTokens: options.maxTokens || Config.DEFAULT_MAX_TOKENS,
            temperature: options.temperature,
            systemPrompt: options.systemPrompt
        };

        const hash = crypto
            .createHash('sha256')
            .update(JSON.stringify(keyData))
            .digest('hex');

        return hash.substring(0, 16);
    }

    /**
     * 获取缓存
     * @param {string} key - 缓存键
     * @returns {any} 缓存值或null
     */
    get(key) {
        if (!this.enabled) {
            return null;
        }

        const item = this.cache.get(key);

        if (!item) {
            this.stats.misses++;
            return null;
        }

        // 检查是否过期
        if (item.isExpired()) {
            this.delete(key);
            this.stats.misses++;
            return null;
        }

        // 更新访问顺序
        this.updateAccessOrder(key);
        item.touch();
        this.stats.hits++;

        logger.info(`💾 缓存命中: ${key}`);
        return item.value;
    }

    /**
     * 设置缓存
     * @param {string} key - 缓存键
     * @param {any} value - 缓存值
     * @param {number} ttl - 过期时间（毫秒）
     */
    set(key, value, ttl = null) {
        if (!this.enabled) {
            return false;
        }

        // 检查容量
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            this.evictLRU();
        }

        const item = new CacheItem(key, value, ttl || this.defaultTTL);
        this.cache.set(key, item);
        this.updateAccessOrder(key);
        this.stats.sets++;

        // 持久化
        if (this.persistenceEnabled) {
            this.save();
        }

        return true;
    }

    /**
     * 删除缓存
     * @param {string} key - 缓存键
     */
    delete(key) {
        const deleted = this.cache.delete(key);
        if (deleted) {
            this.accessOrder = this.accessOrder.filter(k => k !== key);
            this.stats.deletes++;

            if (this.persistenceEnabled) {
                this.save();
            }
        }
        return deleted;
    }

    /**
     * 更新访问顺序（LRU）
     */
    updateAccessOrder(key) {
        const index = this.accessOrder.indexOf(key);
        if (index !== -1) {
            this.accessOrder.splice(index, 1);
        }
        this.accessOrder.push(key);
    }

    /**
     * 淘汰最少使用的项
     */
    evictLRU() {
        if (this.accessOrder.length === 0) {
            return;
        }

        const lruKey = this.accessOrder.shift();
        this.cache.delete(lruKey);
        this.stats.evictions++;

        logger.warn(`缓存已淘汰: ${lruKey}`);
    }

    /**
     * 清空缓存
     */
    clear() {
        const size = this.cache.size;
        this.cache.clear();
        this.accessOrder = [];
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            evictions: 0
        };

        if (this.persistenceEnabled) {
            this.save();
        }

        logger.info(`缓存已清空: 删除 ${size} 项`);
    }

    /**
     * 获取或设置缓存（包装模式）
     * @param {string} key - 缓存键
     * @param {Function} factory - 生成值的函数
     * @param {number} ttl - 过期时间
     */
    async getOrSet(key, factory, ttl = null) {
        const cached = this.get(key);
        if (cached !== null) {
            return cached;
        }

        const value = await factory();
        this.set(key, value, ttl);
        return value;
    }

    /**
     * 清理过期项
     */
    cleanup() {
        let cleaned = 0;
        const now = Date.now();

        for (const [key, item] of this.cache.entries()) {
            if (now - item.createdAt > item.ttl) {
                this.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            logger.info(`清理过期缓存: ${cleaned} 项`);
        }

        return cleaned;
    }

    /**
     * 获取统计信息
     */
    getStats() {
        const hitRate = this.stats.hits + this.stats.misses > 0
            ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
            : 0;

        return {
            ...this.stats,
            size: this.cache.size,
            maxSize: this.maxSize,
            hitRate: `${hitRate}%`,
            utilization: `${((this.cache.size / this.maxSize) * 100).toFixed(2)}%`
        };
    }

    /**
     * 打印统计信息
     */
    printStats() {
        const stats = this.getStats();

        console.log('\n' + '='.repeat(50));
        console.log('💾 缓存统计');
        console.log('='.repeat(50));
        console.log(`   状态: ${this.enabled ? '✅ 启用' : '❌ 禁用'}`);
        console.log(`   容量: ${stats.size} / ${stats.maxSize} (${stats.utilization})`);
        console.log(`   命中: ${stats.hits} 次`);
        console.log(`   未命中: ${stats.misses} 次`);
        console.log(`   命中率: ${stats.hitRate}`);
        console.log(`   设置: ${stats.sets} 次`);
        console.log(`   淘汰: ${stats.evictions} 次`);
        console.log('='.repeat(50) + '\n');
    }

    /**
     * 保存到文件
     */
    save() {
        try {
            const data = {
                version: 1,
                savedAt: Date.now(),
                cache: Array.from(this.cache.entries()).map(([key, item]) => ({
                    key,
                    value: item.value,
                    createdAt: item.createdAt,
                    ttl: item.ttl,
                    hits: item.hits
                })),
                stats: this.stats
            };

            const dir = path.dirname(this.cacheFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(this.cacheFile, JSON.stringify(data, null, 2), 'utf8');
            return true;
        } catch (error) {
            logger.error(`保存缓存失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 从文件加载
     */
    load() {
        try {
            if (!fs.existsSync(this.cacheFile)) {
                return false;
            }

            const content = fs.readFileSync(this.cacheFile, 'utf8');
            const data = JSON.parse(content);

            this.cache.clear();
            this.accessOrder = [];

            for (const item of data.cache) {
                if (Date.now() - item.createdAt < item.ttl) {
                    const cacheItem = new CacheItem(item.key, item.value, item.ttl);
                    cacheItem.createdAt = item.createdAt;
                    cacheItem.hits = item.hits || 0;
                    this.cache.set(item.key, cacheItem);
                    this.accessOrder.push(item.key);
                }
            }

            this.stats = data.stats || this.stats;

            logger.info(`缓存已加载: ${this.cache.size} 项`);
            return true;
        } catch (error) {
            logger.error(`加载缓存失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 获取缓存大小（字节）
     */
    getSizeInBytes() {
        let total = 0;
        for (const [key, item] of this.cache.entries()) {
            total += key.length * 2; // UTF-16
            total += JSON.stringify(item.value).length * 2;
        }
        return total;
    }
}

export default CacheManager;
