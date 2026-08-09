export interface ModelMetadata {
  id: string;
  name: string;
  description: string;
  category: 'photos' | 'anime' | 'video';
  scale: number;
}

export const MODEL_REGISTRY: Record<string, ModelMetadata> = {
  'realesrgan-x4plus': {
    id: 'realesrgan-x4plus',
    name: 'RealESRGAN Ultra (4x)',
    description: 'Best for high-detail photos, portraits & landscapes',
    category: 'photos',
    scale: 4,
  },
  'realesrgan-x4plus-anime': {
    id: 'realesrgan-x4plus-anime',
    name: 'RealESRGAN Anime Art (4x)',
    description: 'High-detail 2D art, illustrations & manga',
    category: 'anime',
    scale: 4,
  },
  'realesr-animevideov3-x2': {
    id: 'realesr-animevideov3-x2',
    name: 'RealESRGAN Video (2x)',
    description: 'Ultra fast 2x video frame upscaler (Anime & Clips)',
    category: 'video',
    scale: 2,
  },
  'realesr-animevideov3-x3': {
    id: 'realesr-animevideov3-x3',
    name: 'RealESRGAN Video (3x)',
    description: 'Balanced 3x video frame upscaler (Anime & Clips)',
    category: 'video',
    scale: 3,
  },
  'realesr-animevideov3-x4': {
    id: 'realesr-animevideov3-x4',
    name: 'RealESRGAN Video (4x)',
    description: 'Maximum 4x video frame upscaler (Anime & Clips)',
    category: 'video',
    scale: 4,
  },
};

export function getModelMetadata(modelId: string): ModelMetadata {
  if (MODEL_REGISTRY[modelId]) {
    return MODEL_REGISTRY[modelId];
  }
  // Fallback for custom or unlisted models
  const isAnime = modelId.includes('anime');
  const isVideo = modelId.includes('video') || modelId.includes('animevideov3');
  let scale = 4;
  if (modelId.includes('x2') || modelId.includes('-2x')) scale = 2;
  if (modelId.includes('x3') || modelId.includes('-3x')) scale = 3;

  return {
    id: modelId,
    name: modelId.replace(/[-_]/g, ' '),
    description: isVideo
      ? 'Optimized for Video Frame Sequences'
      : isAnime
        ? 'Optimized for 2D Art & Anime'
        : 'Photorealistic AI Upscaler',
    category: isVideo ? 'video' : isAnime ? 'anime' : 'photos',
    scale,
  };
}

export function filterModelsByCategory(
  installedModels: string[],
  category: 'photos' | 'anime' | 'video'
): string[] {
  // If installedModels is empty, fall back to all known models in MODEL_REGISTRY
  const list =
    installedModels && installedModels.length > 0 ? installedModels : Object.keys(MODEL_REGISTRY);

  const matched = list.filter((id) => {
    const meta = getModelMetadata(id);
    if (category === 'photos') return meta.category === 'photos';
    if (category === 'anime') return meta.category === 'anime';
    if (category === 'video')
      return meta.category === 'video' || id.includes('animevideov3') || id.includes('video');
    return true;
  });

  return matched.length > 0 ? matched : list;
}

export function findBestModelForScale(
  installedModels: string[],
  category: 'photos' | 'anime' | 'video',
  targetScale: number
): string | null {
  const categoryModels = filterModelsByCategory(installedModels, category);
  if (categoryModels.length === 0) return null;

  // Exact scale match first
  const exactMatch = categoryModels.find((id) => getModelMetadata(id).scale === targetScale);
  if (exactMatch) return exactMatch;

  // Fallback to first category model
  return categoryModels[0];
}
