const path = require('path');

function getResolutionWH(resolution) {
  switch (resolution) {
    case '9:16': return { w: 1080, h: 1920 };
    case '16:9': return { w: 1920, h: 1080 };
    case '1:1': return { w: 1080, h: 1080 };
    case '4:5': return { w: 1080, h: 1350 };
    default: return { w: 1920, h: 1080 };
  }
}

function getPositionCoords(position, W, H, badgeW, badgeH, marginPercent = 5) {
  const margin = W * marginPercent / 100;
  switch (position) {
    case 'top-left': return { x: margin, y: margin };
    case 'top-right': return { x: W - badgeW - margin, y: margin };
    case 'bottom-left': return { x: margin, y: H - badgeH - margin };
    case 'bottom-right': return { x: W - badgeW - margin, y: H - badgeH - margin };
    case 'center': return { x: (W - badgeW) / 2, y: (H - badgeH) / 2 };
    default: return { x: margin, y: margin };
  }
}

function escapeFontPath(fontPath) {
  return fontPath
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'");
}

function buildZoomFilter(style, initialScale, intensity, duration, fps, W, H, zoomIntensity = 'normal') {
  const D = Math.round(duration * fps);
  const s0 = initialScale;
  const intensityMult = zoomIntensity === 'soft' ? 0.5 : zoomIntensity === 'strong' ? 1.5 : 1;
  const k = intensity * intensityMult;
  const p = `(on/(${D}-1))`;

  let zExpr, xExpr, yExpr;

  switch (style) {
    case 'kenburns':
      zExpr = `${s0}+${s0}*${k}*${p}`;
      xExpr = `iw/2-(iw/zoom/2)+(iw/zoom)*0.02*${p}`;
      yExpr = `ih/2-(ih/zoom/2)`;
      break;
    case 'zoomin':
      zExpr = `${s0}+${s0}*${k}*${p}`;
      xExpr = `iw/2-(iw/zoom/2)`;
      yExpr = `ih/2-(ih/zoom/2)`;
      break;
    case 'zoomout':
      zExpr = `${s0}*(1+${k})-${s0}*${k}*${p}`;
      xExpr = `iw/2-(iw/zoom/2)`;
      yExpr = `ih/2-(ih/zoom/2)`;
      break;
    case 'zoompulse':
      zExpr = `${s0}+${s0}*${k}*abs(sin(PI*${p}*2))`;
      xExpr = `iw/2-(iw/zoom/2)`;
      yExpr = `ih/2-(ih/zoom/2)`;
      break;
    case 'panleft':
      zExpr = `${s0}`;
      xExpr = `(iw-iw/zoom)*(1-${p})`;
      yExpr = `ih/2-(ih/zoom/2)`;
      break;
    case 'panright':
      zExpr = `${s0}`;
      xExpr = `(iw-iw/zoom)*${p}`;
      yExpr = `ih/2-(ih/zoom/2)`;
      break;
    case 'panup':
      zExpr = `${s0}`;
      xExpr = `iw/2-(iw/zoom/2)`;
      yExpr = `(ih-ih/zoom)*(1-${p})`;
      break;
    case 'pandown':
      zExpr = `${s0}`;
      xExpr = `iw/2-(iw/zoom/2)`;
      yExpr = `(ih-ih/zoom)*${p}`;
      break;
    case 'none':
    default:
      zExpr = '1';
      xExpr = '0';
      yExpr = '0';
      break;
  }

  return `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=${D}:s=${W}x${H}:fps=${fps}`;
}

function buildCropFilter(scene, W, H, fitMode) {
  const { focus } = scene;
  const fx = focus?.x ?? 0.5;
  const fy = focus?.y ?? 0.5;

  if (fitMode === 'blur') {
    return '';
  }

  const scaleW = W * 2;
  const scaleH = H * 2;
  const cropX = `max(0,min(iw-${scaleW},${fx}*iw-${scaleW}))`;
  const cropY = `max(0,min(ih-${scaleH},${fy}*ih-${scaleH}))`;

  return `scale=${scaleW}:${scaleH}:force_original_aspect_ratio=increase,crop=${scaleW}:${scaleH}:x='${cropX}':y='${cropY}'`;
}

function buildBlurFilter(W, H) {
  return `scale=${W}:${H}:force_original_aspect_ratio=increase,boxblur=luma_radius=min(iw\\,ih)/20:luma_power=2,eq=brightness=-0.1`;
}

function buildContainFilter(W, H) {
  return `scale=${W}:${H}:force_original_aspect_ratio=decrease`;
}

