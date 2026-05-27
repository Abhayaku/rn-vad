export type VADMode = 0 | 1 | 2 | 3;
export type SampleRate = 8000 | 16000 | 32000 | 48000;
export type FrameMs = 10 | 20 | 30;
export type ActivityType = 'speech' | 'noise' | 'silence';

export interface VADOptions {
  sampleRate?: SampleRate; // Microphone sample rate (Hz)
  frameMs?: FrameMs; // Frame duration fed to WebRTC VAD
  mode?: VADMode; // 0=Quality 1=LowBitrate 2=Aggressive 3=VeryAggressive
  silenceTimeoutMs?: number; // Silence ms before speechEnd fires
  noiseThresholdDb?: number; // dBFS threshold — below = silence. Lower = more sensitive (picks up quiet sounds); higher = less sensitive (requires louder input). Typical speech is −20 to −10 dBFS.
  speechOnsetMs?: number; // Consecutive speech ms required before speechStart fires — prevents noise spikes from triggering speech
  emitPcm?: boolean; // Emit raw PCM buffers via pcmData event
  recordSegments?: boolean; // Auto-save speech segments as WAV
  segmentOutputDir?: string; // Directory to write WAV files (default: app cache dir)
}

export interface VADActivity {
  isSpeaking: boolean;
  type: ActivityType;
  energyDb: number;
  noiseFloor: number;
  threshold: number;
  timestamp: number;
}

export interface SpeechStartEvent {
  timestamp: number;
}

export interface SpeechEndEvent {
  duration: number;
  timestamp: number;
  segmentPath?: string;
}

export interface PCMDataEvent {
  data: number[];
  sampleRate: number;
  timestamp: number;
}

export interface VADError {
  code: string;
  message: string;
}

export type VADEventMap = {
  speechStart: SpeechStartEvent;
  speechEnd: SpeechEndEvent;
  voiceActivity: VADActivity;
  pcmData: PCMDataEvent;
  error: VADError;
};

export type VADEventName = keyof VADEventMap;
