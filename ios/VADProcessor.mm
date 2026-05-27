#import "VADProcessor.h"
#include "fvad.h"
#include <math.h>

@implementation VADProcessor {
    Fvad *_vad;
}

- (instancetype)initWithMode:(int)mode sampleRate:(int)sampleRate {
    self = [super init];
    if (self) {
        _vad = fvad_new();
        if (_vad == NULL) {
            return nil;
        }
        if (fvad_set_mode(_vad, mode) != 0 || fvad_set_sample_rate(_vad, sampleRate) != 0) {
            fvad_free(_vad);
            _vad = NULL;
            return nil;
        }
    }
    return self;
}

- (VADFrameResult)processFrame:(const int16_t *)samples length:(size_t)length {
    VADFrameResult result;
    result.vadResult = fvad_process(_vad, samples, length);
    result.energyDb = [self computeEnergyDb:samples length:length];
    return result;
}

- (float)computeEnergyDb:(const int16_t *)samples length:(size_t)length {
    if (length == 0) return -160.0f;
    double sum = 0.0;
    for (size_t i = 0; i < length; i++) {
        double s = (double)samples[i];
        sum += s * s;
    }
    double rms = sqrt(sum / (double)length);
    return rms < 1.0 ? -160.0f : (float)(20.0 * log10(rms / 32768.0));
}

- (void)destroy {
    if (_vad) {
        fvad_free(_vad);
        _vad = NULL;
    }
}

- (void)dealloc {
    [self destroy];
}

@end
