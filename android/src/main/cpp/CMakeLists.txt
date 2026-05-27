cmake_minimum_required(VERSION 3.22.1)
project(rnvad)

set(FVAD_DIR ${CMAKE_CURRENT_SOURCE_DIR}/fvad)

add_library(
  rnvad
  SHARED
  vad_jni.cpp
  ${FVAD_DIR}/fvad.c
  ${FVAD_DIR}/vad/vad_core.c
  ${FVAD_DIR}/vad/vad_filterbank.c
  ${FVAD_DIR}/vad/vad_gmm.c
  ${FVAD_DIR}/vad/vad_sp.c
  ${FVAD_DIR}/signal_processing/division_operations.c
  ${FVAD_DIR}/signal_processing/energy.c
  ${FVAD_DIR}/signal_processing/get_scaling_square.c
  ${FVAD_DIR}/signal_processing/resample_48khz.c
  ${FVAD_DIR}/signal_processing/resample_by_2_internal.c
  ${FVAD_DIR}/signal_processing/resample_fractional.c
)

target_include_directories(rnvad PRIVATE ${FVAD_DIR} ${FVAD_DIR}/vad ${FVAD_DIR}/signal_processing)
target_compile_options(rnvad PRIVATE -Wall -Wno-unused-parameter)

find_library(log-lib log)
target_link_libraries(rnvad ${log-lib})
