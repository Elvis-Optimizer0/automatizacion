const fs = require('fs');
const path = require('path');
const os = require('os');

// Resolve font path with asar support (same logic as fixAsarPath in binaries.js)
function resolveFontPath(fontName) {
  const candidatePaths = [
    // Development paths
    path.join(__dirname, '..', 'assets', 'fonts', fontName),
    path.join(__dirname, '..', '..', 'assets', 'fonts', fontName),
    path.join(process.cwd(), 'app', 'assets', 'fonts', fontName),
    path.join(process.cwd(), 'assets', 'fonts', fontName),
  ];

  // Packaged (asar) paths - only add if resourcesPath exists
  if (process.resourcesPath) {
    candidatePaths.push(
      path.join(process.resourcesPath, 'app', 'assets', 'fonts', fontName),
      path.join(process.resourcesPath, 'app.asar.unpacked', 'app', 'assets', 'fonts', fontName)
    );
  }

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

// Get font path with fallback to DejaVuSans-Bold.ttf
function getSubtitleFontPath() {
  // Try Montserrat Bold first
  const montserratBold = resolveFontPath('Montserrat-Bold.ttf');
  if (montserratBold) return montserratBold;
  
  // Fallback to DejaVuSans-Bold.ttf (always available)
  const dejavuBold = resolveFontPath('DejaVuSans-Bold.ttf');
  if (dejavuBold) return dejavuBold;
  
  // Last resort: empty string (will cause ASS to use system default)
  return '';
}

function escapeAssText(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}')
    .replace(/\n/g, '\\N');
}

function splitIntoPhrases(text, maxChars = 42, maxLines = 2) {
  const words = text.trim().split(/\s+/);
  const phrases = [];
  let currentPhrase = '';
  let currentLines = 1;

  for (const word of words) {
    const testPhrase = currentPhrase ? `${currentPhrase} ${word}` : word;
    
    if (testPhrase.length > maxChars && currentPhrase) {
      phrases.push(currentPhrase);
      currentPhrase = word;
      currentLines = 1;
    } else {
      currentPhrase = testPhrase;
      // Count lines (rough estimate based on chars)
      currentLines = Math.ceil(currentPhrase.length / maxChars);
      if (currentLines > maxLines && currentPhrase !== word) {
        phrases.push(currentPhrase.slice(0, -word.length - 1).trim());
        currentPhrase = word;
        currentLines = 1;
      }
    }
  }
  
  if (currentPhrase) {
    phrases.push(currentPhrase);
  }
  
  return phrases.filter(p => p.length > 0);
}

function generateSubtitles(scriptText, scenes, config) {
  if (!scriptText || !scriptText.trim()) {
    return { assContent: '', cues: [] };
  }

  const normalized = scriptText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const fullText = normalized;

  // Parse script into segments with timestamps
  const TIMESTAMP_REGEX = /\(?(\d{1,2}):(\d{2})\)?/g;
  const matches = [...fullText.matchAll(TIMESTAMP_REGEX)];
  
  if (matches.length === 0) {
    return { assContent: '', cues: [] };
  }

  const segments = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const startSec = minutes * 60 + seconds;
    const timestampStr = match[0];
    const timestampIndex = match.index;

    const textStart = timestampIndex + timestampStr.length;
    const textEnd = i < matches.length - 1 ? matches[i + 1].index : fullText.length;
    const text = fullText.slice(textStart, textEnd).trim();

    segments.push({
      index: i,
      startSec,
      text
    });
  }
  segments[0].startSec = 0;

  // Distribute text to scenes based on timing
  const cues = [];
  const fontSizeHorizontal = config.subtitleFontSizeHorizontal || 48;
  const fontSizeVertical = config.subtitleFontSizeVertical || 64;
  const isVertical = config.resolution === '9:16';
  const fontSize = isVertical ? fontSizeVertical : fontSizeHorizontal;

  let segmentIndex = 0;
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const sceneStart = scene.start;
    const sceneEnd = scene.end;
    const sceneDuration = sceneEnd - sceneStart;

    if (sceneDuration <= 0) continue;

    // Find segments that fall within this scene
    const sceneSegments = [];
    while (segmentIndex < segments.length) {
      const seg = segments[segmentIndex];
      const nextSeg = segments[segmentIndex + 1];
      const segEnd = nextSeg ? nextSeg.startSec : sceneEnd;
      
      // Check if segment overlaps with scene
      if (seg.startSec < sceneEnd && segEnd > sceneStart) {
        sceneSegments.push({
          text: seg.text,
          start: Math.max(seg.startSec, sceneStart),
          end: Math.min(segEnd, sceneEnd)
        });
        if (segEnd >= sceneEnd) break;
      } else if (seg.startSec >= sceneEnd) {
        break;
      }
      segmentIndex++;
    }

    if (sceneSegments.length === 0) continue;

    // Combine text for this scene
    const combinedText = sceneSegments.map(s => s.text).join(' ');
    const phrases = splitIntoPhrases(combinedText);

    if (phrases.length === 0) continue;

    // Distribute time proportionally to phrase lengths
    const totalChars = phrases.reduce((sum, p) => sum + p.length, 0);
    let currentTime = sceneStart;

    for (let j = 0; j < phrases.length; j++) {
      const phrase = phrases[j];
      const phraseDuration = (phrase.length / totalChars) * sceneDuration;
      const phraseStart = currentTime;
      const phraseEnd = Math.min(currentTime + phraseDuration, sceneEnd);
      
      if (phraseEnd > phraseStart + 0.1) { // Minimum 0.1s
        cues.push({
          start: phraseStart,
          end: phraseEnd,
          text: phrase,
          fontSize,
          alignment: 2 // bottom-center
        });
        currentTime = phraseEnd;
      }
    }
  }

  // Generate ASS content
  const fontPath = getSubtitleFontPath();
  const fontName = fontPath ? path.basename(fontPath, '.ttf') : 'Montserrat';
  const assHeader = `[Script Info]
Title: Video Maker Subtitles
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const assEvents = cues.map(cue => {
    const start = formatAssTime(cue.start);
    const end = formatAssTime(cue.end);
    const text = escapeAssText(cue.text);
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
  }).join('\n');

  return {
    assContent: assHeader + assEvents,
    cues
  };
}

function formatAssTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

function writeAssFile(assContent, outputDir) {
  const tempDir = path.join(os.tmpdir(), 'video-maker-subtitles');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const filename = `subs_${Date.now()}.ass`;
  const filepath = path.join(tempDir, filename);
  fs.writeFileSync(filepath, assContent, 'utf8');
  return filepath;
}

function escapeAssPath(filepath) {
  // Escape for ffmpeg subtitles filter on Windows
  return filepath
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'");
}

module.exports = {
  generateSubtitles,
  writeAssFile,
  escapeAssPath,
  splitIntoPhrases,
  formatAssTime
};