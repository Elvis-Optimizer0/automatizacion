const { z } = require('zod');

const ZoomConfigSchema = z.object({
  enabled: z.boolean().default(true),
  initialScale: z.number().min(1).max(2).default(1.22),
  intensity: z.number().min(0).max(1).default(0.10),
  mode: z.enum(['fixed', 'alternate', 'random']).default('fixed'),
  styles: z.array(z.enum(['kenburns', 'zoomin', 'zoomout', 'zoompulse', 'panleft', 'panright', 'panup', 'pandown', 'none'])).default(['kenburns'])
});

const TransitionConfigSchema = z.object({
  mode: z.enum(['fixed', 'alternate', 'random']).default('fixed'),
  types: z.array(z.enum(['slideleft', 'slideright', 'slidedown', 'fade', 'cut', 'fadeblack', 'dissolve', 'slideup', 'wipeleft', 'wiperight', 'circleopen'])).default(['slidedown']),
  duration: z.number().min(0.1).max(2.0).default(0.5)
});

const BadgeSchema = z.object({
  file: z.string(),
  at: z.number().min(0),
  duration: z.number().min(0.1),
  sizePercent: z.number().min(1).max(100),
  position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center']),
  animation: z.literal('pop').default('pop')
});

const LowerThirdSchema = z.object({
  enabled: z.boolean().default(false),
  text: z.string().default('@usuario'),
  opacity: z.number().min(0).max(1).default(0.55)
});

const ProgressBarSchema = z.object({
  enabled: z.boolean().default(true),
  heightPx: z.number().min(1).max(50).default(8),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#FF0000')
});

const SubtitlesSchema = z.object({
  enabled: z.boolean().default(false),
  fontSize: z.number().int().positive().optional()
}).optional();

const NarrationSchema = z.object({
  file: z.string().refine((val) => {
    const basename = val.split(/[\\/]/).pop() || val;
    return /\.(mp3|wav|m4a|aac)$/i.test(basename);
  }, { message: 'El archivo de narración debe ser mp3, wav, m4a o aac' }),
  path: z.string().optional(),
  blobUrl: z.string().optional(),
  missing: z.boolean().optional()
}).optional();

const MusicSchema = z.object({
  file: z.string().refine((val) => {
    const basename = val.split(/[\\/]/).pop() || val;
    return /\.(mp3|wav|m4a|aac)$/i.test(basename);
  }, { message: 'El archivo de música debe ser mp3, wav, m4a o aac' }),
  path: z.string().optional(),
  blobUrl: z.string().optional(),
  volume: z.number().min(0).max(1).default(0.12),
  missing: z.boolean().optional()
}).optional();

const FocusPointSchema = z.object({
  x: z.number().min(0).max(1).default(0.5),
  y: z.number().min(0).max(1).default(0.5)
});

const ImageWithFocusSchema = z.object({
  file: z.string().refine((val) => {
    const basename = val.split(/[\\/]/).pop() || val;
    return /\.(png|jpg|jpeg|webp|mp4)$/i.test(basename);
  }, { message: 'El archivo debe tener una extensión válida: png, jpg, jpeg, webp o mp4' }),
  focus: FocusPointSchema.optional(),
  path: z.string().optional(),
  blobUrl: z.string().optional(),
  missing: z.boolean().optional()
});

const ConfigSchema = z.object({
  outputs: z.array(z.enum(['9:16', '16:9', '1:1', '4:5'])).min(1).max(4).default(['16:9', '9:16', '1:1']),
  resolution: z.enum(['9:16', '16:9', '1:1', '4:5']).optional().default('16:9'),
  fitMode: z.enum(['crop', 'blur', 'bars']).default('crop'),
  fps: z.number().int().positive().default(30),
  imageFit: z.enum(['cover', 'contain']).default('cover'),
  fitTimesToAudio: z.boolean().default(true),
  zoom: ZoomConfigSchema.default({}),
  transition: TransitionConfigSchema.default({}),
  badges: z.array(BadgeSchema).default([]),
  lowerThird: LowerThirdSchema.default({}),
  progressBar: ProgressBarSchema.default({}),
  subtitleFontSizeHorizontal: z.number().int().positive().default(48),
  subtitleFontSizeVertical: z.number().int().positive().default(64),
  subtitles: SubtitlesSchema.default({})
});

const ProjectSchema = z.object({
  images: z.array(ImageWithFocusSchema).min(1),
  narration: NarrationSchema,
  music: MusicSchema,
  script: z.string().optional(),
  config: ConfigSchema.default({}),
  sceneDurationOverrides: z.record(z.string(), z.number().positive()).default({}),
  sceneOverrides: z.record(z.string(), z.object({
    zoom: z.enum(['kenburns', 'zoomin', 'zoomout', 'zoompulse', 'panleft', 'panright', 'panup', 'pandown', 'none']).optional(),
    transition: z.enum(['slideleft', 'slideright', 'slidedown', 'fade', 'cut', 'fadeblack', 'dissolve', 'slideup', 'wipeleft', 'wiperight', 'circleopen']).optional(),
    zoomIntensity: z.enum(['normal', 'soft', 'strong']).optional()
  })).default({})
});

const DEFAULT_CONFIG = {
  outputs: ['16:9'],
  resolution: '16:9',
  fitMode: 'crop',
  fps: 30,
  imageFit: 'cover',
  fitTimesToAudio: true,
  zoom: {
    enabled: true,
    initialScale: 1.22,
    intensity: 0.10,
    mode: 'fixed',
    styles: ['kenburns']
  },
  transition: {
    mode: 'fixed',
    types: ['slidedown'],
    duration: 0.5
  },
  badges: [],
  lowerThird: {
    enabled: false,
    text: '@usuario',
    opacity: 0.55
  },
  progressBar: {
    enabled: true,
    heightPx: 8,
    color: '#FF0000'
  },
  subtitleFontSizeHorizontal: 48,
  subtitleFontSizeVertical: 64
};

