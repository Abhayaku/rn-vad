require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "RnVad"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/Abhayaku/rn-vad.git", :tag => "#{s.version}" }

  s.source_files = [
    "ios/RnVad.{h,mm}",
    "ios/VADProcessor.{h,mm}",
    "ios/fvad/fvad.c",
    "ios/fvad/vad/**/*.{c,h}",
    "ios/fvad/signal_processing/**/*.{c,h}",
    "ios/fvad/include/*.h",
  ]
  s.private_header_files = "ios/**/*.h"
  s.frameworks = "AVFoundation", "AudioToolbox"
  s.pod_target_xcconfig = {
    "HEADER_SEARCH_PATHS" => '"$(PODS_TARGET_SRCROOT)/ios/fvad" "$(PODS_TARGET_SRCROOT)/ios/fvad/include" "$(PODS_TARGET_SRCROOT)/ios/fvad/vad"',
  }

  install_modules_dependencies(s)
end
