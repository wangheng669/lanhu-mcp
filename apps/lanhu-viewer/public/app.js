// 蓝湖链接解析器 - 前端逻辑

class LanhuViewer {
  constructor() {
    // 使用固定的共享 session-id，让所有用户共享同一个蓝湖登录状态
    this.sessionId = 'shared_lanhu_session';
    this.appVersion = '2026-03-12-cache-refresh-v2';
    this.migrateCacheVersion();
    this.isLoggedIn = false;
    this.logs = [];
    this.history = this.loadHistory();
    this.cache = this.loadCache();
    this.currentPageState = this.loadPageState();
    this.hotspots = [];
    this.notes = [];
    this.hotspotApiMeta = new Map();
    this.hotspotDraftRect = null;
    this.hotspotStartPoint = null;
    this.noteDraftRect = null;
    this.noteStartPoint = null;
    this.isMarkMode = false;
    this.isDrawingHotspot = false;
    this.isNoteMode = false;
    this.isDrawingNote = false;
    this.parentOrigin = this.resolveParentOrigin();
    this.hotspotRenderRaf = null;
    this.hotspotRenderTimer = null;
    this.resizeObserver = null;

    // 图层解析相关
    this.isLayerMode = false;
    this.layers = [];
    this.layerAnnotationLayer = null;
    this.layerTooltip = null;
    this.layerMaxDepth = 3;
    this.layerMinSize = 10;
    this.layerCache = this.loadLayerCache(); // 从 localStorage 加载图层数据缓存
    this.currentLayerDesignId = null; // 当前加载图层的设计图 ID
    this.canvasInfo = null;
    this.activeNoteId = null;
    this.generatedHtmlCode = '';
    this.generatedHtmlDesignId = null;

    this.initElements();
    this.initEvents();
    this.renderHistory();
    this.notifyParentReady();
    this.checkSession(); // 异步检查，完成后会调用 restorePageState
  }

  migrateCacheVersion() {
    try {
      const versionKey = 'lanhuViewerVersion';
      const currentVersion = localStorage.getItem(versionKey);
      if (currentVersion === this.appVersion) return;

      localStorage.removeItem('lanhuCache');
      localStorage.removeItem('lanhuLayerCache');
      localStorage.setItem(versionKey, this.appVersion);
    } catch (e) {}
  }

  resolveParentOrigin() {
    try {
      if (!document.referrer) return '';
      return new URL(document.referrer).origin;
    } catch (e) {
      return '';
    }
  }

  isEmbedded() {
    return window.parent && window.parent !== window;
  }

  postMessageToParent(type, payload = {}) {
    if (!this.isEmbedded()) return;
    const targetOrigin = this.parentOrigin || '*';
    window.parent.postMessage({ type, payload }, targetOrigin);
  }

  notifyParentReady() {
    this.postMessageToParent('lanhu-viewer:ready', {
      timestamp: Date.now(),
    });
  }

  // 加载历史记录
  loadHistory() {
    try {
      const data = localStorage.getItem('lanhuHistory');
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  // 保存历史记录
  saveHistory() {
    try {
      localStorage.setItem('lanhuHistory', JSON.stringify(this.history));
    } catch (e) {}
  }

  // 添加到历史记录
  addToHistory(url, projectName) {
    // 移除重复
    this.history = this.history.filter(item => item.url !== url);
    // 添加到开头
    this.history.unshift({
      url,
      projectName: projectName || '未知项目',
      time: new Date().toISOString()
    });
    // 最多保存 20 条
    if (this.history.length > 20) {
      this.history = this.history.slice(0, 20);
    }
    this.saveHistory();
    this.renderHistory();
  }

  // 清空历史记录
  clearHistory() {
    this.history = [];
    this.saveHistory();
    this.renderHistory();
  }

  // 加载缓存
  loadCache() {
    try {
      const data = localStorage.getItem('lanhuCache');
      if (!data) return {};
      const cache = JSON.parse(data);
      // 清理过期缓存
      const now = Date.now();
      Object.keys(cache).forEach(key => {
        if (cache[key].expire < now) {
          delete cache[key];
        }
      });
      return cache;
    } catch (e) {
      return {};
    }
  }

  // 保存缓存
  saveCache() {
    try {
      localStorage.setItem('lanhuCache', JSON.stringify(this.cache));
    } catch (e) {}
  }

  // 获取缓存
  getCache(url) {
    const item = this.cache[url];
    if (!item) return null;
    if (item.expire < Date.now()) {
      delete this.cache[url];
      this.saveCache();
      return null;
    }
    return item.data;
  }

  // 设置缓存 (缓存 2 天)
  setCache(url, data) {
    this.cache[url] = {
      data,
      expire: Date.now() + 2 * 24 * 60 * 60 * 1000
    };
    this.saveCache();
  }

  // 获取切图缓存
  getSliceCache(imageId) {
    const key = 'slice_' + imageId;
    return this.getCache(key);
  }

  // 设置切图缓存
  setSliceCache(imageId, data) {
    const key = 'slice_' + imageId;
    this.setCache(key, data);
  }

  // 清空缓存
  clearCache() {
    const currentUrl = this.urlInput?.value?.trim() || '';
    const currentDesignId = this.selectedDesignId || this.pendingDesignId || null;

    this.cache = {};
    this.layerCache = new Map();
    this.layers = [];
    this.canvasInfo = null;
    this.currentLayerDesignId = null;
    this.saveCache();
    this.saveLayerCache();

    if (this.isLayerMode) {
      this.isLayerMode = false;
      if (this.layerModeBtn) {
        this.layerModeBtn.classList.remove('active');
        this.layerModeBtn.textContent = '图层解析';
      }
      this.hideLayerAnnotations();
    }

    if (currentUrl && this.isLoggedIn) {
      this.pendingDesignId = currentDesignId;
      this.refreshBtn.style.display = 'none';
      this.log('缓存已清空，正在刷新当前项目...', 'info');
      this.showToast('缓存已清空，正在刷新当前项目');
      this.parseUrl();
      return;
    }

    this.log('本地缓存已清空', 'success');
    this.showToast('缓存已清空');
  }

  // 加载页面状态
  loadPageState() {
    try {
      const data = localStorage.getItem('lanhuPageState');
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  // 保存页面状态
  savePageState() {
    try {
      const url = this.urlInput?.value?.trim() || '';
      const state = {
        url,
        selectedDesignId: this.selectedDesignId || null,
        timestamp: Date.now()
      };
      localStorage.setItem('lanhuPageState', JSON.stringify(state));
    } catch (e) {}
  }

  // 保存当前设计图的缩放位置
  saveCurrentDesignState() {
    if (!this.selectedDesignId) return;
    try {
      const url = this.urlInput?.value?.trim() || '';
      const designStates = this.loadDesignStates();
      const key = `${url}#${this.selectedDesignId}`;
      designStates[key] = {
        zoom: this.zoomLevel || 1,
        panX: this.panX || 0,
        panY: this.panY || 0,
        timestamp: Date.now()
      };
      // 清理过期数据（7天）
      const expireTime = Date.now() - 7 * 24 * 60 * 60 * 1000;
      Object.keys(designStates).forEach(k => {
        if (designStates[k].timestamp < expireTime) {
          delete designStates[k];
        }
      });
      localStorage.setItem('lanhuDesignStates', JSON.stringify(designStates));
    } catch (e) {}
  }

  // 加载设计图状态
  loadDesignStates() {
    try {
      const data = localStorage.getItem('lanhuDesignStates');
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  }

  // 获取指定设计图的状态
  getDesignState(designId) {
    const url = this.urlInput?.value?.trim() || '';
    if (!url || !designId) return null;
    const designStates = this.loadDesignStates();
    const key = `${url}#${designId}`;
    return designStates[key] || null;
  }

  // 清除页面状态
  clearPageState() {
    localStorage.removeItem('lanhuPageState');
  }

  // 恢复页面状态
  restorePageState() {
    // 未登录时不恢复
    if (!this.isLoggedIn) return;

    // 优先从 URL 参数获取链接（用于 iframe 嵌入场景）
    const urlParams = new URLSearchParams(window.location.search);
    const urlFromParams = urlParams.get('url');

    if (urlFromParams) {
      this.log('从 URL 参数获取链接: ' + urlFromParams, 'info');
      this.urlInput.value = urlFromParams;
      this.parseBtn.disabled = false;

      // 检查是否有保存的状态（URL 参数场景下也恢复）
      if (this.currentPageState && this.currentPageState.url === urlFromParams) {
        if (this.currentPageState.selectedDesignId) {
          this.pendingDesignId = this.currentPageState.selectedDesignId;
        }
        console.log('URL参数场景恢复状态:', this.pendingDesignId);
      }

      // 自动解析
      setTimeout(() => this.parseUrl(), 500);
      return;
    }

    if (!this.currentPageState || !this.currentPageState.url) return;

    const { url, selectedDesignId, timestamp } = this.currentPageState;

    // 检查状态是否过期（2天内有效）
    if (Date.now() - timestamp > 2 * 24 * 60 * 60 * 1000) {
      this.clearPageState();
      return;
    }

    // 恢复 URL 输入框
    this.urlInput.value = url;
    this.parseBtn.disabled = false;

    // 记住要选中的设计图
    this.pendingDesignId = selectedDesignId;
    console.log('恢复页面状态, pendingDesignId:', selectedDesignId);

    // 检查是否有缓存，如果有则直接恢复
    const cached = this.getCache(url);
    if (cached) {
      this.log('恢复上次浏览位置', 'success');
      this.renderResult(cached);
      this.refreshBtn.style.display = 'inline-flex';
    } else {
      // 没有缓存时，自动重新解析
      this.log('自动恢复页面...', 'info');
      setTimeout(() => this.parseUrl(), 300);
    }
  }

  // 强制刷新（忽略缓存）
  forceRefresh() {
    const url = this.urlInput.value.trim();
    if (url) {
      // 保存当前选中的设计图ID
      const currentDesignId = this.selectedDesignId;
      delete this.cache[url];
      this.saveCache();
      this.refreshBtn.style.display = 'none';
      // 刷新后恢复选中状态
      this.pendingDesignId = currentDesignId;
      this.parseUrl();
    }
  }

  // 渲染历史记录
  renderHistory() {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;

    if (this.history.length === 0) {
      historyList.innerHTML = '<div class="history-empty">暂无记录</div>';
      return;
    }

    historyList.innerHTML = this.history.map(item => `
      <div class="history-item" data-url="${item.url}" title="${item.url}">
        <span class="history-name">${item.projectName}</span>
        <span class="history-time">${this.formatHistoryTime(item.time)}</span>
      </div>
    `).join('');

    // 绑定点击事件
    historyList.querySelectorAll('.history-item').forEach(el => {
      el.addEventListener('click', () => {
        this.urlInput.value = el.dataset.url;
        this.parseUrl();
      });
    });
  }

  formatHistoryTime(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';

    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  }

  generateSessionId() {
    const id = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('sessionId', id);
    return id;
  }

  // 日志方法
  log(message, type = 'info') {
    const time = new Date().toLocaleTimeString();
    this.logs.push({ time, message, type });
    this.renderLogs();
    console.log(`[${type}] ${message}`);
  }

  renderLogs() {
    const logPanel = document.getElementById('logPanel');
    const logContent = document.getElementById('logContent');
    const logCount = document.getElementById('logCount');

    if (this.logs.length > 0) {
      logPanel.style.display = 'block';
      logCount.textContent = this.logs.length;
      logContent.innerHTML = this.logs.map(log =>
        `<div class="log-item ${log.type}">
          <span class="log-time">${log.time}</span>${log.message}
        </div>`
      ).join('');
      logContent.scrollTop = logContent.scrollHeight;
    } else {
      logPanel.style.display = 'none';
    }
  }

  scheduleHotspotRender(delayMs = 0) {
    if (delayMs > 0) {
      if (this.hotspotRenderTimer) {
        clearTimeout(this.hotspotRenderTimer);
      }
      this.hotspotRenderTimer = setTimeout(() => {
        this.hotspotRenderTimer = null;
        this.scheduleHotspotRender(0);
      }, delayMs);
      return;
    }

    if (this.hotspotRenderRaf) {
      cancelAnimationFrame(this.hotspotRenderRaf);
    }
    this.hotspotRenderRaf = requestAnimationFrame(() => {
      this.hotspotRenderRaf = null;
      this.renderHotspots();
      // 同时更新图层标注
      if (this.isLayerMode && this.layers.length > 0) {
        this.showLayerAnnotations();
      }
    });
  }

  clearLogs() {
    this.logs = [];
    this.renderLogs();
  }

  toggleLogPanel() {
    const logPanel = document.getElementById('logPanel');
    if (logPanel.classList.contains('collapsed')) {
      logPanel.classList.remove('collapsed');
      logPanel.classList.add('expanded');
    } else {
      logPanel.classList.remove('expanded');
      logPanel.classList.add('collapsed');
    }
  }

  initElements() {
    // 头部
    this.loginBtn = document.getElementById('loginBtn');
    this.userInfoEl = document.getElementById('userInfo');

    // 弹窗
    this.loginModal = document.getElementById('loginModal');
    this.loginStatus = document.getElementById('loginStatus');
    this.cancelLoginBtn = document.getElementById('cancelLoginBtn');
    this.noteModal = document.getElementById('noteModal');
    this.noteModalTitle = document.getElementById('noteModalTitle');
    this.noteModalContent = document.getElementById('noteModalContent');
    this.noteModalCounter = document.getElementById('noteModalCounter');
    this.cancelNoteModalBtn = document.getElementById('cancelNoteModalBtn');
    this.saveNoteBtn = document.getElementById('saveNoteBtn');

    // 输入区
    this.urlInput = document.getElementById('urlInput');
    this.parseBtn = document.getElementById('parseBtn');

    // 左侧栏
    this.emptyState = document.getElementById('emptyState');
    this.projectInfo = document.getElementById('projectInfo');
    this.projectName = document.getElementById('projectName');
    this.projectMeta = document.getElementById('projectMeta');
    this.designsSection = document.getElementById('designsSection');
    this.designCount = document.getElementById('designCount');
    this.designGrid = document.getElementById('designGrid');
    this.historySection = document.getElementById('historySection');

    // 中间预览区
    this.loading = document.getElementById('loading');
    this.errorBox = document.getElementById('errorBox');
    this.errorText = document.getElementById('errorText');
    this.contentEmpty = document.getElementById('contentEmpty');
    this.previewSection = document.getElementById('previewSection');
    this.previewName = document.getElementById('previewName');
    this.previewSize = document.getElementById('previewSize');
    this.previewImage = document.getElementById('previewImage');
    this.hotspotModeBtn = document.getElementById('hotspotModeBtn');
    this.noteModeBtn = document.getElementById('noteModeBtn');
    this.layerModeBtn = document.getElementById('layerModeBtn');
    this.generateHtmlBtn = document.getElementById('generateHtmlBtn');
    this.previewBody = document.getElementById('previewBody');
    this.htmlPreviewPanel = document.getElementById('htmlPreviewPanel');
    this.htmlPreviewFrame = document.getElementById('htmlPreviewFrame');
    this.htmlCodeOutput = document.getElementById('htmlCodeOutput');
    this.openHtmlInNewTabBtn = document.getElementById('openHtmlInNewTabBtn');
    this.copyHtmlBtn = document.getElementById('copyHtmlBtn');
    this.closeHtmlPreviewBtn = document.getElementById('closeHtmlPreviewBtn');

    // 右侧栏
    this.sidebarRight = document.getElementById('sidebarRight');
    this.sliceCountEl = document.getElementById('sliceCount');
    this.sliceSettingsEl = document.getElementById('sliceSettings');
    this.sliceList = document.getElementById('sliceList');
    this.sliceFooter = document.getElementById('sliceFooter');
    this.downloadAllBtn = document.getElementById('downloadAllBtn');

    // 切图设置
    this.currentPlatform = 'ios';
    this.currentFormat = 'png';
    this.sliceSettings = null;

    // 缩放和拖动相关
    this.zoomLevel = 1;
    this.minZoom = 0.1;
    this.maxZoom = 5;
    this.zoomStep = 0.1;
    this.panX = 0;
    this.panY = 0;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.previewContainer = document.getElementById('previewContainer');

    if (this.previewContainer) {
      this.hotspotLayer = document.createElement('div');
      this.hotspotLayer.className = 'hotspot-layer';
      this.previewContainer.appendChild(this.hotspotLayer);

      // 图层标注层（在热点层下面）
      this.layerAnnotationLayer = document.createElement('div');
      this.layerAnnotationLayer.className = 'layer-annotation-layer';
      this.layerAnnotationLayer.style.display = 'none';
      this.previewContainer.appendChild(this.layerAnnotationLayer);
    }
  }

  initEvents() {
    // 清空日志按钮
    const clearLogBtn = document.getElementById('clearLogBtn');
    if (clearLogBtn) {
      clearLogBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearLogs();
      });
    }

    // 日志面板展开/折叠
    const logPanelHeader = document.getElementById('logPanelHeader');
    if (logPanelHeader) {
      logPanelHeader.addEventListener('click', () => this.toggleLogPanel());
    }

    // 清空历史记录按钮
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    if (clearHistoryBtn) {
      clearHistoryBtn.addEventListener('click', () => this.clearHistory());
    }

    // 清空缓存按钮
    const clearCacheBtn = document.getElementById('clearCacheBtn');
    if (clearCacheBtn) {
      clearCacheBtn.addEventListener('click', () => this.clearCache());
    }

    // 强制刷新按钮
    this.refreshBtn = document.getElementById('refreshBtn');
    if (this.refreshBtn) {
      this.refreshBtn.addEventListener('click', () => this.forceRefresh());
    }

    // 登录按钮
    this.loginBtn.addEventListener('click', () => this.login());

    // 取消登录
    this.cancelLoginBtn.addEventListener('click', () => this.cancelLogin());

    // 备注弹窗
    if (this.cancelNoteModalBtn) {
      this.cancelNoteModalBtn.addEventListener('click', () => this.closeNoteModal());
    }
    if (this.saveNoteBtn) {
      this.saveNoteBtn.addEventListener('click', () => this.saveNoteFromModal());
    }
    if (this.noteModal) {
      this.noteModal.addEventListener('click', (event) => {
        if (event.target === this.noteModal) {
          this.closeNoteModal();
        }
      });
    }
    if (this.noteModalContent) {
      this.noteModalContent.addEventListener('input', () => this.updateNoteModalCounter());
      this.noteModalContent.addEventListener('keydown', (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          this.saveNoteFromModal();
        }
      });
      this.updateNoteModalCounter();
    }
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.noteModal?.classList.contains('show')) {
        this.closeNoteModal();
      }
    });

