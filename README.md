# rn-vad

Voice Activity Detection (VAD) for React Native. Detects **speech** (positive), **background noise** (negative), and **silence** in real time — on both iOS and Android.

Built on [libfvad](https://github.com/dpirch/libfvad) (standalone WebRTC VAD C library). New Architecture (TurboModules) only.

---

## Features

- Real-time speech vs silence detection
- Three-way classification: `speech` | `noise` | `silence`
- Configurable aggressiveness (4 WebRTC VAD modes)
- Energy/dB level events for waveform meters
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

No extra setup needed — libfvad C sources are vendored in the package.

Add the microphone usage description to your app's `Info.plist`:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>Microphone is required for voice detection.</string>
```

### Android permissions

`RECORD_AUDIO` is declared in the library manifest and merged automatically.

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
  sampleRate: 16000,
  frameMs: 20,
  mode: 2,
  silenceTimeoutMs: 800,
  noiseThresholdDb: -45,
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

Must be called before `start()`.

| Option | Type | Default | Description |
|---|---|---|---|
| `sampleRate` | `8000\|16000\|32000\|48000` | `16000` | Microphone sample rate (Hz) |
| `frameMs` | `10\|20\|30` | `20` | Frame duration fed to WebRTC VAD |
| `mode` | `0\|1\|2\|3` | `2` | VAD aggressiveness (see table below) |
| `silenceTimeoutMs` | `number` | `800` | Silence ms before `speechEnd` fires |
| `noiseThresholdDb` | `number` | `-30` | dBFS threshold — below = silence. Lower = more sensitive (picks up quiet sounds); higher = less sensitive (requires louder input). Typical speech is −20 to −10 dBFS. |
| `speechOnsetMs` | `number` | `60` | Consecutive speech ms required before `speechStart` fires — prevents noise spikes from triggering speech |
| `emitPcm` | `boolean` | `false` | Emit raw PCM via `pcmData` event |
| `recordSegments` | `boolean` | `false` | Auto-save speech segments as WAV |
| `segmentOutputDir` | `string` | app cache | Output dir for WAV files |

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
  e.isSpeaking  // true when type === 'speech'
  e.type        // 'speech' | 'noise' | 'silence'
  e.energyDb    // dBFS (typically -160 to 0)
  e.timestamp   // epoch ms
});
```

### `speechStart` — speech segment began

```ts
VAD.on('speechStart', (e: SpeechStartEvent) => {
  e.timestamp
});
```

### `speechEnd` — speech segment ended

Fires after `silenceTimeoutMs` of non-speech.

```ts
VAD.on('speechEnd', (e: SpeechEndEvent) => {
  e.duration      // ms of speech
  e.timestamp     // epoch ms
  e.segmentPath   // path to WAV (only when recordSegments=true)
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
energyDb > noiseThresholdDb  AND  webrtcVad == 1  →  'speech'   (positive — user speaking)
energyDb > noiseThresholdDb  AND  webrtcVad == 0  →  'noise'    (negative — background sound)
energyDb ≤ noiseThresholdDb                        →  'silence'
```

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
| `isSpeaking` | `boolean` | Current frame is speech |
| `isNoise` | `boolean` | Current frame is noise |
| `isSilence` | `boolean` | Current frame is silence |
| `energyDb` | `number` | Current energy dBFS |
| `isRunning` | `boolean` | VAD active |
| `start` | `() => Promise<void>` | Calls configure + start |
| `stop` | `() => Promise<void>` | Stops VAD |
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

## Post-v1 Roadmap

- Noise suppression (RNNoise C library) pre-processing
- Wakeword detection (Picovoice Porcupine)
- Streaming STT bridge (Whisper / Deepgram)
- Silence padding around segments
- Auto Gain Control
- `react-native-web` + WebAudio API fallback
- Expo module variant (`expo-modules-core`)

---

## License

UNLICENSED — Copyright (c) 2026 Abhay Upadhyay. All rights reserved.
