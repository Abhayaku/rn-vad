package com.rnvad

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.bridge.UiThreadUtil

class RnVadModule(reactContext: ReactApplicationContext) :
    NativeRnVadSpec(reactContext) {

    private var captureThread: AudioCaptureThread? = null
    private var config = VADConfig()

    override fun getName() = NAME

    override fun configure(options: ReadableMap, promise: Promise) {
        if (captureThread != null) {
            promise.reject("ALREADY_RUNNING", "Cannot configure while VAD is running — call stop() first")
            return
        }
        config = VADConfig(
            sampleRate = options.getIntOr("sampleRate", 16000),
            frameMs = options.getIntOr("frameMs", 20),
            mode = options.getIntOr("mode", 2),
            silenceTimeoutMs = options.getDoubleOr("silenceTimeoutMs", 500.0).toLong(),
            noiseThresholdDb = options.getDoubleOr("noiseThresholdDb", -30.0).toFloat(),
            speechOnsetMs = options.getDoubleOr("speechOnsetMs", 150.0).toLong(),
            emitPcm = options.getBoolOr("emitPcm", false),
            recordSegments = options.getBoolOr("recordSegments", false),
            segmentOutputDir = options.getStringOr("segmentOutputDir", ""),
            adaptiveThreshold = options.getBoolOr("adaptiveThreshold", true),
            adaptiveMarginDb = options.getDoubleOr("adaptiveMarginDb", 15.0),
            adaptationRate = options.getDoubleOr("adaptationRate", 0.995),
            initialNoiseFloor = options.getDoubleOr("initialNoiseFloor", -45.0),
            minNoiseFloor = options.getDoubleOr("minNoiseFloor", -80.0),
        )
        promise.resolve(null)
    }

    override fun start(promise: Promise) {
        if (captureThread != null) {
            promise.reject("ALREADY_RUNNING", "VAD already running")
            return
        }
        val thread = AudioCaptureThread(config, reactApplicationContext)
        thread.onSpeechStart = { timestamp ->
            emit("RnVad.speechStart", Arguments.createMap().apply {
                putDouble("timestamp", timestamp.toDouble())
            })
        }
        thread.onSpeechEnd = { duration, timestamp, segmentPath ->
            emit("RnVad.speechEnd", Arguments.createMap().apply {
                putDouble("duration", duration.toDouble())
                putDouble("timestamp", timestamp.toDouble())
                segmentPath?.let { putString("segmentPath", it) }
            })
        }
        thread.onActivity = { isSpeaking, type, energyDb, noiseFloor, threshold, pcmFrame ->
            emit("RnVad.voiceActivity", Arguments.createMap().apply {
                putBoolean("isSpeaking", isSpeaking)
                putString("type", type)
                putDouble("energyDb", energyDb.toDouble())
                putDouble("noiseFloor", noiseFloor)
                putDouble("threshold", threshold)
                putDouble("timestamp", System.currentTimeMillis().toDouble())
            })
            pcmFrame?.let { frame ->
                val arr = Arguments.createArray()
                for (s in frame) arr.pushInt(s.toInt())
                emit("RnVad.pcmData", Arguments.createMap().apply {
                    putArray("data", arr)
                    putInt("sampleRate", config.sampleRate)
                    putDouble("timestamp", System.currentTimeMillis().toDouble())
                })
            }
        }
        thread.onError = { code, message ->
            emit("RnVad.error", Arguments.createMap().apply {
                putString("code", code)
                putString("message", message)
            })
        }
        captureThread = thread
        try {
            thread.start()
            promise.resolve(null)
        } catch (e: IllegalArgumentException) {
            captureThread = null
            promise.reject("INVALID_CONFIG", e.message ?: "Invalid VAD configuration")
        } catch (e: Exception) {
            captureThread = null
            promise.reject("START_FAILED", e.message ?: "Failed to start audio capture")
        }
    }

    override fun stop(promise: Promise) {
        captureThread?.stop()
        captureThread = null
        promise.resolve(null)
    }

    override fun destroy(promise: Promise) {
        captureThread?.stop()
        captureThread = null
        promise.resolve(null)
    }

    override fun isRunning(promise: Promise) {
        promise.resolve(captureThread != null)
    }

    override fun requestMicPermission(promise: Promise) {
        val permission = android.Manifest.permission.RECORD_AUDIO
        val granted = reactApplicationContext.checkSelfPermission(permission) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED
        promise.resolve(granted)
    }

    override fun addListener(eventName: String) {}
    override fun removeListeners(count: Double) {}

    private fun emit(event: String, params: WritableMap) {
        if (!reactApplicationContext.hasActiveReactInstance()) {
            return
        }
        UiThreadUtil.runOnUiThread {
            if (!reactApplicationContext.hasActiveReactInstance()) {
                return@runOnUiThread
            }
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(event, params)
        }
    }

    companion object {
        const val NAME = "RnVad"
    }
}

private fun ReadableMap.getIntOr(key: String, default: Int) =
    if (hasKey(key)) getInt(key) else default

private fun ReadableMap.getDoubleOr(key: String, default: Double) =
    if (hasKey(key)) getDouble(key) else default

private fun ReadableMap.getBoolOr(key: String, default: Boolean) =
    if (hasKey(key)) getBoolean(key) else default

private fun ReadableMap.getStringOr(key: String, default: String) =
    if (hasKey(key)) getString(key) ?: default else default
