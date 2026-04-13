// 蓝湖链接解析器 - 前端逻辑

const GENERATED_FRAMEWORK_OPTIONS = [
  { value: 'html', label: 'HTML' },
  { value: 'vue', label: 'Vue' },
  { value: 'react', label: 'React' },
  { value: 'wxmp', label: '微信小程序' },
  { value: 'uni-app', label: 'uni-app' }
];

const GENERATED_FRAMEWORK_LABELS = GENERATED_FRAMEWORK_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});

const GENERATED_FRAMEWORK_ALIASES = {
  h5: 'html',
  vue2: 'vue',
  weapp: 'wxmp',
  mini_program: 'wxmp',
  miniprogram: 'wxmp',
  miniapp: 'wxmp',
  uniapp: 'uni-app'
};

class LanhuViewer {
  constructor() {
    this.defaultSessionId = 'shared_lanhu_session';
    // 刷新后优先复用本地保存的 session-id，避免丢失已登录状态
    this.sessionId = this.loadSessionId();
    this.appVersion = '2026-04-09-generated-code-progress-v4';
    this.migrateCacheVersion();
    this.isLoggedIn = false;
    this.logs = [];
    this.history = this.loadHistory();
    this.cache = this.loadCache();
    this.generatedCodeCache = this.loadGeneratedCodeCache();
    this.generatedCodeJobCache = this.loadGeneratedCodeJobCache();
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
    this.generatedPreviewHtml = '';
    this.generatedCodeFiles = [];
    this.generatedCodeFileName = '';
    this.generatedCodeFramework = '';
    this.selectedGeneratedFramework = this.loadGeneratedFrameworkPreference();
    this.isCodePanelVisible = false;
    this.isGeneratingHtmlPreview = false;
    this.generatedCodeJobId = '';
    this.generatedCodePollTimer = null;
    this.generatedCodePollResolve = null;
    this.generatedCodePollToken = 0;
    this.generatedCodeTask = this.createInitialGeneratedCodeTaskState();
    this.isAnnotationPreview = false;
    this.annotationObjectUrl = '';
    this.panzoom = null;
    this.isPanzoomBound = false;
    this.isPanzoomInteracting = false;
    this.previewRefreshTimer = null;
    this.currentPreviewOriginalUrl = '';
    this.currentPreviewSourceUrl = '';
    this.currentPreviewRequestWidth = 0;
    this.generatedPreviewFrameStage = null;
    this.generatedPreviewFrameWrap = null;
    this.generatedPreviewFitTimer = null;
    this.generatedPreviewFitRaf = 0;
    this.generatedPreviewLoadTimers = [];
    this.generatedPreviewDiagnostics = this.createInitialGeneratedPreviewDiagnostics();
    this.generatedPreviewRepairState = this.createInitialGeneratedPreviewRepairState();

    this.initElements();
    window.__lanhuViewerReceiveGeneratedPreviewDiagnostics = (payload) => this.handleGeneratedPreviewDiagnostics(payload);
    this.initPanzoom();
    this.initEvents();
    this.updateAnnotationPreviewButton();
    this.updateGenerateHtmlButtonState();
    this.renderGeneratedCodeTask();
    this.updateGeneratedCodeMeta();
    this.renderGeneratedPreviewDiagnostics();
    this.renderHistory();
    this.notifyParentReady();
    this.checkSession(); // 异步检查，完成后会调用 restorePageState
  }

  createInitialGeneratedCodeTaskState() {
    return {
      id: '',
      status: 'idle',
      stepKey: 'idle',
      stepLabel: '等待开始',
      currentStep: 0,
      totalSteps: 6,
      progressPercent: 0,
      currentAction: '点击下方按钮开始生成。',
      logs: [],
      errorMessage: '',
      createdAt: 0,
      updatedAt: 0
    };
  }

  createInitialGeneratedPreviewDiagnostics() {
    return {
      token: '',
      status: 'idle',
      updatedAt: 0,
      trigger: '',
      report: null
    };
  }

  createInitialGeneratedPreviewRepairState() {
    return {
      mode: 'dds',
      reason: '',
      missingModules: [],
      overlayModules: [],
      updatedAt: 0
    };
  }

  getGeneratedPreviewRepairMode() {
    const mode = String(this.generatedPreviewRepairState?.mode || '').trim();
    return ['module', 'layer'].includes(mode) ? mode : 'dds';
  }

  getGeneratedPreviewSourceDesign() {
    const preferredDesignId = String(this.generatedHtmlDesignId || this.selectedDesignId || '').trim();
    if (!preferredDesignId || !Array.isArray(this.designs)) {
      return this.getSelectedDesign();
    }
    return this.designs.find((item) => item.id === preferredDesignId) || this.getSelectedDesign();
  }

  getGeneratedPreviewLayerContext(design = this.getGeneratedPreviewSourceDesign()) {
    if (!design?.id) return null;

    let layers = [];
    let canvasInfo = null;

    if (this.currentLayerDesignId === design.id && Array.isArray(this.layers) && this.layers.length > 0) {
      layers = this.layers;
      canvasInfo = this.canvasInfo;
    } else {
      const cachedData = this.layerCache.get(design.id);
      if (cachedData && Array.isArray(cachedData.layers) && cachedData.layers.length > 0) {
        layers = cachedData.layers;
        canvasInfo = cachedData.canvasInfo || null;
      }
    }

    if (!layers.length) return null;

    let slices = [];
    if (this.selectedDesignId === design.id && Array.isArray(this.currentSlices) && this.currentSlices.length > 0) {
      slices = this.currentSlices;
    } else {
      const cachedSlices = this.getSliceCache(design.id);
      if (cachedSlices && Array.isArray(cachedSlices.slices) && cachedSlices.slices.length > 0) {
        slices = cachedSlices.slices;
      }
    }

    return {
      design,
      layers,
      canvasInfo,
      slices
    };
  }

  getGeneratedPreviewFrameMetrics() {
    const doc = this.htmlPreviewFrame?.contentDocument;
    const frameWindow = doc?.defaultView;
    const root = doc?.querySelector('.page') || doc?.body?.firstElementChild || doc?.body;
    if (!frameWindow || !(root instanceof frameWindow.HTMLElement)) {
      return null;
    }

    const rootRect = root.getBoundingClientRect();
    return {
      doc,
      frameWindow,
      root,
      rootRect,
      width: Math.max(
        1,
        Math.round(rootRect.width || root.offsetWidth || root.clientWidth || root.scrollWidth || 1)
      ),
      height: Math.max(
        1,
        Math.round(rootRect.height || root.offsetHeight || root.clientHeight || root.scrollHeight || 1)
      )
    };
  }

  isGenericLayerGroupName(value = '') {
    return /^(group|frame|rectangle|union|component|image)\b/i.test(String(value || '').trim()) ||
      /^编组\b/i.test(String(value || '').trim());
  }

  getLayerModulePrefix(path = '') {
    const parts = String(path || '').trim().split('/').filter(Boolean);
    if (parts.length <= 2) {
      return parts.join('/');
    }

    const secondPart = parts[1] || '';
    const prefixDepth = this.isGenericLayerGroupName(secondPart) ? Math.min(parts.length, 3) : 2;
    return parts.slice(0, prefixDepth).join('/');
  }

  rectsOverlap(a, b) {
    if (!a || !b) return false;
    const left = Math.max(Number(a.left) || 0, Number(b.left) || 0);
    const top = Math.max(Number(a.top) || 0, Number(b.top) || 0);
    const right = Math.min(
      (Number(a.left) || 0) + (Number(a.width) || 0),
      (Number(b.left) || 0) + (Number(b.width) || 0)
    );
    const bottom = Math.min(
      (Number(a.top) || 0) + (Number(a.height) || 0),
      (Number(b.top) || 0) + (Number(b.height) || 0)
    );
    return right > left && bottom > top;
  }

  extractModuleFromLayers(layers, matcher = {}) {
    if (!Array.isArray(layers) || layers.length === 0) {
      return { layers: [], bounds: null };
    }

    const pathPrefix = String(matcher.pathPrefix || '').trim();
    const boundsRect = matcher.boundsRect && typeof matcher.boundsRect === 'object'
      ? matcher.boundsRect
      : null;

    const matchedLayers = layers.filter((layer) => {
      if (!layer || layer.visible === false) return false;
      const width = Number(layer.width) || 0;
      const height = Number(layer.height) || 0;
      if (width <= 1 || height <= 1) return false;

      const matchesPath = pathPrefix
        ? (() => {
            const layerPath = String(layer.path || '').trim();
            return layerPath === pathPrefix || layerPath.startsWith(`${pathPrefix}/`);
          })()
        : true;

      const matchesBounds = boundsRect
        ? this.rectsOverlap(
            {
              left: Number(layer.x) || 0,
              top: Number(layer.y) || 0,
              width,
              height
            },
            boundsRect
          )
        : true;

      return matchesPath && matchesBounds;
    });

    if (!matchedLayers.length) {
      return { layers: [], bounds: null };
    }

    const minX = Math.min(...matchedLayers.map((layer) => Number(layer.x) || 0));
    const minY = Math.min(...matchedLayers.map((layer) => Number(layer.y) || 0));
    const maxRight = Math.max(...matchedLayers.map((layer) => (Number(layer.x) || 0) + (Number(layer.width) || 0)));
    const maxBottom = Math.max(...matchedLayers.map((layer) => (Number(layer.y) || 0) + (Number(layer.height) || 0)));

    return {
      layers: matchedLayers,
      bounds: {
        left: minX,
        top: minY,
        width: Math.max(1, maxRight - minX),
        height: Math.max(1, maxBottom - minY)
      }
    };
  }

  buildRenderableModuleLayers(
    moduleLayers,
    {
      slices = [],
      targetWidth = 0,
      targetHeight = 0,
      useDirectLayerImages = false
    } = {}
  ) {
    const renderableLayers = this.getRenderableLayersForHtml(
      Array.isArray(moduleLayers) ? moduleLayers : [],
      Array.isArray(slices) ? slices : [],
      { useDirectLayerImages }
    );

    return this.normalizeLayersForCanvas(
      renderableLayers,
      Math.max(0, Number(targetWidth) || 0),
      Math.max(0, Number(targetHeight) || 0)
    );
  }

  getGeneratedCodePrimaryLine(message = '') {
    return String(message || '')
      .split(/\r?\n/)
      .map((line) => String(line || '').trim())
      .find(Boolean) || '';
  }

  sanitizeGeneratedCodeStatusMessage(message = '', { trimPrefix = false } = {}) {
    const primaryLine = this.getGeneratedCodePrimaryLine(message);
    if (!primaryLine) {
      return '';
    }

    let normalized = primaryLine
      .replace(/^Uncaught\s*\(in promise\)\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (trimPrefix) {
      normalized = normalized
        .replace(/^蓝湖代码生成失败[:：]\s*/i, '')
        .replace(/^读取蓝湖代码失败[:：]\s*/i, '')
        .replace(/^获取蓝湖代码生成进度失败[:：]\s*/i, '')
        .trim();
    }

    return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
  }

  isGenericGeneratedCodeErrorMessage(message) {
    const normalized = this.sanitizeGeneratedCodeStatusMessage(message, { trimPrefix: true });
    if (!normalized) return true;

    return [
      '读取蓝湖代码失败',
      '获取蓝湖代码生成进度失败',
      '未获取到蓝湖代码生成状态',
      'Failed to fetch'
    ].includes(normalized);
  }

  buildGeneratedCodeHttpErrorMessage(endpoint, response, payload, rawText, fallbackMessage) {
    const payloadMessage = payload?.message || payload?.error || payload?.job?.errorMessage || '';
    if (payloadMessage) {
      return this.sanitizeGeneratedCodeStatusMessage(payloadMessage, { trimPrefix: true }) || payloadMessage;
    }

    const text = String(rawText || '').trim();
    if (text) {
      if (/^\s*</.test(text)) {
        if (response?.status === 404) {
          return `${fallbackMessage}：接口 ${endpoint} 不存在，服务端可能还没重启`;
        }
        return `${fallbackMessage}：服务端返回了非 JSON 响应 (HTTP ${response?.status || '未知'})`;
      }
      return `${fallbackMessage}：${text.slice(0, 180)}`;
    }

    if (response?.status === 404) {
      return `${fallbackMessage}：接口 ${endpoint} 不存在，服务端可能还没重启`;
    }

    const status = response?.status ? `HTTP ${response.status}` : '未知状态';
    const statusText = response?.statusText ? ` ${response.statusText}` : '';
    return `${fallbackMessage}：${status}${statusText}`;
  }

  async readGeneratedCodeApiResponse(response, endpoint, fallbackMessage) {
    const rawText = await response.text().catch(() => '');
    let payload = {};

    if (rawText) {
      try {
        payload = JSON.parse(rawText);
      } catch (e) {
        payload = {};
      }
    }

    return {
      payload,
      rawText,
      errorMessage: this.buildGeneratedCodeHttpErrorMessage(
        endpoint,
        response,
        payload,
        rawText,
        fallbackMessage
      )
    };
  }

  getGeneratedCodeDisplayErrorMessage(error, task = this.generatedCodeTask) {
    const directMessage = this.sanitizeGeneratedCodeStatusMessage(error?.message || '', { trimPrefix: true });
    if (!this.isGenericGeneratedCodeErrorMessage(directMessage)) {
      return directMessage;
    }

    const taskLogs = Array.isArray(task?.logs) ? task.logs : [];
    const lastUsefulLog = [...taskLogs]
      .reverse()
      .find((log) => log?.message && !this.isGenericGeneratedCodeErrorMessage(log.message) && !/^蓝湖代码生成失败[:：]?\s*$/.test(log.message));

    if (lastUsefulLog?.message) {
      const lastLogMessage = this.sanitizeGeneratedCodeStatusMessage(lastUsefulLog.message);
      return `${directMessage || '读取蓝湖代码失败'}，最后日志：${lastLogMessage}`;
    }

    return directMessage || '读取蓝湖代码失败';
  }

  migrateCacheVersion() {
    try {
      const versionKey = 'lanhuViewerVersion';
      const currentVersion = localStorage.getItem(versionKey);
      if (currentVersion === this.appVersion) return;

      localStorage.removeItem('lanhuCache');
      localStorage.removeItem('lanhuGeneratedCodeCache');
      localStorage.removeItem('lanhuGeneratedCodeJobCache');
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

  shouldHideInputSection() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return Boolean(urlParams.get('url'));
    } catch (e) {
      return false;
    }
  }

  syncInputSectionVisibility() {
    if (!this.inputSection) return;
    this.inputSection.hidden = this.shouldHideInputSection();
  }

  getCurrentLanhuUrl() {
    const inputUrl = this.urlInput?.value?.trim();
    if (inputUrl) return inputUrl;

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlFromParams = urlParams.get('url');
      if (urlFromParams) return urlFromParams.trim();
    } catch (e) {}

    return this.currentPageState?.url || '';
  }

  getDesignLink(design) {
    const designId = String(design?.id || '').trim();
    const teamId = String(this.currentTeamId || '').trim();
    const projectId = String(this.currentProjectId || '').trim();

    if (!designId || !teamId || !projectId) return '';

    const params = new URLSearchParams({
      pid: projectId,
      tid: teamId,
      see: 'all',
      project_id: projectId,
      image_id: designId,
      fromEditor: 'true',
      type: 'image',
    });

    return `https://lanhuapp.com/web/#/item/project/detailDetach?${params.toString()}`;
  }

  updateCopyLinkButtonState() {
    const hasUrl = Boolean(this.getCurrentLanhuUrl());
    if (this.reparseDesignBtn) {
      this.reparseDesignBtn.disabled = !hasUrl;
    }
    if (this.copyLinkBtn) {
      this.copyLinkBtn.disabled = !hasUrl;
    }
  }

  getSelectedDesignLink() {
    if (!this.selectedDesignId || !Array.isArray(this.designs)) return '';
    const design = this.designs.find((item) => item.id === this.selectedDesignId);
    return this.getDesignLink(design);
  }

  updateSelectedDesignCopyButtonState() {
    if (!this.copyDesignLinkBtn) return;
    this.copyDesignLinkBtn.disabled = !this.getSelectedDesignLink();
  }

  handleGeneratedFrameworkChange() {
    const nextFramework = this.getSelectedGeneratedFramework();
    const previousFramework = this.normalizeGeneratedFrameworkValue(this.selectedGeneratedFramework || 'html');
    this.selectedGeneratedFramework = nextFramework;
    this.saveGeneratedFrameworkPreference();
    this.syncGeneratedFrameworkSelect();

    const design = this.getSelectedDesign();
    const frameworkChanged = previousFramework !== nextFramework;
    if (!frameworkChanged) {
      this.updateGenerateHtmlButtonState();
      this.updateGeneratedCodeMeta();
      return;
    }

    const activeFramework = this.normalizeGeneratedFrameworkValue(this.generatedCodeFramework || previousFramework);
    const shouldResetCurrentWorkspace = activeFramework !== nextFramework && (
      Boolean(this.generatedCodeJobId) ||
      this.isGeneratingHtmlPreview ||
      Boolean(this.generatedHtmlDesignId) ||
      (Array.isArray(this.generatedCodeFiles) && this.generatedCodeFiles.length > 0) ||
      String(this.generatedCodeTask?.status || 'idle').trim() !== 'idle'
    );

    if (shouldResetCurrentWorkspace) {
      this.resetGeneratedCodeWorkspace(nextFramework);
    }

    if (design) {
      const restoredGeneratedCode = this.restoreGeneratedCodeCache(design, {
        autoShow: false,
        framework: nextFramework
      });
      if (!restoredGeneratedCode) {
        this.restoreGeneratedCodeJob(design, {
          autoShow: false,
          silent: true,
          framework: nextFramework
        });
      }
    }

    this.updateGenerateHtmlButtonState();
    this.updateGeneratedCodeMeta();
  }

