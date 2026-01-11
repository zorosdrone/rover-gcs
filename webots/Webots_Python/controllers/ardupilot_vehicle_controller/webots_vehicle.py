'''
This file implements a class that acts as a bridge between ArduPilot SITL and Webots

AP_FLAKE8_CLEAN
'''

# Imports
import os
os.environ['MAVLINK20'] = '1'  # 必ず import mavutil より前に書く
from pymavlink import mavutil
import sys
import time
import socket
import select
import struct
try:
    import cv2
except ImportError:
    cv2 = None
import numpy as np
from threading import Thread
from typing import List, Union
# try:
#     from pymavlink import mavutil
# except ImportError:
#     mavutil = None

# Here we set up environment variables so we can run this script
# as an external controller outside of Webots (useful for debugging)
# https://cyberbotics.com/doc/guide/running-extern-robot-controllers
if sys.platform.startswith("win"):
    WEBOTS_HOME = "C:\\Program Files\\Webots"
elif sys.platform.startswith("darwin"):
    WEBOTS_HOME = "/Applications/Webots.app"
elif sys.platform.startswith("linux"):
    WEBOTS_HOME = "/usr/local/webots"
else:
    raise Exception("Unsupported OS")

if os.environ.get("WEBOTS_HOME") is None:
    os.environ["WEBOTS_HOME"] = WEBOTS_HOME
else:
    WEBOTS_HOME = os.environ.get("WEBOTS_HOME")

os.environ["PYTHONIOENCODING"] = "UTF-8"
sys.path.append(f"{WEBOTS_HOME}/lib/controller/python")

from controller import Robot, Camera, RangeFinder # noqa: E401, E402


