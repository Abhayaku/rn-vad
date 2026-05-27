import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Platform,
} from 'react-native';
import { VAD, useVAD } from 'rn-vad';

const SPEECH_COLOR = '#34C759';
const NOISE_COLOR = '#FF9500';
const SILENT_COLOR = '#E5E5EA';
const SPEECH_TEXT = '#1C1C1E';

function EnergyBar({
  energyDb,
  threshold,
}: {
  energyDb: number;
  threshold: number;
}) {
  const MIN = -70;
  const MAX = 0;
  const clamp = (v: number) => Math.max(MIN, Math.min(MAX, v));
  const pct = ((clamp(energyDb) - MIN) / (MAX - MIN)) * 100;
  const tPct = ((clamp(threshold) - MIN) / (MAX - MIN)) * 100;
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${pct}%` as any }]} />
      <View style={[styles.threshLine, { left: `${tPct}%` as any }]} />
    </View>
  );
}

export default function App() {
  const [permGranted, setPermGranted] = useState<boolean | null>(null);
  const [noiseFloor, setNoiseFloor] = useState(-Infinity);
  const [threshold, setThreshold] = useState(-Infinity);

  useEffect(() => {
    VAD.requestMicPermission()
      .then(setPermGranted)
      .catch(() => setPermGranted(false));
  }, []);

  const retryPerm = useCallback(() => {
    VAD.requestMicPermission()
      .then(setPermGranted)
      .catch(() => setPermGranted(false));
  }, []);

  const {
    isSpeaking,
    isNoise,
    isSilence,
    energyDb,
    isRunning,
    start,
    stop,
    error,
  } = useVAD({
    sampleRate: 16000,
    frameMs: 20,
    mode: 2,
    silenceTimeoutMs: 800,
    onVoiceActivity: (e) => {
      setNoiseFloor(e.noiseFloor);
      setThreshold(e.threshold);
    },
  });

  void isSilence;

  const toggle = useCallback(async () => {
    if (isRunning) await stop();
    else await start();
  }, [isRunning, start, stop]);

  const stateLabel = isSpeaking ? 'SPEAKING' : isNoise ? 'NOISE' : 'SILENT';
  const stateColor = isSpeaking
    ? SPEECH_COLOR
    : isNoise
      ? NOISE_COLOR
      : SILENT_COLOR;
  const stateTextColor = isSpeaking || isNoise ? '#FFFFFF' : '#8E8E93';
  const dbLabel = isFinite(energyDb) ? `${energyDb.toFixed(1)} dBFS` : '— dBFS';
  const floorLabel = isFinite(noiseFloor)
    ? `noise floor  ${noiseFloor.toFixed(1)} dB`
    : 'noise floor  —';
  const thrLabel = isFinite(threshold)
    ? `threshold  ${threshold.toFixed(1)} dB`
    : 'threshold  —';

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#F2F2F7" />
      <View style={styles.root}>
        <Text style={styles.title}>Voice Activity Detection</Text>

        {/* ── Status card ── */}
        <View style={[styles.card, { backgroundColor: stateColor }]}>
          <Text style={[styles.stateLabel, { color: stateTextColor }]}>
            {stateLabel}
          </Text>
          <Text
            style={[styles.dbLabel, { color: stateTextColor, opacity: 0.8 }]}
          >
            {dbLabel}
          </Text>

          <View style={styles.barWrapper}>
            <EnergyBar energyDb={energyDb} threshold={threshold} />
          </View>

          <View style={styles.metaRow}>
            <Text
              style={[styles.metaText, { color: stateTextColor, opacity: 0.6 }]}
            >
              {floorLabel}
            </Text>
            <Text
              style={[styles.metaText, { color: stateTextColor, opacity: 0.6 }]}
            >
              {thrLabel}
            </Text>
          </View>
        </View>

        {/* ── Error ── */}
        {error != null && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error.message}</Text>
          </View>
        )}

        {/* ── Permission not yet resolved ── */}
        {permGranted === null && (
          <Text style={styles.hint}>Checking microphone permission…</Text>
        )}

        {/* ── Permission denied ── */}
        {permGranted === false && (
          <View style={styles.permBox}>
            <Text style={styles.permMsg}>
              Microphone access is required for voice detection.
            </Text>
            <TouchableOpacity style={styles.permBtn} onPress={retryPerm}>
              <Text style={styles.permBtnText}>Grant Permission</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Main CTA ── */}
        {permGranted === true && (
          <TouchableOpacity
            style={[styles.cta, isRunning ? styles.ctaStop : styles.ctaStart]}
            onPress={toggle}
            activeOpacity={0.85}
          >
            <View
              style={[
                styles.ctaDot,
                { backgroundColor: isRunning ? '#FF3B30' : '#34C759' },
              ]}
            />
            <Text style={styles.ctaText}>
              {isRunning ? 'Stop Listening' : 'Start Listening'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    paddingTop:
      Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight ?? 24) + 8,
  },
  root: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: -0.2,
  },

  // Status card
  card: {
    borderRadius: 20,
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    marginBottom: 24,
  },
  stateLabel: {
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  dbLabel: {
    fontSize: 20,
    fontWeight: '500',
    marginBottom: 24,
  },
  barWrapper: {
    width: '100%',
    marginBottom: 20,
  },
  barTrack: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 4,
    overflow: 'visible',
  },
  barFill: {
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 4,
  },
  threshLine: {
    position: 'absolute',
    top: -3,
    width: 2,
    height: 14,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 1,
  },
  metaRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaText: {
    fontSize: 11,
    fontWeight: '500',
  },

  // Error
  errorBox: {
    backgroundColor: '#FFF0F0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  errorText: {
    color: '#C62828',
    fontSize: 13,
  },

  // Permission
  hint: {
    textAlign: 'center',
    color: '#8E8E93',
    fontSize: 14,
    marginTop: 8,
  },
  permBox: {
    alignItems: 'center',
    gap: 16,
    marginTop: 8,
  },
  permMsg: {
    color: '#3C3C43',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  permBtn: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  permBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },

  // CTA button
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  ctaStart: { backgroundColor: '#FFFFFF' },
  ctaStop: { backgroundColor: '#FFFFFF' },
  ctaDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: '600',
    color: SPEECH_TEXT,
  },
});
