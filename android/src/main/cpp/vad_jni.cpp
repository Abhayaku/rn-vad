#include <jni.h>
#include <cstdlib>
#include "fvad/fvad.h"

extern "C" {

JNIEXPORT jlong JNICALL
Java_com_rnvad_VadProcessor_nativeCreate(JNIEnv*, jobject) {
    return reinterpret_cast<jlong>(fvad_new());
}

JNIEXPORT jint JNICALL
Java_com_rnvad_VadProcessor_nativeSetMode(JNIEnv*, jobject, jlong handle, jint mode) {
    if (!handle) return -1;
    return fvad_set_mode(reinterpret_cast<Fvad*>(handle), mode);
}

JNIEXPORT jint JNICALL
Java_com_rnvad_VadProcessor_nativeSetSampleRate(JNIEnv*, jobject, jlong handle, jint sampleRate) {
    if (!handle) return -1;
    return fvad_set_sample_rate(reinterpret_cast<Fvad*>(handle), sampleRate);
}

JNIEXPORT jint JNICALL
Java_com_rnvad_VadProcessor_nativeProcess(JNIEnv* env, jobject, jlong handle,
                                           jshortArray buf, jint length) {
    if (!handle) return -1;
    jshort* data = env->GetShortArrayElements(buf, nullptr);
    if (!data) return -1;
    int result = fvad_process(
        reinterpret_cast<Fvad*>(handle),
        reinterpret_cast<int16_t*>(data),
        static_cast<size_t>(length)
    );
    env->ReleaseShortArrayElements(buf, data, JNI_ABORT);
    return static_cast<jint>(result);
}

JNIEXPORT void JNICALL
Java_com_rnvad_VadProcessor_nativeDestroy(JNIEnv*, jobject, jlong handle) {
    if (!handle) return;
    fvad_free(reinterpret_cast<Fvad*>(handle));
}

} // extern "C"
