import { NativeEventEmitter, Platform, PermissionsAndroid } from 'react-native';
import NativeRnVad from './NativeRnVad';
import type { VADOptions, VADEventName, VADEventMap } from './types';

const DEFAULT_OPTIONS: Required<VADOptions> = {
  sampleRate: 16000,
  frameMs: 20,
  mode: 2,
  silenceTimeoutMs: 500,
  noiseThresholdDb: -30,
  speechOnsetMs: 150,
  emitPcm: false,
  recordSegments: false,
  segmentOutputDir: '',
  adaptiveThreshold: true,
  adaptiveMarginDb: 15,
  adaptationRate: 0.995,
  initialNoiseFloor: -45,
  minNoiseFloor: -80,
};

type EventSubscriptionModule = {
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
};

const emitter =
  Platform.OS !== 'web'
    ? new NativeEventEmitter(NativeRnVad as unknown as EventSubscriptionModule)
    : null;

const VAD = {
  async configure(options: VADOptions = {}): Promise<void> {
    const merged = { ...DEFAULT_OPTIONS, ...options };
    await NativeRnVad.configure({
      sampleRate: merged.sampleRate,
      frameMs: merged.frameMs,
      mode: merged.mode,
      silenceTimeoutMs: merged.silenceTimeoutMs,
      noiseThresholdDb: merged.noiseThresholdDb,
      speechOnsetMs: merged.speechOnsetMs,
      emitPcm: merged.emitPcm,
      recordSegments: merged.recordSegments,
      segmentOutputDir: merged.segmentOutputDir,
      adaptiveThreshold: merged.adaptiveThreshold,
      adaptiveMarginDb: merged.adaptiveMarginDb,
      adaptationRate: merged.adaptationRate,
      initialNoiseFloor: merged.initialNoiseFloor,
      minNoiseFloor: merged.minNoiseFloor,
    });
  },

  async start(): Promise<void> {
    await NativeRnVad.start();
  },

  async stop(): Promise<void> {
    await NativeRnVad.stop();
  },

  async destroy(): Promise<void> {
    await NativeRnVad.destroy();
  },

  async isRunning(): Promise<boolean> {
    return NativeRnVad.isRunning();
  },

  async requestMicPermission(): Promise<boolean> {
    if (Platform.OS === 'web') {
      return false;
    }
    if (Platform.OS === 'android') {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    }
    return NativeRnVad.requestMicPermission();
  },

  on<K extends VADEventName>(
    event: K,
    callback: (data: VADEventMap[K]) => void
  ): () => void {
    if (!emitter) {
      return () => {};
    }
    const sub = emitter.addListener(`RnVad.${event}`, (data: unknown) => {
      if (typeof data === 'object' && data !== null) {
        callback(data as VADEventMap[K]);
      }
    });
    return () => sub.remove();
  },
};

export { VAD };
