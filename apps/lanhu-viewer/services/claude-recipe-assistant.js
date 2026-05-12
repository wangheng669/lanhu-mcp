const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const CLAUDE_RECIPE_TIMEOUT_MS = Math.max(10_000, Number(process.env.CLAUDE_RECIPE_TIMEOUT_MS) || 180_000);
const CLAUDE_RECIPE_MODEL = String(process.env.CLAUDE_RECIPE_MODEL || '').trim();

function truncateText(value, maxLength = 96) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function pickLayerText(layer) {
  const candidates = [
    layer?.text,
    layer?.content,
    layer?.value,
    layer?.rawText,
    layer?.name
  ];
  const matched = candidates.find((item) => typeof item === 'string' && item.trim());
  return String(matched || '').trim();
}

function summarizeLayers(layers = []) {
  const normalizedLayers = (Array.isArray(layers) ? layers : [])
    .filter((layer) => layer && typeof layer === 'object')
    .map((layer) => ({
      path: String(layer.path || '').trim(),
      name: String(layer.name || '').trim(),
      type: String(layer.type || '').trim(),
      depth: Number(layer.depth) || 0,
      visible: layer.visible !== false,
      hasImage: Boolean(layer.has_image || layer.image),
      x: Math.round(Number(layer.x) || 0),
      y: Math.round(Number(layer.y) || 0),
      width: Math.round(Number(layer.width) || 0),
      height: Math.round(Number(layer.height) || 0),
      text: pickLayerText(layer)
    }))
    .filter((layer) => layer.path);

  const canvasWidth = normalizedLayers.reduce((max, layer) => Math.max(max, layer.x + layer.width), 0);
  const canvasHeight = normalizedLayers.reduce((max, layer) => Math.max(max, layer.y + layer.height), 0);

  const sectionMap = new Map();
  normalizedLayers.forEach((layer) => {
    const segments = layer.path.split('/').filter(Boolean);
    const key = segments.slice(0, Math.min(2, segments.length)).join('/');
    if (!key) return;
    if (!sectionMap.has(key)) {
      sectionMap.set(key, {
        path: key,
        count: 0,
        imageCount: 0,
        textCount: 0,
        top: Number.POSITIVE_INFINITY,
        left: Number.POSITIVE_INFINITY,
        right: 0,
        bottom: 0
      });
    }
    const section = sectionMap.get(key);
    section.count += 1;
    if (layer.hasImage) section.imageCount += 1;
    if (layer.type === 'textLayer') section.textCount += 1;
    section.top = Math.min(section.top, layer.y);
    section.left = Math.min(section.left, layer.x);
    section.right = Math.max(section.right, layer.x + layer.width);
    section.bottom = Math.max(section.bottom, layer.y + layer.height);
  });

  const repeatedPathMap = new Map();
  normalizedLayers.forEach((layer) => {
    const key = layer.path;
    repeatedPathMap.set(key, (repeatedPathMap.get(key) || 0) + 1);
  });

  const imageLayers = normalizedLayers
    .filter((layer) => layer.hasImage)
    .sort((left, right) => left.y - right.y || left.x - right.x)
    .slice(0, 80)
    .map((layer) => ({
      path: layer.path,
      type: layer.type,
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height
    }));

  const textLayers = normalizedLayers
    .filter((layer) => layer.type === 'textLayer' && layer.text)
    .sort((left, right) => left.y - right.y || left.x - right.x)
    .slice(0, 120)
    .map((layer) => ({
      path: layer.path,
      text: layer.text.slice(0, 80),
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height
    }));

  const sections = [...sectionMap.values()]
    .sort((left, right) => left.top - right.top || left.left - right.left)
    .slice(0, 80)
    .map((section) => ({
      path: section.path,
      count: section.count,
      imageCount: section.imageCount,
      textCount: section.textCount,
      x: Number.isFinite(section.left) ? section.left : 0,
      y: Number.isFinite(section.top) ? section.top : 0,
      width: Math.max(0, section.right - (Number.isFinite(section.left) ? section.left : 0)),
      height: Math.max(0, section.bottom - (Number.isFinite(section.top) ? section.top : 0))
    }));

  const repeatedPaths = [...repeatedPathMap.entries()]
    .filter(([, count]) => count > 1)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 60)
    .map(([pathValue, count]) => ({ path: pathValue, count }));

  return {
    layerCount: normalizedLayers.length,
    imageLayerCount: normalizedLayers.filter((layer) => layer.hasImage).length,
    textLayerCount: normalizedLayers.filter((layer) => layer.type === 'textLayer').length,
    estimatedCanvasSize: {
      width: canvasWidth,
      height: canvasHeight
    },
    sections,
    repeatedPaths,
    imageLayers,
    textLayers
  };
}

