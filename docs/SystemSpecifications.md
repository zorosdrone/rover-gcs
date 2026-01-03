> **[Note]**
> このドキュメントは、開発者や上級ユーザー向けのより詳細な技術仕様を記載しています。
>一般的な利用方法については、ルートの [README.md](../README.md) を参照してください。

### 🛠️ Rover開発プロジェクト：システム仕様書 (2026.01.03)
**～ Cloud-Centric & Smartphone Edge Camera 構成 ～**

#### 1. システムアーキテクチャ (Architecture)
「脳（判断・API）」をクラウド（公開Webサーバー）に集約し、ローバー側は「神経（伝達）」と「目（カメラ）」に徹する構成。
ハードウェア構成を極限までシンプルにし、ソフトウェア（Web技術）で高度な制御を実現する。

* **Cloud Server (Public Web Server):**
    * **OS:** Linux (Ubuntu etc.) - Tailscale 導入必須
    * **Frontend:** React Web App (User Interface & AI Inference)
    * **Backend:** FastAPI + pymavlink (Logic & Control)
    * **役割:** ユーザー操作の受付、映像受信とYOLO推論、PixhawkへのMAVLinkコマンド生成・送信。

* **Edge Terminal (Camera):** Xiaomi Mi 11 Lite 5G
    * **配置:** ローバー搭載
    * **役割:** 映像送信 (VDO.Ninja - 自己ホスト)。

* **Control Bridge:** Raspberry Pi Zero 2 W
    * **OS:** Rpanion (ArduPilot用管理OS)
    * **役割:** **MAVLink Router のみ**。Pythonスクリプトは動作させない。

#### 2. ネットワーク・通信フロー (Network Flow)
サーバーとローバーは Tailscale (VPN) で接続され、あたかも同一LAN内にいるかのように通信する。

* **映像 & AIデータ:**
    * スマホ (Sender) $\rightarrow$ [VDO.Ninja P2P] $\rightarrow$ Cloud Frontend (Receiver)
    * Cloud Frontend (Receiver) $\rightarrow$ [TensorFlow.js] $\rightarrow$ YOLO Object Detection (Browser)
    * ※遅延回避のため、映像はサーバーを経由せずブラウザ間(P2P)で直接やり取りする。推論は受信側のブラウザで実行される。

* **操縦コマンド & 安全停止フロー:**
    1.  **センサー監視:** Cloud Frontend (React) が Sonar/LiDAR 距離を監視
    2.  **判定:** 閾値以下になった場合、停止コマンドを生成
    3.  **命令:** Cloud Frontend $\rightarrow$ [WebSocket: COMMAND] $\rightarrow$ Cloud Backend (FastAPI)
    4.  **制御:** Cloud Backend $\rightarrow$ [UDP over Tailscale] $\rightarrow$ Pi Zero 2 W $\rightarrow$ [Serial] $\rightarrow$ Pixhawk (HOLDモードへ)

#### 自動停止機能 (Auto-stop)

本プロジェクトでは、フロントエンド側で距離センサー値（Sonar / LiDAR）を監視し、安全のために自動停止を行う仕組みを導入しています。

- **閾値オプション**: サイドバーの `Auto-stop` で次を選択できます: `Off`, `40 cm`, `60 cm` (デフォルト), `80 cm`, `1.00 m`。
- **動作**: フロントエンドはバックエンドから受け取る `TELEMETRY.sonar_range`（cm）を監視し、選択した閾値以下になった場合に `COMMAND: STOP` をバックエンドへ送信します。
- **バック制御との連携**: 自動停止はフロントエンドまたは送信機（RC）による「後退中（バック）」の判定がある場合は無視されます（誤停止防止）。
- **復帰/優先順位**: 送信機入力が確認された場合は物理送信機が優先され、フロントエンドは必要に応じてバックエンドへ `RELEASE_OVERRIDE` を送り、制御を即座に送信機へ戻します。
- **テスト**: 閾値を設定してからソナーを閾値以内に近づけ、フロントエンドのトースト表示とバックエンドログ (`COMMAND received: {"command": "STOP"}`) を確認してください。

> 注意: センサーの設置位置・車速によって安全停止の適正閾値は変わるため、実運用前に十分なフィールドテストを行ってください。

#### 3. ハードウェア構成・配線 (Hardware & Wiring)
* **電源系統 (Power) - 2系統独立:**
    * **駆動系:** LiPo 11.1V $\rightarrow$ Power Module $\rightarrow$ Pixhawk & ESC
    * **制御系:** 大容量モバイルバッテリー (2ポート) $\rightarrow$ Pi Zero 2 W & スマホ

* **通信結線 (Connection):**
    * **Pi Zero 2 W:** Pixhawk の `TELEM 2` ポートとシリアル接続 (Tx/Rx)。

