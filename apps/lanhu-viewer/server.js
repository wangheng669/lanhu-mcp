const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const LanhuService = require('./services/lanhu');

const app = express();
const PORT = process.env.PORT || 3000;
const LANHU_MCP_BASE_URL = process.env.LANHU_MCP_BASE_URL || 'http://127.0.0.1:8000';
const LANHU_MCP_USER_NAME = process.env.LANHU_MCP_USER_NAME || 'lanhu-viewer';
const LANHU_MCP_USER_ROLE = process.env.LANHU_MCP_USER_ROLE || 'frontend';

// 中间件
app.use(express.json());
app.use('/vendor/panzoom', express.static(path.join(__dirname, 'node_modules/@panzoom/panzoom/dist'), {
  setHeaders: (res, filePath) => {
    if (/\.js$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store');
    }
  }
}));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (/\.(html|js|css)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store');
    }
  }
}));

// Session 持久化文件路径
const SESSION_FILE = path.join(__dirname, 'sessions', 'sessions.json');

// 确保目录存在
const sessionsDir = path.dirname(SESSION_FILE);
if (!fs.existsSync(sessionsDir)) {
  fs.mkdirSync(sessionsDir, { recursive: true });
}

// 从文件加载 sessions
function loadSessions() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = fs.readFileSync(SESSION_FILE, 'utf8');
      const parsed = JSON.parse(data);
      return new Map(Object.entries(parsed));
    }
  } catch (e) {
    console.error('Load sessions error:', e);
  }
  return new Map();
}

