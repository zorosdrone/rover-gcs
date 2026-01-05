# ArduRover SITL × Webots 連携 :作業中

## 1. ネットワーク環境の確定

WSL2とWindows間の通信先を特定します。これはPC起動ごとに変わる可能性があるため、必ず最初に確認してください。

* **Windows IP (SITLから見た送信先)**:
  WSL2で `cat /etc/resolv.conf` を実行。`nameserver` の右側のIP（例: `172.30.96.1`）を確認。
* **WSL2 IP (Webotsから見た送信先)**:
  WSL2で `hostname -I` を実行。最初のIP（例: `172.30.98.2`）を確認。

---

## 2. Windows Defender ファイアウォールの開放

Windows側でパケットの通過を許可します。

1. **「受信の規則」**を新規作成：
   * **UDPポート**: `9002, 9003` を許可（SITL連携用）。
   * **TCPポート**: `5760` を許可（Mission Planner用）。

2. **設定内容**: 「接続を許可する」とし、プロファイルは「ドメイン・プライベート・パブリック」すべてにチェックを入れます。

---

## 3. Webots UI（GUI）での設定項目

Webotsの「Scene Tree（シーンツリー）」で、ロボットがArduPilotと通信できるように以下の項目を設定します。

1. **Robotノードの設定**:
   * **`controller` フィールド**: `ardupilot_vehicle` (または `webots_vehicle.py`) を選択します。
   * **`synchronization` フィールド**: **`TRUE`** に設定（SITLの計算速度と同期させるため）。
   * **`supervisor` フィールド**: 必要に応じて `TRUE`（初期位置のリセットなどを行う場合）。
   * **`controllerArgs` フィールド**: Python スクリプトへ引数を渡すために、以下の2行を追加してください。
     * `--sitl-address`
     * `172.30.98.2` （手順1でメモした WSL2 の IP）

2. **デバイスの命名（重要）**:
   * タイヤのモーター（RotationalMotor）などの `name` フィールドが、Pythonスクリプト内の名称（例: `left_rear_wheel` など）と完全に一致しているか確認してください。

3. **WorldInfoの設定**:
   * **`basicTimeStep`**: `20` 程度を推奨（ArduPilotのループ周期に合わせるため）。


## 4. Webotsコントローラーの修正

ArduPilot公式のWebots用コントローラーファイルを編集します。

* **修正ファイル（フルパス）**:
  `C:\Program Files\Webots\projects\samples\devices\controllers\ardupilot_vehicle\webots_vehicle.py`
  （※カスタムプロジェクトの場合は、自身の `controllers/` フォルダ内の該当ファイルを編集）

### 修正：強制接続（Active Handshake）

`_handle_sitl` メソッドを以下のように修正し、SITLの起動を待たずにパケットを送り始めます。

```python
def _handle_sitl(self, sitl_address="172.30.98.2", port=9002):
    # 手順1のWSL2のIPを指定
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.bind(('0.0.0.0', port)) 
    s.settimeout(0.01) # デッドロック防止

    while True:
        # 先にセンサーデータを送信（9003番ポート）してSITLを「起こす」
        fdm_struct = self._get_fdm_struct()
        s.sendto(fdm_struct, (sitl_address, port + 1)) 

        try:
            data, addr = s.recvfrom(512) # SITLからの制御を受信
            if len(data) >= 144: # 制御構造体サイズ
                command = struct.unpack(self.controls_struct_format, data[:self.controls_struct_size])
                self._handle_controls(command)
        except socket.timeout:
            pass

        if self.robot.step(self._timestep) == -1:
            break

```

---

## 5. ArduRover SITLの起動 (WSL2)

`-C` を外して起動し、通信ポートを固定します。

```bash
/home/ardupilot/GitHub/ardupilot/build/sitl/bin/ardurover \
  -w \
  --model webots-python \
  --sim-address <WindowsのIP> \
  --sim-port-out 9002 \
  --sim-port-in 9003
```

---

## 6. パラメータの強制変更（初期化）

地上局（MAVProxy等）で以下のコマンドを必ず実行し、動作制限を解除します。

1. **`param set ARMING_CHECK 0`**: 全ての安全チェックを無効化。
2. **`param set FS_ACTION 0`**: フェイルセーフによる停止を防止。
3. **`param set MAG_ENABLE 0`**: コンパス不備によるエラーを回避。

---

## 7. 最終操作手順

1. **Webots**: 「Play」ボタンを押す。
2. **SITLターミナル**: `Waiting for connection` が消えるのを確認。
3. **地上局**:
   * `mode manual`
   * `arm throttle`
   * `rc 3 1650` (前進)

---

**チェックリスト**:

* [ ] `webots_vehicle.py` の送信先IPはWSL2のものか？
* [ ] `struct.pack` は正確に `16d` (128バイト) か？
* [ ] WindowsファイアウォールでUDP 9002/9003は許可されているか？
* [ ] WebotsのRobotノードで `synchronization` は `TRUE` か？