cmake_minimum_required(VERSION 3.13)
project(blue2joy C)


set(CMAKE_C_COMPILER "mos-atari8-dos-clang")
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR})

add_executable(blue2joy src/main.c src/spi.c)
set_target_properties(blue2joy PROPERTIES OUTPUT_NAME "blue2joy.xex")

target_compile_options(blue2joy PRIVATE "-Os")
target_include_directories(blue2joy PRIVATE src)
target_link_options(blue2joy PRIVATE "-Wl,-Map=${CMAKE_RUNTIME_OUTPUT_DIRECTORY}/blue2joy.map")

add_custom_command(
    TARGET blue2joy POST_BUILD
    COMMAND llvm-objdump -D $<TARGET_FILE:blue2joy>.elf > ${CMAKE_RUNTIME_OUTPUT_DIRECTORY}/blue2joy.lst
)