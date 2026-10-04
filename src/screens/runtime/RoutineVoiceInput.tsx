import { hostedRoutineInputEnabled } from '../../services/routineInputService';
import { IconButton } from './ui';

type Props = { disabled: boolean; onTranscript: (text: string) => void; onBusy: (busy: boolean) => void; onError: (message: string) => void };

/**
 * Capability gate for the mic inside RoutineDescription's text area: a real recorder when hosted
 * transcription is configured, an actionable mic with availability feedback otherwise. Never silent — the
 * unavailable state still sits in the text area and says why when pressed, rather than doing
 * nothing or quietly focusing the keyboard.
 */
export const RoutineVoiceInput = (props: Props) => {
  if (hostedRoutineInputEnabled) {
    // Existing native builds can use local setup without loading the new audio module.
    // Hosted recording requires a rebuilt native client with expo-audio installed.
    const { RoutineRecorder } = require('./RoutineRecorder') as typeof import('./RoutineRecorder');
    return <RoutineRecorder {...props} />;
  }
  return (
    <IconButton
      icon="mic"
      tone="accent"
      label="Voice input"
      disabled={props.disabled}
      onPress={() => props.onError('Voice input isn’t set up yet — type your routine instead.')}
    />
  );
};
