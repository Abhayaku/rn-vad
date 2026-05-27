import { useCallback, useEffect, useRef, useState } from 'react';
import { VAD } from './VAD';
import type {
  VADOptions,
  VADActivity,
  SpeechStartEvent,
  SpeechEndEvent,
  VADError,
} from './types';

export interface UseVADOptions extends VADOptions {
  onSpeechStart?: (e: SpeechStartEvent) => void;
  onSpeechEnd?: (e: SpeechEndEvent) => void;
  onVoiceActivity?: (e: VADActivity) => void;
  onError?: (e: VADError) => void;
}

export interface UseVADResult {
  isSpeaking: boolean;
  isNoise: boolean;
  isSilence: boolean;
  energyDb: number;
  isRunning: boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  error: VADError | null;
}

export function useVAD(options: UseVADOptions = {}): UseVADResult {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isNoise, setIsNoise] = useState(false);
  const [isSilence, setIsSilence] = useState(true);
  const [energyDb, setEnergyDb] = useState(-Infinity);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<VADError | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const unsubActivity = VAD.on('voiceActivity', (e) => {
      setIsSpeaking(e.type === 'speech');
      setIsNoise(e.type === 'noise');
      setIsSilence(e.type === 'silence');
      setEnergyDb(e.energyDb);
      optionsRef.current.onVoiceActivity?.(e);
    });
    const unsubStart = VAD.on('speechStart', (e) => {
      optionsRef.current.onSpeechStart?.(e);
    });
    const unsubEnd = VAD.on('speechEnd', (e) => {
      optionsRef.current.onSpeechEnd?.(e);
    });
    const unsubError = VAD.on('error', (e) => {
      setError(e);
      optionsRef.current.onError?.(e);
    });
    return () => {
      unsubActivity();
      unsubStart();
      unsubEnd();
      unsubError();
    };
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const running = await VAD.isRunning();
      if (running) await VAD.stop();
      await VAD.configure(optionsRef.current);
      await VAD.start();
      setIsRunning(true);
    } catch (e: unknown) {
      const err: VADError = {
        code: 'START_FAILED',
        message: e instanceof Error ? e.message : String(e),
      };
      setError(err);
    }
  }, []);

  const stop = useCallback(async () => {
    await VAD.stop();
    setIsRunning(false);
    setIsSpeaking(false);
    setIsNoise(false);
    setIsSilence(true);
  }, []);

  return {
    isSpeaking,
    isNoise,
    isSilence,
    energyDb,
    isRunning,
    start,
    stop,
    error,
  };
}