function buildRecipePrompt({ design, layerSummary }) {
  const compactLayerSummary = {
    layerCount: Number(layerSummary?.layerCount) || 0,
    imageLayerCount: Number(layerSummary?.imageLayerCount) || 0,
    textLayerCount: Number(layerSummary?.textLayerCount) || 0,
    estimatedCanvasSize: layerSummary?.estimatedCanvasSize || { width: 0, height: 0 },
    sections: (Array.isArray(layerSummary?.sections) ? layerSummary.sections : [])
      .slice(0, 24)
      .map((section) => ({
        path: truncateText(section?.path, 88),
        count: Number(section?.count) || 0,
        imageCount: Number(section?.imageCount) || 0,
        textCount: Number(section?.textCount) || 0,
        x: Math.round(Number(section?.x) || 0),
        y: Math.round(Number(section?.y) || 0),
        width: Math.round(Number(section?.width) || 0),
        height: Math.round(Number(section?.height) || 0)
      })),
    repeatedPaths: (Array.isArray(layerSummary?.repeatedPaths) ? layerSummary.repeatedPaths : [])
      .filter((item) => (Number(item?.count) || 0) > 1)
      .slice(0, 18)
      .map((item) => ({
        path: truncateText(item?.path, 104),
        count: Number(item?.count) || 0
      })),
    representativeTexts: (Array.isArray(layerSummary?.textLayers) ? layerSummary.textLayers : [])
      .slice(0, 24)
      .map((item) => ({
        path: truncateText(item?.path, 88),
        text: truncateText(item?.text, 48),
        x: Math.round(Number(item?.x) || 0),
        y: Math.round(Number(item?.y) || 0)
      }))
  };

  const context = {
    design: {
      id: String(design?.id || '').trim(),
      name: String(design?.name || '').trim(),
      previewUrl: String(design?.previewUrl || design?.preview_url || '').trim()
    },
    layerSummary: compactLayerSummary
  };

  return [
    '你在帮助一个蓝湖设计图 HTML 预览器为“新页面家族第一次接入”生成确定性 recipe 草稿。',
    '重要约束：',
    '1. 运行时不应依赖大模型。',
    '2. 现有引擎已经支持 recipe 匹配、路径 remap、fixed-canvas 绝对定位渲染、按设计预览图裁切补图。',
    '3. 现有固定画布 preset 适合活动页/长页海报类页面，不一定适合榜单/列表页。',
    '4. 如果页面包含重复榜单行、日期 tabs、空态/缺省态、可复用组件，请优先建议“new-component-preset”。',
    '5. 只基于下面提供的 JSON 上下文回答，不要运行命令，不要依赖仓库外信息。',
    '',
    '请输出结构化 JSON，目标是给工程师一个“starter recipe + 缺失能力清单”。',
    '输出时请遵守这些偏好：',
    '- strategy 只能是: reuse-fixed-canvas, new-fixed-canvas-preset, new-component-preset, not-suitable',
    '- recipe.builders 优先复用已有方法名；如果需要新能力，可以写建议的方法名',
    '- recipe.options 只需要 starter 级别，不要生成非常冗长的逐层坐标配置',
    '- missingCapabilities 写工程能力缺口，不写产品需求',
    '- componentCandidates 写可沉淀成通用组件/preset 的模块',
    '',
    '<context>',
    JSON.stringify(context, null, 2),
    '</context>'
  ].join('\n');
}

function buildOutputSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'summary',
      'familyName',
      'strategy',
      'rationale',
      'recipe',
      'missingCapabilities',
      'componentCandidates'
    ],
    properties: {
      summary: { type: 'string' },
      familyName: { type: 'string' },
      strategy: {
        type: 'string',
        enum: ['reuse-fixed-canvas', 'new-fixed-canvas-preset', 'new-component-preset', 'not-suitable']
      },
      rationale: { type: 'string' },
      recipe: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label', 'match', 'builders', 'options'],
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          match: {
            type: 'object',
            additionalProperties: false,
            required: ['designIds', 'designNamePattern'],
            properties: {
              designIds: {
                type: 'array',
                items: { type: 'string' }
              },
              designNamePattern: { type: 'string' }
            }
          },
          builders: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['method'],
              properties: {
                method: { type: 'string' }
              }
            }
          },
          options: {
            type: 'object',
            additionalProperties: false,
            required: [
              'fixedCanvasPreset',
              'componentPreset',
              'variantGroup',
              'supportsStates',
              'primarySections',
              'componentKeys',
              'pathRemaps',
              'cropHints',
              'assetHints',
              'textHints',
              'notes'
            ],
            properties: {
              fixedCanvasPreset: { type: ['string', 'null'] },
              componentPreset: { type: ['string', 'null'] },
              variantGroup: { type: ['string', 'null'] },
              supportsStates: {
                type: 'array',
                items: { type: 'string' }
              },
              primarySections: {
                type: 'array',
                items: { type: 'string' }
              },
              componentKeys: {
                type: 'array',
                items: { type: 'string' }
              },
              pathRemaps: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['from', 'to'],
                  properties: {
                    from: { type: 'string' },
                    to: { type: 'string' }
                  }
                }
              },
              cropHints: {
                type: 'array',
                items: { type: 'string' }
              },
              assetHints: {
                type: 'array',
                items: { type: 'string' }
              },
              textHints: {
                type: 'array',
                items: { type: 'string' }
              },
              notes: {
                type: 'array',
                items: { type: 'string' }
              }
            }
          }
        }
      },
      missingCapabilities: {
        type: 'array',
        items: { type: 'string' }
      },
      componentCandidates: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'type', 'reason'],
          properties: {
            name: { type: 'string' },
            type: { type: 'string' },
            reason: { type: 'string' }
          }
        }
      }
    }
  };
}

