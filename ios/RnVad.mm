#import "RnVad.h"
#import "VADProcessor.h"
#import <AVFoundation/AVFoundation.h>
#import <React/RCTBridgeModule.h>
#import <ReactCommon/RCTTurboModule.h>

static NSString *const kEventSpeechStart   = @"RnVad.speechStart";
static NSString *const kEventSpeechEnd     = @"RnVad.speechEnd";
static NSString *const kEventVoiceActivity = @"RnVad.voiceActivity";
static NSString *const kEventPcmData       = @"RnVad.pcmData";
static NSString *const kEventError         = @"RnVad.error";


namespace facebook::react {

class RnVadTurboModule : public NativeRnVadSpecJSI {
 public:
  explicit RnVadTurboModule(const ObjCTurboModule::InitParams &params)
      : NativeRnVadSpecJSI(params)
  {
    setEventEmitterCallback([this](const std::string &eventName, id body) {
      emitDeviceEvent(
          eventName,
          [body](jsi::Runtime &rt, std::vector<jsi::Value> &args) {
            if (body != nil) {
              args.emplace_back(
                  TurboModuleConvertUtils::convertObjCObjectToJSIValue(rt, body));
            }
          });
    });
  }
};

} // namespace facebook::react

@implementation RnVad {
    AVAudioEngine    *_engine;
    AVAudioConverter *_converter;
    VADProcessor     *_processor;

    int    _sampleRate;
    int    _frameMs;
    int    _mode;
    double _silenceTimeoutMs;
    float  _noiseThresholdDb;
    BOOL   _emitPcm;
    BOOL   _recordSegments;
    NSString *_segmentOutputDir;
    BOOL   _adaptiveThreshold;
    double _adaptiveMarginDb;
    double _adaptationRate;
    double _initialNoiseFloor;
    double _minNoiseFloor;

    double _speechOnsetMs;
    NSUInteger _speechOnsetCount;
    double _noiseFloor;
    NSUInteger _holdCounter;

    BOOL   _running;
    BOOL   _inSpeech;
    double _speechStartTime;
    double _silenceSince;

    NSFileHandle *_segmentHandle;
    NSString     *_segmentPath;
    NSUInteger    _segmentSamples;

    NSMutableData *_accumulator;
    NSUInteger     _frameSizeBytes;
}

RCT_EXPORT_MODULE(RnVad)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (void)emitEvent:(NSString *)name body:(NSDictionary *_Nullable)body
{
  if (!_eventEmitterCallback) {
    return;
  }

  NSString *eventName = [name copy];
  NSDictionary *payload = body ? [body copy] : @{};

  dispatch_async(dispatch_get_main_queue(), ^{
    if (self->_eventEmitterCallback) {
      self->_eventEmitterCallback(eventName.UTF8String, payload);
    }
  });
}

- (void)configure:(JS::NativeRnVad::VADNativeOptions &)options
          resolve:(RCTPromiseResolveBlock)resolve
           reject:(RCTPromiseRejectBlock)reject {
    if (_running) {
        reject(@"ALREADY_RUNNING", @"Cannot configure while VAD is running — call stop() first", nil);
        return;
    }
    _sampleRate        = (int)options.sampleRate();
    _frameMs           = (int)options.frameMs();
    _mode              = (int)options.mode();
    _silenceTimeoutMs  = options.silenceTimeoutMs();
    _noiseThresholdDb  = (float)options.noiseThresholdDb();
    _speechOnsetMs     = options.speechOnsetMs();
    _emitPcm           = options.emitPcm();
    _recordSegments    = options.recordSegments();
    _segmentOutputDir  = options.segmentOutputDir() ?: @"";
    _adaptiveThreshold = options.adaptiveThreshold();
    _adaptiveMarginDb  = options.adaptiveMarginDb();
    _adaptationRate    = options.adaptationRate();
    _initialNoiseFloor = options.initialNoiseFloor();
    _minNoiseFloor     = options.minNoiseFloor();
    resolve(nil);
}

