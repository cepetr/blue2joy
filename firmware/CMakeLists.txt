# SPDX-License-Identifier: Apache-2.0

cmake_minimum_required(VERSION 3.20.0)
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(blue2joy)

target_sources(app PRIVATE
  src/bthid/bthid.c
  src/bthid/bthid_bonds.c
  src/bthid/bthid_conn.c
  src/bthid/bthid_discovery.c
  src/bthid/bthid_report.c
  src/bthid/bthid_scan.c
  src/bthid/report_map.c
  src/btsvc/btsvc.c
  src/btjp/btjp_commands.c
  src/btjp/btjp_events.c
  src/btjp/btjp_utils.c
  src/event/event_queue.c
  src/event/event_bus.c
  src/mapper/mapper.c
  src/mapper/settings.c
  src/mapper/profiles.c
  src/devmgr/devmgr.c
  src/devmgr/devmgr_advlist.c
  src/devmgr/devmgr_devlist.c
  src/devmgr/settings.c
  src/io/buttons.c
  src/io/io_pin.c
  src/io/io_pot.c
  src/io/rgbled.c
  src/io/rgbled_seq.c
  src/io/spislave.c

  src/main.c

)

target_include_directories(app PRIVATE
  src
)


zephyr_library_include_directories(${ZEPHYR_BASE}/samples/bluetooth)