function renderDraftMarkdown({ design, draft, durationMs }) {
  const lines = [
    `# ${design?.name || '当前设计图'} Recipe 草稿`,
    '',
    `- 设计图 ID: \`${String(design?.id || '').trim()}\``,
    `- 建议家族: \`${draft.familyName}\``,
    `- 接入策略: \`${draft.strategy}\``,
    `- Claude 耗时: ${durationMs}ms`,
    '',
    '## 摘要',
    draft.summary || '',
    '',
    '## 判断依据',
    draft.rationale || '',
    '',
    '## Starter Recipe',
    '```json',
    JSON.stringify(draft.recipe, null, 2),
    '```',
    '',
    '## 缺失能力',
    ...(Array.isArray(draft.missingCapabilities) && draft.missingCapabilities.length
      ? draft.missingCapabilities.map((item) => `- ${item}`)
      : ['- 暂无']),
    '',
    '## 组件候选',
    ...(Array.isArray(draft.componentCandidates) && draft.componentCandidates.length
      ? draft.componentCandidates.map((item) => `- ${item.name} [${item.type}]：${item.reason}`)
      : ['- 暂无'])
  ];

  return lines.join('\n');
}

function parseClaudeStructuredOutput(rawOutput = '') {
  const normalized = String(rawOutput || '').trim();
  if (!normalized) {
    throw new Error('本地 Claude 没有返回结果');
  }

  const payload = JSON.parse(normalized);
  if (!payload || payload.type !== 'result' || payload.is_error) {
    const errorMessage = payload?.result || payload?.error || normalized;
    throw new Error(String(errorMessage || '本地 Claude 返回异常'));
  }

  if (!payload.structured_output || typeof payload.structured_output !== 'object') {
    throw new Error('本地 Claude 没有返回结构化结果');
  }

  return payload;
}

async function runLocalClaudeRecipeAssistant({
  cwd,
  design,
  layers,
  model = CLAUDE_RECIPE_MODEL
}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lanhu-claude-recipe-'));
  const schemaPath = path.join(tempDir, 'schema.json');
  const promptPath = path.join(tempDir, 'prompt.txt');

  try {
    const layerSummary = summarizeLayers(layers);
    const prompt = buildRecipePrompt({ design, layerSummary });
    const schema = buildOutputSchema();
    fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
    fs.writeFileSync(promptPath, prompt);

    const args = [
      '-p',
      '--output-format',
      'json',
      '--json-schema',
      JSON.stringify(schema),
      '--permission-mode',
      'bypassPermissions',
      '--dangerously-skip-permissions',
      '--no-session-persistence',
      '--add-dir',
      cwd
    ];
    if (model) {
      args.push('--model', model);
    }

    const startedAt = Date.now();
    const { stdout, stderr } = await new Promise((resolve, reject) => {
      const child = spawn(CLAUDE_BIN, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGTERM');
        reject(new Error(`本地 Claude 超时（>${CLAUDE_RECIPE_TIMEOUT_MS}ms）`));
      }, CLAUDE_RECIPE_TIMEOUT_MS);

      child.stdout.on('data', (chunk) => {
        stdout += String(chunk || '');
      });
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk || '');
      });
      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(error);
      });
      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        if (code !== 0) {
          reject(new Error(stderr.trim() || stdout.trim() || `本地 Claude 退出码异常: ${code}`));
          return;
        }
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      });

      child.stdin.write(prompt);
      child.stdin.end();
    });
    const durationMs = Date.now() - startedAt;
    const parsedOutput = parseClaudeStructuredOutput(stdout);
    const draft = parsedOutput.structured_output;
    const markdown = renderDraftMarkdown({ design, draft, durationMs });

    return {
      durationMs,
      draft,
      markdown,
      provider: 'claude',
      prompt,
      promptPath,
      stdout: String(stdout || '').trim(),
      stderr: String(stderr || '').trim(),
      rawResult: parsedOutput
    };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // ignore cleanup errors
    }
  }
}

module.exports = {
  runLocalClaudeRecipeAssistant,
  summarizeLayers
};
