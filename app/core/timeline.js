const { parseScript, hasTimestamps } = require('./script-parser');

function mulberry32(seed) {
  return function() {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function selectStyle(styles, mode, index, seed = 42) {
  if (styles.length === 0) return 'none';
  if (mode === 'fixed') return styles[0];
  if (mode === 'alternate') return styles[index % styles.length];
  const rng = mulberry32(seed + index * 1000);
  return styles[Math.floor(rng() * styles.length)];
}

function selectTransitionType(types, mode, index, seed = 42) {
  if (types.length === 0) return 'cut';
  if (mode === 'fixed') return types[0];
  if (mode === 'alternate') return types[index % types.length];
  const rng = mulberry32(seed + index * 1000 + 500);
  return types[Math.floor(rng() * types.length)];
}

function computeDurationsFromScript(scriptSegments, audioDuration, imageCount, fitTimesToAudio) {
  const N = imageCount;
  const segments = scriptSegments;

  if (segments.length === 0) {
    return Array(N).fill(audioDuration / N);
  }

  const segmentCount = segments.length;
  const starts = segments.map(s => s.startSec);

  let estEnd;
  if (segmentCount === 1) {
    estEnd = audioDuration;
  } else {
    const durations = [];
    for (let i = 0; i < segmentCount - 1; i++) {
      durations.push(starts[i + 1] - starts[i]);
    }
    const avgDur = durations.reduce((a, b) => a + b, 0) / durations.length;
    estEnd = starts[segmentCount - 1] + avgDur;
  }

  let factor = 1;
  let adjustedStarts = [...starts];

  if (fitTimesToAudio && estEnd > 0) {
    factor = audioDuration / estEnd;
    adjustedStarts = starts.map(s => s * factor);
  }

  const sceneStarts = [];
  for (let i = 0; i < N; i++) {
    let segIndex;
    if (N >= segmentCount) {
      segIndex = Math.min(i, segmentCount - 1);
    } else {
      segIndex = Math.floor(i * segmentCount / N);
    }
    sceneStarts.push(adjustedStarts[segIndex]);
  }

  const sceneEnds = [];
  for (let i = 0; i < N; i++) {
    if (i < N - 1) {
      sceneEnds.push(sceneStarts[i + 1]);
    } else {
      sceneEnds.push(audioDuration);
    }
  }

  const durations = sceneEnds.map((end, i) => end - sceneStarts[i]);

  return { durations, factor, estEnd, adjustedStarts, sceneStarts, sceneEnds };
}

function computeDurationsNoTimestamps(scriptText, audioDuration, imageCount) {
  const lines = scriptText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const weights = lines.map(l => Math.max(1, l.length));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  return weights.map(w => audioDuration * w / totalWeight);
}

function computeDurationsNoScript(audioDuration, imageCount) {
  return Array(imageCount).fill(audioDuration / imageCount);
}

function applyOverrides(durations, overrides, audioDuration) {
  const result = [...durations];
  const overrideIndices = Object.keys(overrides).map(k => parseInt(k, 10)).sort((a, b) => a - b);

  let remainingDuration = audioDuration;
  const fixedIndices = new Set();

  for (const idx of overrideIndices) {
    if (idx >= 0 && idx < result.length) {
      result[idx] = overrides[idx];
      remainingDuration -= overrides[idx];
      fixedIndices.add(idx);
    }
  }

  const freeIndices = [];
  for (let i = 0; i < result.length; i++) {
    if (!fixedIndices.has(i)) freeIndices.push(i);
  }

  if (freeIndices.length > 0 && remainingDuration > 0) {
    const currentFreeSum = freeIndices.reduce((sum, i) => sum + durations[i], 0);
    if (currentFreeSum > 0) {
      for (const i of freeIndices) {
        result[i] = durations[i] * (remainingDuration / currentFreeSum);
      }
    } else {
      const equalShare = remainingDuration / freeIndices.length;
      for (const i of freeIndices) {
        result[i] = equalShare;
      }
    }
  }

  const total = result.reduce((a, b) => a + b, 0);
  if (Math.abs(total - audioDuration) > 0.001) {
    const diff = audioDuration - total;
    for (let i = result.length - 1; i >= 0 && Math.abs(diff) > 0.001; i--) {
      if (!fixedIndices.has(i)) {
        const adjustment = Math.min(Math.max(diff, -result[i] + 0.001), result[i]);
        result[i] += adjustment;
      }
    }
  }

  return result;
}

function validateSceneDurations(durations, transitionDuration) {
  const minDuration = transitionDuration * 2 + 0.2;
  for (let i = 0; i < durations.length; i++) {
    if (durations[i] < minDuration) {
      throw new Error(`E_SCENE_TOO_SHORT: Escena ${i + 1} muy corta (${durations[i].toFixed(2)}s), mínimo ${minDuration.toFixed(2)}s`);
    }
  }
}

function buildTimeline(project, audioDuration) {
  const { images, script, config, sceneDurationOverrides, sceneOverrides = {} } = project;
  const N = images.length;
  const transitionDuration = config.transition.duration;

  let durations, factor = 1, estEnd = audioDuration, adjustedStarts = [], sceneStarts = [], sceneEnds = [];

  if (script && script.trim()) {
    const segments = parseScript(script);
    const hasTs = hasTimestamps(script);

    if (hasTs) {
      const result = computeDurationsFromScript(segments, audioDuration, N, config.fitTimesToAudio);
      durations = result.durations;
      factor = result.factor;
      estEnd = result.estEnd;
      adjustedStarts = result.adjustedStarts;
      sceneStarts = result.sceneStarts;
      sceneEnds = result.sceneEnds;
    } else {
      durations = computeDurationsNoTimestamps(script, audioDuration, N);
    }
  } else {
    durations = computeDurationsNoScript(audioDuration, N);
  }

  if (Object.keys(sceneDurationOverrides).length > 0) {
    durations = applyOverrides(durations, sceneDurationOverrides, audioDuration);
  }

  validateSceneDurations(durations, transitionDuration);

  const scenes = [];
  for (let i = 0; i < N; i++) {
    const start = i === 0 ? 0 : scenes[i - 1].end;
    const end = start + durations[i];
    const imageObj = typeof images[i] === 'string' ? { file: images[i] } : images[i];
    const file = imageObj.file;
    const isVideo = file.toLowerCase().endsWith('.mp4');

    const sceneOverride = sceneOverrides[i.toString()];
    const zoomStyle = sceneOverride?.zoom || (isVideo ? 'none' : selectStyle(config.zoom.styles, config.zoom.mode, i));
    const transitionType = sceneOverride?.transition || (i < N - 1 ? selectTransitionType(config.transition.types, config.transition.mode, i) : 'cut');
    const zoomIntensity = sceneOverride?.zoomIntensity || 'normal';

    scenes.push({
      index: i,
      file,
      path: imageObj.path,
      start,
      end,
      duration: durations[i],
      isVideo,
      zoomStyle,
      transitionType,
      zoomIntensity,
      focus: imageObj.focus || { x: 0.5, y: 0.5 }
    });
  }

  const totalDuration = scenes[scenes.length - 1].end;
  const durationDiff = Math.abs(totalDuration - audioDuration);

  return {
    scenes,
    totalDuration,
    audioDuration,
    factor,
    estEnd,
    durationDiff,
    fitApplied: config.fitTimesToAudio && script && hasTimestamps(script)
  };
}

module.exports = { buildTimeline, mulberry32, selectStyle, selectTransitionType };