  updateGenerateHtmlButtonState() {
    if (!this.generateHtmlBtn) return;

    const design = this.getSelectedDesign();
    const codeStatus = this.getDesignCodeStatus(design);
    const targetFramework = this.getSelectedGeneratedFramework();
    const frameworkLabel = this.getGeneratedFrameworkLabel(targetFramework);
    const resumableJob = design ? this.getGeneratedCodeJobCache(design, targetFramework) : null;
    const hasCachedCode = Boolean(design) && (
      this.hasGeneratedCodeForCurrentDesign() ||
      Boolean(this.getGeneratedCodeCache(design, targetFramework))
    );
    const hasPendingJob = Boolean(
      resumableJob &&
      resumableJob.task?.status !== 'error' &&
      !hasCachedCode
    );
    const hasFailedJob = Boolean(
      resumableJob &&
      resumableJob.task?.status === 'error' &&
      !hasCachedCode
    );

    this.generateHtmlBtn.disabled = this.isGeneratingHtmlPreview || !design;
    this.generateHtmlBtn.classList.toggle('suspect-unavailable', Boolean(design) && codeStatus.code === 'unavailable');

    if (!design) {
      this.generateHtmlBtn.title = `读取蓝湖 ${frameworkLabel} 代码`;
      return;
    }

    if (hasCachedCode) {
      this.generateHtmlBtn.title = `当前设计图已有 ${frameworkLabel} 缓存代码，点击直接展开`;
      return;
    }

    if (hasPendingJob) {
      this.generateHtmlBtn.title = this.isGeneratingHtmlPreview
        ? `当前设计图 ${frameworkLabel} 代码生成中，正在同步最新进度`
        : `当前设计图有进行中的 ${frameworkLabel} 代码任务，切回后会自动恢复进度`;
      return;
    }

    if (hasFailedJob) {
      this.generateHtmlBtn.title = `当前设计图保留了上次 ${frameworkLabel} 失败信息，可重新读取`;
      return;
    }

    if (codeStatus.code === 'available') {
      this.generateHtmlBtn.title = `读取蓝湖 ${frameworkLabel} 代码（当前设计图已有代码数据）`;
      return;
    }

    if (codeStatus.code === 'unavailable') {
      this.generateHtmlBtn.title = `当前设计图标记为无代码，点击后会对 ${frameworkLabel} 做一次最终校验`;
      return;
    }

    this.generateHtmlBtn.title = `${frameworkLabel} 代码状态待校验，点击后开始读取`;
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

  loadGeneratedFrameworkPreference() {
    try {
      const storedValue = localStorage.getItem('lanhuGeneratedFramework');
      return this.normalizeGeneratedFrameworkValue(storedValue);
    } catch (e) {
      return 'html';
    }
  }

  saveGeneratedFrameworkPreference() {
    try {
      localStorage.setItem('lanhuGeneratedFramework', this.getSelectedGeneratedFramework());
    } catch (e) {}
  }

  getSelectedGeneratedFramework() {
    return this.normalizeGeneratedFrameworkValue(
      this.generatedFrameworkSelect?.value ||
      this.selectedGeneratedFramework ||
      'html'
    );
  }

  getGeneratedFrameworkLabel(framework = this.getSelectedGeneratedFramework()) {
    const normalizedValue = this.normalizeGeneratedFrameworkValue(framework);
    return GENERATED_FRAMEWORK_LABELS[normalizedValue] || GENERATED_FRAMEWORK_LABELS.html;
  }

  normalizeGeneratedFrameworkValue(framework = 'html') {
    const rawValue = String(framework || 'html').trim();
    const lowerCasedValue = rawValue.toLowerCase();
    const aliasValue = GENERATED_FRAMEWORK_ALIASES[rawValue] || GENERATED_FRAMEWORK_ALIASES[lowerCasedValue];
    const normalizedValue = aliasValue || lowerCasedValue || 'html';
    return GENERATED_FRAMEWORK_LABELS[normalizedValue] ? normalizedValue : 'html';
  }

  syncGeneratedFrameworkSelect() {
    if (!this.generatedFrameworkSelect) return;
    const framework = this.getSelectedGeneratedFramework();
    if (this.generatedFrameworkSelect.value !== framework) {
      this.generatedFrameworkSelect.value = framework;
    }
    this.generatedFrameworkSelect.title = `当前代码框架: ${this.getGeneratedFrameworkLabel(framework)}`;
  }

  loadGeneratedCodeCache() {
    try {
      const data = localStorage.getItem('lanhuGeneratedCodeCache');
      if (!data) return {};

      const parsed = JSON.parse(data);
      const cache = parsed && typeof parsed === 'object' ? parsed : {};
      const { cache: nextCache, changed } = this.pruneGeneratedCodeCacheEntries(cache);

      if (changed) {
        localStorage.setItem('lanhuGeneratedCodeCache', JSON.stringify(nextCache));
      }

      return nextCache;
    } catch (e) {
      return {};
    }
  }

  loadGeneratedCodeJobCache() {
    try {
      const data = localStorage.getItem('lanhuGeneratedCodeJobCache');
      if (!data) return {};

      const parsed = JSON.parse(data);
      const cache = parsed && typeof parsed === 'object' ? parsed : {};
      const { cache: nextCache, changed } = this.pruneGeneratedCodeJobEntries(cache);

      if (changed) {
        localStorage.setItem('lanhuGeneratedCodeJobCache', JSON.stringify(nextCache));
      }

      return nextCache;
    } catch (e) {
      return {};
    }
  }

  pruneGeneratedCodeCacheEntries(cache = this.generatedCodeCache) {
    const nextCache = cache && typeof cache === 'object' ? { ...cache } : {};
    const now = Date.now();
    let changed = false;

    Object.keys(nextCache).forEach((key) => {
      const item = nextCache[key];
      const payload = item?.data;
      const files = Array.isArray(payload?.files) ? payload.files : [];

      if (
        !item ||
        item.expire < now ||
        !payload ||
        typeof payload.previewHtml !== 'string' ||
        !files.length
      ) {
        delete nextCache[key];
        changed = true;
      }
    });

    const maxEntries = 12;
    const keysByRecency = Object.keys(nextCache).sort(
      (a, b) => Number(nextCache[b]?.updatedAt || 0) - Number(nextCache[a]?.updatedAt || 0)
    );

    keysByRecency.slice(maxEntries).forEach((key) => {
      delete nextCache[key];
      changed = true;
    });

    return { cache: nextCache, changed };
  }

  pruneGeneratedCodeJobEntries(cache = this.generatedCodeJobCache) {
    const nextCache = cache && typeof cache === 'object' ? { ...cache } : {};
    const now = Date.now();
    let changed = false;

    Object.keys(nextCache).forEach((key) => {
      const item = nextCache[key];
      const task = item?.task;
      const logs = Array.isArray(task?.logs) ? task.logs : [];

      if (
        !item ||
        item.expire < now ||
        !item.jobId ||
        !task ||
        typeof task !== 'object' ||
        !String(task.status || '').trim() ||
        !Array.isArray(logs)
      ) {
        delete nextCache[key];
        changed = true;
      }
    });

    const maxEntries = 18;
    const keysByRecency = Object.keys(nextCache).sort(
      (a, b) => Number(nextCache[b]?.updatedAt || 0) - Number(nextCache[a]?.updatedAt || 0)
    );

    keysByRecency.slice(maxEntries).forEach((key) => {
      delete nextCache[key];
      changed = true;
    });

    return { cache: nextCache, changed };
  }

  saveGeneratedCodeCache() {
    try {
      const { cache } = this.pruneGeneratedCodeCacheEntries(this.generatedCodeCache);
      this.generatedCodeCache = cache;
      localStorage.setItem('lanhuGeneratedCodeCache', JSON.stringify(this.generatedCodeCache));
      return true;
    } catch (e) {
      const keysByAge = Object.keys(this.generatedCodeCache).sort(
        (a, b) => Number(this.generatedCodeCache[a]?.updatedAt || 0) - Number(this.generatedCodeCache[b]?.updatedAt || 0)
      );

      while (keysByAge.length > 0) {
        delete this.generatedCodeCache[keysByAge.shift()];
        try {
          localStorage.setItem('lanhuGeneratedCodeCache', JSON.stringify(this.generatedCodeCache));
          return true;
        } catch (saveError) {}
      }

      return false;
    }
  }

  saveGeneratedCodeJobCache() {
    try {
      const { cache } = this.pruneGeneratedCodeJobEntries(this.generatedCodeJobCache);
      this.generatedCodeJobCache = cache;
      localStorage.setItem('lanhuGeneratedCodeJobCache', JSON.stringify(this.generatedCodeJobCache));
      return true;
    } catch (e) {
      const keysByAge = Object.keys(this.generatedCodeJobCache).sort(
        (a, b) => Number(this.generatedCodeJobCache[a]?.updatedAt || 0) - Number(this.generatedCodeJobCache[b]?.updatedAt || 0)
      );

      while (keysByAge.length > 0) {
        delete this.generatedCodeJobCache[keysByAge.shift()];
        try {
          localStorage.setItem('lanhuGeneratedCodeJobCache', JSON.stringify(this.generatedCodeJobCache));
          return true;
        } catch (saveError) {}
      }

      return false;
    }
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

  resolveDesignEntity(designOrId = null) {
    if (designOrId && typeof designOrId === 'object') {
      return designOrId;
    }

    const designId = String(designOrId || this.selectedDesignId || '').trim();
    if (!designId || !Array.isArray(this.designs)) return null;

    return this.designs.find((item) => item.id === designId) || null;
  }

  getGeneratedCodeCacheVersion(design = null) {
    const resolvedDesign = this.resolveDesignEntity(design);
    return String(resolvedDesign?.latestVersion || resolvedDesign?.updateTime || '').trim() || 'noversion';
  }

  getGeneratedCodeCacheKey(design = null, framework = 'html') {
    const resolvedDesign = this.resolveDesignEntity(design);
    const designId = String(resolvedDesign?.id || '').trim();
    const teamId = String(this.currentTeamId || '').trim();
    const projectId = String(this.currentProjectId || '').trim();
    const targetFramework = this.normalizeGeneratedFrameworkValue(framework);
    const latestVersion = this.getGeneratedCodeCacheVersion(resolvedDesign);

    if (!designId || !teamId || !projectId) return '';

    return [teamId, projectId, designId, latestVersion, targetFramework].join(':');
  }

  getGeneratedCodeCache(design = null, framework = 'html') {
    const cacheKey = this.getGeneratedCodeCacheKey(design, framework);
    if (!cacheKey) return null;

    const item = this.generatedCodeCache[cacheKey];
    if (!item) return null;

    if (item.expire < Date.now()) {
      delete this.generatedCodeCache[cacheKey];
      this.saveGeneratedCodeCache();
      return null;
    }

    const payload = item.data;
    if (
      !payload ||
      typeof payload.previewHtml !== 'string' ||
      !Array.isArray(payload.files) ||
      payload.files.length === 0
    ) {
      delete this.generatedCodeCache[cacheKey];
      this.saveGeneratedCodeCache();
      return null;
    }

    return payload;
  }

  normalizeGeneratedCodeTaskState(task = null) {
    const baseTask = this.createInitialGeneratedCodeTaskState();
    const logs = Array.isArray(task?.logs)
      ? task.logs
        .filter((log) => log && log.message)
        .slice(-12)
        .map((log) => ({
          time: String(log.time || '').trim() || new Date().toLocaleTimeString(),
          message: this.sanitizeGeneratedCodeStatusMessage(log.message || ''),
          type: String(log.type || 'info').trim() || 'info'
        }))
      : [];

    return {
      ...baseTask,
      ...task,
      id: String(task?.id || baseTask.id || '').trim(),
      status: String(task?.status || baseTask.status || 'idle').trim() || 'idle',
      stepKey: String(task?.stepKey || baseTask.stepKey || 'idle').trim() || 'idle',
      stepLabel: String(task?.stepLabel || baseTask.stepLabel || '等待开始').trim() || '等待开始',
      currentStep: Math.max(0, Number(task?.currentStep) || 0),
      totalSteps: Math.max(1, Number(task?.totalSteps) || baseTask.totalSteps || 6),
      progressPercent: Math.max(0, Math.min(100, Number(task?.progressPercent) || 0)),
      currentAction: this.sanitizeGeneratedCodeStatusMessage(task?.currentAction || '') || baseTask.currentAction,
      errorMessage: this.sanitizeGeneratedCodeStatusMessage(task?.errorMessage || '', { trimPrefix: true }),
      createdAt: Number(task?.createdAt) || Date.now(),
      updatedAt: Number(task?.updatedAt) || Date.now(),
      logs
    };
  }

  createGeneratedCodeTaskLog(message, type = 'info') {
    return {
      time: new Date().toLocaleTimeString(),
      message: this.sanitizeGeneratedCodeStatusMessage(message || ''),
      type: String(type || 'info').trim() || 'info'
    };
  }

  appendGeneratedCodeTaskLog(task = null, message = '', type = 'info') {
    const entry = this.createGeneratedCodeTaskLog(message, type);
    if (!entry.message) {
      return this.normalizeGeneratedCodeTaskState(task);
    }

    const currentTask = this.normalizeGeneratedCodeTaskState(task);
    return this.normalizeGeneratedCodeTaskState({
      ...currentTask,
      updatedAt: Date.now(),
      logs: [...currentTask.logs, entry].slice(-12)
    });
  }

  createGeneratedCodeJobCacheEntry(job = null, design = null, framework = 'html') {
    const resolvedDesign = this.resolveDesignEntity(design);
    const normalizedTask = this.normalizeGeneratedCodeTaskState(job);
    const status = normalizedTask.status || 'queued';
    const now = Date.now();
    const ttlMs = status === 'error'
      ? 6 * 60 * 60 * 1000
      : 45 * 60 * 1000;

    return {
      jobId: String(job?.id || normalizedTask.id || '').trim(),
      designId: String(resolvedDesign?.id || this.selectedDesignId || '').trim(),
      latestVersion: this.getGeneratedCodeCacheVersion(resolvedDesign),
      framework: this.normalizeGeneratedFrameworkValue(framework || job?.framework || 'html'),
      status,
      task: normalizedTask,
      expire: now + ttlMs,
      updatedAt: Number(normalizedTask.updatedAt) || now
    };
  }

  getGeneratedCodeJobCache(design = null, framework = 'html') {
    const cacheKey = this.getGeneratedCodeCacheKey(design, framework);
    if (!cacheKey) return null;

    const item = this.generatedCodeJobCache[cacheKey];
    if (!item) return null;

    if (item.expire < Date.now()) {
      delete this.generatedCodeJobCache[cacheKey];
      this.saveGeneratedCodeJobCache();
      return null;
    }

    if (!item.jobId || !item.task) {
      delete this.generatedCodeJobCache[cacheKey];
      this.saveGeneratedCodeJobCache();
      return null;
    }

    return {
      ...item,
      task: this.normalizeGeneratedCodeTaskState(item.task)
    };
  }

  setGeneratedCodeJobCache(job = null, design = null, framework = 'html') {
    const resolvedDesign = this.resolveDesignEntity(design);
    const cacheKey = this.getGeneratedCodeCacheKey(resolvedDesign, framework);
    const entry = this.createGeneratedCodeJobCacheEntry(job, resolvedDesign, framework);

    if (!cacheKey || !entry.jobId || !entry.designId) {
      return false;
    }

    this.generatedCodeJobCache[cacheKey] = entry;
    return this.saveGeneratedCodeJobCache();
  }

  clearGeneratedCodeJobCacheEntry(design = null, framework = 'html') {
    const cacheKey = this.getGeneratedCodeCacheKey(design, framework);
    if (!cacheKey || !this.generatedCodeJobCache[cacheKey]) {
      return false;
    }

    delete this.generatedCodeJobCache[cacheKey];
    return this.saveGeneratedCodeJobCache();
  }

  prepareGeneratedCodeTaskWorkspace(task = null, { showCodePanel = true, autoShow = true } = {}) {
    this.generatedHtmlCode = '';
    this.generatedHtmlDesignId = null;
    this.generatedPreviewHtml = '';
    this.generatedCodeFiles = [];
    this.generatedCodeFileName = '';
    this.generatedCodeTask = this.normalizeGeneratedCodeTaskState(task);
    this.generatedPreviewDiagnostics = this.createInitialGeneratedPreviewDiagnostics();
    this.generatedPreviewRepairState = this.createInitialGeneratedPreviewRepairState();

    if (autoShow) {
      this.showGeneratedCodePanel({ showCodePanel });
    }

    if (this.generatedPreviewSite) {
      this.generatedPreviewSite.hidden = true;
    }
    if (this.htmlPreviewFrame) {
      this.htmlPreviewFrame.srcdoc = '';
    }

    this.renderGeneratedCodeTask();
    this.refreshGeneratedCodeOutput();
    this.updateGenerateHtmlButtonState();
  }

  resetGeneratedCodeWorkspace(framework = this.getSelectedGeneratedFramework()) {
    this.cancelGeneratedCodeTracking(false);
    this.generatedCodeFramework = this.normalizeGeneratedFrameworkValue(framework);
    this.prepareGeneratedCodeTaskWorkspace(this.createInitialGeneratedCodeTaskState(), {
      showCodePanel: false,
      autoShow: false
    });
    this.hideHtmlPreview(false);
  }

  buildGeneratedCodeCachePayload(design = null) {
    const resolvedDesign = this.resolveDesignEntity(design);
    const files = Array.isArray(this.generatedCodeFiles)
      ? this.generatedCodeFiles
        .filter((file) => file && file.name && typeof file.content === 'string')
        .map((file) => ({
          name: file.name,
          content: file.content,
          isPrimary: Boolean(file.isPrimary)
        }))
      : [];

    return {
      designId: String(resolvedDesign?.id || this.selectedDesignId || '').trim(),
      latestVersion: this.getGeneratedCodeCacheVersion(resolvedDesign),
      framework: this.normalizeGeneratedFrameworkValue(this.generatedCodeFramework || 'html'),
      previewHtml: String(this.generatedPreviewHtml || ''),
      files,
      selectedFileName: String(this.generatedCodeFileName || '').trim(),
      cachedAt: Date.now()
    };
  }

  setGeneratedCodeCache(design = null) {
    const resolvedDesign = this.resolveDesignEntity(design);
    const cacheKey = this.getGeneratedCodeCacheKey(resolvedDesign, this.generatedCodeFramework || 'html');
    const payload = this.buildGeneratedCodeCachePayload(resolvedDesign);

    if (!cacheKey || !payload.designId || !payload.files.length) {
      return false;
    }

    this.generatedCodeCache[cacheKey] = {
      data: payload,
      expire: Date.now() + 2 * 24 * 60 * 60 * 1000,
      updatedAt: payload.cachedAt
    };

    return this.saveGeneratedCodeCache();
  }

  createGeneratedCodeCachedTaskState(cachePayload = {}) {
    const cachedAt = Number(cachePayload.cachedAt) || Date.now();
    const timeText = new Date(cachedAt).toLocaleTimeString();
    const versionText = String(cachePayload.latestVersion || '').trim();
    const frameworkLabel = this.getGeneratedFrameworkLabel(cachePayload.framework);
    const logs = [
      {
        time: timeText,
        message: versionText ? `设计图版本: ${versionText}` : '已命中本地缓存',
        type: 'success'
      },
      {
        time: timeText,
        message: `已从本地缓存恢复 ${frameworkLabel} 代码`,
        type: 'info'
      }
    ];

    return {
      ...this.createInitialGeneratedCodeTaskState(),
      status: 'success',
      stepKey: 'cached',
      stepLabel: '本地缓存',
      currentStep: 6,
      totalSteps: 6,
      progressPercent: 100,
      currentAction: `已从本地缓存恢复 ${frameworkLabel} 代码`,
      logs,
      createdAt: cachedAt,
      updatedAt: Date.now()
    };
  }

  // 清空缓存
  clearCache() {
    const currentUrl = this.urlInput?.value?.trim() || '';
    const currentDesignId = this.selectedDesignId || this.pendingDesignId || null;

    this.cache = {};
    this.generatedCodeCache = {};
    this.generatedCodeJobCache = {};
    this.layerCache = new Map();
    this.layers = [];
    this.canvasInfo = null;
    this.currentLayerDesignId = null;
    this.saveCache();
    this.saveGeneratedCodeCache();
    this.saveGeneratedCodeJobCache();
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
      this.currentPageState = state;
      localStorage.setItem('lanhuPageState', JSON.stringify(state));
      this.updateCopyLinkButtonState();
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
    this.currentPageState = null;
    this.updateCopyLinkButtonState();
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

  reparseCurrentProject() {
    const url = this.getCurrentLanhuUrl();
    if (!url) {
      this.showToast('当前没有可重新解析的蓝湖链接', 'error');
      this.updateCopyLinkButtonState();
      return;
    }

    this.urlInput.value = url;
    this.parseBtn.disabled = false;
    this.updateCopyLinkButtonState();
    this.forceRefresh();
  }

  // 渲染历史记录
  renderHistory() {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;

    if (this.history.length === 0) {
      historyList.innerHTML = '<div class="history-empty">暂无最近访问，粘贴蓝湖链接开始浏览</div>';
      return;
    }

    historyList.innerHTML = this.history.map(item => {
      const projectName = this.decodeHtmlEntities(item.projectName || '未命名项目');
      const safeProjectName = this.escapeHtml(projectName);
      const safeUrl = this.escapeAttr(item.url || '');
      const safeUrlText = this.escapeHtml(this.formatHistoryUrl(item.url || ''));
      const safeTime = this.escapeHtml(this.formatHistoryTime(item.time));
      const safeTitle = this.escapeAttr(`${projectName}\n${item.url || ''}`);

      return `
        <div class="history-item" data-url="${safeUrl}" title="${safeTitle}">
          <div class="history-main">
            <span class="history-name">${safeProjectName}</span>
            <span class="history-url">${safeUrlText}</span>
          </div>
          <span class="history-time">${safeTime}</span>
        </div>
      `;
    }).join('');

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

  formatHistoryUrl(rawUrl) {
    if (!rawUrl) return '未记录链接';

    try {
      const parsed = new URL(rawUrl);
      const path = parsed.pathname.replace(/\/+$/, '') || '/';
      const shortPath = path.length > 24 ? `...${path.slice(-24)}` : path;
      const key =
        parsed.searchParams.get('fid') ||
        parsed.searchParams.get('pid') ||
        parsed.searchParams.get('id') ||
        '';
      return key
        ? `${parsed.hostname}${shortPath} · ${String(key).slice(0, 8)}`
        : `${parsed.hostname}${shortPath}`;
    } catch (e) {
      return rawUrl.replace(/^https?:\/\//, '').slice(0, 42);
    }
  }

  getDesignViewportTag(design = {}) {
    const width = Number(design.width) || 0;
    const height = Number(design.height) || 0;

    if (!width || !height) return '画布';
    if (Math.max(width, height) >= 1920) return '超宽屏';
    if (Math.max(width, height) >= 1440) return '桌面端';
    if (Math.max(width, height) <= 480) return '移动端';
    if (width > height * 1.45) return 'Web';
    if (height > width * 1.3) return '长页面';
    return '标准帧';
  }

  normalizeDesignCodeStatusValue(design = {}) {
    const rawValue = design?.ddsJumpStatus ?? design?.dds_jump_status ?? null;
    if (rawValue === null || rawValue === undefined || rawValue === '') {
      return null;
    }

    const normalizedValue = Number(rawValue);
    return Number.isFinite(normalizedValue) ? normalizedValue : null;
  }

  getDesignCodeStatus(design = {}) {
    const statusValue = this.normalizeDesignCodeStatusValue(design);

    if (statusValue === 1) {
      return {
        code: 'available',
        label: '有代码',
        title: '蓝湖代码数据可用'
      };
    }

    if (statusValue === 4) {
      return {
        code: 'unavailable',
        label: '无代码',
        title: '蓝湖当前没有可用代码数据'
      };
    }

    return {
      code: 'unknown',
      label: '待校验',
      title: '蓝湖代码状态待校验'
    };
  }

  getDesignRatio(width, height) {
    const w = Number(width) || 0;
    const h = Number(height) || 0;
    if (!w || !h) return '';

    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    const d = gcd(w, h);
    const rw = Math.round(w / d);
    const rh = Math.round(h / d);
    if (!rw || !rh) return '';
    return `${rw}:${rh}`;
  }

  getSliceLabel(slice = {}) {
    const format = String(slice.defaultFormat || '').toUpperCase();
    if (format === 'SVG') return '矢量';
    if (format === 'PNG' || format === 'JPG' || format === 'JPEG' || format === 'WEBP') return '位图';
    return '资源';
  }

  loadSessionId() {
    try {
      return localStorage.getItem('sessionId') || this.defaultSessionId;
    } catch (e) {
      return this.defaultSessionId;
    }
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
    if (logPanel) {
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
    this.inputSection = document.getElementById('inputSection');
    this.urlInput = document.getElementById('urlInput');
    this.parseBtn = document.getElementById('parseBtn');
    this.reparseDesignBtn = document.getElementById('reparseDesignBtn');
    this.copyLinkBtn = document.getElementById('copyLinkBtn');
    this.syncInputSectionVisibility();
    this.updateCopyLinkButtonState();

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
    this.copyDesignLinkBtn = document.getElementById('copyDesignLinkBtn');
    this.previewImage = document.getElementById('previewImage');
    this.hotspotModeBtn = document.getElementById('hotspotModeBtn');
    this.noteModeBtn = document.getElementById('noteModeBtn');
    this.layerModeBtn = document.getElementById('layerModeBtn');
    this.annotatePreviewBtn = document.getElementById('annotatePreviewBtn');
    this.generatedFrameworkSelect = document.getElementById('generatedFrameworkSelect');
    this.generateHtmlBtn = document.getElementById('generateHtmlBtn');
    this.toggleCodePanelBtn = document.getElementById('toggleCodePanelBtn');
    this.previewBody = document.getElementById('previewBody');
    this.designPreviewFrameLabel = document.getElementById('designPreviewFrameLabel');
    this.generatedPreviewSite = document.getElementById('generatedPreviewSite');
    this.htmlPreviewModal = document.getElementById('htmlPreviewModal');
    this.htmlPreviewModalBackdrop = document.getElementById('htmlPreviewModalBackdrop');
    this.htmlPreviewPanel = document.getElementById('htmlPreviewPanel');
    this.htmlPreviewFrame = document.getElementById('htmlPreviewFrame');
    this.htmlCodeOutput = document.getElementById('htmlCodeOutput');
    this.generatedCodeStatus = document.getElementById('generatedCodeStatus');
    this.generatedCodeSummary = document.getElementById('generatedCodeSummary');
    this.generatedPreviewFrameLabel = document.getElementById('generatedPreviewFrameLabel');
    this.generatedCodeFileCount = document.getElementById('generatedCodeFileCount');
    this.generatedCodeFileSelect = document.getElementById('generatedCodeFileSelect');
    this.generatedCodeTaskCard = document.getElementById('generatedCodeTaskCard');
    this.generatedCodeTaskStep = document.getElementById('generatedCodeTaskStep');
    this.generatedCodeTaskMeta = document.getElementById('generatedCodeTaskMeta');
    this.generatedCodeProgressText = document.getElementById('generatedCodeProgressText');
    this.generatedCodeProgressBar = document.getElementById('generatedCodeProgressBar');
    this.generatedCodeCurrentAction = document.getElementById('generatedCodeCurrentAction');
    this.generatedCodePrimaryBtn = document.getElementById('generatedCodePrimaryBtn');
    this.generatedCodeLogList = document.getElementById('generatedCodeLogList');
    this.openHtmlInNewTabBtn = document.getElementById('openHtmlInNewTabBtn');
    this.runDiagnosticsBtn = document.getElementById('runDiagnosticsBtn');
    this.copyHtmlBtn = document.getElementById('copyHtmlBtn');
    this.closeHtmlPreviewBtn = document.getElementById('closeHtmlPreviewBtn');
    this.generatedDiagnosticsCard = document.getElementById('generatedDiagnosticsCard');
    this.generatedDiagnosticsMeta = document.getElementById('generatedDiagnosticsMeta');
    this.generatedDiagnosticsStatus = document.getElementById('generatedDiagnosticsStatus');
    this.generatedDiagnosticsSummary = document.getElementById('generatedDiagnosticsSummary');
    this.generatedDiagnosticsList = document.getElementById('generatedDiagnosticsList');
    this.ensureGeneratedPreviewViewport();

    this.syncGeneratedFrameworkSelect();

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
    this.wheelZoomIntensity = 0.0022;
    this.panX = 0;
    this.panY = 0;
    this.isDragging = false;
    this.isWheelPanning = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.isPinching = false;
    this.pinchStartDistance = 0;
    this.pinchStartZoom = 1;
    this.pinchStartPanX = 0;
    this.pinchStartPanY = 0;
    this.pinchStartCenterX = 0;
    this.pinchStartCenterY = 0;
    this.pinchAnchorPoint = null;
    this.pinchBaseCenterX = 0;
    this.pinchBaseCenterY = 0;
    this.pinchGestureMode = 'idle';
    this.pinchPanThreshold = 6;
    this.pinchZoomDistanceThreshold = 10;
    this.pinchZoomRatioThreshold = 0.04;
    this.trackpadWheelDeltaThreshold = 40;
    this.wheelPanEndDelay = 120;
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

  initPanzoom() {
    if (!this.previewImage || typeof window.Panzoom !== 'function') return;

    this.panzoom = window.Panzoom(this.previewImage, {
      noBind: true,
      maxScale: this.maxZoom,
      minScale: this.minZoom,
      startScale: this.zoomLevel,
      startX: this.panX,
      startY: this.panY,
      cursor: 'inherit',
      touchAction: 'none'
    });

    this.previewImage.addEventListener('panzoomstart', () => this.handlePanzoomStart());
    this.previewImage.addEventListener('panzoomchange', (event) => this.handlePanzoomChange(event));
    this.previewImage.addEventListener('panzoomend', () => this.handlePanzoomEnd());

    this.applyTransform();
    this.syncPanzoomBinding();
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
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.isCodePanelVisible) {
        this.setCodePanelVisibility(false);
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
    if (this.annotatePreviewBtn) {
      this.annotatePreviewBtn.addEventListener('click', () => this.toggleAnnotationPreview());
    }
    if (this.generatedFrameworkSelect) {
      this.generatedFrameworkSelect.addEventListener('change', () => this.handleGeneratedFrameworkChange());
    }
    if (this.generateHtmlBtn) {
      this.generateHtmlBtn.addEventListener('click', () => this.generateHtmlPreview());
    }
    if (this.toggleCodePanelBtn) {
      this.toggleCodePanelBtn.addEventListener('click', () => this.toggleCodePanel());
    }
    if (this.openHtmlInNewTabBtn) {
      this.openHtmlInNewTabBtn.addEventListener('click', () => this.openGeneratedHtmlInNewTab());
    }
    if (this.runDiagnosticsBtn) {
      this.runDiagnosticsBtn.addEventListener('click', () => this.runGeneratedPreviewDiagnostics());
    }
    if (this.copyHtmlBtn) {
      this.copyHtmlBtn.addEventListener('click', () => this.copyGeneratedHtml());
    }
    if (this.generatedCodePrimaryBtn) {
      this.generatedCodePrimaryBtn.addEventListener('click', () => this.handleGeneratedCodePrimaryAction());
    }
    if (this.htmlPreviewFrame) {
      this.htmlPreviewFrame.addEventListener('load', () => this.scheduleGeneratedPreviewRefitSequence());
    }
    if (this.generatedCodeFileSelect) {
      this.generatedCodeFileSelect.addEventListener('change', () => this.handleGeneratedCodeFileChange());
    }
    if (this.copyLinkBtn) {
      this.copyLinkBtn.addEventListener('click', () => this.copyCurrentLink());
    }
    if (this.reparseDesignBtn) {
      this.reparseDesignBtn.addEventListener('click', () => this.reparseCurrentProject());
    }
    if (this.copyDesignLinkBtn) {
      this.copyDesignLinkBtn.addEventListener('click', () => this.copySelectedDesignLink());
    }
    if (this.htmlPreviewModalBackdrop) {
      this.htmlPreviewModalBackdrop.addEventListener('click', () => this.setCodePanelVisibility(false));
    }
    if (this.closeHtmlPreviewBtn) {
      this.closeHtmlPreviewBtn.addEventListener('click', () => this.setCodePanelVisibility(false));
    }

    // 更新设计图按钮
    this.refreshDesignBtn = document.getElementById('refreshDesignBtn');
    if (this.refreshDesignBtn) {
      this.refreshDesignBtn.addEventListener('click', () => this.refreshCurrentDesign());
    }

    if (this.previewImage) {
      this.previewImage.addEventListener('load', () => {
        this.applyTransform();
        this.ensurePreviewImageVisible({ save: true });
        this.scheduleHotspotRender();
        this.scheduleHotspotRender(140);
        this.scheduleHotspotRender(280);
        this.queuePreviewImageRefresh(80);
      });
      this.previewImage.addEventListener('transitionend', () => this.scheduleHotspotRender());
      this.previewImage.addEventListener('error', () => {
        if (!this.currentPreviewOriginalUrl || this.isAnnotationPreview) return;
        const fallbackUrl = this.getProxiedImageUrl(this.currentPreviewOriginalUrl);
        if (this.previewImage.src === fallbackUrl) return;
        this.currentPreviewSourceUrl = this.currentPreviewOriginalUrl;
        this.currentPreviewRequestWidth = 0;
        this.previewImage.src = fallbackUrl;
      });
    }

    window.addEventListener('message', (event) => this.handleParentMessage(event));
    window.addEventListener('resize', () => {
      this.scheduleHotspotRender();
      this.queuePreviewImageRefresh(180);
      this.queueGeneratedPreviewFit(120);
    });

    if (this.previewContainer && 'ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(() => {
        this.scheduleHotspotRender();
        this.queuePreviewImageRefresh(180);
        this.queueGeneratedPreviewFit(120);
      });
      this.resizeObserver.observe(this.previewContainer);
      this.resizeObserver.observe(this.previewImage);
      if (this.generatedPreviewFrameStage) {
        this.resizeObserver.observe(this.generatedPreviewFrameStage);
      }
    }

    // 鼠标滚轮缩放
    if (this.previewContainer) {
      this.previewContainer.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
      this.previewContainer.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
      this.previewContainer.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
      this.previewContainer.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
      this.previewContainer.addEventListener('touchcancel', (e) => this.handleTouchCancel(e), { passive: false });

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
        if (this.panzoom) return;
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
        if (this.panzoom) return;
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
        if (this.panzoom) return;
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

  getSelectedDesign() {
    if (!this.selectedDesignId || !Array.isArray(this.designs)) return null;
    return this.designs.find((item) => item.id === this.selectedDesignId) || null;
  }

  isAdaptiveCoverPreviewUrl(url) {
    const normalized = String(url || '').trim();
    return /FigmaCover/i.test(normalized) && /(?:^https?:\/\/)?(?:assets|alipic)\.lanhuapp\.com/i.test(normalized);
  }

  getAdaptiveCoverBucket(targetWidth) {
    const buckets = [375, 560, 778, 1000, 1280, 1500, 2000];
    return buckets.find((bucket) => targetWidth <= bucket) || buckets[buckets.length - 1];
  }

  getDesiredPreviewRequestWidth(design = null) {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    let visualWidth = 0;

    if (this.previewImage) {
      const rect = this.previewImage.getBoundingClientRect();
      visualWidth = rect.width || 0;
    }

    if (visualWidth <= 1 && this.previewContainer) {
      const containerRect = this.previewContainer.getBoundingClientRect();
      const designWidth = Number(design?.width) || Number(this.previewImage?.naturalWidth) || 1;
      const designHeight = Number(design?.height) || Number(this.previewImage?.naturalHeight) || 1;

      if (containerRect.width > 0 && containerRect.height > 0 && designWidth > 0 && designHeight > 0) {
        const fittedWidth = Math.min(containerRect.width, containerRect.height * (designWidth / designHeight));
        visualWidth = fittedWidth * Math.max(1, this.zoomLevel || 1);
      }
    }

    return Math.max(375, Math.round(visualWidth * dpr));
  }

  buildAdaptiveCoverPreviewUrl(originalUrl, requestWidth) {
    if (!this.isAdaptiveCoverPreviewUrl(originalUrl)) return String(originalUrl || '');

    try {
      const parsed = new URL(String(originalUrl).trim());
      parsed.hostname = 'assets.lanhuapp.com';
      parsed.search = '';
      parsed.searchParams.set(
        'x-oss-process',
        `image/quality,q_lossless/resize,w_${Math.max(375, Math.round(requestWidth || 0))}/format,webp`
      );
      return parsed.toString();
    } catch (e) {
      return String(originalUrl || '');
    }
  }

  queuePreviewImageRefresh(delay = 160) {
    clearTimeout(this.previewRefreshTimer);
    this.previewRefreshTimer = setTimeout(() => {
      this.previewRefreshTimer = null;
      this.refreshPreviewImageForZoom();
    }, delay);
  }

  refreshPreviewImageForZoom() {
    if (this.isAnnotationPreview || !this.previewImage) return;

    const design = this.getSelectedDesign();
    const originalUrl = String(design?.url || '').trim();
    if (!originalUrl || !this.isAdaptiveCoverPreviewUrl(originalUrl)) return;

    const desiredWidth = this.getAdaptiveCoverBucket(this.getDesiredPreviewRequestWidth(design));
    const loadedWidth = Math.max(
      Number(this.previewImage.naturalWidth) || 0,
      Number(this.currentPreviewRequestWidth) || 0
    );

    if (loadedWidth > 0 && desiredWidth <= loadedWidth + 24) return;
    if (desiredWidth <= (Number(this.currentPreviewRequestWidth) || 0) + 24) return;

    const nextUrl = this.buildAdaptiveCoverPreviewUrl(originalUrl, desiredWidth);
    if (!nextUrl || nextUrl === this.currentPreviewSourceUrl) return;

    this.currentPreviewOriginalUrl = originalUrl;
    this.currentPreviewSourceUrl = nextUrl;
    this.currentPreviewRequestWidth = desiredWidth;
    this.previewImage.src = this.getProxiedImageUrl(nextUrl);
  }

  loadDesignPreviewImage(design, { resetAdaptiveState = false } = {}) {
    const originalUrl = String(design?.url || '').trim();
    if (!this.previewImage || !originalUrl) return;

    if (resetAdaptiveState) {
      this.currentPreviewRequestWidth = 0;
    }

    this.currentPreviewOriginalUrl = originalUrl;
    this.currentPreviewSourceUrl = originalUrl;
    this.previewImage.src = this.getProxiedImageUrl(originalUrl);
    this.previewImage.alt = this.decodeHtmlEntities(design?.name) || '设计图预览';
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
    this.syncPanzoomBinding();
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

  getRectIntersection(rectA, rectB) {
    if (!rectA || !rectB) {
      return { width: 0, height: 0, area: 0 };
    }

    const width = Math.max(0, Math.min(rectA.right, rectB.right) - Math.max(rectA.left, rectB.left));
    const height = Math.max(0, Math.min(rectA.bottom, rectB.bottom) - Math.max(rectA.top, rectB.top));
    return {
      width,
      height,
      area: width * height,
    };
  }

  ensurePreviewImageVisible({ save = false } = {}) {
    const viewport = this.getImageViewportRect();
    if (!viewport) return false;

    const { imageRect, containerRect } = viewport;
    const intersection = this.getRectIntersection(imageRect, containerRect);
    const isVisibleEnough =
      intersection.width >= 24 &&
      intersection.height >= 24 &&
      intersection.area >= 1024;

    if (isVisibleEnough) {
      return false;
    }

    this.panX = 0;
    this.panY = 0;
    this.applyTransform();
    this.updateZoomLevel();

    if (save) {
      this.saveCurrentDesignState();
    }

    return true;
  }

  getPointerClientPoint(event) {
    if (event?.touches?.length) return event.touches[0];
    if (event?.changedTouches?.length) return event.changedTouches[0];
    return event || null;
  }

  isPrimaryPointerEvent(event) {
    return typeof event?.button !== 'number' || event.button === 0;
  }

  getNormalizedPointFromMouse(event) {
    const viewport = this.getImageViewportRect();
    if (!viewport) return null;
    const point = this.getPointerClientPoint(event);
    if (!point) return null;
    const { imageRect } = viewport;
    const clamp = (value) => Math.min(1, Math.max(0, value));
    const x = clamp((point.clientX - imageRect.left) / imageRect.width);
    const y = clamp((point.clientY - imageRect.top) / imageRect.height);
    return { x, y };
  }

  getPreviewCenterPoint() {
    if (!this.previewContainer) return { x: 0, y: 0 };
    const rect = this.previewContainer.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  getImageTransformMetrics(viewport = this.getImageViewportRect()) {
    if (!viewport || !this.zoomLevel) return null;
    const { imageRect } = viewport;
    const centerX = imageRect.left + imageRect.width / 2;
    const centerY = imageRect.top + imageRect.height / 2;
    return {
      centerX,
      centerY,
      baseCenterX: centerX - (this.panX || 0) * this.zoomLevel,
      baseCenterY: centerY - (this.panY || 0) * this.zoomLevel,
    };
  }

  getImageLocalPoint(clientX, clientY, viewport = this.getImageViewportRect()) {
    const metrics = this.getImageTransformMetrics(viewport);
    if (!metrics) return null;
    return {
      x: (clientX - metrics.centerX) / this.zoomLevel,
      y: (clientY - metrics.centerY) / this.zoomLevel,
    };
  }

  clampZoom(zoom) {
    return Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
  }

  isPreviewTransforming() {
    return this.isDragging || this.isPinching || this.isWheelPanning || this.isPanzoomInteracting;
  }

  hidePreviewOverlays() {
    if (this.layerAnnotationLayer) {
      this.layerAnnotationLayer.style.display = 'none';
    }
    if (this.hotspotLayer) {
      this.hotspotLayer.style.display = 'none';
    }
  }

  restorePreviewOverlays() {
    if (this.hotspotLayer) {
      this.hotspotLayer.style.display = '';
    }
    if (this.layerAnnotationLayer) {
      this.layerAnnotationLayer.style.display = this.isLayerMode ? 'block' : 'none';
    }
  }

  setPreviewInteractionActive() {
    const active = this.isPreviewTransforming();
    if (this.previewContainer) {
      this.previewContainer.classList.toggle('dragging', active);
    }
    if (active) {
      this.hidePreviewOverlays();
      return;
    }
    this.restorePreviewOverlays();
  }

  syncPanzoomState(detail = null) {
    if (!this.panzoom) return;
    const pan = this.panzoom.getPan();
    this.zoomLevel = detail?.scale ?? this.panzoom.getScale();
    this.panX = detail?.x ?? pan.x;
    this.panY = detail?.y ?? pan.y;
    this.updateZoomLevel();
  }

  handlePanzoomStart() {
    if (!this.panzoom || !this.isPanzoomBound) return;
    this.isPanzoomInteracting = true;
    this.setPreviewInteractionActive();
  }

  handlePanzoomChange(event) {
    if (!this.panzoom) return;
    this.syncPanzoomState(event?.detail || null);
    if (!this.isPreviewTransforming()) {
      this.scheduleHotspotRender();
      if (this.isLayerMode && this.layers.length > 0) {
        this.scheduleLayerRender();
      }
    }
  }

  handlePanzoomEnd() {
    if (!this.panzoom) return;
    this.isPanzoomInteracting = false;
    this.syncPanzoomState();
    this.setPreviewInteractionActive();
    this.saveCurrentDesignState();
    this.scheduleHotspotRender();
    this.queuePreviewImageRefresh(120);
    if (this.isLayerMode && this.layers.length > 0) {
      this.scheduleLayerRender();
    }
  }

  syncPanzoomBinding() {
    if (!this.panzoom) return;
    const shouldBind = !this.isMarkMode && !this.isNoteMode;

    if (shouldBind && !this.isPanzoomBound) {
      this.panzoom.bind();
      this.isPanzoomBound = true;
      return;
    }

    if (!shouldBind && this.isPanzoomBound) {
      this.panzoom.destroy();
      this.isPanzoomBound = false;
      this.isPanzoomInteracting = false;
      this.setPreviewInteractionActive();
    }
  }

  zoomToPoint(nextZoom, clientX, clientY) {
    const clampedZoom = this.clampZoom(nextZoom);
    if (clampedZoom === this.zoomLevel) return false;
    const viewport = this.getImageViewportRect();
    if (!viewport) return false;

    const metrics = this.getImageTransformMetrics(viewport);
    if (!metrics) return false;

    const currentZoom = this.zoomLevel || 1;
    const localX = (clientX - metrics.centerX) / currentZoom;
    const localY = (clientY - metrics.centerY) / currentZoom;

    this.zoomLevel = clampedZoom;
    this.panX = (clientX - metrics.baseCenterX) / clampedZoom - localX;
    this.panY = (clientY - metrics.baseCenterY) / clampedZoom - localY;
    this.applyTransform();
    this.updateZoomLevel();
    this.queuePreviewImageRefresh(120);
    return true;
  }

  queueDesignStateSave(delay = 300) {
    clearTimeout(this.zoomSaveTimer);
    this.zoomSaveTimer = setTimeout(() => this.saveCurrentDesignState(), delay);
  }

  isWheelZoomGesture(event) {
    if (event.ctrlKey || event.metaKey) return true;

    const absX = Math.abs(event.deltaX);
    const absY = Math.abs(event.deltaY);
    const maxDelta = Math.max(absX, absY);
    const dominantVertical = absY >= absX;

    if (event.deltaMode !== 0) return dominantVertical;
    return dominantVertical && maxDelta >= this.trackpadWheelDeltaThreshold;
  }

  startWheelPan() {
    if (!this.isWheelPanning) {
      this.isWheelPanning = true;
      this.setPreviewInteractionActive();
    }

    clearTimeout(this.wheelPanEndTimer);
    this.wheelPanEndTimer = setTimeout(() => this.endWheelPan(), this.wheelPanEndDelay);
  }

  endWheelPan() {
    clearTimeout(this.wheelPanEndTimer);
    this.wheelPanEndTimer = null;
    if (!this.isWheelPanning) return;

    this.isWheelPanning = false;
    this.setPreviewInteractionActive();
    this.saveCurrentDesignState();
    this.scheduleHotspotRender();
    if (this.isLayerMode && this.layers.length > 0) {
      this.scheduleLayerRender();
    }
  }

  panByWheel(deltaX, deltaY) {
    if (this.zoomLevel <= 1) return false;
    this.startWheelPan();
    if (this.panzoom) {
      this.panzoom.pan(-deltaX / this.zoomLevel, -deltaY / this.zoomLevel, {
        relative: true,
        force: true,
        animate: false,
        silent: true
      });
      this.syncPanzoomState();
    } else {
      this.panX -= deltaX / this.zoomLevel;
      this.panY -= deltaY / this.zoomLevel;
      this.applyTransform();
    }
    return true;
  }

  getTouchDistance(touchA, touchB) {
    return Math.hypot(touchA.clientX - touchB.clientX, touchA.clientY - touchB.clientY);
  }

  getTouchCenter(touchA, touchB) {
    return {
      x: (touchA.clientX + touchB.clientX) / 2,
      y: (touchA.clientY + touchB.clientY) / 2,
    };
  }

  startPinchZoom(event) {
    if (!this.previewContainer || event.touches.length < 2) return;

    const [touchA, touchB] = event.touches;
    const viewport = this.getImageViewportRect();
    if (!viewport) return;

    const distance = this.getTouchDistance(touchA, touchB);
    if (!distance) return;

    if (this.isDrawingHotspot || this.isDrawingNote) {
      this.clearDrawingDrafts();
      this.renderHotspots();
    }

    if (this.isDragging) {
      this.endDrag();
    }

    const center = this.getTouchCenter(touchA, touchB);
    const anchorPoint = this.getImageLocalPoint(center.x, center.y, viewport);
    if (!anchorPoint) return;

    const metrics = this.getImageTransformMetrics(viewport);
    if (!metrics) return;

    this.isPinching = true;
    this.pinchStartDistance = distance;
    this.pinchStartZoom = this.zoomLevel;
    this.pinchStartPanX = this.panX;
    this.pinchStartPanY = this.panY;
    this.pinchStartCenterX = center.x;
    this.pinchStartCenterY = center.y;
    this.pinchAnchorPoint = anchorPoint;
    this.pinchBaseCenterX = metrics.baseCenterX;
    this.pinchBaseCenterY = metrics.baseCenterY;
    this.pinchGestureMode = 'pending';
    this.setPreviewInteractionActive();
  }

  updatePinchZoom(event) {
    if (!this.isPinching || event.touches.length < 2 || !this.pinchStartDistance || !this.pinchAnchorPoint) return;

    const [touchA, touchB] = event.touches;
    const distance = this.getTouchDistance(touchA, touchB);
    if (!distance) return;

    const center = this.getTouchCenter(touchA, touchB);
    const centerDeltaX = center.x - this.pinchStartCenterX;
    const centerDeltaY = center.y - this.pinchStartCenterY;
    const centerDelta = Math.hypot(centerDeltaX, centerDeltaY);
    const distanceDelta = Math.abs(distance - this.pinchStartDistance);
    const zoomRatioDelta = Math.abs(distance / this.pinchStartDistance - 1);

    if (this.pinchGestureMode === 'pending') {
      if (distanceDelta >= this.pinchZoomDistanceThreshold || zoomRatioDelta >= this.pinchZoomRatioThreshold) {
        this.pinchGestureMode = 'zoom';
      } else if (centerDelta >= this.pinchPanThreshold) {
        this.pinchGestureMode = 'pan';
      } else {
        return;
      }
    }

    if (this.pinchGestureMode === 'pan') {
      this.zoomLevel = this.pinchStartZoom;
      this.panX = this.pinchStartPanX + centerDeltaX / this.pinchStartZoom;
      this.panY = this.pinchStartPanY + centerDeltaY / this.pinchStartZoom;
      this.applyTransform();
      this.updateZoomLevel();
      return;
    }

    const nextZoom = this.clampZoom(this.pinchStartZoom * (distance / this.pinchStartDistance));

    this.zoomLevel = nextZoom;
    this.panX = (center.x - this.pinchBaseCenterX) / nextZoom - this.pinchAnchorPoint.x;
    this.panY = (center.y - this.pinchBaseCenterY) / nextZoom - this.pinchAnchorPoint.y;
    this.applyTransform();
    this.updateZoomLevel();
  }

  endPinchZoom() {
    if (!this.isPinching) return;

    this.isPinching = false;
    this.pinchStartDistance = 0;
    this.pinchStartZoom = this.zoomLevel;
    this.pinchStartPanX = this.panX;
    this.pinchStartPanY = this.panY;
    this.pinchAnchorPoint = null;
    this.pinchGestureMode = 'idle';
    this.setPreviewInteractionActive();
    this.saveCurrentDesignState();
    this.scheduleHotspotRender();
    if (this.isLayerMode && this.layers.length > 0) {
      this.scheduleLayerRender();
    }
  }

  handleTouchStart(event) {
    if (this.panzoom && !this.isMarkMode && !this.isNoteMode) return;
    if (event.touches.length >= 2) {
      event.preventDefault();
      this.startPinchZoom(event);
      return;
    }
    if (event.touches.length !== 1 || this.isPinching) return;

    if (this.isMarkMode) {
      this.startHotspotDraw(event);
      event.preventDefault();
      return;
    }
    if (this.isNoteMode) {
      this.startNoteDraw(event);
      event.preventDefault();
      return;
    }
    if (this.zoomLevel > 1) {
      this.startDrag(event);
      event.preventDefault();
    }
  }

  handleTouchMove(event) {
    if (this.panzoom && !this.isMarkMode && !this.isNoteMode) return;
    if (this.isPinching) {
      if (event.touches.length >= 2) {
        event.preventDefault();
        this.updatePinchZoom(event);
      }
      return;
    }
    if (event.touches.length >= 2) {
      event.preventDefault();
      this.startPinchZoom(event);
      return;
    }
    if (event.touches.length !== 1) return;

    if (this.isMarkMode && this.isDrawingHotspot) {
      this.updateHotspotDraw(event);
      event.preventDefault();
      return;
    }
    if (this.isNoteMode && this.isDrawingNote) {
      this.updateNoteDraw(event);
      event.preventDefault();
      return;
    }
    if (this.isDragging) {
      this.doDrag(event);
      event.preventDefault();
    }
  }

  handleTouchEnd(event) {
    if (this.panzoom && !this.isMarkMode && !this.isNoteMode) return;
    if (this.isPinching) {
      if (event.touches.length >= 2) {
        this.startPinchZoom(event);
        return;
      }
      this.endPinchZoom();
      if (!this.isMarkMode && !this.isNoteMode && event.touches.length === 1 && this.zoomLevel > 1) {
        this.startDrag(event);
      }
      event.preventDefault();
      return;
    }

    if (this.isMarkMode && this.isDrawingHotspot) {
      this.finishHotspotDraw(event);
      return;
    }
    if (this.isNoteMode && this.isDrawingNote) {
      this.finishNoteDraw(event);
      return;
    }
    if (this.isDragging && event.touches.length === 0) {
      this.endDrag();
      event.preventDefault();
    }
  }

  handleTouchCancel(event) {
    if (this.panzoom && !this.isMarkMode && !this.isNoteMode) return;
    if (this.isPinching) {
      this.endPinchZoom();
    }
    if (this.isDragging) {
      this.endDrag();
    }
    if (this.isDrawingHotspot || this.isDrawingNote) {
      this.clearDrawingDrafts();
      this.renderHotspots();
    }
    event?.preventDefault?.();
  }

  startHotspotDraw(event) {
    if (!this.isPrimaryPointerEvent(event)) return;
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
    if (!this.isPrimaryPointerEvent(event)) return;
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
      hotspotEl.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });

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
      deleteBtn.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
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
      calloutEl.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
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
      noteEl.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
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
      deleteBtn.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
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
      calloutEl.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
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
      const displayName = this.escapeHtml(userInfo.name || '用户');
      const initial = (userInfo.name || 'U').charAt(0).toUpperCase();

      this.userInfoEl.innerHTML = `
        <div class="user-info-wrapper">
          <div class="user-basic">
            <div class="user-avatar">${initial}</div>
            <span class="user-name">${displayName}</span>
            <button class="btn btn-secondary btn-small" id="logoutBtn">退出空间</button>
          </div>
        </div>
      `;

      document.getElementById('logoutBtn').addEventListener('click', () => this.logout());
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
    this.cookies = [];
    this.clearPageState();
    this.selectedDesignId = null;
    this.updateCopyLinkButtonState();
    this.updateSelectedDesignCopyButtonState();
    this.updateGenerateHtmlButtonState();

    this.userInfoEl.innerHTML = `
      <button class="btn btn-primary" id="loginBtn">连接蓝湖</button>
    `;

    document.getElementById('loginBtn').addEventListener('click', () => this.login());
    this.showToast('已退出登录');
  }

  // URL 输入处理
  onUrlInput() {
    const url = this.urlInput.value.trim();
    this.parseBtn.disabled = !url;
    this.updateCopyLinkButtonState();

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
    this.updateGenerateHtmlButtonState();
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
    this.restoreOriginalPreviewImage();
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

      const creatorName = this.decodeHtmlEntities(data.project.creator || '') || '未指派';
      const memberCount = Number(data.project.memberCount) || 0;
      const totalDesigns = (data.designs && data.designs.length) || 0;
      const updatedAt = data.project.updatedAt ? this.formatDate(data.project.updatedAt) : '待同步';
      const typeLabel = this.getTypeLabel(data.type);

      const metaItems = [];
      metaItems.push(['交付类型', typeLabel]);
      metaItems.push(['画板规模', `${totalDesigns} 个画板`]);
      metaItems.push(['负责人', creatorName]);
      metaItems.push(['协作成员', memberCount ? `${memberCount} 位` : '未公开']);
      metaItems.push(['最近同步', updatedAt]);

      this.projectMeta.innerHTML = metaItems.map(([label, value]) => `
        <div class="meta-card">
          <span class="meta-label">${this.escapeHtml(label)}</span>
          <span class="meta-value">${this.escapeHtml(value)}</span>
        </div>
      `).join('');
    }

    // 设计图列表
    if (data.designs && data.designs.length > 0) {
      this.emptyState.style.display = 'none';
      this.historySection.style.display = 'none';
      this.designsSection.style.display = 'flex';
      this.designCount.textContent = `${data.designs.length} 张`;

      this.designGrid.innerHTML = data.designs.map((design, index) => {
        const designName = this.decodeHtmlEntities(design.name) || `设计图 ${index + 1}`;
        const safeName = this.escapeHtml(designName);
        const safeAttrName = this.escapeAttr(designName);
        const designId = this.escapeAttr(design.id || '');
        const designRawUrl = this.escapeAttr(design.url || '');
        const designLink = this.getDesignLink(design);
        const safeDesignLink = this.escapeAttr(designLink);
        const previewUrl = design.url ? this.getProxiedImageUrl(design.url) : '';
        const viewportTag = this.getDesignViewportTag(design);
        const width = Number(design.width) || 0;
        const height = Number(design.height) || 0;
        const hasSize = width > 0 && height > 0;
        const orientation = hasSize ? (width >= height ? '横向' : '纵向') : '方向待定';
        const ratio = hasSize ? this.getDesignRatio(width, height) : '';
        const sizeText = hasSize ? `${width} × ${height}` : '尺寸待同步';
        const metaText = ratio ? `${orientation} · ${ratio}` : orientation;
        const codeStatus = this.getDesignCodeStatus(design);
        const cardTitle = this.escapeAttr(`${designName}${hasSize ? ` (${width}×${height})` : ''} · ${codeStatus.title}`);

        return `
          <div class="design-card" data-index="${index}" data-id="${designId}" data-url="${designRawUrl}" data-link="${safeDesignLink}" title="${cardTitle}">
            <div class="design-preview">
              ${previewUrl ? `<img src="${this.escapeAttr(previewUrl)}" alt="${safeAttrName}" loading="lazy">` : '<span>FRAME</span>'}
            </div>
            <div class="design-info">
              <div class="design-card-head">
                <span class="design-index">${String(index + 1).padStart(2, '0')}</span>
                <span class="design-tag">${this.escapeHtml(viewportTag)}</span>
                <span class="design-code-badge ${this.escapeAttr(codeStatus.code)}" title="${this.escapeAttr(codeStatus.title)}">${this.escapeHtml(codeStatus.label)}</span>
              </div>
              <div class="design-name" title="${safeAttrName}">${safeName}</div>
              <div class="design-meta-row">
                <span class="design-size">${this.escapeHtml(sizeText)}</span>
                <span class="design-size">${this.escapeHtml(metaText)}</span>
              </div>
            </div>
            <div class="design-arrow">></div>
          </div>
        `;
      }).join('');

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
      this.updateDesignPreviewFrameLabel('');
      this.updateSelectedDesignCopyButtonState();
      this.updateGenerateHtmlButtonState();
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
      this.restoreOriginalPreviewImage();
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
    this.updateSelectedDesignCopyButtonState();
    this.updateGenerateHtmlButtonState();
    this.currentProjectData = projectData;
    this.closeNoteModal();
    if (!isDesignSwitched) {
      if (this.isAnnotationPreview) {
        this.restoreOriginalPreviewImage();
      } else {
        this.updateAnnotationPreviewButton();
      }
    }
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
      const designName = this.decodeHtmlEntities(design.name) || '未命名设计图';
      this.previewName.textContent = designName;
      this.updateDesignPreviewFrameLabel(designName);
      this.previewSize.textContent = `${design.width} × ${design.height}`;
      this.loadDesignPreviewImage(design, { resetAdaptiveState: true });

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

      const targetFramework = this.getSelectedGeneratedFramework();
      const restoredGeneratedCode = this.restoreGeneratedCodeCache(design, {
        autoShow: true,
        framework: targetFramework
      });
      if (!restoredGeneratedCode) {
        this.restoreGeneratedCodeJob(design, {
          autoShow: true,
          silent: true,
          framework: targetFramework
        });
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
      this.sliceCountEl.textContent = `${data.total || data.slices.length} 张`;
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
      const sliceName = slice.name || `asset_${index + 1}`;
      const safeName = this.escapeHtml(sliceName);
      const safeAttrName = this.escapeAttr(sliceName);
      const safeFallbackLabel = this.escapeHtml(slice.defaultFormat?.toUpperCase() || 'PNG');
      const formatLabel = this.escapeHtml((slice.defaultFormat || Object.keys(availableScales)[0] || 'png').toUpperCase());
      const assetType = this.getSliceLabel(slice);
      const availableScaleCount = Object.keys(availableScales).filter(scale => allowedScales.includes(scale)).length;
      const sizeText = `${slice.width || '--'} × ${slice.height || '--'}`;
      const metaText = availableScaleCount > 0
        ? `${sizeText} · ${availableScaleCount} 个规格`
        : `${sizeText} · 1 个默认规格`;

      // 根据平台和可用倍率生成按钮
      let scaleBtns = allowedScales
        .filter(s => availableScales[s])
        .map(scale =>
          `<button class="btn btn-small btn-secondary slice-scale-btn" onclick="app.downloadSliceWithScale(${index}, '${scale}')" title="${scale}">${scale.toUpperCase()}</button>`
        ).join('');

      // 如果没有生成任何按钮，使用默认下载按钮
      if (!scaleBtns) {
        const defaultUrl = slice.defaultUrl || slice.url;
        if (defaultUrl) {
          scaleBtns = `<button class="btn btn-small btn-secondary slice-scale-btn" onclick="app.downloadSlice(${index})">下载</button>`;
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
            <div class="slice-title-row">
              <div class="slice-name" title="${safeAttrName}">${safeName}</div>
              <span class="slice-format-badge">${formatLabel}</span>
            </div>
            <div class="slice-meta">${this.escapeHtml(metaText)} · ${this.escapeHtml(assetType)}</div>
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

  // 读取蓝湖生成代码并展示在右侧预览
  async generateHtmlPreview() {
    if (this.isGeneratingHtmlPreview) {
      this.showToast(`${this.getGeneratedFrameworkLabel()} 代码正在加载中...`);
      return;
    }

    if (!this.selectedDesignId) {
      this.showToast('请先选择设计图', 'error');
      return;
    }

    const design = this.designs?.find(d => d.id === this.selectedDesignId);
    if (!design) {
      this.showToast('未找到当前设计图数据', 'error');
      return;
    }

    const designId = this.selectedDesignId;
    const targetFramework = this.getSelectedGeneratedFramework();
    const frameworkLabel = this.getGeneratedFrameworkLabel(targetFramework);

    if (this.hasGeneratedCodeForCurrentDesign()) {
      this.showHtmlPreview({
        revealCodePanel: true
      });
      this.showToast(`${frameworkLabel} 代码已展开`, 'success');
      return;
    }

    if (this.restoreGeneratedCodeCache(design, {
      autoShow: true,
      revealCodePanel: true,
      framework: targetFramework
    })) {
      this.showToast(`已从缓存恢复 ${frameworkLabel} 代码`, 'success');
      return;
    }

    this.generatedCodePollToken += 1;
    const pollToken = this.generatedCodePollToken;
    this.stopGeneratedCodePolling();
    this.isGeneratingHtmlPreview = true;
    this.generatedCodeJobId = '';
    const initialTask = {
      ...this.createInitialGeneratedCodeTaskState(),
      status: 'queued',
      stepKey: 'queued',
      stepLabel: '任务已创建',
      currentAction: `正在提交 ${frameworkLabel} 代码生成任务...`,
      progressPercent: 2
    };
    this.generatedCodeFramework = '';
    this.log(`开始读取蓝湖 ${frameworkLabel} 代码...`, 'info');
    this.showToast(`正在读取 ${frameworkLabel} 代码...`);
    this.prepareGeneratedCodeTaskWorkspace(initialTask, { showCodePanel: true, autoShow: true });

    try {
      const response = await fetch('/api/generated-code/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': this.sessionId
        },
        body: JSON.stringify({
          teamId: this.currentTeamId,
          projectId: this.currentProjectId,
          imageId: designId,
          framework: targetFramework
        })
      });

      const { payload: data, errorMessage } = await this.readGeneratedCodeApiResponse(
        response,
        '/api/generated-code/start',
        '读取蓝湖代码失败'
      );
      if (!response.ok || data?.success === false) {
        throw new Error(errorMessage);
      }

      const job = data?.job;
      if (!job?.id) {
        throw new Error('未获取到代码生成任务 ID');
      }

      this.setGeneratedCodeJobCache(job, design, targetFramework);

      if (pollToken !== this.generatedCodePollToken) {
        return;
      }

      this.applyGeneratedCodeJobState(job);
      await this.trackGeneratedCodeJob(job.id, design, pollToken, {
        framework: targetFramework,
        notifyOnSuccess: true,
        notifyOnError: true
      });
    } catch (e) {
      if (pollToken !== this.generatedCodePollToken) {
        return;
      }
      const displayErrorMessage = this.getGeneratedCodeDisplayErrorMessage(e, this.generatedCodeTask);
      this.generatedCodeTask = {
        ...this.generatedCodeTask,
        id: this.generatedCodeJobId || this.generatedCodeTask?.id || '',
        status: 'error',
        errorMessage: displayErrorMessage,
        currentAction: displayErrorMessage,
        updatedAt: Date.now()
      };
      if (this.generatedCodeTask.id) {
        this.setGeneratedCodeJobCache(this.generatedCodeTask, design, targetFramework);
      }
      this.renderGeneratedCodeTask();
      this.updateGeneratedCodeMeta();
      this.log(`读取蓝湖 ${frameworkLabel} 代码失败: ${displayErrorMessage}`, 'error');
      this.showToast(`读取蓝湖 ${frameworkLabel} 代码失败: ${displayErrorMessage}`, 'error');
    } finally {
      if (pollToken === this.generatedCodePollToken) {
        this.stopGeneratedCodePolling(false);
        this.isGeneratingHtmlPreview = false;
        this.updateGenerateHtmlButtonState();
      }
    }
  }

  shouldCollapseCodePanelByDefault() {
    return window.innerWidth <= 1450;
  }

  shouldStackCodePanelBelowPreview() {
    return window.innerWidth <= 1280;
  }

  hasGeneratedCodeForCurrentDesign() {
    const targetFramework = this.getSelectedGeneratedFramework();
    return Boolean(
      this.generatedHtmlDesignId &&
      this.generatedHtmlDesignId === this.selectedDesignId &&
      this.generatedCodeFramework === targetFramework &&
      Array.isArray(this.generatedCodeFiles) &&
      this.generatedCodeFiles.length > 0
    );
  }

  hasGeneratedCodePanelContent() {
    const taskStatus = String(this.generatedCodeTask?.status || 'idle').trim() || 'idle';
    const design = this.getSelectedDesign();
    const targetFramework = this.getSelectedGeneratedFramework();
    const resumableJob = design ? this.getGeneratedCodeJobCache(design, targetFramework) : null;
    const matchesCurrentFramework = this.generatedCodeFramework === targetFramework;
    return this.hasGeneratedCodeForCurrentDesign() ||
      Boolean(resumableJob) ||
      (matchesCurrentFramework && ['queued', 'running', 'error'].includes(taskStatus));
  }

  canOpenGeneratedCodePanel() {
    return Boolean(this.getSelectedDesign());
  }

  updateGeneratedCodePanelToggleButton() {
    if (!this.toggleCodePanelBtn) return;

    const canToggle = this.canOpenGeneratedCodePanel();
    const hasPanelContent = this.hasGeneratedCodePanelContent();
    this.toggleCodePanelBtn.hidden = !canToggle;
    this.toggleCodePanelBtn.disabled = !canToggle;
    this.toggleCodePanelBtn.classList.toggle('active', this.isCodePanelVisible);
    this.toggleCodePanelBtn.textContent = this.isCodePanelVisible ? '收起代码' : '代码面板';
    this.toggleCodePanelBtn.title = this.isCodePanelVisible
      ? '收起代码与进度弹窗'
      : hasPanelContent
        ? '打开代码与进度弹窗'
        : '打开代码与进度弹窗（当前框架尚未生成）';
  }

  setCodePanelVisibility(visible) {
    this.isCodePanelVisible = Boolean(visible);

    if (this.htmlPreviewModal) {
      this.htmlPreviewModal.hidden = !this.isCodePanelVisible;
    }
    document.body.classList.toggle('code-panel-modal-open', this.isCodePanelVisible);

    this.updateGeneratedCodePanelToggleButton();
  }

  scrollCodePanelIntoView() {
    if (!this.shouldStackCodePanelBelowPreview() || !this.previewBody || !this.htmlPreviewPanel || this.htmlPreviewPanel.hidden) {
      return;
    }

    const bodyRect = this.previewBody.getBoundingClientRect();
    const panelRect = this.htmlPreviewPanel.getBoundingClientRect();
    const top = this.previewBody.scrollTop + (panelRect.top - bodyRect.top) - 12;
    this.previewBody.scrollTo({
      top: Math.max(0, top),
      behavior: 'smooth'
    });
  }

  scrollPreviewWorkspaceToTop() {
    if (!this.shouldStackCodePanelBelowPreview() || !this.previewBody) {
      return;
    }

    this.previewBody.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }

  toggleCodePanel() {
    if (!this.canOpenGeneratedCodePanel()) {
      this.showToast('请先选择设计图');
      return;
    }

    this.setCodePanelVisibility(!this.isCodePanelVisible);
  }

  showGeneratedCodePanel({ showCodePanel = true } = {}) {
    this.setCodePanelVisibility(showCodePanel);
    if (this.generateHtmlBtn) {
      this.generateHtmlBtn.classList.add('active');
    }
  }

  stopGeneratedCodePolling(resetJobId = true) {
    if (this.generatedCodePollTimer) {
      clearTimeout(this.generatedCodePollTimer);
      this.generatedCodePollTimer = null;
    }
    if (typeof this.generatedCodePollResolve === 'function') {
      const resolve = this.generatedCodePollResolve;
      this.generatedCodePollResolve = null;
      resolve();
    }
    if (resetJobId) {
      this.generatedCodeJobId = '';
    }
  }

  cancelGeneratedCodeTracking(resetTask = false) {
    this.generatedCodePollToken += 1;
    this.stopGeneratedCodePolling();
    this.isGeneratingHtmlPreview = false;
    this.updateGenerateHtmlButtonState();
    if (resetTask) {
      this.generatedCodeTask = this.createInitialGeneratedCodeTaskState();
      this.renderGeneratedCodeTask();
      this.updateGeneratedCodeMeta();
    }
  }

  async trackGeneratedCodeJob(jobId, design = null, pollToken = this.generatedCodePollToken, {
    framework = 'html',
    notifyOnSuccess = true,
    notifyOnError = true
  } = {}) {
    const resolvedDesign = this.resolveDesignEntity(design);
    const frameworkLabel = this.getGeneratedFrameworkLabel(framework);

    try {
      const completedJob = await this.waitForGeneratedCodeJob(jobId, pollToken, {
        design: resolvedDesign,
        framework
      });
      if (!completedJob || pollToken !== this.generatedCodePollToken) {
        return null;
      }

      this.consumeGeneratedCodeResult(completedJob.result, resolvedDesign?.id || this.selectedDesignId);
      if (notifyOnSuccess) {
        this.showToast(`${frameworkLabel} 代码已加载`, 'success');
      }
      return completedJob;
    } catch (error) {
      if (pollToken !== this.generatedCodePollToken) {
        return null;
      }

      const displayErrorMessage = this.getGeneratedCodeDisplayErrorMessage(error, this.generatedCodeTask);
      this.generatedCodeTask = this.normalizeGeneratedCodeTaskState({
        ...this.generatedCodeTask,
        id: jobId || this.generatedCodeTask?.id || '',
        status: 'error',
        errorMessage: displayErrorMessage,
        currentAction: displayErrorMessage,
        updatedAt: Date.now()
      });

      if (error?.clearGeneratedCodeJobCache) {
        this.clearGeneratedCodeJobCacheEntry(resolvedDesign, framework);
      } else if (this.generatedCodeTask.id) {
        this.setGeneratedCodeJobCache(this.generatedCodeTask, resolvedDesign, framework);
      }

      this.renderGeneratedCodeTask();
      this.updateGeneratedCodeMeta();
      this.log(`读取 ${frameworkLabel} 代码失败: ${displayErrorMessage}`, 'error');
      if (notifyOnError) {
        this.showToast(`读取 ${frameworkLabel} 代码失败: ${displayErrorMessage}`, 'error');
      }
      return null;
    } finally {
      if (pollToken === this.generatedCodePollToken) {
        this.stopGeneratedCodePolling(false);
        this.isGeneratingHtmlPreview = false;
        this.updateGenerateHtmlButtonState();
      }
    }
  }

  restoreGeneratedCodeJob(design = null, {
    autoShow = true,
    silent = true,
    framework = this.getSelectedGeneratedFramework()
  } = {}) {
    const resolvedDesign = this.resolveDesignEntity(design);
    if (!resolvedDesign) return false;

    const targetFramework = this.normalizeGeneratedFrameworkValue(framework || this.getSelectedGeneratedFramework());
    const cachedPayload = this.getGeneratedCodeCache(resolvedDesign, targetFramework);
    if (cachedPayload) {
      this.clearGeneratedCodeJobCacheEntry(resolvedDesign, targetFramework);
      return false;
    }

    const jobEntry = this.getGeneratedCodeJobCache(resolvedDesign, targetFramework);
    if (!jobEntry?.jobId) return false;

    this.generatedCodePollToken += 1;
    const pollToken = this.generatedCodePollToken;
    this.stopGeneratedCodePolling();

    const taskStatus = jobEntry.task?.status || 'queued';
    const restoredMessage = taskStatus === 'success'
      ? '后台任务已完成，正在同步结果...'
      : taskStatus === 'error'
        ? '已恢复上次失败记录'
        : '已恢复进行中的蓝湖代码任务';
    const restoredTask = this.appendGeneratedCodeTaskLog({
      ...jobEntry.task,
      id: jobEntry.jobId,
      status: taskStatus === 'success' ? 'running' : taskStatus,
      currentAction: taskStatus === 'success'
        ? '后台任务已完成，正在同步结果...'
        : taskStatus === 'error'
          ? (jobEntry.task?.errorMessage || jobEntry.task?.currentAction || '读取蓝湖代码失败')
          : `已恢复任务进度，${jobEntry.task?.currentAction || '继续读取中...'}`,
      progressPercent: taskStatus === 'success'
        ? Math.max(96, Number(jobEntry.task?.progressPercent) || 0)
        : Number(jobEntry.task?.progressPercent) || 0,
      updatedAt: Date.now()
    }, restoredMessage, taskStatus === 'error' ? 'error' : 'info');

    this.generatedCodeFramework = this.normalizeGeneratedFrameworkValue(jobEntry.framework || targetFramework);
    this.generatedCodeJobId = jobEntry.jobId;
    this.isGeneratingHtmlPreview = taskStatus !== 'error';
    this.prepareGeneratedCodeTaskWorkspace(restoredTask, { showCodePanel: true, autoShow });

    if (!silent) {
      this.showToast(taskStatus === 'error' ? '已恢复上次失败信息' : '已恢复蓝湖代码生成进度');
    }

    if (taskStatus === 'error') {
      this.setGeneratedCodeJobCache(restoredTask, resolvedDesign, jobEntry.framework || targetFramework);
      return true;
    }

    this.log(taskStatus === 'success'
      ? '已接回后台完成的蓝湖代码任务，正在同步结果...'
      : '已恢复蓝湖代码生成进度', 'info');
    void this.trackGeneratedCodeJob(jobEntry.jobId, resolvedDesign, pollToken, {
      framework: jobEntry.framework || targetFramework,
      notifyOnSuccess: !silent,
      notifyOnError: !silent
    });
    return true;
  }

  applyGeneratedCodeJobState(job) {
    if (!job || typeof job !== 'object') {
      return;
    }

    const { result, ...jobState } = job;
    this.generatedCodeJobId = job.id || this.generatedCodeJobId;
    this.generatedCodeTask = this.normalizeGeneratedCodeTaskState({
      ...this.createInitialGeneratedCodeTaskState(),
      ...jobState,
      logs: Array.isArray(job.logs) ? job.logs : []
    });
    this.renderGeneratedCodeTask();
    this.updateGeneratedCodeMeta();
  }

  applyGeneratedCodePayload(payload, designId, { fromCache = false } = {}) {
    this.generatedCodeFramework = this.normalizeGeneratedFrameworkValue(payload?.framework?.value || payload?.framework || 'html');
    this.selectedGeneratedFramework = this.generatedCodeFramework;
    this.saveGeneratedFrameworkPreference();
    this.syncGeneratedFrameworkSelect();
    this.generatedCodeFiles = Array.isArray(payload?.files)
      ? payload.files.filter((file) => file && file.name && typeof file.content === 'string')
      : [];
    this.generatedPreviewHtml = String(payload?.previewHtml || '');
    this.generatedPreviewRepairState = this.createInitialGeneratedPreviewRepairState();
    this.generatedHtmlDesignId = designId;

    const preferredFileName = String(payload?.selectedFileName || '').trim();
    this.generatedCodeFileName = preferredFileName ||
      this.generatedCodeFiles.find((file) => file.isPrimary)?.name ||
      this.generatedCodeFiles[0]?.name ||
      '';

    if (!this.generatedCodeFiles.length) {
      throw new Error('蓝湖未返回可用代码文件');
    }

    if (fromCache) {
      this.generatedCodeTask = this.createGeneratedCodeCachedTaskState(payload);
      this.renderGeneratedCodeTask();
      this.updateGeneratedCodeMeta();
    }
  }

  renderGeneratedCodeTask() {
    const task = this.generatedCodeTask || this.createInitialGeneratedCodeTaskState();
    const totalSteps = Math.max(1, Number(task.totalSteps) || 6);
    const currentStep = Math.min(totalSteps, Math.max(0, Number(task.currentStep) || 0));
    const progressPercent = Math.max(0, Math.min(100, Number(task.progressPercent) || 0));
    const logs = Array.isArray(task.logs) ? task.logs.slice(-4) : [];

    if (this.generatedCodeTaskCard) {
      this.generatedCodeTaskCard.dataset.status = task.status || 'idle';
    }
    if (this.generatedCodeTaskStep) {
      this.generatedCodeTaskStep.textContent = task.stepLabel || '等待开始';
    }
    if (this.generatedCodeProgressText) {
      this.generatedCodeProgressText.textContent = `${progressPercent}%`;
    }
    if (this.generatedCodeTaskMeta) {
      if (task.status === 'success') {
        this.generatedCodeTaskMeta.textContent = `已完成 · ${totalSteps} / ${totalSteps}`;
      } else if (task.status === 'error') {
        this.generatedCodeTaskMeta.textContent = `中断于 ${currentStep || '-'} / ${totalSteps}`;
      } else if (task.status === 'queued') {
        this.generatedCodeTaskMeta.textContent = `排队中 · 0 / ${totalSteps}`;
      } else {
        this.generatedCodeTaskMeta.textContent = `${currentStep} / ${totalSteps}`;
      }
    }
    if (this.generatedCodeProgressBar) {
      this.generatedCodeProgressBar.style.width = `${progressPercent}%`;
    }
    if (this.generatedCodeCurrentAction) {
      const errorMessage = task.errorMessage ? `失败原因：${task.errorMessage}` : '';
      this.generatedCodeCurrentAction.textContent = errorMessage || task.currentAction || '等待开始';
    }
    if (this.generatedCodeLogList) {
      this.generatedCodeLogList.innerHTML = logs.length
        ? logs.map((log) => {
            const type = this.escapeAttr(log.type || 'info');
            return `
              <div class="generated-task-log-item ${type}">
                <span class="generated-task-log-time">${this.escapeHtml(log.time || '--:--:--')}</span>
                <span class="generated-task-log-message">${this.escapeHtml(log.message || '')}</span>
              </div>
            `;
          }).join('')
        : '<div class="generated-task-log-item placeholder">生成中的关键日志会显示在这里。</div>';
    }
  }

  async waitForGeneratedCodeJob(jobId, pollToken, { design = null, framework = 'html' } = {}) {
    while (pollToken === this.generatedCodePollToken) {
      const response = await fetch(`/api/generated-code/jobs/${encodeURIComponent(jobId)}`, {
        headers: {
          'X-Session-Id': this.sessionId
        }
      });

      const { payload: data, errorMessage } = await this.readGeneratedCodeApiResponse(
        response,
        `/api/generated-code/jobs/${encodeURIComponent(jobId)}`,
        '获取蓝湖代码生成进度失败'
      );
      if (pollToken !== this.generatedCodePollToken) {
        return null;
      }

      if (!response.ok || data?.success === false) {
        const requestError = new Error(errorMessage);
        if (response.status === 401 || response.status === 404) {
          requestError.clearGeneratedCodeJobCache = true;
        }
        throw requestError;
      }

      const job = data?.job;
      if (!job) {
        const missingJobError = new Error('未获取到蓝湖代码生成状态');
        missingJobError.clearGeneratedCodeJobCache = true;
        throw missingJobError;
      }

      this.setGeneratedCodeJobCache(job, design, framework);
      this.applyGeneratedCodeJobState(job);

      if (job.status === 'success') {
        return job;
      }

      if (job.status === 'error') {
        throw new Error(job.errorMessage || job.currentAction || '读取蓝湖代码失败');
      }

      await new Promise((resolve) => {
        this.generatedCodePollResolve = resolve;
        this.generatedCodePollTimer = window.setTimeout(() => {
          this.generatedCodePollTimer = null;
          this.generatedCodePollResolve = null;
          resolve();
        }, 900);
      });
    }

    return null;
  }

  consumeGeneratedCodeResult(result, designId) {
    this.applyGeneratedCodePayload(result, designId);
    const isCached = this.setGeneratedCodeCache(designId);
    if (isCached) {
      this.clearGeneratedCodeJobCacheEntry(designId, this.generatedCodeFramework || 'html');
    }
    this.showHtmlPreview({ revealCodePanel: !this.generatedPreviewHtml || this.isCodePanelVisible });
    if (!isCached) {
      this.log('蓝湖代码已加载，但本地缓存写入失败，可能是浏览器存储空间不足', 'warn');
    }
    this.log(`${this.getGeneratedFrameworkLabel(this.generatedCodeFramework)} 代码读取完成，文件数: ${this.generatedCodeFiles.length}`, 'success');
  }

  restoreGeneratedCodeCache(design = null, {
    autoShow = true,
    revealCodePanel,
    framework = this.getSelectedGeneratedFramework()
  } = {}) {
    const resolvedDesign = this.resolveDesignEntity(design);
    if (!resolvedDesign) return false;

    const targetFramework = this.normalizeGeneratedFrameworkValue(framework || this.getSelectedGeneratedFramework());
    const cachedPayload = this.getGeneratedCodeCache(resolvedDesign, targetFramework);
    if (!cachedPayload) return false;

    try {
      this.applyGeneratedCodePayload(cachedPayload, resolvedDesign.id, { fromCache: true });
      this.clearGeneratedCodeJobCacheEntry(resolvedDesign, targetFramework);
      if (autoShow) {
        this.showHtmlPreview({ revealCodePanel });
      } else {
        this.refreshGeneratedCodeOutput();
      }
      this.updateGenerateHtmlButtonState();
      return true;
    } catch (error) {
      const cacheKey = this.getGeneratedCodeCacheKey(resolvedDesign, targetFramework);
      if (cacheKey && this.generatedCodeCache[cacheKey]) {
        delete this.generatedCodeCache[cacheKey];
        this.saveGeneratedCodeCache();
      }
      return false;
    }
  }

  getSelectedDesignDisplayName() {
    const selectedDesign = this.designs?.find((item) => item.id === this.selectedDesignId);
    const designName = this.decodeHtmlEntities(selectedDesign?.name || '').trim();
    return designName || this.previewName?.textContent || '当前设计图';
  }

  updateDesignPreviewFrameLabel(designName = '') {
    if (!this.designPreviewFrameLabel) return;
    const resolvedName = this.decodeHtmlEntities(String(designName || '')).trim() || '当前设计图';
    this.designPreviewFrameLabel.textContent = `${resolvedName} · 设计稿`;
  }

  createGeneratedPreviewDiagnosticsToken() {
    return `diag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  getGeneratedPreviewDiagnosticsDisplayState(state = this.generatedPreviewDiagnostics) {
    const normalizedState = state || this.createInitialGeneratedPreviewDiagnostics();
    const report = normalizedState.report;
    const issues = Array.isArray(report?.issues) ? report.issues : [];
    const hasError = issues.some((issue) => issue.level === 'error');

    if (normalizedState.status === 'pending') {
      return { status: 'pending', label: '采集中' };
    }
    if (!report) {
      if (normalizedState.status === 'unavailable') {
        return { status: 'idle', label: '不可用' };
      }
      return { status: 'idle', label: '未运行' };
    }
    if (hasError) {
      return { status: 'error', label: `${issues.filter((issue) => issue.level === 'error').length} 个异常` };
    }
    if (issues.length > 0) {
      return { status: 'issues', label: `${issues.length} 个提示` };
    }
    return { status: 'ready', label: '通过' };
  }

  formatGeneratedPreviewDiagnosticsTime(timestamp) {
    const value = Number(timestamp) || 0;
    if (!value) return '--:--:--';
    try {
      return new Date(value).toLocaleTimeString();
    } catch (e) {
      return '--:--:--';
    }
  }

  normalizeGeneratedPreviewDiagnosticsReport(payload = {}) {
    const report = payload && typeof payload === 'object' ? payload : {};
    const summarySource = report.summary && typeof report.summary === 'object' ? report.summary : {};
    const normalizeCounter = (source = {}) => ({
      total: Math.max(0, Number(source.total) || 0),
      loaded: Math.max(0, Number(source.loaded) || 0),
      failed: Math.max(0, Number(source.failed) || 0),
      pending: Math.max(0, Number(source.pending) || 0)
    });
    const normalizeCssCounter = (source = {}) => ({
      ...normalizeCounter(source),
      sampled: Math.max(0, Number(source.sampled) || 0),
      failedSamples: Array.isArray(source.failedSamples)
        ? source.failedSamples.map((item) => String(item || '').trim().slice(0, 220)).filter(Boolean).slice(0, 4)
        : []
    });
    const normalizeIssue = (issue = {}) => ({
      level: ['error', 'warn', 'info'].includes(String(issue.level || '').trim()) ? String(issue.level).trim() : 'info',
      label: String(issue.label || '').trim().slice(0, 120) || '未命名诊断项',
      detail: String(issue.detail || '').trim().slice(0, 600)
    });
    const normalizeRoot = (item = {}) => ({
      selector: String(item.selector || '').trim().slice(0, 160),
      width: Math.max(0, Number(item.width) || 0),
      height: Math.max(0, Number(item.height) || 0),
      childCount: Math.max(0, Number(item.childCount) || 0)
    });
    const normalizeVisualLayer = (item = {}) => ({
      selector: String(item.selector || '').trim().slice(0, 160),
      kind: String(item.kind || '').trim().slice(0, 48),
      width: Math.max(0, Number(item.width) || 0),
      height: Math.max(0, Number(item.height) || 0),
      area: Math.max(0, Number(item.area) || 0),
      opacity: Math.max(0, Number(item.opacity) || 0),
      zIndex: String(item.zIndex || '').trim().slice(0, 32),
      flags: Array.isArray(item.flags)
        ? item.flags.map((flag) => String(flag || '').trim().slice(0, 40)).filter(Boolean).slice(0, 6)
        : []
    });
    const normalizeRisk = (source = {}) => ({
      transformCount: Math.max(0, Number(source.transformCount) || 0),
      overflowHiddenCount: Math.max(0, Number(source.overflowHiddenCount) || 0),
      clipPathCount: Math.max(0, Number(source.clipPathCount) || 0),
      maskCount: Math.max(0, Number(source.maskCount) || 0),
      blendModeCount: Math.max(0, Number(source.blendModeCount) || 0),
      backdropFilterCount: Math.max(0, Number(source.backdropFilterCount) || 0),
      pseudoElementCount: Math.max(0, Number(source.pseudoElementCount) || 0),
      pseudoAssetCount: Math.max(0, Number(source.pseudoAssetCount) || 0)
    });

    return {
      token: String(report.token || '').trim(),
      trigger: String(report.trigger || '').trim(),
      generatedAt: Number(report.generatedAt) || Date.now(),
      summary: {
        title: String(summarySource.title || '').trim().slice(0, 160),
        viewportWidth: Math.max(0, Number(summarySource.viewportWidth) || 0),
        viewportHeight: Math.max(0, Number(summarySource.viewportHeight) || 0),
        scrollWidth: Math.max(0, Number(summarySource.scrollWidth) || 0),
        scrollHeight: Math.max(0, Number(summarySource.scrollHeight) || 0),
        elementCount: Math.max(0, Number(summarySource.elementCount) || 0),
        bodyChildCount: Math.max(0, Number(summarySource.bodyChildCount) || 0),
        absoluteElementCount: Math.max(0, Number(summarySource.absoluteElementCount) || 0),
        textLength: Math.max(0, Number(summarySource.textLength) || 0),
        images: normalizeCounter(summarySource.images),
        cssImages: normalizeCssCounter(summarySource.cssImages),
        stylesheets: normalizeCounter(summarySource.stylesheets),
        scripts: normalizeCounter(summarySource.scripts),
        risk: normalizeRisk(summarySource.risk),
        roots: Array.isArray(summarySource.roots)
          ? summarySource.roots.map((item) => normalizeRoot(item)).filter((item) => item.selector).slice(0, 4)
          : [],
        visualLayers: Array.isArray(summarySource.visualLayers)
          ? summarySource.visualLayers.map((item) => normalizeVisualLayer(item)).filter((item) => item.selector).slice(0, 6)
          : []
      },
      issues: Array.isArray(report.issues)
        ? report.issues.map((issue) => normalizeIssue(issue)).filter((issue) => issue.label).slice(0, 12)
        : []
    };
  }

  buildGeneratedPreviewDiagnosticsSummary(report) {
    const summary = report?.summary;
    if (!summary) {
      return '预览加载后会自动采集资源、脚本和页面结构信息。';
    }

    const pieces = [];
    if (summary.scrollWidth > 0 && summary.scrollHeight > 0) {
      pieces.push(`页面尺寸 ${summary.scrollWidth} × ${summary.scrollHeight}`);
    } else if (summary.viewportWidth > 0 && summary.viewportHeight > 0) {
      pieces.push(`视口尺寸 ${summary.viewportWidth} × ${summary.viewportHeight}`);
    }
    if (summary.elementCount > 0) {
      pieces.push(`DOM ${summary.elementCount} 节点`);
    }
    if (summary.images.total > 0) {
      pieces.push(`图片 ${summary.images.loaded}/${summary.images.total}`);
    }
    if (summary.cssImages.total > 0) {
      pieces.push(`CSS装饰 ${summary.cssImages.total}`);
    }
    if (summary.stylesheets.total > 0) {
      pieces.push(`样式 ${summary.stylesheets.loaded}/${summary.stylesheets.total}`);
    }
    if (summary.scripts.total > 0) {
      pieces.push(`脚本 ${summary.scripts.loaded}/${summary.scripts.total}`);
    }
    if (summary.absoluteElementCount > 0) {
      pieces.push(`绝对定位 ${summary.absoluteElementCount}`);
    }
    return pieces.join(' · ') || '预览结构已采集，但暂无足够的统计信息。';
  }

  buildGeneratedPreviewDiagnosticsRiskSummary(summary = null) {
    const risk = summary?.risk;
    if (!summary || !risk) return '';

    const parts = [];
    if (summary.cssImages.total > 0) {
      const checked = summary.cssImages.loaded + summary.cssImages.failed;
      const checkedText = checked > 0 ? `，已校验 ${checked}` : '';
      const failedText = summary.cssImages.failed > 0 ? `，失败 ${summary.cssImages.failed}` : '';
      parts.push(`CSS 装饰资源 ${summary.cssImages.total}${checkedText}${failedText}`);
    }
    if (risk.pseudoElementCount > 0) {
      parts.push(`伪元素 ${risk.pseudoElementCount}`);
    }
    if (risk.maskCount > 0) {
      parts.push(`mask ${risk.maskCount}`);
    }
    if (risk.clipPathCount > 0) {
      parts.push(`clip-path ${risk.clipPathCount}`);
    }
    if (risk.blendModeCount > 0) {
      parts.push(`blend-mode ${risk.blendModeCount}`);
    }
    if (risk.backdropFilterCount > 0) {
      parts.push(`backdrop-filter ${risk.backdropFilterCount}`);
    }
    if (risk.transformCount > 0) {
      parts.push(`transform ${risk.transformCount}`);
    }
    if (risk.overflowHiddenCount > 0) {
      parts.push(`overflow hidden ${risk.overflowHiddenCount}`);
    }
    return parts.join(' · ');
  }

  buildGeneratedPreviewDiagnosticsItems(report) {
    if (!report?.summary) {
      return [{
        level: 'info',
        label: '等待诊断',
        detail: '预览加载完成后，这里会显示资源失败、脚本报错和页面结构摘要。'
      }];
    }

    const items = [];
    items.push({
      level: 'info',
      label: '页面概览',
      detail: this.buildGeneratedPreviewDiagnosticsSummary(report)
    });

    if (report.summary.roots.length > 0) {
      const rootSummary = report.summary.roots
        .map((root) => `${root.selector} (${root.width}×${root.height}，子节点 ${root.childCount})`)
        .join('；');
      items.push({
        level: 'info',
        label: '首层容器',
        detail: rootSummary
      });
    }

    if (report.summary.visualLayers.length > 0) {
      const layerSummary = report.summary.visualLayers
        .map((layer) => {
          const flags = layer.flags.length ? `，${layer.flags.join('/')}` : '';
          const zIndex = layer.zIndex ? `，z=${layer.zIndex}` : '';
          return `${layer.selector} [${layer.kind}] (${layer.width}×${layer.height}${zIndex}${flags})`;
        })
        .join('；');
      items.push({
        level: 'info',
        label: '关键视觉层',
        detail: layerSummary
      });
    }

    const riskSummary = this.buildGeneratedPreviewDiagnosticsRiskSummary(report.summary);
    if (riskSummary) {
      const hasRiskWarning = Array.isArray(report.issues)
        ? report.issues.some((issue) => issue.level === 'warn' && /高保真|CSS 装饰|复杂样式/.test(issue.label || issue.detail || ''))
        : false;
      items.push({
        level: hasRiskWarning ? 'warn' : 'info',
        label: '高保真信号',
        detail: riskSummary
      });
    }

    if (Array.isArray(report.issues) && report.issues.length > 0) {
      items.push(...report.issues);
    } else {
      items.push({
        level: 'info',
        label: '未发现明显异常',
        detail: '当前预览没有检测到基础资源失败或显式脚本错误。若视觉仍异常，优先检查蓝湖导出代码本身的布局策略。'
      });
    }

    return items.slice(0, 12);
  }

  renderGeneratedPreviewDiagnostics() {
    const state = this.generatedPreviewDiagnostics || this.createInitialGeneratedPreviewDiagnostics();
    const report = state.report;
    const hasPreview = Boolean(this.generatedPreviewHtml);
    const displayState = this.getGeneratedPreviewDiagnosticsDisplayState(state);
    const items = this.buildGeneratedPreviewDiagnosticsItems(report);

    if (this.generatedDiagnosticsCard) {
      this.generatedDiagnosticsCard.hidden = !hasPreview && !report && state.status !== 'pending';
    }

    if (this.generatedDiagnosticsMeta) {
      this.generatedDiagnosticsMeta.textContent = report
        ? `最近更新 ${this.formatGeneratedPreviewDiagnosticsTime(state.updatedAt || report.generatedAt)}${state.trigger ? ` · ${state.trigger === 'manual' ? '手动触发' : '自动触发'}` : ''}`
        : hasPreview
          ? (state.status === 'pending' ? '正在等待预览页上报诊断信息' : '预览加载后会自动开始采集')
          : '当前没有可诊断的 HTML 预览';
    }

    if (this.generatedDiagnosticsStatus) {
      this.generatedDiagnosticsStatus.dataset.status = displayState.status;
      this.generatedDiagnosticsStatus.textContent = displayState.label;
    }

    if (this.generatedDiagnosticsSummary) {
      this.generatedDiagnosticsSummary.textContent = state.status === 'pending'
        ? '正在采集当前预览的资源、脚本和布局摘要，请稍候。'
        : this.buildGeneratedPreviewDiagnosticsSummary(report);
    }

    if (this.generatedDiagnosticsList) {
      this.generatedDiagnosticsList.innerHTML = items.map((item) => `
        <div class="generated-diagnostics-item${item.detail ? '' : ' placeholder'}" data-level="${this.escapeAttr(item.level || 'info')}">
          <span class="generated-diagnostics-item-label">${this.escapeHtml(item.label || '未命名诊断项')}</span>
          <span class="generated-diagnostics-item-detail">${this.escapeHtml(item.detail || '')}</span>
        </div>
      `).join('');
    }

    if (this.runDiagnosticsBtn) {
      this.runDiagnosticsBtn.disabled = !hasPreview || state.status === 'pending';
      this.runDiagnosticsBtn.title = hasPreview
        ? (state.status === 'pending' ? '正在采集预览诊断，请稍候' : '重新采集当前预览的诊断信息')
        : '当前没有可诊断的 HTML 预览';
    }
  }

  handleGeneratedPreviewDiagnostics(payload = {}) {
    const report = this.normalizeGeneratedPreviewDiagnosticsReport(payload);
    const currentToken = String(this.generatedPreviewDiagnostics?.token || '').trim();
    if (currentToken && report.token && report.token !== currentToken) {
      return;
    }

    this.generatedPreviewDiagnostics = {
      token: report.token || currentToken,
      status: 'ready',
      updatedAt: report.generatedAt || Date.now(),
      trigger: report.trigger || 'auto',
      report
    };
    this.renderGeneratedPreviewDiagnostics();
    if (this.getGeneratedPreviewRepairMode() === 'dds') {
      this.maybeSwitchGeneratedPreviewRepairMode(report);
    }
  }

  runGeneratedPreviewDiagnostics() {
    if (!this.generatedPreviewHtml) {
      this.showToast('当前没有可诊断的 HTML 预览', 'error');
      return;
    }

    const diagnosticsApi = this.htmlPreviewFrame?.contentWindow?.__LANHU_GENERATED_PREVIEW_DIAGNOSTICS__;
    if (diagnosticsApi && typeof diagnosticsApi.publish === 'function') {
      this.generatedPreviewDiagnostics = {
        ...this.generatedPreviewDiagnostics,
        status: 'pending',
        updatedAt: Date.now(),
        trigger: 'manual'
      };
      this.renderGeneratedPreviewDiagnostics();
      diagnosticsApi.publish('manual');
      return;
    }

    this.showToast('预览尚未准备好，正在重新加载诊断环境', 'success');
    this.showHtmlPreview({ revealCodePanel: this.isCodePanelVisible });
  }

  collectExpectedGeneratedPreviewModules(layerContext, frameMetrics) {
    if (!layerContext || !Array.isArray(layerContext.layers) || !layerContext.layers.length || !frameMetrics) {
      return [];
    }

    const modulePrefixes = new Set();
    layerContext.layers.forEach((layer) => {
      if (!layer || layer.visible === false || !layer.has_image) return;
      const prefix = this.getLayerModulePrefix(layer.path || layer.name || '');
      if (prefix) {
        modulePrefixes.add(prefix);
      }
    });

    const pageArea = Math.max(1, frameMetrics.width * frameMetrics.height);
    return Array.from(modulePrefixes)
      .map((pathPrefix) => {
        const moduleLayers = layerContext.layers.filter((layer) => {
          if (!layer || layer.visible === false) return false;
          const layerPath = String(layer.path || '').trim();
          return layerPath === pathPrefix || layerPath.startsWith(`${pathPrefix}/`);
        });
        if (!moduleLayers.length) return null;

        const imageLayers = moduleLayers.filter((layer) => layer.has_image);
        if (!imageLayers.length) return null;

        const moduleData = this.extractModuleFromLayers(imageLayers, { pathPrefix });
        if (!moduleData.bounds || !moduleData.layers.length) return null;

        const imageCount = imageLayers.length;
        const textCount = moduleLayers.filter((layer) => this.resolveLayerText(layer).trim().length > 0).length;
        const area = moduleData.bounds.width * moduleData.bounds.height;
        const areaRatio = area / pageArea;

        if (
          moduleData.bounds.width < frameMetrics.width * 0.3 &&
          areaRatio < 0.045
        ) {
          return null;
        }
        if (moduleData.bounds.top > frameMetrics.height * 0.96) {
          return null;
        }

        return {
          id: pathPrefix,
          pathPrefix,
          box: {
            left: moduleData.bounds.left,
            top: moduleData.bounds.top,
            width: moduleData.bounds.width,
            height: moduleData.bounds.height
          },
          area,
          areaRatio,
          traits: {
            imageCount,
            textCount,
            hasPrimaryVisual: areaRatio >= 0.08 || moduleData.bounds.width >= frameMetrics.width * 0.72
          }
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const topDiff = a.box.top - b.box.top;
        if (topDiff !== 0) return topDiff;
        return b.area - a.area;
      })
      .slice(0, 12);
  }

  collectActualGeneratedPreviewVisuals(frameMetrics) {
    if (!frameMetrics?.root || !frameMetrics.frameWindow) return [];

    const rootRect = frameMetrics.rootRect;
    const pageArea = Math.max(1, frameMetrics.width * frameMetrics.height);
    return Array.from(frameMetrics.root.querySelectorAll('*'))
      .filter((node) => node instanceof frameMetrics.frameWindow.HTMLElement)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) return null;

        const computed = frameMetrics.frameWindow.getComputedStyle(node);
        if (!computed || computed.display === 'none' || computed.visibility === 'hidden') return null;

        const opacity = Number.parseFloat(computed.opacity || '1');
        if (Number.isFinite(opacity) && opacity < 0.08) return null;

        const hasVisual = node.tagName === 'IMG' || (computed.backgroundImage && computed.backgroundImage !== 'none');
        if (!hasVisual) return null;

        const width = Math.round(rect.width);
        const height = Math.round(rect.height);
        const area = width * height;
        if (
          width > frameMetrics.width * 1.2 ||
          area > pageArea * 0.5
        ) {
          return null;
        }
        if (
          width < frameMetrics.width * 0.18 &&
          area < frameMetrics.width * 120
        ) {
          return null;
        }

        return {
          left: Math.max(0, Math.round(rect.left - rootRect.left)),
          top: Math.max(0, Math.round(rect.top - rootRect.top)),
          width,
          height,
          area
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.area - a.area)
      .slice(0, 24);
  }

  getGeneratedPreviewSizeSimilarity(expectedBox, actualBox) {
    if (!expectedBox || !actualBox) return 0;

    const widthScore = Math.min(
      Math.max(1, Number(expectedBox.width) || 0),
      Math.max(1, Number(actualBox.width) || 0)
    ) / Math.max(
      1,
      Math.max(Number(expectedBox.width) || 0, Number(actualBox.width) || 0)
    );
    const heightScore = Math.min(
      Math.max(1, Number(expectedBox.height) || 0),
      Math.max(1, Number(actualBox.height) || 0)
    ) / Math.max(
      1,
      Math.max(Number(expectedBox.height) || 0, Number(actualBox.height) || 0)
    );

    return Math.sqrt(widthScore * heightScore);
  }

  getGeneratedPreviewCenterScore(expectedBox, actualBox) {
    if (!expectedBox || !actualBox) return 0;

    const expectedCenterX = (Number(expectedBox.left) || 0) + (Number(expectedBox.width) || 0) / 2;
    const expectedCenterY = (Number(expectedBox.top) || 0) + (Number(expectedBox.height) || 0) / 2;
    const actualCenterX = (Number(actualBox.left) || 0) + (Number(actualBox.width) || 0) / 2;
    const actualCenterY = (Number(actualBox.top) || 0) + (Number(actualBox.height) || 0) / 2;
    const distance = Math.hypot(expectedCenterX - actualCenterX, expectedCenterY - actualCenterY);
    const baseline = Math.max(
      40,
      Math.hypot(Number(expectedBox.width) || 0, Number(expectedBox.height) || 0) * 0.8
    );

    return Math.max(0, 1 - distance / baseline);
  }

  getGeneratedPreviewModuleMatchScore(expectedBox, actualBox) {
    if (!expectedBox || !actualBox) return 0;

    const left = Math.max(expectedBox.left, actualBox.left);
    const top = Math.max(expectedBox.top, actualBox.top);
    const right = Math.min(expectedBox.left + expectedBox.width, actualBox.left + actualBox.width);
    const bottom = Math.min(expectedBox.top + expectedBox.height, actualBox.top + actualBox.height);
    if (right <= left || bottom <= top) return 0;

    const overlapArea = (right - left) * (bottom - top);
    const expectedArea = Math.max(1, expectedBox.width * expectedBox.height);
    const overlapRatio = overlapArea / expectedArea;
    const sizeSimilarity = this.getGeneratedPreviewSizeSimilarity(expectedBox, actualBox);
    const centerScore = this.getGeneratedPreviewCenterScore(expectedBox, actualBox);

    return overlapRatio * 0.55 + sizeSimilarity * 0.25 + centerScore * 0.2;
  }

  buildGeneratedPreviewRepairReport(report = null) {
    const design = this.getGeneratedPreviewSourceDesign();
    const layerContext = this.getGeneratedPreviewLayerContext(design);
    const frameMetrics = this.getGeneratedPreviewFrameMetrics();
    if (!design || !layerContext || !frameMetrics) {
      return null;
    }

    const expectedModules = this.collectExpectedGeneratedPreviewModules(layerContext, frameMetrics);
    if (!expectedModules.length) {
      return null;
    }
    const actualVisuals = this.collectActualGeneratedPreviewVisuals(frameMetrics);
    if (!actualVisuals.length) {
      return {
        design,
        expectedModules: expectedModules.length,
        actualVisuals: 0,
        missingModules: expectedModules.slice(0, 6).map((moduleItem) => moduleItem.pathPrefix),
        missingModuleItems: expectedModules.slice(0, 6),
        shouldFallback: true,
        summary: '首屏视觉层为空'
      };
    }

    const missingModules = expectedModules
      .map((moduleItem) => {
        const bestScore = actualVisuals.reduce((score, visual) => {
          const nextScore = this.getGeneratedPreviewModuleMatchScore(moduleItem.box, visual);
          return nextScore > score ? nextScore : score;
        }, 0);

        return {
          ...moduleItem,
          bestScore,
          matched: bestScore >= 0.72
        };
      })
      .filter((moduleItem) => !moduleItem.matched && moduleItem.traits.hasPrimaryVisual);

    if (!missingModules.length) {
      return null;
    }

    const severeMissing = missingModules.filter((moduleItem) => (
      moduleItem.areaRatio >= 0.08 ||
      moduleItem.box.width >= frameMetrics.width * 0.72
    ));
    const highRiskSignal = (
      (Number(report?.summary?.cssImages?.total) || 0) >= 24 ||
      (Number(report?.summary?.risk?.pseudoElementCount) || 0) >= 4 ||
      (Number(report?.summary?.risk?.overflowHiddenCount) || 0) >= 72
    );
    const issueText = Array.isArray(report?.issues)
      ? report.issues.map((item) => `${item.label || ''} ${item.detail || ''}`).join(' ')
      : '';
    const issueIndicatesBrokenPreview = /图片未成功加载|样式表可能未生效|页面高度偏小/.test(issueText);
    const shouldFallback = (
      severeMissing.length >= 2 ||
      (issueIndicatesBrokenPreview && missingModules.length >= 1) ||
      (highRiskSignal && severeMissing.length >= 1 && missingModules.length >= 2)
    );

    return {
      design,
      expectedModules: expectedModules.length,
      actualVisuals: actualVisuals.length,
      missingModules: missingModules.slice(0, 6).map((moduleItem) => moduleItem.pathPrefix),
      missingModuleItems: missingModules.slice(0, 6),
      shouldFallback,
      summary: `缺失模块 ${missingModules.slice(0, 3).map((moduleItem) => moduleItem.pathPrefix.split('/').slice(-1)[0]).join('、')}`
    };
  }

  shouldIgnoreGeneratedPreviewModuleForOverlay(moduleItem, frameMetrics) {
    if (!moduleItem?.box || !frameMetrics) return true;

    const width = Math.max(1, Number(moduleItem.box.width) || 0);
    const height = Math.max(1, Number(moduleItem.box.height) || 0);
    const areaRatio = Number(moduleItem.areaRatio) || 0;
    const nearFullWidth = width >= frameMetrics.width * 0.92;
    const veryTall = height >= frameMetrics.height * 0.48;
    const veryThinStrip = nearFullWidth && height <= frameMetrics.height * 0.05;

    if (nearFullWidth && veryTall && areaRatio >= 0.38) {
      return true;
    }
    if (veryThinStrip) {
      return true;
    }

    return false;
  }

  buildGeneratedPreviewModuleOverlayFragment(moduleItem, layerContext) {
    const pathPrefix = String(moduleItem?.pathPrefix || '').trim();
    if (!pathPrefix || !layerContext?.layers?.length) {
      return null;
    }

    const moduleData = this.extractModuleFromLayers(layerContext.layers, { pathPrefix });
    if (!moduleData.bounds || !moduleData.layers.length) {
      return null;
    }

    const imageLayers = moduleData.layers.filter((layer) => layer?.visible !== false && layer?.has_image && layer?.image);
    if (!imageLayers.length) {
      return null;
    }

    const normalized = this.buildRenderableModuleLayers(imageLayers, {
      slices: layerContext.slices,
      targetWidth: moduleData.bounds.width,
      targetHeight: moduleData.bounds.height,
      useDirectLayerImages: true
    });
    const html = normalized.layers
      .map((layer, index) => this.renderLayerToHtml(layer, index))
      .filter(Boolean)
      .join('');

    if (!html) {
      return null;
    }

    return {
      moduleId: pathPrefix,
      pathPrefix,
      box: {
        left: Math.round(Number(moduleData.bounds.left) || 0),
        top: Math.round(Number(moduleData.bounds.top) || 0),
        width: Math.round(Number(normalized.canvasWidth) || Number(moduleData.bounds.width) || 0),
        height: Math.round(Number(normalized.canvasHeight) || Number(moduleData.bounds.height) || 0)
      },
      html
    };
  }

  buildGeneratedPreviewModuleFallbackPlan(repairReport, layerContext = this.getGeneratedPreviewLayerContext(repairReport?.design)) {
    if (!repairReport?.missingModuleItems?.length || !layerContext?.layers?.length) {
      return [];
    }

    const frameMetrics = this.getGeneratedPreviewFrameMetrics();
    return repairReport.missingModuleItems
      .filter((moduleItem) => !this.shouldIgnoreGeneratedPreviewModuleForOverlay(moduleItem, frameMetrics))
      .map((moduleItem) => this.buildGeneratedPreviewModuleOverlayFragment(moduleItem, layerContext))
      .filter(Boolean);
  }

  maybeSwitchGeneratedPreviewRepairMode(report = null) {
    if (!this.generatedPreviewHtml || this.getGeneratedPreviewRepairMode() !== 'dds') {
      return false;
    }

    const repairReport = this.buildGeneratedPreviewRepairReport(report);
    if (!repairReport?.shouldFallback) {
      return false;
    }

    const layerContext = this.getGeneratedPreviewLayerContext(repairReport.design);
    const modulePlan = this.buildGeneratedPreviewModuleFallbackPlan(repairReport, layerContext);
    if (modulePlan.length > 0) {
      this.generatedPreviewRepairState = {
        mode: 'module',
        reason: repairReport.summary,
        missingModules: repairReport.missingModules,
        overlayModules: modulePlan,
        updatedAt: Date.now()
      };
      this.log(`检测到 DDS 预览缺失关键模块，已切换 HTML 模块修复预览: ${repairReport.summary}`, 'warn');
      this.showToast('检测到生成页缺失关键模块，已切换 HTML 模块修复预览');
      this.showHtmlPreview({ revealCodePanel: this.isCodePanelVisible });
      return true;
    }

    const fallbackHtml = this.buildLayerFallbackPreviewHtml(repairReport.design);
    if (!fallbackHtml) {
      return false;
    }

    this.generatedPreviewRepairState = {
      mode: 'layer',
      reason: repairReport.summary,
      missingModules: repairReport.missingModules,
      overlayModules: [],
      updatedAt: Date.now()
    };
    this.log(`检测到 DDS 预览缺失关键模块，已切换图层兜底预览: ${repairReport.summary}`, 'warn');
    this.showToast('检测到生成页缺失关键模块，已切换图层兜底预览');
    this.showHtmlPreview({ revealCodePanel: this.isCodePanelVisible });
    return true;
  }

  updateGeneratedCodeMeta() {
    const fileCount = Array.isArray(this.generatedCodeFiles) ? this.generatedCodeFiles.length : 0;
    const currentFile = this.getSelectedGeneratedFile();
    const designName = this.getSelectedDesignDisplayName();
    const task = this.generatedCodeTask || this.createInitialGeneratedCodeTaskState();
    const frameworkLabel = this.getGeneratedFrameworkLabel(this.generatedCodeFramework || this.getSelectedGeneratedFramework());
    const isGenerating = task.status === 'queued' || task.status === 'running';
    const isFailed = task.status === 'error';
    const repairMode = this.getGeneratedPreviewRepairMode();
    const isLayerFallback = repairMode === 'layer';
    const isModuleFallback = repairMode === 'module';
    const primaryAction = this.getGeneratedCodePrimaryActionState();

    this.updateDesignPreviewFrameLabel(designName);

    if (this.generatedCodeStatus) {
      this.generatedCodeStatus.textContent = isGenerating
        ? `生成中 ${Math.max(0, Number(task.currentStep) || 0)}/${task.totalSteps || 6}`
        : isFailed
          ? '生成失败'
          : fileCount
            ? '已生成'
            : '未加载';
    }

    if (this.generatedCodeSummary) {
      this.generatedCodeSummary.textContent = isGenerating
        ? `${task.stepLabel || '正在生成'} · ${task.currentAction || '请稍候'}`
        : isFailed
          ? `失败于 ${task.stepLabel || '未知步骤'}：${task.errorMessage || task.currentAction || '未知错误'}`
          : isModuleFallback
            ? `已切换为 HTML 模块修复预览，原始 ${frameworkLabel} 代码仍保留在代码面板。`
          : isLayerFallback
            ? `已切换为图层兜底预览，原始 ${frameworkLabel} 代码仍保留在代码面板。`
          : fileCount
            ? `已生成 ${fileCount} 个 ${frameworkLabel} 文件，可切换查看。`
            : primaryAction.visible
              ? `${primaryAction.label}，进度会显示在当前弹窗。`
              : '当前弹窗可查看代码文件与实时进度。';
    }

    if (this.generatedCodeFileCount) {
      this.generatedCodeFileCount.textContent = fileCount
        ? (currentFile?.name ? `${fileCount} 个文件 · 当前 ${currentFile.name}` : `${fileCount} 个文件`)
        : isGenerating
          ? `生成中 · ${Math.max(0, Number(task.currentStep) || 0)}/${task.totalSteps || 6}`
          : isFailed
            ? '生成失败'
            : '暂无文件';
    }

    if (this.generatedPreviewFrameLabel) {
      this.generatedPreviewFrameLabel.textContent = fileCount && this.generatedPreviewHtml
        ? `${designName} · ${isLayerFallback ? '图层兜底预览' : isModuleFallback ? `${frameworkLabel} 修复预览` : `${frameworkLabel} 页面`}`
        : isGenerating
          ? `${designName} · ${frameworkLabel} 生成中`
          : fileCount
            ? `${designName} · ${frameworkLabel} 代码`
            : '实时页面预览';
    }

    if (this.openHtmlInNewTabBtn) {
      this.openHtmlInNewTabBtn.disabled = !this.generatedPreviewHtml;
      this.openHtmlInNewTabBtn.title = this.generatedPreviewHtml
        ? '在新标签页打开当前生成页面'
        : `${frameworkLabel} 当前没有可直接预览的页面`;
    }

    if (this.generatedCodePrimaryBtn) {
      this.generatedCodePrimaryBtn.hidden = !primaryAction.visible;
      this.generatedCodePrimaryBtn.disabled = primaryAction.disabled;
      this.generatedCodePrimaryBtn.textContent = primaryAction.label;
      this.generatedCodePrimaryBtn.title = primaryAction.title;
    }

    this.renderGeneratedPreviewDiagnostics();
    this.updateGeneratedCodePanelToggleButton();
  }

  getGeneratedCodePrimaryActionState() {
    const design = this.getSelectedDesign();
    const targetFramework = this.getSelectedGeneratedFramework();
    const frameworkLabel = this.getGeneratedFrameworkLabel(targetFramework);
    const taskStatus = String(this.generatedCodeTask?.status || 'idle').trim() || 'idle';
    const hasLoadedCode = this.hasGeneratedCodeForCurrentDesign();
    const hasCachedCode = Boolean(design && this.getGeneratedCodeCache(design, targetFramework));
    const resumableJob = design ? this.getGeneratedCodeJobCache(design, targetFramework) : null;

    if (!design) {
      return {
        visible: true,
        disabled: true,
        label: '请选择设计图',
        title: '请先选择设计图'
      };
    }

    if (this.isGeneratingHtmlPreview || ['queued', 'running'].includes(taskStatus)) {
      return {
        visible: true,
        disabled: true,
        label: '生成中...',
        title: `正在读取 ${frameworkLabel} 代码`
      };
    }

    if (hasLoadedCode) {
      return {
        visible: false,
        disabled: false,
        label: '',
        title: ''
      };
    }

    if (hasCachedCode) {
      return {
        visible: true,
        disabled: false,
        label: `打开已缓存${frameworkLabel}代码`,
        title: `从本地缓存恢复 ${frameworkLabel} 代码`
      };
    }

    if (resumableJob && resumableJob.task?.status !== 'error') {
      return {
        visible: true,
        disabled: false,
        label: `继续同步${frameworkLabel}进度`,
        title: `继续同步 ${frameworkLabel} 代码生成进度`
      };
    }

    if (taskStatus === 'error') {
      return {
        visible: true,
        disabled: false,
        label: `重新生成${frameworkLabel}代码`,
        title: `重新读取蓝湖 ${frameworkLabel} 代码`
      };
    }

    return {
      visible: true,
      disabled: false,
      label: `开始生成${frameworkLabel}代码`,
      title: `读取蓝湖 ${frameworkLabel} 代码`
    };
  }

  handleGeneratedCodePrimaryAction() {
    const actionState = this.getGeneratedCodePrimaryActionState();
    if (actionState.disabled) {
      return;
    }
    this.generateHtmlPreview();
  }

  getSelectedGeneratedFile() {
    if (!Array.isArray(this.generatedCodeFiles) || this.generatedCodeFiles.length === 0) {
      return null;
    }

    const preferredName = String(this.generatedCodeFileName || '').trim();
    if (preferredName) {
      const matched = this.generatedCodeFiles.find((file) => file.name === preferredName);
      if (matched) return matched;
    }

    return this.generatedCodeFiles[0];
  }

  refreshGeneratedCodeOutput() {
    const currentFile = this.getSelectedGeneratedFile();
    this.generatedHtmlCode = currentFile?.content || '';

    if (this.generatedCodeFileSelect) {
      this.generatedCodeFileSelect.innerHTML = this.generatedCodeFiles.map((file) => {
        const selected = file.name === currentFile?.name ? ' selected' : '';
        return `<option value="${this.escapeAttr(file.name)}"${selected}>${this.escapeHtml(file.name)}</option>`;
      }).join('');
      this.generatedCodeFileSelect.disabled = this.generatedCodeFiles.length <= 1;
    }

    if (this.htmlCodeOutput) {
      this.htmlCodeOutput.value = this.generatedHtmlCode;
      this.htmlCodeOutput.scrollTop = 0;
    }

    this.updateGeneratedCodeMeta();
  }

  handleGeneratedCodeFileChange() {
    if (!this.generatedCodeFileSelect) return;
    this.generatedCodeFileName = this.generatedCodeFileSelect.value || '';
    this.refreshGeneratedCodeOutput();
  }

  ensureGeneratedPreviewViewport() {
    if (!this.htmlPreviewFrame) return;

    const shell = this.htmlPreviewFrame.closest('.generated-preview-shell');
    if (!shell) return;

    let stage = shell.querySelector('.generated-preview-frame-stage');
    if (!stage) {
      stage = document.createElement('div');
      stage.className = 'generated-preview-frame-stage';
      shell.appendChild(stage);
    }

    let wrap = stage.querySelector('.generated-preview-frame-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'generated-preview-frame-wrap';
      stage.appendChild(wrap);
    }

    if (this.htmlPreviewFrame.parentElement !== wrap) {
      wrap.appendChild(this.htmlPreviewFrame);
    }

    this.generatedPreviewFrameStage = stage;
    this.generatedPreviewFrameWrap = wrap;
  }

  clearGeneratedPreviewFitTimers() {
    if (this.generatedPreviewFitTimer) {
      clearTimeout(this.generatedPreviewFitTimer);
      this.generatedPreviewFitTimer = null;
    }
    if (this.generatedPreviewFitRaf) {
      cancelAnimationFrame(this.generatedPreviewFitRaf);
      this.generatedPreviewFitRaf = 0;
    }
    if (Array.isArray(this.generatedPreviewLoadTimers) && this.generatedPreviewLoadTimers.length > 0) {
      this.generatedPreviewLoadTimers.forEach((timerId) => clearTimeout(timerId));
      this.generatedPreviewLoadTimers = [];
    }
  }

  getGeneratedPreviewContentMetrics() {
    if (!this.htmlPreviewFrame) return null;

    const frameWindow = this.htmlPreviewFrame.contentWindow;
    const frameDocument = this.htmlPreviewFrame.contentDocument;
    const docEl = frameDocument?.documentElement;
    const body = frameDocument?.body;
    const previewRoot = body?.firstElementChild instanceof frameWindow?.HTMLElement
      ? body.firstElementChild
      : null;

    if (!frameWindow || !docEl || !body) {
      return null;
    }

    const rootWidthCandidates = previewRoot
      ? [
          previewRoot.offsetWidth,
          previewRoot.clientWidth,
          Math.round(previewRoot.getBoundingClientRect().width || 0)
        ]
      : [];

    const rootHeightCandidates = previewRoot
      ? [
          previewRoot.offsetHeight,
          previewRoot.clientHeight,
          Math.round(previewRoot.getBoundingClientRect().height || 0)
        ]
      : [];

    const candidatesWidth = [
      body.offsetWidth,
      body.clientWidth,
      docEl.offsetWidth,
      docEl.clientWidth,
      Math.round(body.getBoundingClientRect().width || 0),
      Math.round(docEl.getBoundingClientRect().width || 0),
      Math.round(frameWindow.innerWidth || 0),
      ...rootWidthCandidates
    ].filter((value) => Number.isFinite(value) && value > 0);

    const candidatesHeight = [
      body.scrollHeight,
      body.offsetHeight,
      body.clientHeight,
      docEl.scrollHeight,
      docEl.offsetHeight,
      docEl.clientHeight,
      Math.round(body.getBoundingClientRect().height || 0),
      Math.round(docEl.getBoundingClientRect().height || 0),
      ...rootHeightCandidates
    ].filter((value) => Number.isFinite(value) && value > 0);

    if (!candidatesWidth.length || !candidatesHeight.length) {
      return null;
    }

    return {
      width: Math.max(...(rootWidthCandidates.length ? rootWidthCandidates : candidatesWidth)),
      height: Math.max(...(rootHeightCandidates.length ? rootHeightCandidates : candidatesHeight))
    };
  }

  fitGeneratedPreviewToViewport() {
    this.ensureGeneratedPreviewViewport();
    if (!this.htmlPreviewFrame || !this.generatedPreviewFrameStage || !this.generatedPreviewFrameWrap) return;
    if (!this.generatedPreviewHtml) return;

    const stageRect = this.generatedPreviewFrameStage.getBoundingClientRect();
    if (stageRect.width <= 0 || stageRect.height <= 0) return;

    const metrics = this.getGeneratedPreviewContentMetrics();
    if (!metrics || metrics.width <= 0 || metrics.height <= 0) return;

    // Keep the iframe's internal viewport at the page's own dimensions and only
    // scale the rendered surface. DDS pages rely heavily on absolute positioning,
    // fixed elements, and viewport units, so shrinking the internal viewport
    // itself causes false layout regressions.
    const scale = Math.min(1, stageRect.width / metrics.width);
    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const scaledWidth = Math.max(1, Math.round(metrics.width * safeScale));
    const scaledHeight = Math.max(1, Math.round(metrics.height * safeScale));

    this.generatedPreviewFrameWrap.style.width = `${scaledWidth}px`;
    this.generatedPreviewFrameWrap.style.height = `${scaledHeight}px`;

    this.htmlPreviewFrame.style.width = `${metrics.width}px`;
    this.htmlPreviewFrame.style.height = `${metrics.height}px`;
    this.htmlPreviewFrame.style.transformOrigin = 'top left';
    this.htmlPreviewFrame.style.transform = safeScale >= 0.999 ? 'none' : `scale(${safeScale})`;
  }

  queueGeneratedPreviewFit(delay = 0) {
    this.clearGeneratedPreviewFitTimers();
    const run = () => {
      this.generatedPreviewFitRaf = requestAnimationFrame(() => {
        this.generatedPreviewFitRaf = 0;
        this.fitGeneratedPreviewToViewport();
      });
    };

    if (delay > 0) {
      this.generatedPreviewFitTimer = setTimeout(() => {
        this.generatedPreviewFitTimer = null;
        run();
      }, delay);
      return;
    }

    run();
  }

  scheduleGeneratedPreviewRefitSequence() {
    this.queueGeneratedPreviewFit();
    const followUpDelays = [80, 220, 500, 1200];
    this.generatedPreviewLoadTimers = followUpDelays.map((delay) => setTimeout(() => {
      this.fitGeneratedPreviewToViewport();
    }, delay));
  }

  buildGeneratedPreviewDiagnosticsBootstrapScript(token) {
    const serializedToken = JSON.stringify(String(token || ''));
    return `<script>
(() => {
  const token = ${serializedToken};
  const MAX_ITEMS = 12;
  const MAX_CSS_ASSET_SAMPLES = 120;
  const trackedNodes = new WeakSet();
  const errorKeys = new Set();
  const state = { resourceErrors: [], runtimeErrors: [] };
  let publishTimer = null;
  let publishVersion = 0;

  const clip = (value, max = 220) => {
    const normalized = String(value || '').replace(/\\s+/g, ' ').trim();
    if (!normalized) return '';
    return normalized.length > max ? normalized.slice(0, max - 1) + '…' : normalized;
  };

  const toNumber = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
  };

  const normalizeUrl = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      return new URL(raw, window.location.href).toString();
    } catch (error) {
      return raw;
    }
  };

  const hasMeaningfulVisualValue = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return Boolean(
      normalized &&
      normalized !== 'none' &&
      normalized !== 'normal' &&
      normalized !== 'auto' &&
      normalized !== 'initial' &&
      normalized !== 'unset'
    );
  };

  const getSelector = (node) => {
    if (!node || !node.tagName) return 'unknown';
    const tag = node.tagName.toLowerCase();
    const id = node.id ? '#' + clip(node.id, 48) : '';
    const className = typeof node.className === 'string'
      ? node.className.trim().split(/\\s+/).filter(Boolean).slice(0, 2).map((item) => '.' + clip(item, 24)).join('')
      : '';
    return clip(tag + id + className, 96) || tag;
  };

  const pushRuntimeError = (label, detail) => {
    const normalizedDetail = clip(detail, 360);
    const key = label + '::' + normalizedDetail;
    if (errorKeys.has(key)) return;
    errorKeys.add(key);
    state.runtimeErrors.push({ level: 'error', label, detail: normalizedDetail });
    if (state.runtimeErrors.length > MAX_ITEMS) state.runtimeErrors.length = MAX_ITEMS;
  };

  const pushResourceError = (label, detail) => {
    const normalizedDetail = clip(detail, 360);
    const key = label + '::' + normalizedDetail;
    if (errorKeys.has(key)) return;
    errorKeys.add(key);
    state.resourceErrors.push({ level: 'error', label, detail: normalizedDetail });
    if (state.resourceErrors.length > MAX_ITEMS) state.resourceErrors.length = MAX_ITEMS;
  };

  const markNodeState = (node, status, reason = '') => {
    if (!node || !node.dataset) return;
    node.dataset.lhDiagState = status;
    if (status !== 'error') return;
    const tag = node.tagName ? node.tagName.toLowerCase() : 'resource';
    const rawUrl = tag === 'link'
      ? (node.href || node.getAttribute('href') || '')
      : (node.currentSrc || node.src || node.getAttribute('src') || '');
    const url = normalizeUrl(rawUrl);
    const selector = getSelector(node);
    const detail = [selector, url].filter(Boolean).join(' -> ');
    pushResourceError(tag + ' 资源加载失败', detail + (reason ? ' (' + clip(reason, 120) + ')' : ''));
  };

  const inspectNode = (node) => {
    if (!node || trackedNodes.has(node) || !node.tagName) return;
    const tag = node.tagName.toLowerCase();
    if (tag !== 'img' && tag !== 'script' && !(tag === 'link' && /stylesheet/i.test(String(node.rel || '')))) return;

    trackedNodes.add(node);
    node.addEventListener('load', () => {
      markNodeState(node, 'loaded');
      schedulePublish('resource-load', 60);
    }, { once: true });
    node.addEventListener('error', () => {
      markNodeState(node, 'error');
      schedulePublish('resource-error', 0);
    }, { once: true });

    if (tag === 'img' && node.complete) {
      markNodeState(node, node.naturalWidth > 0 ? 'loaded' : 'error', node.naturalWidth > 0 ? '' : '图片尺寸为 0');
    }
    if (tag === 'link' && node.sheet) {
      markNodeState(node, 'loaded');
    }
  };

  const inspectTree = (root = document) => {
    if (root && root.matches) inspectNode(root);
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('img,script[src],link[rel~=stylesheet]').forEach((node) => inspectNode(node));
  };

  const countResources = (nodes, kind) => {
    const list = Array.from(nodes || []).filter((node) => {
      if (!node || !node.tagName) return false;
      if (kind === 'stylesheets') return node.tagName.toLowerCase() === 'link' && /stylesheet/i.test(String(node.rel || ''));
      if (kind === 'scripts') return node.tagName.toLowerCase() === 'script' && Boolean(node.src || node.getAttribute('src'));
      return node.tagName.toLowerCase() === 'img';
    });
    const failed = list.filter((node) => node.dataset && node.dataset.lhDiagState === 'error').length;
    const loaded = kind === 'images'
      ? list.filter((node) => node.complete && node.naturalWidth > 0).length
      : list.filter((node) => node.dataset && node.dataset.lhDiagState === 'loaded').length;
    const pending = Math.max(0, list.length - loaded - failed);
    return { total: list.length, loaded, failed, pending };
  };

  const collectRoots = () => Array.from(document.body ? document.body.children : [])
    .slice(0, 4)
    .map((node) => ({
      selector: getSelector(node),
      width: toNumber(node.getBoundingClientRect ? node.getBoundingClientRect().width : 0),
      height: toNumber(node.getBoundingClientRect ? node.getBoundingClientRect().height : 0),
      childCount: toNumber(node.childElementCount || 0)
    }))
    .filter((item) => item.selector);

  const extractCssUrls = (value) => {
    const urls = [];
    String(value || '').replace(/url\\(\\s*(['"]?)(.*?)\\1\\s*\\)/gi, (match, quote, rawValue) => {
      const normalized = normalizeUrl(rawValue);
      if (normalized && !/^data:/i.test(normalized) && normalized !== 'about:blank') {
        urls.push(normalized);
      }
      return match;
    });
    return Array.from(new Set(urls));
  };

  const addCssAsset = (assetMap, url, source) => {
    if (!url) return;
    if (!assetMap.has(url)) {
      assetMap.set(url, { url, sources: [] });
    }
    const entry = assetMap.get(url);
    if (source && entry.sources.length < 3 && !entry.sources.includes(source)) {
      entry.sources.push(source);
    }
  };

  const collectCssUrlsFromStyle = (style) => {
    if (!style) return [];
    const urls = [];
    [
      style.backgroundImage,
      style.borderImageSource,
      style.maskImage,
      style.webkitMaskImage,
      style.WebkitMaskImage
    ].forEach((value) => {
      extractCssUrls(value).forEach((url) => urls.push(url));
    });
    return Array.from(new Set(urls));
  };

  const collectStyleDiagnostics = (allElements) => {
    const cssAssetMap = new Map();
    const risk = {
      transformCount: 0,
      overflowHiddenCount: 0,
      clipPathCount: 0,
      maskCount: 0,
      blendModeCount: 0,
      backdropFilterCount: 0,
      pseudoElementCount: 0,
      pseudoAssetCount: 0
    };

    allElements.forEach((node) => {
      let computed = null;
      try {
        computed = window.getComputedStyle(node);
      } catch (error) {
        computed = null;
      }
      if (!computed) return;

      const selector = getSelector(node);
      if (computed.transform && computed.transform !== 'none') {
        risk.transformCount += 1;
      }
      if (
        computed.overflowX === 'hidden' ||
        computed.overflowY === 'hidden' ||
        computed.overflowX === 'clip' ||
        computed.overflowY === 'clip'
      ) {
        risk.overflowHiddenCount += 1;
      }
      if (hasMeaningfulVisualValue(computed.clipPath)) {
        risk.clipPathCount += 1;
      }
      const maskImage = computed.maskImage || computed.webkitMaskImage || computed.WebkitMaskImage || '';
      if (hasMeaningfulVisualValue(maskImage)) {
        risk.maskCount += 1;
      }
      if (hasMeaningfulVisualValue(computed.mixBlendMode) && computed.mixBlendMode !== 'normal') {
        risk.blendModeCount += 1;
      }
      const backdropFilter = computed.backdropFilter || computed.webkitBackdropFilter || computed.WebkitBackdropFilter || '';
      if (hasMeaningfulVisualValue(backdropFilter)) {
        risk.backdropFilterCount += 1;
      }

      collectCssUrlsFromStyle(computed).forEach((url) => addCssAsset(cssAssetMap, url, selector));

      ['::before', '::after'].forEach((pseudoName) => {
        let pseudo = null;
        try {
          pseudo = window.getComputedStyle(node, pseudoName);
        } catch (error) {
          pseudo = null;
        }
        if (!pseudo) return;

        const pseudoSelector = selector + pseudoName;
        const pseudoUrls = collectCssUrlsFromStyle(pseudo);
        const pseudoContent = String(pseudo.content || '').trim();
        const pseudoWidth = parseFloat(pseudo.width) || 0;
        const pseudoHeight = parseFloat(pseudo.height) || 0;
        const hasPseudo = (
          (pseudoContent && pseudoContent !== 'none' && pseudoContent !== 'normal') ||
          pseudoUrls.length > 0 ||
          ((pseudoWidth > 0 || pseudoHeight > 0) && pseudo.display !== 'none')
        );

        if (hasPseudo) {
          risk.pseudoElementCount += 1;
        }
        if (pseudoUrls.length > 0) {
          risk.pseudoAssetCount += pseudoUrls.length;
          pseudoUrls.forEach((url) => addCssAsset(cssAssetMap, url, pseudoSelector));
        }
        if (hasMeaningfulVisualValue(pseudo.clipPath)) {
          risk.clipPathCount += 1;
        }
        const pseudoMask = pseudo.maskImage || pseudo.webkitMaskImage || pseudo.WebkitMaskImage || '';
        if (hasMeaningfulVisualValue(pseudoMask)) {
          risk.maskCount += 1;
        }
        if (hasMeaningfulVisualValue(pseudo.mixBlendMode) && pseudo.mixBlendMode !== 'normal') {
          risk.blendModeCount += 1;
        }
        const pseudoBackdropFilter = pseudo.backdropFilter || pseudo.webkitBackdropFilter || pseudo.WebkitBackdropFilter || '';
        if (hasMeaningfulVisualValue(pseudoBackdropFilter)) {
          risk.backdropFilterCount += 1;
        }
        if (pseudo.transform && pseudo.transform !== 'none') {
          risk.transformCount += 1;
        }
      });
    });

    return { cssAssetMap, risk };
  };

  const collectVisualLayers = (allElements) => {
    const layers = [];
    const pushLayer = ({ selector, kind, width, height, opacity, zIndex, flags }) => {
      const safeWidth = toNumber(width);
      const safeHeight = toNumber(height);
      const area = safeWidth * safeHeight;
      if (!selector || area <= 0) return;
      layers.push({
        selector,
        kind,
        width: safeWidth,
        height: safeHeight,
        area,
        opacity: Number.isFinite(Number(opacity)) ? Number(opacity) : 1,
        zIndex: String(zIndex || '').trim(),
        flags: Array.isArray(flags) ? flags.filter(Boolean).slice(0, 6) : []
      });
    };

    allElements.forEach((node) => {
      let computed = null;
      let rect = null;
      try {
        computed = window.getComputedStyle(node);
        rect = node.getBoundingClientRect();
      } catch (error) {
        computed = null;
        rect = null;
      }
      if (!computed || !rect) return;

      const selector = getSelector(node);
      const width = rect.width || parseFloat(computed.width) || 0;
      const height = rect.height || parseFloat(computed.height) || 0;
      const opacity = parseFloat(computed.opacity);
      const flags = [];
      if (computed.display === 'none') flags.push('display-none');
      if (computed.visibility === 'hidden') flags.push('hidden');
      if (Number.isFinite(opacity) && opacity < 0.08) flags.push('low-opacity');
      if (rect.bottom <= 0 || rect.top >= (window.innerHeight || 0)) flags.push('offscreen');

      const tagName = node.tagName ? node.tagName.toLowerCase() : '';
      if (tagName === 'img') {
        pushLayer({
          selector,
          kind: 'img',
          width,
          height,
          opacity,
          zIndex: computed.zIndex,
          flags
        });
      }

      const cssUrls = collectCssUrlsFromStyle(computed);
      if (cssUrls.length > 0) {
        pushLayer({
          selector,
          kind: 'css-bg',
          width,
          height,
          opacity,
          zIndex: computed.zIndex,
          flags
        });
      }

      ['::before', '::after'].forEach((pseudoName) => {
        let pseudo = null;
        try {
          pseudo = window.getComputedStyle(node, pseudoName);
        } catch (error) {
          pseudo = null;
        }
        if (!pseudo) return;

        const pseudoUrls = collectCssUrlsFromStyle(pseudo);
        const pseudoContent = String(pseudo.content || '').trim();
        const pseudoWidth = parseFloat(pseudo.width) || width;
        const pseudoHeight = parseFloat(pseudo.height) || height;
        const hasPseudoLayer = pseudoUrls.length > 0 || (pseudoContent && pseudoContent !== 'none' && pseudoContent !== 'normal');
        if (!hasPseudoLayer) return;

        const pseudoFlags = [];
        const pseudoOpacity = parseFloat(pseudo.opacity);
        if (pseudo.display === 'none') pseudoFlags.push('display-none');
        if (pseudo.visibility === 'hidden') pseudoFlags.push('hidden');
        if (Number.isFinite(pseudoOpacity) && pseudoOpacity < 0.08) pseudoFlags.push('low-opacity');
        if (rect.bottom <= 0 || rect.top >= (window.innerHeight || 0)) pseudoFlags.push('offscreen');

        pushLayer({
          selector: selector + pseudoName,
          kind: pseudoUrls.length > 0 ? 'pseudo-bg' : 'pseudo',
          width: pseudoWidth,
          height: pseudoHeight,
          opacity: pseudoOpacity,
          zIndex: pseudo.zIndex,
          flags: pseudoFlags
        });
      });
    });

    return layers
      .sort((a, b) => {
        if (b.area !== a.area) return b.area - a.area;
        return (Number(b.opacity) || 0) - (Number(a.opacity) || 0);
      })
      .slice(0, 6);
  };

  const summarizeCssAssetEntry = (entry) => {
    const sourceText = entry.sources && entry.sources.length ? ' @ ' + entry.sources.join(' | ') : '';
    return clip(entry.url + sourceText, 220);
  };

  const probeCssAsset = (entry) => new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ status: 'timeout', entry });
    }, 4000);

    const finalize = (status) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve({ status, entry });
    };

    image.onload = () => finalize(image.naturalWidth > 0 ? 'loaded' : 'failed');
    image.onerror = () => finalize('failed');

    try {
      image.decoding = 'async';
      image.src = entry.url;
      if (image.complete) {
        finalize(image.naturalWidth > 0 ? 'loaded' : 'failed');
      }
    } catch (error) {
      finalize('failed');
    }
  });

  const probeCssAssets = async (assetMap) => {
    const entries = Array.from(assetMap.values());
    const sampledEntries = entries.slice(0, MAX_CSS_ASSET_SAMPLES);

    if (!sampledEntries.length) {
      return {
        total: 0,
        loaded: 0,
        failed: 0,
        pending: 0,
        sampled: 0,
        failedSamples: []
      };
    }

    const results = await Promise.all(sampledEntries.map((entry) => probeCssAsset(entry)));
    let loaded = 0;
    let failed = 0;
    const failedSamples = [];

    results.forEach(({ status, entry }) => {
      if (status === 'loaded') {
        loaded += 1;
        return;
      }

      failed += 1;
      const summary = summarizeCssAssetEntry(entry);
      if (failedSamples.length < 4) {
        failedSamples.push(summary);
      }
      pushResourceError('CSS 装饰资源加载失败', summary);
    });

    return {
      total: entries.length,
      loaded,
      failed,
      pending: Math.max(0, entries.length - sampledEntries.length),
      sampled: sampledEntries.length,
      failedSamples
    };
  };

  const collectSummary = async () => {
    const allElements = Array.from(document.getElementsByTagName('*'));
    const absoluteElementCount = allElements.reduce((count, node) => {
      try {
        const position = window.getComputedStyle(node).position;
        return count + ((position === 'absolute' || position === 'fixed') ? 1 : 0);
      } catch (error) {
        return count;
      }
    }, 0);
    const bodyText = document.body && typeof document.body.innerText === 'string'
      ? document.body.innerText.replace(/\\s+/g, ' ').trim()
      : '';
    const { cssAssetMap, risk } = collectStyleDiagnostics(allElements);
    const visualLayers = collectVisualLayers(allElements);
    const cssImages = await probeCssAssets(cssAssetMap);

    return {
      title: clip(document.title || '', 120),
      viewportWidth: toNumber(window.innerWidth || document.documentElement.clientWidth || 0),
      viewportHeight: toNumber(window.innerHeight || document.documentElement.clientHeight || 0),
      scrollWidth: toNumber(Math.max(document.documentElement.scrollWidth || 0, document.body ? document.body.scrollWidth || 0 : 0)),
      scrollHeight: toNumber(Math.max(document.documentElement.scrollHeight || 0, document.body ? document.body.scrollHeight || 0 : 0)),
      elementCount: toNumber(allElements.length),
      bodyChildCount: toNumber(document.body ? document.body.children.length : 0),
      absoluteElementCount: toNumber(absoluteElementCount),
      textLength: toNumber(bodyText.length),
      images: countResources(document.images || [], 'images'),
      cssImages,
      stylesheets: countResources(document.querySelectorAll('link[rel~=stylesheet]'), 'stylesheets'),
      scripts: countResources(document.querySelectorAll('script[src]'), 'scripts'),
      risk,
      visualLayers,
      roots: collectRoots()
    };
  };

  const buildIssues = (summary) => {
    const issues = [];
    state.resourceErrors.forEach((item) => issues.push(item));
    state.runtimeErrors.forEach((item) => issues.push(item));

    if (summary.images.total > 0 && summary.images.loaded === 0) {
      issues.push({ level: 'warn', label: '图片未成功加载', detail: '当前检测到 ' + summary.images.total + ' 张图片，但全部未加载成功。' });
    }
    if (summary.stylesheets.total > 0 && summary.stylesheets.loaded === 0) {
      issues.push({ level: 'warn', label: '样式表可能未生效', detail: '检测到外链样式表，但没有任何一份样式表确认加载成功。' });
    }
    if (summary.cssImages.failed > 0) {
      const sampleText = summary.cssImages.failedSamples.length
        ? ' 样本：' + summary.cssImages.failedSamples.join('；')
        : '';
      issues.push({
        level: 'error',
        label: 'CSS 装饰资源加载失败',
        detail: '检测到 ' + summary.cssImages.failed + ' 个 CSS 背景或蒙版资源加载失败。' + sampleText
      });
    } else if (summary.cssImages.total > 0 && summary.cssImages.pending > 0) {
      issues.push({
        level: 'info',
        label: 'CSS 装饰资源为抽样诊断',
        detail: '当前识别到 ' + summary.cssImages.total + ' 个 CSS 装饰资源，本次校验了 ' + summary.cssImages.sampled + ' 个。'
      });
    }

    const riskSignals = [];
    if (summary.cssImages.total >= 8) {
      riskSignals.push('CSS 装饰资源 ' + summary.cssImages.total + ' 个');
    }
    if (summary.risk.pseudoElementCount >= 6) {
      riskSignals.push('伪元素 ' + summary.risk.pseudoElementCount + ' 个');
    }
    if (summary.risk.maskCount > 0) {
      riskSignals.push('mask ' + summary.risk.maskCount + ' 处');
    }
    if (summary.risk.clipPathCount > 0) {
      riskSignals.push('clip-path ' + summary.risk.clipPathCount + ' 处');
    }
    if (summary.risk.blendModeCount > 0) {
      riskSignals.push('blend-mode ' + summary.risk.blendModeCount + ' 处');
    }
    if (summary.risk.backdropFilterCount > 0) {
      riskSignals.push('backdrop-filter ' + summary.risk.backdropFilterCount + ' 处');
    }
    if (summary.risk.transformCount >= 12) {
      riskSignals.push('transform ' + summary.risk.transformCount + ' 处');
    }
    if (summary.risk.overflowHiddenCount >= 12) {
      riskSignals.push('overflow hidden ' + summary.risk.overflowHiddenCount + ' 处');
    }
    if (riskSignals.length > 0) {
      issues.push({
        level: 'warn',
        label: '存在高保真风险',
        detail: '页面命中 ' + riskSignals.join('、') + '，即使基础资源加载成功，仍可能因为蓝湖导出的布局语义导致装饰层缺失或错位。'
      });
    }

    const suspiciousVisualLayers = Array.isArray(summary.visualLayers)
      ? summary.visualLayers.filter((layer) => Array.isArray(layer.flags) && layer.flags.length > 0)
      : [];
    if (suspiciousVisualLayers.length > 0) {
      const details = suspiciousVisualLayers
        .slice(0, 3)
        .map((layer) => layer.selector + ' [' + layer.kind + '] ' + layer.flags.join('/'))
        .join('；');
      issues.push({
        level: 'info',
        label: '关键视觉层需人工确认',
        detail: details + '。这些层已存在但状态可疑，可能是透明、被裁切或不在首屏区域。'
      });
    }

    if (summary.scrollHeight > 0 && summary.viewportHeight > 0 && summary.scrollHeight < Math.max(320, Math.round(summary.viewportHeight * 0.6))) {
      issues.push({ level: 'warn', label: '页面高度偏小', detail: 'scrollHeight=' + summary.scrollHeight + '，可能主内容没有正常渲染。' });
    }
    if (summary.elementCount > 0 && summary.elementCount < 20) {
      issues.push({ level: 'info', label: 'DOM 结构较少', detail: '当前仅检测到 ' + summary.elementCount + ' 个元素，页面可能只渲染了壳层。' });
    }
    const firstRoot = summary.roots && summary.roots[0];
    if (firstRoot && firstRoot.height <= 8) {
      issues.push({ level: 'warn', label: '首层容器高度异常', detail: firstRoot.selector + ' 高度仅 ' + firstRoot.height + 'px。' });
    }

    return issues.slice(0, MAX_ITEMS);
  };

  const publish = async (trigger = 'auto') => {
    const currentVersion = ++publishVersion;
    let summary;

    try {
      inspectTree(document);
      summary = await collectSummary();
    } catch (error) {
      pushRuntimeError('诊断脚本异常', error && error.message ? error.message : String(error || '未知错误'));
      summary = {
        title: clip(document.title || '', 120),
        viewportWidth: toNumber(window.innerWidth || document.documentElement.clientWidth || 0),
        viewportHeight: toNumber(window.innerHeight || document.documentElement.clientHeight || 0),
        scrollWidth: 0,
        scrollHeight: 0,
        elementCount: 0,
        bodyChildCount: 0,
        absoluteElementCount: 0,
        textLength: 0,
        images: { total: 0, loaded: 0, failed: 0, pending: 0 },
        cssImages: { total: 0, loaded: 0, failed: 0, pending: 0, sampled: 0, failedSamples: [] },
        stylesheets: { total: 0, loaded: 0, failed: 0, pending: 0 },
        scripts: { total: 0, loaded: 0, failed: 0, pending: 0 },
        risk: {
          transformCount: 0,
          overflowHiddenCount: 0,
          clipPathCount: 0,
          maskCount: 0,
          blendModeCount: 0,
          backdropFilterCount: 0,
          pseudoElementCount: 0,
          pseudoAssetCount: 0
        },
        visualLayers: [],
        roots: []
      };
    }

    if (currentVersion !== publishVersion) return;

    const payload = {
      token,
      trigger,
      generatedAt: Date.now(),
      summary,
      issues: buildIssues(summary)
    };

    try {
      if (window.parent && typeof window.parent.__lanhuViewerReceiveGeneratedPreviewDiagnostics === 'function') {
        window.parent.__lanhuViewerReceiveGeneratedPreviewDiagnostics(payload);
      }
    } catch (error) {}
  };

  const schedulePublish = (trigger = 'auto', delay = 0) => {
    if (publishTimer) window.clearTimeout(publishTimer);
    publishTimer = window.setTimeout(() => {
      publishTimer = null;
      publish(trigger).catch(() => {});
    }, delay);
  };

  window.addEventListener('error', (event) => {
    if (event.target && event.target !== window) {
      markNodeState(event.target, 'error', event.message || '资源请求失败');
      schedulePublish('resource-error', 0);
      return;
    }
    const location = [event.filename || '', event.lineno || '', event.colno || ''].filter(Boolean).join(':');
    pushRuntimeError('脚本执行异常', [event.message || '', location].filter(Boolean).join(' @ '));
    schedulePublish('runtime-error', 0);
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event && event.reason;
    let detail = '';
    if (typeof reason === 'string') {
      detail = reason;
    } else if (reason && reason.message) {
      detail = reason.message;
    } else {
      try {
        detail = JSON.stringify(reason || '未知 Promise 错误');
      } catch (error) {
        detail = String(reason || '未知 Promise 错误');
      }
    }
    pushRuntimeError('Promise 未处理异常', detail);
    schedulePublish('unhandledrejection', 0);
  });

  document.addEventListener('DOMContentLoaded', () => {
    inspectTree(document);
    schedulePublish('domcontentloaded', 60);
  });

  window.addEventListener('load', () => {
    inspectTree(document);
    schedulePublish('load', 60);
    window.setTimeout(() => { publish('load-stable').catch(() => {}); }, 360);
    window.setTimeout(() => { publish('load-final').catch(() => {}); }, 1200);
  });

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => inspectTree(node));
    });
    schedulePublish('mutation', 160);
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  inspectTree(document);
  window.__LANHU_GENERATED_PREVIEW_DIAGNOSTICS__ = {
    publish: (trigger = 'manual') => publish(trigger)
  };
})();
</script>`;
  }

  injectGeneratedPreviewHeadMarkup(html, markup) {
    const source = String(html || '');
    const injectedMarkup = String(markup || '').trim();

    if (!injectedMarkup) {
      return source;
    }

    if (/<head(\s[^>]*)?>/i.test(source)) {
      return source.replace(/<head(\s[^>]*)?>/i, (match) => `${match}\n${injectedMarkup}\n`);
    }

    if (/<html(\s[^>]*)?>/i.test(source)) {
      return source.replace(/<html(\s[^>]*)?>/i, (match) => `${match}\n<head>\n${injectedMarkup}\n</head>\n`);
    }

    if (/<body(\s[^>]*)?>/i.test(source)) {
      return source.replace(/<body(\s[^>]*)?>/i, (match) => `<head>\n${injectedMarkup}\n</head>\n${match}`);
    }

    return `<head>\n${injectedMarkup}\n</head>\n${source}`;
  }

  serializeGeneratedPreviewInlineData(value) {
    try {
      return JSON.stringify(value ?? [])
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026');
    } catch (error) {
      return '[]';
    }
  }

  buildGeneratedPreviewCompatibilityStyleTag() {
    return `<style data-generated-preview-compat>
