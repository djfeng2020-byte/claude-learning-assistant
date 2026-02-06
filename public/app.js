// public/app.js

class ChatApp {
    constructor() {
        this.apiBase = '/api';
        this.currentMode = 'learning';
        this.isStreaming = false;

        this.initElements();
        this.attachEventListeners();
        this.loadInitialData();
    }

    initElements() {
        // 聊天元素
        this.chatMessages = document.getElementById('chat-messages');
        this.chatInput = document.getElementById('chat-input');
        this.btnSend = document.getElementById('btn-send');

        // 侧边栏元素
        this.modeList = document.getElementById('mode-list');
        this.currentModeDisplay = document.getElementById('current-mode');
        this.chatRoundsDisplay = document.getElementById('chat-rounds');
        this.tokenUsageDisplay = document.getElementById('token-usage');
        this.currentCostDisplay = document.getElementById('current-cost');
        this.headerModeName = document.getElementById('header-mode-name');
        this.connectionStatus = document.getElementById('connection-status');

        // 操作按钮
        this.btnClear = document.getElementById('btn-clear');
        this.btnReport = document.getElementById('btn-report');
        this.btnReset = document.getElementById('btn-reset');

        // 模态框
        this.reportModal = document.getElementById('report-modal');
        this.reportContent = document.getElementById('report-content');
        this.btnCloseModal = document.getElementById('btn-close-modal');
    }

    attachEventListeners() {
        // 发送消息
        this.btnSend.addEventListener('click', () => this.sendMessage());
        this.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // 自动调整文本框高度
        this.chatInput.addEventListener('input', () => {
            this.chatInput.style.height = 'auto';
            this.chatInput.style.height = Math.min(this.chatInput.scrollHeight, 150) + 'px';
        });

        // 操作按钮
        this.btnClear.addEventListener('click', () => this.clearHistory());
        this.btnReport.addEventListener('click', () => this.showReport());
        this.btnReset.addEventListener('click', () => this.resetSession());
        this.btnCloseModal.addEventListener('click', () => this.hideModal());

        // 点击模态框外部关闭
        this.reportModal.addEventListener('click', (e) => {
            if (e.target === this.reportModal) {
                this.hideModal();
            }
        });
    }

    async loadInitialData() {
        try {
            // 加载模式列表
            await this.loadModes();

            // 加载状态
            await this.updateStatus();
        } catch (error) {
            this.showError('加载数据失败: ' + error.message);
        }
    }

    async loadModes() {
        const response = await this.fetchWithAuth('/modes');

        if (response.success) {
            this.renderModes(response.data);
        }
    }

    renderModes(modes) {
        this.modeList.innerHTML = '';

        modes.forEach(mode => {
            const item = document.createElement('div');
            item.className = `mode-item ${mode.id === this.currentMode ? 'active' : ''}`;
            item.innerHTML = `
                <div class="mode-name">${mode.name}</div>
                <div class="mode-desc">${mode.systemPrompt.substring(0, 30)}...</div>
            `;

            item.addEventListener('click', () => this.switchMode(mode.id));
            this.modeList.appendChild(item);
        });
    }

    async switchMode(mode) {
        if (this.isStreaming) return;

        try {
            const response = await this.fetchWithAuth(`/mode/${mode}`, { method: 'POST' });

            if (response.success) {
                this.currentMode = mode;
                await this.loadModes(); // 重新渲染模式列表
                await this.updateStatus();
                this.addSystemMessage(`已切换到 ${response.data.modeName} 模式`);
            }
        } catch (error) {
            this.showError('切换模式失败: ' + error.message);
        }
    }

    async updateStatus() {
        const response = await this.fetchWithAuth('/status');

        if (response.success) {
            const data = response.data;

            this.currentModeDisplay.textContent = data.modeName || '-';
            this.chatRoundsDisplay.textContent = data.conversation.rounds || 0;
            this.tokenUsageDisplay.textContent = data.tokens.totalTokens?.toLocaleString() || 0;
            this.currentCostDisplay.textContent = '$' + (data.budget.currentCost || 0).toFixed(6);
            this.headerModeName.textContent = data.modeName || '智能助手';

            // 更新连接状态
            this.connectionStatus.className = 'status-indicator online';
            this.connectionStatus.textContent = '已连接';
        }
    }

    async sendMessage() {
        const message = this.chatInput.value.trim();

        if (!message || this.isStreaming) return;

        // 清空输入框
        this.chatInput.value = '';
        this.chatInput.style.height = 'auto';

        // 添加用户消息
        this.addMessage('user', message);

        // 禁用输入
        this.setStreamingState(true);

        try {
            // 创建打字指示器
            const typingId = this.addTypingIndicator();

            // 使用流式 API
            await this.streamMessage(message, typingId);

            // 更新状态
            await this.updateStatus();
        } catch (error) {
            this.showError('发送消息失败: ' + error.message);
        } finally {
            this.setStreamingState(false);
        }
    }

