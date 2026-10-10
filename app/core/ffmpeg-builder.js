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

function buildZoomFilter(style, initialScale, intensity, duration, fps, W, H) {
  const D = Math.round(duration * fps);
  const s0 = initialScale;
  const k = intensity;
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

function buildImageFilterChain(scene, W, H, fps, zoomEnabled, zoomConfig) {
  const { file, duration, zoomStyle } = scene;
  const isVideo = file.toLowerCase().endsWith('.mp4');

  if (isVideo) {
    return `[${file}]scale=${W}:${H}:force_original_aspect_ratio=${zoomConfig.imageFit},pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,format=yuv420p,setsar=1,trim=duration=${duration}[v${scene.index}]`;
  }

  if (!zoomEnabled) {
    return `[${file}]scale=${W}:${H}:force_original_aspect_ratio=${zoomConfig.imageFit},pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,format=yuv420p,setsar=1[img${scene.index}];[img${scene.index}]trim=duration=${duration}[v${scene.index}]`;
  }

  const zoomFilter = buildZoomFilter(zoomStyle, zoomConfig.initialScale, zoomConfig.intensity, duration, fps, W, H);
  return `[${file}]scale=${W*2}:${H*2}:force_original_aspect_ratio=increase,crop=${W*2}:${H*2},${zoomFilter},format=yuv420p,setsar=1[v${scene.index}]`;
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
  const fontSize = Math.round(H * 0.03);
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
  const { w: W, h: H } = getResolutionWH(config.resolution);
  const fps = config.fps;

  let filter = '';
  const inputLabels = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    filter += buildImageFilterChain(scene, W, H, fps, config.zoom.enabled, config.zoom) + ';';
    inputLabels.push(`v${i}`);
  }

  filter += buildTransitionChain(scenes, config.transition.duration, W, H);

  const lastLabel = scenes.length === 1 ? 'v0' : 'vout';

  const overlays = [];

  if (config.badges.length > 0) {
    let currentLabel = lastLabel;
    for (let i = 0; i < config.badges.length; i++) {
      const badge = config.badges[i];
      const nextLabel = i === config.badges.length - 1 ? 'vbadges' : `vbadge${i}`;
      filter += buildBadgeFilter(badge, W, H, i, totalDuration);
      filter += `[${currentLabel}][badge${i}]overlay=x=${getPositionCoords(badge.position, W, H, Math.round(W * badge.sizePercent / 100), Math.round(W * badge.sizePercent / 100)).x}:y=${getPositionCoords(badge.position, W, H, Math.round(W * badge.sizePercent / 100), Math.round(W * badge.sizePercent / 100)).y}:enable='${buildBadgeFilter(badge, W, H, i, totalDuration).match(/enable='([^']+)'/)[1]}'[${nextLabel}];`;
      currentLabel = nextLabel;
    }
  }

  const baseLabel = config.badges.length > 0 ? 'vbadges' : lastLabel;
  let currentLabel = baseLabel;

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

function buildFfmpegArgs(project, timeline, fontPath, outputPath) {
  const { config } = project;
  const { scenes, audioDuration } = timeline;
  const { w: W, h: H } = getResolutionWH(config.resolution);
  const fps = config.fps;

  const inputs = [];
  const inputArgs = [];

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

  const filterComplex = buildFilterComplex(project, timeline, fontPath);

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

module.exports = { buildFfmpegArgs, getResolutionWH, buildFilterComplex, buildZoomFilter, escapeFontPath };