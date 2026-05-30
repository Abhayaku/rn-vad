package com.rnvad

internal data class VADConfig(
    val sampleRate: Int = 16000,
    val frameMs: Int = 20,
    val mode: Int = 2,
    val silenceTimeoutMs: Long = 500L,
    val noiseThresholdDb: Float = -30f,
    val speechOnsetMs: Long = 60L,
    val emitPcm: Boolean = false,
    val recordSegments: Boolean = false,
    val segmentOutputDir: String = "",
    val adaptiveThreshold: Boolean = true,
    val adaptiveMarginDb: Double = 12.0,
    val adaptationRate: Double = 0.995,
    val initialNoiseFloor: Double = -55.0,
    val minNoiseFloor: Double = -80.0,
)
