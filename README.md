# rn-vad

Real-time Voice Activity Detection (VAD) for React Native. Classifies microphone input as **speech**, **noise**, or **silence** on every audio frame — on both iOS and Android.

Built on [libfvad](https://github.com/dpirch/libfvad) (WebRTC VAD C library, BSD-3-Clause). New Architecture (TurboModules) only.

---

## Features

- Real-time speech vs silence detection
- Three-way classification: `speech` | `noise` | `silence`
- Adaptive noise floor — threshold adjusts to ambient noise in real time
- Configurable aggressiveness (4 WebRTC VAD modes)
- Energy/dBFS level events for waveform meters
- Raw PCM chunk callbacks (for streaming to STT)
- Auto-save speech segments as WAV files
- Microphone permission helper
- TypeScript — fully typed
- React hook (`useVAD`) + imperative (`VAD`) API
- iOS: AVAudioEngine · Android: AudioRecord + NDK/CMake

---

## Requirements

| Requirement | Version |
|---|---|
| React Native | >= 0.71 (New Architecture enabled) |
| iOS | >= 13.0 |
| Android minSdk | 24 |
| NDK | r21+ |

---

## Installation

```sh
npm install rn-vad
# or
yarn add rn-vad
```

### iOS

```sh
cd ios && pod install
```

No extra setup — libfvad C sources are vendored in the package.

Add the microphone usage description to your app's `Info.plist`:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>Microphone is required for voice detection.</string>
```

### Android

`RECORD_AUDIO` is declared in the library manifest and merged automatically. No manual changes needed.

---

## Quick Start

### Hook API (recommended for React components)

```tsx
import { useVAD } from 'rn-vad';

function MicButton() {
  const { isSpeaking, isNoise, energyDb, isRunning, start, stop } = useVAD({
    mode: 2,
    onSpeechStart: () => console.log('speech started'),
    onSpeechEnd: (e) => {
      console.log(`ended — ${e.duration}ms`);
      if (e.segmentPath) console.log('saved to:', e.segmentPath);
    },
  });

  return (
    <>
      <Text>{isSpeaking ? 'SPEAKING' : isNoise ? 'NOISE' : 'SILENT'}</Text>
      <Text>{energyDb.toFixed(1)} dBFS</Text>
      <Button title={isRunning ? 'Stop' : 'Start'} onPress={isRunning ? stop : start} />
    </>
  );
}
```

### Imperative API (for services / outside components)

```ts
import { VAD } from 'rn-vad';

const granted = await VAD.requestMicPermission();
if (!granted) return;

await VAD.configure({
  mode: 2,
  silenceTimeoutMs: 500,
  recordSegments: true,
});

await VAD.start();

const unsub1 = VAD.on('voiceActivity', (e) => {
  console.log(e.type, e.energyDb); // 'speech' | 'noise' | 'silence'
});

const unsub2 = VAD.on('speechEnd', (e) => {
  console.log('WAV saved at:', e.segmentPath);
});

// Later:
await VAD.stop();
unsub1();
unsub2();
```

---

## API Reference

### `VAD.configure(options): Promise<void>`

Must be called before `start()`. All options are optional — defaults are applied for any omitted field.

| Option | Type | Default | Description |
|---|---|---|---|
| `sampleRate` | `8000\|16000\|32000\|48000` | `16000` | Microphone sample rate (Hz) |
| `frameMs` | `10\|20\|30` | `20` | Frame duration fed to WebRTC VAD |
| `mode` | `0\|1\|2\|3` | `2` | VAD aggressiveness (see table below) |
| `silenceTimeoutMs` | `number` | `500` | Silence ms before `speechEnd` fires |
| `noiseThresholdDb` | `number` | `-30` | Fixed dBFS threshold when `adaptiveThreshold: false` |
| `speechOnsetMs` | `number` | `150` | Consecutive speech ms required before `speechStart` fires — prevents noise spikes from triggering |
| `emitPcm` | `boolean` | `false` | Emit raw PCM via `pcmData` event |
| `recordSegments` | `boolean` | `false` | Auto-save speech segments as WAV files |
| `segmentOutputDir` | `string` | system temp | Output directory for WAV files |
| `adaptiveThreshold` | `boolean` | `true` | Adapt noise floor to ambient in real time. When `false`, uses fixed `noiseThresholdDb` |
| `adaptiveMarginDb` | `number` | `15` | dB above the adaptive noise floor that sets the speech threshold |
| `adaptationRate` | `number` | `0.995` | EMA alpha for upward floor drift (0–1). Higher = slower adaptation |
| `initialNoiseFloor` | `number` | `-45` | dBFS starting estimate before adaptation kicks in |
| `minNoiseFloor` | `number` | `-80` | dBFS floor clamp — noise floor never drops below this |

#### VAD Modes

| Mode | Name | Best for |
|---|---|---|
| `0` | Quality | Clean studio audio |
| `1` | Low bitrate | Telephony / low bandwidth |
| `2` | Aggressive | General use ← **default** |
| `3` | Very aggressive | Noisy environments |

### `VAD.start(): Promise<void>`

Starts microphone capture and VAD processing.

### `VAD.stop(): Promise<void>`

Stops capture. Native resources kept alive for fast restart.

### `VAD.destroy(): Promise<void>`

Stops capture and fully releases all native resources.

### `VAD.isRunning(): Promise<boolean>`

### `VAD.requestMicPermission(): Promise<boolean>`

Requests microphone permission. Returns whether granted.
- iOS: calls `AVAudioSession.requestRecordPermission`
- Android: calls `PermissionsAndroid.request(RECORD_AUDIO)` — shows OS permission dialog

### `VAD.on(event, callback): () => void`

Subscribes to an event. Returns an unsubscribe function.

---

## Events

### `voiceActivity` — fires every frame

```ts
VAD.on('voiceActivity', (e: VADActivity) => {
  e.isSpeaking  // true for the full duration of a speech segment (speechStart → speechEnd)
  e.type        // 'speech' | 'noise' | 'silence' — per-frame classification
  e.energyDb    // dBFS of current frame (typically -160 to 0)
  e.noiseFloor  // dBFS — current adaptive noise floor estimate
  e.threshold   // dBFS — active speech threshold (noiseFloor + adaptiveMarginDb)
  e.timestamp   // epoch ms
});
```

> `isSpeaking` reflects the FSM state — it is `true` from `speechStart` through `speechEnd`, regardless of per-frame energy dips. `type` reflects the current frame's per-frame classification.

### `speechStart` — speech segment began

```ts
VAD.on('speechStart', (e: SpeechStartEvent) => {
  e.timestamp
});
```

### `speechEnd` — speech segment ended

Fires after `silenceTimeoutMs` of consecutive non-speech frames.

```ts
VAD.on('speechEnd', (e: SpeechEndEvent) => {
  e.duration      // ms of speech segment
  e.timestamp     // epoch ms
  e.segmentPath   // absolute path to WAV (only when recordSegments: true)
});
```

### `pcmData` — raw PCM (only when `emitPcm: true`)

```ts
VAD.on('pcmData', (e: PCMDataEvent) => {
  e.data        // number[] — int16 samples
  e.sampleRate
  e.timestamp
});
```

### `error`

```ts
VAD.on('error', (e: VADError) => {
  e.code
  e.message
});
```

---

## Classification Logic

```
threshold = adaptiveThreshold
  ? noiseFloor + adaptiveMarginDb   ← real-time adaptive (default)
  : noiseThresholdDb                ← fixed

Per-frame signal (outside a speech segment):
  energyDb > threshold  AND  webrtcVad == 1  →  type = 'noise'  (speech onset accumulating)
  energyDb > threshold  AND  webrtcVad == 0  →  type = 'noise'
  energyDb ≤ threshold                        →  type = 'silence'

During a speech segment (after speechStart fires):
  type = 'speech', isSpeaking = true — until silenceTimeoutMs of non-speech elapses
```

Speech onset requires `speechOnsetMs` of consecutive speech signal before `speechStart` fires. A single non-speech frame resets the onset counter.

### Adaptive noise floor

When `adaptiveThreshold: true` (default), the noise floor tracks ambient energy using an asymmetric EMA:

- **Downward (room quieter):** α = 0.90 — adapts in ~200ms
- **Upward (room louder):** α = `adaptationRate` (default 0.995) — resists noise bursts, drifts gradually

The floor only updates when the VAD is **not in a speech segment** and **not in the post-speech hold window** (30 frames ≈ 600ms after each `speechEnd`). This prevents speech and reverb from corrupting the floor estimate.

---

## `useVAD` Hook

```ts
const result = useVAD(options: UseVADOptions): UseVADResult
```

### Options (`UseVADOptions`)

All `VADOptions` fields plus:

| Field | Type |
|---|---|
| `onSpeechStart` | `(e: SpeechStartEvent) => void` |
| `onSpeechEnd` | `(e: SpeechEndEvent) => void` |
| `onVoiceActivity` | `(e: VADActivity) => void` |
| `onError` | `(e: VADError) => void` |

### Returns (`UseVADResult`)

| Field | Type | Description |
|---|---|---|
| `isSpeaking` | `boolean` | `true` for the full duration of a speech segment |
| `isNoise` | `boolean` | Current frame is above threshold but not in a speech segment |
| `isSilence` | `boolean` | Current frame is below threshold |
| `energyDb` | `number` | Current frame energy in dBFS |
| `isRunning` | `boolean` | VAD is active |
| `start` | `() => Promise<void>` | Configure and start VAD |
| `stop` | `() => Promise<void>` | Stop VAD |
| `error` | `VADError \| null` | Last error |

---

## Testing / Jest Mock

```ts
jest.mock('rn-vad');
// All methods return resolved promises. useVAD returns stub state.
```

---

## Architecture

```
JS (TypeScript)
  └── VAD.ts / useVAD.ts
        └── NativeRnVad.ts  ← TurboModule spec (codegen source of truth)
              ├── iOS: RNVad.mm  (all audio ops dispatched to main thread)
              │     ├── AVAudioEngine tap → PCM frames → accumulator
              │     ├── VADProcessor.mm (libfvad C wrapper, dBFS calc)
              │     └── WAV segment writer (NSFileHandle)
              └── Android: RNVadModule.kt
                    ├── AudioCaptureThread.kt (AudioRecord loop, VAD FSM)
                    ├── VadProcessor.kt (JNI → libfvad)
                    └── WAV segment writer
```

---

## Attribution

This package vendors [libfvad](https://github.com/dpirch/libfvad) — a standalone WebRTC VAD library by Daniel Pirch, derived from the [WebRTC project](https://webrtc.org/) by Google. Licensed under BSD 3-Clause (see `ios/fvad/LICENSE`).

---

## License

UNLICENSED — Copyright (c) 2026 Abhay Upadhyay. All rights reserved.