// 保存 sessions 到文件
function saveSessions() {
  try {
    const obj = Object.fromEntries(sessions);
    fs.writeFileSync(SESSION_FILE, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.error('Save sessions error:', e);
  }
}

// 会话存储 (持久化)
const sessions = loadSessions();

// 蓝湖服务实例缓存
const lanhuServices = new Map();
const generatedCodeJobs = new Map();
const GENERATED_CODE_JOB_TTL_MS = 15 * 60 * 1000;
const GENERATED_CODE_TOTAL_STEPS = 6;
const GENERATED_CODE_STEP_META = {
  queued: { label: '任务已创建', order: 0 },
  prepare: { label: '准备蓝湖环境', order: 1 },
  'fetch-version': { label: '读取设计图版本', order: 2 },
  'open-dds': { label: '打开 DDS 代码页', order: 3 },
  'switch-framework': { label: '切换代码框架', order: 4 },
  'read-files': { label: '读取代码文件', order: 5 },
  'build-preview': { label: '组装预览结果', order: 6 },
  done: { label: '代码生成完成', order: GENERATED_CODE_TOTAL_STEPS }
};
const GENERATED_CODE_MAX_LOGS = 120;

// 获取或创建蓝湖服务
function getLanhuService(sessionId) {
  if (!lanhuServices.has(sessionId)) {
    lanhuServices.set(sessionId, new LanhuService());
  }
  return lanhuServices.get(sessionId);
}

function getGeneratedCodeStepMeta(stepKey) {
  return GENERATED_CODE_STEP_META[stepKey] || GENERATED_CODE_STEP_META.queued;
}

function getGeneratedCodeProgressPercent(status, stepKey) {
  if (status === 'success') {
    return 100;
  }

  if (status === 'queued') {
    return 4;
  }

  const { order } = getGeneratedCodeStepMeta(stepKey);
  const normalizedOrder = Math.max(1, Number(order) || 1);
  const percent = Math.round((normalizedOrder / GENERATED_CODE_TOTAL_STEPS) * 100);
  return Math.min(status === 'error' ? 99 : 96, Math.max(8, percent));
}

function createGeneratedCodeLog(message, type = 'info') {
  return {
    time: new Date().toLocaleTimeString(),
    message,
    type
  };
}

function appendGeneratedCodeJobLog(job, messageOrEntry, type = 'info') {
  if (!job) return;

  const entry = typeof messageOrEntry === 'string'
    ? createGeneratedCodeLog(messageOrEntry, type)
    : {
        time: messageOrEntry?.time || new Date().toLocaleTimeString(),
        message: messageOrEntry?.message || '',
        type: messageOrEntry?.type || type
      };

  if (!entry.message) return;

  job.logs.push(entry);
  if (job.logs.length > GENERATED_CODE_MAX_LOGS) {
    job.logs = job.logs.slice(-GENERATED_CODE_MAX_LOGS);
  }
  job.updatedAt = Date.now();
}

function updateGeneratedCodeJobStep(job, stepKey, currentAction = '') {
  if (!job) return;

  const stepMeta = getGeneratedCodeStepMeta(stepKey);
  job.stepKey = stepKey;
  job.stepLabel = stepMeta.label;
  job.currentStep = Math.min(GENERATED_CODE_TOTAL_STEPS, Math.max(0, stepMeta.order || 0));
  job.progressPercent = getGeneratedCodeProgressPercent(job.status, stepKey);
  if (currentAction) {
    job.currentAction = currentAction;
  } else if (!job.currentAction) {
    job.currentAction = stepMeta.label;
  }
  job.updatedAt = Date.now();
}

function createGeneratedCodeJob({ sessionId, teamId, projectId, imageId, framework }) {
  const job = {
    id: uuidv4(),
    sessionId,
    teamId: String(teamId),
    projectId: String(projectId),
    imageId: String(imageId),
    framework: String(framework || 'html'),
    status: 'queued',
    stepKey: 'queued',
    stepLabel: GENERATED_CODE_STEP_META.queued.label,
    currentStep: 0,
    totalSteps: GENERATED_CODE_TOTAL_STEPS,
    progressPercent: getGeneratedCodeProgressPercent('queued', 'queued'),
    currentAction: '任务已创建，等待执行',
    logs: [],
    result: null,
    errorMessage: '',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  appendGeneratedCodeJobLog(job, '蓝湖代码生成任务已创建');
  generatedCodeJobs.set(job.id, job);
  return job;
}

function serializeGeneratedCodeJob(job) {
  if (!job) return null;

  return {
    id: job.id,
    status: job.status,
    stepKey: job.stepKey,
    stepLabel: job.stepLabel,
    currentStep: job.status === 'success'
      ? GENERATED_CODE_TOTAL_STEPS
      : Math.min(GENERATED_CODE_TOTAL_STEPS, Math.max(0, Number(job.currentStep) || 0)),
    totalSteps: GENERATED_CODE_TOTAL_STEPS,
    progressPercent: job.progressPercent,
    currentAction: job.currentAction,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    logs: job.logs.slice(-20),
    result: job.status === 'success' ? job.result : undefined
  };
}

function handleGeneratedCodeProgressEvent(job, event) {
  if (!job || !event || typeof event !== 'object') {
    return;
  }

  if (event.type === 'step') {
    updateGeneratedCodeJobStep(job, event.stepKey, event.currentAction);
    return;
  }

  if (event.type === 'log' && event.log) {
    appendGeneratedCodeJobLog(job, event.log);
    if (event.log.message) {
      job.currentAction = event.log.message;
      job.updatedAt = Date.now();
    }
  }
}

async function runGeneratedCodeJob(job, session) {
  const service = new LanhuService();
  service.setCookies(session.cookies);
  service.setProgressReporter((event) => handleGeneratedCodeProgressEvent(job, event));

  job.status = 'running';
  updateGeneratedCodeJobStep(job, 'prepare', '正在准备蓝湖会话');
  appendGeneratedCodeJobLog(job, '开始执行蓝湖代码生成');

  try {
    const result = await service.getGeneratedCode(
      job.teamId,
      job.projectId,
      job.imageId,
      job.framework
    );

    job.status = 'success';
    job.result = {
      ...result,
      logs: service.getLogs()
    };
    updateGeneratedCodeJobStep(job, 'done', '蓝湖代码生成完成');
    appendGeneratedCodeJobLog(job, '蓝湖代码生成完成', 'success');
  } catch (error) {
    job.status = 'error';
    job.errorMessage = error.message || '蓝湖代码生成失败';
    job.progressPercent = getGeneratedCodeProgressPercent('error', job.stepKey);
    job.currentAction = job.errorMessage;
    appendGeneratedCodeJobLog(job, `蓝湖代码生成失败: ${job.errorMessage}`, 'error');
  } finally {
    job.updatedAt = Date.now();
  }
}

function cleanupGeneratedCodeJobs() {
  const now = Date.now();
  generatedCodeJobs.forEach((job, jobId) => {
    if (now - job.updatedAt > GENERATED_CODE_JOB_TTL_MS) {
      generatedCodeJobs.delete(jobId);
    }
  });
}

const generatedCodeCleanupTimer = setInterval(cleanupGeneratedCodeJobs, 60 * 1000);
if (typeof generatedCodeCleanupTimer.unref === 'function') {
  generatedCodeCleanupTimer.unref();
}

function mergeDesignsWithLocalMetadata(primaryDesigns = [], localDesigns = []) {
  const localDesignMap = new Map(
    (Array.isArray(localDesigns) ? localDesigns : [])
      .filter((design) => design && design.id)
      .map((design) => [String(design.id), design])
  );

  return (Array.isArray(primaryDesigns) ? primaryDesigns : []).map((design) => {
    const localDesign = localDesignMap.get(String(design?.id || ''));
    return {
      ...localDesign,
      ...design,
      ddsJumpStatus: design?.ddsJumpStatus ?? design?.dds_jump_status ?? localDesign?.ddsJumpStatus ?? null,
      latestVersion: design?.latestVersion ?? design?.latest_version ?? localDesign?.latestVersion ?? ''
    };
  });
}

function buildCanonicalDesignsUrl(result, rawUrl) {
  const normalizedRawUrl = String(rawUrl || '').trim();
  const teamId = String(result?.teamId || '').trim();
  const projectId = String(result?.projectId || '').trim();
  const imageId = String(result?.imageId || '').trim();

  if (!teamId || !projectId) {
    return normalizedRawUrl;
  }

  const params = new URLSearchParams({
    pid: projectId,
    tid: teamId,
    see: 'all'
  });

  if (imageId) {
    params.set('image_id', imageId);
    params.set('fromEditor', 'true');
    params.set('type', 'image');
  }

  return `https://lanhuapp.com/web/#/item/project/stage?${params.toString()}`;
}

function buildLanhuCookieHeader(session) {
  const cookies = Array.isArray(session?.cookies) ? session.cookies : [];
  return cookies
    .filter(cookie => cookie && cookie.name && cookie.value)
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

function buildLanhuMcpUrl(routePath, query = {}) {
  const url = new URL(routePath, LANHU_MCP_BASE_URL.endsWith('/') ? LANHU_MCP_BASE_URL : `${LANHU_MCP_BASE_URL}/`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });
  return url;
}

function getSafeLanhuMcpHeaderValue(value, fallback = '') {
  const normalizedValue = String(value ?? '').trim();
  if (!normalizedValue) {
    return fallback;
  }

  return /^[\x00-\xFF]*$/.test(normalizedValue) ? normalizedValue : fallback;
}

function buildLanhuMcpHeaders(session, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  const cookieHeader = buildLanhuCookieHeader(session);

  if (cookieHeader) {
    headers['X-Lanhu-Cookie'] = cookieHeader;
  }

  headers['X-Lanhu-User-Name'] = getSafeLanhuMcpHeaderValue(
    session?.userInfo?.name,
    getSafeLanhuMcpHeaderValue(LANHU_MCP_USER_NAME, 'lanhu-viewer')
  );
  headers['X-Lanhu-User-Role'] = getSafeLanhuMcpHeaderValue(LANHU_MCP_USER_ROLE, 'frontend');
  return headers;
}

async function callLanhuMcpJson(routePath, { method = 'POST', session, body, query } = {}) {
  const url = buildLanhuMcpUrl(routePath, query);
  const headers = buildLanhuMcpHeaders(session, {});

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : { message: await response.text() };

  if (!response.ok) {
    throw new Error(data.message || `lanhu-mcp request failed (${response.status})`);
  }

  return data;
}

async function callLanhuMcpBinary(routePath, { method = 'GET', session, query } = {}) {
  const url = buildLanhuMcpUrl(routePath, query);
  const headers = buildLanhuMcpHeaders(session, {});
  const response = await fetch(url, { method, headers });

  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    let message = `lanhu-mcp request failed (${response.status})`;
    if (contentType.includes('application/json')) {
      const data = await response.json();
      message = data.message || message;
    } else {
      const text = await response.text();
      if (text) message = text;
    }
    throw new Error(message);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get('content-type') || 'application/octet-stream'
  };
}

// ==================== API 路由 ====================

// 获取会话状态
app.get('/api/session', (req, res) => {
  const sessionId = req.headers['x-session-id'];

  if (!sessionId || !sessions.has(sessionId)) {
    return res.json({
      loggedIn: false,
      message: '未登录'
    });
  }

  const session = sessions.get(sessionId);
  res.json({
    loggedIn: true,
    userInfo: session.userInfo || null,
    cookies: session.cookies || []
  });
});

// 登录 - 打开浏览器让用户登录蓝湖
app.post('/api/login', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'] || uuidv4();
    const service = getLanhuService(sessionId);

    // 启动登录流程
    const result = await service.login();

    if (result.success) {
      // 保存会话
      sessions.set(sessionId, {
        cookies: result.cookies,
        userInfo: result.userInfo,
        createdAt: new Date()
      });
      saveSessions(); // 持久化

      res.json({
        success: true,
        sessionId,
        userInfo: result.userInfo,
        cookies: result.cookies,
        message: '登录成功'
      });
    } else {
      res.status(401).json({
        success: false,
        message: result.message || '登录失败'
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 检查登录状态 (轮询)
app.get('/api/login/status', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    if (!sessionId) {
      return res.json({ status: 'waiting' });
    }

    const service = getLanhuService(sessionId);
    const status = await service.checkLoginStatus();

    if (status.loggedIn) {
      sessions.set(sessionId, {
        cookies: status.cookies,
        userInfo: status.userInfo,
        createdAt: new Date()
      });
      saveSessions(); // 持久化

      // 清理服务实例
      lanhuServices.delete(sessionId);
    }

    res.json(status);
  } catch (error) {
    res.json({ status: 'waiting', error: error.message });
  }
});

// 取消登录
app.post('/api/login/cancel', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    if (sessionId) {
      const service = lanhuServices.get(sessionId);
      if (service) {
        await service.cancelLogin();
        lanhuServices.delete(sessionId);
      }
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 登出
app.post('/api/logout', (req, res) => {
  const sessionId = req.headers['x-session-id'];
  if (sessionId) {
    sessions.delete(sessionId);
    lanhuServices.delete(sessionId);
    saveSessions();
  }
  res.json({ success: true, message: '已登出' });
});

// 解析蓝湖链接
app.post('/api/parse', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        message: '请提供蓝湖链接'
      });
    }

    if (!sessionId || !sessions.has(sessionId)) {
      return res.status(401).json({
        success: false,
        message: '请先登录'
      });
    }

    const session = sessions.get(sessionId);
    const service = new LanhuService();
    service.setCookies(session.cookies);

    const result = await service.parseUrl(url);
    const shouldUseMcpDesigns = result?.success && ['design', 'project'].includes(result.type);

    if (shouldUseMcpDesigns) {
      try {
        const designsUrl = buildCanonicalDesignsUrl(result, url);
        const mcpResult = await callLanhuMcpJson('/viewer/designs', {
          session,
          body: { url: designsUrl }
        });
        if (mcpResult.status === 'success' && Array.isArray(mcpResult.designs)) {
          result.designs = mergeDesignsWithLocalMetadata(mcpResult.designs, result.designs);
          if (!result.project) {
            result.project = {};
          }
          if (!result.project.name && mcpResult.project_name) {
            result.project.name = mcpResult.project_name;
          }
          service.log('设计图列表来自 lanhu-mcp', 'success');
          result.logs = service.getLogs();
        }
      } catch (mcpError) {
        service.log(`lanhu-mcp 设计图列表回退本地解析: ${mcpError.message}`, 'warn');
        result.logs = service.getLogs();
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Parse error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 获取设计图列表
app.post('/api/designs', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const { teamId, projectId } = req.body;

    if (!sessionId || !sessions.has(sessionId)) {
      return res.status(401).json({
        success: false,
        message: '请先登录'
      });
    }

    const session = sessions.get(sessionId);
    const { url } = req.body;

    if (url) {
      try {
        const designs = await callLanhuMcpJson('/viewer/designs', {
          session,
          body: { url }
        });
        return res.json(designs);
      } catch (mcpError) {
        console.warn('lanhu-mcp designs fallback:', mcpError.message);
      }
    }

    const service = new LanhuService();
    service.setCookies(session.cookies);

    const designs = await service.getDesigns(teamId, projectId);
    res.json(designs);
  } catch (error) {
    console.error('Get designs error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 获取切图列表
app.post('/api/slices', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const { teamId, projectId, imageId } = req.body;

    if (!sessionId || !sessions.has(sessionId)) {
      return res.status(401).json({
        success: false,
        message: '请先登录'
      });
    }

    const session = sessions.get(sessionId);
    const service = new LanhuService();
    service.setCookies(session.cookies);

    const result = await service.getSlices(teamId, projectId, imageId);
    res.json({
      ...result,
      logs: service.getLogs()
    });
  } catch (error) {
    console.error('Get slices error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 获取设计图图层
app.post('/api/layers', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const { teamId, projectId, imageId } = req.body;

    if (!sessionId || !sessions.has(sessionId)) {
      return res.status(401).json({
        success: false,
        message: '请先登录'
      });
    }

    if (!teamId || !projectId || !imageId) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数'
      });
    }

    const session = sessions.get(sessionId);
    try {
      const result = await callLanhuMcpJson('/viewer/layers', {
        session,
        body: { teamId, projectId, imageId }
      });
      return res.json(result);
    } catch (mcpError) {
      console.warn('lanhu-mcp layers fallback:', mcpError.message);
    }

    const service = new LanhuService();
    service.setCookies(session.cookies);

    const result = await service.getLayers(teamId, projectId, imageId);
    res.json(result);
  } catch (error) {
    console.error('Get layers error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 获取蓝湖生成代码
app.post('/api/generated-code', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const { teamId, projectId, imageId, framework } = req.body;

    if (!sessionId || !sessions.has(sessionId)) {
      return res.status(401).json({
        success: false,
        message: '请先登录'
      });
    }

    if (!teamId || !projectId || !imageId) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数'
      });
    }

    const session = sessions.get(sessionId);
    const service = new LanhuService();
    service.setCookies(session.cookies);

    const result = await service.getGeneratedCode(teamId, projectId, imageId, framework);
    res.json({
      ...result,
      logs: service.getLogs()
    });
  } catch (error) {
    console.error('Get generated code error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 启动蓝湖代码生成任务
app.post('/api/generated-code/start', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const { teamId, projectId, imageId, framework } = req.body;

    if (!sessionId || !sessions.has(sessionId)) {
      return res.status(401).json({
        success: false,
        message: '请先登录'
      });
    }

    if (!teamId || !projectId || !imageId) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数'
      });
    }

    const session = sessions.get(sessionId);
    const job = createGeneratedCodeJob({
      sessionId,
      teamId,
      projectId,
      imageId,
      framework
    });

    setImmediate(() => {
      runGeneratedCodeJob(job, session).catch((error) => {
        job.status = 'error';
        job.errorMessage = error.message || '蓝湖代码生成失败';
        job.progressPercent = getGeneratedCodeProgressPercent('error', job.stepKey);
        job.currentAction = job.errorMessage;
        appendGeneratedCodeJobLog(job, `蓝湖代码生成失败: ${job.errorMessage}`, 'error');
        job.updatedAt = Date.now();
      });
    });

    res.status(202).json({
      success: true,
      job: serializeGeneratedCodeJob(job)
    });
  } catch (error) {
    console.error('Start generated code job error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 查询蓝湖代码生成任务状态
app.get('/api/generated-code/jobs/:jobId', (req, res) => {
  const sessionId = req.headers['x-session-id'];
  const { jobId } = req.params;

  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(401).json({
      success: false,
      message: '请先登录'
    });
  }

  const job = generatedCodeJobs.get(jobId);
  if (!job || job.sessionId !== sessionId) {
    return res.status(404).json({
      success: false,
      message: '未找到代码生成任务'
    });
  }

  res.json({
    success: true,
    job: serializeGeneratedCodeJob(job)
  });
});

// 获取设计图图层标注预览
app.get('/api/annotate-image', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'] || req.query.sessionId;
    const { teamId, projectId, imageId, designName } = req.query;

    if (!sessionId || !sessions.has(sessionId)) {
      return res.status(401).json({
        success: false,
        message: '请先登录'
      });
    }

    if (!teamId || !projectId || !imageId) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数'
      });
    }

    const session = sessions.get(sessionId);
    const { buffer, contentType } = await callLanhuMcpBinary('/viewer/annotate-image', {
      session,
      query: {
        team_id: teamId,
        project_id: projectId,
        image_id: imageId,
        design_name: designName || 'annotated_design'
      }
    });

    res.set('Content-Type', contentType || 'image/png');
    res.set('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (error) {
    console.error('Annotate image error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 下载设计图预览
app.get('/api/image/preview', async (req, res) => {
  try {
    // 支持从 header 或 URL 参数获取 session-id（img 标签无法发送自定义 header）
    const sessionId = req.headers['x-session-id'] || req.query.sessionId;
    const { url } = req.query;

    if (!sessionId || !sessions.has(sessionId)) {
      return res.status(401).json({
        success: false,
        message: '请先登录'
      });
    }

    const session = sessions.get(sessionId);
    const service = new LanhuService();
    service.setCookies(session.cookies);

    const { buffer, contentType } = await service.downloadImage(url);

    res.set('Content-Type', contentType || 'image/png');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(buffer);
  } catch (error) {
    console.error('Preview image error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 代理下载切图
app.post('/api/download', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const { url, filename } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        message: '请提供下载链接'
      });
    }

    // 直接获取图片
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('下载失败');
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type') || 'image/png';

    // 设置响应头
    res.set('Content-Type', contentType);
    res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.set('Content-Length', buffer.length);
    res.send(buffer);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 批量下载切图（打包成zip）
app.post('/api/download-all', async (req, res) => {
  let successCount = 0;
  let failCount = 0;

  try {
    const sessionId = req.headers['x-session-id'];
    const { slices, platform, projectName } = req.body;

    console.log('Download-all request:', { sliceCount: slices?.length, platform, projectName });

    if (!slices || slices.length === 0) {
      return res.status(400).json({
        success: false,
        message: '没有切图可下载'
      });
    }

    const archiver = require('archiver');
    const archive = archiver('zip', { zlib: { level: 9 } });

    // 监听错误事件
    archive.on('error', (err) => {
      console.error('Archive error:', err);
    });

    // 设置响应头
    const name = projectName || 'slices';
    // 解码 HTML 实体并清理文件名中的非法字符，只保留 ASCII 安全字符
    const safeName = name
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
      .replace(/&[a-zA-Z]+;/g, '_')
      .replace(/[<>:"/\\|?*\r\n]/g, '_')
      .replace(/[\x00-\x1f]/g, '')
      .replace(/[^\x20-\x7E]/g, '_')  // 只保留 ASCII 可打印字符
      .replace(/_+/g, '_')  // 合并多个下划线
      .replace(/^_|_$/g, '')  // 移除首尾下划线
      .trim()
      .substring(0, 100) || 'slices';
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="${safeName}_slices.zip"`);

    // 将 zip 流直接发送给客户端
    archive.pipe(res);

    // 下载并添加每个切图
    for (const slice of slices) {
      try {
        const scales = slice.scales || { '1x': slice.defaultUrl };

        // 根据平台选择倍率
        let scaleKey = '1x';
        if (platform === 'ios' || platform === 'web') {
          scaleKey = scales['2x'] ? '2x' : '1x';
        } else if (platform === 'android') {
          scaleKey = scales['2x'] ? '2x' : '1x';
        }

        const url = scales[scaleKey] || Object.values(scales)[0];
        if (!url) {
          console.log('No URL for slice:', slice.name);
          continue;
        }

        console.log('Downloading:', slice.name, 'from', url.substring(0, 80) + '...');
        const response = await fetch(url);
        console.log('Response status:', response.status, response.statusText);

        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const format = scaleKey === 'svg' || url.includes('.svg') ? 'svg' : 'png';
          // 清理文件名中的非法字符
          const safeName = slice.name.replace(/[<>:"/\\|?*]/g, '_');
          const filename = `${safeName}@${scaleKey}.${format}`;

          archive.append(buffer, { name: filename });
          successCount++;
          console.log('Added to archive:', filename, 'size:', buffer.length);
        } else {
          failCount++;
          console.error('Failed to download:', slice.name, 'status:', response.status);
        }
      } catch (e) {
        failCount++;
        console.error('Failed to download slice:', slice.name, e.message);
      }
    }

    console.log('Download complete. Success:', successCount, 'Failed:', failCount);

    // 完成打包
    archive.finalize();
  } catch (error) {
    console.error('Download all error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║                                              ║
║   🎨 蓝湖链接解析器已启动                      ║
║                                              ║
║   访问地址: http://localhost:${PORT}            ║
║   MCP后端: ${LANHU_MCP_BASE_URL.padEnd(32).slice(0, 32)}║
║                                              ║
╚══════════════════════════════════════════════╝
  `);
});
