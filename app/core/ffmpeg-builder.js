const path = require('path');

function getResolutionWH(resolution) {
  switch (resolution) {
    case '9:16': return { w: 1080, h: 1920 };
    case '16:9': return { w: 1920, h: 1080 };
    case '1:1': return { w: 1080, h: 1080 };
    default: return { w: 1080, h: 1920 };
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

function buildImageFilterChain(scene, W, H, fps, zoomEnabled, zoomConfig, fitMode) {
  const { file, duration, zoomStyle, zoomIntensity, focus } = scene;
  const isVideo = file.toLowerCase().endsWith('.mp4');

  if (isVideo) {
    const cropFilter = fitMode === 'crop' ? buildCropFilter(scene, W, H, fitMode) : '';
    const scaleFilter = cropFilter || `scale=${W}:${H}:force_original_aspect_ratio=cover`;
    return `[${file}]${scaleFilter},pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,format=yuv420p,setsar=1,trim=duration=${duration}[v${scene.index}]`;
  }

  if (fitMode === 'blur') {
    const blurBg = buildBlurFilter(W, H);
    const containFg = buildContainFilter(W, H);
    if (!zoomEnabled || zoomStyle === 'none') {
      return `[${file}]${blurBg}[bg${scene.index}];[${file}]${containFg}[fg${scene.index}];[bg${scene.index}][fg${scene.index}]overlay=(W-w)/2:(H-h)/2,format=yuv420p,setsar=1,trim=duration=${duration}[v${scene.index}]`;
    }
    const zoomFilter = buildZoomFilter(zoomStyle, zoomConfig.initialScale, zoomConfig.intensity, duration, fps, W, H, zoomIntensity);
    return `[${file}]${blurBg}[bg${scene.index}];[${file}]${containFg},${zoomFilter},format=yuv420p,setsar=1[fg${scene.index}];[bg${scene.index}][fg${scene.index}]overlay=(W-w)/2:(H-h)/2,trim=duration=${duration}[v${scene.index}]`;
  }

  const cropFilter = buildCropFilter(scene, W, H, fitMode);

  if (!zoomEnabled || zoomStyle === 'none') {
    return `[${file}]${cropFilter},pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,format=yuv420p,setsar=1,trim=duration=${duration}[v${scene.index}]`;
  }

  const zoomFilter = buildZoomFilter(zoomStyle, zoomConfig.initialScale, zoomConfig.intensity, duration, fps, W, H, zoomIntensity);
  return `[${file}]${cropFilter},${zoomFilter},format=yuv420p,setsar=1[v${scene.index}]`;
}

function buildBadgeFilter(badge, W, H, sceneIndex, totalDuration) {
  const { file, at, duration, sizePercent, position } = badge;
  const badgeW = Math.round(W * sizePercent / 100);
  const badgeH = Math.round(badgeW);
  const { x, y } = getPositionCoords(position, W, H, badgeW, badgeH);

  const enableExpr = `between(t,${at},${at + duration})`;
  const popAnim = `scale=${badgeW}*min(1\,1.15*max(0\,1-4*(t-${at})))*gt(t\,${at})*lt(t\,${at}+0.4)+${badgeW}*gte(t\,${at}+0.4)`;

  return `[${file}]scale=${badgeW}:${badgeH}:force_original_aspect_ratio=decrease,${popAnim}[badge${sceneIndex}];`;
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

function buildTransitionChain(scenes, transitionDuration, W, H) {
  if (scenes.length === 1) return '';

  let chain = '';
  let prevLabel = 'v0';

  for (let i = 1; i < scenes.length; i++) {
    const scene = scenes[i];
    const t = scene.transitionType;
    const T = t === 'cut' ? 0.001 : transitionDuration;
    const offset = scene.start;
    const nextLabel = i === scenes.length - 1 ? 'vout' : `x${i}`;

    chain += `[${prevLabel}][v${i}]xfade=transition=${t}:duration=${T}:offset=${offset}[${nextLabel}];`;
    prevLabel = nextLabel;
  }

  return chain;
}

function buildFilterComplex(project, timeline, fontPath) {
  const { config } = project;
  const { scenes, totalDuration } = timeline;
  const fps = config.fps;

  let filter = '';

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    filter += buildImageFilterChain(scene, config.outputs[0].w, config.outputs[0].h, fps, config.zoom.enabled, config.zoom, config.fitMode) + ';';
  }

  filter += buildTransitionChain(scenes, config.transition.duration, config.outputs[0].w, config.outputs[0].h);

  const lastLabel = scenes.length === 1 ? 'v0' : 'vout';
  let currentLabel = lastLabel;

  if (config.badges.length > 0) {
    for (let i = 0; i < config.badges.length; i++) {
      const badge = config.badges[i];
      const nextLabel = i === config.badges.length - 1 ? 'vbadges' : `vbadge${i}`;
      filter += buildBadgeFilter(badge, config.outputs[0].w, config.outputs[0].h, i, totalDuration);
      filter += `[${currentLabel}][badge${i}]overlay=x=${getPositionCoords(badge.position, config.outputs[0].w, config.outputs[0].h, Math.round(config.outputs[0].w * badge.sizePercent / 100), Math.round(config.outputs[0].w * badge.sizePercent / 100)).x}:y=${getPositionCoords(badge.position, config.outputs[0].w, config.outputs[0].h, Math.round(config.outputs[0].w * badge.sizePercent / 100), Math.round(config.outputs[0].w * badge.sizePercent / 100)).y}:enable='${buildBadgeFilter(badge, config.outputs[0].w, config.outputs[0].h, i, totalDuration).match(/enable='([^']+)'/)[1]}'[${nextLabel}];`;
      currentLabel = nextLabel;
    }
  }

  const lowerThirdFilter = buildLowerThirdFilter(config.lowerThird, config.outputs[0].w, config.outputs[0].h, fontPath);
  if (lowerThirdFilter) {
    filter += `[${currentLabel}]${lowerThirdFilter}[vlower];`;
    currentLabel = 'vlower';
  }

  const progressFilter = buildProgressBarFilter(config.progressBar, config.outputs[0].w, config.outputs[0].h, totalDuration);
  if (progressFilter) {
    filter += `[${currentLabel}]${progressFilter}[vprogress];`;
    currentLabel = 'vprogress';
  }

  filter += `[${currentLabel}]copy[vfinal]`;

  return filter;
}

function buildFfmpegArgs(project, timeline, fontPath, outputPath, outputConfig) {
  const { config } = project;
  const { scenes, audioDuration } = timeline;
  const fps = config.fps;
  const { w: W, h: H } = outputConfig;

  const inputs = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    if (scene.isVideo) {
      inputs.push('-stream_loop', '-1', '-i', scene.file);
    } else {
      inputs.push('-i', scene.file);
    }
  }

  inputs.push('-i', project.narration);

  let audioFilter = '';
  let audioMap = '0:a';

  if (project.music && project.music.file) {
    inputs.push('-i', project.music.file);
    const musicVol = project.music.volume;
    audioFilter = `[0:a]volume=1[a0];[${scenes.length}:a]volume=${musicVol},afade=in:d=1,afade=out:st=${audioDuration - 2}:d=2,atrim=duration=${audioDuration}[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=0[aout]`;
    audioMap = '[aout]';
  } else {
    audioFilter = `[0:a]volume=1,atrim=duration=${audioDuration}[aout]`;
    audioMap = '[aout]';
  }

  const filterComplex = buildFilterComplexForOutput(project, timeline, fontPath, outputConfig);

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
  const { config } = project;
  const { scenes, totalDuration } = timeline;
  const fps = config.fps;
  const { w: W, h: H } = outputConfig;

  let filter = '';

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    filter += buildImageFilterChain(scene, W, H, fps, config.zoom.enabled, config.zoom, config.fitMode) + ';';
  }

  filter += buildTransitionChain(scenes, config.transition.duration, W, H);

  const lastLabel = scenes.length === 1 ? 'v0' : 'vout';
  let currentLabel = lastLabel;

  if (config.badges.length > 0) {
    for (let i = 0; i < config.badges.length; i++) {
      const badge = config.badges[i];
      const nextLabel = i === config.badges.length - 1 ? 'vbadges' : `vbadge${i}`;
      filter += buildBadgeFilter(badge, W, H, i, totalDuration);
      filter += `[${currentLabel}][badge${i}]overlay=x=${getPositionCoords(badge.position, W, H, Math.round(W * badge.sizePercent / 100), Math.round(W * badge.sizePercent / 100)).x}:y=${getPositionCoords(badge.position, W, H, Math.round(W * badge.sizePercent / 100), Math.round(W * badge.sizePercent / 100)).y}:enable='${buildBadgeFilter(badge, W, H, i, totalDuration).match(/enable='([^']+)'/)[1]}'[${nextLabel}];`;
      currentLabel = nextLabel;
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
  buildContainFilter
};