- (void)start:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (self->_running) { reject(@"ALREADY_RUNNING", @"VAD already running", nil); return; }

        NSError *err = nil;
        AVAudioSession *session = [AVAudioSession sharedInstance];
        // VoiceChat, not Measurement: Measurement disables input AGC, which
        // leaves older single-mic devices (iPhone XR and earlier) with a raw
        // signal 30-40 dB too quiet for energy-based VAD. VoiceChat keeps AGC
        // and adds echo cancellation so far-end playback doesn't trigger VAD.
        [session setCategory:AVAudioSessionCategoryPlayAndRecord
                         mode:AVAudioSessionModeVoiceChat
                      options:AVAudioSessionCategoryOptionDefaultToSpeaker
                            | AVAudioSessionCategoryOptionAllowBluetooth
                        error:&err];
        if (err) { reject(@"SESSION_ERROR", err.localizedDescription, err); return; }
        [session setActive:YES error:&err];
        if (err) { reject(@"SESSION_ERROR", err.localizedDescription, err); return; }

        if (self->_sampleRate <= 0) { self->_sampleRate = 16000; }
        if (self->_frameMs <= 0) { self->_frameMs = 20; }

        self->_engine = [[AVAudioEngine alloc] init];
        AVAudioInputNode *input = self->_engine.inputNode;
        AVAudioFormat *inputFmt = [input outputFormatForBus:0];
        if (inputFmt == nil || inputFmt.sampleRate <= 0) {
            self->_engine = nil;
            reject(@"ENGINE_ERROR", @"Invalid microphone format", nil);
            return;
        }

        AVAudioFormat *targetFmt = [[AVAudioFormat alloc]
            initWithCommonFormat:AVAudioPCMFormatInt16
                      sampleRate:self->_sampleRate
                        channels:1
                     interleaved:YES];
        if (targetFmt == nil) {
            self->_engine = nil;
            reject(@"ENGINE_ERROR", @"Invalid target audio format", nil);
            return;
        }

        self->_converter = [[AVAudioConverter alloc] initFromFormat:inputFmt toFormat:targetFmt];
        if (self->_converter == nil) {
            self->_engine = nil;
            reject(@"ENGINE_ERROR", @"Could not create audio converter", nil);
            return;
        }

        self->_processor = [[VADProcessor alloc] initWithMode:self->_mode sampleRate:self->_sampleRate];
        if (self->_processor == nil) {
            self->_converter = nil;
            self->_engine = nil;
            reject(@"ENGINE_ERROR", @"Could not initialize VAD processor", nil);
            return;
        }

        self->_accumulator = [NSMutableData data];
        NSUInteger frameSamples = (NSUInteger)(self->_sampleRate * self->_frameMs / 1000);
        self->_frameSizeBytes = frameSamples * sizeof(int16_t);
        if (self->_frameSizeBytes == 0) {
            self->_processor = nil;
            self->_converter = nil;
            self->_engine = nil;
            reject(@"ENGINE_ERROR", @"Invalid VAD frame size", nil);
            return;
        }

        self->_inSpeech = NO;
        self->_silenceSince = 0;
        self->_speechOnsetCount = 0;
        self->_noiseFloor = self->_adaptiveThreshold ? self->_initialNoiseFloor : self->_noiseThresholdDb;
        self->_holdCounter = 0;

        __weak RnVad *weakSelf = self;
        [input installTapOnBus:0
                   bufferSize:4096
                       format:nil
                        block:^(AVAudioPCMBuffer *buf, AVAudioTime *time) {
                          @autoreleasepool {
                            [weakSelf handleBuffer:buf targetFormat:targetFmt];
                          }
                        }];

        [self->_engine startAndReturnError:&err];
        if (err) {
            [self stopInternal];
            reject(@"ENGINE_ERROR", err.localizedDescription, err);
            return;
        }

        self->_running = YES;
        resolve(nil);
    });
}

- (void)stop:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    dispatch_async(dispatch_get_main_queue(), ^{
        [self stopInternal];
        resolve(nil);
    });
}

- (void)destroy:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    dispatch_async(dispatch_get_main_queue(), ^{
        [self stopInternal];
        resolve(nil);
    });
}

- (void)isRunning:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    resolve(@(_running));
}

- (void)requestMicPermission:(RCTPromiseResolveBlock)resolve
                      reject:(RCTPromiseRejectBlock)reject
{
  AVAudioSession *session = [AVAudioSession sharedInstance];
  switch ([session recordPermission]) {
    case AVAudioSessionRecordPermissionGranted:
      resolve(@YES);
      return;
    case AVAudioSessionRecordPermissionDenied:
      resolve(@NO);
      return;
    default:
      break;
  }

  [session requestRecordPermission:^(BOOL granted) {
    resolve(@(granted));
  }];
}

- (void)addListener:(NSString *)eventName
{
}

