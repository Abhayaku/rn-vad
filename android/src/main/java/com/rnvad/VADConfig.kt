package com.rnvad

internal data class VADConfig(
    val sampleRate: Int = 16000,
    val frameMs: Int = 20,
    val mode: Int = 2,
    val silenceTimeoutMs: Long = 800L,
    val noiseThresholdDb: Float = -45f,
    val speechOnsetMs: Long = 60L,
    val emitPcm: Boolean = false,
    val recordSegments: Boolean = false,
    val segmentOutputDir: String = "",
)
