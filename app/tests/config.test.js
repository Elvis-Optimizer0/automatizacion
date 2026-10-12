import { describe, it, expect } from 'vitest';
import { validateProject, getDefaultConfig } from '../core/config.schema.js';

describe('config.schema', () => {
  describe('getDefaultConfig', () => {
    it('returns correct defaults', () => {
      const config = getDefaultConfig();
      expect(config.outputs).toEqual(['16:9', '9:16', '1:1']);
      expect(config.resolution).toBe('16:9');
      expect(config.fps).toBe(30);
      expect(config.imageFit).toBe('cover');
      expect(config.fitTimesToAudio).toBe(true);
      expect(config.zoom.enabled).toBe(true);
      expect(config.zoom.initialScale).toBe(1.22);
      expect(config.zoom.intensity).toBe(0.10);
      expect(config.zoom.mode).toBe('fixed');
      expect(config.zoom.styles).toEqual(['kenburns']);
      expect(config.transition.mode).toBe('fixed');
      expect(config.transition.types).toEqual(['slidedown']);
      expect(config.transition.duration).toBe(0.5);
      expect(config.badges).toEqual([]);
      expect(config.lowerThird.enabled).toBe(false);
      expect(config.progressBar.enabled).toBe(true);
      expect(config.subtitleFontSizeHorizontal).toBe(48);
      expect(config.subtitleFontSizeVertical).toBe(64);
    });
  });

describe('validateProject', () => {
    const validProject = {
      images: [{ file: 'scene1.png', path: 'C:/fake/path/scene1.png' }, { file: 'scene2.png', path: 'C:/fake/path/scene2.png' }],
      narration: { file: 'voz.mp3', path: 'C:/fake/path/voz.mp3' },
      config: {}
    };

    it('accepts valid project', () => {
      const result = validateProject(validProject);
      expect(result.images).toHaveLength(2);
      expect(result.narration.file).toBe('voz.mp3');
    });

    it('applies default config', () => {
      const result = validateProject(validProject);
      expect(result.config.outputs).toEqual(['16:9', '9:16', '1:1']);
      expect(result.config.resolution).toBe('16:9');
      expect(result.config.fps).toBe(30);
    });

    it('rejects empty images', () => {
      expect(() => validateProject({ ...validProject, images: [] })).toThrow();
    });

    it('rejects invalid image extensions', () => {
      expect(() => validateProject({ ...validProject, images: [{ file: 'scene1.gif', path: 'C:/fake/path/scene1.gif' }] })).toThrow();
    });

    it('accepts valid image extensions', () => {
      const exts = ['png', 'jpg', 'jpeg', 'webp', 'mp4'];
      exts.forEach(ext => {
        const result = validateProject({ ...validProject, images: [{ file: `scene.${ext}`, path: `C:/fake/path/scene.${ext}` }] });
        expect(result.images[0].file).toBe(`scene.${ext}`);
        expect(result.images[0].focus).toBeUndefined();
      });
    });

    it('rejects invalid narration extension', () => {
      expect(() => validateProject({ ...validProject, narration: { file: 'voz.txt', path: 'C:/fake/path/voz.txt' } })).toThrow();
    });

    it('accepts valid narration extensions', () => {
      const exts = ['mp3', 'wav', 'm4a', 'aac'];
      exts.forEach(ext => {
        const result = validateProject({ ...validProject, narration: { file: `voz.${ext}`, path: `C:/fake/path/voz.${ext}` } });
        expect(result.narration.file).toBe(`voz.${ext}`);
      });
    });

    it('accepts optional music', () => {
      const result = validateProject({
        ...validProject,
        music: { file: 'musica.mp3', path: 'C:/fake/path/musica.mp3', volume: 0.2 }
      });
      expect(result.music.volume).toBe(0.2);
    });

    it('defaults music volume to 0.12', () => {
      const result = validateProject({
        ...validProject,
        music: { file: 'musica.mp3', path: 'C:/fake/path/musica.mp3' }
      });
      expect(result.music.volume).toBe(0.12);
    });

    it('validates zoom config', () => {
      const result = validateProject({
        ...validProject,
        config: {
          zoom: { enabled: false, initialScale: 1.5, intensity: 0.2, mode: 'alternate', styles: ['zoomin', 'zoomout'] }
        }
      });
      expect(result.config.zoom.enabled).toBe(false);
      expect(result.config.zoom.initialScale).toBe(1.5);
    });

    it('validates transition config', () => {
      const result = validateProject({
        ...validProject,
        config: {
          transition: { mode: 'random', types: ['fade', 'cut'], duration: 1.0 }
        }
      });
      expect(result.config.transition.duration).toBe(1.0);
    });

    it('rejects invalid transition duration', () => {
      expect(() => validateProject({
        ...validProject,
        config: { transition: { duration: 3.0 } }
      })).toThrow();
    });

    it('validates badges', () => {
      const result = validateProject({
        ...validProject,
        config: {
          badges: [{ file: 'badge.png', path: 'C:/fake/path/badge.png', at: 2, duration: 3, sizePercent: 20, position: 'top-right', animation: 'pop' }]
        }
      });
      expect(result.config.badges).toHaveLength(1);
    });

    it('rejects invalid badge position', () => {
      expect(() => validateProject({
        ...validProject,
        config: { badges: [{ file: 'b.png', path: 'C:/fake/path/b.png', at: 0, duration: 1, sizePercent: 10, position: 'invalid', animation: 'pop' }] }
      })).toThrow();
    });

    it('validates lowerThird', () => {
      const result = validateProject({
        ...validProject,
        config: { lowerThird: { enabled: true, text: '@test', opacity: 0.8 } }
      });
      expect(result.config.lowerThird.opacity).toBe(0.8);
    });

    it('validates progressBar', () => {
      const result = validateProject({
        ...validProject,
        config: { progressBar: { enabled: true, heightPx: 10, color: '#00FF00' } }
      });
      expect(result.config.progressBar.heightPx).toBe(10);
    });

    it('rejects invalid progressBar color', () => {
      expect(() => validateProject({
        ...validProject,
        config: { progressBar: { color: 'red' } }
      })).toThrow();
    });

    it('accepts sceneDurationOverrides', () => {
      const result = validateProject({
        ...validProject,
        sceneDurationOverrides: { '0': 5.5, '2': 3.0 }
      });
      expect(result.sceneDurationOverrides['0']).toBe(5.5);
    });

    it('accepts outputs instead of resolution', () => {
      const result = validateProject({
        ...validProject,
        config: { outputs: ['16:9', '1:1'] }
      });
      expect(result.config.outputs).toEqual(['16:9', '1:1']);
    });

    it('accepts fitMode', () => {
      const result = validateProject({
        ...validProject,
        config: { fitMode: 'blur' }
      });
      expect(result.config.fitMode).toBe('blur');
    });

    it('accepts images with focus point', () => {
      const result = validateProject({
        ...validProject,
        images: [{ file: 'scene1.png', path: 'C:/fake/path/scene1.png', focus: { x: 0.3, y: 0.7 } }, { file: 'scene2.png', path: 'C:/fake/path/scene2.png' }]
      });
      expect(result.images[0]).toEqual({ file: 'scene1.png', focus: { x: 0.3, y: 0.7 }, path: 'C:/fake/path/scene1.png', blobUrl: undefined });
      expect(result.images[1]).toEqual({ file: 'scene2.png', path: 'C:/fake/path/scene2.png', blobUrl: undefined });
    });
  });

  describe('validateProject with File objects (simulated)', () => {
    it('accepts File objects for images and extracts basename', () => {
      const mockFile = new File(['test'], 'escena1.png', { type: 'image/png' });
      Object.defineProperty(mockFile, 'path', { value: 'C:/fake/path/escena1.png', writable: true });
      const project = {
        images: [{ file: mockFile }, { file: 'scene2.png', path: 'C:/fake/path/scene2.png' }],
        narration: { file: new File(['audio'], 'voz.mp3', { type: 'audio/mpeg' }) },
        config: {}
      };
      Object.defineProperty(project.narration.file, 'path', { value: 'C:/fake/path/voz.mp3', writable: true });
      const result = validateProject(project);
      expect(result.images[0].file).toBe('escena1.png');
      expect(result.images[0].path).toBe('');
      expect(result.images[0].missing).toBe(true);
      expect(result.images[1].file).toBe('scene2.png');
      expect(result.images[1].path).toBe('C:/fake/path/scene2.png');
      expect(result.narration.file).toBe('voz.mp3');
      expect(result.narration.path).toBe('');
      expect(result.narration.missing).toBe(true);
    });

    it('accepts File object for music', () => {
      const mockMusicFile = new File(['audio'], 'musica.mp3', { type: 'audio/mpeg' });
      Object.defineProperty(mockMusicFile, 'path', { value: 'C:/fake/path/musica.mp3', writable: true });
      const project = {
        images: [{ file: 'scene1.png', path: 'C:/fake/path/scene1.png' }],
        narration: { file: 'voz.mp3', path: 'C:/fake/path/voz.mp3' },
        music: { file: mockMusicFile, volume: 0.5 },
        config: {}
      };
      const result = validateProject(project);
      expect(result.music.file).toBe('musica.mp3');
      expect(result.music.path).toBe('');
      expect(result.music.missing).toBe(true);
      expect(result.music.volume).toBe(0.5);
    });

    it('preserves absolute path for images when path is already absolute', () => {
      const project = {
        images: [{ file: 'scene1.png', path: 'C:/absolute/path/scene1.png' }],
        narration: { file: 'voz.mp3', path: 'C:/absolute/path/voz.mp3' },
        config: {}
      };
      const result = validateProject(project);
      expect(result.images[0].path).toBe('C:/absolute/path/scene1.png');
      expect(result.images[0].missing).toBeUndefined();
      expect(result.narration.path).toBe('C:/absolute/path/voz.mp3');
      expect(result.narration.missing).toBeUndefined();
    });

    it('clears path and sets missing:true when path is not absolute', () => {
      const project = {
        images: [{ file: 'scene1.png', path: 'relative/path/scene1.png' }],
        narration: { file: 'voz.mp3', path: 'relative/voz.mp3' },
        music: { file: 'musica.mp3', path: 'relative/musica.mp3', volume: 0.5 },
        config: {}
      };
      const result = validateProject(project);
      expect(result.images[0].path).toBe('');
      expect(result.images[0].missing).toBe(true);
      expect(result.narration.path).toBe('');
      expect(result.narration.missing).toBe(true);
      expect(result.music.path).toBe('');
      expect(result.music.missing).toBe(true);
    });

    it('handles UNC paths as absolute', () => {
      const project = {
        images: [{ file: 'scene1.png', path: '\\\\server\\share\\scene1.png' }],
        config: {}
      };
      const result = validateProject(project);
      expect(result.images[0].path).toBe('\\\\server\\share\\scene1.png');
      expect(result.images[0].missing).toBeUndefined();
    });
  });
});