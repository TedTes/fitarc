export type PhysiqueLevel = {
    id: number;
    name: string;
    description: string;
    bodyFatRange: string;
    characteristics: string[];
    // For now using placeholder images - you can replace with real images later
    maleImageUrl: string;
    femaleImageUrl: string;
  };
  
  export const PHYSIQUE_LEVELS: PhysiqueLevel[] = [
    {
      id: 1,
      name: 'Starting Point',
      description: 'New to fitness, building foundation',
      bodyFatRange: '25-35%',
      characteristics: [
        'Minimal muscle definition',
        'Higher body fat',
        'New to structured training'
      ],
      maleImageUrl: 'https://via.placeholder.com/300x400/1E2340/A0A3BD?text=Level+1',
      femaleImageUrl: 'https://via.placeholder.com/300x400/1E2340/A0A3BD?text=Level+1',
    },
    {
      id: 2,
      name: 'Foundation',
      description: 'Building base strength and habits',
      bodyFatRange: '20-25%',
      characteristics: [
        'Some muscle visibility',
        'Consistent training habits',
        'Basic strength established'
      ],
      maleImageUrl: 'https://via.placeholder.com/300x400/1E2340/6C63FF?text=Level+2',
      femaleImageUrl: 'https://via.placeholder.com/300x400/1E2340/6C63FF?text=Level+2',
    },
    {
      id: 3,
      name: 'Developing',
      description: 'Visible muscle, improving definition',
      bodyFatRange: '15-20%',
      characteristics: [
        'Clear muscle separation',
        'Athletic appearance',
        'Good strength base'
      ],
      maleImageUrl: 'https://via.placeholder.com/300x400/1E2340/00F5A0?text=Level+3',
      femaleImageUrl: 'https://via.placeholder.com/300x400/1E2340/00F5A0?text=Level+3',
    },
    {
      id: 4,
      name: 'Athletic',
      description: 'Well-developed physique, lean and strong',
      bodyFatRange: '12-15%',
      characteristics: [
        'Excellent muscle definition',
        'Low body fat',
        'Advanced strength levels'
      ],
      maleImageUrl: 'https://via.placeholder.com/300x400/1E2340/FFB800?text=Level+4',
      femaleImageUrl: 'https://via.placeholder.com/300x400/1E2340/FFB800?text=Level+4',
    },
    {
      id: 5,
      name: 'Advanced',
      description: 'Peak physique, competition-level conditioning',
      bodyFatRange: '8-12%',
      characteristics: [
        'Maximum muscle visibility',
        'Very low body fat',
        'Elite performance'
      ],
      maleImageUrl: 'https://via.placeholder.com/300x400/1E2340/FF6B93?text=Level+5',
      femaleImageUrl: 'https://via.placeholder.com/300x400/1E2340/FF6B93?text=Level+5',
    },
  ];
  
  export const getPhysiqueLevelsBySex = (sex: 'male' | 'female' | 'other') => {
    return PHYSIQUE_LEVELS.map(level => ({
      ...level,
      imageUrl: sex === 'female' ? level.femaleImageUrl : level.maleImageUrl,
    }));
  };