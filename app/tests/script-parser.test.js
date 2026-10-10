import { describe, it, expect } from 'vitest';
import { parseScript, hasTimestamps } from '../core/script-parser.js';

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
});