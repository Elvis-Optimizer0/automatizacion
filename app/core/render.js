const { spawn } = require('child_process');
const path = require('path');
const { getFfmpegPath, getFfprobePath } = require('./binaries');
const { buildFfmpegArgs, buildOutputConfigs, generateOutputFilename } = require('./ffmpeg-builder');

function getAudioDuration(audioPath) {
  return new Promise((resolve, reject) => {
    const ffprobe = getFfprobePath();
    const args = [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      audioPath
    ];

    const proc = spawn(ffprobe, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => stdout += data.toString());
    proc.stderr.on('data', data => stderr += data.toString());

    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(`E_FFMPEG_MISSING: ffprobe falló: ${stderr}`));
        return;
      }
      const duration = parseFloat(stdout.trim());
      if (isNaN(duration)) {
        reject(new Error(`E_FFMPEG_MISSING: No se pudo obtener duración de ${audioPath}`));
        return;
      }
      resolve(duration);
    });

    proc.on('error', err => {
      reject(new Error(`E_FFMPEG_MISSING: ffprobe no encontrado: ${err.message}`));
    });
  });
}

function renderVideo(project, timeline, fontPath, outputPath, onProgress) {
  const outputConfigs = buildOutputConfigs(project.config);
  const outputConfig = outputConfigs[0] || { w: 1080, h: 1920, resolution: '9:16' };
  
  return new Promise((resolve, reject) => {
    const args = buildFfmpegArgs(project, timeline, fontPath, outputPath, outputConfig);
    const ffmpeg = getFfmpegPath();

    const proc = spawn(ffmpeg, args, { windowsHide: true });

    let stderr = '';
    let lastProgress = 0;

    proc.stdout.on('data', data => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('out_time_ms=')) {
          const ms = parseInt(line.split('=')[1], 10);
          if (!isNaN(ms) && timeline.audioDuration > 0) {
            const progress = Math.min(100, (ms / 1000) / timeline.audioDuration * 100);
            if (progress !== lastProgress && onProgress) {
              lastProgress = progress;
              onProgress(progress, ms / 1e6, timeline.audioDuration);
            }
          }
        } else if (line.startsWith('progress=')) {
          if (line.includes('end') && onProgress) {
            onProgress(100, timeline.audioDuration, timeline.audioDuration);
          }
        }
      }
    });

    proc.stderr.on('data', data => {
      stderr += data.toString();
    });

    proc.on('close', code => {
      if (code !== 0) {
        const stderrLines = stderr.trim().split('\n');
        const lastLines = stderrLines.slice(-15).join('\n');
        reject(new Error(`E_FFMPEG_FAILED: FFmpeg falló (código ${code}):\n${lastLines}`));
        return;
      }
      resolve({ success: true, outputPath });
    });

    proc.on('error', err => {
      reject(new Error(`E_FFMPEG_MISSING: FFmpeg no encontrado: ${err.message}`));
    });
  });
}

function renderPreview(project, timeline, fontPath, outputPath, onProgress) {
  const outputConfig = buildOutputConfigs(project.config)[0] || { w: 1080, h: 1920, resolution: '9:16' };
  const previewProject = {
    ...project,
    config: {
      ...project.config,
      outputs: [project.config.outputs[0]]
    }
  };

  const previewTimeline = {
    ...timeline,
    scenes: timeline.scenes.map(s => ({
      ...s,
      duration: Math.min(s.duration, 10)
    }))
  };

  const args = buildFfmpegArgs(previewProject, previewTimeline, fontPath, outputPath, outputConfig);
  const ffmpeg = getFfmpegPath();

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpeg, args.map(a => a === 'medium' ? 'ultrafast' : a === '20' ? '28' : a), { windowsHide: true });

    let stderr = '';

    proc.stdout.on('data', data => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('out_time_ms=') && onProgress) {
          const ms = parseInt(line.split('=')[1], 10);
          if (!isNaN(ms) && timeline.audioDuration > 0) {
            const progress = Math.min(100, (ms / 1000) / timeline.audioDuration * 100);
            onProgress(progress);
          }
        }
      }
    });

    proc.stderr.on('data', data => {
      stderr += data.toString();
    });

    proc.on('close', code => {
      if (code !== 0) {
        const stderrLines = stderr.trim().split('\n');
        const lastLines = stderrLines.slice(-15).join('\n');
        reject(new Error(`E_FFMPEG_FAILED: FFmpeg falló (código ${code}):\n${lastLines}`));
        return;
      }
      resolve({ success: true, outputPath });
    });

    proc.on('error', err => {
      reject(new Error(`E_FFMPEG_MISSING: FFmpeg no encontrado: ${err.message}`));
    });
  });
}

