const { chromium } = require('playwright');

const DDS_FRAMEWORK_LABELS = {
  h5: 'HTML',
  html: 'HTML',
  vue: 'Vue',
  vue2: 'Vue',
  react: 'React',
  wxmp: '微信小程序',
  weapp: '微信小程序',
  mini_program: '微信小程序',
  miniProgram: '微信小程序',
  uniapp: 'uni-app',
  'uni-app': 'uni-app'
};

const DDS_PRIMARY_FILE_NAMES = {
  HTML: 'index.html',
  Vue: 'index.vue',
  React: 'index.jsx',
  '微信小程序': 'index.wxml',
  'uni-app': 'index.vue'
};

const DDS_FATAL_RUNTIME_PATTERNS = [
  /Cannot read properties of undefined \(reading 'files'\)/i,
  /getStructureCode/i,
  /selectFrameValue/i
];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class LanhuService {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.cookies = [];
    this.loginPromise = null;
    this.logs = [];
    this.progressReporter = null;
  }

  // 添加日志
  log(message, type = 'info') {
    const time = new Date().toLocaleTimeString();
    const entry = { time, message, type };
    this.logs.push(entry);
    this.emitProgress({ type: 'log', log: entry });
    console.log(`[${type}] ${message}`);
  }

  // 清空日志
  clearLogs() {
    this.logs = [];
  }

  // 获取日志
  getLogs() {
    return this.logs;
  }

  setProgressReporter(reporter) {
    this.progressReporter = typeof reporter === 'function' ? reporter : null;
  }

  emitProgress(event) {
    if (typeof this.progressReporter !== 'function') {
      return;
    }

    try {
      this.progressReporter(event);
    } catch (error) {
      console.warn('Progress reporter error:', error.message);
    }
  }

  updateGeneratedStep(stepKey, currentAction = '') {
    this.emitProgress({
      type: 'step',
      stepKey,
      currentAction
    });
  }

  /**
   * 设置 Cookie
   */
  setCookies(cookies) {
    this.cookies = cookies;
  }

  getValidCookies() {
    return this.cookies.filter((cookie) => {
      if (!cookie || !cookie.name || typeof cookie.value === 'undefined') {
        return false;
      }
      if (cookie.expires === -1 || typeof cookie.expires !== 'number') {
        return true;
      }
      return cookie.expires > (Date.now() / 1000);
    });
  }

  buildCookieHeader() {
    return this.getValidCookies()
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');
  }

  buildRequestHeaders(extraHeaders = {}) {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      ...extraHeaders
    };
    const cookieHeader = this.buildCookieHeader();
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }
    return headers;
  }

  async createAuthenticatedContext() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    if (this.cookies.length > 0) {
      await context.addCookies(this.cookies);
    }

    return { browser, context };
  }

  /**
   * 登录 - 打开浏览器让用户手动登录
   */
  async login() {
    this.browser = await chromium.launch({
      headless: false,
      slowMo: 100
    });

    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();

    // 访问蓝湖登录页
    await this.page.goto('https://lanhuapp.com/web/', {
      waitUntil: 'networkidle'
    });

    return new Promise((resolve) => {
      let initialToken = '';
      let initialUrl = '';
      let checked = false;

      // 获取初始状态
      this.context.cookies().then(cookies => {
        const tokenCookie = cookies.find(c => c.name === 'user_token');
        initialToken = tokenCookie ? tokenCookie.value : '';
        initialUrl = this.page.url();
        console.log('Initial state - URL:', initialUrl, 'hasToken:', !!initialToken);
      });

      // 监听登录成功
      const checkLogin = async () => {
        try {
          const url = this.page.url();
          const cookies = await this.context.cookies();
          const tokenCookie = cookies.find(c => c.name === 'user_token');
          const currentToken = tokenCookie ? tokenCookie.value : '';
          const hasToken = !!currentToken;

          // 检测登录成功的条件：
          // 1. 有 token
          // 2. URL 已经跳转到 dashboard 或 web 页面（不在 sso 登录相关页面）
          // 3. (token 发生了变化 或者 已经检查过一轮)
          const isSsoPage = url.includes('/sso/');
          const isSuccessPage = url.includes('/dashboard/') || url.includes('/web/#/');

          if (hasToken && isSuccessPage) {
            // 等待一下确保页面稳定
            if (!checked) {
              checked = true;
              console.log('Detected success page, verifying...');
              setTimeout(checkLogin, 2000);
              return;
            }

            // token 变化了，或者初始就没有 token
            const tokenChanged = initialToken && currentToken && initialToken !== currentToken;
            const wasNotLoggedIn = !initialToken;

            if (tokenChanged || wasNotLoggedIn || checked) {
              console.log('Login successful! URL:', url);

              const userInfo = await this.getUserInfo();

              await this.browser.close();
              this.browser = null;

              resolve({
                success: true,
                cookies: cookies,
                userInfo
              });
              return;
            }
          }

          console.log('Waiting... URL:', url, 'hasToken:', hasToken);
        } catch (e) {
          console.error('Check login error:', e.message);
        }

        // 继续检查
        setTimeout(checkLogin, 1500);
      };

      // 开始检查
      setTimeout(checkLogin, 2000);

      // 超时处理 (5分钟)
      setTimeout(() => {
        if (this.browser) {
          this.browser.close();
          this.browser = null;
        }
        resolve({
          success: false,
          message: '登录超时'
        });
      }, 5 * 60 * 1000);
    });
  }

  /**
   * 检查登录状态 (用于轮询)
   */
  async checkLoginStatus() {
    if (!this.page) {
      return { status: 'waiting' };
    }

    try {
      const url = this.page.url();
      const cookies = await this.context.cookies();

      // 检查是否有 user_token cookie
      const hasToken = cookies.some(c => c.name === 'user_token');

      const isLoginPage = url.includes('/sso/#/login') || url.includes('sso/login');
      const isLoggedPage = url.includes('/web/#/item') ||
                           url.includes('/web/#/main') ||
                           url.includes('/sso/#/main') ||
                           url.includes('/web/#/project');

      if ((isLoggedPage || (hasToken && !isLoginPage)) && !url.includes('/sso/#/login')) {
        const userInfo = await this.getUserInfo();

        if (this.browser) {
          await this.browser.close();
          this.browser = null;
        }

        return {
          status: 'success',
          loggedIn: true,
          cookies,
          userInfo
        };
      }
      return { status: 'waiting', url, hasToken };
    } catch (e) {
      return { status: 'waiting', error: e.message };
    }
  }

  /**
   * 取消登录
   */
  async cancelLogin() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * 获取用户信息
   */
  async getUserInfo() {
    if (!this.page) return null;

    try {
      // 尝试从 API 获取用户信息
      const response = await this.page.evaluate(async () => {
        try {
          const res = await fetch('https://lanhuapp.com/api/user/info', {
            credentials: 'include'
          });
          return await res.json();
        } catch (e) {
          return null;
        }
      });

      if (response && response.data) {
        return {
          id: response.data.id,
          name: response.data.nickname || response.data.name,
          email: response.data.email,
          avatar: response.data.avatar
        };
      }
    } catch (e) {
      // 忽略错误
    }

    return { name: '已登录用户' };
  }

  /**
   * 解析蓝湖 URL
   */
  async parseUrl(url) {
    this.clearLogs();
    this.log('开始解析 URL: ' + url);

    // 先解析 URL 类型
    const urlInfo = this._parseUrlType(url);
    this.log('URL 类型: ' + urlInfo.type);
    this.log('团队ID: ' + (urlInfo.teamId || '无'));
    this.log('项目ID: ' + (urlInfo.projectId || '无'));

    if (urlInfo.type === 'invite') {
      this.log('检测到邀请链接，正在解析...');
      // 邀请链接需要先解析
      return await this._resolveInviteLink(url);
    }

    // 获取项目信息
    this.log('正在获取项目信息...');
    return await this._getProjectInfo(urlInfo);
  }

  /**
   * 解析 URL 类型
   */
  _parseUrlType(url) {
    const result = {
      originalUrl: url,
      type: 'unknown',
      teamId: null,
      projectId: null,
      docId: null,
      imageId: null
    };

    try {
      const urlObj = new URL(url);
      const hash = urlObj.hash;

      // 提取参数
      const params = new URLSearchParams(hash.split('?')[1] || '');

      result.teamId = params.get('tid');
      result.projectId = params.get('pid');
      result.docId = params.get('docId');
      result.imageId = params.get('image_id');

      // 判断类型
      if (url.includes('/invite') || url.includes('/link/')) {
        result.type = 'invite';
      } else if (result.docId) {
        result.type = 'prd'; // PRD/原型文档
      } else if (result.imageId || hash.includes('/stage')) {
        result.type = 'design'; // UI 设计图
      } else if (result.projectId) {
        result.type = 'project'; // 项目首页
      }

    } catch (e) {
      console.error('Parse URL error:', e);
    }

    return result;
  }

  /**
   * 解析邀请链接
   */
  async _resolveInviteLink(url) {
    this.log('启动浏览器解析邀请链接...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    // 设置 cookies
    if (this.cookies.length > 0) {
      await context.addCookies(this.cookies);
      this.log('已设置登录 Cookie');
    }

    const page = await context.newPage();

    try {
      this.log('访问邀请链接: ' + url);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // 等待 URL 跳转完成（邀请链接会跳转到实际项目页面）
      this.log('等待页面跳转...');
      let finalUrl = page.url();
      let attempts = 0;
      const maxAttempts = 30; // 最多等待 15 秒

      // 等待 URL 变化（从 invite 跳转到实际页面）
      while (attempts < maxAttempts) {
        await page.waitForTimeout(500);
        const currentUrl = page.url();

        // 检查是否已经跳转完成（URL 不再包含 invite/link）
        if (!currentUrl.includes('/invite') && !currentUrl.includes('/link/')) {
          // 额外检查是否包含项目信息
          if (currentUrl.includes('pid=') || currentUrl.includes('/project/')) {
            finalUrl = currentUrl;
            this.log('跳转完成: ' + finalUrl, 'success');
            break;
          }
        }

        // 如果 URL 变化了，更新 finalUrl
        if (currentUrl !== finalUrl) {
          finalUrl = currentUrl;
          this.log('URL 变化: ' + finalUrl);
        }

        attempts++;
      }

      // 额外等待确保页面完全加载
      await page.waitForTimeout(2000);
      finalUrl = page.url();

      this.log('最终 URL: ' + finalUrl);
      await browser.close();

      // 检查是否成功跳转到项目页面
      if (finalUrl.includes('/invite') || finalUrl.includes('/link/')) {
        throw new Error('邀请链接跳转失败，可能需要先登录或链接已过期');
      }

      // 重新解析最终 URL
      this.log('重新解析跳转后的 URL...');
      return await this.parseUrl(finalUrl);
    } catch (e) {
      await browser.close();
      this.log('解析邀请链接失败: ' + e.message, 'error');
      throw new Error('解析邀请链接失败: ' + e.message);
    }
  }

  /**
   * 获取项目信息
   */
  async _getProjectInfo(urlInfo) {
    const { type, teamId, projectId, docId, imageId } = urlInfo;

    const result = {
      success: true,
      type,
      teamId,
      projectId,
      docId,
      imageId,
      project: null,
      designs: [],
      pages: [],
      logs: this.logs
    };

    // 获取项目基础信息
    if (projectId) {
      this.log('正在获取项目详情...');
      result.project = await this._fetchProjectInfo(teamId, projectId);
      if (result.project && result.project.name) {
        this.log('项目名称: ' + result.project.name, 'success');
      } else {
        this.log('未能获取项目名称', 'warn');
      }
    }

    // 根据类型获取详细信息
    if (type === 'design') {
      this.log('正在获取设计图列表...');
      result.designs = await this.getDesigns(teamId, projectId);
      this.log('获取到 ' + result.designs.length + ' 张设计图', 'success');
    } else if (type === 'prd') {
      this.log('正在获取 PRD 页面列表...');
      result.pages = await this._getPagesList(teamId, projectId, docId);
      this.log('获取到 ' + result.pages.length + ' 个页面', 'success');
    }

    this.log('解析完成!', 'success');
    result.logs = this.logs;
    return result;
  }

  /**
   * 获取项目基础信息
   */
  async _fetchProjectInfo(teamId, projectId) {
    try {
      this.log('启动浏览器获取项目信息...');
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();

      if (this.cookies.length > 0) {
        await context.addCookies(this.cookies);
        this.log('已设置 ' + this.cookies.length + ' 个 Cookie');
      }

      const page = await context.newPage();

      // 先访问蓝湖页面建立 session
      this.log('访问蓝湖页面...');
      await page.goto('https://lanhuapp.com/web/', { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1000);

      // 直接调用 API 获取项目信息
      this.log('调用 API 获取项目详情...');
      const projectInfo = await page.evaluate(async ({ tid, pid }) => {
        try {
          const response = await fetch(
            `https://lanhuapp.com/api/project/images?project_id=${pid}&team_id=${tid}&dds_status=1&position=1&show_cb_src=1&comment=1`,
            { credentials: 'include' }
          );
          const data = await response.json();
          if (data.data) {
            return {
              name: data.data.name,
              description: data.data.description,
              creator: data.data.creator_name || data.data.creator,
              createdAt: data.data.create_time,
              updatedAt: data.data.update_time,
              memberCount: data.data.member_count
            };
          }
        } catch (e) {
          console.error('API error:', e);
        }
        return null;
      }, { tid: teamId, pid: projectId });

      await browser.close();
      this.log('浏览器已关闭');

      if (projectInfo) {
        this.log('成功获取项目信息', 'success');
      } else {
        this.log('API 返回数据为空', 'warn');
      }

      return projectInfo || { name: '未知项目' };
    } catch (e) {
      this.log('获取项目信息失败: ' + e.message, 'error');
      return { name: '未知项目', error: e.message };
    }
  }

  /**
   * 获取设计图列表
   */
  async getDesigns(teamId, projectId) {
    this.log('启动浏览器获取设计图...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    if (this.cookies.length > 0) {
      await context.addCookies(this.cookies);
      this.log('已设置 Cookie');
    }

    const page = await context.newPage();

    try {
      // 先访问蓝湖页面建立 session
      this.log('访问蓝湖页面...');
      await page.goto('https://lanhuapp.com/web/', { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1000);

      // 直接调用 API
      this.log('调用 API 获取设计图列表...');
      const designs = await page.evaluate(async ({ tid, pid }) => {
        try {
          const response = await fetch(
            `https://lanhuapp.com/api/project/images?project_id=${pid}&team_id=${tid}&dds_status=1&position=1&show_cb_src=1&comment=1`,
            { credentials: 'include' }
          );
          const data = await response.json();
          if (data.data && data.data.images) {
            return data.data.images.map(img => ({
              id: img.id,
              name: img.name,
              width: img.width,
              height: img.height,
              url: img.url,
              updateTime: img.update_time
            }));
          }
        } catch (e) {
          console.error('API error:', e);
        }
        return [];
      }, { tid: teamId, pid: projectId });

      await browser.close();
      this.log('浏览器已关闭');
      this.log('API 返回 ' + designs.length + ' 张设计图', designs.length > 0 ? 'success' : 'warn');
      return designs;
    } catch (e) {
      await browser.close();
      this.log('获取设计图失败: ' + e.message, 'error');
      return [];
    }
  }

  /**
   * 获取 PRD 页面列表
   */
  async _getPagesList(teamId, projectId, docId) {
    // TODO: 实现 PRD 页面列表获取
    return [];
  }

  /**
   * 获取切图列表
   */
  async getSlices(teamId, projectId, imageId) {
    this.log('开始获取切图...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    if (this.cookies.length > 0) {
      await context.addCookies(this.cookies);
      this.log('已设置 Cookie');
    }

    const page = await context.newPage();

    try {
      // 先访问蓝湖页面建立 session
      this.log('访问蓝湖页面...');
      await page.goto('https://lanhuapp.com/web/', { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1000);

      // 直接调用 API 获取切图
      this.log('调用切图 API...');
      const slicesData = await page.evaluate(async ({ tid, pid, imgId }) => {
        try {
          // 获取切图数据
          const response = await fetch(
            `https://lanhuapp.com/api/project/image?image_id=${imgId}&team_id=${tid}&project_id=${pid}`,
            { credentials: 'include' }
          );
          const data = await response.json();

          console.log('=== Full API Response ===');
          console.log('Keys:', Object.keys(data));
          if (data.result) {
            console.log('Result keys:', Object.keys(data.result));
            console.log('Slice Settings:', JSON.stringify(data.result.sliceSettings || data.result.slice_settings || 'not found'));
            console.log('Export Settings:', JSON.stringify(data.result.exportSettings || data.result.export_settings || 'not found'));
          }

          // 尝试获取项目的切图设置
          try {
            const settingsRes = await fetch(
              `https://lanhuapp.com/api/project/slice/settings?project_id=${pid}&team_id=${tid}`,
              { credentials: 'include' }
            );
            const settingsData = await settingsRes.json();
            console.log('Slice Settings API:', JSON.stringify(settingsData).substring(0, 500));
          } catch (e) {
            console.log('No slice settings API');
          }

          // 提取切图
          const slices = [];
          const sliceMap = new Map(); // 用于去重
          let sliceSettings = null;

          // 提取不同倍率的切图
          const extractSliceWithScales = (obj, layerPath = '') => {
            if (!obj || typeof obj !== 'object') return null;

            const currentName = obj.name || '';
            const currentPath = layerPath ? `${layerPath}/${currentName}` : currentName;
            const frame = obj.frame || obj.bounds || {};
            const width = Math.round(frame.width || 0);
            const height = Math.round(frame.height || 0);

            // 收集不同倍率的 URL
            const scales = {};

            // 检查 ddsImage (蓝湖切图字段)
            if (obj.ddsImage) {
              if (obj.ddsImage.imageUrl) scales['1x'] = obj.ddsImage.imageUrl;
              if (obj.ddsImage.imageUrl2x) scales['2x'] = obj.ddsImage.imageUrl2x;
              if (obj.ddsImage.imageUrl3x) scales['3x'] = obj.ddsImage.imageUrl3x;
              if (obj.ddsImage.svgUrl) scales['svg'] = obj.ddsImage.svgUrl;
            }

            // 检查 image 字段
            if (obj.image) {
              if (obj.image.imageUrl && !scales['1x']) scales['1x'] = obj.image.imageUrl;
              if (obj.image.imageUrl2x && !scales['2x']) scales['2x'] = obj.image.imageUrl2x;
              if (obj.image.imageUrl3x && !scales['3x']) scales['3x'] = obj.image.imageUrl3x;
              if (obj.image.svgUrl && !scales['svg']) scales['svg'] = obj.image.svgUrl;
            }

            // 检查 slice 字段
            if (obj.slice) {
              if (obj.slice.imageUrl && !scales['1x']) scales['1x'] = obj.slice.imageUrl;
              if (obj.slice.imageUrl2x && !scales['2x']) scales['2x'] = obj.slice.imageUrl2x;
              if (obj.slice.imageUrl3x && !scales['3x']) scales['3x'] = obj.slice.imageUrl3x;
            }

            // 如果有切图，返回数据
            if (Object.keys(scales).length > 0) {
              return {
                name: currentName,
                layerPath: currentPath,
                width,
                height,
                scales,
                defaultUrl: scales['2x'] || scales['1x'] || Object.values(scales)[0],
                defaultFormat: scales['svg'] ? 'svg' : 'png'
              };
            }

            return null;
          };

          // 递归查找切图
          const findSlices = (obj, layerPath = '') => {
            if (!obj || typeof obj !== 'object') return;

            const slice = extractSliceWithScales(obj, layerPath);
            if (slice && !sliceMap.has(slice.layerPath)) {
              sliceMap.set(slice.layerPath, slice);
              slices.push(slice);
            }

            // 递归
            ['layers', 'children', 'info', 'subLayers'].forEach(key => {
              if (obj[key] && Array.isArray(obj[key])) {
                obj[key].forEach(item => findSlices(item, slice ? slice.layerPath : layerPath));
              }
            });
          };

          // 方式1: 从 versions 中获取 json_url
          if (data.result && data.result.versions && data.result.versions[0]) {
            const version = data.result.versions[0];
            if (version.json_url) {
              try {
                const jsonRes = await fetch(version.json_url);
                const sketchData = await jsonRes.json();

                // 从多个根节点查找
                if (sketchData.artboard) findSlices(sketchData.artboard);
                if (sketchData.info) sketchData.info.forEach(item => findSlices(item));
                if (sketchData.layers) sketchData.layers.forEach(layer => findSlices(layer));
                if (sketchData) findSlices(sketchData);
              } catch (e) {
                console.error('Parse sketch JSON error:', e);
              }
            }
          }

          // 方式2: 直接从 API 响应中查找切图
          if (data.result && data.result.slices) {
            data.result.slices.forEach(slice => {
              const scales = {};
              if (slice.url || slice.imageUrl) scales['1x'] = slice.url || slice.imageUrl;
              if (slice.url2x || slice.imageUrl2x) scales['2x'] = slice.url2x || slice.imageUrl2x;
              if (slice.url3x || slice.imageUrl3x) scales['3x'] = slice.url3x || slice.imageUrl3x;

              if (Object.keys(scales).length > 0) {
                slices.push({
                  name: slice.name || slice.layerName || 'slice',
                  layerPath: slice.layerPath || '',
                  width: slice.width || 0,
                  height: slice.height || 0,
                  scales,
                  defaultUrl: scales['2x'] || scales['1x'],
                  defaultFormat: slice.format || 'png'
                });
              }
            });
          }

          // 方式3: 从 layers 中查找
          if (data.result && data.result.layers) {
            const findInLayers = (layers, path = '') => {
              layers.forEach(layer => {
                const currentPath = path ? `${path}/${layer.name}` : layer.name;
                const slice = extractSliceWithScales(layer, currentPath);
                if (slice && !sliceMap.has(slice.layerPath)) {
                  sliceMap.set(slice.layerPath, slice);
                  slices.push(slice);
                }
                if (layer.layers || layer.children) {
                  findInLayers(layer.layers || layer.children, currentPath);
                }
              });
            };
            findInLayers(data.result.layers);
          }

          // 提取切图设置
          if (data.result) {
            sliceSettings = data.result.sliceSettings || data.result.slice_settings || data.result.exportSettings || null;
          }

          return { slices, total: slices.length, settings: sliceSettings };
        } catch (e) {
          console.error('Get slices error:', e);
          return { slices: [], total: 0, error: e.message };
        }
      }, { tid: teamId, pid: projectId, imgId: imageId });

      await browser.close();
      this.log('找到 ' + slicesData.total + ' 个切图', slicesData.total > 0 ? 'success' : 'warn');

      // 输出切图数据样本用于调试
      if (slicesData.slices.length > 0) {
        console.log('Slice sample:', JSON.stringify(slicesData.slices[0], null, 2));
      }

      return slicesData;
    } catch (e) {
      await browser.close();
      this.log('获取切图失败: ' + e.message, 'error');
      return { slices: [], total: 0, error: e.message };
    }
  }

  /**
   * 从 Sketch JSON 中提取切图
   */
  _extractSlices(sketchData) {
    const slices = [];

    const findSlices = (obj, parentName = '', layerPath = '') => {
      if (!obj || typeof obj !== 'object') return;

      const currentName = obj.name || '';
      const currentPath = layerPath ? `${layerPath}/${currentName}` : currentName;

      // 检查是否有切图
      if (obj.image && (obj.image.imageUrl || obj.image.svgUrl)) {
        const frame = obj.frame || obj.bounds || {};
        slices.push({
          name: currentName,
          layerPath: currentPath,
          width: Math.round(frame.width || 0),
          height: Math.round(frame.height || 0),
          format: obj.image.imageUrl ? 'png' : 'svg',
          url: obj.image.imageUrl || obj.image.svgUrl
        });
      }

      // 旧版结构
      if (obj.ddsImage && obj.ddsImage.imageUrl) {
        const frame = obj.frame || obj.bounds || {};
        slices.push({
          name: currentName,
          layerPath: currentPath,
          width: Math.round(frame.width || 0),
          height: Math.round(frame.height || 0),
          format: 'png',
          url: obj.ddsImage.imageUrl
        });
      }

      // 递归查找
      ['layers', 'children', 'info'].forEach(key => {
        if (obj[key]) {
          if (Array.isArray(obj[key])) {
            obj[key].forEach(item => findSlices(item, currentName, currentPath));
          } else if (typeof obj[key] === 'object') {
            findSlices(obj[key], currentName, currentPath);
          }
        }
      });
    };

    // 从多个可能的根节点开始
    if (sketchData.artboard) findSlices(sketchData.artboard);
    if (sketchData.info) sketchData.info.forEach(item => findSlices(item));
    if (sketchData.layers) sketchData.layers.forEach(layer => findSlices(layer));

    return {
      total: slices.length,
      slices
    };
  }

  /**
   * 获取设计图的图层数据
   */
  async getLayers(teamId, projectId, imageId) {
    this.log('开始获取图层数据...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    if (this.cookies.length > 0) {
      await context.addCookies(this.cookies);
      this.log('已设置 Cookie');
    }

    const page = await context.newPage();

    try {
      // 先访问蓝湖页面建立 session
      this.log('访问蓝湖页面...');
      await page.goto('https://lanhuapp.com/web/', { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1000);

      // 获取设计图详情和 JSON 数据
      this.log('调用 API 获取图层数据...');
      const layersData = await page.evaluate(async ({ tid, pid, imgId }) => {
        try {
          // 1. 获取设计图详情
          const response = await fetch(
            `https://lanhuapp.com/api/project/image?image_id=${imgId}&team_id=${tid}&project_id=${pid}&dds_status=1`,
            { credentials: 'include' }
          );
          const data = await response.json();

          if (data.code !== '00000' && data.code !== 200) {
            return { error: data.msg || '获取设计图失败' };
          }

          const result = data.result;
          if (!result || !result.versions || !result.versions[0]) {
            return { error: '无法获取设计图版本信息' };
          }

          const version = result.versions[0];
          const jsonUrl = version.json_url;

          if (!jsonUrl) {
            return { error: '无法获取设计图 JSON URL' };
          }

          // 2. 下载 JSON 数据
          const jsonRes = await fetch(jsonUrl);
          const designData = await jsonRes.json();

          // 3. 递归提取图层信息
          const layers = [];

          const extractTextValue = (value, depth = 0) => {
            if (value == null || depth > 5) return null;
            const valueType = typeof value;
            if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
              return String(value);
            }
            if (Array.isArray(value)) {
              const joined = value
                .map(item => extractTextValue(item, depth + 1))
                .filter(Boolean)
                .join('');
              return joined || null;
            }
            if (valueType === 'object') {
              const directKeys = ['value', 'content', 'text', 'string'];
              for (const key of directKeys) {
                if (value[key] != null) {
                  const extracted = extractTextValue(value[key], depth + 1);
                  if (extracted) return extracted;
                }
              }
              if (value.style) {
                const extracted = extractTextValue(value.style, depth + 1);
                if (extracted) return extracted;
              }
              if (value.styles) {
                const extracted = extractTextValue(value.styles, depth + 1);
                if (extracted) return extracted;
              }
              if (value.runs) {
                const extracted = extractTextValue(value.runs, depth + 1);
                if (extracted) return extracted;
              }
            }
            return null;
          };

          const pickFirstObject = (...sources) => {
            for (const source of sources) {
              if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
              if (Object.keys(source).length > 0) return source;
            }
            return {};
          };

          const parseNumeric = (value) => {
            if (value == null) return null;
            if (typeof value === 'number') return Number.isFinite(value) ? value : null;
            if (typeof value === 'string') {
              const parsed = Number(value);
              return Number.isFinite(parsed) ? parsed : null;
            }
            if (typeof value === 'object' && value.value != null) {
              return parseNumeric(value.value);
            }
            return null;
          };

          const parseColor = (color) => {
            if (!color) return null;
            if (typeof color === 'string') {
              const value = color.trim();
              if (/^rgba?\(/i.test(value) || /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) {
                return value;
              }
              return null;
            }

            if (typeof color !== 'object') return null;
            if (typeof color.value === 'string') {
              return parseColor(color.value);
            }

            const r = parseNumeric(color.r);
            const g = parseNumeric(color.g);
            const b = parseNumeric(color.b);
            const alphaRaw = parseNumeric(color.a ?? color.alpha);
            if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
              return null;
            }

            const normalizeChannel = (channel) => {
              if (channel <= 1) return Math.round(channel * 255);
              return Math.max(0, Math.min(255, Math.round(channel)));
            };
            const alpha = Number.isFinite(alphaRaw)
              ? (alphaRaw > 1 ? Math.max(0, Math.min(1, alphaRaw / 100)) : Math.max(0, Math.min(1, alphaRaw)))
              : 1;
            return `rgba(${normalizeChannel(r)},${normalizeChannel(g)},${normalizeChannel(b)},${alpha})`;
          };

          const parseLineHeight = (lineHeight, fontSize = null) => {
            if (lineHeight == null) return null;
            if (typeof lineHeight === 'number' || typeof lineHeight === 'string') {
              return parseNumeric(lineHeight);
            }
            if (typeof lineHeight === 'object') {
              const unit = String(lineHeight.unit || '').toUpperCase();
              if (unit === 'AUTO') return null;
              const value = parseNumeric(lineHeight.value);
              if (!Number.isFinite(value)) return null;
              if (unit === 'PERCENT' || unit === 'PERCENTAGE') {
                if (Number.isFinite(fontSize)) {
                  return (fontSize * value) / 100;
                }
                return value / 100;
              }
              return value;
            }
            return null;
          };

          const parseLetterSpacing = (letterSpacing, fontSize = null) => {
            if (letterSpacing == null) return null;
            if (typeof letterSpacing === 'number' || typeof letterSpacing === 'string') {
              return parseNumeric(letterSpacing);
            }
            if (typeof letterSpacing === 'object') {
              const value = parseNumeric(letterSpacing.value);
              if (!Number.isFinite(value)) return null;
              const unit = String(letterSpacing.unit || '').toUpperCase();
              if (unit === 'PERCENT' || unit === 'PERCENTAGE') {
                if (Number.isFinite(fontSize)) {
                  return (fontSize * value) / 100;
                }
                return value / 100;
              }
              return value;
            }
            return null;
          };

          const normalizeTextAlign = (alignValue) => {
            if (alignValue == null) return null;
            if (typeof alignValue === 'number') {
              const alignMap = { 0: 'left', 1: 'right', 2: 'center', 3: 'justify' };
              return alignMap[alignValue] || null;
            }
            const value = String(alignValue).trim().toLowerCase();
            const map = {
              left: 'left',
              right: 'right',
              center: 'center',
              centred: 'center',
              justify: 'justify',
              justified: 'justify'
            };
            return map[value] || null;
          };

          const normalizeFontWeight = (weightValue) => {
            if (weightValue == null) return null;
            const numeric = parseNumeric(weightValue);
            if (Number.isFinite(numeric)) {
              const rounded = Math.round(numeric);
              if (rounded >= 100 && rounded <= 900) return rounded;
            }

            const value = String(weightValue).trim().toLowerCase().replace(/\s+/g, '');
            const map = {
              thin: 100,
              extralight: 200,
              ultralight: 200,
              light: 300,
              regular: 400,
              normal: 400,
              medium: 500,
              semibold: 600,
              demibold: 600,
              bold: 700,
              extrabold: 800,
              ultrabold: 800,
              black: 900
            };
            return map[value] || null;
          };

          const collectLayers = (node, depth = 0, parentPath = '') => {
            if (!node || typeof node !== 'object') return;

            const name = node.name || 'unnamed';
            const currentPath = parentPath ? `${parentPath}/${name}` : name;

            // 获取位置信息
            const frame = node.frame || node.bounds || {};
            const x = frame.x !== undefined ? frame.x : (frame.left || 0);
            const y = frame.y !== undefined ? frame.y : (frame.top || 0);
            const width = frame.width || 0;
            const height = frame.height || 0;

            // 获取类型
            const type = node.type || node.layerType || 'unknown';

            // 获取可见性
            const visible = node.visible !== false;

            // 样式摘要
            const styles = {};
            if (node.fills && node.fills.length > 0) {
              const fill = node.fills[0];
              if (fill.color) {
                const c = fill.color;
                styles.background = `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${c.a || 1})`;
              }
            }
            if (node.borders && node.borders.length > 0) {
              const border = node.borders[0];
              styles.borderWidth = border.thickness || border.width || 1;
              if (border.color) {
                const c = border.color;
                styles.borderColor = `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${c.a || 1})`;
              }
            }
            if (node.radius || node.cornerRadius) {
              styles.borderRadius = node.radius || node.cornerRadius;
            }

            // 文本内容
            const text = extractTextValue(node.text) ||
                         extractTextValue(node.attributedString?.string) ||
                         extractTextValue(node.attributedString?.value) ||
                         null;

            // 文本样式
            const textNode = (node.text && typeof node.text === 'object') ? node.text : {};
            const textNodeStyle = textNode.style || {};
            const textRuns = Array.isArray(textNode.styles) ? textNode.styles : [];
            const firstRun = textRuns.find(item => item && typeof item === 'object') || {};
            if (node.textStyle || (node.attributedString && node.attributedString.font) || Object.keys(textNodeStyle).length > 0 || Object.keys(firstRun).length > 0) {
              const textStyle = node.textStyle || {};
              const attrStr = node.attributedString || {};
              const attrStyle = attrStr.style || {};
              const attrStyleFont = attrStyle.font || {};
              const runFont = firstRun.font || {};
              const font = pickFirstObject(
                textNodeStyle.font,
                runFont,
                textStyle.font,
                attrStr.font,
                attrStyleFont
              );

              const fontSize = parseNumeric(font.size);
              if (Number.isFinite(fontSize) && fontSize > 0) {
                styles.fontSize = fontSize;
              }

              const fontFamily = font.family || font.name || attrStyleFont.family || attrStyleFont.name;
              if (fontFamily) {
                styles.fontFamily = fontFamily;
              }

              const fontWeight = normalizeFontWeight(font.weight ?? font.fontWeight ?? font.type);
              if (Number.isFinite(fontWeight)) {
                styles.fontWeight = fontWeight;
              }

              const lineHeight = [
                parseLineHeight(font.lineHeight, fontSize),
                parseLineHeight(textStyle.lineHeight, fontSize),
                parseLineHeight(attrStyleFont.lineHeight, fontSize),
                parseLineHeight(runFont.lineHeight, fontSize),
                parseLineHeight(textNodeStyle.lineHeight, fontSize)
              ].find(value => Number.isFinite(value) && value > 0);
              if (Number.isFinite(lineHeight) && lineHeight > 0) {
                styles.lineHeight = lineHeight;
              }

              const letterSpacing = [
                parseLetterSpacing(font.letterSpacing, fontSize),
                parseLetterSpacing(textStyle.letterSpacing, fontSize),
                parseLetterSpacing(attrStr.letterSpacing, fontSize),
                parseLetterSpacing(runFont.letterSpacing, fontSize),
                parseLetterSpacing(font.characterSpacing, fontSize),
                parseLetterSpacing(runFont.characterSpacing, fontSize)
              ].find(value => Number.isFinite(value));
              if (Number.isFinite(letterSpacing)) {
                styles.letterSpacing = letterSpacing;
              }

              const textAlign = normalizeTextAlign(
                textStyle.alignment ??
                textNodeStyle.alignment ??
                font.align ??
                runFont.align
              );
              if (textAlign) {
                styles.textAlign = textAlign;
              }

              const color = parseColor(
                textNodeStyle.color ||
                firstRun.color ||
                textStyle.color ||
                attrStr.color ||
                attrStyle.color ||
                font.color ||
                runFont.color
              );
              if (color) {
                styles.color = color;
              }
            }

            // 文本层优先把 fill 当作文字颜色，而不是背景色
            if (text && !styles.color && styles.background) {
              styles.color = styles.background;
              delete styles.background;
            }

            const normalizedText = text == null ? null : String(text);
            const textPreview = normalizedText
              ? (normalizedText.length > 80 ? normalizedText.substring(0, 80) + '...' : normalizedText)
              : null;

            const layerInfo = {
              name,
              path: currentPath,
              depth,
              type,
              visible,
              x: Math.round(x),
              y: Math.round(y),
              width: Math.round(width),
              height: Math.round(height),
              styles: Object.keys(styles).length > 0 ? styles : null,
              text: normalizedText,
              textPreview
            };

            layers.push(layerInfo);

            // 递归处理子图层
            const children = node.layers || node.children || node.subLayers || [];
            if (Array.isArray(children)) {
              children.forEach(child => collectLayers(child, depth + 1, currentPath));
            }
          };

          // 从多个可能的根节点开始
          if (designData.artboard) {
            collectLayers(designData.artboard);
          } else if (designData.layers) {
            designData.layers.forEach(layer => collectLayers(layer));
          } else if (designData.info) {
            designData.info.forEach(item => collectLayers(item));
          } else {
            collectLayers(designData);
          }

          return {
            success: true,
            canvas: {
              name: result.name || 'Untitled',
              width: result.width || 0,
              height: result.height || 0
            },
            layers,
            total: layers.length
          };
        } catch (e) {
          console.error('Get layers error:', e);
          return { error: e.message };
        }
      }, { tid: teamId, pid: projectId, imgId: imageId });

      await browser.close();

      if (layersData.error) {
        this.log('获取图层数据失败: ' + layersData.error, 'error');
        return { success: false, error: layersData.error };
      }

      this.log('找到 ' + layersData.total + ' 个图层', 'success');
      return layersData;
    } catch (e) {
      await browser.close();
      this.log('获取图层数据失败: ' + e.message, 'error');
      return { success: false, error: e.message };
    }
  }

  normalizeGeneratedFramework(framework) {
    const normalized = String(framework || 'html').trim();
    const lowerCased = normalized.toLowerCase();
    return {
      value: lowerCased,
      label: DDS_FRAMEWORK_LABELS[normalized] || DDS_FRAMEWORK_LABELS[lowerCased] || DDS_FRAMEWORK_LABELS.html
    };
  }

  async fetchDesignVersionInfo(requestContext, teamId, projectId, imageId) {
    const requestUrl = new URL('https://lanhuapp.com/api/project/image');
    requestUrl.searchParams.set('dds_status', '1');
    requestUrl.searchParams.set('image_id', String(imageId));
    requestUrl.searchParams.set('team_id', String(teamId));
    requestUrl.searchParams.set('project_id', String(projectId));

    const response = await requestContext.get(requestUrl.toString(), {
      headers: this.buildRequestHeaders({
        Accept: 'application/json, text/plain, */*',
        Referer: 'https://lanhuapp.com/web/'
      })
    });

    if (!response.ok()) {
      throw new Error(`获取设计图版本失败: HTTP ${response.status()}`);
    }

    const data = await response.json();
    if (data?.code !== '00000' || !data?.result) {
      throw new Error(data?.msg || '获取设计图版本失败');
    }

    const result = data.result;
    const versionId = result.latest_version || result.versions?.[0]?.id;
    if (!versionId) {
      throw new Error('未找到最新版本 ID');
    }

    return {
      versionId: String(versionId),
      designName: result.name || 'Untitled',
      previewUrl: result.url || '',
      ddsJumpStatus: Number(result.dds_jump_status) || 0,
      projectId: String(projectId),
      teamId: String(teamId),
      imageId: String(imageId)
    };
  }

  async checkDdsCodeAvailability(versionId) {
    const response = await fetch(
      `https://dds.lanhuapp.com/api/dds/image/store_schema_revise?version_id=${encodeURIComponent(versionId)}`,
      {
        headers: this.buildRequestHeaders({
          Accept: 'application/json, text/plain, */*',
          Referer: 'https://dds.lanhuapp.com/'
        })
      }
    );

    if (!response.ok) {
      throw new Error(`校验 DDS 代码数据失败: HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      success: data?.code === '00000',
      code: String(data?.code || ''),
      message: data?.msg || '',
      data: data?.data || null
    };
  }

  async selectCascaderOption(page, dropdownIndex, optionLabel, timeout = 5000) {
    const input = page.locator('.codetype .el-input__inner').nth(dropdownIndex);
    if (await input.count() === 0) {
      throw new Error(`未找到第 ${dropdownIndex + 1} 个代码下拉框`);
    }

    if ((await input.inputValue()).trim() === optionLabel) {
      return;
    }

    const waitForVisiblePanel = async (maxTimeout) => {
      await page.waitForFunction(
        () => Array.from(document.querySelectorAll('.el-cascader-panel')).some((panel) => {
          if (!(panel instanceof HTMLElement)) {
            return false;
          }
          const style = window.getComputedStyle(panel);
          const rect = panel.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        }),
        undefined,
        { timeout: maxTimeout }
      );
    };

    const deadline = Date.now() + timeout;
    const clickTargets = [
      page.locator('.codetype .el-cascader').nth(dropdownIndex),
      page.locator('.codetype .el-input').nth(dropdownIndex),
      input,
      page.locator('.codetype .el-input__suffix').nth(dropdownIndex)
    ];

    let panelVisible = false;
    for (const target of clickTargets) {
      const remainingTime = deadline - Date.now();
      if (remainingTime <= 0) break;
      if (await target.count() === 0) continue;

      try {
        await target.click({ force: true, timeout: Math.min(1500, remainingTime) });
      } catch (error) {}

      try {
        await waitForVisiblePanel(Math.min(1500, deadline - Date.now()));
        panelVisible = true;
        break;
      } catch (error) {}
    }

    if (!panelVisible) {
      try {
        await input.focus();
        await input.press('ArrowDown', { timeout: Math.min(1000, Math.max(500, deadline - Date.now())) });
        await waitForVisiblePanel(Math.max(1000, deadline - Date.now()));
        panelVisible = true;
      } catch (error) {}
    }

    if (!panelVisible) {
      throw new Error(`展开代码下拉框失败: 第 ${dropdownIndex + 1} 个下拉框未弹出选项面板`);
    }

    const optionPattern = new RegExp(`^\\s*${escapeRegExp(optionLabel)}\\s*$`);
    const option = page
      .locator('.el-cascader-panel:visible .el-cascader-node__label:visible')
      .filter({ hasText: optionPattern })
      .first();
    await option.waitFor({ state: 'visible', timeout });
    try {
      await option.click({ force: true, timeout });
    } catch (error) {
      await option.evaluate((node) => node.click());
    }
    await page.waitForFunction(
      ({ index, value }) => {
        const inputs = document.querySelectorAll('.codetype .el-input__inner');
        return Boolean(inputs[index] && inputs[index].value === value);
      },
      { index: dropdownIndex, value: optionLabel },
      { timeout }
    );
  }

  getPrimaryErrorLine(message) {
    return String(message || '')
      .split(/\r?\n/)
      .map((line) => String(line || '').trim())
      .find(Boolean) || '';
  }

  formatDdsRuntimeMessage(message) {
    const primaryLine = this.getPrimaryErrorLine(message);
    if (!primaryLine) {
      return '蓝湖内部运行异常';
    }

    return primaryLine
      .replace(/^Uncaught\s*\(in promise\)\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  buildDdsFrameworkFailureMessage(targetFramework, runtimeMessage) {
    const conciseMessage = this.formatDdsRuntimeMessage(runtimeMessage);
    return `DDS 当前无法生成 ${targetFramework.label} 代码：${conciseMessage}`;
  }

  createDdsRuntimeTracker(page) {
    const tracker = {
      entries: [],
      seen: new Set()
    };

    const pushEntry = (source, message, type = 'error') => {
      const normalizedMessage = String(message || '').trim();
      if (!normalizedMessage) {
        return;
      }

      const key = `${source}:${type}:${normalizedMessage}`;
      if (tracker.seen.has(key)) {
        return;
      }

      tracker.seen.add(key);
      tracker.entries.push({
        source,
        type,
        message: normalizedMessage,
        timestamp: Date.now()
      });

      const logType = type === 'warning' ? 'warn' : 'error';
      this.log(`DDS${source}异常: ${normalizedMessage}`, logType);
    };

    page.on('console', (msg) => {
      const type = msg.type();
      if (!['error', 'warning'].includes(type)) {
        return;
      }
      pushEntry('控制台', msg.text(), type);
    });

    page.on('pageerror', (error) => {
      pushEntry('页面', error?.message || String(error || ''), 'error');
    });

    return tracker;
  }

  getLatestDdsFatalRuntimeMessage(runtimeTracker) {
    const entries = Array.isArray(runtimeTracker?.entries) ? runtimeTracker.entries : [];
    const matchedEntry = [...entries]
      .reverse()
      .find((entry) => DDS_FATAL_RUNTIME_PATTERNS.some((pattern) => pattern.test(entry.message || '')));

    return matchedEntry?.message || '';
  }

  async readGeneratedInputValues(page) {
    return page.locator('.codetype .el-input__inner').evaluateAll((nodes) => (
      nodes.map((node) => String(node.value || '').trim()).filter(Boolean)
    ));
  }

  async confirmGeneratedFrameworkExtraSelection(page, targetFramework, timeout = 15000) {
    if (targetFramework.label === 'HTML') {
      return;
    }

    const values = await this.readGeneratedInputValues(page);
    if (values.length < 3) {
      return;
    }

    const extraOption = String(values[1] || '').trim();
    if (!extraOption || /\.(css|less|scss|sass|wxss|acss)$/i.test(extraOption)) {
      return;
    }

    this.log(`检测到 ${targetFramework.label} 附加选项: ${extraOption}`);
    await this.selectCascaderOption(page, 1, extraOption, timeout);
    this.log(`已确认附加选项: ${extraOption}`, 'success');
  }

  async waitForNonHtmlFrameworkReady(page, targetFramework, runtimeTracker, timeout = 45000) {
    const deadline = Date.now() + timeout;
    let sawTargetFramework = false;
    let lastValues = [];

    while (Date.now() < deadline) {
      const fatalRuntimeMessage = this.getLatestDdsFatalRuntimeMessage(runtimeTracker);
      if (fatalRuntimeMessage) {
        throw new Error(this.buildDdsFrameworkFailureMessage(targetFramework, fatalRuntimeMessage));
      }

      const values = await this.readGeneratedInputValues(page);
      lastValues = values;
      const currentFramework = String(values[0] || '').trim();
      if (currentFramework === targetFramework.label) {
        sawTargetFramework = true;
      } else if (sawTargetFramework && currentFramework) {
        const stateText = values.join(' / ');
        throw new Error(`DDS 未能稳定切换到 ${targetFramework.label}，当前已回退为 ${stateText}`);
      }

      const editors = await this.readGeneratedEditors(page);
      const primaryCode = String(editors[0] || '').replace(/\u200b/g, '').trim();
      if (
        currentFramework === targetFramework.label &&
        primaryCode.length >= 60 &&
        !/<!DOCTYPE html|<html|<body/i.test(primaryCode)
      ) {
        return;
      }

      await page.waitForTimeout(250);
    }

    const fatalRuntimeMessage = this.getLatestDdsFatalRuntimeMessage(runtimeTracker);
    if (fatalRuntimeMessage) {
      throw new Error(this.buildDdsFrameworkFailureMessage(targetFramework, fatalRuntimeMessage));
    }

    const stateText = lastValues.length ? `，当前下拉状态：${lastValues.join(' / ')}` : '';
    throw new Error(`等待 ${targetFramework.label} 代码生成超时${stateText}`);
  }

  async waitForGeneratedEditorContent(page, {
    minEditors = 1,
    editorIndex = null,
    minLength = 60,
    expectedPatterns = [],
    forbiddenPatterns = [],
    timeout = 60000
  } = {}) {
    await page.waitForFunction(
      ({
        minEditors: minEditorCount,
        editorIndex: targetIndex,
        minLength: minCodeLength,
        expectedPatterns: patterns,
        forbiddenPatterns: blockedPatterns
      }) => {
        const hasText = (value) => typeof value === 'string' && value.replace(/\u200b/g, '').trim().length > 0;
        const hasMeaningfulCode = (value) => {
          if (!hasText(value)) {
            return false;
          }

          const normalizedValue = value.replace(/\u200b/g, '').trim();
          if (normalizedValue.length < minCodeLength) {
            return false;
          }

          const containsPattern = (pattern) => {
            try {
              return new RegExp(pattern, 'i').test(normalizedValue);
            } catch (error) {
              return normalizedValue.includes(pattern);
            }
          };

          const matchesExpectedPatterns = !Array.isArray(patterns) || patterns.length === 0
            ? true
            : patterns.some((pattern) => containsPattern(pattern));
          if (!matchesExpectedPatterns) {
            return false;
          }

          const matchesBlockedPatterns = Array.isArray(blockedPatterns) && blockedPatterns.length > 0
            ? blockedPatterns.some((pattern) => containsPattern(pattern))
            : false;

          return !matchesBlockedPatterns;
        };

        const readEditor = (element) => {
          if (!element) {
            return '';
          }

          const linesText = Array.from(element.querySelectorAll('.CodeMirror-code pre'))
            .map((node) => node.textContent || '')
            .join('\n');

          const candidates = [
            element.CodeMirror?.getValue?.(),
            element.CodeMirror?.doc?.getValue?.(),
            linesText,
            element.querySelector('.CodeMirror-code')?.textContent,
            element.textContent
          ];

          return candidates.find(hasText) || '';
        };

        const inputs = document.querySelectorAll('.codetype .el-input__inner');
        const editors = Array.from(document.querySelectorAll('.CodeMirror'));

        if (!inputs.length || editors.length < minEditorCount) {
          return false;
        }

        if (typeof targetIndex === 'number') {
          return hasMeaningfulCode(readEditor(editors[targetIndex]));
        }

        return editors.some((element) => hasMeaningfulCode(readEditor(element)));
      },
      { minEditors, editorIndex, minLength, expectedPatterns, forbiddenPatterns },
      { timeout }
    );
  }

  async readGeneratedEditors(page) {
    return page.evaluate(() => {
      const hasText = (value) => typeof value === 'string' && value.replace(/\u200b/g, '').trim().length > 0;
      const normalize = (value) => (typeof value === 'string' ? value.replace(/\u200b/g, '').replace(/\r\n/g, '\n') : '');
      const readEditor = (element) => {
        if (!element) {
          return '';
        }

        const linesText = Array.from(element.querySelectorAll('.CodeMirror-code pre'))
          .map((node) => node.textContent || '')
          .join('\n');

        const candidates = [
          element.CodeMirror?.getValue?.(),
          element.CodeMirror?.doc?.getValue?.(),
          linesText,
          element.querySelector('.CodeMirror-code')?.textContent,
          element.textContent
        ];

        for (const candidate of candidates) {
          if (hasText(candidate)) {
            return normalize(candidate);
          }
        }

        return '';
      };

      return Array.from(document.querySelectorAll('.CodeMirror')).map(readEditor);
    });
  }

  async getGeneratedCode(teamId, projectId, imageId, framework = 'html') {
    this.clearLogs();
    const targetFramework = this.normalizeGeneratedFramework(framework);
    this.updateGeneratedStep('prepare', '正在初始化蓝湖代码生成环境');
    this.log(`开始获取蓝湖生成代码 (${targetFramework.label})...`);
    this.log('正在启动无头浏览器并注入登录态...');

    const { browser, context } = await this.createAuthenticatedContext();

    try {
      this.updateGeneratedStep('fetch-version', '正在读取设计图最新版本');
      const designMeta = await this.fetchDesignVersionInfo(context.request, teamId, projectId, imageId);
      this.log(`设计图版本: ${designMeta.versionId}`, 'success');
      this.log('正在校验 DDS 代码数据...');
      const ddsAvailability = await this.checkDdsCodeAvailability(designMeta.versionId);
      if (!ddsAvailability.success) {
        const ddsStatusText = designMeta.ddsJumpStatus ? `，dds_jump_status=${designMeta.ddsJumpStatus}` : '';
        throw new Error(`当前设计图暂无蓝湖代码数据（${ddsAvailability.message || ddsAvailability.code || 'DDS 数据不可用'}${ddsStatusText}）`);
      }
      this.log('DDS 代码数据校验通过', 'success');

      const ddsUrl = `https://dds.lanhuapp.com/#/?version_id=${encodeURIComponent(designMeta.versionId)}&source=detailDetachTab`;
      const page = await context.newPage();
      const runtimeTracker = this.createDdsRuntimeTracker(page);

      this.updateGeneratedStep('open-dds', '正在打开 DDS 代码页并等待编辑器加载');
      this.log('打开 DDS 代码页...');
      await page.goto(ddsUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.locator('.codetype .el-input__inner').first().waitFor({ state: 'visible', timeout: 60000 });
      this.log('DDS 页面已打开，正在等待代码编辑器初始化...');
      await this.waitForGeneratedEditorContent(page, { minEditors: 1, minLength: 60, timeout: 60000 });

      this.updateGeneratedStep('switch-framework', `正在切换代码框架到 ${targetFramework.label}`);
      await this.selectCascaderOption(page, 0, targetFramework.label);
      await this.confirmGeneratedFrameworkExtraSelection(page, targetFramework);
      this.log(`已切换代码框架: ${targetFramework.label}`, 'success');
      if (targetFramework.label === 'HTML') {
        await this.waitForGeneratedEditorContent(page, {
          minEditors: 1,
          editorIndex: 0,
          minLength: 200,
          expectedPatterns: ['<!DOCTYPE html', '<html', '<body'],
          timeout: 45000
        });
      } else {
        await this.waitForNonHtmlFrameworkReady(page, targetFramework, runtimeTracker, 45000);
      }

      if (targetFramework.label === 'HTML') {
        await page.waitForFunction(
          (dropdownIndex) => {
            const input = document.querySelectorAll('.codetype .el-input__inner')[dropdownIndex];
            return Boolean(input && /\.css$/i.test((input.value || '').trim()));
          },
          1,
          { timeout: 45000 }
        );
      }

      this.updateGeneratedStep('read-files', '正在读取蓝湖生成代码文件');
      const currentValues = await page.locator('.codetype .el-input__inner').evaluateAll((nodes) => (
        nodes.map((node) => node.value).filter(Boolean)
      ));
      const editors = (await this.readGeneratedEditors(page)).filter((value) => typeof value === 'string');

      if (!editors.length || !editors[0]) {
        throw new Error('未读取到生成代码内容');
      }

      const files = [{
        name: DDS_PRIMARY_FILE_NAMES[targetFramework.label] || 'index.txt',
        content: editors[0],
        language: targetFramework.label === 'HTML' ? 'html' : targetFramework.value,
        isPrimary: true
      }];

      if (targetFramework.label === 'HTML') {
        const cssInput = page.locator('.codetype .el-input__inner').nth(1);
        if (await cssInput.count()) {
          const queuedCssNames = [];
          const queuedCssNameSet = new Set();
          const pushCssName = (name) => {
            const normalizedName = String(name || '').trim();
            if (!/\.css$/i.test(normalizedName) || queuedCssNameSet.has(normalizedName)) {
              return;
            }
            queuedCssNameSet.add(normalizedName);
            queuedCssNames.push(normalizedName);
          };

          currentValues.forEach(pushCssName);
          Array.from(files[0].content.matchAll(/<link\b[^>]*href=["']\.\/([^"']+\.css)["'][^>]*>/gi))
            .forEach((match) => pushCssName(match[1]));

          await cssInput.click();
          await page.locator('.el-cascader-panel:visible').first().waitFor({ state: 'visible', timeout: 5000 });
          const cssOptions = await page.locator('.el-cascader-panel:visible .el-cascader-node__label:visible').evaluateAll((nodes) => (
            Array.from(new Set(
              nodes
                .map((node) => (node.textContent || '').trim())
                .filter((text) => /\.css$/i.test(text))
            ))
          ));
          await page.keyboard.press('Escape').catch(() => {});

          cssOptions.forEach(pushCssName);
          this.log(`检测到 ${queuedCssNames.length} 个 CSS 文件候选`);

          const currentCssName = currentValues.find((value) => /\.css$/i.test(String(value || '').trim())) || '';
          if (currentCssName && editors[1]) {
            files.push({
              name: currentCssName,
              content: editors[1],
              language: 'css',
              isPrimary: false
            });
          }

          for (const cssName of queuedCssNames) {
            if (cssName === currentCssName) {
              continue;
            }

            this.log(`正在读取样式文件: ${cssName}`);
            await this.selectCascaderOption(page, 1, cssName, 15000);
            await this.waitForGeneratedEditorContent(page, { minEditors: 2, editorIndex: 1, minLength: 40, timeout: 45000 });
            const cssEditors = await this.readGeneratedEditors(page);
            const cssContent = cssEditors[1] || '';
            if (cssContent) {
              files.push({
                name: cssName,
                content: cssContent,
                language: 'css',
                isPrimary: false
              });
            }
          }
        }
      } else if (editors[1]) {
        const extraFileName = currentValues[currentValues.length - 1] || 'style.css';
        files.push({
          name: extraFileName,
          content: editors[1],
          language: /\.wxss$/i.test(extraFileName) ? 'css' : 'css',
          isPrimary: false
        });
      }

      this.log(`成功读取 ${files.length} 个代码文件`, 'success');
      this.updateGeneratedStep(
        'build-preview',
        targetFramework.label === 'HTML' ? '正在组装 HTML 预览结果' : '正在整理代码生成结果'
      );
      if (targetFramework.label === 'HTML') {
        this.log('正在组装 HTML 预览结果...');
      }

      return {
        success: true,
        framework: {
          value: targetFramework.value,
          label: targetFramework.label
        },
        design: {
          id: designMeta.imageId,
          name: designMeta.designName,
          previewUrl: designMeta.previewUrl
        },
        versionId: designMeta.versionId,
        ddsUrl,
        files,
        previewHtml: targetFramework.label === 'HTML'
          ? this.buildPreviewHtml(files[0].content, files.slice(1))
          : ''
      };
    } finally {
      await browser.close();
    }
  }

  /**
   * 下载图片
   */
  async downloadImage(url) {
    if (!url || typeof url !== 'string') {
      throw new Error('图片地址无效');
    }

    const normalizedUrl = url.trim();

    const detectImageContentType = (buffer, rawContentType) => {
      const contentType = (rawContentType || '').split(';')[0].trim().toLowerCase();
      if (contentType && contentType !== 'application/octet-stream') {
        return contentType;
      }

      if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
        return 'image/png';
      }

      if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
        return 'image/png';
      }
      if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'image/jpeg';
      }
      if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
        return 'image/gif';
      }
      if (
        buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
        buffer.slice(8, 12).toString('ascii') === 'WEBP'
      ) {
        return 'image/webp';
      }

      const headText = buffer.slice(0, 256).toString('utf8').trim().toLowerCase();
      if (headText.startsWith('<svg') || headText.includes('<svg')) {
        return 'image/svg+xml';
      }

      return 'image/png';
    };

    const validCookies = this.cookies.filter((cookie) => {
      if (!cookie || !cookie.name || typeof cookie.value === 'undefined') {
        return false;
      }
      if (cookie.expires === -1 || typeof cookie.expires !== 'number') {
        return true;
      }
      return cookie.expires > (Date.now() / 1000);
    });

    const cookieHeader = validCookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Referer': 'https://lanhuapp.com/'
    };

    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    const maxAttempts = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      try {
        const response = await fetch(normalizedUrl, {
          method: 'GET',
          headers,
          redirect: 'follow',
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (buffer.length === 0) {
          throw new Error('响应内容为空');
        }

        const contentType = detectImageContentType(buffer, response.headers.get('content-type'));
        return { buffer, contentType };
      } catch (e) {
        lastError = e;
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, attempt * 200));
        }
      } finally {
        clearTimeout(timer);
      }
    }

    // 降级方案：通过 Playwright 的 request API 拉取，避免 page.goto 触发下载模式报错
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    if (this.cookies.length > 0) {
      await context.addCookies(this.cookies);
    }

    try {
      const response = await context.request.get(normalizedUrl, {
        headers: {
          'Accept': headers.Accept,
          'Referer': headers.Referer
        }
      });

      if (!response.ok()) {
        throw new Error(`HTTP ${response.status()} ${response.statusText()}`.trim());
      }

      const buffer = Buffer.from(await response.body());
      if (buffer.length === 0) {
        throw new Error('响应内容为空');
      }

      const contentType = detectImageContentType(buffer, response.headers()['content-type']);
      return { buffer, contentType };
    } catch (e) {
      const reason = lastError ? `${lastError.message}; fallback: ${e.message}` : e.message;
      throw new Error('下载图片失败: ' + reason);
    } finally {
      await browser.close();
    }
  }

  buildPreviewHtml(htmlCode, extraFiles = []) {
    const fileMap = new Map(
      extraFiles
        .filter((file) => file && file.name && typeof file.content === 'string')
        .map((file) => [file.name, file.content])
    );

    const assetBaseUrl = 'https://dds.lanhuapp.com/';
    const ignoredProtocolRegex = /^(?:data:|https?:|\/\/|#|mailto:|tel:|javascript:)/i;

    const normalizeAssetUrl = (rawUrl, baseHref = assetBaseUrl) => {
      const value = String(rawUrl || '').trim();
      if (!value || ignoredProtocolRegex.test(value)) {
        return value;
      }
      try {
        return new URL(value, baseHref).toString();
      } catch (error) {
        return value;
      }
    };

    const rewriteCssUrls = (content, filePath) => {
      const directory = filePath ? filePath.slice(0, filePath.lastIndexOf('/') + 1) : '';
      const cssBase = new URL(directory || '.', assetBaseUrl).toString();
      return String(content).replace(/url\(\s*(['"]?)([^'"\)]+)\1\s*\)/gi, (_, quote, ref) => {
        const normalized = normalizeAssetUrl(ref, cssBase);
        const preservedQuote = quote || '';
        return `url(${preservedQuote}${normalized}${preservedQuote})`;
      });
    };

    const inlineStyleFromLink = (html = '') => {
      const cssLinkRegex = /<link\b(?=[^>]*\brel\s*=\s*["']?stylesheet\b)[^>]*href=["']\.\/([^"']+)["'][^>]*>/gi;
      return html.replace(cssLinkRegex, (_, fileName) => {
        const content = fileMap.get(fileName);
        if (typeof content !== 'string') {
          return '';
        }
        const rewrittenCss = rewriteCssUrls(content, fileName);
        return `<style data-generated-file="${fileName}">\n${rewrittenCss}\n</style>`;
      });
    };

    const rewriteAttributes = (html = '') => {
      const attrRegex = /\b(src|href|poster|data-src|data-href|xlink:href)\s*=\s*(['"])(.*?)\2/gi;
      return html.replace(attrRegex, (match, attrName, quote, value) => (
        `${attrName}=${quote}${normalizeAssetUrl(value)}${quote}`
      ));
    };

    const rewriteSrcset = (html = '') => {
      const srcsetRegex = /\bsrcset\s*=\s*(['"])(.*?)\1/gi;
      return html.replace(srcsetRegex, (match, quote, value) => {
        const rewritten = value.replace(/(^|,)\s*([^,\s]+)([^,]*)/g, (segmentMatch, prefix, urlPart, suffix) => (
          `${prefix}${normalizeAssetUrl(urlPart)}${suffix}`
        ));
        return `srcset=${quote}${rewritten}${quote}`;
      });
    };

    const rewriteGlobalCssUrls = (html = '') => html.replace(/url\(\s*(['"]?)([^'"\)]+)\1\s*\)/gi, (match, quote, value) => {
      const normalized = normalizeAssetUrl(value);
      const preservedQuote = quote || '';
      return `url(${preservedQuote}${normalized}${preservedQuote})`;
    });

    const htmlWithInlineCss = inlineStyleFromLink(String(htmlCode || ''));
    const withRewrittenAttrs = rewriteAttributes(htmlWithInlineCss);
    const withSrcset = rewriteSrcset(withRewrittenAttrs);
    return rewriteGlobalCssUrls(withSrcset);
  }
}

module.exports = LanhuService;
