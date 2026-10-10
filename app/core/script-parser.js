const TIMESTAMP_REGEX = /\(?(\d{1,2}):(\d{2})\)?/g;
const TIMESTAMP_REGEX_NO_GLOBAL = /\(?(\d{1,2}):(\d{2})\)?/;

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

module.exports = { parseScript, hasTimestamps, TIMESTAMP_REGEX };