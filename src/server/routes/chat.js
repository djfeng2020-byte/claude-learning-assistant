// src/server/routes/chat.js
import express from 'express';
import logger from '../../utils/logger.js';

const router = express.Router();

/**
 * POST /api/chat
 * 发送消息（非流式）
 */
router.post('/chat', async (req, res) => {
    try {
        const { message, options = {} } = req.body;
        const assistant = req.assistant;

        if (!message) {
            return res.status(400).json({
                success: false,
                error: '消息内容不能为空'
            });
        }

        const response = await assistant.sendMessage(message, options);

        res.json(response);
    } catch (error) {
        logger.error(`聊天API错误: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/chat/stream
 * 发送消息（流式响应，使用 SSE）
 */
router.post('/chat/stream', async (req, res) => {
    try {
        const { message, options = {} } = req.body;
        const assistant = req.assistant;

        if (!message) {
            return res.status(400).json({
                success: false,
                error: '消息内容不能为空'
            });
        }

        // 设置 SSE 响应头
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        // 发送开始事件
        res.write(`data: ${JSON.stringify({ type: 'start' })}\n\n`);

        // 使用流式聊天
        const response = await assistant.conversation.chatStream(
            message,
            options,
            (chunk) => {
                // 发送数据块
                res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            }
        );

        // 发送结束事件
        res.write(`data: ${JSON.stringify({ type: 'end', ...response })}\n\n`);
        res.end();

    } catch (error) {
        logger.error(`流式聊天API错误: ${error.message}`);
        res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
        res.end();
    }
});

/**
 * GET /api/status
 * 获取助手状态
 */
router.get('/status', (req, res) => {
    try {
        const assistant = req.assistant;
        const status = assistant.getStatus();

        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        logger.error(`获取状态错误: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/modes
 * 获取可用模式列表
 */
router.get('/modes', (req, res) => {
    try {
        const assistant = req.assistant;
        const modes = assistant.getAvailableModes();

        res.json({
            success: true,
            data: modes
        });
    } catch (error) {
        logger.error(`获取模式错误: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/mode/:mode
 * 切换助手模式
 */
router.post('/mode/:mode', (req, res) => {
    try {
        const { mode } = req.params;
        const assistant = req.assistant;

        assistant.switchMode(mode);

        res.json({
            success: true,
            data: {
                mode,
                modeName: assistant.getStatus().modeName
            }
        });
    } catch (error) {
        logger.error(`切换模式错误: ${error.message}`);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/clear
 * 清空对话历史
 */
router.post('/clear', (req, res) => {
    try {
        const assistant = req.assistant;
        assistant.conversation.clearHistory();

        res.json({
            success: true,
            message: '对话历史已清空'
        });
    } catch (error) {
        logger.error(`清空历史错误: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/report
 * 获取详细报告
 */
router.get('/report', (req, res) => {
    try {
        const assistant = req.assistant;
        const report = assistant.getDetailedReport();

        res.json({
            success: true,
            data: report
        });
    } catch (error) {
        logger.error(`获取报告错误: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/reset
 * 重置会话
 */
router.post('/reset', (req, res) => {
    try {
        const assistant = req.assistant;
        assistant.reset();

        res.json({
            success: true,
            message: '会话已重置'
        });
    } catch (error) {
        logger.error(`重置会话错误: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;
