import { describe, it, expect } from 'vitest';
import { buildZoomFilter, getResolutionWH, escapeFontPath, buildCropFilter, buildImageFilterChainByIndex } from '../core/ffmpeg-builder.js';

describe('ffmpeg-builder', () => {
  describe('getResolutionWH', () => {
    it('returns 9:16 as 1080x1920', () => {
      expect(getResolutionWH('9:16')).toEqual({ w: 1080, h: 1920 });
    });

    it('returns 16:9 as 1920x1080', () => {
      expect(getResolutionWH('16:9')).toEqual({ w: 1920, h: 1080 });
    });

    it('returns 1:1 as 1080x1080', () => {
      expect(getResolutionWH('1:1')).toEqual({ w: 1080, h: 1080 });
    });

    it('defaults to 16:9', () => {
      expect(getResolutionWH('invalid')).toEqual({ w: 1920, h: 1080 });
    });
  });

  describe('escapeFontPath', () => {
    it('escapes backslashes and colons', () => {
      expect(escapeFontPath('C:\\path\\font.ttf')).toBe('C\\:/path/font.ttf');
    });

    it('escapes colons', () => {
      expect(escapeFontPath('C:/path/font.ttf')).toBe('C\\:/path/font.ttf');
    });

    it('escapes single quotes', () => {
      expect(escapeFontPath("C:/path/font's.ttf")).toBe("C\\:/path/font\\'s.ttf");
    });

    it('handles complex Windows path', () => {
      expect(escapeFontPath("C:\\Users\\Name\\font's.ttf")).toBe("C\\:/Users/Name/font\\'s.ttf");
    });
  });

  describe('buildZoomFilter', () => {
    const params = { duration: 4, fps: 30, W: 1080, H: 1920 };

    it('kenburns produces correct filter', () => {
      const filter = buildZoomFilter('kenburns', 1.22, 0.10, 4, 30, 1080, 1920);
      expect(filter).toContain("zoompan=z='1.22+1.22*0.1*(on/(120-1))'");
      expect(filter).toContain("x='iw/2-(iw/zoom/2)+(iw/zoom)*0.02*(on/(120-1))'");
      expect(filter).toContain("y='ih/2-(ih/zoom/2)'");
      expect(filter).toContain('d=120');
      expect(filter).toContain('s=1080x1920');
      expect(filter).toContain('fps=30');
    });

    it('zoomin produces correct filter', () => {
      const filter = buildZoomFilter('zoomin', 1.22, 0.10, 4, 30, 1080, 1920);
      expect(filter).toContain("zoompan=z='1.22+1.22*0.1*(on/(120-1))'");
      expect(filter).toContain("x='iw/2-(iw/zoom/2)'");
    });

    it('zoomout produces correct filter', () => {
      const filter = buildZoomFilter('zoomout', 1.22, 0.10, 4, 30, 1080, 1920);
      expect(filter).toContain("zoompan=z='1.22*(1+0.1)-1.22*0.1*(on/(120-1))'");
    });

    it('zoompulse uses sin', () => {
      const filter = buildZoomFilter('zoompulse', 1.22, 0.10, 4, 30, 1080, 1920);
      expect(filter).toContain('abs(sin(PI*');
    });

    it('panleft pans horizontally', () => {
      const filter = buildZoomFilter('panleft', 1.22, 0.10, 4, 30, 1080, 1920);
      expect(filter).toContain("x='(iw-iw/zoom)*(1-(on/(120-1)))'");
    });

    it('panright pans horizontally opposite', () => {
      const filter = buildZoomFilter('panright', 1.22, 0.10, 4, 30, 1080, 1920);
      expect(filter).toContain("x='(iw-iw/zoom)*(on/(120-1))'");
    });

    it('panup pans vertically', () => {
      const filter = buildZoomFilter('panup', 1.22, 0.10, 4, 30, 1080, 1920);
      expect(filter).toContain("y='(ih-ih/zoom)*(1-(on/(120-1)))'");
    });

    it('pandown pans vertically opposite', () => {
      const filter = buildZoomFilter('pandown', 1.22, 0.10, 4, 30, 1080, 1920);
      expect(filter).toContain("y='(ih-ih/zoom)*(on/(120-1))'");
    });

    it('none produces static zoom', () => {
      const filter = buildZoomFilter('none', 1.22, 0.10, 4, 30, 1080, 1920);
      expect(filter).toContain("zoompan=z='1'");
      expect(filter).toContain("x='0'");
      expect(filter).toContain("y='0'");
    });

    it('unknown style defaults to none', () => {
      const filter = buildZoomFilter('unknown', 1.22, 0.10, 4, 30, 1080, 1920);
      expect(filter).toContain("zoompan=z='1'");
    });
  });
});

describe('fitMode bars (letterbox)', () => {
  it('buildCropFilter returns empty for bars mode', () => {
    const scene = { focus: { x: 0.5, y: 0.5 } };
    const result = buildCropFilter(scene, 1080, 1350, 'bars');
    expect(result).toBe('');
  });

  it('buildImageFilterChainByIndex with bars mode uses contain and pad', () => {
    const scene = { 
      file: 'test.jpg', 
      duration: 4, 
      zoomStyle: 'none', 
      zoomIntensity: 'normal', 
      focus: { x: 0.5, y: 0.5 } 
    };
    const filter = buildImageFilterChainByIndex(scene, 0, 1080, 1350, 30, false, {}, 'bars');
    expect(filter).toContain('force_original_aspect_ratio=decrease');
    expect(filter).toContain('pad=1080:1350');
    expect(filter).toContain('color=black');
  });

  it('buildImageFilterChainByIndex with bars mode and zoom applies zoom before pad', () => {
    const scene = { 
      file: 'test.jpg', 
      duration: 4, 
      zoomStyle: 'kenburns', 
      zoomIntensity: 'normal', 
      focus: { x: 0.5, y: 0.5 } 
    };
    const filter = buildImageFilterChainByIndex(scene, 0, 1080, 1350, 30, true, { initialScale: 1.22, intensity: 0.10 }, 'bars');
    expect(filter).toContain('force_original_aspect_ratio=decrease');
    expect(filter).toContain('zoompan=');
    expect(filter).toContain('pad=1080:1350');
    expect(filter).toContain('color=black');
  });
});

describe('focus point in crop filter', () => {
  it('buildCropFilter uses focus x,y for crop position', () => {
    const scene = { focus: { x: 0.2, y: 0.8 } };
    const result = buildCropFilter(scene, 1080, 1920, 'crop');
    expect(result).toContain('0.2*iw');
    expect(result).toContain('0.8*ih');
  });

  it('buildCropFilter defaults to center when no focus', () => {
    const scene = { focus: { x: 0.5, y: 0.5 } };
    const result = buildCropFilter(scene, 1080, 1920, 'crop');
    expect(result).toContain('0.5*iw');
    expect(result).toContain('0.5*ih');
  });

  it('buildCropFilter handles missing focus', () => {
    const scene = {};
    const result = buildCropFilter(scene, 1080, 1920, 'crop');
    expect(result).toContain('0.5*iw');
    expect(result).toContain('0.5*ih');
  });
});