- (void)removeListeners:(double)count
{
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::RnVadTurboModule>(params);
}

- (void)stopInternal {
    _running = NO;
    if (_engine != nil) {
      @try {
        [_engine.inputNode removeTapOnBus:0];
      } @catch (__unused NSException *exception) {
      }
      [_engine stop];
      _engine = nil;
    }
    if (_processor != nil) {
      [_processor destroy];
      _processor = nil;
    }
    _converter = nil;
    [self finishSegment];
    _accumulator = nil;
}

- (void)handleBuffer:(AVAudioPCMBuffer *)inputBuf targetFormat:(AVAudioFormat *)targetFmt {
    if (!_running || _converter == nil || _processor == nil || inputBuf == nil) {
      return;
    }
    if (inputBuf.frameLength == 0 || inputBuf.format.sampleRate <= 0) {
      return;
    }

    AVAudioFrameCount capacity = (AVAudioFrameCount)(inputBuf.frameLength *
        (double)_sampleRate / inputBuf.format.sampleRate) + 2;
    AVAudioPCMBuffer *outBuf = [[AVAudioPCMBuffer alloc] initWithPCMFormat:targetFmt
                                                             frameCapacity:capacity];
    __block BOOL fed = NO;
    NSError *err = nil;
    [_converter convertToBuffer:outBuf error:&err
              withInputFromBlock:^AVAudioBuffer *(AVAudioPacketCount n, AVAudioConverterInputStatus *st) {
        if (fed) { *st = AVAudioConverterInputStatus_NoDataNow; return nil; }
        fed = YES; *st = AVAudioConverterInputStatus_HaveData;
        return inputBuf;
    }];
    if (err || outBuf.frameLength == 0) return;

    [_accumulator appendBytes:outBuf.int16ChannelData[0]
                       length:outBuf.frameLength * sizeof(int16_t)];

    while (_accumulator.length >= _frameSizeBytes) {
        NSUInteger frameSamples = _frameSizeBytes / sizeof(int16_t);
        [self processFrame:(const int16_t *)_accumulator.bytes samples:frameSamples];
        [_accumulator replaceBytesInRange:NSMakeRange(0, _frameSizeBytes)
                                withBytes:NULL length:0];
    }
}

- (void)processFrame:(const int16_t *)frame samples:(NSUInteger)n {
    double now = [[NSDate date] timeIntervalSince1970] * 1000.0;
    VADFrameResult r = [_processor processFrame:frame length:n];
    float energyDb = r.energyDb;
    BOOL isSpeechSignal = r.vadResult == 1;

    double effectiveThreshold;
    if (_adaptiveThreshold) {
        if (!_inSpeech && _speechOnsetCount == 0 && _holdCounter == 0) {
            double alpha = (energyDb < _noiseFloor) ? 0.90 : _adaptationRate;
            _noiseFloor = alpha * _noiseFloor + (1.0 - alpha) * energyDb;
            if (_noiseFloor < _minNoiseFloor) _noiseFloor = _minNoiseFloor;
        }
        if (!_inSpeech && _holdCounter > 0) _holdCounter--;
        effectiveThreshold = _noiseFloor + _adaptiveMarginDb;
    } else {
        effectiveThreshold = _noiseThresholdDb;
    }

    BOOL isSpeech = energyDb > effectiveThreshold && isSpeechSignal;

    NSString *type;
    if (_inSpeech) {
        type = @"speech";
    } else if (energyDb > effectiveThreshold && isSpeechSignal) {
        type = @"noise";
    } else {
        type = @"silence";
    }
    NSUInteger onsetThreshold = (_speechOnsetMs > 0 && _frameMs > 0)
        ? (NSUInteger)ceil(_speechOnsetMs / _frameMs) : 1;

    if (!_inSpeech) {
        if (isSpeech) {
            if (++_speechOnsetCount >= onsetThreshold) {
                _inSpeech = YES;
                _speechStartTime = now;
                _silenceSince = 0;
                [self emitEvent:kEventSpeechStart body:@{@"timestamp": @(now)}];
                if (_recordSegments) [self startSegment:(long long)now];
            }
        } else {
            _speechOnsetCount = 0;
        }
    } else {
        if (isSpeech) {
            _silenceSince = 0;
        } else {
            if (_silenceSince == 0) _silenceSince = now;
            if (now - _silenceSince >= _silenceTimeoutMs) {
                _inSpeech = NO;
                _speechOnsetCount = 0;
                _holdCounter = 30;
                double duration = now - _speechStartTime;
                NSString *path = [self finishSegment];
                NSMutableDictionary *body = [@{@"duration":@(duration),@"timestamp":@(now)} mutableCopy];
                if (path) body[@"segmentPath"] = path;
                [self emitEvent:kEventSpeechEnd body:body];
                _silenceSince = 0;
            }
        }
    }

    if (_recordSegments && _inSpeech) [self writeSegmentSamples:frame length:n];

    [self emitEvent:kEventVoiceActivity body:@{
        @"isSpeaking": @(_inSpeech), @"type": type,
        @"energyDb": @(energyDb), @"noiseFloor": @(_noiseFloor),
        @"threshold": @(effectiveThreshold), @"timestamp": @(now)
    }];

    if (_emitPcm) {
        NSMutableArray *arr = [NSMutableArray arrayWithCapacity:n];
        for (NSUInteger i = 0; i < n; i++) {
          [arr addObject:@(frame[i])];
        }
        [self emitEvent:kEventPcmData body:@{
            @"data": arr, @"sampleRate": @(_sampleRate), @"timestamp": @(now)
        }];
    }
}

