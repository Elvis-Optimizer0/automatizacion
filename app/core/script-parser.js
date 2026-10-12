const TIMESTAMP_REGEX = /\(?(\d{1,2}):(\d{2})\)?/g;
const TIMESTAMP_REGEX_NO_GLOBAL = /\(?(\d{1,2}):(\d{2})\)?/;
// Scene marker regex: [Escena 1] 0:00 - 0:30, (Escena 1: 0:00 a 0:30), [ESCENA 2] (0:30 - 1:05), Escena 3 de 1:05 a 1:40
// More specific: requires brackets, parentheses with colon, or "de" keyword
const SCENE_MARKER_REGEX = /(?:[\[\(]\s*(?:escena\s*)(\d+)\s*[\]\):]|\b(?:escena\s*)(\d+)\s+de)/gi;
// Time range regex: 0:00 - 0:30, 0:00 a 0:30, (0:30 - 1:05), de 1:05 a 1:40
const TIME_RANGE_REGEX = /(?:[-–—]\s*|(?:a|hasta|to)\s+)(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)/gi;
const TIMESTAMP_ONLY_REGEX = /(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)/g;

function parseTimeToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(p => parseFloat(p));
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

function imageSceneNumber(fileName) {
  if (!fileName) return null;
  const base = fileName.replace(/\.[^.]+$/, '');
  // Match "escena" + number, case insensitive, with optional separators
  const match = base.match(/escena[\s_\-]*(\d+)/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

function parseScenes(scriptText) {
  if (!scriptText || !scriptText.trim()) {
    return [];
  }

  const normalized = scriptText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const fullText = normalized;

  // Find all scene markers with their positions
  const sceneMarkers = [];
  let markerMatch;
  while ((markerMatch = SCENE_MARKER_REGEX.exec(fullText)) !== null) {
    // markerMatch[1] is from first group (brackets/parens), markerMatch[2] from second group ("de" keyword)
    const sceneNumber = parseInt(markerMatch[1] || markerMatch[2], 10);
    const markerEnd = markerMatch.index + markerMatch[0].length;
    sceneMarkers.push({ number: sceneNumber, markerEnd });
  }

  if (sceneMarkers.length === 0) {
    // No scene markers found, fall back to old timestamp-only parser
    return [];
  }

  // Sort by scene number
  sceneMarkers.sort((a, b) => a.number - b.number);

  // Check for duplicate scene numbers
  const seenNumbers = new Set();
  for (const m of sceneMarkers) {
    if (seenNumbers.has(m.number)) {
      throw new Error(`E_DUPLICATE_SCENE: Número de escena duplicado: ${m.number}`);
    }
    seenNumbers.add(m.number);
  }

  const scenes = [];
  let hasValidTimeRange = false;
  for (let i = 0; i < sceneMarkers.length; i++) {
    const marker = sceneMarkers[i];
    const nextMarker = sceneMarkers[i + 1];

    // Extract text between this marker and the next
    const textStart = marker.markerEnd;
    const textEnd = nextMarker ? nextMarker.markerEnd : fullText.length;
    const text = fullText.slice(textStart, textEnd).trim();

    // Find time range in the text (e.g., "0:00 - 0:30", "0:00 a 0:30")
    let start = null;
    let end = null;

    // Check for explicit range patterns like "0:00 - 0:30" or "0:00 a 0:30"
    const rangeMatch = text.match(/(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)\s*[-–—aA]\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)/);
    if (rangeMatch) {
      start = parseTimeToSeconds(rangeMatch[1]);
      end = parseTimeToSeconds(rangeMatch[2]);
      hasValidTimeRange = true;
    } else {
      // Also check for timestamps in brackets like (0:30 - 1:05)
      const bracketRangeMatch = text.match(/\((\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)\s*[-–—]\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)\)/);
      if (bracketRangeMatch) {
        start = parseTimeToSeconds(bracketRangeMatch[1]);
        end = parseTimeToSeconds(bracketRangeMatch[2]);
        hasValidTimeRange = true;
      } else {
        // Look for individual timestamps as fallback
        const timeMatches = [...text.matchAll(TIMESTAMP_ONLY_REGEX)];
        if (timeMatches.length >= 1) {
          start = parseTimeToSeconds(timeMatches[0][1]);
        }
        if (timeMatches.length >= 2) {
          end = parseTimeToSeconds(timeMatches[1][1]);
        }
      }
    }

    scenes.push({
      number: marker.number,
      start,
      end,
      text
    });
  }

  // If no valid time ranges found, fall back to old parser
  if (!hasValidTimeRange) {
    return [];
  }

  // Validate: check for overlapping or gap ranges
  for (let i = 0; i < scenes.length - 1; i++) {
    if (scenes[i].end !== null && scenes[i + 1].start !== null) {
      if (scenes[i].end > scenes[i + 1].start) {
        throw new Error(`E_SCENE_OVERLAP: Escena ${scenes[i].number} y ${scenes[i + 1].number} se solapan`);
      }
      if (scenes[i].end < scenes[i + 1].start - 1) {
        // Gap > 1 second
        throw new Error(`E_SCENE_GAP: Hueco entre escena ${scenes[i].number} y ${scenes[i + 1].number}`);
      }
    }
  }

  return scenes;
}

function parseScript(scriptText) {
  if (!scriptText || !scriptText.trim()) {
    return [];
  }

  const normalized = scriptText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const fullText = lines.join('\n');
  const matches = [...fullText.matchAll(TIMESTAMP_REGEX)];

  if (matches.length === 0) {
    return lines.map((line, index) => ({
      index,
      startSec: null,
      text: line
    }));
  }

  const segments = [];
  let lastEnd = 0;

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

    if (startSec < lastEnd) {
      throw new Error('E_TIMESTAMP_ORDER: Los timestamps deben ser estrictamente crecientes');
    }

    segments.push({
      index: segments.length,
      startSec,
      text
    });
    lastEnd = startSec;
  }

  segments[0].startSec = 0;

  return segments;
}

function hasTimestamps(scriptText) {
  if (!scriptText) return false;
  return TIMESTAMP_REGEX_NO_GLOBAL.test(scriptText);
}

module.exports = { parseScript, hasTimestamps, TIMESTAMP_REGEX, parseScenes, imageSceneNumber, parseTimeToSeconds };