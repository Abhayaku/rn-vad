export type VADMode = 0 | 1 | 2 | 3;
export type SampleRate = 8000 | 16000 | 32000 | 48000;
export type FrameMs = 10 | 20 | 30;
export type ActivityType = 'speech' | 'noise' | 'silence';

export interface VADOptions {
  /** Microphone sample rate in Hz. Default: 16000 */
  sampleRate?: SampleRate;
  /** Duration of each audio frame fed to WebRTC VAD. Default: 20 */
  frameMs?: FrameMs;
  /** WebRTC VAD aggressiveness: 0 = quality, 3 = very aggressive. Default: 2 */
  mode?: VADMode;
  /** Consecutive silence ms required after speech before speechEnd fires. Default: 500 */
  silenceTimeoutMs?: number;
  /** Fixed dBFS speech threshold when adaptiveThreshold is false. Default: -30 */
  noiseThresholdDb?: number;
  /** Consecutive speech ms required before speechStart fires — prevents noise spikes. Default: 150 */
  speechOnsetMs?: number;
  /** Emit raw PCM samples via pcmData event on every frame. Default: false */
  emitPcm?: boolean;
  /** Auto-save each speech segment as a WAV file. Default: false */
  recordSegments?: boolean;
  /** Directory for saved WAV files. Default: system temp directory */
  segmentOutputDir?: string;
  /** Adapt speech threshold to ambient noise in real time. Default: true */
  adaptiveThreshold?: boolean;
  /** dB above the adaptive noise floor that becomes the speech threshold. Default: 15 */
  adaptiveMarginDb?: number;
  /** EMA alpha for upward floor drift (0–1). Higher = slower adaptation. Default: 0.995 */
  adaptationRate?: number;
  /** dBFS starting noise floor estimate before adaptation kicks in. Default: -45 */
  initialNoiseFloor?: number;
  /** dBFS floor clamp — noise floor never drops below this. Default: -80 */
  minNoiseFloor?: number;
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
