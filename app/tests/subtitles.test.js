import { describe, it, expect } from 'vitest';
import { generateSubtitles, splitIntoPhrases, formatAssTime, writeAssFile, escapeAssPath } from '../core/subtitles.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('subtitles', () => {
  describe('splitIntoPhrases', () => {
    it('splits long text into phrases', () => {
      const text = 'Esta es una frase muy larga que necesita ser dividida en partes más pequeñas';
      const phrases = splitIntoPhrases(text, 20, 2);
      expect(phrases.length).toBeGreaterThan(1);
      expect(phrases.every(p => p.length <= 20)).toBe(true);
    });

    it('handles short text', () => {
      const text = 'Hola mundo';
      const phrases = splitIntoPhrases(text, 42, 2);
      expect(phrases).toEqual(['Hola mundo']);
    });

    it('handles empty text', () => {
      const phrases = splitIntoPhrases('', 42, 2);
      expect(phrases).toEqual([]);
    });
  });

  describe('formatAssTime', () => {
    it('formats seconds to ASS time', () => {
      expect(formatAssTime(0)).toBe('0:00:00.00');
      expect(formatAssTime(1.5)).toBe('0:00:01.50');
      expect(formatAssTime(65)).toBe('0:01:05.00');
      expect(formatAssTime(3661.25)).toBe('1:01:01.25');
    });
  });

  describe('generateSubtitles', () => {
    it('returns empty for no script', () => {
      const result = generateSubtitles('', [], {});
      expect(result.assContent).toBe('');
      expect(result.cues).toEqual([]);
    });

    it('generates subtitles from script with timestamps', () => {
      const script = '(0:00) Primera escena\n(0:05) Segunda escena más larga\n(0:10) Tercera';
      const scenes = [
        { start: 0, end: 5 },
        { start: 5, end: 10 },
        { start: 10, end: 15 }
      ];
      const config = { resolution: '16:9', subtitleFontSizeHorizontal: 48, subtitleFontSizeVertical: 64 };
      
      const result = generateSubtitles(script, scenes, config);
      expect(result.assContent).toContain('[Script Info]');
      expect(result.assContent).toContain('[V4+ Styles]');
      expect(result.assContent).toContain('[Events]');
      expect(result.cues.length).toBeGreaterThan(0);
    });

    it('uses vertical font size for 9:16', () => {
      const script = '(0:00) Test';
      const scenes = [{ start: 0, end: 5 }];
      const config = { resolution: '9:16', subtitleFontSizeHorizontal: 48, subtitleFontSizeVertical: 64 };
      
      const result = generateSubtitles(script, scenes, config);
      // ASS format has Fontsize as 3rd field in Style line
      expect(result.assContent).toContain('Montserrat,64,');
    });

    it('uses horizontal font size for 16:9', () => {
      const script = '(0:00) Test';
      const scenes = [{ start: 0, end: 5 }];
      const config = { resolution: '16:9', subtitleFontSizeHorizontal: 48, subtitleFontSizeVertical: 64 };
      
      const result = generateSubtitles(script, scenes, config);
      expect(result.assContent).toContain('Montserrat,48,');
    });
  });

  describe('writeAssFile', () => {
    it('writes ASS file to temp directory', () => {
      const content = '[Script Info]\nTitle: Test';
      const filepath = writeAssFile(content);
      expect(filepath).toContain('.ass');
      expect(fs.existsSync(filepath)).toBe(true);
      
      // Cleanup
      fs.unlinkSync(filepath);
    });

    it('creates temp directory if not exists', () => {
      const content = '[Script Info]\nTitle: Test';
      const filepath = writeAssFile(content);
      const dir = path.dirname(filepath);
      expect(fs.existsSync(dir)).toBe(true);
      
      // Cleanup
      fs.unlinkSync(filepath);
    });
  });

  describe('escapeAssPath', () => {
    it('escapes backslashes and colons for Windows', () => {
      const path = 'C:\\Users\\Test\\subs.ass';
      const escaped = escapeAssPath(path);
      expect(escaped).toBe('C\\:\\\\Users\\\\Test\\\\subs.ass');
    });

    it('escapes single quotes', () => {
      const path = "C:/path/sub's.ass";
      const escaped = escapeAssPath(path);
      expect(escaped).toBe("C\\:/path/sub\\'s.ass");
    });
  });
});