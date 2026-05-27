package com.rnvad

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.HandlerThread
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.ArrayDeque

internal class AudioCaptureThread(private val config: VADConfig) {

    private var audioRecord: AudioRecord? = null
    private var handlerThread: HandlerThread? = null
    private var handler: Handler? = null
    @Volatile private var running = false

    var onActivity: ((vadResult: Int, energyDb: Float, noiseFloor: Double, threshold: Double, pcmFrame: ShortArray?) -> Unit)? = null
    var onSpeechStart: ((timestamp: Long) -> Unit)? = null
    var onSpeechEnd: ((duration: Long, timestamp: Long, segmentPath: String?) -> Unit)? = null
    var onError: ((code: String, message: String) -> Unit)? = null

    private val frameSize: Int get() = config.sampleRate * config.frameMs / 1000
    private var processor: VadProcessor? = null

    private var noiseFloor: Double = config.noiseThresholdDb.toDouble()
    private var inSpeech = false
    private var speechOnsetCount = 0
    private var speechStartTime = 0L
    private var silenceSince = 0L
    private var segmentOutputStream: FileOutputStream? = null
    private var segmentFile: File? = null
    private var segmentSamples = 0

    @SuppressLint("MissingPermission")
    fun start() {
        val minBuf = AudioRecord.getMinBufferSize(
            config.sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        val recorder = AudioRecord(
            MediaRecorder.AudioSource.MIC,
            config.sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            maxOf(minBuf, frameSize * 2 * 4)
        )
        if (recorder.state != AudioRecord.STATE_INITIALIZED) {
            recorder.release()
            throw IllegalStateException("AudioRecord failed to initialize — check microphone permission")
        }
        audioRecord = recorder
        processor = VadProcessor(config.mode, config.sampleRate)
        running = true
        handlerThread = HandlerThread("RnVadCapture").also { it.start() }
        handler = Handler(handlerThread!!.looper)
        audioRecord!!.startRecording()
        handler!!.post(CaptureLoop())
    }

    fun stop() {
        running = false
        handler?.removeCallbacksAndMessages(null)
        audioRecord?.stop()
        audioRecord?.release()
        audioRecord = null
        handlerThread?.quitSafely()
        handlerThread = null
        handler = null
        processor?.destroy()
        processor = null
        finishSegment(discard = true)
    }

    private inner class CaptureLoop : Runnable {
        private val accumulator = ArrayDeque<Short>()

        override fun run() {
            if (!running) return
            val buf = ShortArray(frameSize * 2)
            val read = audioRecord?.read(buf, 0, buf.size) ?: 0
            if (read > 0) {
                for (i in 0 until read) accumulator.add(buf[i])
                while (accumulator.size >= frameSize) {
                    val frame = ShortArray(frameSize) { accumulator.poll() }
                    processFrame(frame)
                }
            }
            if (running) handler?.post(this)
        }
    }

    private fun processFrame(frame: ShortArray) {
        val proc = processor ?: return
        val result = proc.process(frame)
        val now = System.currentTimeMillis()

        // Adaptive noise floor — asymmetric EMA: rises slowly, decays faster.
        if (!inSpeech && speechOnsetCount == 0) {
            val alpha = if (result.energyDb > noiseFloor) 0.99 else 0.95
            noiseFloor = alpha * noiseFloor + (1.0 - alpha) * result.energyDb
        }
        val effectiveThreshold = noiseFloor + 8.0

        val type = when {
            result.energyDb <= effectiveThreshold -> "silence"
            result.vadResult == 1 -> "speech"
            else -> "noise"
        }
        val isSpeech = type == "speech"
        val onsetThreshold = if (config.speechOnsetMs > 0 && config.frameMs > 0)
            Math.ceil(config.speechOnsetMs.toDouble() / config.frameMs).toInt() else 1

        if (!inSpeech) {
            if (isSpeech) {
                speechOnsetCount++
                if (speechOnsetCount >= onsetThreshold) {
                    inSpeech = true
                    speechStartTime = now
                    silenceSince = 0L
                    onSpeechStart?.invoke(now)
                    if (config.recordSegments) startSegment(now)
                }
            } else {
                speechOnsetCount = 0
            }
        } else {
            if (isSpeech) {
                silenceSince = 0L
            } else {
                if (silenceSince == 0L) silenceSince = now
                if (now - silenceSince >= config.silenceTimeoutMs) {
                    inSpeech = false
                    speechOnsetCount = 0
                    val duration = now - speechStartTime
                    val path = finishSegment(discard = false)
                    onSpeechEnd?.invoke(duration, now, path)
                    silenceSince = 0L
                }
            }
        }

        if (config.recordSegments && inSpeech) writeSegmentSamples(frame)

        val pcm = if (config.emitPcm) frame else null
        onActivity?.invoke(result.vadResult, result.energyDb, noiseFloor, effectiveThreshold, pcm)
    }

    private fun startSegment(timestamp: Long) {
        val dir = if (config.segmentOutputDir.isNotEmpty()) {
            File(config.segmentOutputDir).canonicalFile
        } else {
            File(System.getProperty("java.io.tmpdir") ?: "/data/local/tmp")
        }
        dir.mkdirs()
        segmentFile = File(dir, "segment_$timestamp.wav")
        segmentOutputStream = FileOutputStream(segmentFile!!)
        writeWavHeader(segmentOutputStream!!, 0, config.sampleRate)
        segmentSamples = 0
    }

    private fun writeSegmentSamples(frame: ShortArray) {
        val out = segmentOutputStream ?: return
        val bytes = ByteArray(frame.size * 2)
        ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).let { bb ->
            for (s in frame) bb.putShort(s)
        }
        out.write(bytes)
        segmentSamples += frame.size
    }

    private fun finishSegment(discard: Boolean): String? {
        val out = segmentOutputStream ?: return null
        out.flush()
        out.close()
        segmentOutputStream = null
        val file = segmentFile ?: return null
        segmentFile = null
        if (!discard && segmentSamples > 0) {
            patchWavHeader(file, segmentSamples, config.sampleRate)
            return file.absolutePath
        }
        file.delete()
        return null
    }

    private fun writeWavHeader(out: FileOutputStream, numSamples: Int, sampleRate: Int) {
        val dataSize = numSamples * 2
        val bb = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
        bb.put("RIFF".toByteArray()); bb.putInt(36 + dataSize)
        bb.put("WAVE".toByteArray())
        bb.put("fmt ".toByteArray()); bb.putInt(16)
        bb.putShort(1); bb.putShort(1)
        bb.putInt(sampleRate); bb.putInt(sampleRate * 2)
        bb.putShort(2); bb.putShort(16)
        bb.put("data".toByteArray()); bb.putInt(dataSize)
        out.write(bb.array())
    }

    private fun patchWavHeader(file: File, numSamples: Int, sampleRate: Int) {
        RandomAccessFile(file, "rw").use { raf ->
            val dataSize = numSamples * 2
            raf.seek(4); raf.write(leInt(36 + dataSize))
            raf.seek(40); raf.write(leInt(dataSize))
        }
    }

    private fun leInt(v: Int) = byteArrayOf(
        (v and 0xFF).toByte(), (v shr 8 and 0xFF).toByte(),
        (v shr 16 and 0xFF).toByte(), (v shr 24 and 0xFF).toByte()
    )
}