// Build input specs with indices for filter graph
function buildInputSpecs(project, timeline) {
  const { config } = project;
  const { scenes } = timeline;
  const inputs = [];
  const inputMeta = [];

  // Scene inputs (images/videos)
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    let inputPath = scene.path;
    if (!inputPath || !path.isAbsolute(inputPath)) {
      const fallback = project.images?.[i]?.path;
      if (fallback && path.isAbsolute(fallback)) {
        inputPath = fallback;
      } else {
        throw new Error(`E_INPUT_MISSING: Imagen ${i} ("${scene.file}") sin ruta absoluta válida: ${scene.path ?? 'undefined'}`);
      }
    }
    if (scene.isVideo) {
      inputs.push('-stream_loop', '-1', '-i', inputPath);
    } else {
      inputs.push('-i', inputPath);
    }
    inputMeta.push({ type: 'scene', index: i, sceneIndex: i, path: inputPath, isVideo: scene.isVideo });
  }

  // Narration input
  const narrationPath = project.narration?.path;
  if (!narrationPath || !path.isAbsolute(narrationPath)) {
    throw new Error(`E_INPUT_MISSING: Narración sin ruta absoluta válida`);
  }
  inputs.push('-i', narrationPath);
  const narrationInputIdx = inputMeta.length;
  inputMeta.push({ type: 'narration', index: narrationInputIdx });

  // Music input
  let musicInputIdx = -1;
  if (project.music && project.music.path) {
    if (!path.isAbsolute(project.music.path)) {
      throw new Error(`E_INPUT_MISSING: Música sin ruta absoluta válida`);
    }
    inputs.push('-i', project.music.path);
    musicInputIdx = inputMeta.length;
    inputMeta.push({ type: 'music', index: musicInputIdx });
  }

  // Badge inputs
  const badgeInputIndices = [];
  if (Array.isArray(config?.badges)) {
    for (let i = 0; i < config.badges.length; i++) {
      const badge = config.badges[i];
      if (badge.path && path.isAbsolute(badge.path)) {
        inputs.push('-i', badge.path);
        const badgeIdx = inputMeta.length;
        inputMeta.push({ type: 'badge', index: badgeIdx, badgeIndex: i });
        badgeInputIndices.push(badgeIdx);
      }
    }
  }

  return { inputs, inputMeta, narrationInputIdx, musicInputIdx, badgeInputIndices };
}

// Build filter graph using input indices (not paths)
function buildFilterGraph(inputMeta, scenes, config, fontPath, W, H, totalDuration, narrationInputIdx, musicInputIdx, badgeInputIndices) {
  const fps = config.fps;
  const images = scenes.map(s => s); // scenes already have path info
  let filter = '';

  // Scene filters - use input indices like [0:v], [1:v], etc.
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const meta = inputMeta.find(m => m.type === 'scene' && m.sceneIndex === i);
    const inputIdx = meta?.index ?? i;
    filter += buildImageFilterChainByIndex(scene, inputIdx, W, H, fps, config.zoom.enabled, config.zoom, config.fitMode) + ';';
  }

  filter += buildTransitionChain(scenes, config.transition.duration, W, H);

  const lastLabel = scenes.length === 1 ? 'v0' : 'vout';
  let currentLabel = lastLabel;

  if (config.badges.length > 0) {
    for (let i = 0; i < config.badges.length; i++) {
      const badge = config.badges[i];
      const nextLabel = i === config.badges.length - 1 ? 'vbadges' : `vbadge${i}`;
      // Find badge input index
      const badgeMeta = inputMeta.find(m => m.type === 'badge' && m.badgeIndex === i);
      const badgeInputIdx = badgeMeta?.index;
      if (badgeInputIdx !== undefined) {
        const badgeW = Math.round(W * badge.sizePercent / 100);
        const badgeH = Math.round(badgeW);
        const { x, y } = getPositionCoords(badge.position, W, H, badgeW, badgeH);
        const at = badge.at ?? 0;
        const dur = badge.duration ?? totalDuration;
        const enableExpr = `between(t,${at},${at + dur})`;
        const popAnim = `scale=${badgeW}*min(1\\,1.15*max(0\\,1-4*(t-${at})))*gt(t\\,${at})*lt(t\\,${at}+0.4)+${badgeW}*gte(t\\,${at}+0.4)`;
        filter += `[${badgeInputIdx}:v]scale=${badgeW}:${badgeH}:force_original_aspect_ratio=decrease,${popAnim}[badge${i}];`;
        filter += `[${currentLabel}][badge${i}]overlay=x=${x}:y=${y}:enable='${enableExpr}'[${nextLabel}];`;
        currentLabel = nextLabel;
      }
    }
  }

  const lowerThirdFilter = buildLowerThirdFilter(config.lowerThird, W, H, fontPath);
  if (lowerThirdFilter) {
    filter += `[${currentLabel}]${lowerThirdFilter}[vlower];`;
    currentLabel = 'vlower';
  }

  const progressFilter = buildProgressBarFilter(config.progressBar, W, H, totalDuration);
  if (progressFilter) {
    filter += `[${currentLabel}]${progressFilter}[vprogress];`;
    currentLabel = 'vprogress';
  }

  filter += `[${currentLabel}]copy[vfinal]`;

  return filter;
}