    // URL 输入
    this.urlInput.addEventListener('input', () => this.onUrlInput());
    this.urlInput.addEventListener('paste', () => {
      setTimeout(() => this.onUrlInput(), 0);
    });

    // 解析按钮
    this.parseBtn.addEventListener('click', () => this.parseUrl());

    // 回车解析
    this.urlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !this.parseBtn.disabled) {
        this.parseUrl();
      }
    });

    // 下载全部切图
    this.downloadAllBtn.addEventListener('click', () => this.downloadAllSlices());

    // 平台选择
    document.querySelectorAll('#platformOptions .setting-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#platformOptions .setting-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentPlatform = btn.dataset.platform;
        this.updateScalesForPlatform();
      });
    });

    // 格式选择
    document.querySelectorAll('#formatOptions .setting-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#formatOptions .setting-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentFormat = btn.dataset.format;
      });
    });

    // 缩放控制按钮
    this.zoomInBtn = document.getElementById('zoomInBtn');
    this.zoomOutBtn = document.getElementById('zoomOutBtn');
    this.zoomResetBtn = document.getElementById('zoomResetBtn');
    this.zoomLevelEl = document.getElementById('zoomLevel');

    if (this.zoomInBtn) {
      this.zoomInBtn.addEventListener('click', () => this.zoomIn());
    }
    if (this.zoomOutBtn) {
      this.zoomOutBtn.addEventListener('click', () => this.zoomOut());
    }
    if (this.zoomResetBtn) {
      this.zoomResetBtn.addEventListener('click', () => this.resetZoom());
    }
    if (this.hotspotModeBtn) {
      this.hotspotModeBtn.addEventListener('click', () => this.toggleHotspotMode());
    }
    if (this.noteModeBtn) {
      this.noteModeBtn.addEventListener('click', () => this.toggleNoteMode());
    }
    if (this.layerModeBtn) {
      this.layerModeBtn.addEventListener('click', () => this.toggleLayerMode());
    }
    if (this.generateHtmlBtn) {
      this.generateHtmlBtn.addEventListener('click', () => this.generateHtmlPreview());
    }
    if (this.openHtmlInNewTabBtn) {
      this.openHtmlInNewTabBtn.addEventListener('click', () => this.openGeneratedHtmlInNewTab());
    }
    if (this.copyHtmlBtn) {
      this.copyHtmlBtn.addEventListener('click', () => this.copyGeneratedHtml());
    }
    if (this.closeHtmlPreviewBtn) {
      this.closeHtmlPreviewBtn.addEventListener('click', () => this.hideHtmlPreview(false));
    }

    // 更新设计图按钮
    this.refreshDesignBtn = document.getElementById('refreshDesignBtn');
    if (this.refreshDesignBtn) {
      this.refreshDesignBtn.addEventListener('click', () => this.refreshCurrentDesign());
    }

    if (this.previewImage) {
      this.previewImage.addEventListener('load', () => {
        this.scheduleHotspotRender();
        this.scheduleHotspotRender(140);
        this.scheduleHotspotRender(280);
      });
      this.previewImage.addEventListener('transitionend', () => this.scheduleHotspotRender());
    }

    window.addEventListener('message', (event) => this.handleParentMessage(event));
    window.addEventListener('resize', () => this.scheduleHotspotRender());

    if (this.previewContainer && 'ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(() => this.scheduleHotspotRender());
      this.resizeObserver.observe(this.previewContainer);
      this.resizeObserver.observe(this.previewImage);
    }

    // 鼠标滚轮缩放
    if (this.previewContainer) {
      this.previewContainer.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });

      // 拖动事件
      this.previewContainer.addEventListener('mousedown', (e) => {
        if (this.isMarkMode) {
          this.startHotspotDraw(e);
          return;
        }
        if (this.isNoteMode) {
          this.startNoteDraw(e);
          return;
        }
        this.startDrag(e);
      });
      document.addEventListener('mousemove', (e) => {
        if (this.isMarkMode) {
          this.updateHotspotDraw(e);
          return;
        }
        if (this.isNoteMode) {
          this.updateNoteDraw(e);
          return;
        }
        this.doDrag(e);
      });
      document.addEventListener('mouseup', (e) => {
        if (this.isMarkMode && this.isDrawingHotspot) {
          this.finishHotspotDraw(e);
          return;
        }
        if (this.isNoteMode && this.isDrawingNote) {
          this.finishNoteDraw(e);
          return;
        }
        this.endDrag();
      });
    }
  }

  // 获取代理后的图片 URL（解决跨域和认证问题）
  getProxiedImageUrl(originalUrl) {
    if (!originalUrl) return '';
    // 通过后端代理加载图片，在 URL 中携带 session-id（img 标签无法发送自定义 header）
    return `/api/image/preview?sessionId=${encodeURIComponent(this.sessionId)}&url=${encodeURIComponent(originalUrl)}`;
  }

  // 检查会话状态
  async checkSession() {
    try {
      const response = await fetch('/api/session', {
        headers: { 'X-Session-Id': this.sessionId }
      });
      const data = await response.json();

      if (data.loggedIn) {
        this.isLoggedIn = true;
        this.cookies = data.cookies || [];
        this.updateUserUI(data.userInfo, this.cookies);
      } else {
        // session 无效，清除本地存储并重置状态
        this.isLoggedIn = false;
        localStorage.removeItem('sessionId');
        this.sessionId = this.generateSessionId();
      }
    } catch (e) {
      console.error('Check session error:', e);
      this.isLoggedIn = false;
    }

    // 登录状态检查完成后，恢复页面状态
    this.restorePageState();
  }

  handleParentMessage(event) {
    if (!event?.data || typeof event.data !== 'object') return;
    if (this.parentOrigin && event.origin !== this.parentOrigin) return;

    const { type, payload } = event.data;
    if (type === 'lanhu-hotspots:sync') {
      this.handleHotspotsSync(payload);
      return;
    }
    if (type === 'lanhu-hotspot:create-cancel') {
      this.isDrawingHotspot = false;
      this.hotspotStartPoint = null;
      this.hotspotDraftRect = null;
      this.renderHotspots();
      return;
    }
    if (type === 'lanhu-note:create-cancel') {
      this.isDrawingNote = false;
      this.noteStartPoint = null;
      this.noteDraftRect = null;
      this.renderHotspots();
      return;
    }
  }

  normalizeHotspotRect(rect) {
    if (!rect || typeof rect !== 'object') return null;
    const x = Number(rect.x);
    const y = Number(rect.y);
    const width = Number(rect.width);
    const height = Number(rect.height);
    if (![x, y, width, height].every(Number.isFinite)) return null;
    if (width <= 0 || height <= 0) return null;
    const clamp = (value) => Math.min(1, Math.max(0, value));
    return {
      x: clamp(x),
      y: clamp(y),
      width: clamp(width),
      height: clamp(height),
    };
  }

  normalizeHotspotList(hotspots) {
    if (!Array.isArray(hotspots)) return [];
    const map = new Map();
    hotspots.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const id = String(item.id || '').trim();
      const designId = String(item.designId || '').trim();
      const apiId = parseInt(item.apiId, 10);
      const rect = this.normalizeHotspotRect(item.rect);
      if (!id || !designId || !Number.isFinite(apiId) || !rect) return;
      map.set(id, {
        id,
        designId,
        designName: String(item.designName || '').trim(),
        apiId,
        apiName: String(item.apiName || item.api_name || item.name || '').trim(),
        apiMethod: String(item.apiMethod || '').trim().toUpperCase(),
        apiUrl: String(item.apiUrl || '').trim(),
        rect,
      });
    });
    return Array.from(map.values());
  }

  normalizeNoteList(notes) {
    if (!Array.isArray(notes)) return [];
    const map = new Map();
    notes.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const id = String(item.id || '').trim();
      const designId = String(item.designId || '').trim();
      const rect = this.normalizeHotspotRect(item.rect);
      const content = String(item.content || '').trim().slice(0, 500);
      if (!id || !designId || !rect || !content) return;
      map.set(id, {
        id,
        designId,
        designName: String(item.designName || '').trim(),
        content,
        rect,
      });
    });
    return Array.from(map.values());
  }

  getNoteById(noteId) {
    if (!noteId) return null;
    return this.notes.find((item) => item.id === noteId) || null;
  }

  updateNoteModalCounter() {
    if (!this.noteModalCounter || !this.noteModalContent) return;
    this.noteModalCounter.textContent = `${this.noteModalContent.value.length} / 500`;
  }

  openNoteModal(note) {
    if (!note || !this.noteModal || !this.noteModalContent) return;
    const latestNote = this.getNoteById(note.id) || note;
    this.activeNoteId = latestNote.id;

    if (this.noteModalTitle) {
      this.noteModalTitle.textContent = `备注详情 · ${latestNote.designName || '当前设计图'}`;
    }

    this.noteModalContent.value = latestNote.content || '';
    this.updateNoteModalCounter();
    this.noteModal.classList.add('show');

    this.noteModalContent.focus();
    const cursorPos = this.noteModalContent.value.length;
    this.noteModalContent.setSelectionRange(cursorPos, cursorPos);
  }

  closeNoteModal() {
    if (this.noteModal) {
      this.noteModal.classList.remove('show');
    }
    this.activeNoteId = null;
    if (this.noteModalContent) {
      this.noteModalContent.value = '';
    }
    this.updateNoteModalCounter();
  }

  saveNoteFromModal() {
    if (!this.activeNoteId || !this.noteModalContent) return;

    const nextContent = String(this.noteModalContent.value || '').trim().slice(0, 500);
    if (!nextContent) {
      this.showToast('备注内容不能为空', 'error');
      return;
    }

    const noteIndex = this.notes.findIndex((item) => item.id === this.activeNoteId);
    if (noteIndex < 0) {
      this.showToast('备注不存在或已删除', 'error');
      this.closeNoteModal();
      return;
    }

    const currentNote = this.notes[noteIndex];
    if (currentNote.content === nextContent) {
      this.closeNoteModal();
      return;
    }

    const updatedNote = {
      ...currentNote,
      content: nextContent,
    };
    this.notes.splice(noteIndex, 1, updatedNote);
    this.renderHotspots();

    this.postMessageToParent('lanhu-note:update-request', {
      id: updatedNote.id,
      designId: updatedNote.designId,
      designName: updatedNote.designName || '',
      rect: updatedNote.rect,
      content: updatedNote.content,
      lanhuUrl: this.urlInput?.value?.trim() || '',
    });

    this.showToast('备注已更新', 'success');
    this.closeNoteModal();
  }

  handleHotspotsSync(payload) {
    const apiMeta = new Map();
    if (Array.isArray(payload?.linkedApis)) {
      payload.linkedApis.forEach((api) => {
        const apiId = parseInt(api?.id, 10);
        if (!Number.isFinite(apiId)) return;
        apiMeta.set(apiId, {
          name: String(api?.name || api?.title || api?.apiName || api?.url || '').trim(),
          method: String(api?.method || '').trim().toUpperCase(),
          url: String(api?.url || '').trim(),
        });
      });
    }
    this.hotspotApiMeta = apiMeta;
    this.hotspots = this.normalizeHotspotList(payload?.hotspots);
    this.notes = this.normalizeNoteList(payload?.notes);
    this.scheduleHotspotRender();
    this.scheduleHotspotRender(140);
  }

  getHotspotApiInfo(hotspot) {
    const apiId = parseInt(hotspot?.apiId, 10);
    const fromMap = Number.isFinite(apiId) ? this.hotspotApiMeta.get(apiId) || {} : {};
    return {
      method: hotspot.apiMethod || fromMap.method || '',
      name: hotspot.apiName || fromMap.name || '',
      url: hotspot.apiUrl || fromMap.url || '',
    };
  }

  toggleHotspotMode() {
    this.isMarkMode = !this.isMarkMode;
    if (this.isMarkMode) {
      this.isNoteMode = false;
      this.isDrawingNote = false;
      this.noteStartPoint = null;
      this.noteDraftRect = null;
    } else {
      this.isDrawingHotspot = false;
      this.hotspotStartPoint = null;
      this.hotspotDraftRect = null;
    }
    this.syncMarkModeButtons();
    this.renderHotspots();
  }

  toggleNoteMode() {
    this.isNoteMode = !this.isNoteMode;
    if (this.isNoteMode) {
      this.isMarkMode = false;
      this.isDrawingHotspot = false;
      this.hotspotStartPoint = null;
      this.hotspotDraftRect = null;
    } else {
      this.isDrawingNote = false;
      this.noteStartPoint = null;
      this.noteDraftRect = null;
    }
    this.syncMarkModeButtons();
    this.renderHotspots();
  }

  syncMarkModeButtons() {
    if (this.hotspotModeBtn) {
      this.hotspotModeBtn.classList.toggle('active', this.isMarkMode);
      this.hotspotModeBtn.textContent = this.isMarkMode ? '退出热点' : '标记热点';
    }
    if (this.noteModeBtn) {
      this.noteModeBtn.classList.toggle('active', this.isNoteMode);
      this.noteModeBtn.textContent = this.isNoteMode ? '退出备注' : '标记备注';
    }
    if (this.previewContainer) {
      this.previewContainer.classList.toggle('mark-mode', this.isMarkMode || this.isNoteMode);
    }
  }

  clearDrawingDrafts() {
    this.isDrawingHotspot = false;
    this.hotspotStartPoint = null;
    this.hotspotDraftRect = null;
    this.isDrawingNote = false;
    this.noteStartPoint = null;
    this.noteDraftRect = null;
  }

  exitMarkModes() {
    this.isMarkMode = false;
    this.isNoteMode = false;
    this.clearDrawingDrafts();
    this.syncMarkModeButtons();
  }

  getImageViewportRect() {
    if (!this.previewImage || !this.previewContainer) return null;
    if (!this.previewImage.src) return null;
    if (!this.previewImage.complete || this.previewImage.naturalWidth <= 0) return null;
    const imageRect = this.previewImage.getBoundingClientRect();
    const containerRect = this.previewContainer.getBoundingClientRect();
    if (imageRect.width <= 1 || imageRect.height <= 1) return null;
    return { imageRect, containerRect };
  }

  getNormalizedPointFromMouse(event) {
    const viewport = this.getImageViewportRect();
    if (!viewport) return null;
    const { imageRect } = viewport;
    const clamp = (value) => Math.min(1, Math.max(0, value));
    const x = clamp((event.clientX - imageRect.left) / imageRect.width);
    const y = clamp((event.clientY - imageRect.top) / imageRect.height);
    return { x, y };
  }

  startHotspotDraw(event) {
    if (event.button !== 0) return;
    if (!this.selectedDesignId) return;

    const start = this.getNormalizedPointFromMouse(event);
    if (!start) return;

    this.isDrawingHotspot = true;
    this.hotspotStartPoint = start;
    this.hotspotDraftRect = {
      x: start.x,
      y: start.y,
      width: 0,
      height: 0,
    };
    event.preventDefault();
    this.renderHotspots();
  }

  updateHotspotDraw(event) {
    if (!this.isDrawingHotspot || !this.hotspotStartPoint) return;
    const current = this.getNormalizedPointFromMouse(event);
    if (!current) return;

    const x = Math.min(this.hotspotStartPoint.x, current.x);
    const y = Math.min(this.hotspotStartPoint.y, current.y);
    const width = Math.abs(current.x - this.hotspotStartPoint.x);
    const height = Math.abs(current.y - this.hotspotStartPoint.y);

    this.hotspotDraftRect = { x, y, width, height };
    this.renderHotspots();
  }

  finishHotspotDraw(event) {
    if (!this.isDrawingHotspot) return;
    event?.preventDefault?.();

    const rect = this.normalizeHotspotRect(this.hotspotDraftRect);
    const draftRect = rect ? { ...rect } : null;

    this.isDrawingHotspot = false;
    this.hotspotStartPoint = null;
    this.hotspotDraftRect = null;
    this.renderHotspots();

    if (!draftRect || draftRect.width < 0.01 || draftRect.height < 0.01) {
      return;
    }

    const draftId = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (!this.isEmbedded()) {
      this.showToast('当前页面未被嵌入，无法完成接口关联', 'error');
      this.exitMarkModes();
      return;
    }

    this.postMessageToParent('lanhu-hotspot:create-request', {
      id: draftId,
      designId: this.selectedDesignId,
      designName: this.previewName?.textContent || '',
      rect: draftRect,
      lanhuUrl: this.urlInput?.value?.trim() || '',
    });
    this.exitMarkModes();
  }

  startNoteDraw(event) {
    if (event.button !== 0) return;
    if (!this.selectedDesignId) return;

    const start = this.getNormalizedPointFromMouse(event);
    if (!start) return;

    this.isDrawingNote = true;
    this.noteStartPoint = start;
    this.noteDraftRect = {
      x: start.x,
      y: start.y,
      width: 0,
      height: 0,
    };
    event.preventDefault();
    this.renderHotspots();
  }

  updateNoteDraw(event) {
    if (!this.isDrawingNote || !this.noteStartPoint) return;
    const current = this.getNormalizedPointFromMouse(event);
    if (!current) return;

    const x = Math.min(this.noteStartPoint.x, current.x);
    const y = Math.min(this.noteStartPoint.y, current.y);
    const width = Math.abs(current.x - this.noteStartPoint.x);
    const height = Math.abs(current.y - this.noteStartPoint.y);

    this.noteDraftRect = { x, y, width, height };
    this.renderHotspots();
  }

  finishNoteDraw(event) {
    if (!this.isDrawingNote) return;
    event?.preventDefault?.();

    const rect = this.normalizeHotspotRect(this.noteDraftRect);
    const draftRect = rect ? { ...rect } : null;

    this.isDrawingNote = false;
    this.noteStartPoint = null;
    this.noteDraftRect = null;
    this.renderHotspots();

    if (!draftRect || draftRect.width < 0.01 || draftRect.height < 0.01) {
      return;
    }

    const draftId = `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (!this.isEmbedded()) {
      this.showToast('当前页面未被嵌入，无法保存备注', 'error');
      this.exitMarkModes();
      return;
    }

    this.postMessageToParent('lanhu-note:create-request', {
      id: draftId,
      designId: this.selectedDesignId,
      designName: this.previewName?.textContent || '',
      rect: draftRect,
      content: '',
      lanhuUrl: this.urlInput?.value?.trim() || '',
    });
    this.exitMarkModes();
  }

  getVisibleHotspots() {
    if (!this.selectedDesignId) return [];
    return this.hotspots.filter((item) => item.designId === this.selectedDesignId);
  }

  getVisibleNotes() {
    if (!this.selectedDesignId) return [];
    return this.notes.filter((item) => item.designId === this.selectedDesignId);
  }

  resolveCalloutLayout({ left, top, width, height, calloutEl, containerRect }) {
    const layerWidth = this.hotspotLayer.clientWidth || containerRect.width;
    const layerHeight = this.hotspotLayer.clientHeight || containerRect.height;
    const calloutWidth = calloutEl.offsetWidth || 220;
    const calloutHeight = calloutEl.offsetHeight || 28;
    const gap = 10;
    const defaultTop = top + height / 2 - calloutHeight / 2;
    let calloutTop = Math.max(0, Math.min(defaultTop, layerHeight - calloutHeight));
    let calloutLeft = left + width + gap;
    let isLeftSide = false;

    if (calloutLeft + calloutWidth > layerWidth - 2) {
      calloutLeft = left - gap - calloutWidth;
      isLeftSide = true;
    }
    if (calloutLeft < 2) {
      calloutLeft = Math.max(2, Math.min(layerWidth - calloutWidth - 2, calloutLeft));
    }

    calloutEl.style.left = `${calloutLeft}px`;
    calloutEl.style.top = `${calloutTop}px`;
    return { calloutLeft, calloutTop, calloutWidth, calloutHeight, isLeftSide };
  }

  appendCalloutLine({ left, top, width, height, layout, lineClassName }) {
    const fromX = layout.isLeftSide ? left : left + width;
    const fromY = top + height / 2;
    const toX = layout.isLeftSide ? layout.calloutLeft + layout.calloutWidth : layout.calloutLeft;
    const toY = layout.calloutTop + layout.calloutHeight / 2;
    const lineLength = Math.hypot(toX - fromX, toY - fromY);
    if (lineLength < 6) return;

    const lineEl = document.createElement('div');
    lineEl.className = lineClassName;
    lineEl.style.width = `${lineLength}px`;
    lineEl.style.left = `${fromX}px`;
    lineEl.style.top = `${fromY}px`;
    lineEl.style.transform = `rotate(${Math.atan2(toY - fromY, toX - fromX)}rad)`;
    this.hotspotLayer.appendChild(lineEl);
  }

  appendDraftRect(draft, imageRect, containerRect, className) {
    if (!draft) return;
    const left = imageRect.left - containerRect.left + draft.x * imageRect.width;
    const top = imageRect.top - containerRect.top + draft.y * imageRect.height;
    const width = draft.width * imageRect.width;
    const height = draft.height * imageRect.height;
    if (width < 1 || height < 1) return;

    const draftEl = document.createElement('div');
    draftEl.className = className;
    draftEl.style.left = `${left}px`;
    draftEl.style.top = `${top}px`;
    draftEl.style.width = `${width}px`;
    draftEl.style.height = `${height}px`;
    this.hotspotLayer.appendChild(draftEl);
  }

  renderHotspots() {
    if (!this.hotspotLayer) return;
    this.hotspotLayer.innerHTML = '';

    const viewport = this.getImageViewportRect();
    if (!viewport) return;

    const { imageRect, containerRect } = viewport;
    const visibleHotspots = this.getVisibleHotspots();
    visibleHotspots.forEach((hotspot, index) => {
      const left = imageRect.left - containerRect.left + hotspot.rect.x * imageRect.width;
      const top = imageRect.top - containerRect.top + hotspot.rect.y * imageRect.height;
      const width = hotspot.rect.width * imageRect.width;
      const height = hotspot.rect.height * imageRect.height;
      if (width < 1 || height < 1) return;

      const hotspotEl = document.createElement('div');
      hotspotEl.className = 'hotspot-item';
      hotspotEl.style.left = `${left}px`;
      hotspotEl.style.top = `${top}px`;
      hotspotEl.style.width = `${width}px`;
      hotspotEl.style.height = `${height}px`;
      hotspotEl.title = `接口 ID: ${hotspot.apiId}`;
      hotspotEl.addEventListener('mousedown', (e) => e.stopPropagation());

      hotspotEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.postMessageToParent('lanhu-hotspot:click', {
          id: hotspot.id,
          apiId: hotspot.apiId,
        });
      });

      const labelEl = document.createElement('span');
      labelEl.className = 'hotspot-item-label';
      labelEl.textContent = `#${index + 1}`;
      hotspotEl.appendChild(labelEl);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'hotspot-delete-btn';
      deleteBtn.textContent = '×';
      deleteBtn.title = '删除热点';
      deleteBtn.addEventListener('mousedown', (e) => e.stopPropagation());
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.postMessageToParent('lanhu-hotspot:delete-request', { id: hotspot.id });
      });
      hotspotEl.appendChild(deleteBtn);

      this.hotspotLayer.appendChild(hotspotEl);

      const apiInfo = this.getHotspotApiInfo(hotspot);
      const methodText = apiInfo.method || 'API';
      const nameText = apiInfo.name || apiInfo.url || `接口 #${hotspot.apiId}`;
      const calloutEl = document.createElement('button');
      calloutEl.type = 'button';
      calloutEl.className = 'hotspot-callout';
      calloutEl.title = apiInfo.url || nameText;
      const methodEl = document.createElement('span');
      methodEl.className = 'hotspot-callout-method';
      methodEl.textContent = methodText;
      const nameEl = document.createElement('span');
      nameEl.className = 'hotspot-callout-name';
      nameEl.textContent = nameText;
      calloutEl.appendChild(methodEl);
      calloutEl.appendChild(nameEl);
      calloutEl.addEventListener('mousedown', (e) => e.stopPropagation());
      calloutEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.postMessageToParent('lanhu-hotspot:click', {
          id: hotspot.id,
          apiId: hotspot.apiId,
        });
      });
      this.hotspotLayer.appendChild(calloutEl);

      const layout = this.resolveCalloutLayout({
        left,
        top,
        width,
        height,
        calloutEl,
        containerRect,
      });
      this.appendCalloutLine({
        left,
        top,
        width,
        height,
        layout,
        lineClassName: 'hotspot-callout-line',
      });
    });

    const visibleNotes = this.getVisibleNotes();
    visibleNotes.forEach((note, index) => {
      const left = imageRect.left - containerRect.left + note.rect.x * imageRect.width;
      const top = imageRect.top - containerRect.top + note.rect.y * imageRect.height;
      const width = note.rect.width * imageRect.width;
      const height = note.rect.height * imageRect.height;
      if (width < 1 || height < 1) return;

      const noteEl = document.createElement('div');
      noteEl.className = 'note-item';
      noteEl.style.left = `${left}px`;
      noteEl.style.top = `${top}px`;
      noteEl.style.width = `${width}px`;
      noteEl.style.height = `${height}px`;
      noteEl.title = note.content;
      noteEl.addEventListener('mousedown', (e) => e.stopPropagation());
      noteEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openNoteModal(note);
      });

      const labelEl = document.createElement('span');
      labelEl.className = 'note-item-label';
      labelEl.textContent = `备注#${index + 1}`;
      noteEl.appendChild(labelEl);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'note-delete-btn';
      deleteBtn.textContent = '×';
      deleteBtn.title = '删除备注';
      deleteBtn.addEventListener('mousedown', (e) => e.stopPropagation());
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.postMessageToParent('lanhu-note:delete-request', { id: note.id });
      });
      noteEl.appendChild(deleteBtn);
      this.hotspotLayer.appendChild(noteEl);

      const calloutEl = document.createElement('div');
      calloutEl.className = 'note-callout';
      calloutEl.title = note.content;
      const badgeEl = document.createElement('span');
      badgeEl.className = 'note-callout-badge';
      badgeEl.textContent = '备注';
      const contentEl = document.createElement('span');
      contentEl.className = 'note-callout-content';
      contentEl.textContent = note.content;
      calloutEl.appendChild(badgeEl);
      calloutEl.appendChild(contentEl);
      calloutEl.addEventListener('mousedown', (e) => e.stopPropagation());
      calloutEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openNoteModal(note);
      });
      this.hotspotLayer.appendChild(calloutEl);

      const layout = this.resolveCalloutLayout({
        left,
        top,
        width,
        height,
        calloutEl,
        containerRect,
      });
      this.appendCalloutLine({
        left,
        top,
        width,
        height,
        layout,
        lineClassName: 'note-callout-line',
      });
    });

    if (this.hotspotDraftRect) {
      const draft = this.normalizeHotspotRect(this.hotspotDraftRect);
      this.appendDraftRect(draft, imageRect, containerRect, 'hotspot-item pending');
    }

    if (this.noteDraftRect) {
      const draft = this.normalizeHotspotRect(this.noteDraftRect);
      this.appendDraftRect(draft, imageRect, containerRect, 'note-item pending');
    }
  }

  // 登录
  async login() {
    this.loginModal.classList.add('show');
    this.loginStatus.innerHTML = `
      <div class="spinner"></div>
      <p>正在打开浏览器...</p>
      <p class="hint">请在打开的浏览器窗口中完成登录</p>
    `;

    try {
      // 启动登录流程
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': this.sessionId
        }
      });

      const data = await response.json();

      if (data.success) {
        this.isLoggedIn = true;
        this.sessionId = data.sessionId;
        localStorage.setItem('sessionId', this.sessionId);
        this.cookies = data.cookies; // 保存 cookies
        this.updateUserUI(data.userInfo, data.cookies);
        this.loginModal.classList.remove('show');
        this.showToast('登录成功', 'success');
      } else {
        this.loginStatus.innerHTML = `
          <span style="font-size: 48px;">❌</span>
          <p>${data.message || '登录失败'}</p>
        `;
      }
    } catch (e) {
      this.loginStatus.innerHTML = `
        <span style="font-size: 48px;">❌</span>
        <p>登录出错: ${e.message}</p>
      `;
    }
  }

  // 取消登录
  async cancelLogin() {
    try {
      await fetch('/api/login/cancel', {
        method: 'POST',
        headers: { 'X-Session-Id': this.sessionId }
      });
    } catch (e) {}

    this.loginModal.classList.remove('show');
  }

  // 更新用户 UI
  updateUserUI(userInfo, cookies = null) {
    if (userInfo) {
      const initial = (userInfo.name || 'U').charAt(0).toUpperCase();
      let cookieHtml = '';

      if (cookies && cookies.length > 0) {
        const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        cookieHtml = `
          <div class="cookie-info">
            <div class="cookie-header">
              <span>🍪 Cookie</span>
              <button class="btn btn-small btn-secondary" id="copyCookieBtn">复制</button>
            </div>
            <div class="cookie-value" id="cookieValue">${cookieStr}</div>
          </div>
        `;
      }

      this.userInfoEl.innerHTML = `
        <div class="user-info-wrapper">
          <div class="user-basic">
            <div class="user-avatar">${initial}</div>
            <span class="user-name">${userInfo.name || '用户'}</span>
            <button class="btn btn-secondary btn-small" id="logoutBtn">退出</button>
          </div>
          ${cookieHtml}
        </div>
      `;

      document.getElementById('logoutBtn').addEventListener('click', () => this.logout());

      // 复制 cookie 按钮
      const copyBtn = document.getElementById('copyCookieBtn');
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          const cookieText = document.getElementById('cookieValue').textContent;
          navigator.clipboard.writeText(cookieText).then(() => {
            this.showToast('Cookie 已复制', 'success');
          });
        });
      }
    }
  }

  // 登出
  async logout() {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        headers: { 'X-Session-Id': this.sessionId }
      });
    } catch (e) {}

    this.isLoggedIn = false;
    this.hideHtmlPreview(true);
    localStorage.removeItem('sessionId');
    this.sessionId = this.generateSessionId();
    this.clearPageState();
    this.selectedDesignId = null;

    this.userInfoEl.innerHTML = `
      <button class="btn btn-primary" id="loginBtn">登录蓝湖</button>
    `;

    document.getElementById('loginBtn').addEventListener('click', () => this.login());
    this.showToast('已退出登录');
  }

  // URL 输入处理
  onUrlInput() {
    const url = this.urlInput.value.trim();
    this.parseBtn.disabled = !url;

    // URL 变化时隐藏刷新按钮
    this.refreshBtn.style.display = 'none';

    // 自动检测并解析
    if (url && this.isValidLanhuUrl(url)) {
      this.parseUrl();
    }
  }

  // 验证蓝湖 URL
  isValidLanhuUrl(url) {
    return url.includes('lanhuapp.com');
  }

  // 解析 URL
  async parseUrl() {
    const url = this.urlInput.value.trim();

    if (!url) return;

    if (!this.isLoggedIn) {
      this.showError('请先登录蓝湖');
      return;
    }

    // 先检查缓存
    const cached = this.getCache(url);
    if (cached) {
      this.log('使用缓存数据 (点击🔄按钮强制刷新)', 'success');
      this.renderResult(cached);
      this.refreshBtn.style.display = 'inline-flex';
      // 保存页面状态
      this.savePageState();
      return;
    }

    // 新解析时清除之前的选中状态（但保留 pendingDesignId 用于恢复）
    this.selectedDesignId = null;
    this.refreshBtn.style.display = 'none';

    // 注意：不要清除 pendingDesignId，因为它用于恢复之前选中的设计图

    // 清空之前的日志
    this.clearLogs();
    this.log('开始解析: ' + url, 'info');

    this.showLoading();
    this.emptyState.style.display = 'flex';
    this.historySection.style.display = 'flex';
    this.projectInfo.style.display = 'none';
    this.designsSection.style.display = 'none';

    try {
      this.log('发送解析请求...', 'info');
      const response = await fetch('/api/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': this.sessionId
        },
        body: JSON.stringify({ url })
      });

      const data = await response.json();
      this.log('收到响应: ' + JSON.stringify(data).substring(0, 200) + '...', 'info');

      if (data.success) {
        this.log('解析成功!', 'success');
        if (data.logs && data.logs.length > 0) {
          data.logs.forEach(log => this.log(log.message, log.type || 'info'));
        }
        // 缓存结果
        this.setCache(url, data);
        this.renderResult(data);
      } else {
        this.log('解析失败: ' + (data.message || '未知错误'), 'error');
        this.showError(data.message || '解析失败');
      }
    } catch (e) {
      this.log('请求失败: ' + e.message, 'error');
      this.showError('请求失败: ' + e.message);
    }
  }

  // 渲染结果
  renderResult(data) {
    this.hideHtmlPreview(true);
    this.hideLoading();
    this.errorBox.style.display = 'none';

    // 保存项目ID和团队ID，供图层解析等功能使用
    this.currentTeamId = data.teamId;
    this.currentProjectId = data.projectId;
    this.designs = data.designs || [];

    // 保存到历史记录
    const url = this.urlInput.value.trim();
    const projectName = this.decodeHtmlEntities(data.project?.name) || '未知项目';
    this.addToHistory(url, projectName);

    // 项目信息
    if (data.project) {
      this.projectInfo.style.display = 'block';
      this.projectName.textContent = projectName;

      let metaHtml = '';
      if (data.project.creator) {
        metaHtml += `<div class="meta-item"><span class="meta-icon">👤</span>${data.project.creator}</div>`;
      }
      if (data.project.memberCount) {
        metaHtml += `<div class="meta-item"><span class="meta-icon">👥</span>${data.project.memberCount}人</div>`;
      }
      if (data.project.updatedAt) {
        metaHtml += `<div class="meta-item"><span class="meta-icon">🕐</span>${this.formatDate(data.project.updatedAt)}</div>`;
      }
      metaHtml += `<div class="meta-item"><span class="meta-icon">📁</span>${this.getTypeLabel(data.type)}</div>`;

      this.projectMeta.innerHTML = metaHtml;
    }

    // 设计图列表
    if (data.designs && data.designs.length > 0) {
      this.emptyState.style.display = 'none';
      this.historySection.style.display = 'none';
      this.designsSection.style.display = 'flex';
      this.designCount.textContent = `${data.designs.length} 张`;

      this.designGrid.innerHTML = data.designs.map((design, index) => `
        <div class="design-card" data-index="${index}" data-id="${design.id}" data-url="${design.url || ''}">
          <div class="design-preview">
            ${design.url ? `<img src="${this.getProxiedImageUrl(design.url)}" alt="${design.name}" loading="lazy">` : '<span>🖼️</span>'}
          </div>
          <div class="design-info">
            <div class="design-name" title="${design.name}">${design.name}</div>
            <div class="design-size">${design.width} x ${design.height}</div>
          </div>
        </div>
      `).join('');

      // 绑定点击事件
      this.designGrid.querySelectorAll('.design-card').forEach(card => {
        card.addEventListener('click', () => this.selectDesign(card, data));
      });

      // 右侧初始状态（在自动选中之前设置，让 selectDesign 可以覆盖）
      this.contentEmpty.style.display = 'flex';
      this.previewSection.style.display = 'none';
      this.sidebarRight.style.display = 'none';

      // 恢复之前选中的设计图，或默认选中第一个
      let targetCard = null;
      if (this.pendingDesignId) {
        targetCard = this.designGrid.querySelector(`.design-card[data-id="${this.pendingDesignId}"]`);
        console.log('尝试恢复设计图:', this.pendingDesignId, '找到:', !!targetCard);
        this.pendingDesignId = null; // 清除待恢复的ID
      }
      if (!targetCard) {
        targetCard = this.designGrid.querySelector('.design-card');
      }
      if (targetCard) {
        targetCard.click();
      }
    } else {
      this.designsSection.style.display = 'none';
      // 没有设计图时显示空状态
      this.selectedDesignId = null;
      this.contentEmpty.style.display = 'flex';
      this.previewSection.style.display = 'none';
      this.sidebarRight.style.display = 'none';
      this.renderHotspots();
    }
  }

  // 选择设计图
  async selectDesign(card, projectData) {
    // 更新选中状态
    this.designGrid.querySelectorAll('.design-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');

    const designId = card.dataset.id;
    const designUrl = card.dataset.url;
    const design = projectData.designs.find(d => d.id === designId);
    const isDesignSwitched = !!this.selectedDesignId && this.selectedDesignId !== designId;

    // 先保存旧设计图的位置（如果有）
    if (isDesignSwitched) {
      this.saveCurrentDesignState();
      this.exitMarkModes();
      this.hideHtmlPreview(true);
      // 切换设计图时清空当前图层显示（但保留缓存）
      this.layers = [];
      this.canvasInfo = null;
      this.currentLayerDesignId = null;
      if (this.isLayerMode) {
        this.isLayerMode = false;
        if (this.layerModeBtn) {
          this.layerModeBtn.classList.remove('active');
          this.layerModeBtn.textContent = '图层解析';
        }
        this.hideLayerAnnotations();
      }
    }

    // 更新当前选中的设计图
    this.selectedDesignId = designId;
    this.currentProjectData = projectData;
    this.closeNoteModal();
    if (!isDesignSwitched) {
      this.clearDrawingDrafts();
      this.syncMarkModeButtons();
    }

    // 保存页面状态（只保存选中的设计图ID）
    this.savePageState();

    if (!design) return;

    // 隐藏空状态，显示预览区
    this.contentEmpty.style.display = 'none';
    this.previewSection.style.display = 'flex';
    this.syncMarkModeButtons();
    this.renderHotspots();

    // 显示设计图预览
    if (designUrl) {
      this.previewName.textContent = design.name;
      this.previewSize.textContent = `${design.width} × ${design.height}`;
      this.previewImage.src = this.getProxiedImageUrl(designUrl);
      this.previewImage.alt = design.name;

      // 恢复该设计图的缩放状态（每个设计图独立记忆）
      const savedState = this.getDesignState(designId);
      if (savedState) {
        this.zoomLevel = savedState.zoom || 1;
        this.panX = savedState.panX || 0;
        this.panY = savedState.panY || 0;
        this.applyTransform();
        this.updateZoomLevel();
      } else {
        this.resetZoom(false); // 不保存，因为是初始化
      }

      this.scheduleHotspotRender();
      this.scheduleHotspotRender(80);
      this.scheduleHotspotRender(220);
      if (this.previewImage.complete && this.previewImage.naturalWidth > 0) {
        this.scheduleHotspotRender(0);
      }
    }

    // 显示更新按钮
    this.refreshDesignBtn.style.display = 'inline-flex';

    // 先隐藏右侧栏，等切图数据加载完成后再决定是否显示
    this.sidebarRight.style.display = 'none';

    // 先检查切图缓存
    const cachedSlices = this.getSliceCache(designId);
    if (cachedSlices) {
      this.renderSlices(cachedSlices);
      this.log('使用切图缓存', 'success');
      return;
    }

    this.sliceCountEl.textContent = '加载中...';
    this.sliceList.innerHTML = '<div class="slice-empty">正在加载切图...</div>';
    this.sliceFooter.style.display = 'none';

    try {
      const response = await fetch('/api/slices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': this.sessionId
        },
        body: JSON.stringify({
          teamId: projectData.teamId,
          projectId: projectData.projectId,
          imageId: designId
        })
      });

      const data = await response.json();

      // 显示切图获取日志
      if (data.logs && data.logs.length > 0) {
        data.logs.forEach(log => this.log(log.message, log.type || 'info'));
      }

      // 缓存切图数据
      if (data.slices) {
        this.setSliceCache(designId, data);
      }

      this.renderSlices(data);
    } catch (e) {
      // 获取失败时也隐藏右侧栏
      this.sidebarRight.style.display = 'none';
      this.log('获取切图失败: ' + e.message, 'error');
      this.showToast('获取切图失败: ' + e.message, 'error');
    }
  }

  // 渲染切图列表
  renderSlices(data) {
    if (data.slices && data.slices.length > 0) {
      this.currentSlices = data.slices;
      this.sliceCountEl.textContent = `${data.total} 张`;
      this.sliceFooter.style.display = 'block';
      // 始终显示设置面板
      this.sliceSettingsEl.style.display = 'block';
      // 有切图时显示右侧栏
      this.sidebarRight.style.display = 'flex';

      this.renderSliceList();
    } else {
      // 没有切图时隐藏右侧栏
      this.sidebarRight.style.display = 'none';
      this.currentSlices = null;
    }
  }

  // 根据平台设置渲染切图列表
  renderSliceList() {
    // 获取当前项目所有可用的倍率
    const allScales = new Set();
    this.currentSlices.forEach(slice => {
      Object.keys(slice.scales || {}).forEach(s => allScales.add(s));
    });

    // 根据平台过滤要显示的倍率
    const platformScaleMap = {
      'ios': ['1x', '2x', '3x', 'svg'],
      'android': ['1x', '2x', '3x', 'svg'], // Android 也使用 1x/2x/3x
      'web': ['1x', '2x', 'svg']
    };

    const allowedScales = platformScaleMap[this.currentPlatform] || platformScaleMap['ios'];

    this.sliceList.innerHTML = this.currentSlices.map((slice, index) => {
      // 获取可用的倍率，确保 scales 对象有效
      const availableScales = slice.scales && Object.keys(slice.scales).length > 0
        ? slice.scales
        : { '1x': slice.defaultUrl || slice.url };
      const safeName = this.escapeHtml(slice.name || '');
      const safeAttrName = this.escapeAttr(slice.name || '');
      const safeFallbackLabel = this.escapeHtml(slice.defaultFormat?.toUpperCase() || 'PNG');

      // 根据平台和可用倍率生成按钮
      let scaleBtns = allowedScales
        .filter(s => availableScales[s])
        .map(scale =>
          `<button class="btn btn-small btn-secondary" onclick="app.downloadSliceWithScale(${index}, '${scale}')" title="${scale}">${scale.toUpperCase()}</button>`
        ).join('');

      // 如果没有生成任何按钮，使用默认下载按钮
      if (!scaleBtns) {
        const defaultUrl = slice.defaultUrl || slice.url;
        if (defaultUrl) {
          scaleBtns = `<button class="btn btn-small btn-secondary" onclick="app.downloadSlice(${index})">下载</button>`;
        }
      }

      const previewUrl = availableScales['2x'] || availableScales['1x'] || Object.values(availableScales)[0] || '';
      const proxiedPreviewUrl = previewUrl ? this.getProxiedImageUrl(previewUrl) : '';

      return `
        <div class="slice-item">
          <div class="slice-preview">
            ${proxiedPreviewUrl ? `<img src="${this.escapeAttr(proxiedPreviewUrl)}" alt="${safeAttrName}" loading="lazy" onerror="this.style.display='none';this.parentElement.textContent='${safeFallbackLabel}'">` : `<span>${safeFallbackLabel}</span>`}
          </div>
          <div class="slice-info">
            <div class="slice-name">${safeName}</div>
            <div class="slice-meta">${slice.width} × ${slice.height}</div>
          </div>
          <div class="slice-actions">
            ${scaleBtns}
          </div>
        </div>
      `;
    }).join('');
  }

  // 应用切图设置
  applySliceSettings() {
    if (!this.sliceSettings) return;

    // 根据设置更新平台选项
    if (this.sliceSettings.platform) {
      const platformBtns = document.querySelectorAll('#platformOptions .setting-btn');
      platformBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.platform === this.currentPlatform);
      });
    }
  }

  // 更新平台
  updateScalesForPlatform() {
    this.renderSliceList();
  }

  // 下载指定倍率的切图
  async downloadSliceWithScale(index, scale) {
    const slice = this.currentSlices[index];
    if (!slice) return;

    const scales = slice.scales || { '1x': slice.defaultUrl || slice.url };
    const url = scales[scale];
    if (!url) return;

    const format = scale === 'svg' ? 'svg' : 'png';
    const filename = `${slice.name}@${scale}.${format}`;

    try {
      // 通过后端代理下载
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': this.sessionId
        },
        body: JSON.stringify({ url, filename })
      });

      if (!response.ok) throw new Error('下载失败');

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(blobUrl);
      this.showToast(`已下载: ${slice.name}@${scale}`);
    } catch (e) {
      this.showToast(`下载失败: ${e.message}`, 'error');
    }
  }

  // 下载单个切图 (默认倍率)
  async downloadSlice(index) {
    const slice = this.currentSlices[index];
    if (!slice) return;

    const url = slice.defaultUrl || slice.url;
    if (!url) return;

    const format = slice.defaultFormat || 'png';
    const filename = `${slice.name}.${format}`;

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': this.sessionId
        },
        body: JSON.stringify({ url, filename })
      });

      if (!response.ok) throw new Error('下载失败');

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(blobUrl);
      this.showToast(`已下载: ${slice.name}`);
    } catch (e) {
      this.showToast(`下载失败: ${e.message}`, 'error');
    }
  }

  // 下载全部切图（打包成zip）
  async downloadAllSlices() {
    if (!this.currentSlices || this.currentSlices.length === 0) return;

    const projectName = this.projectName?.textContent || 'slices';
    this.showToast('正在打包下载...');

    try {
      const response = await fetch('/api/download-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': this.sessionId
        },
        body: JSON.stringify({
          slices: this.currentSlices,
          platform: this.currentPlatform,
          projectName
        })
      });

      if (!response.ok) {
        throw new Error('下载失败');
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${projectName}_切图.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(blobUrl);
      this.showToast(`已下载 ${this.currentSlices.length} 张切图`);
    } catch (e) {
      this.showToast(`下载失败: ${e.message}`, 'error');
    }
  }

  // 更新当前设计图数据（忽略缓存）
  async refreshCurrentDesign() {
    if (!this.selectedDesignId || !this.currentProjectData) {
      this.showToast('没有选中的设计图', 'error');
      return;
    }

    // 清除当前设计图的切图缓存
    const cacheKey = 'slice_' + this.selectedDesignId;
    delete this.cache[cacheKey];
    this.saveCache();

    this.log('更新设计图数据: ' + this.selectedDesignId, 'info');
    this.showToast('正在更新...');

    // 找到当前选中的设计图卡片
    const card = this.designGrid.querySelector(`.design-card[data-id="${this.selectedDesignId}"]`);
    if (card) {
      // 重新加载切图数据
      await this.loadSlicesForDesign(card, this.currentProjectData);
    }
  }

  // 加载指定设计图的切图数据
  async loadSlicesForDesign(card, projectData) {
    const designId = card.dataset.id;

    // 显示加载状态
    this.sliceCountEl.textContent = '加载中...';
    this.sliceList.innerHTML = '<div class="slice-empty">正在加载切图...</div>';
    this.sliceFooter.style.display = 'none';
    // 先显示右侧栏以便显示加载状态
    this.sidebarRight.style.display = 'flex';

    try {
      const response = await fetch('/api/slices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': this.sessionId
        },
        body: JSON.stringify({
          teamId: projectData.teamId,
          projectId: projectData.projectId,
          imageId: designId
        })
      });

      const data = await response.json();

      // 显示切图获取日志
      if (data.logs && data.logs.length > 0) {
        data.logs.forEach(log => this.log(log.message, log.type || 'info'));
      }

      // 缓存切图数据
      if (data.slices) {
        this.setSliceCache(designId, data);
      }

      this.renderSlices(data);

      if (data.slices && data.slices.length > 0) {
        this.showToast('更新完成');
      } else {
        this.showToast('该设计图没有切图');
      }
    } catch (e) {
      this.sliceCountEl.textContent = '0 张';
      this.sliceList.innerHTML = `<div class="slice-empty" style="color: var(--error-color);">获取切图失败: ${e.message}</div>`;
      this.sliceFooter.style.display = 'none';
      this.showToast('更新失败: ' + e.message, 'error');
    }
  }

  // 生成静态 HTML 并展示在右侧预览
  async generateHtmlPreview() {
    if (!this.selectedDesignId) {
      this.showToast('请先选择设计图', 'error');
      return;
    }

    const design = this.designs?.find(d => d.id === this.selectedDesignId);
    if (!design) {
      this.showToast('未找到当前设计图数据', 'error');
      return;
    }

    this.log('开始生成静态 HTML...', 'info');
    this.showToast('正在生成 HTML...');

    // 确保已加载当前设计图图层
    await this.loadLayers(true);

    if (!Array.isArray(this.layers) || this.layers.length === 0) {
      this.log('没有可用图层数据，生成 HTML 失败', 'error');
      this.showToast('没有可用图层数据，无法生成 HTML', 'error');
      return;
    }

    const htmlCode = this.buildStaticHtmlFromLayers(design);
    this.generatedHtmlCode = htmlCode;
    this.generatedHtmlDesignId = this.selectedDesignId;
    this.showHtmlPreview(htmlCode);

    this.log(`HTML 生成完成，图层数: ${this.layers.length}`, 'success');
    this.showToast('HTML 生成完成', 'success');
  }

  showHtmlPreview(htmlCode) {
    if (!this.htmlPreviewPanel || !this.previewBody) return;

    this.htmlPreviewPanel.style.display = 'flex';
    this.previewBody.classList.add('html-preview-visible');
    if (this.generateHtmlBtn) {
      this.generateHtmlBtn.classList.add('active');
    }

    if (this.htmlPreviewFrame) {
      this.htmlPreviewFrame.srcdoc = htmlCode;
    }
    if (this.htmlCodeOutput) {
      this.htmlCodeOutput.value = htmlCode;
      this.htmlCodeOutput.scrollTop = 0;
    }
  }

  hideHtmlPreview(clearCode = false) {
    if (this.htmlPreviewPanel) {
      this.htmlPreviewPanel.style.display = 'none';
    }
    if (this.previewBody) {
      this.previewBody.classList.remove('html-preview-visible');
    }
    if (this.generateHtmlBtn) {
      this.generateHtmlBtn.classList.remove('active');
    }
    if (this.htmlPreviewFrame) {
      this.htmlPreviewFrame.srcdoc = '';
    }

    if (clearCode) {
      this.generatedHtmlCode = '';
      this.generatedHtmlDesignId = null;
      if (this.htmlCodeOutput) {
        this.htmlCodeOutput.value = '';
      }
    }
  }

  async copyGeneratedHtml() {
    if (!this.generatedHtmlCode) {
      this.showToast('还没有可复制的 HTML 代码', 'error');
      return;
    }

    try {
      await navigator.clipboard.writeText(this.generatedHtmlCode);
      this.showToast('HTML 代码已复制', 'success');
    } catch (e) {
      this.showToast('复制失败: ' + e.message, 'error');
    }
  }

  openGeneratedHtmlInNewTab() {
    if (!this.generatedHtmlCode) {
      this.showToast('请先生成 HTML', 'error');
      return;
    }

    const newTab = window.open('', '_blank');
    if (!newTab) {
      this.showToast('浏览器拦截了新标签页，请允许弹窗后重试', 'error');
      return;
    }

    newTab.document.open();
    newTab.document.write(this.generatedHtmlCode);
    newTab.document.close();
    this.showToast('已在新标签页打开', 'success');
  }

  buildStaticHtmlFromLayers(design) {
    const preferredWidth = Math.max(1, Math.round(
      Number(design?.width) ||
      Number(this.canvasInfo?.width) ||
      Number(this.previewImage?.naturalWidth) ||
      1
    ));
    const preferredHeight = Math.max(1, Math.round(
      Number(design?.height) ||
      Number(this.canvasInfo?.height) ||
      Number(this.previewImage?.naturalHeight) ||
      1
    ));
    const backgroundImageUrl = design?.url ? this.getProxiedImageUrl(design.url) : '';
    const availableSlices = this.getAvailableSlicesForHtml();
    const renderableLayers = this.getRenderableLayersForHtml(this.layers || [], availableSlices);
    const normalized = this.normalizeLayersForCanvas(renderableLayers, preferredWidth, preferredHeight);
    const layerHtml = normalized.layers
      .map((layer, index) => this.renderLayerToHtml(layer, index))
      .filter(Boolean)
      .join('\n    ');

    const previewName = this.escapeHtml(design?.name || 'lanhu-design');
    // 设计图原图通常自带文字，叠加文字图层会形成明显重影。
    // 仅在没有任何可渲染图层时，才回退展示原图背景。
    const shouldUseReferenceBackground = !normalized.layers.length && !!backgroundImageUrl;
    const backgroundLayer = shouldUseReferenceBackground
      ? `<img class="lh-bg" src="${this.escapeAttr(backgroundImageUrl)}" alt="" />`
      : '';

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${previewName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #f2f2f2;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    .lh-canvas {
      position: relative;
      width: ${normalized.canvasWidth}px;
      height: ${normalized.canvasHeight}px;
      overflow: hidden;
      background: #fff;
      box-shadow: 0 6px 30px rgba(0, 0, 0, 0.12);
      border-radius: 4px;
    }
    .lh-bg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: fill;
      pointer-events: none;
      user-select: none;
    }
    .lh-layer {
      position: absolute;
      overflow: hidden;
      z-index: 1;
      white-space: pre-wrap;
      word-break: break-word;
      cursor: pointer;
    }
    .lh-image {
      white-space: normal;
      word-break: normal;
      object-fit: fill;
      user-select: none;
      -webkit-user-drag: none;
    }
    .lh-text {
      overflow: visible;
    }
    .lh-selected {
      outline: 2px solid #ff4d4f;
      outline-offset: -1px;
      z-index: 2147483646 !important;
    }
    .lh-inspector {
      position: fixed;
      left: 16px;
      bottom: 16px;
      max-width: min(80vw, 520px);
      background: rgba(20, 20, 20, 0.86);
      color: #fff;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 12px;
      line-height: 1.5;
      pointer-events: none;
      z-index: 2147483647;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }
    .lh-inspector-title {
      font-weight: 700;
      margin-bottom: 4px;
    }
    .lh-inspector-row {
      opacity: 0.95;
      word-break: break-all;
    }
    .lh-inspector-empty {
      opacity: 0.75;
    }
  </style>