function isAbsolutePath(p) {
  return typeof p === 'string' && /^([a-zA-Z]:[\\/]|\\\\)/.test(p);
}

function migrateProject(data) {
  // Default to horizontal 16:9 if no outputs specified
  if (data.config && !data.config.outputs && !data.config.resolution) {
    data.config.outputs = ['16:9'];
    data.config.resolution = '16:9';
  }
  if (data.config && data.config.resolution && !data.config.outputs) {
    data.config.outputs = [data.config.resolution];
  }
  if (data.config && data.config.outputs && !data.config.resolution) {
    data.config.resolution = data.config.outputs[0];
  }
  if (data.images && data.images.length > 0) {
    data.images = data.images.map(img => {
      // If it's a File object directly
      if (img instanceof File) {
        return { file: img.name, path: '', missing: true };
      }
      // If it's a string (path)
      if (typeof img === 'string') {
        return { file: img, path: '', missing: true };
      }
      // If it's a File object in an object wrapper
      if (img.file && typeof img.file === 'object' && img.file instanceof File) {
        return { file: img.file.name, path: '', missing: true, focus: img.focus, blobUrl: img.blobUrl };
      }
      // If it's an object with file property that's a File object
      if (img.file && typeof img.file === 'object' && img.file.name && !(img.file instanceof File)) {
        return { file: img.file.name, path: '', missing: true, focus: img.focus, blobUrl: img.blobUrl };
      }
      // If item already has absolute path, keep it as-is
      if (isAbsolutePath(img.path)) {
        return img;
      }
      // If it's an object with file as string
      if (img.file && typeof img.file === 'string') {
        const basename = img.file.split(/[\\/]/).pop();
        return { file: basename, path: '', missing: true, focus: img.focus, blobUrl: img.blobUrl };
      }
      // If item already has path (but not absolute), keep as-is
      if (img.path !== undefined) {
        return img;
      }
      // If it's a string (path)
      if (typeof img === 'string') {
        return { file: img, path: '', missing: true };
      }
      // If it's an object with file property that's a File object
      if (img.file && typeof img.file === 'object' && img.file.name && !(img.file instanceof File)) {
        return { file: img.file.name, path: '', missing: true, focus: img.focus, blobUrl: img.blobUrl };
      }
      // If it's an object with file as string
      if (img.file && typeof img.file === 'string') {
        const basename = img.file.split(/[\\/]/).pop();
        return { file: basename, path: '', missing: true, focus: img.focus, blobUrl: img.blobUrl };
      }
      return img;
    });
  }
  // Migrate narration if it's string or File object
  if (data.narration && typeof data.narration === 'string') {
    data.narration = { file: data.narration, path: '' };
  } else if (data.narration && data.narration.file instanceof File) {
    data.narration = { file: data.narration.file.name, path: '', blobUrl: data.narration.blobUrl };
  } else if (data.narration && data.narration.file && typeof data.narration.file === 'object' && data.narration.file.name && !(data.narration.file instanceof File)) {
    data.narration = { file: data.narration.file.name, path: '', blobUrl: data.narration.blobUrl };
  } else if (data.narration && data.narration.file && typeof data.narration.file === 'string' && data.narration.path !== undefined) {
    // Already has file and path - preserve if absolute
    if (!isAbsolutePath(data.narration.path)) {
      data.narration.path = '';
      data.narration.missing = true;
    }
  } else if (data.narration && data.narration.file && typeof data.narration.file === 'string') {
    const basename = data.narration.file.split(/[\\/]/).pop();
    data.narration = { file: basename, path: '', blobUrl: data.narration.blobUrl };
  }
  // If narration already has absolute path, keep it
  if (data.narration && isAbsolutePath(data.narration.path)) {
    // keep as-is
  } else if (data.narration) {
    data.narration.path = '';
    data.narration.missing = true;
  }
  // Migrate music equal
  if (data.music && typeof data.music === 'string') {
    data.music = { file: data.music, path: '' };
  } else if (data.music && data.music.file instanceof File) {
    data.music = { file: data.music.file.name, path: '', blobUrl: data.music.blobUrl, volume: data.music.volume };
  } else if (data.music && data.music.file && typeof data.music.file === 'object' && data.music.file.name && !(data.music.file instanceof File)) {
    data.music = { file: data.music.file.name, path: '', blobUrl: data.music.blobUrl, volume: data.music.volume };
  } else if (data.music && data.music.file && typeof data.music.file === 'string' && data.music.path !== undefined) {
    // Already has file and path - preserve if absolute
    if (!isAbsolutePath(data.music.path)) {
      data.music.path = '';
      data.music.missing = true;
    }
  } else if (data.music && data.music.file && typeof data.music.file === 'string') {
    const basename = data.music.file.split(/[\\/]/).pop();
    data.music = { file: basename, path: '', blobUrl: data.music.blobUrl, volume: data.music.volume };
  }
  // If music already has absolute path, keep it
  if (data.music && isAbsolutePath(data.music.path)) {
    // keep as-is
  } else if (data.music) {
    data.music.path = '';
    data.music.missing = true;
  }
  return data;
}

function validateProject(data) {
  const migrated = migrateProject(data);
  return ProjectSchema.parse(migrated);
}

function getDefaultConfig() {
  return DEFAULT_CONFIG;
}

module.exports = { validateProject, getDefaultConfig, ProjectSchema, ConfigSchema, FocusPointSchema, ImageWithFocusSchema, SubtitlesSchema };
