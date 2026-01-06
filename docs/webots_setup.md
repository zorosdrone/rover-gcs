# ArduRover SITL × Webots 連携ガイド

このドキュメントでは、WSL2上の ArduPilot SITL と Windows上の Webots シミュレータを連携させ、Mission Planner で制御するまでの全手順を解説します。
「不武装なのにバックする」「1 motors 警告」などの問題を解消し、安定したスキッドステア（戦車信地旋回）走行を実現するための設定を含みます。

---

## 0. Webots のインストール (Windows)

1. **ダウンロード**: [Cyberbotics 公式サイト](https://cyberbotics.com/) のダウンロードページから、Windows 用の最新のインストーラー（`.exe`）を取得します。
2. **インストール**: 実行ファイルを開き、ウィザードに従ってインストールを完了させます。インストール先などの設定はデフォルトで構いません。
3. **起動確認**: デスクトップまたはスタートメニューから Webots を起動し、サンプルワールドが正常に表示されるか確認します。

---

## 1. ネットワーク・環境の準備

WSL2とWindows間の通信を確立するために、それぞれのIPアドレスを確認します。

* **Windows IP (SITLから見た送信先)**:
  Windowsのコマンドプロンプト（またはPowerShell）で `ipconfig` を実行。`vEthernet (WSL)` アダプタ、または通信に使用しているネットワークアダプタの IPv4 アドレス（例: `172.30.96.1`）を確認。
* **WSL2 IP (Webotsから見た送信先)**:
  WSL2のターミナルで `hostname -I` を実行。最初のIP（例: `172.30.98.2`）を確認。

### Windows Defender ファイアウォールの設定
Windows側で以下のポートのパケット通過を許可します。
1. **UDPポート**: `9002, 9003` (SITL連携用)
2. **TCPポート**: `5760` (MAVProxy/Mission Planner用)
3. **UDPポート**: `14550` (Mission Planner 接続用)

---

## 2. Webots 側の設定

### Scene Tree（シーンツリー）の設定
Webots の `Pioneer3at`（または使用している Robot ノード）を以下のように構成します。

1. **Robotノード**:
   * **`controller`**: `ardupilot_vehicle` (または `webots_vehicle.py`)
   * **`synchronization`**: **`TRUE`** (必須: SITLと速度を同期)
   * **`controllerArgs`**:
     ```text
     --motors "front left wheel, back left wheel, front right wheel, back right wheel"
     --motor-cap 10
     --bidirectional-motors 1
     --sitl-address 172.30.98.2
     ```
     説明
     * `--bidirectional-motors 1`: 前後両方に動く Rover モードを有効化。
     * `--motor-cap 10`: 速度上限を制限（100だと速すぎて物理演算が破綻し転倒するため）。
     * `--sitl-address`: 手順1で確認した **WSL2 IP**。
     * `--uses-propellers False`: ドローン用の推力計算をオフ。または項目ごと削除

2. **デバイス命名**:
   * モーター等の `name` が `controllerArgs` および Python スクリプト内の名称と完全に一致していることを確認。

3. **WorldInfo**:
   * **`basicTimeStep`**: `20` 程度を推奨。

### コントローラーの修正 (`webots_vehicle.py`)
「disarmedなのにバックする」「1 motors 警告」の根本原因（データの受信・解釈ミス）を修正します。`_handle_controls` メソッドを以下のように更新し、ArduPilot の出力を**スキッドステア（1ch:左, 3ch:右）**として正しくマッピングします。

```python
def _handle_controls(self, command: tuple):
    # 信号の正規化（未受信 -1 を 0.5:停止 に置換）
    cmd_list = [v if v != -1 else 0.5 for v in command]

    # スキッドステア用マッピング (Index 0:左, Index 2:右)
    left_val = cmd_list[0] * 2 - 1
    right_val = cmd_list[2] * 2 - 1

    # 4輪への分配 [front_left, back_left, front_right, back_right]
    final_commands = [left_val, left_val, right_val, right_val]

    for i, m in enumerate(self._motors):
        # 物理破綻を防ぐため速度上限(motor_velocity_cap)を適用
        m.setVelocity(final_commands[i] * min(m.getMaxVelocity(), self.motor_velocity_cap))
```
* **ポイント**: データ未受信（-1 や 0）を「停止信号（0.5）」として扱うことで、負の値（-1.0 = フルバック）への誤変換を防止します。

---

## 3. SITL と MAVProxy の起動 (WSL2)

### ステップ 1: ArduRover SITL の起動
ターミナル 1 で実行します。`-w` オプションはパラメータを初期化したい場合のみ使用してください。

```bash
# <Windows IP> は手順 1 で確認したものに置き換え
/home/ardupilot/GitHub/ardupilot/build/sitl/bin/ardurover 
  --model webots-python 
  --sim-address 172.30.96.1 
  --sim-port-out 9002 
  --sim-port-in 9003
```

### ステップ 2: MAVProxy ブリッジの起動
ターミナル 2 で実行します。これにより Mission Planner などの外部 GCS が接続可能になります。

```bash
# --out には Windows IP を指定
mavproxy.py --master=tcp:127.0.0.1:5760 \
  --out=udp:172.30.96.1:14550 \
  --out=udp:127.0.0.1:14552
```

---

## 4. パラメータ設定と保存

ArduPilot 側を Rover（スキッドステア）仕様に固定するための設定です。Mission Planner または MAVProxy で設定してください。

| カテゴリ | パラメータ名 | 設定値 | 理由 |
| :--- | :--- | :--- | :--- |
| 機体構成 | **FRAME_CLASS** | 1 | Rover (スキッドステア) に設定 |
| 出力割当 | **SERVO1_FUNCTION** | 73 | 1ch を左モーター出力に設定 |
| 出力割当 | **SERVO3_FUNCTION** | 74 | 3ch を右モーター出力に設定 |
| 安全解除 | **ARMING_SKIPCHK** | 65535 | 3D Accel 校正エラー等のチェックをスキップ |
| 停止維持 | **MOT_SAFE_DISARM** | 1 | DISARMED 時に出力を 0 (停止) に強制固定 |
| 制御抑制 | **ATC_SPEED_I** | 0 | 静止中の積分値蓄積による暴走を防止 |

### 💡 その他の動作制限解除（初回のみ推奨）
MAVProxy または Mission Planner のコンソールで以下のコマンドを実行します。

1. `param set ARMING_REQUIRE 0`: アーム操作を不要にする
2. `param set FS_THR_ENABLE 0`: スロットルフェイルセーフ停止
3. `param set COMPASS_ENABLE 0`: コンパスエラー回避
4. `param set BRD_SAFETYENABLE 0`: 仮想セーフティスイッチ無効化

### 💡 設定の保存場所 (EEPROM)
* **保存ファイル**: `eeprom.bin` (SITL起動時のカレントディレクトリに生成)
* **持続性**: `Write Params` を押すとこのファイルに書き込まれ、次回の SITL 起動時に自動で読み込まれます。
* **初期化**: 完全にリセットしたい場合は、SITL 起動時に **`-w`** オプションを付与します。

---

## 5. Mission Planner の接続 (Windows)

1. **接続設定**: 右上の接続種別を `UDP` に設定し、`CONNECT` をクリック。
2. **ポート**: ポート番号 `14550` を入力。
3. **ステータス確認**: `Messages` タブで SITL からのデータが届いているか確認します。

---

## 6. 最終操作手順

1. **Webots**: 「Play」ボタンを押してシミュレーションを開始。
2. **SITLターミナル**: `Waiting for connection` が消えるのを確認。
3. **GCS操作**:
   * `mode manual`
   * `arm throttle`
   * `rc 3 1650` (前進テスト)

---

## チェックリスト
* [ ] Windows/WSL2 の IP アドレスは最新のものを反映したか？
* [ ] Windows ファイアウォールで UDP 9002/9003/14550 は開放されているか？
* [ ] Webots の `synchronization` は `TRUE` になっているか？
* [ ] SITL 起動ディレクトリに `eeprom.bin` が正しく生成されているか？