- (void)startSegment:(long long)ts {
    NSString *rawDir = _segmentOutputDir.length > 0 ? _segmentOutputDir : NSTemporaryDirectory();
    NSString *dir = rawDir.stringByResolvingSymlinksInPath.stringByStandardizingPath;
    [[NSFileManager defaultManager] createDirectoryAtPath:dir
        withIntermediateDirectories:YES attributes:nil error:nil];
    _segmentPath = [dir stringByAppendingPathComponent:
        [NSString stringWithFormat:@"segment_%lld.wav", ts]];
    [[NSFileManager defaultManager] createFileAtPath:_segmentPath contents:nil attributes:nil];
    _segmentHandle = [NSFileHandle fileHandleForWritingAtPath:_segmentPath];
    _segmentSamples = 0;
    [self writeWavHeader:0];
}

- (void)writeSegmentSamples:(const int16_t *)s length:(NSUInteger)n {
    [_segmentHandle writeData:[NSData dataWithBytes:s length:n * sizeof(int16_t)]];
    _segmentSamples += n;
}

- (NSString *)finishSegment {
    if (!_segmentHandle) return nil;
    if (_segmentSamples > 0) [self patchWavHeader:_segmentSamples];
    [_segmentHandle closeFile]; _segmentHandle = nil;
    NSString *path = _segmentPath; _segmentPath = nil;
    if (_segmentSamples == 0) { [[NSFileManager defaultManager] removeItemAtPath:path error:nil]; return nil; }
    _segmentSamples = 0;
    return path;
}

- (void)writeWavHeader:(uint32_t)numSamples {
    uint32_t sr = (uint32_t)_sampleRate, ds = numSamples * 2;
    uint8_t h[44] = {0};
    memcpy(h,"RIFF",4); *(uint32_t*)(h+4)=CFSwapInt32HostToLittle(36+ds);
    memcpy(h+8,"WAVE",4); memcpy(h+12,"fmt ",4);
    *(uint32_t*)(h+16)=CFSwapInt32HostToLittle(16);
    *(uint16_t*)(h+20)=CFSwapInt16HostToLittle(1);
    *(uint16_t*)(h+22)=CFSwapInt16HostToLittle(1);
    *(uint32_t*)(h+24)=CFSwapInt32HostToLittle(sr);
    *(uint32_t*)(h+28)=CFSwapInt32HostToLittle(sr*2);
    *(uint16_t*)(h+32)=CFSwapInt16HostToLittle(2);
    *(uint16_t*)(h+34)=CFSwapInt16HostToLittle(16);
    memcpy(h+36,"data",4); *(uint32_t*)(h+40)=CFSwapInt32HostToLittle(ds);
    [_segmentHandle writeData:[NSData dataWithBytes:h length:44]];
}

- (void)patchWavHeader:(NSUInteger)numSamples {
    uint32_t ds = (uint32_t)(numSamples*2);
    uint32_t v; v=CFSwapInt32HostToLittle(36+ds);
    [_segmentHandle seekToFileOffset:4];
    [_segmentHandle writeData:[NSData dataWithBytes:&v length:4]];
    v=CFSwapInt32HostToLittle(ds);
    [_segmentHandle seekToFileOffset:40];
    [_segmentHandle writeData:[NSData dataWithBytes:&v length:4]];
}

@end
