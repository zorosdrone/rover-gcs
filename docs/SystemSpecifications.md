> **[Note]**
> このドキュメントは、開発者や上級ユーザー向けのより詳細な技術仕様を記載しています。
>一般的な利用方法については、ルートの [README.md](../README.md) を参照してください。

### 🛠️ Rover開発プロジェクト：システム仕様書 (2025.12.14)
**～ Cloud-Centric & Smartphone Edge AI 構成 ～**

#### 1. システムアーキテクチャ (Architecture)
「脳（判断・API）」をクラウド（公開Webサーバー）に集約し、ローバー側は「神経（伝達）」と「反射神経（エッジAI）」に徹する構成。
ハードウェア構成を極限までシンプルにし、ソフトウェア（Web技術）で高度な制御を実現する。

* **Cloud Server (Public Web Server):**
    * **OS:** Linux (Ubuntu etc.) - Tailscale 導入必須
    * **Frontend:** React Web App (User Interface)
    * **Backend:** FastAPI + pymavlink (Logic & Control)
    * **役割:** ユーザー操作の受付、YOLOアラートの受信、PixhawkへのMAVLinkコマンド生成・送信。

* **Edge Terminal (Camera & AI):** Xiaomi Mi 11 Lite 5G
    * **配置:** ローバー搭載
    * **役割:** 映像送信 (VDO.Ninja - 自己ホスト) および YOLO 推論 (ブラウザ上) と距離計測。

* **Control Bridge:** Raspberry Pi Zero 2 W
    * **OS:** Rpanion (ArduPilot用管理OS)
    * **役割:** **MAVLink Router のみ**。Pythonスクリプトは動作させない。

#### 2. ネットワーク・通信フロー (Network Flow)
サーバーとローバーは Tailscale (VPN) で接続され、あたかも同一LAN内にいるかのように通信する。

* **映像 & AIデータ:**
    * スマホ (Sender) $\rightarrow$ [VDO.Ninja P2P] $\rightarrow$ Cloud Frontend (Receiver)
    * スマホ (Sender) $\rightarrow$ [VDO.Ninja Data Channel] $\rightarrow$ Cloud Frontend (Object Detection & Distance Data)
    * ※遅延回避のため、映像はサーバーを経由せずブラウザ間(P2P)で直接やり取りする。

* **操縦コマンド & 安全停止フロー:**
    1.  **AI検知:** スマホ(TF.js)が人物検知 $\rightarrow$ VDO.Ninja Data Channelで送信
    2.  **受信:** Cloud Frontend (React) が受信
    3.  **命令:** Cloud Frontend $\rightarrow$ [WebSocket: COMMAND] $\rightarrow$ Cloud Backend (FastAPI)
    4.  **制御:** Cloud Backend $\rightarrow$ [UDP over Tailscale] $\rightarrow$ Pi Zero 2 W $\rightarrow$ [Serial] $\rightarrow$ Pixhawk (HOLDモードへ)

#### 3. ハードウェア構成・配線 (Hardware & Wiring)
* **電源系統 (Power) - 2系統独立:**
    * **駆動系:** LiPo 11.1V $\rightarrow$ Power Module $\rightarrow$ Pixhawk & ESC
    * **制御系:** 大容量モバイルバッテリー (2ポート) $\rightarrow$ Pi Zero 2 W & スマホ

* **通信結線 (Connection):**
    * **Pi Zero 2 W:** Pixhawk の `TELEM 2` ポートとシリアル接続 (Tx/Rx)。

* **センサー類 (Pixhawkへ集約):**
    * **TF-Luna (LiDAR):** `SERIAL 4/5` ポートへ接続 (Tx/Rxクロス)。
    * **SG90 (Servo):** `AUX 1 (SERVO9)` へ接続。
    * **HC-SR04 (Sonar Right):** `AUX 2 (Echo)` / `AUX 1 (Trig)`。
    * **HC-SR04 (Sonar Left):** `AUX 4 (Echo)` / `AUX 3 (Trig)`。

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
    * **モバイル最適化:**
        * スマホ横持ち (Landscape) 時に操作パネルと地図を左右分割表示すること。
        * `dvh` 単位を使用してビューポートの高さを適切に管理すること。
    * **Advanced Mode 機能:**
        * スマートフォンからのリアルタイム映像表示。
        * 受信した映像に対する YOLO 物体検知結果の表示。
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
* **推論頻度の調整:**
    * 発熱対策のため、推論 (`model.execute`) は毎フレーム行わず、**500msに1回程度** に間引く実装を推奨。
* **YOLO と距離計測:**
    * カメラ映像に対して YOLO 推論を実行し、検出された物体の種類と画面上の位置、および距離センサー（LiDAR/Sonar）からの情報と連携して物体までの距離を算出・表示すること。
* **配信アクセスURLのフォーマット:**
    * VDO.Ninja (自己ホスト) へは、以下のURLフォーマットでアクセスし、配信を開始すること。
    * `https://[VDO.NinjaホストのIPまたはドメイン]/vdo/index.html?push=[PUSH_ID]`

#### 5. ArduPilot (Pixhawk) 重要パラメータ設定

| カテゴリ | パラメータ | 設定値 | 目的 |
| :--- | :--- | :--- | :--- |
| **速度制限** | `SERVO3_MAX` | 1650 | 出力約37%制限。テスト時の暴走防止。 |
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