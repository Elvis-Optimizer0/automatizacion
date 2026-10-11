const path = require('path');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');

let ffmpegPathCache = null;
let ffprobePathCache = null;

function getApp() {
  try {
    return require('electron').app;
  } catch {
    return null;
  }
}

function getUnpackedPath(packedPath) {
  const app = getApp();
  if (!app || !app.isPackaged) return packedPath;
  return packedPath.replace('app.asar', 'app.asar.unpacked');
}

function getFfmpegPath() {
  if (ffmpegPathCache) return ffmpegPathCache;
  const packedPath = typeof ffmpegStatic === 'string' ? ffmpegStatic : ffmpegStatic.path;
  ffmpegPathCache = getUnpackedPath(packedPath);
  return ffmpegPathCache;
}

function getFfprobePath() {
  if (ffprobePathCache) return ffprobePathCache;
  const packedPath = typeof ffprobeStatic === 'string' ? ffprobeStatic : ffprobeStatic.path;
  ffprobePathCache = getUnpackedPath(packedPath);
  return ffprobePathCache;
}

function verifyBinaries() {
  const fs = require('fs');
  const ffmpeg = getFfmpegPath();
  const ffprobe = getFfprobePath();

  if (!fs.existsSync(ffmpeg)) {
    throw new Error(`E_FFMPEG_MISSING: FFmpeg no encontrado en ${ffmpeg}`);
  }
  if (!fs.existsSync(ffprobe)) {
    throw new Error(`E_FFMPEG_MISSING: FFprobe no encontrado en ${ffprobe}`);
  }
  return { ffmpeg, ffprobe };
}

module.exports = { getFfmpegPath, getFfprobePath, verifyBinaries };