html,
body {
  margin: 0 !important;
  padding: 0 !important;
  min-height: 100%;
}
body {
  overflow-x: hidden !important;
  background: transparent !important;
}
</style>`;
  }

  buildGeneratedPreviewPatchStyleTag() {
    return `<style data-generated-preview-patch>
[data-generated-preview-root="1"] {
  isolation: isolate !important;
  position: relative !important;
}
[data-generated-preview-patch-mask="1"] {
  background: transparent !important;
  background-color: transparent !important;
}
[data-generated-preview-patch-edge-decor="1"] {
  z-index: 0 !important;
}
[data-generated-preview-patch-foreground="1"] {
  z-index: 2 !important;
}
[data-generated-preview-patch-promote="1"] {
  z-index: 3 !important;
}
[data-generated-preview-patch-button-anchor="1"] {
  position: relative !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  overflow: visible !important;
  border-color: rgba(255, 255, 255, 0.82) !important;
  background:
    radial-gradient(circle at 35% 26%, rgba(255, 255, 255, 0.42) 0, rgba(255, 255, 255, 0.12) 24%, rgba(255, 255, 255, 0) 42%),
    linear-gradient(180deg, rgba(255, 152, 233, 0.92) 0%, rgba(219, 110, 255, 0.94) 55%, rgba(124, 130, 255, 0.94) 100%) !important;
  box-shadow:
    0 14px 28px rgba(176, 112, 255, 0.3),
    inset 0 0 0 1px rgba(255, 255, 255, 0.22) !important;
}
[data-generated-preview-patch-button-anchor="1"]::before {
  content: '' !important;
  position: absolute !important;
  inset: 10px 12px 18px !important;
  border-radius: inherit !important;
  background: radial-gradient(circle at 50% 36%, rgba(255, 255, 255, 0.42) 0, rgba(255, 255, 255, 0.06) 54%, rgba(255, 255, 255, 0) 78%) !important;
  pointer-events: none !important;
}
[data-generated-preview-patch-button-anchor="1"] > img {
  position: absolute !important;
  left: 50% !important;
  top: 46% !important;
  width: 34px !important;
  height: 34px !important;
  margin: 0 !important;
  transform: translate(-50%, -50%) !important;
  filter: drop-shadow(0 4px 10px rgba(255, 255, 255, 0.35)) !important;
}
[data-generated-preview-patch-button-label="1"] {
  left: 50% !important;
  right: auto !important;
  top: calc(100% - 6px) !important;
  bottom: auto !important;
  transform: translateX(-50%) !important;
  width: max-content !important;
  min-width: 0 !important;
  max-width: none !important;
  padding: 4px 10px !important;
  border-radius: 999px !important;
  white-space: nowrap !important;
  text-align: center !important;
  color: #fff !important;
  font-weight: 600 !important;
  line-height: 1.2 !important;
  background: linear-gradient(180deg, rgba(255, 122, 224, 0.98) 0%, rgba(201, 93, 255, 0.98) 100%) !important;
  box-shadow: 0 8px 20px rgba(177, 90, 255, 0.26) !important;
  -webkit-text-fill-color: currentColor !important;
  -webkit-background-clip: border-box !important;
  background-clip: border-box !important;
  text-shadow: 0 1px 2px rgba(77, 38, 108, 0.35) !important;
}
[data-generated-preview-patch-vertical-anchor="1"] {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  overflow: visible !important;
}
[data-generated-preview-patch-vertical-label="1"] {
  display: block !important;
  white-space: pre-line !important;
  text-align: center !important;
  width: 1.15em !important;
  min-width: 0 !important;
  max-width: 1.15em !important;
  height: auto !important;
  line-height: 1.08 !important;
  letter-spacing: 0 !important;
  margin: 0 auto !important;
}
[data-generated-preview-design-crop-overlay] {
  position: absolute !important;
  display: block !important;
  pointer-events: none !important;
  background-repeat: no-repeat !important;
  z-index: 6 !important;
  overflow: hidden !important;
}
[data-generated-preview-design-crop-overlay]::after {
  content: '' !important;
  position: absolute !important;
  inset: 0 !important;
  border-radius: inherit !important;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14) !important;
  pointer-events: none !important;
}
[data-generated-preview-module-suppressed="1"] {
  visibility: hidden !important;
}
[data-generated-preview-module-overlay] {
  position: absolute !important;
  display: block !important;
  pointer-events: none !important;
  overflow: hidden !important;
  isolation: isolate !important;
  z-index: 14 !important;
}
[data-generated-preview-module-canvas] {
  position: relative !important;
  width: 100% !important;
  height: 100% !important;
  overflow: hidden !important;
}
[data-generated-preview-module-canvas] .lh-layer {
  position: absolute !important;
  display: block !important;
  overflow: hidden !important;
  pointer-events: none !important;
}
[data-generated-preview-module-canvas] .lh-image {
  object-fit: fill !important;
  user-select: none !important;
  -webkit-user-drag: none !important;
}
[data-generated-preview-module-canvas] .lh-text {
  white-space: pre-wrap !important;
  word-break: break-word !important;
}
</style>`;
  }

  buildGeneratedPreviewPatchBootstrapScript(moduleFallbackPlan = []) {
    const serializedModulePlan = this.serializeGeneratedPreviewInlineData(Array.isArray(moduleFallbackPlan) ? moduleFallbackPlan : []);
    return `<script data-generated-preview-patch>
