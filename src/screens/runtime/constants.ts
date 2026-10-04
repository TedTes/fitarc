export const FULL_GYM = ['barbell', 'rack', 'machine', 'cable', 'dumbbell', 'bench', 'pullup_bar'];
export const DUMBBELLS = ['dumbbell', 'bench'];
export const LIMITATIONS = ['shoulder', 'lower back', 'knee', 'elbow', 'neck'];
/** The four persistent destinations. Keys are the runtime names. */
export type Surface = 'solver' | 'block' | 'week' | 'account';

/** Something the shell shows once, above the current surface, after an action. */
export type Notice = {
  id: number;
  tone: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
  action?: { label: string; run: () => void };
  /** Errors stay until dismissed; everything else clears itself. */
  sticky?: boolean;
};
export type Notify = (notice: Omit<Notice, 'id'>) => void;
