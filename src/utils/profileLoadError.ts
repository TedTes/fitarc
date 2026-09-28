export type ProfileLoadError = { code: string; message: string };

/** Keep backend failures actionable without displaying raw responses or credentials. */
export const describeProfileLoadError = (error: unknown): ProfileLoadError => {
  const candidate = error && typeof error === 'object' && 'code' in error ? error.code : null;
  const code = typeof candidate === 'string' && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(candidate)
    ? candidate : 'UNKNOWN';
  switch (code) {
    case 'PGRST106':
      return { code, message: 'The service is not configured for this version of FitArc yet. Its database API configuration needs updating.' };
    case '42P01':
    case 'PGRST205':
      return { code, message: 'The profile database is not available to this version of FitArc yet. The database setup needs checking.' };
    case '42501':
      return { code, message: 'The service denied access to your profile. Its profile permissions need checking.' };
    case 'PGRST301':
    case 'PGRST303':
      return { code, message: 'Your sign-in could not be verified. Sign out and sign in again.' };
    default:
      return { code, message: 'Please try again. If this continues, check your connection or contact support.' };
  }
};
