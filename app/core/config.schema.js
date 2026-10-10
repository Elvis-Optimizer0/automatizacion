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
  types: z.array(z.enum(['slideleft', 'slideright', 'slidedown', 'fade', 'cut'])).default(['slidedown']),
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

const MusicSchema = z.object({
  file: z.string(),
  volume: z.number().min(0).max(1).default(0.12)
}).optional();

const ConfigSchema = z.object({
  resolution: z.enum(['9:16', '16:9', '1:1']).default('9:16'),
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
  images: z.array(z.string().regex(/\.(png|jpg|jpeg|webp|mp4)$/i)).min(1),
  narration: z.string().regex(/\.(mp3|wav|m4a|aac)$/i),
  music: MusicSchema,
  script: z.string().optional(),
  config: ConfigSchema.default({}),
  sceneDurationOverrides: z.record(z.string(), z.number().positive()).default({})
});

const DEFAULT_CONFIG = {
  resolution: '9:16',
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

function validateProject(data) {
  return ProjectSchema.parse(data);
}

function getDefaultConfig() {
  return DEFAULT_CONFIG;
}

module.exports = { validateProject, getDefaultConfig, ProjectSchema, ConfigSchema };