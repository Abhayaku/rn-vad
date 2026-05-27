# CLAUDE.md — rn-vad

Personal project by Abhay Upadhyay (abhayaku21@gmail.com). UNLICENSED.

Instructions for Claude Code and AI agents working in this repository.

---

## Project Overview

`rn-vad` is a React Native npm package for Voice Activity Detection (VAD).
- Detects: `speech` (positive) | `noise` (negative) | `silence`
- Engine: libfvad (WebRTC VAD C library, BSD license)
- Architecture: New Architecture only (TurboModules, RN >= 0.71)
- Platforms: iOS (AVAudioEngine) + Android (AudioRecord + JNI/CMake)
- JS API: imperative `VAD` object + `useVAD` React hook

**Before starting any work:** read `contract.md` for task status, read `rn-vad-plan.md` for full architectural plan.

---

## Repository Layout

```
rn-vad/
├── src/                              ← TypeScript (JS layer)
│   ├── NativeRnVad.ts                ← TurboModule codegen spec — source of truth for native API shape
│   ├── VAD.ts                        ← Imperative API
│   ├── useVAD.ts                     ← React hook
│   ├── types.ts                      ← All shared types
│   └── index.ts                      ← Barrel export
├── ios/
│   ├── fvad/                         ← libfvad C sources (vendored, checked in)
│   │   ├── common.h                  ← WebRTC macro shims (RTC_DCHECK, arraysize, bool)
│   │   ├── fvad.h                    ← Flat copy of public header (used by fvad.c itself)
│   │   ├── fvad.c                    ← Main libfvad entry point
│   │   ├── include/fvad.h            ← Public header (included via search path by VADProcessor.mm)
│   │   ├── vad/                      ← VAD core — these are in podspec source_files
│   │   │   ├── vad_core.c / .h
│   │   │   ├── vad_filterbank.c / .h
│   │   │   ├── vad_gmm.c / .h
│   │   │   └── vad_sp.c / .h
│   │   └── signal_processing/        ← SPL resampling + filter sources
│   ├── RNVad.h / RNVad.mm            ← TurboModule + AVAudioEngine + WAV writer
│   └── VADProcessor.h / VADProcessor.mm ← ObjC++ libfvad wrapper + energy calc
├── android/
│   ├── src/main/cpp/
│   │   ├── fvad/                     ← libfvad C sources (mirror of ios/fvad/, same structure)
│   │   ├── CMakeLists.txt            ← NDK build — lists all fvad C files
│   │   └── vad_jni.cpp               ← JNI bridge to libfvad
│   └── src/main/java/com/rnvad/
│       ├── RNVadModule.kt            ← TurboModule entry + event emission
│       ├── RNVadPackage.kt           ← ReactPackage registration
│       ├── AudioCaptureThread.kt     ← AudioRecord loop + VAD FSM + WAV writer
│       ├── VadProcessor.kt           ← JNI wrapper + dBFS calculation
│       └── VADConfig.kt              ← Config data class
├── __mocks__/rn-vad.ts               ← Jest mock
├── contract.md                       ← TASK TRACKER — check before working
├── agents.md                         ← Agent roles and boundaries
├── rn-vad-plan.md                    ← Full architectural plan
└── README.md                         ← Public documentation
```

---

## Critical Constraints

1. **libfvad C sources are checked in** — `ios/fvad/` and `android/src/main/cpp/fvad/` are vendored and committed. No setup script needed.
   - Root-level `ios/fvad/vad_core.c` etc. are flat duplicates; the podspec includes only `ios/fvad/vad/**` subdirectory versions. Do not change this.
   - Do not edit core C logic files.
