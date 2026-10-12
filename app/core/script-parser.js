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

  // Find all scene markers with their positions in the original text
  const sceneMarkers = [];
  let markerMatch;
  while ((markerMatch = SCENE_MARKER_REGEX.exec(fullText)) !== null) {
    const sceneNumber = parseInt(markerMatch[1] || markerMatch[2], 10);
    const markerStart = markerMatch.index;
    const markerEnd = markerMatch.index + markerMatch[0].length;
    sceneMarkers.push({ number: sceneNumber, markerStart, markerEnd });
  }

  if (sceneMarkers.length === 0) {
    // No scene markers found, fall back to old timestamp-only parser
    return [];
  }

  // Sort markers by position in text to extract text correctly
  sceneMarkers.sort((a, b) => a.markerStart - b.markerStart);

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

    // Extract text between this marker and the next (by position in text)
    const textStart = marker.markerEnd;
    const textEnd = nextMarker ? nextMarker.markerStart : fullText.length;
    let text = fullText.slice(textStart, textEnd).trim();

    // Find time range in the text (e.g., "0:00 - 0:30", "0:00 a 0:30")
    let start = null;
    let end = null;

    // FIRST: Check for timestamps in brackets like (0:30 - 1:05) or (0:00 a 0:30)
    const bracketRangeMatch = text.match(/\((\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)\s*[-–—aA]\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)\)/);
    if (bracketRangeMatch) {
      start = parseTimeToSeconds(bracketRangeMatch[1]);
      end = parseTimeToSeconds(bracketRangeMatch[2]);
      hasValidTimeRange = true;
      // Remove the bracketed time range from text
      text = text.replace(bracketRangeMatch[0], '').trim();
    } else {
      // Check for "de" keyword format: "Escena 1 de 0:00 a 0:30"
      const deMatch = text.match(/de\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)\s*a\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)/i);
      if (deMatch) {
        start = parseTimeToSeconds(deMatch[1]);
        end = parseTimeToSeconds(deMatch[2]);
        hasValidTimeRange = true;
        text = text.replace(deMatch[0], '').trim();
      } else {
        // Check for explicit range patterns like "0:00 - 0:30" or "0:00 a 0:30"
        const rangeMatch = text.match(/(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)\s*[-–—aA]\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)/);
        if (rangeMatch) {
          start = parseTimeToSeconds(rangeMatch[1]);
          end = parseTimeToSeconds(rangeMatch[2]);
          hasValidTimeRange = true;
          // Remove the time range from text
          text = text.replace(rangeMatch[0], '').trim();
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
    }

    scenes.push({
      number: marker.number,
      start,
      end,
      // Clean up text: remove leading/trailing brackets, parentheses, colons
      text: text.replace(/^[\s\)\]\:]+/, '').replace(/[\s\(\[\:]+$/, '').trim()
    });
  }

  // If no valid time ranges found, fall back to old parser
  if (!hasValidTimeRange) {
    return [];
  }

  // Sort scenes by scene number for output
  scenes.sort((a, b) => a.number - b.number);

  // Validate: check for overlapping ranges (only when both times are explicitly defined)
  // Gap validation removed - gaps are allowed, UI will show warning
  for (let i = 0; i < scenes.length - 1; i++) {
    if (scenes[i].end !== null && scenes[i + 1].start !== null) {
      if (scenes[i].end > scenes[i + 1].start) {
        throw new Error(`E_SCENE_OVERLAP: Escena ${scenes[i].number} y ${scenes[i + 1].number} se solapan`);
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