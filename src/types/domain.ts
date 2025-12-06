export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

export type User = {
  id: string;
  sex: 'male' | 'female' | 'other';
  age: number;
  heightCm: number;
  experienceLevel: ExperienceLevel;
  currentPhysiqueLevel: number;
  currentPhotoUri?: string;
  createdAt: string;
};

export type PhaseType = 'transformation';
export type PhasePlanStatus = 'active' | 'completed' | 'abandoned';

export type PhasePlan = {
  id: string;
  currentLevelId: number;
  targetLevelId: number;
  
  startDate: string;
  expectedEndDate: string;
  expectedWeeks: number;
  
  phaseType: PhaseType;
  status: PhasePlanStatus;
  createdAt: string;
};

export type DailyLog = {
  id: string;
  date: string; // "YYYY-MM-DD"
  phasePlanId: string;
  loggedActivity: boolean; // Simple: did user mark day as complete?
  createdAt: string;
};

export type PhotoCheckin = {
  id: string;
  date: string;
  phasePlanId: string;
  frontUri: string;
  sideUri?: string;
  note?: string;
  createdAt: string;
};

export type ProgressEstimate = {
  phasePlanId: string;
  lastUpdated: string;
  progressPercent: number;
  daysActive: number;
  daysLogged: number;
};

export type AppState = {
  user: User | null;
  currentPhase: PhasePlan | null;
  dailyLogs: DailyLog[];
  photoCheckins: PhotoCheckin[];
  progressEstimate: ProgressEstimate | null;
  version: number;
  lastModified: string;
};

export const createEmptyAppState = (): AppState => ({
  user: null,
  currentPhase: null,
  dailyLogs: [],
  photoCheckins: [],
  progressEstimate: null,
  version: 1,
  lastModified: new Date().toISOString(),
});