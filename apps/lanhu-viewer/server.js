const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const LanhuService = require('./services/lanhu');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json());
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

// 获取或创建蓝湖服务
function getLanhuService(sessionId) {
  if (!lanhuServices.has(sessionId)) {
    lanhuServices.set(sessionId, new LanhuService());
  }
  return lanhuServices.get(sessionId);
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
║                                              ║
╚══════════════════════════════════════════════╝
  `);
});
