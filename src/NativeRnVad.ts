import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface VADNativeOptions {
  sampleRate: number;
  frameMs: number;
  mode: number;
  silenceTimeoutMs: number;
  noiseThresholdDb: number;
  speechOnsetMs: number;
  emitPcm: boolean;
  recordSegments: boolean;
  segmentOutputDir: string;
}

export interface Spec extends TurboModule {
  configure(options: VADNativeOptions): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  destroy(): Promise<void>;
  isRunning(): Promise<boolean>;
  requestMicPermission(): Promise<boolean>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('RnVad');
