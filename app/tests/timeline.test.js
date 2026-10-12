import { describe, it, expect } from 'vitest';
import { buildTimeline, mulberry32, selectStyle, selectTransitionType } from '../core/timeline.js';

describe('mulberry32 PRNG', () => {
  it('produces deterministic sequence', () => {
    const rng = mulberry32(42);
    const vals = [rng(), rng(), rng(), rng(), rng()];
    expect(vals[0]).toBeCloseTo(0.601, 2);
    expect(vals[1]).toBeCloseTo(0.448, 2);
    expect(vals[2]).toBeCloseTo(0.852, 2);
  });

  it('different seeds produce different sequences', () => {
    const rng1 = mulberry32(42);
    const rng2 = mulberry32(43);
    expect(rng1()).not.toBe(rng2());
  });
});

describe('selectStyle', () => {
  const styles = ['kenburns', 'zoomin', 'zoomout'];

  it('fixed returns first style', () => {
    expect(selectStyle(styles, 'fixed', 0)).toBe('kenburns');
    expect(selectStyle(styles, 'fixed', 5)).toBe('kenburns');
  });

  it('alternate cycles through styles', () => {
    expect(selectStyle(styles, 'alternate', 0)).toBe('kenburns');
    expect(selectStyle(styles, 'alternate', 1)).toBe('zoomin');
    expect(selectStyle(styles, 'alternate', 2)).toBe('zoomout');
    expect(selectStyle(styles, 'alternate', 3)).toBe('kenburns');
  });

  it('random uses seeded PRNG', () => {
    const results = Array.from({ length: 10 }, (_, i) => selectStyle(styles, 'random', i, 42));
    expect(results).toEqual([
      'zoomin', 'kenburns', 'zoomin', 'zoomin', 'zoomin',
      'zoomin', 'kenburns', 'zoomout', 'kenburns', 'kenburns'
    ]);
  });

  it('returns none for empty styles', () => {
    expect(selectStyle([], 'fixed', 0)).toBe('none');
  });
});

describe('selectTransitionType', () => {
  const types = ['slideleft', 'slideright', 'fade'];

  it('fixed returns first type', () => {
    expect(selectTransitionType(types, 'fixed', 0)).toBe('slideleft');
  });

  it('alternate cycles', () => {
    expect(selectTransitionType(types, 'alternate', 0)).toBe('slideleft');
    expect(selectTransitionType(types, 'alternate', 1)).toBe('slideright');
    expect(selectTransitionType(types, 'alternate', 2)).toBe('fade');
  });

  it('random is deterministic', () => {
    const results = Array.from({ length: 5 }, (_, i) => selectTransitionType(types, 'random', i, 42));
    expect(results).toEqual(['slideleft', 'fade', 'fade', 'slideleft', 'fade']);
  });
});

