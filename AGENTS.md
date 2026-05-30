# agents.md — rn-vad Agent Roles & Boundaries

Personal project by Abhay Upadhyay (abhayaku21@gmail.com).
Defines agent roles, file ownership, and coordination rules for AI agents working on `rn-vad`.

---

## Agent Roles

### ios-agent
**Owns:** All files under `ios/` except `ios/fvad/` (vendored).

Responsibilities:
- `ios/RNVad.h` — ObjC header
- `ios/RNVad.mm` — TurboModule, AVAudioEngine tap, event emission, WAV writing, silence FSM
- `ios/VADProcessor.h` / `ios/VADProcessor.mm` — ObjC++ libfvad wrapper, RMS → dBFS calc
- `rn-vad.podspec` — CocoaPods manifest
- iOS-specific bugs, AVAudioSession config, iOS permission flow (`AVAudioSession.requestRecordPermission`)

**Thread rule:** ALL `AVAudioEngine` and `AVAudioSession` operations in `RNVad.mm` MUST run inside `dispatch_async(dispatch_get_main_queue(), ^{...})`. RN TurboModule calls arrive on a background thread; iOS 16+ throws `NSInternalInconsistencyException` for AVAudioEngine access off the main thread. Do not remove or bypass this dispatch.

**Must not touch:** `android/`, `src/NativeRNVad.ts` without coordinating with js-agent.

---

### android-agent
**Owns:** All files under `android/` except `android/src/main/cpp/fvad/` (vendored).

Responsibilities:
- `android/build.gradle` — Gradle config, CMake linkage
- `android/src/main/cpp/CMakeLists.txt` — NDK build, lists all fvad C source files
- `android/src/main/cpp/vad_jni.cpp` — JNI C++ bridge to libfvad
- `android/src/main/java/com/rnvad/RNVadModule.kt` — TurboModule, event emission
- `android/src/main/java/com/rnvad/RNVadPackage.kt` — ReactPackage
- `android/src/main/java/com/rnvad/AudioCaptureThread.kt` — AudioRecord loop, VAD FSM, WAV writing
- `android/src/main/java/com/rnvad/VadProcessor.kt` — JNI wrapper, dBFS calculation
- `android/src/main/java/com/rnvad/VADConfig.kt` — config data class
- `android/src/main/AndroidManifest.xml`
- Android-specific bugs, AudioRecord behavior, Android permission handling

**Must not touch:** `ios/`, `src/NativeRNVad.ts` without coordinating with js-agent.

---

### js-agent
**Owns:** All files under `src/` and `__mocks__/`.

Responsibilities:
- `src/types.ts` — all shared TypeScript types
- `src/NativeRNVad.ts` — TurboModule codegen spec (coordinate changes with both native agents)
- `src/VAD.ts` — imperative API, event subscription wrappers
- `src/useVAD.ts` — React hook, state management, cleanup
- `src/index.ts` — barrel exports
- `__mocks__/rn-vad.ts` — Jest mock
- TypeScript strict compliance, hook cleanup correctness, API ergonomics

**Must not touch:** `ios/`, `android/`.

**Key constraint:** Any change to `src/NativeRNVad.ts` must be paired with implementation in both `ios/RNVad.mm` and `android/src/main/java/com/rnvad/RNVadModule.kt`. Never merge an interface-only change without both native implementations.

---

### docs-agent
**Owns:** All markdown documentation files.

Responsibilities:
- `README.md` — public docs, install guide, full API reference
- `CLAUDE.md` — AI instructions for this repo
- `agents.md` — this file
- `rn-vad-plan.md` — architectural plan
- `contract.md` — task tracker (update statuses, add new tasks)
- `example/` documentation and comments

**Must not touch:** Any source code files in `src/`, `ios/`, `android/`.

---

### infra-agent
**Owns:** Build tooling, config files, CI.