* **センサー類 (Pixhawkへ集約):**
    * **TF-Luna (LiDAR):** `SERIAL 4/5` ポートへ接続 (Tx/Rxクロス)。
    * **SG90 (Servo):** `AUX 1 (SERVO9)` へ接続。
    * **HC-SR04 (Sonar Right):** `AUX 2 (Echo)` / `AUX 1 (Trig)`。（未実装）
    * **HC-SR04 (Sonar Left):** `AUX 4 (Echo)` / `AUX 3 (Trig)`。（未実装）

    > **⚠️ 電圧に関する重要警告:**
    > PixhawkのGPIOは **3.3V 耐圧** です。一般的な HC-SR04 (5V版) を使用する場合、Echo信号線（センサー出力）を直接接続すると **Pixhawkが破損します**。
    > 必ず **分圧抵抗（例: 1kΩと2kΩ）** または **ロジックレベル変換機** を挟んで 3.3V に降圧すること。
    > (または、最初から RCWL-1601 等の3.3V対応センサーを使用すること)

#### 4. ソフトウェア要件 (Software Requirements)

**A. Cloud Server (Frontend + Backend)**
* **Backend (FastAPI/Python):**
    * **接続文字列:** `udp:0.0.0.0:14552` (Server Mode)
    * **【必須】MAVLink Source ID 設定:**
        * `mavutil.mavlink_connection` 作成時、必ず `source_system=255` (GCS), `source_component=190` (Mission Planner) を指定すること。
        * ※これが不正だとGUIDEDモードの移動命令が拒否されます。
    * **【必須】Heartbeat送信:**
        * 接続直後から、別スレッドで **1Hz (1秒に1回) 間隔** で `mav.heartbeat_send(...)` を送信し続けること。
        * ※通信断絶判定（Failsafe）の回避と、VPNトンネルの維持に必須です。
    * **認証機能:**
        * `/api/login` エンドポイントによる簡易パスワード認証を実装すること。

* **Frontend (React):**
    * **モバイル最適化:**　（未実装）
        * スマホ横持ち (Landscape) 時に操作パネルと地図を左右分割表示すること。
        * `dvh` 単位を使用してビューポートの高さを適切に管理すること。
    * **Advanced Mode 機能:**
        * スマートフォンからのリアルタイム映像表示。
        * 画面UI上からの VDO.Ninja View ID の動的設定および配信用URLの生成機能。
        * 受信した映像に対する YOLO 物体検知結果の表示（ブラウザ内で推論）。
        * 物体までの距離情報の表示。
* **VDO.Ninja連携 (自己ホスト):**
        * VDO.Ninja `iframe` APIを使用。

**B. Pi Zero 2 W (Rpanion 設定のみ)**
* **Rpanion (mavlink-router) 設定:**
    * [Flight Controller] $\rightarrow$ Endpoints に以下を追加:
        * **Type:** UDP (Client)
        * **Address:** [Cloud-Server-Tailscale-IP]
        * **Port:** 14552

**C. Smartphone (Sender Page)**
* **配信アクセスURLのフォーマット:**
    * VDO.Ninja (自己ホスト) へは、以下のURLフォーマットでアクセスし、配信を開始すること。
    * `https://[VDO.NinjaホストのIPまたはドメイン]/vdo/index.html?push=[PUSH_ID]`
    * ※スマホ側での推論は行わず、純粋なカメラ映像送信機として機能させる。

#### 5. ArduPilot (Pixhawk) 重要パラメータ設定

| カテゴリ | パラメータ | 設定値 | 目的 |
| :--- | :--- | :--- | :--- |
| **速度制限** | `SERVO3_MAX` | 1750 | 出力約37%制限。テスト時の暴走防止。 |
| | `CRUISE_SPEED` | 1.0 | 自動走行速度 (m/s)。早歩き程度。 |
| **LiDAR** | `SERIAL4_PROTOCOL` | 9 | Lidar / Rangefinder |
| (正面) | `RNGFND1_TYPE` | 20 | Benewake Serial (TF-Luna) |
| | `RNGFND1_ORIENT` | 0 | Forward (正面) |
| **Sonar** | `SERVO9-12_FUNC` | -1 | AUX1-4 を GPIO (入力) に変更 |
| (右斜め) | `RNGFND2_TYPE` | 30 | HC-SR04 (Legacy / GPIO) |
| | `RNGFND2_ORIENT` | 7 | Front Right (右45度) |
| (左斜め) | `RNGFND3_TYPE` | 30 | HC-SR04 (Legacy / GPIO) |
| | `RNGFND3_ORIENT` | 6 | Front Left (左45度) |
| **回避制御** | `OA_TYPE` | 2 | BendyRuler (回避アルゴリズム) |

#### 6. 開発者への特記事項
* **UDP接続とNAT越え:**
    * Cloud (Server) $\leftarrow$ Pi (Client) の方向で接続します。
    * Backendが無言になるとTailscaleのNATテーブルが消えて接続が切れるため、**移動命令がない時でもHeartbeatを送り続けること** を徹底してください。
* **CORS:**
    * FrontendとBackendが別ポートになる場合、CORS設定 (`allow_origins`) を忘れないでください。