describe('buildTimeline', () => {
  const baseProject = {
    images: ['img1.png', 'img2.png', 'img3.png', 'img4.png', 'img5.png', 'img6.png'],
    config: {
      resolution: '9:16',
      fps: 30,
      imageFit: 'cover',
      fitTimesToAudio: true,
      zoom: { enabled: true, initialScale: 1.22, intensity: 0.10, mode: 'fixed', styles: ['kenburns'] },
      transition: { mode: 'fixed', types: ['slidedown'], duration: 0.5 },
      badges: [],
      lowerThird: { enabled: false, text: '@usuario', opacity: 0.55 },
      progressBar: { enabled: true, heightPx: 8, color: '#FF0000' }
    },
    sceneDurationOverrides: {}
  };

  it('case 1: script with timestamps - rescales to audio duration', () => {
    // 6 timestamps (0:00 to 0:20) = 6 segments = 24s estimated, 6 images, audio 24s -> factor 1.0
    // But we want factor 1.2, so use 5 timestamps for 20s estimated, 5 images, audio 24s
    const project = {
      ...baseProject,
      images: ['img1.png', 'img2.png', 'img3.png', 'img4.png', 'img5.png'],
      script: '(0:00) Escena 1\n(0:04) Escena 2\n(0:08) Escena 3\n(0:12) Escena 4\n(0:16) Escena 5'
    };
    const audioDuration = 24;
    const timeline = buildTimeline(project, audioDuration);

    expect(timeline.scenes).toHaveLength(5);
    expect(timeline.totalDuration).toBeCloseTo(audioDuration, 1);
    expect(timeline.factor).toBeCloseTo(1.2, 1);
    expect(timeline.fitApplied).toBe(true);
  });

  it('case 1: fitTimesToAudio=false extends last scene', () => {
    const project = {
      ...baseProject,
      images: ['img1.png', 'img2.png', 'img3.png', 'img4.png', 'img5.png'],
      config: { ...baseProject.config, fitTimesToAudio: false },
      script: '(0:00) Escena 1\n(0:04) Escena 2\n(0:08) Escena 3\n(0:12) Escena 4\n(0:16) Escena 5'
    };
    const audioDuration = 24;
    const timeline = buildTimeline(project, audioDuration);

    expect(timeline.totalDuration).toBeCloseTo(audioDuration, 1);
    expect(timeline.fitApplied).toBe(false);
  });

  it('case 2: script without timestamps - distributes by char weight', () => {
    // 6 lines for 6 images
    const project = {
      ...baseProject,
      script: 'Corto\nMediana longitud\nLínea más larga\nOtra línea\nMás texto aquí\nÚltima línea'
    };
    const audioDuration = 30;
    const timeline = buildTimeline(project, audioDuration);

    expect(timeline.scenes).toHaveLength(6);
    expect(timeline.totalDuration).toBeCloseTo(audioDuration, 1);
    expect(timeline.fitApplied).toBe(false);
  });

  it('case 3: no script - equal division', () => {
    const project = { ...baseProject, script: '' };
    const audioDuration = 24;
    const timeline = buildTimeline(project, audioDuration);

    expect(timeline.scenes).toHaveLength(6);
    expect(timeline.scenes[0].duration).toBeCloseTo(4, 1);
    expect(timeline.totalDuration).toBeCloseTo(audioDuration, 1);
  });

  it('applies sceneDurationOverrides and rebalances', () => {
    const project = {
      ...baseProject,
      script: '',
      sceneDurationOverrides: { '2': 8 }
    };
    const audioDuration = 24;
    const timeline = buildTimeline(project, audioDuration);

    expect(timeline.scenes[2].duration).toBe(8);
    expect(timeline.totalDuration).toBeCloseTo(audioDuration, 1);
  });

  it('throws E_SCENE_TOO_SHORT for too short scenes', () => {
    const project = {
      ...baseProject,
      images: ['img1.png', 'img2.png'],
      config: { ...baseProject.config, transition: { ...baseProject.config.transition, duration: 1.0 } },
      script: ''
    };
    const audioDuration = 1.5;
    expect(() => buildTimeline(project, audioDuration)).toThrow('E_SCENE_TOO_SHORT');
  });

  it('handles fewer images than script segments', () => {
    const project = {
      ...baseProject,
      images: ['img1.png', 'img2.png'],
      script: '(0:00) A\n(0:05) B\n(0:10) C\n(0:15) D'
    };
    const audioDuration = 20;
    const timeline = buildTimeline(project, audioDuration);
    expect(timeline.scenes).toHaveLength(2);
  });

  it('single scene with timestamps uses audio duration', () => {
    const project = {
      ...baseProject,
      images: ['img1.png'],
      script: '(0:05) Solo una escena'
    };
    const audioDuration = 15;
    const timeline = buildTimeline(project, audioDuration);
    expect(timeline.scenes[0].duration).toBeCloseTo(15, 1);
  });

  it('preserves path from input images in scenes', () => {
    const project = {
      ...baseProject,
      images: [
        { file: 'img1.png', path: 'C:/test/img1.png' },
        { file: 'img2.png', path: 'C:/test/img2.png' },
        { file: 'img3.png', path: 'C:/test/img3.png' }
      ],
      script: ''
    };
    const audioDuration = 15;
    const timeline = buildTimeline(project, audioDuration);
    expect(timeline.scenes).toHaveLength(3);
    expect(timeline.scenes[0].path).toBe('C:/test/img1.png');
    expect(timeline.scenes[1].path).toBe('C:/test/img2.png');
    expect(timeline.scenes[2].path).toBe('C:/test/img3.png');
  });
});