class WebotsArduVehicle():
    """Class representing an ArduPilot controlled Webots Vehicle"""

    controls_struct_format = 'f'*16
    controls_struct_size = struct.calcsize(controls_struct_format)
    fdm_struct_format = 'd'*(1+3+3+3+3+3)
    fdm_struct_size = struct.calcsize(fdm_struct_format)

    def __init__(self,
                 motor_names: List[str],
                 accel_name: str = "accelerometer",
                 imu_name: str = "inertial unit",
                 gyro_name: str = "gyro",
                 gps_name: str = "gps",
                 camera_name: str = None,
                 camera_fps: int = 10,
                 camera_stream_port: int = None,
                 rangefinder_name: str = None,
                 rangefinder_fps: int = 10,
                 rangefinder_stream_port: int = None,
                 sonar_name: str = None,
                 instance: int = 0,
                 motor_velocity_cap: float = float('inf'),
                 reversed_motors: List[int] = None,
                 bidirectional_motors: bool = False,
                 uses_propellers: bool = True,
                 sitl_address: str = "127.0.0.1"):
        """WebotsArduVehicle constructor

        Args:
            motor_names (List[str]): Motor names in ArduPilot numerical order (first motor is SERVO1 etc).
            accel_name (str, optional): Webots accelerometer name. Defaults to "accelerometer".
            imu_name (str, optional): Webots imu name. Defaults to "inertial unit".
            gyro_name (str, optional): Webots gyro name. Defaults to "gyro".
            gps_name (str, optional): Webots GPS name. Defaults to "gps".
            camera_name (str, optional): Webots camera name. Defaults to None.
            camera_fps (int, optional): Camera FPS. Lower FPS runs better in sim. Defaults to 10.
            camera_stream_port (int, optional): Port to stream grayscale camera images to.
                                                If no port is supplied the camera will not be streamed. Defaults to None.
            rangefinder_name (str, optional): Webots RangeFinder name. Defaults to None.
            rangefinder_fps (int, optional): RangeFinder FPS. Lower FPS runs better in sim. Defaults to 10.
            rangefinder_stream_port (int, optional): Port to stream rangefinder images to.
                                                     If no port is supplied the camera will not be streamed. Defaults to None.
            instance (int, optional): Vehicle instance number to match the SITL. This allows multiple vehicles. Defaults to 0.
            motor_velocity_cap (float, optional): Motor velocity cap. This is useful for the crazyflie
                                                  which default has way too much power. Defaults to float('inf').
            reversed_motors (list[int], optional): Reverse the motors (indexed from 1). Defaults to None.
            bidirectional_motors (bool, optional): Enable bidirectional motors. Defaults to False.
            uses_propellers (bool, optional): Whether the vehicle uses propellers.
                                              This is important as we need to linearize thrust if so. Defaults to True.
            sitl_address (str, optional): IP address of the SITL (useful with WSL2 eg \"172.24.220.98\").
                                          Defaults to "127.0.0.1".
        """
        # init class variables
        self.motor_velocity_cap = motor_velocity_cap
        self._instance = instance
        self._reversed_motors = reversed_motors
        self._bidirectional_motors = bidirectional_motors
        self._uses_propellers = uses_propellers
        self._webots_connected = True

        # setup Webots robot instance
        self.robot = Robot()

        # set robot time step relative to sim time step
        self._timestep = int(self.robot.getBasicTimeStep())

        # init sensors
        self.accel = self.robot.getDevice(accel_name)
        self.imu = self.robot.getDevice(imu_name)
        self.gyro = self.robot.getDevice(gyro_name)
        self.gps = self.robot.getDevice(gps_name)

        self.accel.enable(self._timestep)
        self.imu.enable(self._timestep)
        self.gyro.enable(self._timestep)
        self.gps.enable(self._timestep)

        # init camera
        if camera_name is not None:
            self.camera = self.robot.getDevice(camera_name)
            if self.camera is not None:
                self.camera.enable(1000//camera_fps) # takes frame period in ms
                print(f"Camera '{camera_name}' found and enabled.")
            else:
                print(f"Warning: Camera '{camera_name}' not found!")

            # start camera streaming thread if requested
            if camera_stream_port is not None:
                self._camera_thread = Thread(daemon=True,
                                             target=self._handle_image_stream,
                                             args=[self.camera, camera_stream_port])
                self._camera_thread.start()

        # init rangefinder
        if rangefinder_name is not None:
            self.rangefinder = self.robot.getDevice(rangefinder_name)
            self.rangefinder.enable(1000//rangefinder_fps) # takes frame period in ms

            # start rangefinder streaming thread if requested
            if rangefinder_stream_port is not None:
                self._rangefinder_thread = Thread(daemon=True,
                                                  target=self._handle_image_stream,
                                                  args=[self.rangefinder, rangefinder_stream_port])
                self._rangefinder_thread.start()

        # init sonar (DistanceSensor) if requested
        self.sonar = None
        if sonar_name is not None:
            try:
                self.sonar = self.robot.getDevice(sonar_name)
                if self.sonar is not None:
                    self.sonar.enable(self._timestep)
                    print(f"Sonar '{sonar_name}' found and enabled.")
                else:
                    print(f"Warning: Sonar '{sonar_name}' not found!")
            except Exception:
                self.sonar = None

        # init MAVLink connection for distance sensor reporting (optional)
        self.mav_link = None
        self._mavlink_target_addr = None  # SITL(WSL)のIPアドレスを自動検知して保持する

        # init step counter for throttling MAVLink sends (10 steps = ~50Hz at 500Hz sim)
        self._step_counter = 0
        self._last_distance_send_ms = None
        
        # init boot time for MAVLink timestamp
        self._start_time = time.monotonic()

        # init motors (and setup velocity control)
        self._motors = [self.robot.getDevice(n) for n in motor_names]
        for m in self._motors:
            m.setPosition(float('inf'))
            m.setVelocity(0)

        # start ArduPilot SITL communication thread
        self._sitl_thread = Thread(daemon=True, target=self._handle_sitl, args=[sitl_address, 9002+10*instance])
        self._sitl_thread.start()

    def get_time_boot_ms(self):
        """Get time since boot in milliseconds (uint32)"""
        return int((time.monotonic() - self._start_time) * 1000) & 0xFFFFFFFF

    def _handle_sitl(self, sitl_address: str = "127.0.0.1", port: int = 9002):
        """Handles all communications with the ArduPilot SITL

        Args:
            port (int, optional): Port to listen for SITL on. Defaults to 9002.
        """

        # create a local UDP socket server to listen for SITL
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM) # SOCK_STREAM
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(('0.0.0.0', port))

        # wait for SITL to connect
        print(f"Listening for ardupilot SITL (I{self._instance}) at 127.0.0.1:{port}")
        self.robot.step(self._timestep) # flush print in webots console

        while not select.select([s], [], [], 0)[0]: # wait for socket to be readable
            # if webots is closed, close the socket and exit
            if self.robot.step(self._timestep) == -1:
                s.close()
                self._webots_connected = False
                return

        print(f"Connected to ardupilot SITL (I{self._instance})")

        # main loop handling communications
        while True:
            # check if the socket is ready to send/receive
            readable, writable, _ = select.select([s], [s], [], 0)

            # send data to SITL port (one lower than its output port as seen in SITL_cmdline.cpp)
            if writable:
                fdm_struct = self._get_fdm_struct()
                s.sendto(fdm_struct, (sitl_address, port+1))

            # receive data from SITL port
            if readable:
                data, addr = s.recvfrom(512)
                
                # 自動IP検知: 最初に来たパケットの送信元(WSL側)に対してMAVLinkを送るようにする
                if self.mav_link is None and mavutil:
                    try:
                        wsl_ip = addr[0]
                        # Webots→MAVProxy(UDP:14551)へ送信し、MAVProxy側モジュール(webotsrf)が
                        # master(SITL)へDISTANCE_SENSORを注入します。
                        self.mav_link = mavutil.mavlink_connection(
                            f'udpout:{wsl_ip}:14551',
                            source_system=2,
                            source_component=158,
                        )
                        print(f"[webots_vehicle] Detected SITL at {wsl_ip}. Sending MAVLink distance to udpout:{wsl_ip}:14551")
                    except Exception as e:
                        print(f"[webots_vehicle] MAVLink init error: {e}")

                # parse a single struct
                command = struct.unpack(self.controls_struct_format, data[:self.controls_struct_size])
                self._handle_controls(command)

                # wait until the next Webots time step as no new sensor data will be available until then
                step_success = self.robot.step(self._timestep)
                if step_success == -1: # webots closed
                    break
                
                # send rangefinder center distance to ArduPilot via MAVLink (if available)
                self._step_counter += 1
                try:
                    if hasattr(self, 'send_mavlink_distance'):
                        now_ms = self.get_time_boot_ms()
                        if self._last_distance_send_ms is None or (now_ms - self._last_distance_send_ms) >= 100:
                            self.send_mavlink_distance()
                            self._last_distance_send_ms = now_ms
                except Exception:
                    # avoid spamming errors from MAVLink send
                    pass

        # if we leave the main loop then Webots must have closed
        s.close()
        self._webots_connected = False
        print(f"Lost connection to Webots (I{self._instance})")

    def _get_fdm_struct(self) -> bytes:
        """Form the Flight Dynamics Model struct (aka sensor data) to send to the SITL

        Returns:
            bytes: bytes representing the struct to send to SITL
        """
        # get data from Webots
        i = self.imu.getRollPitchYaw()
        g = self.gyro.getValues()
        a = self.accel.getValues()
        gps_pos = self.gps.getValues()
        gps_vel = self.gps.getSpeedVector()

        # pack the struct, converting ENU to NED (ish)
        # https://discuss.ardupilot.org/t/copter-x-y-z-which-is-which/6823/3
        # struct fdm_packet {
        #     double timestamp;
        #     double imu_angular_velocity_rpy[3];
        #     double imu_linear_acceleration_xyz[3];
        #     double imu_orientation_rpy[3];
        #     double velocity_xyz[3];
        #     double position_xyz[3];
        # };
        return struct.pack(self.fdm_struct_format,
                           self.robot.getTime(),
                           g[0], -g[1], -g[2],
                           a[0], -a[1], -a[2],
                           i[0], -i[1], -i[2],
                           gps_vel[0], -gps_vel[1], -gps_vel[2],
                           gps_pos[0], -gps_pos[1], -gps_pos[2])

    def _handle_controls(self, command: tuple):
        """
        RC1(ステアリング)とRC3(スロットル)を受け取り、
        Webots側でスキッドステア用にミキシングするハンドル操作モード
        """
        
        # --- 1. 信号の取得 (ArduPilotからの出力 0.0〜1.0) ---
        # command[0] = Servo 1 (Steering)
        # command[2] = Servo 3 (Throttle)
        
        # 信号が来ていない(-1)場合は 0.5(中央/停止) とする
        raw_steering = command[0] if command[0] != -1 else 0.5
        raw_throttle = command[2] if command[2] != -1 else 0.5

        # --- 2. -1.0 〜 +1.0 の範囲に正規化 ---
        # ステアリング: 左=-1.0, 右=+1.0
        steer_val = raw_steering * 2 - 1
        
        # スロットル: 後進=-1.0, 前進=+1.0
        throttle_val = raw_throttle * 2 - 1

        # --- 3. ミキシング計算 (Arcade Drive方式) ---
        # 左タイヤ = 前進成分 + 旋回成分
        # 右タイヤ = 前進成分 - 旋回成分
        # ※直進したいのに曲がってしまう場合は + と - を逆にしてください
        left_motor_speed = throttle_val + steer_val
        right_motor_speed = throttle_val - steer_val

        # --- 4. 速度制限とクリッピング (-1.0〜1.0に収める) ---
        left_motor_speed = max(min(left_motor_speed, 1.0), -1.0)
        right_motor_speed = max(min(right_motor_speed, 1.0), -1.0)

        # --- 5. モーターへの出力 ---
        # Pioneer 3-ATは4輪駆動。左2つ、右2つに分配
        # motors配列順序: [front_left, back_left, front_right, back_right] と想定
        
        # 最大速度設定 (rad/s)
        MAX_VELOCITY = min(self._motors[0].getMaxVelocity(), self.motor_velocity_cap)

        final_speeds = [
            left_motor_speed * MAX_VELOCITY,  # Front Left
            left_motor_speed * MAX_VELOCITY,  # Back Left
            right_motor_speed * MAX_VELOCITY, # Front Right
            right_motor_speed * MAX_VELOCITY  # Back Right
        ]

        for i, m in enumerate(self._motors):
            m.setVelocity(final_speeds[i])

    def _handle_image_stream(self, camera: Union[Camera, RangeFinder], port: int):
        """Stream grayscale images over TCP

        Args:
            camera (Camera or RangeFinder): the camera to get images from
            port (int): port to send images over
        """

        # get camera info
        # https://cyberbotics.com/doc/reference/camera
        if isinstance(camera, Camera):
            cam_sample_period = self.camera.getSamplingPeriod()
            cam_width = self.camera.getWidth()
            cam_height = self.camera.getHeight()
            print(f"Camera stream started at 127.0.0.1:{port} (I{self._instance}) "
                  f"({cam_width}x{cam_height} @ {1000/cam_sample_period:0.2f}fps)")
        elif isinstance(camera, RangeFinder):
            cam_sample_period = self.rangefinder.getSamplingPeriod()
            cam_width = self.rangefinder.getWidth()
            cam_height = self.rangefinder.getHeight()
            print(f"RangeFinder stream started at 127.0.0.1:{port} (I{self._instance}) "
                  f"({cam_width}x{cam_height} @ {1000/cam_sample_period:0.2f}fps)")
        else:
            print(sys.stderr, f"Error: camera passed to _handle_image_stream is of invalid type "
                              f"'{type(camera)}' (I{self._instance})")
            return

        # create a local TCP socket server
        server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind(('127.0.0.1', port))
        server.listen(1)

        # continuously send images
        while self._webots_connected:
            # wait for incoming connection
            conn, _ = server.accept()
            print(f"Connected to camera client (I{self._instance})")

            # send images to client
            try:
                while self._webots_connected:
                    # delay at sample rate
                    start_time = self.robot.getTime()

                    # get image
                    if isinstance(camera, Camera):
                        img = self.get_camera_gray_image()
                    elif isinstance(camera, RangeFinder):
                        img = self.get_rangefinder_image()

                    if img is None:
                        print(f"No image received (I{self._instance})")
                        time.sleep(cam_sample_period/1000)
                        continue

                    # create a header struct with image size
                    header = struct.pack("=HH", cam_width, cam_height)

                    # pack header and image and send
                    data = header + img.tobytes()
                    conn.sendall(data)

                    # delay at sample rate
                    while self.robot.getTime() - start_time < cam_sample_period/1000:
                        time.sleep(0.001)

            except ConnectionResetError:
                pass
            except BrokenPipeError:
                pass
            finally:
                conn.close()
                print(f"Camera client disconnected (I{self._instance})")

    def webots_connected(self) -> bool:
        """Check if Webots client is connected"""
        return self._webots_connected

    def update_gui(self):
        if not self.webots_connected(): return
        
        try:
            # カメラ映像の取得。まだ準備ができていない場合はスキップするようにします
            if hasattr(self, 'camera') and self.camera:
                img = self.get_camera_image()
                if img is not None:
                    cv2.imshow("Webots_Camera_View", cv2.cvtColor(img, cv2.COLOR_RGB2BGR))
            
            # ソナーやレンジファインダーも同様
            if hasattr(self, 'sonar') and self.sonar:
                sonar_value = self.sonar.getValue()
                # 1秒ごとにコンソールに出力 (500Hz想定のシミュレーションなら約100〜200ステップごと)
                # ここでは正確な時間(Robot.getTime)を使用して判定
                current_time = self.robot.getTime()
                if not hasattr(self, '_last_print_time'):
                    self._last_print_time = 0
                
                if current_time - self._last_print_time >= 1.0:
                    print(f"{current_time:.1f}s: {sonar_value:.3f}m")
                    self._last_print_time = current_time

            cv2.waitKey(1)
        except Exception as e:
            # エラーが出ても無視して次に進む
            print(f"GUI Update skip: {e}")


    def get_camera_gray_image(self) -> np.ndarray:
        """Get the grayscale image from the camera as a numpy array of bytes"""
        img = self.get_camera_image()
        img_gray = np.average(img, axis=2).astype(np.uint8)
        return img_gray

    def get_camera_image(self) -> np.ndarray:
        """Get the RGB image from the camera as a numpy array of bytes"""
        img = self.camera.getImage()
        if img is None:
            return None
        # Webots uses BGRA format internally
        img = np.frombuffer(img, np.uint8).reshape((self.camera.getHeight(), self.camera.getWidth(), 4))
        # Swap BGRA to RGB: B,G,R is at 0,1,2. We want R,G,B.
        return img[:, :, [2, 1, 0]] # Convert BGRA to RGB

    def get_rangefinder_image(self, use_int16: bool = False) -> np.ndarray:
        """Get the rangefinder depth image as a numpy array of int8 or int16"""\

        # get range image size
        height = self.rangefinder.getHeight()
        width = self.rangefinder.getWidth()

        # get image, and convert raw ctypes array to numpy array
        # https://cyberbotics.com/doc/reference/rangefinder
        image_c_ptr = self.rangefinder.getRangeImage(data_type="buffer")
        img_arr = np.ctypeslib.as_array(image_c_ptr, (width*height,))
        img_floats = img_arr.reshape((height, width))

        # normalize and set unknown values to max range
        range_range = self.rangefinder.getMaxRange() - self.rangefinder.getMinRange()
        img_normalized = (img_floats - self.rangefinder.getMinRange()) / range_range
        img_normalized[img_normalized == float('inf')] = 1

        # convert to int8 or int16, allowing for the option of higher precision if desired
        if use_int16:
            img = (img_normalized * 65535).astype(np.uint16)
        else:
            img = (img_normalized * 255).astype(np.uint8)

        return img

    def stop_motors(self):
        """Set all motors to zero velocity"""
        for m in self._motors:
            m.setPosition(float('inf'))
            m.setVelocity(0)

    def send_mavlink_distance(self):
        """Send the center pixel distance from the RangeFinder to ArduPilot via MAVLink."""
        if not (self.mav_link):
            return

        try:
            # Prefer simple DistanceSensor (sonar) if available
            if not (hasattr(self, 'sonar') and self.sonar is not None):
                return

            try:
                distance_raw = self.sonar.getValue()
                distance_m = float(distance_raw)
            except Exception:
                return

            # Webots DistanceSensorのAPI差異を吸収
            # - getMinRange/getMaxRange があれば使用
            # - なければ getMinValue/getMaxValue を試す
            # - 最後に安全な既定値
            min_r = None
            max_r = None
            for min_name, max_name in (
                ('getMinRange', 'getMaxRange'),
                ('getMinValue', 'getMaxValue'),
            ):
                try:
                    min_r = float(getattr(self.sonar, min_name)())
                    max_r = float(getattr(self.sonar, max_name)())
                    break
                except Exception:
                    continue
            if min_r is None or max_r is None:
                min_r = 0.2
                max_r = 5.0

            # inf/NaNは最大距離扱いにする
            if distance_m == float('inf') or distance_m != distance_m:
                distance_m = max_r

            # ArduPilotへ送る値はcm(uint16)。範囲外はクランプして常に有効値にする
            min_cm = max(0, int(min_r * 100))
            max_cm = max(min_cm + 1, int(max_r * 100))
            current_cm = int(distance_m * 100)
            if current_cm < min_cm:
                current_cm = min_cm
            if current_cm > max_cm:
                current_cm = max_cm


            # Send MAVLink DISTANCE_SENSOR
            try:
                # 自己紹介（ハートビート）を送信　。不要、コメントアウト
                # 頻度を1秒に1回程度にし、状態を「ACTIVE」に明示
                # if self._step_counter % 50 == 0: 
                #     try:
                #         self.mav_link.mav.heartbeat_send(
                #             mavutil.mavlink.MAV_TYPE_ONBOARD_CONTROLLER,
                #             mavutil.mavlink.MAV_AUTOPILOT_INVALID,
                #             mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED,
                #             0,
                #             mavutil.mavlink.MAV_STATE_ACTIVE
                #         )
                #     except Exception:
                #         pass
                
                safe_cm = max(0, current_cm)

                # DISTANCE_SENSOR メッセージの送信
                # RNGFND1_ORIENT=0 (ROTATION_NONE) 固定運用のため、orientation=0のみ送信。
                self.mav_link.mav.distance_sensor_send(
                    self.get_time_boot_ms(),
                    min_cm,
                    max_cm,
                    safe_cm,
                    mavutil.mavlink.MAV_DISTANCE_SENSOR_LASER,
                    0,
                    0,
                    0,
                )
                # ↓ 成功したか確認するためのプリント文
                # print(f"[Debug 1] OK: Sent {current_cm} cm to 14551") 
            except Exception as e:
                # ↓ エラーがあれば表示する
                print(f"[MAVLink Send Error] {e}")
            
        except Exception:
            return
