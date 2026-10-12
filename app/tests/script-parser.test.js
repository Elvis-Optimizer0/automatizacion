import { describe, it, expect } from 'vitest';
import { parseScript, hasTimestamps, parseScenes, imageSceneNumber, parseTimeToSeconds } from '../core/script-parser.js';

describe('script-parser', () => {
  describe('parseScript', () => {
    it('parses timestamps with parentheses', () => {
      const script = '(0:00) Primera escena\n(0:05) Segunda escena\n(0:10) Tercera escena';
      const result = parseScript(script);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ index: 0, startSec: 0, text: 'Primera escena' });
      expect(result[1]).toEqual({ index: 1, startSec: 5, text: 'Segunda escena' });
      expect(result[2]).toEqual({ index: 2, startSec: 10, text: 'Tercera escena' });
    });

    it('parses timestamps without parentheses', () => {
      const script = '0:00 Primera\n0:04 Segunda\n0:08 Tercera';
      const result = parseScript(script);
      expect(result).toHaveLength(3);
      expect(result[0].startSec).toBe(0);
      expect(result[1].startSec).toBe(4);
      expect(result[2].startSec).toBe(8);
    });

    it('forces first timestamp to 0', () => {
      const script = '(0:05) Primera\n(0:10) Segunda';
      const result = parseScript(script);
      expect(result[0].startSec).toBe(0);
    });

    it('handles lines without timestamps', () => {
      const script = 'Línea 1\nLínea 2\nLínea 3';
      const result = parseScript(script);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ index: 0, startSec: null, text: 'Línea 1' });
      expect(result[1]).toEqual({ index: 1, startSec: null, text: 'Línea 2' });
      expect(result[2]).toEqual({ index: 2, startSec: null, text: 'Línea 3' });
    });

    it('throws on non-increasing timestamps', () => {
      const script = '(0:10) Primera\n(0:05) Segunda';
      expect(() => parseScript(script)).toThrow('E_TIMESTAMP_ORDER');
    });

    it('handles empty script', () => {
      const result = parseScript('');
      expect(result).toHaveLength(0);
    });

    it('handles whitespace only', () => {
      const result = parseScript('   \n  \n ');
      expect(result).toHaveLength(0);
    });

    it('normalizes line endings', () => {
      const script = '(0:00) Primera\r\n(0:05) Segunda\r(0:10) Tercera';
      const result = parseScript(script);
      expect(result).toHaveLength(3);
    });
  });

  describe('hasTimestamps', () => {
    it('returns true for timestamps with parentheses', () => {
      expect(hasTimestamps('(0:00) Texto')).toBe(true);
    });

    it('returns true for timestamps without parentheses', () => {
      expect(hasTimestamps('0:00 Texto')).toBe(true);
    });

    it('returns false for no timestamps', () => {
      expect(hasTimestamps('Solo texto')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(hasTimestamps('')).toBe(false);
    });
  });

  describe('parseTimeToSeconds', () => {
    it('parses mm:ss', () => {
      expect(parseTimeToSeconds('0:30')).toBe(30);
      expect(parseTimeToSeconds('1:30')).toBe(90);
      expect(parseTimeToSeconds('10:05')).toBe(605);
    });

    it('parses hh:mm:ss', () => {
      expect(parseTimeToSeconds('1:00:30')).toBe(3630);
      expect(parseTimeToSeconds('0:05:30')).toBe(330);
    });

    it('parses with decimals', () => {
      expect(parseTimeToSeconds('0:30.5')).toBe(30.5);
      expect(parseTimeToSeconds('1:30.25')).toBe(90.25);
    });
  });

  describe('imageSceneNumber', () => {
    it('extracts number from escena1.jpg', () => {
      expect(imageSceneNumber('escena1.jpg')).toBe(1);
    });

    it('extracts number from escena10.png', () => {
      expect(imageSceneNumber('escena10.png')).toBe(10);
    });

    it('extracts number from Escena_2.webp', () => {
      expect(imageSceneNumber('Escena_2.webp')).toBe(2);
    });

    it('extracts number from escena 3.jpg', () => {
      expect(imageSceneNumber('escena 3.jpg')).toBe(3);
    });

    it('extracts number from ESCENA4.png', () => {
      expect(imageSceneNumber('ESCENA4.png')).toBe(4);
    });

    it('returns null for files without escena prefix', () => {
      expect(imageSceneNumber('imagen1.jpg')).toBeNull();
      expect(imageSceneNumber('photo.png')).toBeNull();
      expect(imageSceneNumber('video.mp4')).toBeNull();
    });

    it('handles escena with leading zeros', () => {
      expect(imageSceneNumber('escena01.jpg')).toBe(1);
      expect(imageSceneNumber('escena001.png')).toBe(1);
    });
  });

  describe('parseScenes', () => {
    it('parses [Escena 1] 0:00 - 0:30 format', () => {
      const script = '[Escena 1] 0:00 - 0:30 Primera escena\n[Escena 2] 0:30 - 1:00 Segunda escena';
      const result = parseScenes(script);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ number: 1, start: 0, end: 30, text: 'Primera escena' });
      expect(result[1]).toEqual({ number: 2, start: 30, end: 60, text: 'Segunda escena' });
    });

    it('parses (Escena 1: 0:00 a 0:30) format', () => {
      const script = '(Escena 1: 0:00 a 0:30) Primera\n(Escena 2: 0:30 a 1:00) Segunda';
      const result = parseScenes(script);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ number: 1, start: 0, end: 30, text: 'Primera' });
      expect(result[1]).toEqual({ number: 2, start: 30, end: 60, text: 'Segunda' });
    });

    it('parses [ESCENA 2] (0:30 - 1:05) format', () => {
      const script = '[ESCENA 1] (0:00 - 0:30) Primera\n[ESCENA 2] (0:30 - 1:05) Segunda';
      const result = parseScenes(script);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ number: 1, start: 0, end: 30, text: 'Primera' });
      expect(result[1]).toEqual({ number: 2, start: 30, end: 65, text: 'Segunda' });
    });

    it('parses Escena 3 de 1:05 a 1:40 format', () => {
      const script = 'Escena 1 de 0:00 a 0:30 Primera\nEscena 2 de 0:30 a 1:00 Segunda\nEscena 3 de 1:05 a 1:40 Tercera';
      const result = parseScenes(script);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ number: 1, start: 0, end: 30, text: 'Primera' });
      expect(result[1]).toEqual({ number: 2, start: 30, end: 60, text: 'Segunda' });
      expect(result[2]).toEqual({ number: 3, start: 65, end: 100, text: 'Tercera' });
    });

    it('parses mixed case and separators', () => {
      const script = '[escena 1] 0:00 - 0:30\n[ESCENA 2] 0:30 - 1:00';
      const result = parseScenes(script);
      expect(result).toHaveLength(2);
      expect(result[0].number).toBe(1);
      expect(result[1].number).toBe(2);
    });

    it('returns empty array for legacy (0:00) format', () => {
      const script = '(0:00) Primera\n(0:05) Segunda';
      const result = parseScenes(script);
      expect(result).toHaveLength(0);
    });

    it('returns empty array for text without markers', () => {
      const script = 'Solo texto sin marcadores';
      const result = parseScenes(script);
      expect(result).toHaveLength(0);
    });

    it('throws on duplicate scene numbers', () => {
      const script = '[Escena 1] 0:00 - 0:30\n[Escena 1] 0:30 - 1:00';
      expect(() => parseScenes(script)).toThrow('E_DUPLICATE_SCENE');
    });

    it('throws on overlapping scenes', () => {
      const script = '[Escena 1] 0:00 - 0:40\n[Escena 2] 0:30 - 1:00';
      expect(() => parseScenes(script)).toThrow('E_SCENE_OVERLAP');
    });

    it('allows gaps between scenes (UI will warn)', () => {
      const script = '[Escena 1] 0:00 - 0:30\n[Escena 2] 0:35 - 1:00';
      const result = parseScenes(script);
      expect(result).toHaveLength(2);
    });

    it('sorts scenes by number not order in script', () => {
      const script = '[Escena 3] 1:00 - 1:30\n[Escena 1] 0:00 - 0:30\n[Escena 2] 0:30 - 1:00';
      const result = parseScenes(script);
      expect(result.map(s => s.number)).toEqual([1, 2, 3]);
      expect(result[0].start).toBe(0);
      expect(result[1].start).toBe(30);
      expect(result[2].start).toBe(60);
    });

    it('handles scene without end time (last scene)', () => {
      const script = '[Escena 1] 0:00 - 0:30\n[Escena 2] 0:30 - 1:00\n[Escena 3] 1:00 - 1:30 Texto final';
      const result = parseScenes(script);
      expect(result).toHaveLength(3);
      expect(result[2].end).toBe(90);
    });
  });
});