2. **New Architecture only** — no Bridge/NativeModules fallback. Min RN 0.71.
3. **NativeRnVad.ts is the codegen source of truth** — any method signature change requires updating BOTH `ios/RNVad.mm` AND `android/src/main/java/com/rnvad/RNVadModule.kt` simultaneously.
4. **Event names are prefixed `RnVad.`** — e.g. `RnVad.speechStart`, `RnVad.voiceActivity`. Do not change without updating `VAD.ts` listeners.
5. **libfvad frame constraint** — `fvad_process()` accepts only 10ms, 20ms, or 30ms frames at 8/16/32/48 kHz exactly. Wrong frame size returns `-1`.
6. **WAV header** is 44 bytes, little-endian PCM. iOS (`RNVad.mm`) and Android (`AudioCaptureThread.kt`) must write identical format.
7. **useVAD cleanup** — all event subscriptions must be unsubscribed in the `useEffect` cleanup. No subscriptions outside the effect.
8. **iOS AVAudioEngine must run on main thread** — `start` and `stop`/`destroy` dispatch ALL AVAudioEngine and AVAudioSession operations to `dispatch_get_main_queue()`. On iOS 16+ the thread checker throws `NSInternalInconsistencyException` if accessed from a background thread. Any new method that touches audio must do the same.

---

## Development Commands

```sh
# Type check
yarn typecheck          # runs: tsc --noEmit

# Lint
yarn lint

# Run tests
yarn test

# Build JS output (commonjs + esm + types)
yarn prepare            # runs: react-native-builder-bob build

# Build + run example app
cd example && yarn ios
cd example && yarn android
```

---

## Key Files

| File | Role |
|---|---|
| `src/NativeRnVad.ts` | TurboModule spec — defines native method signatures for codegen |
| `src/types.ts` | All TypeScript types exported from the package |
| `src/VAD.ts` | Imperative API wrapping NativeEventEmitter + TurboModule |
| `ios/RNVad.mm` | iOS implementation: AVAudioEngine tap → frames → VADProcessor → events |
| `ios/VADProcessor.mm` | ObjC++ wrapper: calls `fvad_process()`, computes dBFS |
| `android/.../AudioCaptureThread.kt` | Android: AudioRecord loop → frames → VadProcessor → events |
| `android/.../VadProcessor.kt` | Kotlin JNI wrapper: calls `nativeProcess()` |
| `android/src/main/cpp/vad_jni.cpp` | C++ JNI bridge to libfvad |
| `android/src/main/cpp/CMakeLists.txt` | NDK build — must list all fvad C source files |

---

## VAD Classification Logic

```
energyDb > noiseThresholdDb  AND  webrtcVad == 1  →  'speech'   (positive — user speaking)
energyDb > noiseThresholdDb  AND  webrtcVad == 0  →  'noise'    (negative — background sound)
energyDb ≤ noiseThresholdDb                        →  'silence'
```

Default `noiseThresholdDb = -30` dBFS. Implemented identically in iOS (`RNVad.mm:processFrame`) and Android (`AudioCaptureThread.kt:classifyActivity`).

---

## Workflow for Agents

1. Read `contract.md` — find a `TODO` task.
2. Set it to `IN PROGRESS` with your agent identifier and timestamp.
3. Read `agents.md` for role boundaries before touching files.
4. Implement the task.
5. Set task to `COMPLETE` in `contract.md`.
6. If adding new native method: `NativeRNVad.ts` → `RNVad.mm` → `RNVadModule.kt` → `VAD.ts` → `types.ts` → `__mocks__/rn-vad.ts`.

---

## Do Not

- Edit the core C logic in `ios/fvad/` or `android/src/main/cpp/fvad/` — vendored.
- Use Old Architecture APIs (`NativeModules` string lookup, old `NativeEventEmitter` patterns).
- Add `react-native` or `react` to `dependencies` — must stay in `peerDependencies`.
- Commit WAV segment files, audio recordings, or `.DS_Store`.
- Change `codegenConfig.name` (`RNVadSpec`) in `package.json` without regenerating native stubs.
- Add methods to `NativeRNVad.ts` without implementing on both platforms.
- Call `AVAudioEngine` or `AVAudioSession` APIs outside `dispatch_get_main_queue()` on iOS — crashes on iOS 16+ with `NSInternalInconsistencyException`.