// Build image filter chain using input index instead of path
function buildImageFilterChainByIndex(scene, inputIdx, W, H, fps, zoomEnabled, zoomConfig, fitMode) {
  const { file, duration, zoomStyle, zoomIntensity, focus } = scene;
  const isVideo = file.toLowerCase().endsWith('.mp4');
  const idx = `[${inputIdx}:v]`;

  if (isVideo) {
    const cropFilter = fitMode === 'crop' ? buildCropFilter(scene, W, H, fitMode) : '';
    const scaleFilter = cropFilter || `scale=${W}:${H}:force_original_aspect_ratio=cover`;
    return `${idx}${scaleFilter},pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,format=yuv420p,setsar=1,trim=duration=${duration}[v${scene.index}]`;
  }

  if (fitMode === 'blur') {
    const blurBg = buildBlurFilter(W, H);
    const containFg = buildContainFilter(W, H);
    if (!zoomEnabled || zoomStyle === 'none') {
      return `${idx}${blurBg}[bg${scene.index}];${idx}${containFg}[fg${scene.index}];[bg${scene.index}][fg${scene.index}]overlay=(W-w)/2:(H-h)/2,format=yuv420p,setsar=1,trim=duration=${duration}[v${scene.index}]`;
    }
    const zoomFilter = buildZoomFilter(zoomStyle, zoomConfig.initialScale, zoomConfig.intensity, duration, fps, W, H, zoomIntensity);
    return `${idx}${blurBg}[bg${scene.index}];${idx}${containFg},${zoomFilter},format=yuv420p,setsar=1[fg${scene.index}];[bg${scene.index}][fg${scene.index}]overlay=(W-w)/2:(H-h)/2,trim=duration=${duration}[v${scene.index}]`;
  }

  const cropFilter = buildCropFilter(scene, W, H, fitMode);

  if (!zoomEnabled || zoomStyle === 'none') {
    return `${idx}${cropFilter},pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,format=yuv420p,setsar=1,trim=duration=${duration}[v${scene.index}]`;
  }

  const zoomFilter = buildZoomFilter(zoomStyle, zoomConfig.initialScale, zoomConfig.intensity, duration, fps, W, H, zoomIntensity);
  return `${idx}${cropFilter},${zoomFilter},format=yuv420p,setsar=1[v${scene.index}]`;
}

// Fixed transition chain with correct offsets
function buildTransitionChain(scenes, transitionDuration, W, H) {
  if (scenes.length === 1) return '';

  let chain = '';
  let prevLabel = 'v0';

  // Accumulator tracks end time of previous scene
  let acc = scenes[0].duration;

  for (let i = 1; i < scenes.length; i++) {
    const prevScene = scenes[i - 1];
    const scene = scenes[i];

    // Resolve transition
    const { transition, duration } = resolveXfade(scene.transitionType, scene.fps || 30);

    // Offset = end of previous scene - transition duration (positive, non-decreasing)
    const offset = Math.max(0, acc - duration);

    const nextLabel = i === scenes.length - 1 ? 'vout' : `x${i}`;

    chain += `[${prevLabel}][v${i}]xfade=transition=${transition}:duration=${duration}:offset=${offset}[${nextLabel}];`;

    // Update accumulator: add current scene duration minus transition overlap
    acc += scene.duration - duration;
    prevLabel = nextLabel;
  }

  return chain;
}

// Valid xfade transitions in FFmpeg 6.1+
const XFADE_TRANSITIONS = new Set([
  'fade', 'wipeleft', 'wiperight', 'wipeup', 'wipedown',
  'slideleft', 'slideright', 'slideup', 'slidedown',
  'circleopen', 'circleclose', 'distance',
  'fadegrays', 'fadecolor', 'hfade', 'wfade',
  'fadeblack', 'fadewhite', 'smooth', 'pixelize', 'diagbl', 'diagbr', 'diagtl', 'diagtr',
  'hlslice', 'hrslice', 'vuslice', 'vdslice', 'dissolve', 'squeezeh', 'squeezev', 'zoomin', 'hlslide', 'hrslide', 'vslide'
]);

function resolveXfade(name, fps) {
  if (!name || name === 'cut' || name === '') {
    // cut = corte directo = fade con duración mínima de 1 frame
    return { transition: 'fade', duration: 1 / fps };
  }
  if (XFADE_TRANSITIONS.has(name)) {
    return { transition: name, duration: 0.5 };
  }
  throw new Error(`Transición xfade no válida: "${name}". Use una de: ${Array.from(XFADE_TRANSITIONS).join(', ')}`);
}

