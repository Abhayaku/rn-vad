package com.rnvad

import com.facebook.react.bridge.ReactApplicationContext

class RnVadModule(reactContext: ReactApplicationContext) :
  NativeRnVadSpec(reactContext) {

  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

  companion object {
    const val NAME = NativeRnVadSpec.NAME
  }
}
