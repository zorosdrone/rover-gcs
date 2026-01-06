# ArduRover SITL × Webots 連携ガイド

> [!WARNING]
> **現在保留中 (2026.01.06)**
> 本連携機能は、2026年1月6日時点において正常な動作が確認できていないため、開発を一時保留しています。手順は参考情報として参照してください。

このドキュメントでは、WSL2上の ArduPilot SITL と Windows上の Webots シミュレータを連携させ、Mission Planner で制御するまでの全手順を解説します。

---

## 1. ネットワーク・環境の準備

WSL2とWindows間の通信を確立するために、それぞれのIPアドレスを確認します。

* **Windows IP (SITLから見た送信先)**:
  WSL2で `cat /etc/resolv.conf` を実行。`nameserver` の右側のIP（例: `172.30.96.1`）を確認。
* **WSL2 IP (Webotsから見た送信先)**:
  WSL2で `hostname -I` を実行。最初のIP（例: `172.30.98.2`）を確認。

### Windows Defender ファイアウォールの設定
Windows側で以下のポートのパケット通過を許可します。
1. **UDPポート**: `9002, 9003` (SITL連携用)
2. **TCPポート**: `5760` (MAVProxy/Mission Planner用)
3. **UDPポート**: `14550` (Mission Planner 接続用)

---

## 2. Webots 側の設定

### Scene Tree（シーンツリー）の設定
Webots の Robot ノードを以下のように構成します。

1. **Robotノード**:
   * **`controller`**: `ardupilot_vehicle` (または `webots_vehicle.py`)
   * **`synchronization`**: **`TRUE`** (必須: SITLと速度を同期)
   * **`controllerArgs`**:
     * `--sitl-address`
     * `172.30.98.2` （手順1で確認した **WSL2 IP**）

2. **デバイス命名**:
   * モーター等の `name` が Python スクリプト内の名称（例: `left_rear_wheel`）と一致していることを確認。

3. **WorldInfo**:
   * **`basicTimeStep`**: `20` 程度を推奨。

### コントローラーの修正（必要な場合）
SITL の接続を待たずにパケット送信を開始させる（Active Handshake）ため、`webots_vehicle.py` の `_handle_sitl` メソッドを修正して動作確認することも可能

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
mavproxy.py --master=tcp:127.0.0.1:5760 --out=udp:172.30.96.1:14550
```

---

## 4. パラメータ設定と保存

### 動作制限の解除（初回のみ推奨）
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