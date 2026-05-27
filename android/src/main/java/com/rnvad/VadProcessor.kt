package com.rnvad

import kotlin.math.log10
import kotlin.math.sqrt

internal class VadProcessor(mode: Int, sampleRate: Int) {

    private var handle: Long = 0
    private var destroyed = false

    init {
        System.loadLibrary("rnvad")
        handle = nativeCreate()
        if (handle == 0L) throw IllegalStateException("fvad_new() failed — out of memory")
        if (nativeSetMode(handle, mode) != 0) throw IllegalArgumentException("Invalid VAD mode: $mode (must be 0–3)")
        if (nativeSetSampleRate(handle, sampleRate) != 0) throw IllegalArgumentException("Invalid sample rate: $sampleRate (must be 8000/16000/32000/48000)")
    }

    data class Result(val vadResult: Int, val energyDb: Float)

    fun process(frame: ShortArray): Result {
        if (destroyed || handle == 0L) return Result(-1, -160f)
        val vadResult = nativeProcess(handle, frame, frame.size)
        return Result(vadResult, computeEnergyDb(frame))
    }

    fun destroy() {
        if (destroyed) return
        destroyed = true
        if (handle != 0L) {
            nativeDestroy(handle)
            handle = 0L
        }
    }

    private fun computeEnergyDb(frame: ShortArray): Float {
        if (frame.isEmpty()) return -160f
        var sum = 0.0
        for (s in frame) sum += s.toLong() * s.toLong()
        val rms = sqrt(sum / frame.size)
        return if (rms < 1.0) -160f else (20.0 * log10(rms / 32768.0)).toFloat()
    }

    private external fun nativeCreate(): Long
    private external fun nativeSetMode(handle: Long, mode: Int): Int
    private external fun nativeSetSampleRate(handle: Long, sampleRate: Int): Int
    private external fun nativeProcess(handle: Long, buf: ShortArray, length: Int): Int
    private external fun nativeDestroy(handle: Long)
}