function validateInputPaths(project) {
  const fs = require('fs');
  const path = require('path');
  
  const inputs = [];
  
  // Imágenes
  for (let i = 0; i < project.images.length; i++) {
    const img = project.images[i];
    if (!img.path || !path.isAbsolute(img.path) || !require('fs').existsSync(img.path)) {
      throw new Error(`E_INPUT_MISSING: Imagen ${i} ("${img.file}") sin ruta absoluta válida: ${img.path}`);
    }
    inputs.push({ type: 'imagen', file: img.file, path: img.path });
  }
  
  // Narración
  if (!project.narration?.path || !path.isAbsolute(project.narration.path) || !require('fs').existsSync(project.narration.path)) {
    throw new Error(`E_INPUT_MISSING: Narración sin ruta absoluta válida: ${project.narration?.path}`);
  }
  inputs.push({ type: 'narración', file: project.narration.file, path: project.narration.path });
  
  // Música
  if (project.music && project.music.path) {
    if (!path.isAbsolute(project.music.path) || !require('fs').existsSync(project.music.path)) {
      throw new Error(`E_INPUT_MISSING: Música "${project.music.file}" sin ruta absoluta válida: ${project.music.path}`);
    }
    inputs.push({ type: 'música', file: project.music.file, path: project.music.path });
  }
  
  // Badges
  if (Array.isArray(project.config?.badges)) {
    for (let i = 0; i < project.config.badges.length; i++) {
      const badge = project.config.badges[i];
      if (badge.path && (!path.isAbsolute(badge.path) || !require('fs').existsSync(badge.path))) {
        throw new Error(`E_INPUT_MISSING: Badge ${i} ("${badge.file}") sin ruta absoluta válida: ${badge.path}`);
      }
    }
  }
  
  console.log('[renderAllOutputs] inputs validados:', JSON.stringify(inputs, null, 2));
}

async function renderAllOutputs(project, timeline, fontPath, outputDir, onProgress) {
  // Validar rutas antes de lanzar ffmpeg
  validateInputPaths(project);
  
  const outputConfigs = buildOutputConfigs(project.config);
  console.log('[renderAllOutputs] project.config.outputs:', JSON.stringify(project.config.outputs));
  console.log('[renderAllOutputs] outputConfigs:', JSON.stringify(outputConfigs));
  const baseName = path.basename(project.narration, path.extname(project.narration));
  const results = [];
  const errors = [];
  const existingFiles = [];

  for (let i = 0; i < outputConfigs.length; i++) {
    const outputConfig = outputConfigs[i];
    const filename = generateOutputFilename(baseName, outputConfig, existingFiles);
    const outputPath = path.join(outputDir, filename);
    existingFiles.push(filename);

    const progressCallback = onProgress ? (progress, current, total) => {
      const globalProgress = ((i + progress / 100) / outputConfigs.length) * 100;
      onProgress(globalProgress, current, total, i + 1, outputConfigs.length, outputConfig.resolution);
    } : null;

    try {
      const result = await renderVideoForOutput(project, timeline, fontPath, outputPath, outputConfig, progressCallback);
      results.push({ ...result, resolution: outputConfig.resolution, filename });
      existingFiles.push(filename);
    } catch (err) {
      errors.push({ resolution: outputConfig.resolution, error: err.message });
    }
  }

  return { results, errors };
}

function renderVideoForOutput(project, timeline, fontPath, outputPath, outputConfig, onProgress) {
  return new Promise((resolve, reject) => {
    const args = buildFfmpegArgs(project, timeline, fontPath, outputPath, outputConfig);
    const ffmpeg = getFfmpegPath();

    const proc = spawn(ffmpeg, args, { windowsHide: true });

    let stderr = '';
    let lastProgress = 0;

    proc.stdout.on('data', data => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('out_time_ms=')) {
          const ms = parseInt(line.split('=')[1], 10);
          if (!isNaN(ms) && timeline.audioDuration > 0) {
            const progress = Math.min(100, (ms / 1000) / timeline.audioDuration * 100);
            if (progress !== lastProgress && onProgress) {
              lastProgress = progress;
              onProgress(progress, ms / 1e6, timeline.audioDuration);
            }
          }
        } else if (line.startsWith('progress=')) {
          if (line.includes('end') && onProgress) {
            onProgress(100, timeline.audioDuration, timeline.audioDuration);
          }
        }
      }
    });

    proc.stderr.on('data', data => {
      stderr += data.toString();
    });

    proc.on('close', code => {
      if (code !== 0) {
        const stderrLines = stderr.trim().split('\n');
        const lastLines = stderrLines.slice(-15).join('\n');
        reject(new Error(`E_FFMPEG_FAILED: FFmpeg falló (código ${code}):\n${lastLines}`));
        return;
      }
      resolve({ success: true, outputPath });
    });

    proc.on('error', err => {
      reject(new Error(`E_FFMPEG_MISSING: FFmpeg no encontrado: ${err.message}`));
    });
  });
}

module.exports = { renderVideo, renderPreview, getAudioDuration, renderAllOutputs, renderVideoForOutput };