    async streamMessage(message, typingId) {
        try {
            const response = await fetch(`${this.apiBase}/chat/stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            let assistantMessage = null;
            let fullContent = '';

            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));

                            if (data.type === 'start') {
                                // 移除打字指示器，创建助手消息
                                this.removeTypingIndicator(typingId);
                                assistantMessage = this.addMessage('assistant', '');
                            } else if (data.type === 'content') {
                                // 追加内容
                                fullContent += data.content;
                                this.updateMessageContent(assistantMessage, fullContent);
                            } else if (data.type === 'error') {
                                throw new Error(data.error);
                            } else if (data.type === 'end') {
                                // 流结束
                                if (!data.success) {
                                    throw new Error(data.error || '请求失败');
                                }
                            }
                        } catch (e) {
                            if (e.message) throw e;
                        }
                    }
                }
            }

        } catch (error) {
            this.removeTypingIndicator(typingId);
            throw error;
        }
    }

    addMessage(role, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = role === 'user' ? '👤' : '🤖';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        if (content) {
            contentDiv.innerHTML = this.formatMessage(content);
        }

        messageDiv.appendChild(avatar);
        messageDiv.appendChild(contentDiv);

        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();

        return contentDiv;
    }

    updateMessageContent(messageDiv, content) {
        messageDiv.innerHTML = this.formatMessage(content);
        this.scrollToBottom();
    }

    addTypingIndicator() {
        const id = 'typing-' + Date.now();
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message assistant';
        messageDiv.id = id;

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = '🤖';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = `
            <div class="typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        `;

        messageDiv.appendChild(avatar);
        messageDiv.appendChild(contentDiv);

        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();

        return id;
    }

    removeTypingIndicator(id) {
        const element = document.getElementById(id);
        if (element) {
            element.remove();
        }
    }

    addSystemMessage(text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'system-message';
        messageDiv.style.cssText = `
            text-align: center;
            padding: 8px;
            color: var(--text-secondary);
            font-size: 13px;
            border-bottom: 1px solid var(--border-color);
        `;
        messageDiv.textContent = text;

        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();

        // 3秒后自动移除
        setTimeout(() => messageDiv.remove(), 3000);
    }

    formatMessage(content) {
        // 简单的 Markdown 格式化
        let formatted = content
            // 代码块
            .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
            // 行内代码
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            // 粗体
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            // 斜体
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            // 链接
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color: inherit;">$1</a>')
            // 换行
            .replace(/\n/g, '<br>');

        return formatted;
    }

    scrollToBottom() {
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    setStreamingState(isStreaming) {
        this.isStreaming = isStreaming;
        this.chatInput.disabled = isStreaming;
        this.btnSend.disabled = isStreaming;

        if (isStreaming) {
            this.connectionStatus.className = 'status-indicator offline';
            this.connectionStatus.textContent = '输入中...';
        } else {
            this.connectionStatus.className = 'status-indicator online';
            this.connectionStatus.textContent = '已连接';
            this.chatInput.focus();
        }
    }

    async clearHistory() {
        if (!confirm('确定要清空对话历史吗？')) return;

        const response = await this.fetchWithAuth('/clear', { method: 'POST' });

        if (response.success) {
            // 清空消息显示，保留欢迎消息
            this.chatMessages.innerHTML = `
                <div class="message assistant">
                    <div class="message-avatar">🤖</div>
                    <div class="message-content">
                        <p>对话历史已清空。我们可以开始新的对话！</p>
                    </div>
                </div>
            `;
            await this.updateStatus();
        }
    }

    async showReport() {
        const response = await this.fetchWithAuth('/report');

        if (response.success) {
            this.renderReport(response.data);
            this.reportModal.classList.remove('hidden');
        }
    }

    renderReport(data) {
        this.reportContent.innerHTML = `
            <div class="report-section">
                <h3>📝 对话信息</h3>
                <div class="report-item">
                    <span class="report-label">会话ID</span>
                    <span class="report-value">${data.conversation.sessionId || '-'}</span>
                </div>
                <div class="report-item">
                    <span class="report-label">消息数量</span>
                    <span class="report-value">${data.conversation.messageCount || 0}</span>
                </div>
                <div class="report-item">
                    <span class="report-label">对话轮数</span>
                    <span class="report-value">${data.conversation.rounds || 0}</span>
                </div>
            </div>

            <div class="report-section">
                <h3>💰 Token 使用统计</h3>
                <div class="report-item">
                    <span class="report-label">总请求数</span>
                    <span class="report-value">${data.tokens.summary.totalRequests || 0}</span>
                </div>
                <div class="report-item">
                    <span class="report-label">总Token数</span>
                    <span class="report-value">${data.tokens.summary.totalTokens || 0}</span>
                </div>
                <div class="report-item">
                    <span class="report-label">输入Token</span>
                    <span class="report-value">${data.tokens.summary.inputTokens || 0}</span>
                </div>
                <div class="report-item">
                    <span class="report-label">输出Token</span>
                    <span class="report-value">${data.tokens.summary.outputTokens || 0}</span>
                </div>
            </div>

            <div class="report-section">
                <h3>💾 缓存统计</h3>
                <div class="report-item">
                    <span class="report-label">缓存大小</span>
                    <span class="report-value">${data.cache.size || 0}</span>
                </div>
                <div class="report-item">
                    <span class="report-label">命中次数</span>
                    <span class="report-value">${data.cache.hits || 0}</span>
                </div>
                <div class="report-item">
                    <span class="report-label">命中率</span>
                    <span class="report-value">${data.cache.hitRate || '0%'}</span>
                </div>
            </div>
        `;
    }

    hideModal() {
        this.reportModal.classList.add('hidden');
    }

    async resetSession() {
        if (!confirm('确定要重置会话吗？这将清空所有数据！')) return;

        const response = await this.fetchWithAuth('/reset', { method: 'POST' });

        if (response.success) {
            location.reload();
        }
    }

    showError(message) {
        console.error(message);
        // 可以添加一个 toast 通知
        alert(message);
    }

    async fetchWithAuth(url, options = {}) {
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const response = await fetch(`${this.apiBase}${url}`, {
            ...defaultOptions,
            ...options
        });

        return await response.json();
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new ChatApp();
});
