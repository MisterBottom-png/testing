cmake_minimum_required(VERSION 3.22.1)
project(drumkit)

find_package(oboe REQUIRED CONFIG)

add_library(
    drumkit
    SHARED
    native-audio.cpp
)

target_compile_features(drumkit PRIVATE cxx_std_20)

target_link_libraries(
    drumkit
    oboe::oboe
    android
    log
)