(() => {
  const PATCH_ATTRS = [
    'data-generated-preview-root',
    'data-generated-preview-patch-mask',
    'data-generated-preview-patch-edge-decor',
    'data-generated-preview-patch-foreground',
    'data-generated-preview-patch-promote',
    'data-generated-preview-patch-button-anchor',
    'data-generated-preview-patch-button-label',
    'data-generated-preview-patch-vertical-anchor',
    'data-generated-preview-patch-vertical-label'
  ];
  const ORIGINAL_TEXT_ATTR = 'data-generated-preview-patch-original-text';
  const DESIGN_CROP_OVERLAY_ATTR = 'data-generated-preview-design-crop-overlay';
  const MODULE_OVERLAY_ATTR = 'data-generated-preview-module-overlay';
  const MODULE_CANVAS_ATTR = 'data-generated-preview-module-canvas';
  const MODULE_SUPPRESSED_ATTR = 'data-generated-preview-module-suppressed';
  const MODULE_FALLBACK_PLAN = ${serializedModulePlan};
  const DESIGN_CROP_PATCHES = [
    {
      key: 'sweet-task-cp-hero',
      designNamePattern: /^甜蜜任务$/,
      coordinateWidth: 750,
      layerImages: [
        {
          key: 'hero-couple',
          path: '甜蜜任务/头图',
          renderBox: { left: 96, top: 176, width: 558, height: 852 },
          sourceBox: { left: 96, top: 0 },
          zIndex: 4
        },
        {
          key: 'hero-title',
          path: '甜蜜任务/标题分割',
          renderBox: { left: 0, top: 665, width: 750, height: 260 },
          sourceBox: { left: 0, top: 0 },
          zIndex: 5
        },
        {
          key: 'background',
          path: '甜蜜任务/登顶CP/登顶CP背景',
          zIndex: 6
        },
        {
          key: 'center-badge',
          path: '甜蜜任务/登顶CP/信息/Group 427319820',
          zIndex: 9
        },
        {
          key: 'left-frame',
          path: '甜蜜任务/登顶CP/信息/头像/头像框',
          expectedX: 169,
          zIndex: 8
        },
        {
          key: 'right-frame',
          path: '甜蜜任务/登顶CP/信息/头像/头像框',
          expectedX: 411,
          zIndex: 8
        }
      ],
      previewCrops: [
        {
          key: 'left-avatar',
          crop: { left: 197, top: 662, width: 116, height: 116 },
          radius: 58,
          zIndex: 7
        },
        {
          key: 'right-avatar',
          crop: { left: 439, top: 662, width: 116, height: 116 },
          radius: 58,
          zIndex: 7
        }
      ]
    }
  ];
  let rafId = 0;
  let timerId = 0;

  const parseColor = (value) => {
    const match = String(value || '').match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/i);
    if (!match) return null;
    return {
      r: Number(match[1]),
      g: Number(match[2]),
      b: Number(match[3]),
      a: match[4] == null ? 1 : Number(match[4])
    };
  };

  const clearNodePatchState = (node) => {
    if (node.hasAttribute(ORIGINAL_TEXT_ATTR)) {
      node.textContent = node.getAttribute(ORIGINAL_TEXT_ATTR) || '';
      node.removeAttribute(ORIGINAL_TEXT_ATTR);
    }
    PATCH_ATTRS.forEach((attr) => node.removeAttribute(attr));
  };

  const collectText = (node) => String(node.textContent || '').replace(/\\s+/g, '').trim();
  const removeDesignCropOverlays = (root) => {
    root.querySelectorAll(\`[\${DESIGN_CROP_OVERLAY_ATTR}]\`).forEach((node) => node.remove());
  };
  const removeModuleOverlays = (root) => {
    root.querySelectorAll(\`[\${MODULE_OVERLAY_ATTR}]\`).forEach((node) => node.remove());
  };
  const clearModuleSuppressedNodes = (root) => {
    root.querySelectorAll(\`[\${MODULE_SUPPRESSED_ATTR}]\`).forEach((node) => node.removeAttribute(MODULE_SUPPRESSED_ATTR));
  };
  const buildNodeBox = (rect, rootRect) => ({
    left: Math.max(0, Math.round(rect.left - rootRect.left)),
    top: Math.max(0, Math.round(rect.top - rootRect.top)),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  });
  const getOverlapArea = (a, b) => {
    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.left + a.width, b.left + b.width);
    const bottom = Math.min(a.top + a.height, b.top + b.height);
    if (right <= left || bottom <= top) return 0;
    return (right - left) * (bottom - top);
  };
  const shouldSuppressNodeForModule = (node, rootRect, moduleBox) => {
    if (!(node instanceof HTMLElement)) return false;
    if (node.hasAttribute(MODULE_OVERLAY_ATTR)) return false;
    if (node.closest(\`[\${MODULE_OVERLAY_ATTR}]\`)) return false;
    if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE' || node.tagName === 'LINK') return false;

    const rect = node.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) return false;

    const computed = window.getComputedStyle(node);
    if (!computed || computed.display === 'none' || computed.visibility === 'hidden') return false;

    const hasVisual = node.tagName === 'IMG' || (computed.backgroundImage && computed.backgroundImage !== 'none');
    if (!hasVisual) return false;

    const nodeBox = buildNodeBox(rect, rootRect);
    const overlapArea = getOverlapArea(nodeBox, moduleBox);
    if (overlapArea <= 0) return false;

    const nodeArea = Math.max(1, nodeBox.width * nodeBox.height);
    const overlapRatio = overlapArea / nodeArea;
    const centerX = nodeBox.left + nodeBox.width / 2;
    const centerY = nodeBox.top + nodeBox.height / 2;
    const centerInside = (
      centerX >= moduleBox.left &&
      centerX <= moduleBox.left + moduleBox.width &&
      centerY >= moduleBox.top &&
      centerY <= moduleBox.top + moduleBox.height
    );

    return overlapRatio >= 0.58 || (centerInside && nodeArea <= moduleBox.width * moduleBox.height * 1.8);
  };
  const applyModuleFallbackOverlays = (root, rootRect) => {
    removeModuleOverlays(root);
    clearModuleSuppressedNodes(root);

    if (!Array.isArray(MODULE_FALLBACK_PLAN) || !MODULE_FALLBACK_PLAN.length) {
      return;
    }

    const nodes = Array.from(root.querySelectorAll('*')).filter((node) => node instanceof HTMLElement);

    MODULE_FALLBACK_PLAN.forEach((moduleItem, index) => {
      const box = moduleItem && typeof moduleItem.box === 'object' ? moduleItem.box : null;
      if (!box || (Number(box.width) || 0) <= 1 || (Number(box.height) || 0) <= 1) {
        return;
      }

      nodes.forEach((node) => {
        if (shouldSuppressNodeForModule(node, rootRect, box)) {
          node.setAttribute(MODULE_SUPPRESSED_ATTR, '1');
        }
      });

      const overlay = document.createElement('div');
      overlay.setAttribute(MODULE_OVERLAY_ATTR, moduleItem.pathPrefix || moduleItem.moduleId || 'module-' + index);
      overlay.style.left = String(Math.round(Number(box.left) || 0)) + 'px';
      overlay.style.top = String(Math.round(Number(box.top) || 0)) + 'px';
      overlay.style.width = String(Math.round(Number(box.width) || 0)) + 'px';
      overlay.style.height = String(Math.round(Number(box.height) || 0)) + 'px';
      overlay.style.setProperty('z-index', String(14 + index), 'important');

      const canvas = document.createElement('div');
      canvas.setAttribute(MODULE_CANVAS_ATTR, '1');
      canvas.innerHTML = String(moduleItem.html || '');
      overlay.appendChild(canvas);
      root.appendChild(overlay);
    });
  };

  const readPreviewContextFromWindow = (targetWindow) => {
    try {
      const targetDocument = targetWindow?.document;
      const previewImage = targetDocument?.getElementById('previewImage');
      const previewName = targetDocument?.getElementById('previewName');
      const src = previewImage?.currentSrc || previewImage?.src || '';
      const designWidth = Number(previewImage?.naturalWidth) || 0;
      const designHeight = Number(previewImage?.naturalHeight) || 0;
      const designName = String(previewName?.textContent || '').trim();

      if (!src || designWidth <= 0 || designHeight <= 0) {
        return null;
      }

      return {
        src,
        designName,
        designWidth,
        designHeight
      };
    } catch (error) {
      return null;
    }
  };

  const readPreviewContext = () => (
    readPreviewContextFromWindow(window.parent && window.parent !== window ? window.parent : null) ||
    readPreviewContextFromWindow(window.opener) ||
    null
  );

  const readLayerCacheEntryFromWindow = (targetWindow, designName) => {
    try {
      const raw = targetWindow?.localStorage?.getItem('lanhuLayerCache');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Object.values(parsed || {}).find((entry) => String(entry?.canvasInfo?.name || '').trim() === designName) || null;
    } catch (error) {
      return null;
    }
  };

  const readLayerCacheEntry = (designName) => (
    readLayerCacheEntryFromWindow(window.parent && window.parent !== window ? window.parent : null, designName) ||
    readLayerCacheEntryFromWindow(window.opener, designName) ||
    null
  );

  const findLayerImage = (entry, path, expectedX = null) => {
    const layers = Array.isArray(entry?.layers) ? entry.layers : [];
    const matches = layers.filter((layer) => layer?.has_image && layer?.path === path);
    if (!matches.length) {
      return null;
    }
    if (expectedX == null) {
      return matches[0];
    }
    return matches.reduce((best, layer) => {
      if (!best) return layer;
      return Math.abs(Number(layer.x) - expectedX) < Math.abs(Number(best.x) - expectedX) ? layer : best;
    }, null);
  };

  const appendOverlay = (
    root,
    key,
    {
      left,
      top,
      width,
      height,
      zIndex = 6,
      radius = 0,
      shadow = 'none',
      image,
      size = '100% 100%',
      position = '0 0'
    }
  ) => {
    if (!image || width <= 2 || height <= 2) {
      return;
    }

    const overlay = document.createElement('div');
    overlay.setAttribute(DESIGN_CROP_OVERLAY_ATTR, key);
    overlay.style.left = String(left) + 'px';
    overlay.style.top = String(top) + 'px';
    overlay.style.width = String(width) + 'px';
    overlay.style.height = String(height) + 'px';
    overlay.style.borderRadius = radius > 0 ? (String(radius) + 'px') : '0';
    overlay.style.setProperty('z-index', String(zIndex), 'important');
    overlay.style.backgroundImage = 'url("' + String(image).replace(/"/g, '\\"') + '")';
    overlay.style.backgroundSize = size;
    overlay.style.backgroundPosition = position;
    overlay.style.boxShadow = shadow;
    root.appendChild(overlay);
  };

  const applyDesignCropPatches = (root, rootWidth, rootHeight) => {
    removeDesignCropOverlays(root);

    const previewContext = readPreviewContext();
    if (!previewContext) {
      return;
    }

    const layerCacheEntry = readLayerCacheEntry(previewContext.designName);

    DESIGN_CROP_PATCHES.forEach((patch) => {
      if (!patch.designNamePattern.test(previewContext.designName)) {
        return;
      }

      const layoutWidth = Math.max(
        1,
        Number(root.offsetWidth) ||
          Number(root.clientWidth) ||
          Number(root.scrollWidth) ||
          rootWidth
      );
      const layoutHeight = Math.max(
        1,
        Number(root.offsetHeight) ||
          Number(root.clientHeight) ||
          Number(root.scrollHeight) ||
          rootHeight
      );
      const coordinateWidth = Math.max(
        1,
        Number(patch.coordinateWidth) ||
          layoutWidth
      );
      const placementScale = layoutWidth / coordinateWidth;
      const previewSourceScale = layoutWidth / Math.max(1, previewContext.designWidth);

      if (layerCacheEntry) {
        (patch.layerImages || []).forEach((item) => {
          const layer = findLayerImage(layerCacheEntry, item.path, item.expectedX);
          if (!layer) {
            return;
          }
          const renderBox = item.renderBox || {
            left: Number(layer.x) || 0,
            top: Number(layer.y) || 0,
            width: Number(layer.width) || 0,
            height: Number(layer.height) || 0
          };
          const sourceBox = item.sourceBox || null;
          appendOverlay(root, patch.key + '-' + item.key, {
            left: Math.round(Number(renderBox.left) * placementScale),
            top: Math.round(Number(renderBox.top) * placementScale),
            width: Math.round(Number(renderBox.width) * placementScale),
            height: Math.round(Number(renderBox.height) * placementScale),
            zIndex: item.zIndex || 6,
            radius: Math.max(0, Math.round((item.radius || 0) * placementScale)),
            shadow: item.shadow || 'none',
            image: layer.image,
            size: sourceBox
              ? String(Math.round(Number(layer.width) * placementScale)) + 'px ' +
                String(Math.round(Number(layer.height) * placementScale)) + 'px'
              : '100% 100%',
            position: sourceBox
              ? '-' + String(Math.round((Number(sourceBox.left) || 0) * placementScale)) + 'px -' +
                String(Math.round((Number(sourceBox.top) || 0) * placementScale)) + 'px'
              : '0 0'
          });
        });
      }

      (patch.previewCrops || []).forEach((item) => {
        const cropLeft = Math.round(item.crop.left * placementScale);
        const cropTop = Math.round(item.crop.top * placementScale);
        const cropWidth = Math.round(item.crop.width * placementScale);
        const cropHeight = Math.round(item.crop.height * placementScale);

        if (
          cropWidth <= 24 ||
          cropHeight <= 24 ||
          cropLeft >= layoutWidth ||
          cropTop >= layoutHeight
        ) {
          return;
        }

        appendOverlay(root, patch.key + '-' + item.key, {
          left: cropLeft,
          top: cropTop,
          width: cropWidth,
          height: cropHeight,
          zIndex: item.zIndex || 7,
          radius: Math.max(18, Math.round((item.radius || 24) * placementScale)),
          shadow: item.shadow || '0 8px 18px rgba(130, 87, 220, 0.14)',
          image: previewContext.src,
          size: String(layoutWidth) + 'px ' + String(Math.round(previewContext.designHeight * previewSourceScale)) + 'px',
          position: '-' + String(cropLeft) + 'px -' + String(cropTop) + 'px'
        });
      });
    });
  };

  const applyPatch = () => {
    rafId = 0;
    timerId = 0;
    const root = document.querySelector('.page') || document.body?.firstElementChild || document.body;
    if (!(root instanceof HTMLElement)) {
      return;
    }

    const rootRect = root.getBoundingClientRect();
    const rootWidth = Math.max(
      1,
      Math.round(rootRect.width || root.offsetWidth || root.clientWidth || root.scrollWidth || window.innerWidth || 750)
    );
    const rootHeight = Math.max(
      1,
      Math.round(rootRect.height || root.offsetHeight || root.clientHeight || root.scrollHeight || window.innerHeight || 1)
    );
    const rootArea = rootWidth * rootHeight;

    root.setAttribute('data-generated-preview-root', '1');
    removeDesignCropOverlays(root);

    const nodes = Array.from(root.querySelectorAll('*')).filter((node) => node instanceof HTMLElement);
    nodes.forEach((node) => clearNodePatchState(node));

    nodes.forEach((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) {
        return;
      }

      const area = rect.width * rect.height;
      if (area >= rootArea * 0.92) {
        return;
      }

      const styles = window.getComputedStyle(node);
      const text = collectText(node);
      const isVisual = node.tagName === 'IMG' || (styles.backgroundImage && styles.backgroundImage !== 'none');
      const hasBackgroundImage = Boolean(styles.backgroundImage && styles.backgroundImage !== 'none');
      const childVisual = Array.from(node.children || []).some((child) => {
        if (!(child instanceof HTMLElement)) return false;
        const childStyles = window.getComputedStyle(child);
        return child.tagName === 'IMG' || (childStyles.backgroundImage && childStyles.backgroundImage !== 'none');
      });

      const color = parseColor(styles.backgroundColor);
      const hasDarkBackground = Boolean(
        color &&
        color.a > 0.6 &&
        color.r < 24 &&
        color.g < 24 &&
        color.b < 24
      );
      const isPositioned = styles.position === 'absolute' || styles.position === 'fixed' || styles.position === 'relative';
      const spillsEdge =
        rect.left < rootRect.left - 24 ||
        rect.right > rootRect.right + 24 ||
        rect.top < rootRect.top - 24;

      if (
        hasDarkBackground &&
        !hasBackgroundImage &&
        isPositioned &&
        rect.width >= rootWidth * 0.35 &&
        rect.height >= 48 &&
        rect.height <= 220 &&
        childVisual
      ) {
        node.setAttribute('data-generated-preview-patch-mask', '1');
      }

      if (
        isVisual &&
        text.length === 0 &&
        (styles.position === 'absolute' || styles.position === 'fixed') &&
        spillsEdge &&
        rect.width >= rootWidth * 0.18 &&
        rect.height >= 80
      ) {
        node.setAttribute('data-generated-preview-patch-edge-decor', '1');
      }

      if (
        text.length > 0 &&
        (hasBackgroundImage || childVisual) &&
        isPositioned &&
        rect.width >= rootWidth * 0.22 &&
        area <= rootArea * 0.42
      ) {
        node.setAttribute('data-generated-preview-patch-foreground', '1');
      }

      if (
        isVisual &&
        text.length === 0 &&
        !spillsEdge &&
        isPositioned &&
        rect.top < rootRect.top + 1400 &&
        rect.left > rootRect.left + rootWidth * 0.08 &&
        rect.right < rootRect.right - rootWidth * 0.08 &&
        rect.width >= rootWidth * 0.18 &&
        rect.width <= rootWidth * 0.75 &&
        rect.height >= 96 &&
        rect.height <= Math.max(480, rootWidth * 1.2)
      ) {
        node.setAttribute('data-generated-preview-patch-promote', '1');
      }

      const parent = node.parentElement;
      if (
        parent instanceof HTMLElement &&
        text.length > 0 &&
        styles.position === 'absolute'
      ) {
        const parentRect = parent.getBoundingClientRect();
        const parentStyles = window.getComputedStyle(parent);
        const parentRadius = parseFloat(parentStyles.borderRadius) || 0;
        const isSmallRoundButton =
          parentRect.width <= 100 &&
          parentRect.height <= 100 &&
          parentRadius >= Math.min(parentRect.width, parentRect.height) * 0.35;

        if (
          isSmallRoundButton &&
          rect.width > parentRect.width &&
          (rect.left < parentRect.left - 12 || (parseFloat(styles.left) || 0) < -20)
        ) {
          parent.setAttribute('data-generated-preview-patch-button-anchor', '1');
          node.setAttribute('data-generated-preview-patch-button-label', '1');
        }
      }

      if (
        text.length >= 3 &&
        text.length <= 8 &&
        rect.width <= 40 &&
        rect.height >= 80 &&
        styles.writingMode !== 'vertical-rl' &&
        parent instanceof HTMLElement
      ) {
        const parentRect = parent.getBoundingClientRect();
        const parentStyles = window.getComputedStyle(parent);
        const parentHasVisual = Boolean(
          parentStyles.backgroundImage && parentStyles.backgroundImage !== 'none'
        );

        if (
          parentRect.width <= 72 &&
          parentRect.height >= 110 &&
          parentHasVisual
        ) {
          parent.setAttribute('data-generated-preview-patch-vertical-anchor', '1');
          if (!node.hasAttribute(ORIGINAL_TEXT_ATTR)) {
            node.setAttribute(ORIGINAL_TEXT_ATTR, text);
          }
          node.textContent = Array.from(text).join('\\n');
          node.setAttribute('data-generated-preview-patch-vertical-label', '1');
        }
      }
    });

    applyDesignCropPatches(root, rootWidth, rootHeight);
    applyModuleFallbackOverlays(root, rootRect);
  };

  const schedulePatch = (delay = 0) => {
    if (timerId) {
      window.clearTimeout(timerId);
      timerId = 0;
    }
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }

    const run = () => {
      rafId = window.requestAnimationFrame(applyPatch);
    };

    if (delay > 0) {
      timerId = window.setTimeout(run, delay);
      return;
    }

    run();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => schedulePatch(), { once: true });
  } else {
    schedulePatch();
  }

  window.addEventListener('load', () => {
    schedulePatch();
    window.setTimeout(() => schedulePatch(), 280);
    window.setTimeout(() => schedulePatch(), 960);
  });

  const observer = new MutationObserver(() => schedulePatch(140));
  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.__LANHU_GENERATED_PREVIEW_PATCH__ = {
    apply: () => applyPatch()
  };
})();
</script>`;
  }

  buildEmbeddedGeneratedPreviewHtml(
    html,
    {
      includeDiagnostics = true,
      includePreviewPatch = true,
      baseHref = 'https://dds.lanhuapp.com/',
      moduleFallbackPlan = []
    } = {}
  ) {
    if (!html) {
      if (includeDiagnostics) {
        this.generatedPreviewDiagnostics = this.createInitialGeneratedPreviewDiagnostics();
        this.renderGeneratedPreviewDiagnostics();
      }
      return '';
    }

    const source = String(html);
    const markupParts = [];

    if (baseHref && !/<base\b/i.test(source)) {
      markupParts.push(`<base href="${this.escapeAttr(baseHref)}" />`);
    }
    if (!/data-generated-preview-compat/i.test(source)) {
      markupParts.push(this.buildGeneratedPreviewCompatibilityStyleTag());
    }
    if (includePreviewPatch && !/data-generated-preview-patch/i.test(source)) {
      markupParts.push(this.buildGeneratedPreviewPatchStyleTag());
      markupParts.push(this.buildGeneratedPreviewPatchBootstrapScript(moduleFallbackPlan));
    }

    if (includeDiagnostics) {
      const token = this.createGeneratedPreviewDiagnosticsToken();
      this.generatedPreviewDiagnostics = {
        token,
        status: 'pending',
        updatedAt: Date.now(),
        trigger: 'auto',
        report: null
      };
      this.renderGeneratedPreviewDiagnostics();
      markupParts.push(this.buildGeneratedPreviewDiagnosticsBootstrapScript(token));
    }

    return this.injectGeneratedPreviewHeadMarkup(source, markupParts.join('\n'));
  }

  buildLayerFallbackPreviewHtml(design = this.getGeneratedPreviewSourceDesign()) {
    const layerContext = this.getGeneratedPreviewLayerContext(design);
    if (!layerContext) {
      return '';
    }

    const frameMetrics = this.getGeneratedPreviewFrameMetrics();
    return this.buildStaticHtmlFromLayers(design, {
      layers: layerContext.layers,
      canvasInfo: layerContext.canvasInfo,
      slices: layerContext.slices,
      preferredWidth: frameMetrics?.width || 0,
      preferredHeight: frameMetrics?.height || 0
    });
  }

  buildGeneratedPreviewFrameDocument({ includeDiagnostics = true } = {}) {
    if (!this.generatedPreviewHtml) {
      if (includeDiagnostics) {
        this.generatedPreviewDiagnostics = this.createInitialGeneratedPreviewDiagnostics();
        this.renderGeneratedPreviewDiagnostics();
      }
      return '';
    }

    if (this.getGeneratedPreviewRepairMode() === 'layer') {
      const fallbackHtml = this.buildLayerFallbackPreviewHtml();
      if (fallbackHtml) {
        return this.buildEmbeddedGeneratedPreviewHtml(fallbackHtml, {
          includeDiagnostics,
          includePreviewPatch: false,
          baseHref: ''
        });
      }
    }

    const moduleFallbackPlan = this.getGeneratedPreviewRepairMode() === 'module'
      ? (Array.isArray(this.generatedPreviewRepairState?.overlayModules) ? this.generatedPreviewRepairState.overlayModules : [])
      : [];
    return this.buildEmbeddedGeneratedPreviewHtml(this.generatedPreviewHtml, {
      includeDiagnostics,
      includePreviewPatch: true,
      moduleFallbackPlan
    });
  }

  showHtmlPreview({ revealCodePanel } = {}) {
    if (!this.previewBody) return;
    const hasPreview = Boolean(this.generatedPreviewHtml);
    const isAlreadyVisible = this.previewBody.classList.contains('html-preview-visible') && hasPreview;

    const shouldShowCodePanel = typeof revealCodePanel === 'boolean'
      ? revealCodePanel
      : (!hasPreview || this.isCodePanelVisible);

    this.showGeneratedCodePanel({ showCodePanel: shouldShowCodePanel });
    if (hasPreview && !isAlreadyVisible) {
      this.resetZoom(true);
    }
    if (this.generatedPreviewSite) {
      this.generatedPreviewSite.hidden = !hasPreview;
    }
    if (this.previewBody) {
      this.previewBody.classList.toggle('html-preview-visible', hasPreview);
    }

    if (this.htmlPreviewFrame) {
      this.htmlPreviewFrame.srcdoc = hasPreview
        ? this.buildGeneratedPreviewFrameDocument()
        : '';
      if (hasPreview) {
        this.scheduleGeneratedPreviewRefitSequence();
      } else {
        this.clearGeneratedPreviewFitTimers();
      }
    }
    this.refreshGeneratedCodeOutput();
  }

  hideHtmlPreview(clearCode = false) {
    if (this.generatedPreviewSite) {
      this.generatedPreviewSite.hidden = true;
    }
    this.setCodePanelVisibility(false);
    if (this.previewBody) {
      this.previewBody.classList.remove('html-preview-visible');
    }
    if (this.generateHtmlBtn) {
      this.generateHtmlBtn.classList.remove('active');
    }
    if (this.htmlPreviewFrame) {
      this.htmlPreviewFrame.srcdoc = '';
      this.htmlPreviewFrame.style.transform = 'none';
      this.htmlPreviewFrame.style.width = '100%';
      this.htmlPreviewFrame.style.height = '100%';
    }
    if (this.generatedPreviewFrameWrap) {
      this.generatedPreviewFrameWrap.style.width = '';
      this.generatedPreviewFrameWrap.style.height = '';
    }
    this.clearGeneratedPreviewFitTimers();
    this.generatedPreviewDiagnostics = this.createInitialGeneratedPreviewDiagnostics();

    if (clearCode) {
      this.cancelGeneratedCodeTracking(true);
      this.generatedHtmlCode = '';
      this.generatedHtmlDesignId = null;
      this.generatedPreviewHtml = '';
      this.generatedCodeFiles = [];
      this.generatedCodeFileName = '';
      if (this.htmlCodeOutput) {
        this.htmlCodeOutput.value = '';
      }
      if (this.generatedCodeFileSelect) {
        this.generatedCodeFileSelect.innerHTML = '';
        this.generatedCodeFileSelect.disabled = true;
      }
    }

    this.updateGeneratedCodeMeta();
  }

  fallbackCopyText(text) {
    if (!document?.body) return false;

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.setAttribute('aria-hidden', 'true');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (e) {
      copied = false;
    }

    textarea.remove();
    return copied;
  }

  async copyText(text, successMessage) {
    const value = String(text || '');
    if (!value) {
      throw new Error('没有可复制的内容');
    }

    let clipboardError = null;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        this.showToast(successMessage, 'success');
        return true;
      }
    } catch (e) {
      clipboardError = e;
    }

    if (this.fallbackCopyText(value)) {
      this.showToast(successMessage, 'success');
      return true;
    }

    if (typeof window.prompt === 'function') {
      window.prompt('当前页面不允许直接写入剪贴板，请手动复制下面内容：', value);
      this.showToast('当前环境已切换为手动复制', 'error');
      return false;
    }

    throw clipboardError || new Error('当前页面不允许写入剪贴板');
  }

  async copyGeneratedHtml() {
    if (!this.generatedHtmlCode) {
      this.showToast('还没有可复制的代码文件', 'error');
      return;
    }

    try {
      const currentFile = this.getSelectedGeneratedFile();
      const name = currentFile?.name || '当前文件';
      await this.copyText(this.generatedHtmlCode, `${name} 已复制`);
    } catch (e) {
      this.showToast('复制失败: ' + e.message, 'error');
    }
  }

  async copyCurrentLink() {
    const url = this.getCurrentLanhuUrl();
    if (!url) {
      this.showToast('当前没有可复制的蓝湖链接', 'error');
      this.updateCopyLinkButtonState();
      return;
    }

    try {
      await this.copyText(url, '蓝湖链接已复制');
    } catch (e) {
      this.showToast('复制失败: ' + e.message, 'error');
    }
  }

  async copySelectedDesignLink() {
    const url = this.getSelectedDesignLink();
    if (!url) {
      this.showToast('当前设计图没有可复制的链接', 'error');
      this.updateSelectedDesignCopyButtonState();
      return;
    }

    try {
      await this.copyText(url, '设计图链接已复制');
    } catch (e) {
      this.showToast('复制失败: ' + e.message, 'error');
    }
  }

  openGeneratedHtmlInNewTab() {
    if (!this.generatedPreviewHtml) {
      this.showToast(`${this.getGeneratedFrameworkLabel(this.generatedCodeFramework || this.getSelectedGeneratedFramework())} 当前没有可直接预览的页面`, 'error');
      return;
    }

    const newTab = window.open('', '_blank');
    if (!newTab) {
      this.showToast('浏览器拦截了新标签页，请允许弹窗后重试', 'error');
      return;
    }

    newTab.document.open();
    newTab.document.write(this.buildGeneratedPreviewFrameDocument({ includeDiagnostics: false }));
    newTab.document.close();
    this.showToast('已在新标签页打开', 'success');
  }

  updateAnnotationPreviewButton() {
    if (!this.annotatePreviewBtn) return;
    this.annotatePreviewBtn.classList.toggle('active', this.isAnnotationPreview);
    this.annotatePreviewBtn.textContent = this.isAnnotationPreview ? '查看原图' : '标注图';
  }

  revokeAnnotationObjectUrl() {
    if (!this.annotationObjectUrl) return;
    URL.revokeObjectURL(this.annotationObjectUrl);
    this.annotationObjectUrl = '';
  }

  restoreOriginalPreviewImage() {
    const design = this.getSelectedDesign();
    this.revokeAnnotationObjectUrl();
    this.isAnnotationPreview = false;
    this.updateAnnotationPreviewButton();

    if (design?.url) {
      this.loadDesignPreviewImage(design, { resetAdaptiveState: false });
    }
  }

  async toggleAnnotationPreview() {
    if (!this.selectedDesignId || !this.currentTeamId || !this.currentProjectId) {
      this.showToast('请先选择设计图', 'error');
      return;
    }

    if (this.isAnnotationPreview) {
      this.restoreOriginalPreviewImage();
      this.showToast('已切换回原图');
      return;
    }

    const design = this.designs?.find(d => d.id === this.selectedDesignId);
    if (!design) {
      this.showToast('未找到当前设计图数据', 'error');
      return;
    }

    if (this.isLayerMode) {
      this.isLayerMode = false;
      if (this.layerModeBtn) {
        this.layerModeBtn.classList.remove('active');
        this.layerModeBtn.textContent = '图层解析';
      }
      this.hideLayerAnnotations();
    }

    this.log('正在从 lanhu-mcp 生成标注图...', 'info');
    this.showToast('正在生成标注图...');

    try {
      const query = new URLSearchParams({
        sessionId: this.sessionId,
        teamId: this.currentTeamId,
        projectId: this.currentProjectId,
        imageId: this.selectedDesignId,
        designName: design.name || 'annotated_design',
        t: String(Date.now())
      });
      const response = await fetch(`/api/annotate-image?${query.toString()}`);

      if (!response.ok) {
        let message = '生成标注图失败';
        try {
          const data = await response.json();
          message = data.message || message;
        } catch (e) {}
        throw new Error(message);
      }

      const blob = await response.blob();
      this.revokeAnnotationObjectUrl();
      this.annotationObjectUrl = URL.createObjectURL(blob);
      this.previewImage.src = this.annotationObjectUrl;
      this.previewImage.alt = `${design.name || '设计图'} 标注图`;
      this.isAnnotationPreview = true;
      this.updateAnnotationPreviewButton();
      this.log('标注图已加载', 'success');
      this.showToast('标注图已生成', 'success');
    } catch (e) {
      this.isAnnotationPreview = false;
      this.updateAnnotationPreviewButton();
      this.log('生成标注图失败: ' + e.message, 'error');
      this.showToast('生成标注图失败: ' + e.message, 'error');
    }
  }

  buildStaticHtmlFromLayers(design, {
    layers = this.layers,
    canvasInfo = this.canvasInfo,
    slices = null,
    preferredWidth = 0,
    preferredHeight = 0
  } = {}) {
    const resolvedLayers = Array.isArray(layers) ? layers : [];
    const resolvedSlices = Array.isArray(slices) ? slices : this.getAvailableSlicesForHtml();
    const preferredCanvasWidth = Math.max(1, Math.round(
      Number(preferredWidth) ||
      (Number(canvasInfo?.width) >= 320 ? Number(canvasInfo?.width) : 0) ||
      (Number(design?.width) >= 320 ? Number(design?.width) : 0) ||
      Number(this.previewImage?.naturalWidth) ||
      1
    ));
    const preferredCanvasHeight = Math.max(1, Math.round(
      Number(preferredHeight) ||
      Number(canvasInfo?.height) ||
      Number(design?.height) ||
      Number(this.previewImage?.naturalHeight) ||
      1
    ));
    const backgroundImageUrl = design?.url ? this.getProxiedImageUrl(design.url) : '';
    const normalized = this.buildRenderableModuleLayers(resolvedLayers, {
      slices: resolvedSlices,
      targetWidth: preferredCanvasWidth,
      targetHeight: preferredCanvasHeight,
      useDirectLayerImages: true
    });
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

  getRenderableLayersForHtml(layers, slices = [], { useDirectLayerImages = false } = {}) {
    const textDedup = new Set();
    const textLayers = layers
      .filter((layer) => {
        if (!layer || layer.visible === false) return false;

        const width = Math.round(Number(layer.width) || 0);
        const height = Math.round(Number(layer.height) || 0);
        if (width <= 1 || height <= 1) return false;

        const text = this.resolveLayerText(layer).trim();
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
    const imageLayers = useDirectLayerImages
      ? this.buildRenderableDirectImageLayers(layers)
      : this.buildRenderableSliceLayers(layers, slices);
    const visibleTextLayers = useDirectLayerImages
      ? dedupedTextLayers
      : this.filterTextLayersCoveredBySlices(dedupedTextLayers, imageLayers);

    return this.sortRenderableLayersForHtml([...imageLayers, ...visibleTextLayers]);
  }

  buildRenderableDirectImageLayers(layers) {
    if (!Array.isArray(layers) || layers.length === 0) {
      return [];
    }

    const seen = new Set();
    return layers
      .filter((layer) => {
        if (!layer || layer.visible === false || !layer.has_image) return false;
        const width = Number(layer.width) || 0;
        const height = Number(layer.height) || 0;
        return width > 1 && height > 1 && Boolean(layer.image);
      })
      .map((layer) => {
        const layerKey = this.getLayerReuseKey(layer);
        if (!layerKey || seen.has(layerKey)) {
          return null;
        }
        seen.add(layerKey);
        return {
          ...layer,
          _text: '',
          text: '',
          _imageUrl: this.getProxiedImageUrl(layer.image)
        };
      })
      .filter(Boolean);
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
    const textA = this.resolveLayerText(a).trim();
    const textB = this.resolveLayerText(b).trim();
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

    const text = this.resolveLayerText(layer);
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

  resolveLayerText(layer) {
    if (!layer || typeof layer !== 'object') return '';
    const preferred = String(layer._text || '').trim();
    if (preferred) return preferred;

    const directText = this.getLayerText(layer.text).trim();
    if (directText) return directText;

    const previewText = String(layer.textPreview || '').trim();
    if (previewText) return previewText;

    if (String(layer.type || '').trim() === 'textLayer') {
      return String(layer.name || '').trim();
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
    if (this.zoomLevel >= this.maxZoom) return;
    const center = this.getPreviewCenterPoint();
    if (this.zoomToPoint(this.zoomLevel + this.zoomStep, center.x, center.y)) {
      this.saveCurrentDesignState();
    }
  }

  // 缩小
  zoomOut() {
    if (this.zoomLevel <= this.minZoom) return;
    const center = this.getPreviewCenterPoint();
    if (this.zoomToPoint(this.zoomLevel - this.zoomStep, center.x, center.y)) {
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
    if (this.panzoom) {
      this.panzoom.zoom(this.zoomLevel, { animate: false, force: true, silent: true });
      this.panzoom.pan(this.panX, this.panY, { animate: false, force: true, silent: true });
    } else if (this.previewImage) {
      this.previewImage.style.transform = `scale(${this.zoomLevel}) translate(${this.panX}px, ${this.panY}px)`;
    }

    // 拖动时不渲染热点和图层，提升性能
    if (!this.isPreviewTransforming()) {
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
      if (this.isLayerMode && !this.isPreviewTransforming()) {
        this.showLayerAnnotations();
      }
    }, 100);
  }

  // 鼠标滚轮处理
  handleWheel(e) {
    if (this.isMarkMode || this.isNoteMode) return;

    if (this.isWheelZoomGesture(e)) {
      e.preventDefault();
      this.endWheelPan();

      const zoomFactor = Math.exp(-e.deltaY * this.wheelZoomIntensity);
      const nextZoom = this.clampZoom(this.zoomLevel * zoomFactor);

      if (this.zoomToPoint(nextZoom, e.clientX, e.clientY)) {
        this.queueDesignStateSave();
      }
      return;
    }

    if (this.panByWheel(e.deltaX, e.deltaY)) {
      e.preventDefault();
    }
  }

  // 开始拖动
  startDrag(e) {
    if (this.isMarkMode || this.isNoteMode) return;
    if (this.isPinching) return;
    if (!this.isPrimaryPointerEvent(e)) return;
    if (this.zoomLevel <= 1) return; // 只有放大时才允许拖动

    const point = this.getPointerClientPoint(e);
    if (!point) return;

    this.isDragging = true;
    this.dragStartX = point.clientX - this.panX * this.zoomLevel;
    this.dragStartY = point.clientY - this.panY * this.zoomLevel;
    this.setPreviewInteractionActive();
  }

  // 执行拖动
  doDrag(e) {
    if (!this.isDragging) return;
    const point = this.getPointerClientPoint(e);
    if (!point) return;

    this.panX = (point.clientX - this.dragStartX) / this.zoomLevel;
    this.panY = (point.clientY - this.dragStartY) / this.zoomLevel;
    this.applyTransform();
  }

  // 结束拖动
  endDrag() {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.setPreviewInteractionActive();
    // 拖动结束后保存状态
    this.saveCurrentDesignState();

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
      layerEl.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
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
    panel.addEventListener('mousedown', (e) => e.stopPropagation());
    panel.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });

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
