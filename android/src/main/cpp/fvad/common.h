/*
 *  Copyright (c) 2012 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

#ifndef SRC_COMMON_H_
#define SRC_COMMON_H_

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>

#define arraysize(arr) (sizeof(arr) / sizeof((arr)[0]))

#if defined(__clang__)
#define RTC_NO_SANITIZE(what) __attribute__((no_sanitize(what)))
#else
#define RTC_NO_SANITIZE(what)
#endif

#ifdef __cplusplus
#define RTC_COMPILE_ASSERT(cond) static_assert(cond, #cond)
#else
#define RTC_COMPILE_ASSERT(cond) _Static_assert(cond, #cond)
#endif

#include <assert.h>
#define RTC_DCHECK(cond)       assert(cond)
#define RTC_DCHECK_EQ(a, b)   assert((a) == (b))
#define RTC_DCHECK_NE(a, b)   assert((a) != (b))
#define RTC_DCHECK_LT(a, b)   assert((a) < (b))
#define RTC_DCHECK_GT(a, b)   assert((a) > (b))
#define RTC_DCHECK_LE(a, b)   assert((a) <= (b))
#define RTC_DCHECK_GE(a, b)   assert((a) >= (b))

#endif  // SRC_COMMON_H_