function buildLowerThirdFilter(config, W, H, fontPath) {
  if (!config.enabled) return '';

  const boxH = Math.round(H * 0.08);
  const y = Math.round(H * 0.88);
  let fontSize = Math.round(H * 0.03);
  const maxTextWidth = W * 0.9;
  const escapedFont = escapeFontPath(fontPath);

  return `drawbox=x=0:y=${y}:w=${W}:h=${boxH}:color=black@${config.opacity}:t=fill,drawtext=fontfile='${escapedFont}':text='${config.text.replace(/'/g, "\\'")}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=${y}+(h-text_h)/2`;
}

function buildProgressBarFilter(config, W, H, totalDuration) {
  if (!config.enabled) return '';

  const h = config.heightPx;
  const color = config.color;
  return `drawbox=x=0:y=${H - h}:w='${W}*t/${totalDuration}':h=${h}:color=${color}:t=fill`;
}

function buildFfmpegArgs(project, timeline, fontPath, outputPath, outputConfig) {
  if (!outputConfig || typeof outputConfig.w !== 'number' || typeof outputConfig.h !== 'number') {
    throw new Error(`buildFfmpegArgs: outputConfig inválido: ${JSON.stringify(outputConfig)}`);
  }
  const { config } = project;
  const { scenes, audioDuration } = timeline;
  const fps = config.fps;
  const { w: W, h: H } = outputConfig;

  // Build inputs with indices
  const { inputs, inputMeta, narrationInputIdx, musicInputIdx, badgeInputIndices } = buildInputSpecs(project, timeline);

  // Build filter graph using indices
  const filterComplex = buildFilterGraph(inputMeta, scenes, config, fontPath, W, H, audioDuration, narrationInputIdx, musicInputIdx, badgeInputIndices);

  // Build audio filter using correct input indices
  let audioFilter, audioMap;
  if (musicInputIdx >= 0) {
    const musicVol = project.music.volume;
    audioFilter = `[${narrationInputIdx}:a]volume=1[a0];[${musicInputIdx}:a]volume=${musicVol},afade=in:d=1,afade=out:st=${audioDuration - 2}:d=2,atrim=duration=${audioDuration}[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=0[aout]`;
    audioMap = '[aout]';
  } else {
    audioFilter = `[${narrationInputIdx}:a]volume=1,atrim=duration=${audioDuration}[aout]`;
    audioMap = '[aout]';
  }

  const args = [
    ...inputs,
    '-filter_complex', filterComplex + ';' + audioFilter,
    '-map', '[vfinal]',
    '-map', audioMap,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-r', String(fps),
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    '-progress', 'pipe:1',
    '-y',
    outputPath
  ];

  return args;
}

function buildFilterComplexForOutput(project, timeline, fontPath, outputConfig) {
  if (!outputConfig || typeof outputConfig.w !== 'number' || typeof outputConfig.h !== 'number') {
    throw new Error(`buildFilterComplexForOutput: outputConfig inválido: ${JSON.stringify(outputConfig)}`);
  }
  const { config } = project;
  const { scenes, totalDuration } = timeline;
  const fps = config.fps;
  const { w: W, h: H } = outputConfig;

  const { inputMeta, narrationInputIdx, musicInputIdx, badgeInputIndices } = buildInputSpecs(project, timeline);
  return buildFilterGraph(inputMeta, scenes, config, fontPath, W, H, totalDuration, narrationInputIdx, musicInputIdx, badgeInputIndices);
}

// Legacy wrapper for backward compatibility (uses first output config)
function buildFilterComplex(project, timeline, fontPath) {
  const outputConfig = getResolutionWH(project.config.outputs?.[0] || '9:16');
  return buildFilterComplexForOutput(project, timeline, fontPath, outputConfig);
}

function buildOutputConfigs(config) {
  return config.outputs.map(res => {
    const base = getResolutionWH(res);
    return { ...base, resolution: res };
  });
}

function generateOutputFilename(baseName, outputConfig, existingFiles = []) {
  const suffix = outputConfig.resolution === '9:16' ? '_9x16' :
                 outputConfig.resolution === '16:9' ? '_16x9' : '_1x1';
  let filename = `${baseName}${suffix}.mp4`;
  let counter = 1;
  while (existingFiles.includes(filename)) {
    counter++;
    filename = `${baseName}${suffix} (${counter}).mp4`;
  }
  return filename;
}

module.exports = {
  buildFfmpegArgs,
  getResolutionWH,
  buildFilterComplex,
  buildFilterComplexForOutput,
  buildZoomFilter,
  escapeFontPath,
  buildOutputConfigs,
  generateOutputFilename,
  buildCropFilter,
  buildBlurFilter,
  buildContainFilter,
  buildTransitionChain,
  resolveXfade,
  buildInputSpecs,
  buildFilterGraph,
  buildImageFilterChainByIndex
};