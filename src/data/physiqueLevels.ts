export type PhysiqueAssetType = 'poster' | 'gif' | 'mp4' | 'webm' | 'lottie';

export type PhysiqueAsset = {
  posterUrl: string | null;
  animationUrl?: string | null;
  animationType?: PhysiqueAssetType;
  width?: number;
  height?: number;
  durationMs?: number;
};

export type PhysiqueLevelAssets = {
  male: PhysiqueAsset;
  female: PhysiqueAsset;
  other?: PhysiqueAsset;
};

export type PhysiqueLevel = {
  id: number;
  slug: string;
  name: string;
  description: string;
  bodyFatRange: string;
  characteristics: string[];
  assets: PhysiqueLevelAssets;
};

export type ResolvedPhysiqueLevel = PhysiqueLevel & {
  asset: PhysiqueAsset;
  imageUrl: string | null;
};

const PHYSIQUE_ASSET_BASE_URL = (
  process.env.EXPO_PUBLIC_PHYSIQUE_ASSET_BASE_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_STORAGE_URL ||
  ''
).replace(/\/+$/, '');

const buildAssetUrl = (path: string): string | null => {
  if (!path.trim().length) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (!PHYSIQUE_ASSET_BASE_URL) return null;
  return `${PHYSIQUE_ASSET_BASE_URL}/${path.replace(/^\/+/, '')}`;
};

const createPhysiqueAsset = (
  sex: 'male' | 'female' | 'other',
  levelId: number,
  options?: Partial<Omit<PhysiqueAsset, 'posterUrl' | 'animationUrl'>> & {
    posterPath?: string;
    animationPath?: string;
  }
): PhysiqueAsset => ({
  posterUrl: buildAssetUrl(
    options?.posterPath ?? `physiques/${sex}/level-${levelId}/poster.jpg`
  ),
  animationUrl: buildAssetUrl(
    options?.animationPath ?? `physiques/${sex}/level-${levelId}/idle.mp4`
  ),
  animationType: options?.animationType ?? 'mp4',
  width: options?.width ?? 720,
  height: options?.height ?? 960,
  durationMs: options?.durationMs,
});

export const PHYSIQUE_LEVELS: PhysiqueLevel[] = [
  {
    id: 1,
    slug: 'starting-point',
    name: 'Starting Point',
    description: 'New to fitness, building foundation',
    bodyFatRange: '25-35%',
    characteristics: [
      'Minimal muscle definition',
      'Higher body fat',
      'New to structured training',
    ],
    assets: {
      male: createPhysiqueAsset('male', 1),
      female: createPhysiqueAsset('female', 1),
      other: createPhysiqueAsset('other', 1),
    },
  },
  {
    id: 2,
    slug: 'foundation',
    name: 'Foundation',
    description: 'Building base strength and habits',
    bodyFatRange: '20-25%',
    characteristics: [
      'Some muscle visibility',
      'Consistent training habits',
      'Basic strength established',
    ],
    assets: {
      male: createPhysiqueAsset('male', 2),
      female: createPhysiqueAsset('female', 2),
      other: createPhysiqueAsset('other', 2),
    },
  },
  {
    id: 3,
    slug: 'developing',
    name: 'Developing',
    description: 'Visible muscle, improving definition',
    bodyFatRange: '15-20%',
    characteristics: [
      'Clear muscle separation',
      'Athletic appearance',
      'Good strength base',
    ],
    assets: {
      male: createPhysiqueAsset('male', 3),
      female: createPhysiqueAsset('female', 3),
      other: createPhysiqueAsset('other', 3),
    },
  },
  {
    id: 4,
    slug: 'athletic',
    name: 'Athletic',
    description: 'Well-developed physique, lean and strong',
    bodyFatRange: '12-15%',
    characteristics: [
      'Excellent muscle definition',
      'Low body fat',
      'Advanced strength levels',
    ],
    assets: {
      male: createPhysiqueAsset('male', 4),
      female: createPhysiqueAsset('female', 4),
      other: createPhysiqueAsset('other', 4),
    },
  },
  {
    id: 5,
    slug: 'advanced',
    name: 'Advanced',
    description: 'Peak physique, competition-level conditioning',
    bodyFatRange: '8-12%',
    characteristics: [
      'Maximum muscle visibility',
      'Very low body fat',
      'Elite performance',
    ],
    assets: {
      male: createPhysiqueAsset('male', 5),
      female: createPhysiqueAsset('female', 5),
      other: createPhysiqueAsset('other', 5),
    },
  },
];

const resolveAssetForSex = (
  assets: PhysiqueLevelAssets,
  sex: 'male' | 'female' | 'other'
): PhysiqueAsset => {
  if (sex === 'female') return assets.female;
  if (sex === 'other') return assets.other ?? assets.male;
  return assets.male;
};

export const getPhysiqueLevelsBySex = (
  sex: 'male' | 'female' | 'other'
): ResolvedPhysiqueLevel[] => {
  return PHYSIQUE_LEVELS.map((level) => {
    const asset = resolveAssetForSex(level.assets, sex);
    return {
      ...level,
      asset,
      imageUrl: asset.posterUrl,
    };
  });
};