Responsibilities:
- `package.json` — scripts, deps, codegenConfig, react-native-builder-bob config
- `tsconfig.json`
- `scripts/` — build helper scripts (setup-fvad.sh removed; fvad sources are now checked in)
- `.eslintrc.*`, `.prettierrc.*`, `.gitignore`
- `example/package.json`, example app build setup
- GitHub Actions / CI config
- `release-it` config, `npm publish` prep

**Must not touch:** Business logic in `src/`, native files.

---

## Coordination Rules

### NativeRNVad.ts changes (cross-agent)
All three agents must act atomically:
1. **js-agent** — update `src/NativeRNVad.ts` + `src/types.ts` + `src/VAD.ts` + `__mocks__/rn-vad.ts`
2. **ios-agent** — implement new method in `ios/RNVad.mm`
3. **android-agent** — implement new method in `RNVadModule.kt`

Never merge a partial implementation (interface change without both platform impls).

### New event added (cross-agent)
1. ios-agent: add to `supportedEvents` in `RNVad.mm`, emit with `RNVad.<name>` prefix
2. android-agent: emit via `DeviceEventManagerModule` with same `RNVad.<name>` name
3. js-agent: add to `VADEventMap` in `types.ts`, add handler in `VAD.ts`, update mock

### VAD classification logic change (cross-agent)
Must stay identical on both platforms:
- iOS: `RNVad.mm` → `processFrame:samples:` method
- Android: `AudioCaptureThread.kt` → `processFrame()` function

The adaptive noise floor (asymmetric EMA, hold counter, floor clamp) lives in both these methods and must be kept in sync. See CLAUDE.md → "Adaptive noise floor" for the exact algorithm.

---

## File Ownership Matrix

| File / Directory | ios | android | js | docs | infra |
|---|:---:|:---:|:---:|:---:|:---:|
| `ios/RNVad.h` / `.mm` | ✅ | | | | |
| `ios/VADProcessor.h` / `.mm` | ✅ | | | | |
| `ios/fvad/` | ❌ vendored | | | | |
| `rn-vad.podspec` | ✅ | | | | |
| `android/build.gradle` | | ✅ | | | |
| `android/src/main/cpp/*.txt / *.cpp` | | ✅ | | | |
| `android/src/main/cpp/fvad/` | | ❌ vendored | | | |
| `android/src/main/java/com/rnvad/` | | ✅ | | | |
| `android/src/main/AndroidManifest.xml` | | ✅ | | | |
| `src/NativeRNVad.ts` | 🤝 coord | 🤝 coord | ✅ | | |
| `src/types.ts` | | | ✅ | | |
| `src/VAD.ts` / `useVAD.ts` / `index.ts` | | | ✅ | | |
| `__mocks__/rn-vad.ts` | | | ✅ | | |
| `README.md` / `*.md` | | | | ✅ | |
| `contract.md` statuses | 🤝 all | 🤝 all | 🤝 all | ✅ | 🤝 all |
| `package.json` | | | | | ✅ |
| `tsconfig.json` | | | | | ✅ |
| `scripts/` | | | | | ✅ |

---

## Contract Protocol

Every agent must follow this workflow:

```
1. Read contract.md
2. Find TODO task matching your role
3. Set status → IN PROGRESS, add: [agent-role] [YYYY-MM-DD]
4. Implement
5. Set status → COMPLETE, add completion date
```

If a task is `IN PROGRESS`, skip it. Do not override another agent's work-in-progress.

---

## Vendored Code — Never Edit

| Directory | Source | How to update |
|---|---|---|
| `ios/fvad/` | [dpirch/libfvad](https://github.com/dpirch/libfvad) | Manually replace C files; keep `common.h`, `include/`, `vad/` in sync |
| `android/src/main/cpp/fvad/` | Mirror of `ios/fvad/` | Copy from `ios/fvad/` after any update; keep both dirs identical |

Do not edit core C logic files. The podspec compiles `ios/fvad/fvad.c` and `ios/fvad/vad/**` (subdirectory). Root-level duplicates (`ios/fvad/vad_core.c` etc.) are NOT compiled by CocoaPods. Always keep `ios/fvad/` and `android/src/main/cpp/fvad/` in sync.
