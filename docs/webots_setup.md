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
「disarmedなのにバックする」「1 motors 警告」の根本原因を修正しつつ、一般的なプロポ操作（右スティック縦でスロットル、横でステア）に対応させます。`_handle_controls` メソッドを以下のように更新し、ArduPilot からの **RC1(Steer)** と **RC3(Throttle)** を Webots 側で左右のタイヤ出力にミキシングします。

```python
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
        left_motor_speed = throttle_val + steer_val
        right_motor_speed = throttle_val - steer_val

        # --- 4. 速度制限とクリッピング (-1.0〜1.0に収める) ---
        left_motor_speed = max(min(left_motor_speed, 1.0), -1.0)
        right_motor_speed = max(min(right_motor_speed, 1.0), -1.0)

        # --- 5. モーターへの出力 ---
        # Pioneer 3-ATは4輪駆動。左2つ、右2つに分配
        MAX_VELOCITY = min(self._motors[0].getMaxVelocity(), self.motor_velocity_cap)

        final_speeds = [
            left_motor_speed * MAX_VELOCITY,  # Front Left
            left_motor_speed * MAX_VELOCITY,  # Back Left
            right_motor_speed * MAX_VELOCITY, # Front Right
            right_motor_speed * MAX_VELOCITY  # Back Right
        ]

        for i, m in enumerate(self._motors):
            m.setVelocity(final_speeds[i])
```
* **ポイント**: データ未受信（-1 や 0）を「停止信号（0.5）」として扱うことで、負の値（-1.0 = フルバック）への誤変換を防止します。また ArduPilot 側はシンプルな GroundSteering 設定にする必要があります。

---

## 3. SITL と MAVProxy の起動 (WSL2)

便利な起動スクリプト `start_sitl4webots.sh` を用意しました。これ一つで SITL と MAVProxy の両方が適切な設定で起動します。

### ステップ 1: スクリプトの設定
`start_sitl4webots.sh` をテキストエディタで開き、`WINDOWS_IP` 変数をお使いの環境に合わせて修正してください（手順1で確認したWindowsのIPアドレス）。

```bash
# Windows側のIPアドレス (Webots実行マシン)
WINDOWS_IP="172.30.96.1"  # <--- ここを修正
```

### ステップ 2: 起動
ターミナルでスクリプトを実行します。

```bash
cd ~/rover-gcs
chmod +x start_sitl4webots.sh
./start_sitl4webots.sh
```

スクリプトが実行されると以下の処理が自動的に行われます：
1. ArduRover SITL バイナリの起動（Webots連携モード）
2. パラメータファイル（`mav.parm`）の自動ロード
3. MAVProxy の起動（WebUI用、GCS用ポートへの転送設定済み）


---

## 4. パラメータ設定と保存

実機（CC-02 前輪ハンドル）との設定統一性を保ちながら、Webots シミュレータ（Pioneer 3-AT）で動作させるための設定です。Python が操舵方式の変換を担当します。Mission Planner または MAVProxy で設定してください。

| カテゴリ | パラメータ名 | 設定値 | 理由 |
| :--- | :--- | :--- | :--- |
| 機体構成 | **FRAME_CLASS** | 1 | Rover に設定（実機との統一） |
| 出力割当 | **SERVO1_FUNCTION** | 26 | 1ch を GroundSteering に設定（Python で左右速度差に変換） |
| 出力割当 | **SERVO3_FUNCTION** | 70 | 3ch を Throttle (アクセル) に設定 |
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