"""MAVProxy module: forward Webots DISTANCE_SENSOR into the SITL master link.

Why:
- MAVProxy "link add" can *receive* MAVLink from an extra socket, but it does not
  automatically forward those packets to the master (SITL).
- ArduPilot's RangeFinder MAVLink backend expects DISTANCE_SENSOR to arrive on
  its MAVLink input; this module re-sends received DISTANCE_SENSOR via the master.

Usage (example):
  PYTHONPATH=/path/to/rover-gcs/mavproxy_modules mavproxy.py --load-module webotsrf ...

Then make Webots send to: udpout:<WSL_IP>:14551
"""

from __future__ import annotations

import time

from MAVProxy.modules.lib import mp_module
from pymavlink import mavutil


class WebotsRF(mp_module.MPModule):
    def __init__(self, mpstate):
        super().__init__(mpstate, "webotsrf", "Forward Webots rangefinder to master")
        self.port: int = 14551
        self._link = None
        self._forwarded: int = 0
        self._last_msg_wall_ms: int | None = None

        self.add_command(
            "webotsrf",
            self.cmd_webotsrf,
            "webots rangefinder forwarder",
            ["status", "port"],
        )

        self._open()

    def _open(self) -> None:
        if self._link is not None:
            try:
                self._link.close()
            except Exception:
                pass
            self._link = None

        # udpin: bind and receive MAVLink from Webots
        self._link = mavutil.mavlink_connection(f"udpin:0.0.0.0:{self.port}")
        self._forwarded = 0
        self._last_msg_wall_ms = None
        self.console.writeln(f"[webotsrf] Listening on UDP :{self.port} (expecting DISTANCE_SENSOR)")

    def cmd_webotsrf(self, args) -> None:
        if not args:
            self.console.writeln("usage: webotsrf <status|port>")
            return

        if args[0] == "status":
            last = "never" if self._last_msg_wall_ms is None else f"{(time.time()*1000 - self._last_msg_wall_ms):.0f}ms ago"
            self.console.writeln(
                f"[webotsrf] port={self.port} forwarded={self._forwarded} last={last}"
            )
            return

        if args[0] == "port":
            if len(args) != 2:
                self.console.writeln("usage: webotsrf port <udp_port>")
                return
            try:
                self.port = int(args[1])
            except Exception:
                self.console.writeln("[webotsrf] invalid port")
                return
            self._open()
            return

        self.console.writeln("usage: webotsrf <status|port>")

    def idle_task(self) -> None:
        if self._link is None:
            return

        # Drain available messages quickly
        while True:
            msg = self._link.recv_msg()
            if msg is None:
                break

            if msg.get_type() == "BAD_DATA":
                continue

            if msg.get_type() != "DISTANCE_SENSOR":
                continue

            # Record receipt for status
            self._last_msg_wall_ms = int(time.time() * 1000)

            # Re-send via master so ArduPilot actually receives it.
            # Use MAVProxy's master MAVLink instance to serialize.
            try:
                # Some dialects may not include all fields; use getattr with defaults.
                time_boot_ms = int(getattr(msg, "time_boot_ms", self._last_msg_wall_ms))
                min_distance = int(getattr(msg, "min_distance", 0))
                max_distance = int(getattr(msg, "max_distance", 0))
                current_distance = int(getattr(msg, "current_distance", 0))
                sensor_type = int(getattr(msg, "type", mavutil.mavlink.MAV_DISTANCE_SENSOR_LASER))
                sensor_id = int(getattr(msg, "id", 0))
                orientation = int(getattr(msg, "orientation", 0))
                covariance = int(getattr(msg, "covariance", 0))

                self.master.mav.distance_sensor_send(
                    time_boot_ms,
                    min_distance,
                    max_distance,
                    current_distance,
                    sensor_type,
                    sensor_id,
                    orientation,
                    covariance,
                )
                self._forwarded += 1
            except Exception:
                # Avoid spamming; MAVProxy will keep running.
                pass


def init(mpstate):
    return WebotsRF(mpstate)