</head>
<body>
  <div class="lh-canvas">
    ${backgroundLayer}
    ${layerHtml}
  </div>
  <div class="lh-inspector" id="lhInspector">
    <div class="lh-inspector-title">图层检查</div>
    <div class="lh-inspector-empty" id="lhInspectorEmpty">点击图层可选中；同一位置重复点击可切换重叠图层</div>
    <div class="lh-inspector-row" id="lhInspectorName" style="display:none;"></div>
    <div class="lh-inspector-row" id="lhInspectorPath" style="display:none;"></div>
    <div class="lh-inspector-row" id="lhInspectorMeta" style="display:none;"></div>
  </div>
  <script>
    (() => {
      const canvas = document.querySelector('.lh-canvas');
      const inspectorName = document.getElementById('lhInspectorName');
      const inspectorPath = document.getElementById('lhInspectorPath');
      const inspectorMeta = document.getElementById('lhInspectorMeta');
      const inspectorEmpty = document.getElementById('lhInspectorEmpty');
      if (!canvas || !inspectorName || !inspectorPath || !inspectorMeta || !inspectorEmpty) return;

      let selectedLayer = null;
      let currentStack = [];
      let currentStackIndex = 0;
      let lastStackKey = '';

      const clearSelectedLayer = () => {
        if (selectedLayer) {
          selectedLayer.classList.remove('lh-selected');
        }
        selectedLayer = null;
        inspectorName.style.display = 'none';
        inspectorPath.style.display = 'none';
        inspectorMeta.style.display = 'none';
        inspectorEmpty.style.display = 'block';
      };

      const updateInspector = (layer, index, total) => {
        const name = layer.getAttribute('data-name') || '(未命名)';
        const path = layer.getAttribute('data-path') || '(无路径)';
        const type = layer.getAttribute('data-type') || 'unknown';
        const z = layer.style.zIndex || '';
        inspectorName.textContent = '名称: ' + name;
        inspectorPath.textContent = '路径: ' + path;
        inspectorMeta.textContent = '类型: ' + type + ' | z-index: ' + z + ' | 重叠层: ' + (index + 1) + '/' + total;
        inspectorName.style.display = 'block';
        inspectorPath.style.display = 'block';
        inspectorMeta.style.display = 'block';
        inspectorEmpty.style.display = 'none';
      };

      const setSelectedLayer = (layer, index, total) => {
        if (!layer) {
          clearSelectedLayer();
          return;
        }
        if (selectedLayer && selectedLayer !== layer) {
          selectedLayer.classList.remove('lh-selected');
        }
        selectedLayer = layer;
        selectedLayer.classList.add('lh-selected');
        updateInspector(layer, index, total);
      };

      const getStackAtPoint = (clientX, clientY) => {
        const elements = document.elementsFromPoint(clientX, clientY);
        return elements.filter((el) => el && el.classList && el.classList.contains('lh-layer'));
      };

      canvas.addEventListener('click', (event) => {
        const stack = getStackAtPoint(event.clientX, event.clientY);
        if (!stack.length) {
          clearSelectedLayer();
          return;
        }

        const stackKey = stack
          .map((el) => (el.getAttribute('data-path') || '') + '__' + (el.style.zIndex || ''))
          .join('|');

        if (stackKey !== lastStackKey) {
          currentStack = stack;
          currentStackIndex = 0;
          lastStackKey = stackKey;
        } else {
          currentStackIndex = (currentStackIndex + 1) % currentStack.length;
        }

        setSelectedLayer(currentStack[currentStackIndex], currentStackIndex, currentStack.length);
      });
    })();
  </script>
