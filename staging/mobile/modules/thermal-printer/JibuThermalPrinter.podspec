Pod::Spec.new do |s|
  s.name           = 'JibuThermalPrinter'
  s.version        = '1.0.0'
  s.summary        = 'Native Bluetooth LE receipt printing for JibuSales'
  s.description    = 'Connects the JibuSales receipt workflow to supported ESC/POS thermal printers.'
  s.license        = { :type => 'MIT' }
  s.author         = 'JibuSales'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
