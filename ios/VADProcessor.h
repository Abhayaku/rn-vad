#pragma once
#import <Foundation/Foundation.h>
#include <stdint.h>
#include <stddef.h>

NS_ASSUME_NONNULL_BEGIN

typedef struct {
    int vadResult;   // 1=speech 0=not-speech -1=error
    float energyDb;
} VADFrameResult;

@interface VADProcessor : NSObject

- (instancetype)initWithMode:(int)mode sampleRate:(int)sampleRate;
- (VADFrameResult)processFrame:(const int16_t *)samples length:(size_t)length;
- (void)destroy;

@end

NS_ASSUME_NONNULL_END