</body>
</html>`;
  }

  getAvailableSlicesForHtml() {
    if (Array.isArray(this.currentSlices) && this.currentSlices.length > 0) {
      return this.currentSlices;
    }

    if (this.selectedDesignId) {
      const cache = this.getSliceCache(this.selectedDesignId);
      if (cache && Array.isArray(cache.slices) && cache.slices.length > 0) {
        return cache.slices;
      }
    }

    return [];
  }

  getRenderableLayersForHtml(layers, slices = []) {
    const textDedup = new Set();
    const textLayers = layers
      .filter((layer) => {
        if (!layer || layer.visible === false) return false;

        const width = Math.round(Number(layer.width) || 0);
        const height = Math.round(Number(layer.height) || 0);
        if (width <= 1 || height <= 1) return false;

        const text = this.getLayerText(layer.text).trim();
        const hasText = text.length > 0;

        if (hasText) {
          const key = `${Math.round(Number(layer.x) || 0)}_${Math.round(Number(layer.y) || 0)}_${width}_${height}_${text}`;
          if (textDedup.has(key)) return false;
          textDedup.add(key);
          layer._text = text;
          return true;
        }

        return false;
      })
      .sort((a, b) => {
        const depthDiff = (Number(a.depth) || 0) - (Number(b.depth) || 0);
        if (depthDiff !== 0) return depthDiff;
        const areaA = (Number(a.width) || 0) * (Number(a.height) || 0);
        const areaB = (Number(b.width) || 0) * (Number(b.height) || 0);
        return areaB - areaA;
      });

    const dedupedTextLayers = this.deduplicateNearTextLayers(textLayers);
    const sliceLayers = this.buildRenderableSliceLayers(layers, slices);
    const visibleTextLayers = this.filterTextLayersCoveredBySlices(dedupedTextLayers, sliceLayers);

    return this.sortRenderableLayersForHtml([...sliceLayers, ...visibleTextLayers]);
  }

  buildRenderableSliceLayers(layers, slices) {
    if (!Array.isArray(layers) || !Array.isArray(slices) || slices.length === 0) {
      return [];
    }

    const validLayers = layers.filter((layer) => {
      if (!layer || layer.visible === false) return false;
      const width = Number(layer.width) || 0;
      const height = Number(layer.height) || 0;
      return width > 1 && height > 1;
    });

    const exactPathMap = new Map();
    validLayers.forEach((layer) => {
      const path = String(layer.path || '').trim();
      if (!path) return;
      if (!exactPathMap.has(path)) {
        exactPathMap.set(path, []);
      }
      exactPathMap.get(path).push(layer);
    });

    const usedLayerKeys = new Set();
    const usedSliceLayerPairs = new Set();
    const result = [];

    slices.forEach((slice) => {
      const sourceUrl = this.getSliceImageUrlForHtml(slice);
      if (!sourceUrl) return;

      const matchedLayers = this.findMatchedLayersForSlice(slice, validLayers, exactPathMap, usedLayerKeys);
      if (!matchedLayers.length) return;

      const sliceIdentity = [
        String(slice?.layerPath || ''),
        String(slice?.name || ''),
        String(sourceUrl),
        String(Number(slice?.width) || 0),
        String(Number(slice?.height) || 0)
      ].join('__');

      matchedLayers.forEach((matchedLayer) => {
        if (!matchedLayer || !matchedLayer.path) return;

        const layerReuseKey = this.getLayerReuseKey(matchedLayer);
        if (!layerReuseKey) return;

        const pairKey = `${sliceIdentity}__${layerReuseKey}`;
        if (usedSliceLayerPairs.has(pairKey)) return;

        usedSliceLayerPairs.add(pairKey);
        usedLayerKeys.add(layerReuseKey);
        result.push({
          ...matchedLayer,
          _text: '',
          text: '',
          _imageUrl: this.getProxiedImageUrl(sourceUrl),
          _sliceName: slice?.name || '',
          _sliceLayerPath: slice?.layerPath || ''
        });
      });
    });

    return result;
  }

  getSliceImageUrlForHtml(slice) {
    if (!slice || typeof slice !== 'object') return '';
    const scales = (slice.scales && typeof slice.scales === 'object') ? slice.scales : {};
    return scales['1x'] || scales['2x'] || scales['3x'] || scales.svg || slice.defaultUrl || slice.url || '';
  }

  getLayerReuseKey(layer) {
    if (!layer || typeof layer !== 'object') return '';
    return [
      String(layer.path || ''),
      String(layer.name || ''),
      String(Math.round(Number(layer.x) || 0)),
      String(Math.round(Number(layer.y) || 0)),
      String(Math.round(Number(layer.width) || 0)),
      String(Math.round(Number(layer.height) || 0)),
      String(Number(layer.depth) || 0)
    ].join('__');
  }

  getSlicePathMatchScore(slicePath, layerPath) {
    const normalizedSlicePath = String(slicePath || '').trim();
    const normalizedLayerPath = String(layerPath || '').trim();

    if (!normalizedSlicePath || !normalizedLayerPath) return 4000;
    if (normalizedLayerPath === normalizedSlicePath) return 0;
    if (normalizedLayerPath.endsWith(`/${normalizedSlicePath}`)) return 10;

    const sliceParts = normalizedSlicePath.split('/').filter(Boolean);
    const layerParts = normalizedLayerPath.split('/').filter(Boolean);
    let suffixMatchCount = 0;
    while (
      suffixMatchCount < sliceParts.length &&
      suffixMatchCount < layerParts.length &&
      sliceParts[sliceParts.length - 1 - suffixMatchCount] === layerParts[layerParts.length - 1 - suffixMatchCount]
    ) {
      suffixMatchCount += 1;
    }

    if (suffixMatchCount === 0) return 3000;

    const sliceDistance = sliceParts.length - suffixMatchCount;
    const layerDistance = layerParts.length - suffixMatchCount;
    return 100 + sliceDistance * 60 + layerDistance * 6;
  }

  sortSliceCandidateLayers(layers) {
    return layers.slice().sort((a, b) => {
      const depthDiff = (Number(a?.depth) || 0) - (Number(b?.depth) || 0);
      if (depthDiff !== 0) return depthDiff;

      const yDiff = (Number(a?.y) || 0) - (Number(b?.y) || 0);
      if (yDiff !== 0) return yDiff;

      const xDiff = (Number(a?.x) || 0) - (Number(b?.x) || 0);
      if (xDiff !== 0) return xDiff;

      const areaA = (Number(a?.width) || 0) * (Number(a?.height) || 0);
      const areaB = (Number(b?.width) || 0) * (Number(b?.height) || 0);
      if (areaA !== areaB) return areaB - areaA;

      return 0;
    });
  }

  filterSliceCandidatesBySize(slice, candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) return [];

    const targetWidth = Number(slice?.width) || 0;
    const targetHeight = Number(slice?.height) || 0;
    if (targetWidth <= 0 || targetHeight <= 0) return candidates;

    const widthTolerance = Math.max(2, targetWidth * 0.12);
    const heightTolerance = Math.max(2, targetHeight * 0.12);

    const matched = candidates.filter((layer) => {
      const width = Number(layer?.width) || 0;
      const height = Number(layer?.height) || 0;
      if (width <= 0 || height <= 0) return false;
      return (
        Math.abs(width - targetWidth) <= widthTolerance &&
        Math.abs(height - targetHeight) <= heightTolerance
      );
    });

    // 若全部被过滤掉，回退原候选，避免误伤。
    return matched.length > 0 ? matched : candidates;
  }

  filterSliceCandidatesByPathDepth(slice, candidates) {
    if (!Array.isArray(candidates) || candidates.length <= 1) return candidates;

    const slicePath = String(slice?.layerPath || '').trim();
    const segmentCount = slicePath ? slicePath.split('/').filter(Boolean).length : 0;

    // 路径信息过短时（如仅“位图”），仅保留最浅层路径，减少误命中深层复用实例。
    if (segmentCount > 1) return candidates;

    const depthValues = candidates
      .map((layer) => this.getLayerPathDepth(layer?.path))
      .filter((value) => value > 0);
    if (depthValues.length === 0) return candidates;

    const minDepth = Math.min(...depthValues);
    const filtered = candidates.filter((layer) => this.getLayerPathDepth(layer?.path) === minDepth);

    return filtered.length > 0 ? filtered : candidates;
  }

  findMatchedLayersForSlice(slice, layers, exactPathMap, usedLayerKeys = new Set()) {
    const slicePath = String(slice?.layerPath || '').trim();
    const sliceName = String(slice?.name || '').trim();
    let candidates = [];
    let matchMode = '';

    if (slicePath && exactPathMap.has(slicePath)) {
      candidates = exactPathMap.get(slicePath).slice();
      matchMode = 'exactPath';
    }

    if (candidates.length === 0 && slicePath) {
      candidates = layers.filter((layer) => {
        const path = String(layer?.path || '').trim();
        if (!path) return false;
        return path === slicePath || path.endsWith(`/${slicePath}`);
      });
      if (candidates.length > 0) {
        matchMode = 'pathSuffix';
      }
    }

    if (candidates.length === 0 && sliceName) {
      candidates = layers.filter((layer) => String(layer?.name || '').trim() === sliceName);
      if (candidates.length > 0) {
        matchMode = 'nameOnly';
      }
    }

    if (candidates.length === 0) return [];

    const uniqueCandidates = [];
    const seen = new Set();
    candidates.forEach((layer) => {
      const key = this.getLayerReuseKey(layer);
      if (!key) return;
      if (seen.has(key)) return;
      seen.add(key);
      uniqueCandidates.push(layer);
    });

    if (uniqueCandidates.length === 0) return [];

    const sizeFilteredCandidates = this.filterSliceCandidatesBySize(slice, uniqueCandidates);
    const pathFilteredCandidates = this.filterSliceCandidatesByPathDepth(slice, sizeFilteredCandidates);

    // 路径匹配命中时保留全部实例，避免同一切图在多处复用时只渲染一处。
    if (matchMode === 'exactPath' || matchMode === 'pathSuffix') {
      return this.sortSliceCandidateLayers(pathFilteredCandidates);
    }

    const best = this.findBestLayerForSlice(slice, pathFilteredCandidates, usedLayerKeys);
    return best ? [best] : [];
  }

  findBestLayerForSlice(slice, candidates, usedLayerKeys = new Set()) {
    if (!Array.isArray(candidates) || candidates.length === 0) return null;

    const slicePath = String(slice?.layerPath || '').trim();
    const sliceName = String(slice?.name || '').trim();
    const targetWidth = Number(slice?.width) || 0;
    const targetHeight = Number(slice?.height) || 0;

    let best = candidates[0];
    let bestScore = Number.POSITIVE_INFINITY;

    candidates.forEach((layer) => {
      const width = Number(layer?.width) || 0;
      const height = Number(layer?.height) || 0;
      const sizeScore = Math.abs(width - targetWidth) + Math.abs(height - targetHeight);
      const areaScore = Math.abs((width * height) - (targetWidth * targetHeight));
      const depthScore = Number(layer?.depth) || 0;
      const layerPath = String(layer?.path || '').trim();
      const layerName = String(layer?.name || '').trim();
      const pathScore = this.getSlicePathMatchScore(slicePath, layerPath);
      const nameScore = sliceName && sliceName === layerName ? 0 : 200;
      const reusePenalty = usedLayerKeys.has(this.getLayerReuseKey(layer)) ? 10000000 : 0;
      const score = reusePenalty + pathScore + nameScore + sizeScore * 10 + areaScore * 0.01 + depthScore;

      if (score < bestScore) {
        bestScore = score;
        best = layer;
      }
    });

    return best;
  }

  filterTextLayersCoveredBySlices(textLayers, sliceLayers) {
    if (!Array.isArray(textLayers) || textLayers.length === 0) return [];
    if (!Array.isArray(sliceLayers) || sliceLayers.length === 0) return textLayers;

    const sliceRects = sliceLayers
      .map((layer) => ({
        x: Number(layer.x) || 0,
        y: Number(layer.y) || 0,
        width: Number(layer.width) || 0,
        height: Number(layer.height) || 0
      }))
      .filter((rect) => rect.width > 0 && rect.height > 0);

    if (sliceRects.length === 0) return textLayers;

    return textLayers.filter((layer) => {
      const x = Number(layer?.x) || 0;
      const y = Number(layer?.y) || 0;
      const width = Number(layer?.width) || 0;
      const height = Number(layer?.height) || 0;
      if (width <= 0 || height <= 0) return false;

      const textArea = width * height;
      const maxCoverRatio = sliceRects.reduce((maxRatio, rect) => {
        const overlapWidth = Math.max(0, Math.min(x + width, rect.x + rect.width) - Math.max(x, rect.x));
        const overlapHeight = Math.max(0, Math.min(y + height, rect.y + rect.height) - Math.max(y, rect.y));
        if (overlapWidth <= 0 || overlapHeight <= 0) return maxRatio;
        const overlapArea = overlapWidth * overlapHeight;
        const ratio = overlapArea / textArea;
        return ratio > maxRatio ? ratio : maxRatio;
      }, 0);

      // 文本被切图大范围覆盖时，优先保留切图，避免视觉重叠。
      return maxCoverRatio < 0.8;
    });
  }

  getLayerPathDepth(path) {
    const normalizedPath = String(path || '').trim();
    if (!normalizedPath) return 0;
    return normalizedPath.split('/').filter(Boolean).length;
  }

  isLayerPathAncestor(parentPath, childPath) {
    const normalizedParentPath = String(parentPath || '').trim();
    const normalizedChildPath = String(childPath || '').trim();
    if (!normalizedParentPath || !normalizedChildPath) return false;
    if (normalizedParentPath === normalizedChildPath) return false;
    return normalizedChildPath.startsWith(`${normalizedParentPath}/`);
  }

  isSameLayerRect(a, b, tolerance = 1) {
    if (!a || !b) return false;
    const ax = Number(a.x) || 0;
    const ay = Number(a.y) || 0;
    const aw = Number(a.width) || 0;
    const ah = Number(a.height) || 0;
    const bx = Number(b.x) || 0;
    const by = Number(b.y) || 0;
    const bw = Number(b.width) || 0;
    const bh = Number(b.height) || 0;
    return (
      Math.abs(ax - bx) <= tolerance &&
      Math.abs(ay - by) <= tolerance &&
      Math.abs(aw - bw) <= tolerance &&
      Math.abs(ah - bh) <= tolerance
    );
  }

  sortRenderableLayersForHtml(layers) {
    const sorted = layers.slice().sort((a, b) => {
      const depthDiff = (Number(a.depth) || 0) - (Number(b.depth) || 0);
      if (depthDiff !== 0) return depthDiff;

      const areaA = (Number(a.width) || 0) * (Number(a.height) || 0);
      const areaB = (Number(b.width) || 0) * (Number(b.height) || 0);
      if (areaA !== areaB) {
        return areaB - areaA;
      }

      const pathDepthDiff = this.getLayerPathDepth(a?.path) - this.getLayerPathDepth(b?.path);
      if (pathDepthDiff !== 0) return pathDepthDiff;

      return 0;
    });

    // 同位置父子切图重叠时，提升父层到子层后面，避免 Frame 被子切图完全遮挡。
    for (let i = 0; i < sorted.length; i += 1) {
      const current = sorted[i];
      const currentPath = String(current?.path || '').trim();
      if (!currentPath) continue;

      let moveToIndex = i;
      for (let j = i + 1; j < sorted.length; j += 1) {
        const candidate = sorted[j];
        if (!this.isSameLayerRect(current, candidate)) continue;
        const candidatePath = String(candidate?.path || '').trim();
        if (!this.isLayerPathAncestor(currentPath, candidatePath)) continue;
        moveToIndex = j;
      }

      if (moveToIndex > i) {
        const [layer] = sorted.splice(i, 1);
        sorted.splice(moveToIndex, 0, layer);
        i -= 1;
      }
    }

    return sorted;
  }

  deduplicateNearTextLayers(layers) {
    if (!Array.isArray(layers) || !layers.length) return [];

    const result = [];
    layers.forEach((layer) => {
      const text = (layer?._text || this.getLayerText(layer?.text)).trim();
      if (!text) {
        result.push(layer);
        return;
      }

      const hasDuplicate = result.some(existing =>
        this.isNearDuplicateTextLayer(existing, layer)
      );

      if (!hasDuplicate) {
        result.push(layer);
      }
    });

    return result;
  }

  isNearDuplicateTextLayer(a, b) {
    if (!a || !b) return false;
    const textA = (a._text || this.getLayerText(a.text)).trim();
    const textB = (b._text || this.getLayerText(b.text)).trim();
    if (!textA || textA !== textB) return false;

    const ax = Number(a.x) || 0;
    const ay = Number(a.y) || 0;
    const aw = Number(a.width) || 0;
    const ah = Number(a.height) || 0;
    const bx = Number(b.x) || 0;
    const by = Number(b.y) || 0;
    const bw = Number(b.width) || 0;
    const bh = Number(b.height) || 0;

    if (aw <= 0 || ah <= 0 || bw <= 0 || bh <= 0) return false;

    const overlapWidth = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx));
    const overlapHeight = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by));
    const overlapArea = overlapWidth * overlapHeight;
    if (overlapArea <= 0) return false;

    const smallerArea = Math.min(aw * ah, bw * bh);
    if (smallerArea <= 0) return false;

    // 同文案且覆盖率非常高时，认为是状态叠层导致的重复文本。
    const overlapRatio = overlapArea / smallerArea;
    return overlapRatio >= 0.75;
  }

  normalizeLayersForCanvas(layers, preferredWidth, preferredHeight) {
    if (!layers.length) {
      return {
        canvasWidth: preferredWidth,
        canvasHeight: preferredHeight,
        layers: []
      };
    }

    const minX = Math.min(...layers.map(layer => Number(layer.x) || 0));
    const minY = Math.min(...layers.map(layer => Number(layer.y) || 0));
    const maxRight = Math.max(...layers.map(layer => (Number(layer.x) || 0) + (Number(layer.width) || 0)));
    const maxBottom = Math.max(...layers.map(layer => (Number(layer.y) || 0) + (Number(layer.height) || 0)));

    const rawWidth = Math.max(1, maxRight - minX);
    const rawHeight = Math.max(1, maxBottom - minY);

    let canvasWidth = preferredWidth > 1 ? preferredWidth : rawWidth;
    let canvasHeight = preferredHeight > 1 ? preferredHeight : rawHeight;
    let scaleX = 1;
    let scaleY = 1;

    if (preferredWidth > 1) {
      const ratioX = rawWidth / preferredWidth;
      if (ratioX > 1.3 || ratioX < 0.77) {
        scaleX = preferredWidth / rawWidth;
      }
    } else {
      canvasWidth = rawWidth;
    }

    if (preferredHeight > 1) {
      const ratioY = rawHeight / preferredHeight;
      if (ratioY > 1.3 || ratioY < 0.77) {
        scaleY = preferredHeight / rawHeight;
      }
    } else {
      canvasHeight = rawHeight;
    }

    const normalizedLayers = layers.map((layer) => {
      const x = ((Number(layer.x) || 0) - minX) * scaleX;
      const y = ((Number(layer.y) || 0) - minY) * scaleY;
      const width = (Number(layer.width) || 0) * scaleX;
      const height = (Number(layer.height) || 0) * scaleY;
      const styleScale = (Math.abs(scaleX - scaleY) < 0.001)
        ? scaleX
        : (scaleX + scaleY) / 2;
      return {
        ...layer,
        x,
        y,
        width,
        height,
        _styleScale: styleScale
      };
    });

    if (canvasWidth <= 1) canvasWidth = Math.round(rawWidth * scaleX);
    if (canvasHeight <= 1) canvasHeight = Math.round(rawHeight * scaleY);

    return {
      canvasWidth: Math.max(1, Math.round(canvasWidth)),
      canvasHeight: Math.max(1, Math.round(canvasHeight)),
      layers: normalizedLayers
    };
  }

  parseStyleNumber(value) {
    if (value == null) return NaN;
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    if (typeof value === 'string') {
      const num = Number(value);
      return Number.isFinite(num) ? num : NaN;
    }
    if (typeof value === 'object' && value.value != null) {
      return this.parseStyleNumber(value.value);
    }
    return NaN;
  }

  parseLineHeightValue(value, fontSize = NaN) {
    if (value == null) return NaN;
    if (typeof value === 'object') {
      const unit = String(value.unit || '').toUpperCase();
      if (unit === 'AUTO') return NaN;
      const numeric = this.parseStyleNumber(value.value);
      if (!Number.isFinite(numeric)) return NaN;
      if (unit === 'PERCENT' || unit === 'PERCENTAGE') {
        if (Number.isFinite(fontSize)) return (fontSize * numeric) / 100;
        return numeric / 100;
      }
      return numeric;
    }
    return this.parseStyleNumber(value);
  }

  parseLetterSpacingValue(value, fontSize = NaN) {
    if (value == null) return NaN;
    if (typeof value === 'object') {
      const num = this.parseStyleNumber(value.value);
      if (!Number.isFinite(num)) return NaN;
      const unit = String(value.unit || '').toUpperCase();
      if (unit === 'PERCENT' || unit === 'PERCENTAGE') {
        if (Number.isFinite(fontSize)) return (fontSize * num) / 100;
        return num / 100;
      }
      return num;
    }
    return this.parseStyleNumber(value);
  }

  parseColorValue(value) {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();

    if (typeof value === 'object') {
      if (typeof value.value === 'string') {
        return value.value.trim();
      }

      const r = this.parseStyleNumber(value.r);
      const g = this.parseStyleNumber(value.g);
      const b = this.parseStyleNumber(value.b);
      const aRaw = this.parseStyleNumber(value.a ?? value.alpha);
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
        const toChannel = (channel) => (channel <= 1 ? Math.round(channel * 255) : Math.round(channel));
        const alpha = Number.isFinite(aRaw)
          ? (aRaw > 1 ? Math.max(0, Math.min(1, aRaw / 100)) : Math.max(0, Math.min(1, aRaw)))
          : 1;
        return `rgba(${toChannel(r)},${toChannel(g)},${toChannel(b)},${alpha})`;
      }
    }
    return '';
  }

  getLayerTextStyleFallback(layer) {
    if (!layer || !layer.text || typeof layer.text !== 'object') {
      return {};
    }

    const textNode = layer.text;
    const textStyle = (textNode.style && typeof textNode.style === 'object') ? textNode.style : {};
    const textRuns = Array.isArray(textNode.styles) ? textNode.styles : [];
    const firstRun = textRuns.find(item => item && typeof item === 'object') || {};
    const font = (textStyle.font && typeof textStyle.font === 'object')
      ? textStyle.font
      : ((firstRun.font && typeof firstRun.font === 'object') ? firstRun.font : {});

    const fallback = {};
    const fontSize = this.parseStyleNumber(font.size);
    if (Number.isFinite(fontSize) && fontSize > 0) {
      fallback.fontSize = fontSize;
    }

    const lineHeight = this.parseLineHeightValue(font.lineHeight, fontSize);
    if (Number.isFinite(lineHeight) && lineHeight > 0) {
      fallback.lineHeight = lineHeight;
    }

    const letterSpacing = this.parseLetterSpacingValue(
      font.letterSpacing ?? font.characterSpacing,
      fontSize
    );
    if (Number.isFinite(letterSpacing)) {
      fallback.letterSpacing = letterSpacing;
    }

    const color = this.parseColorValue(
      textStyle.color ||
      firstRun.color ||
      font.color
    );
    if (color) {
      fallback.color = color;
    }

    const fontFamily = font.name || font.family;
    if (fontFamily) {
      fallback.fontFamily = fontFamily;
    }

    const fontWeight = font.fontWeight ?? font.weight ?? font.type;
    if (fontWeight != null) {
      fallback.fontWeight = fontWeight;
    }

    const textAlign = textStyle.alignment ?? font.align ?? firstRun.align;
    if (textAlign != null) {
      fallback.textAlign = textAlign;
    }

    return fallback;
  }

  getMergedLayerStylesForHtml(layer) {
    const baseStyles = (layer && layer.styles && typeof layer.styles === 'object')
      ? { ...layer.styles }
      : {};
    const fallback = this.getLayerTextStyleFallback(layer);

    Object.keys(fallback).forEach((key) => {
      if (baseStyles[key] == null || baseStyles[key] === '') {
        baseStyles[key] = fallback[key];
      }
    });

    return baseStyles;
  }

  renderLayerToHtml(layer, index) {
    const x = Math.round(Number(layer.x) || 0);
    const y = Math.round(Number(layer.y) || 0);
    const width = Math.round(Number(layer.width) || 0);
    const height = Math.round(Number(layer.height) || 0);

    if (width <= 0 || height <= 0) return '';

    const styles = [
      `left:${x}px`,
      `top:${y}px`,
      `width:${width}px`,
      `height:${height}px`,
      `z-index:${index + 1}`
    ];
    const classNames = ['lh-layer'];
    const styleScale = Math.max(0.01, Number(layer._styleScale) || 1);

    if (layer._imageUrl) {
      classNames.push('lh-image');
      const safeName = this.escapeAttr(layer.name || `layer-${index + 1}`);
      const safeType = this.escapeAttr(layer.type || 'unknown');
      const safePath = this.escapeAttr(layer.path || '');
      const safeSrc = this.escapeAttr(layer._imageUrl);
      return `<img class="${classNames.join(' ')}" style="${styles.join(';')}" data-name="${safeName}" data-type="${safeType}" data-path="${safePath}" src="${safeSrc}" alt="" draggable="false" />`;
    }

    const layerStyles = this.getMergedLayerStylesForHtml(layer);
    const bgColor = this.sanitizeColor(layerStyles.background);
    if (bgColor) styles.push(`background:${bgColor}`);

    const borderWidth = Number(layerStyles.borderWidth);
    const borderColor = this.sanitizeColor(layerStyles.borderColor);
    if (Number.isFinite(borderWidth) && borderWidth > 0 && borderColor) {
      styles.push(`border:${Math.max(1, Math.round(borderWidth * styleScale))}px solid ${borderColor}`);
    }

    let borderRadius = Number(layerStyles.borderRadius);
    if (!Number.isFinite(borderRadius) && layerStyles.borderRadius && typeof layerStyles.borderRadius === 'object') {
      const values = Object.values(layerStyles.borderRadius).map(v => Number(v)).filter(Number.isFinite);
      if (values.length) borderRadius = Math.max(...values);
    }
    if (Number.isFinite(borderRadius) && borderRadius >= 0) {
      styles.push(`border-radius:${Math.round(borderRadius * styleScale)}px`);
    }

    const text = layer._text || this.getLayerText(layer.text);
    if (text.trim()) {
      classNames.push('lh-text');
      const fontSize = Number(layerStyles.fontSize);
      if (Number.isFinite(fontSize) && fontSize > 0) {
        styles.push(`font-size:${Math.max(1, Math.round(fontSize * styleScale))}px`);
      }

      const lineHeight = Number(layerStyles.lineHeight);
      const textLineCount = Math.max(1, text.split(/\n+/).length);
      const maxLineHeight = height > 0 ? (height / textLineCount) * 1.6 : Number.POSITIVE_INFINITY;
      if (Number.isFinite(lineHeight) && lineHeight > 0) {
        let effectiveLineHeight = lineHeight * styleScale;
        if (Number.isFinite(maxLineHeight) && maxLineHeight > 0) {
          effectiveLineHeight = Math.min(effectiveLineHeight, maxLineHeight);
        }
        if (Number.isFinite(fontSize) && fontSize > 0) {
          effectiveLineHeight = Math.max(effectiveLineHeight, fontSize * styleScale * 0.95);
        }
        styles.push(`line-height:${Math.max(1, Math.round(effectiveLineHeight))}px`);
      } else if (Number.isFinite(fontSize) && fontSize > 0) {
        styles.push(`line-height:${Math.max(1, Math.round(fontSize * 1.35 * styleScale))}px`);
      }

      const letterSpacing = Number(layerStyles.letterSpacing);
      if (Number.isFinite(letterSpacing)) {
        styles.push(`letter-spacing:${letterSpacing * styleScale}px`);
      }

      const textColor = this.sanitizeColor(layerStyles.color);
      if (textColor) styles.push(`color:${textColor}`);

      const fontFamily = this.sanitizeFontFamily(layerStyles.fontFamily);
      if (fontFamily) styles.push(`font-family:${fontFamily}`);

      const fontWeight = this.sanitizeFontWeight(layerStyles.fontWeight);
      if (fontWeight) styles.push(`font-weight:${fontWeight}`);

      const textAlign = this.sanitizeTextAlign(layerStyles.textAlign);
      if (textAlign) styles.push(`text-align:${textAlign}`);
    } else {
      styles.push('pointer-events:none');
    }

    const safeName = this.escapeAttr(layer.name || `layer-${index + 1}`);
    const safeType = this.escapeAttr(layer.type || 'unknown');
    const safePath = this.escapeAttr(layer.path || '');
    const textContent = text ? this.escapeHtml(text) : '';

    return `<div class="${classNames.join(' ')}" style="${styles.join(';')}" data-name="${safeName}" data-type="${safeType}" data-path="${safePath}">${textContent}</div>`;
  }

  getLayerText(value, depth = 0) {
    if (value == null || depth > 5) return '';
    const type = typeof value;
    if (type === 'string' || type === 'number' || type === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.map(item => this.getLayerText(item, depth + 1)).join('');
    }
    if (type === 'object') {
      const keys = ['value', 'content', 'text', 'string'];
      for (const key of keys) {
        if (value[key] != null) {
          const text = this.getLayerText(value[key], depth + 1);
          if (text) return text;
        }
      }
      if (value.style) {
        const text = this.getLayerText(value.style, depth + 1);
        if (text) return text;
      }
      if (value.styles) {
        const text = this.getLayerText(value.styles, depth + 1);
        if (text) return text;
      }
      if (value.runs) {
        const text = this.getLayerText(value.runs, depth + 1);
        if (text) return text;
      }
    }
    return '';
  }

  sanitizeColor(color) {
    if (!color) return '';
    const value = String(color).trim();
    const rgbaReg = /^rgba?\((\s*\d+(\.\d+)?\s*,){2,3}\s*(\d+(\.\d+)?|\d?\.?\d+)\s*\)$/i;
    const hexReg = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
    return (rgbaReg.test(value) || hexReg.test(value)) ? value : '';
  }

  sanitizeFontFamily(fontFamily) {
    if (!fontFamily) return '';
    const first = String(fontFamily).split(',')[0].trim().replace(/^['"]|['"]$/g, '');
    if (!first) return '';
    if (!/^[\w\s-]+$/.test(first)) return '';
    return first.includes(' ') ? `"${first}"` : first;
  }

  sanitizeFontWeight(fontWeight) {
    if (fontWeight == null) return '';
    const value = String(fontWeight).trim().toLowerCase();
    if (/^\d+$/.test(value)) {
      const num = Number(value);
      if (num >= 100 && num <= 900) return String(num);
      return '';
    }
    const keywordMap = {
      thin: '100',
      extralight: '200',
      ultralight: '200',
      light: '300',
      normal: '400',
      regular: '400',
      medium: '500',
      semibold: '600',
      demibold: '600',
      bold: '700',
      extrabold: '800',
      ultrabold: '800',
      black: '900'
    };
    return keywordMap[value] || '';
  }

  sanitizeTextAlign(textAlign) {
    if (!textAlign) return '';
    if (typeof textAlign === 'number') {
      const map = { 0: 'left', 1: 'right', 2: 'center', 3: 'justify' };
      return map[textAlign] || '';
    }
    const value = String(textAlign).trim().toLowerCase();
    const map = {
      left: 'left',
      right: 'right',
      center: 'center',
      centred: 'center',
      justify: 'justify',
      justified: 'justify'
    };
    return map[value] || '';
  }

  escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  escapeAttr(value) {
    return this.escapeHtml(value).replace(/\n/g, ' ');
  }

  // 工具方法
  showLoading() {
    this.hideHtmlPreview(true);
    this.loading.style.display = 'flex';
    this.errorBox.style.display = 'none';
    this.contentEmpty.style.display = 'flex';
    this.previewSection.style.display = 'none';
    this.sidebarRight.style.display = 'none';
    this.renderHotspots();
  }

  hideLoading() {
    this.loading.style.display = 'none';
  }

  hideEmpty() {
    this.emptyState.style.display = 'none';
  }

  showError(message) {
    this.hideHtmlPreview(true);
    this.hideLoading();
    this.errorBox.style.display = 'flex';
    this.errorText.textContent = message;
    this.contentEmpty.style.display = 'none';
    this.previewSection.style.display = 'none';
    this.sidebarRight.style.display = 'none';
    this.renderHotspots();
  }

  getTypeLabel(type) {
    const labels = {
      design: 'UI 设计',
      prd: 'PRD 文档',
      project: '项目',
      invite: '邀请链接'
    };
    return labels[type] || type;
  }

  formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  // 解码 HTML 实体
  decodeHtmlEntities(str) {
    if (!str) return str;
    return str
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  showToast(message, type = '') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  // ===== 缩放和拖动功能 =====

  // 放大
  zoomIn() {
    if (this.zoomLevel < this.maxZoom) {
      this.zoomLevel = Math.min(this.zoomLevel + this.zoomStep, this.maxZoom);
      this.applyTransform();
      this.updateZoomLevel();
      this.saveCurrentDesignState();
    }
  }

  // 缩小
  zoomOut() {
    if (this.zoomLevel > this.minZoom) {
      this.zoomLevel = Math.max(this.zoomLevel - this.zoomStep, this.minZoom);
      this.applyTransform();
      this.updateZoomLevel();
      this.saveCurrentDesignState();
    }
  }

  // 重置缩放
  resetZoom(save = true) {
    this.zoomLevel = 1;
    this.panX = 0;
    this.panY = 0;
    this.applyTransform();
    this.updateZoomLevel();
    if (save) {
      this.saveCurrentDesignState();
    }
  }

  // 更新缩放级别显示
  updateZoomLevel() {
    if (this.zoomLevelEl) {
      this.zoomLevelEl.textContent = Math.round(this.zoomLevel * 100) + '%';
    }
  }

  // 应用变换
  applyTransform() {
    if (this.previewImage) {
      this.previewImage.style.transform = `scale(${this.zoomLevel}) translate(${this.panX}px, ${this.panY}px)`;
    }

    // 拖动时不渲染热点和图层，提升性能
    if (!this.isDragging) {
      this.scheduleHotspotRender();
      if (this.isLayerMode && this.layers.length > 0) {
        this.scheduleLayerRender();
      }
    }
  }

  // 调度图层渲染（防抖）
  scheduleLayerRender() {
    if (this.layerRenderTimer) {
      clearTimeout(this.layerRenderTimer);
    }
    this.layerRenderTimer = setTimeout(() => {
      this.layerRenderTimer = null;
      if (this.isLayerMode && !this.isDragging) {
        this.showLayerAnnotations();
      }
    }, 100);
  }

  // 鼠标滚轮处理
  handleWheel(e) {
    e.preventDefault();

    const delta = e.deltaY > 0 ? -this.zoomStep : this.zoomStep;
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoomLevel + delta));

    if (newZoom !== this.zoomLevel) {
      this.zoomLevel = newZoom;
      this.applyTransform();
      this.updateZoomLevel();

      // 防抖保存状态
      clearTimeout(this.zoomSaveTimer);
      this.zoomSaveTimer = setTimeout(() => this.saveCurrentDesignState(), 300);
    }
  }

  // 开始拖动
  startDrag(e) {
    if (this.isMarkMode || this.isNoteMode) return;
    if (e.button !== 0) return; // 只响应左键
    if (this.zoomLevel <= 1) return; // 只有放大时才允许拖动

    this.isDragging = true;
    this.dragStartX = e.clientX - this.panX * this.zoomLevel;
    this.dragStartY = e.clientY - this.panY * this.zoomLevel;
    this.previewContainer.classList.add('dragging');

    // 拖动时隐藏标注层以提升性能
    if (this.layerAnnotationLayer) {
      this.layerAnnotationLayer.style.display = 'none';
    }
    if (this.hotspotLayer) {
      this.hotspotLayer.style.display = 'none';
    }
  }

  // 执行拖动
  doDrag(e) {
    if (!this.isDragging) return;

    this.panX = (e.clientX - this.dragStartX) / this.zoomLevel;
    this.panY = (e.clientY - this.dragStartY) / this.zoomLevel;
    this.applyTransform();
  }

  // 结束拖动
  endDrag() {
    if (!this.isDragging) return;
    this.isDragging = false;
    if (this.previewContainer) {
      this.previewContainer.classList.remove('dragging');
    }
    // 拖动结束后保存状态
    this.saveCurrentDesignState();

    // 拖动结束后重新显示标注层
    if (this.hotspotLayer) {
      this.hotspotLayer.style.display = '';
    }
    if (this.isLayerMode && this.layerAnnotationLayer) {
      this.layerAnnotationLayer.style.display = 'block';
    }

    // 重新渲染
    this.scheduleHotspotRender();
    if (this.isLayerMode && this.layers.length > 0) {
      this.scheduleLayerRender();
    }
  }

  // ==================== 图层解析功能 ====================

  // 从 localStorage 加载图层缓存
  loadLayerCache() {
    try {
      const data = localStorage.getItem('lanhuLayerCache');
      if (data) {
        const parsed = JSON.parse(data);
        return new Map(Object.entries(parsed));
      }
    } catch (e) {
      console.error('加载图层缓存失败:', e);
    }
    return new Map();
  }

  // 保存图层缓存到 localStorage
  saveLayerCache() {
    try {
      const obj = Object.fromEntries(this.layerCache);
      localStorage.setItem('lanhuLayerCache', JSON.stringify(obj));
    } catch (e) {
      console.error('保存图层缓存失败:', e);
    }
  }

  // 切换图层显示模式
  async toggleLayerMode() {
    this.isLayerMode = !this.isLayerMode;

    if (this.layerModeBtn) {
      this.layerModeBtn.classList.toggle('active', this.isLayerMode);
      this.layerModeBtn.textContent = this.isLayerMode ? '隐藏图层' : '图层解析';
    }

    if (this.isLayerMode) {
      // 检查缓存中是否有当前设计图的图层数据
      const cachedData = this.layerCache.get(this.selectedDesignId);
      if (cachedData) {
        this.layers = cachedData.layers;
        this.canvasInfo = cachedData.canvasInfo;
      } else if (this.layers.length === 0 || this.currentLayerDesignId !== this.selectedDesignId) {
        // 如果没有缓存且当前没有加载数据，或者数据不是当前设计图的，则加载
        await this.loadLayers();
      }
      this.showLayerAnnotations();
    } else {
      this.hideLayerAnnotations();
    }
  }

  // 加载图层数据
  async loadLayers(forceReload = false) {
    if (!this.selectedDesignId || !this.currentTeamId || !this.currentProjectId) {
      this.log('请先选择设计图', 'error');
      return;
    }

    // 检查缓存
    if (!forceReload) {
      const cachedData = this.layerCache.get(this.selectedDesignId);
      if (cachedData) {
        this.layers = cachedData.layers;
        this.canvasInfo = cachedData.canvasInfo;
        this.currentLayerDesignId = this.selectedDesignId;
        this.log(`从缓存加载了 ${this.layers.length} 个图层`, 'success');
        return;
      }
    }

    // 显示加载状态
    this.showLayerLoading();

    try {
      const response = await fetch('/api/layers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': this.sessionId
        },
        body: JSON.stringify({
          teamId: this.currentTeamId,
          projectId: this.currentProjectId,
          imageId: this.selectedDesignId
        })
      });

      const data = await response.json();

      if (data.success) {
        this.layers = data.layers || [];
        this.canvasInfo = data.canvas || {};
        this.currentLayerDesignId = this.selectedDesignId;

        // 保存到缓存
        this.layerCache.set(this.selectedDesignId, {
          layers: this.layers,
          canvasInfo: this.canvasInfo
        });
        this.saveLayerCache(); // 持久化到 localStorage

        this.log(`加载了 ${this.layers.length} 个图层`, 'success');
      } else {
        this.log('加载图层数据失败: ' + (data.error || '未知错误'), 'error');
        this.layers = [];
      }
    } catch (e) {
      this.log('加载图层数据失败: ' + e.message, 'error');
      this.layers = [];
    } finally {
      this.hideLayerLoading();
    }
  }

  // 显示加载状态
  showLayerLoading() {
    if (!this.previewContainer) return;

    const loading = document.createElement('div');
    loading.className = 'layer-loading';
    loading.id = 'layerLoadingIndicator';
    loading.innerHTML = '<div class="spinner"></div><span>正在加载图层数据...</span>';
    this.previewContainer.appendChild(loading);
  }

  // 隐藏加载状态
  hideLayerLoading() {
    const loading = document.getElementById('layerLoadingIndicator');
    if (loading) {
      loading.remove();
    }
  }

  // 显示图层标注
  showLayerAnnotations() {
    if (!this.layerAnnotationLayer || this.layers.length === 0) return;

    this.layerAnnotationLayer.style.display = 'block';
    this.layerAnnotationLayer.innerHTML = '';

    // 获取图片的位置和尺寸
    const containerRect = this.previewContainer.getBoundingClientRect();
    const imageRect = this.previewImage.getBoundingClientRect();

    // 计算图片在实际容器中的位置（相对于容器左上角）
    const imageLeft = imageRect.left - containerRect.left;
    const imageTop = imageRect.top - containerRect.top;
    const imageWidth = imageRect.width;
    const imageHeight = imageRect.height;

    // 优先使用设计图的原始尺寸，因为图层数据中的坐标可能是基于设计图尺寸的
    const design = this.designs?.find(d => d.id === this.selectedDesignId);
    const canvasWidth = this.canvasInfo?.width || 0;
    const canvasHeight = this.canvasInfo?.height || 0;

    // 使用图片的自然尺寸作为参考，因为图层坐标可能是基于原始设计尺寸的
    const naturalWidth = this.previewImage.naturalWidth || design?.width || canvasWidth || 750;
    const naturalHeight = this.previewImage.naturalHeight || design?.height || canvasHeight || 1334;

    // 计算缩放比例（使用图片自然尺寸）
    const scaleX = imageWidth / naturalWidth;
    const scaleY = imageHeight / naturalHeight;

    let renderedCount = 0;

    // 渲染图层
    this.layers.forEach((layer, index) => {
      if (layer.depth > this.layerMaxDepth) return;
      // 跳过深度0的图层（通常是整个画布容器，坐标可能不准确）
      if (layer.depth === 0) return;
      if (layer.width < this.layerMinSize || layer.height < this.layerMinSize) return;
      if (!layer.visible) return;

      const left = imageLeft + layer.x * scaleX;
      const top = imageTop + layer.y * scaleY;
      const width = layer.width * scaleX;
      const height = layer.height * scaleY;

      // 跳过太小的图层
      if (width < 5 || height < 5) return;

      const layerEl = document.createElement('div');
      layerEl.className = `layer-annotation-item depth-${Math.min(layer.depth, 7)}`;
      layerEl.style.left = `${left}px`;
      layerEl.style.top = `${top}px`;
      layerEl.style.width = `${width}px`;
      layerEl.style.height = `${height}px`;

      // 添加标签
      const labelEl = document.createElement('div');
      labelEl.className = 'layer-annotation-label';
      labelEl.textContent = layer.name;
      layerEl.appendChild(labelEl);

      // 添加鼠标事件
      layerEl.addEventListener('mouseenter', (e) => this.showLayerTooltip(e, layer));
      layerEl.addEventListener('mouseleave', () => this.hideLayerTooltip());
      layerEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showLayerTooltip(e, layer, true);
      });

      this.layerAnnotationLayer.appendChild(layerEl);
      renderedCount++;
    });

    // 添加图层面板
    this.renderLayerControlPanel();
  }

  // 隐藏图层标注
  hideLayerAnnotations() {
    if (this.layerAnnotationLayer) {
      this.layerAnnotationLayer.style.display = 'none';
      this.layerAnnotationLayer.innerHTML = '';
    }
    this.hideLayerTooltip();

    // 移除控制面板
    const panel = document.getElementById('layerControlPanel');
    if (panel) panel.remove();
  }

  // 渲染图层控制面板
  renderLayerControlPanel() {
    // 移除已存在的面板
    const existingPanel = document.getElementById('layerControlPanel');
    if (existingPanel) existingPanel.remove();

    const panel = document.createElement('div');
    panel.id = 'layerControlPanel';
    panel.className = 'layer-control-panel';
    panel.innerHTML = `
      <div class="layer-control-header">
        <span class="layer-control-title">图层控制</span>
        <button class="layer-control-close" id="layerPanelClose">&times;</button>
      </div>
      <div class="layer-control-row">
        <span class="layer-control-label">最大深度</span>
        <input type="number" class="layer-control-input" id="layerMaxDepthInput" value="${this.layerMaxDepth}" min="0" max="20">
      </div>
      <div class="layer-control-row">
        <span class="layer-control-label">最小尺寸</span>
        <input type="number" class="layer-control-input" id="layerMinSizeInput" value="${this.layerMinSize}" min="0" max="100">
      </div>
      <div class="layer-depth-legend">
        <div class="layer-depth-item"><div class="layer-depth-color depth-0"></div>深度0</div>
        <div class="layer-depth-item"><div class="layer-depth-color depth-1"></div>深度1</div>
        <div class="layer-depth-item"><div class="layer-depth-color depth-2"></div>深度2</div>
        <div class="layer-depth-item"><div class="layer-depth-color depth-3"></div>深度3</div>
        <div class="layer-depth-item"><div class="layer-depth-color depth-4"></div>深度4</div>
        <div class="layer-depth-item"><div class="layer-depth-color depth-5"></div>深度5+</div>
      </div>
    `;

    this.previewContainer.appendChild(panel);

    // 绑定事件
    document.getElementById('layerPanelClose').addEventListener('click', () => {
      this.toggleLayerMode();
    });

    document.getElementById('layerMaxDepthInput').addEventListener('change', (e) => {
      this.layerMaxDepth = parseInt(e.target.value, 10) || 3;
      this.showLayerAnnotations();
    });

    document.getElementById('layerMinSizeInput').addEventListener('change', (e) => {
      this.layerMinSize = parseInt(e.target.value, 10) || 10;
      this.showLayerAnnotations();
    });
  }

  // 显示图层提示
  showLayerTooltip(e, layer, pin = false) {
    this.hideLayerTooltip();

    const tooltip = document.createElement('div');
    tooltip.className = 'layer-tooltip';
    tooltip.id = 'layerTooltip';

    let stylesHtml = '';
    if (layer.styles) {
      const styles = [];
      if (layer.styles.background) styles.push(`背景: ${layer.styles.background}`);
      if (layer.styles.color) styles.push(`颜色: ${layer.styles.color}`);
      if (layer.styles.fontSize) styles.push(`字号: ${layer.styles.fontSize}px`);
      if (layer.styles.fontFamily) styles.push(`字体: ${layer.styles.fontFamily}`);
      if (layer.styles.borderWidth) styles.push(`边框: ${layer.styles.borderWidth}px`);
      if (layer.styles.borderRadius) styles.push(`圆角: ${layer.styles.borderRadius}px`);
      stylesHtml = styles.map(s => `<div class="layer-tooltip-row"><span class="layer-tooltip-label"></span><span class="layer-tooltip-value">${s}</span></div>`).join('');
    }

    const tooltipText = layer.textPreview || (layer.text ? String(layer.text).slice(0, 120) : '');

    tooltip.innerHTML = `
      <div class="layer-tooltip-header">${layer.name}</div>
      <div class="layer-tooltip-row">
        <span class="layer-tooltip-label">类型</span>
        <span class="layer-tooltip-value">${layer.type}</span>
      </div>
      <div class="layer-tooltip-row">
        <span class="layer-tooltip-label">位置</span>
        <span class="layer-tooltip-value">(${layer.x}, ${layer.y})</span>
      </div>
      <div class="layer-tooltip-row">
        <span class="layer-tooltip-label">尺寸</span>
        <span class="layer-tooltip-value">${layer.width} × ${layer.height}</span>
      </div>
      ${tooltipText ? `<div class="layer-tooltip-row"><span class="layer-tooltip-label">文本</span><span class="layer-tooltip-value">"${tooltipText}"</span></div>` : ''}
      ${stylesHtml}
      <div class="layer-tooltip-row">
        <span class="layer-tooltip-label">路径</span>
        <span class="layer-tooltip-value">${layer.path}</span>
      </div>
    `;

    document.body.appendChild(tooltip);

    // 计算位置
    const rect = tooltip.getBoundingClientRect();
    let left = e.clientX + 15;
    let top = e.clientY + 15;

    // 防止超出屏幕
    if (left + rect.width > window.innerWidth) {
      left = e.clientX - rect.width - 15;
    }
    if (top + rect.height > window.innerHeight) {
      top = e.clientY - rect.height - 15;
    }

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  // 隐藏图层提示
  hideLayerTooltip() {
    const tooltip = document.getElementById('layerTooltip');
    if (tooltip) {
      tooltip.remove();
    }
  }
}

// 初始化
const app = new LanhuViewer();
