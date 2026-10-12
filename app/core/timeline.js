const { parseScript, hasTimestamps, parseScenes, imageSceneNumber } = require('./script-parser');

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
  let sceneAssignments = null; // Will hold the mapping of scene number -> image index

  // Parse scenes from script if available
  let parsedScenes = [];
  let useSceneMarkers = false;

  if (script && script.trim()) {
    try {
      parsedScenes = parseScenes(script);
      useSceneMarkers = parsedScenes.length > 0 && parsedScenes.some(s => s.number !== undefined);
    } catch (e) {
      // If parsing fails, fall back to old behavior
      console.warn('[buildTimeline] parseScenes failed, falling back:', e.message);
    }
  }

  if (useSceneMarkers) {
    // Assign images to scenes by number
    const imageBySceneNumber = {};
    const imagesWithoutNumber = [];
    
    for (let i = 0; i < images.length; i++) {
      const imageObj = typeof images[i] === 'string' ? { file: images[i] } : images[i];
      const file = imageObj.file;
      const sceneNum = imageSceneNumber(file);
      
      if (sceneNum !== null) {
        if (imageBySceneNumber[sceneNum]) {
          throw new Error(`E_DUPLICATE_IMAGE_SCENE: Múltiples imágenes para escena ${sceneNum}`);
        }
        imageBySceneNumber[sceneNum] = { index: i, image: imageObj };
      } else {
        imagesWithoutNumber.push({ index: i, image: imageObj });
      }
    }

    // Build ordered list of scenes with their assigned images
    const orderedScenes = [];
    const warnings = [];
    
    for (const parsedScene of parsedScenes.sort((a, b) => a.number - b.number)) {
      const assigned = imageBySceneNumber[parsedScene.number];
      if (assigned) {
        orderedScenes.push({
          sceneNumber: parsedScene.number,
          image: assigned.image,
          imageIndex: assigned.index,
          start: parsedScene.start ?? 0,
          end: parsedScene.end ?? null,
          text: parsedScene.text
        });
      } else {
        warnings.push(`Escena ${parsedScene.number} sin imagen asignada`);
      }
    }

    // Check for images without matching scenes
    for (const unassigned of imagesWithoutNumber) {
      warnings.push(`Imagen "${unassigned.image.file}" sin número de escena, se usará orden de carga`);
    }
    
    // Check for scenes without images
    for (const parsedScene of parsedScenes) {
      if (!imageBySceneNumber[parsedScene.number]) {
        warnings.push(`Escena ${parsedScene.number} sin imagen`);
      }
    }

    // Store warnings for UI
    sceneAssignments = { orderedScenes, warnings };

    // Compute durations from scene markers
    if (orderedScenes.length > 0) {
      durations = [];
      for (let i = 0; i < orderedScenes.length; i++) {
        const scene = orderedScenes[i];
        const nextScene = orderedScenes[i + 1];
        let dur;
        if (scene.end !== null && scene.start !== null) {
          dur = scene.end - scene.start;
        } else if (nextScene && nextScene.start !== null) {
          dur = nextScene.start - scene.start;
        } else {
          // Last scene: fill to audio duration
          const usedSoFar = durations.reduce((a, b) => a + b, 0);
          dur = audioDuration - usedSoFar;
        }
        durations.push(Math.max(0.1, dur));
      }
    }
  } else {
    // Fallback to old timestamp-based parsing
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
  }

  if (Object.keys(sceneDurationOverrides).length > 0) {
    durations = applyOverrides(durations, sceneDurationOverrides, audioDuration);
  }

  validateSceneDurations(durations, transitionDuration);

  // Build final scenes array
  const scenes = [];
  const totalSceneCount = useSceneMarkers && sceneAssignments ? sceneAssignments.orderedScenes.length : N;

  for (let i = 0; i < totalSceneCount; i++) {
    const start = i === 0 ? 0 : scenes[i - 1].end;
    const transitionCompensation = (i < totalSceneCount - 1) ? transitionDuration : 0;
    const end = start + durations[i] + transitionCompensation;

    let imageObj, file, isVideo, zoomStyle, transitionType, zoomIntensity, focus;

    if (useSceneMarkers && sceneAssignments) {
      const assigned = sceneAssignments.orderedScenes[i];
      imageObj = assigned.image;
      file = imageObj.file;
      isVideo = file.toLowerCase().endsWith('.mp4');
      zoomStyle = (isVideo ? 'none' : selectStyle(config.zoom.styles, config.zoom.mode, i));
      transitionType = (i < totalSceneCount - 1 ? selectTransitionType(config.transition.types, config.transition.mode, i) : 'cut');
      zoomIntensity = 'normal';
      focus = imageObj.focus || { x: 0.5, y: 0.5 };
    } else {
      imageObj = typeof images[i] === 'string' ? { file: images[i] } : images[i];
      file = imageObj.file;
      isVideo = file.toLowerCase().endsWith('.mp4');
      const sceneOverride = sceneOverrides[i.toString()];
      zoomStyle = sceneOverride?.zoom || (isVideo ? 'none' : selectStyle(config.zoom.styles, config.zoom.mode, i));
      transitionType = sceneOverride?.transition || (i < totalSceneCount - 1 ? selectTransitionType(config.transition.types, config.transition.mode, i) : 'cut');
      zoomIntensity = sceneOverride?.zoomIntensity || 'normal';
      focus = imageObj.focus || { x: 0.5, y: 0.5 };
    }

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
      focus
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
    fitApplied: config.fitTimesToAudio && script && hasTimestamps(script),
    sceneAssignments: useSceneMarkers ? sceneAssignments : null
  };
}

module.exports = { buildTimeline, mulberry32, selectStyle, selectTransitionType };