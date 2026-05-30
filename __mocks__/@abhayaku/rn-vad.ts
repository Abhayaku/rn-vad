import { jest } from '@jest/globals';
import type { VADOptions, VADEventName, VADEventMap } from '../../src/types';
import type { UseVADOptions, UseVADResult } from '../../src/useVAD';

const VAD = {
  configure: jest.fn((_options?: VADOptions) => Promise.resolve()),
  start: jest.fn(() => Promise.resolve()),
  stop: jest.fn(() => Promise.resolve()),
  destroy: jest.fn(() => Promise.resolve()),
  isRunning: jest.fn(() => Promise.resolve(false)),
  requestMicPermission: jest.fn(() => Promise.resolve(true)),
  on: jest.fn(
    <K extends VADEventName>(
      _event: K,
      _callback: (data: VADEventMap[K]) => void
    ) =>
      () => {}
  ),
};

function useVAD(_options: UseVADOptions = {}): UseVADResult {
  return {
    isSpeaking: false,
    isNoise: false,
    isSilence: true,
    energyDb: -Infinity,
    isRunning: false,
    start: jest.fn(() => Promise.resolve()),
    stop: jest.fn(() => Promise.resolve()),
    error: null,
  };
}

export { VAD, useVAD };
