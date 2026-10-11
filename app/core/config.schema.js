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

const NarrationSchema = z.object({
  file: z.string().regex(/\.(mp3|wav|m4a|aac)$/i),
  blobUrl: z.string().optional()
}).optional();

const MusicSchema = z.object({
  file: z.string().regex(/\.(mp3|wav|m4a|aac)$/i),
  blobUrl: z.string().optional(),
  volume: z.number().min(0).max(1).default(0.12)
}).optional();

const FocusPointSchema = z.object({
  x: z.number().min(0).max(1).default(0.5),
  y: z.number().min(0).max(1).default(0.5)
});

const ImageWithFocusSchema = z.object({
  file: z.string().regex(/\.(png|jpg|jpeg|webp|mp4)$/i),
  focus: FocusPointSchema.optional()
});

const ConfigSchema = z.object({
  outputs: z.array(z.enum(['9:16', '16:9', '1:1'])).min(1).max(3).default(['9:16', '16:9']),
  resolution: z.enum(['9:16', '16:9', '1:1']).optional().default('9:16'),
  fitMode: z.enum(['crop', 'blur']).default('crop'),
  fps: z.number().int().positive().default(30),
  imageFit: z.enum(['cover', 'contain']).default('cover'),
  fitTimesToAudio: z.boolean().default(true),
  zoom: ZoomConfigSchema.default({}),
  transition: TransitionConfigSchema.default({}),
  badges: z.array(BadgeSchema).default([]),
  lowerThird: LowerThirdSchema.default({}),
  progressBar: ProgressBarSchema.default({})
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
  outputs: ['9:16', '16:9'],
  resolution: '9:16',
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
  }
};

function migrateProject(data) {
  if (data.config && data.config.resolution && !data.config.outputs) {
    data.config.outputs = [data.config.resolution];
  }
  if (data.config && data.config.outputs && !data.config.resolution) {
    data.config.resolution = data.config.outputs[0];
  }
  if (data.images && data.images.length > 0) {
    data.images = data.images.map(img => {
      if (typeof img === 'string') {
        return { file: img, focus: { x: 0.5, y: 0.5 } };
      }
      return img;
    });
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

module.exports = { validateProject, getDefaultConfig, ProjectSchema, ConfigSchema, FocusPointSchema, ImageWithFocusSchema };