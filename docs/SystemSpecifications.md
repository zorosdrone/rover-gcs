### 🛠️ Rover開発プロジェクト：システム仕様書 (Ver.0.7)
**～ Cloud-Centric & Smartphone Edge AI 構成 ～**

#### 1. システムアーキテクチャ (Architecture)
[cite_start]「脳（判断・API）」をクラウド（公開Webサーバー）に集約し、ローバー側は「神経（伝達）」と「反射神経（エッジAI）」に徹する構成 [cite: 70]。
[cite_start]ハードウェア構成を極限までシンプルにし、ソフトウェア（Web技術）で高度な制御を実現する [cite: 71]。

* **Cloud Server (Public Web Server):**
    * [cite_start]**OS:** Linux (Ubuntu etc.) - Tailscale 導入必須 [cite: 73]
    * [cite_start]**Frontend:** React Web App (User Interface) [cite: 74]
    * [cite_start]**Backend:** FastAPI + pymavlink (Logic & Control) [cite: 75]
    * [cite_start]**役割:** ユーザー操作の受付、YOLOアラートの受信（予定）、PixhawkへのMAVLinkコマンド生成・送信 [cite: 76]。

* [cite_start]**Edge Terminal (Camera & AI):** Xiaomi Mi 11 Lite 5G [cite: 77]
    * [cite_start]**配置:** ローバー搭載 [cite: 78]
    * [cite_start]**役割:** 映像送信 (VDO.Ninja) + YOLO推論 (ブラウザ上) ※将来実装予定 [cite: 79]

* [cite_start]**Control Bridge:** Raspberry Pi Zero 2 W [cite: 80]
    * [cite_start]**OS:** Rpanion (ArduPilot用管理OS) [cite: 81]
    * [cite_start]**役割:** **MAVLink Router のみ**。Pythonスクリプトは動作させない [cite: 82, 83]。

#### 2. ネットワーク・通信フロー (Network Flow)
[cite_start]サーバーとローバーは Tailscale (VPN) で接続され、あたかも同一LAN内にいるかのように通信する [cite: 85]。

* **映像 & AIデータ (将来実装予定):**
    * [cite_start]スマホ (Sender) $\rightarrow$ [VDO.Ninja P2P] $\rightarrow$ Cloud Frontend (Receiver) [cite: 87]
    * [cite_start]※遅延回避のため、映像はサーバーを経由せずブラウザ間(P2P)で直接やり取りする [cite: 88]。

* **操縦コマンド & 安全停止フロー:**
    1.  **AI検知:** スマホ(TF.js)が人物検知 $\rightarrow$ VDO.Ninja Data Channelで送信（予定）
    2.  **受信:** Cloud Frontend (React) が受信
    3.  **命令:** Cloud Frontend $\rightarrow$ [WebSocket: COMMAND] $\rightarrow$ Cloud Backend (FastAPI)
    4.  [cite_start]**制御:** Cloud Backend $\rightarrow$ [UDP over Tailscale] $\rightarrow$ Pi Zero 2 W $\rightarrow$ [Serial] $\rightarrow$ Pixhawk (HOLDモードへ) [cite: 91]

#### 3. ハードウェア構成・配線 (Hardware & Wiring)
* **電源系統 (Power) - 2系統独立:**
    * [cite_start]**駆動系:** LiPo 11.1V $\rightarrow$ Power Module $\rightarrow$ Pixhawk & ESC [cite: 94]
    * [cite_start]**制御系:** 大容量モバイルバッテリー (2ポート) $\rightarrow$ Pi Zero 2 W & スマホ [cite: 95, 96, 97]

* **通信結線 (Connection):**
    * [cite_start]**Pi Zero 2 W:** Pixhawk の `TELEM 2` ポートとシリアル接続 (Tx/Rx) [cite: 100]。

* **センサー類 (Pixhawkへ集約):**
    * [cite_start]**TF-Luna (LiDAR):** `SERIAL 4/5` ポートへ接続 (Tx/Rxクロス) [cite: 102]。
    * [cite_start]**SG90 (Servo):** `AUX 1 (SERVO9)` へ接続 [cite: 103]。
    * [cite_start]**HC-SR04 (Sonar Right):** `AUX 2 (Echo)` / `AUX 1 (Trig)` [cite: 104]。
    * [cite_start]**HC-SR04 (Sonar Left):** `AUX 4 (Echo)` / `AUX 3 (Trig)` [cite: 105]。

    > **⚠️ 電圧に関する重要警告:**
    > PixhawkのGPIOは **3.3V 耐圧** です。一般的な HC-SR04 (5V版) を使用する場合、Echo信号線（センサー出力）を直接接続すると **Pixhawkが破損します**。
    > 必ず **分圧抵抗（例: 1kΩと2kΩ）** または **ロジックレベル変換機** を挟んで 3.3V に降圧すること。
    > (または、最初から RCWL-1601 等の3.3V対応センサーを使用すること) [cite_start][cite: 106]

#### 4. ソフトウェア要件 (Software Requirements)

**A. Cloud Server (Frontend + Backend)**
* **Backend (FastAPI/Python):**
    * [cite_start]**接続文字列:** `udp:0.0.0.0:14552` (Server Mode) [cite: 113]
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
    * **VDO.Ninja連携 (将来実装予定):**
        * VDO.Ninja `iframe` APIを使用。
        * [cite_start]メッセージイベントリスナー (`window.addEventListener`) を実装し、スマホからの `alert` データを受信したら、即座に Backend へコマンドを送信する実装とする [cite: 117]。

**B. Pi Zero 2 W (Rpanion 設定のみ)**
* **Rpanion (mavlink-router) 設定:**
    * [Flight Controller] $\rightarrow$ Endpoints に以下を追加:
        * [cite_start]**Type:** UDP (Client) [cite: 123]
        * [cite_start]**Address:** [Cloud-Server-Tailscale-IP] [cite: 124]
        * [cite_start]**Port:** 14552 [cite: 125]

**C. Smartphone (Sender Page)**
* **推論頻度の調整:**
    * [cite_start]発熱対策のため、推論 (`model.execute`) は毎フレーム行わず、**500msに1回程度** に間引く実装を推奨 [cite: 139]。

#### [cite_start]5. ArduPilot (Pixhawk) 重要パラメータ設定 [cite: 133]

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
    * [cite_start]Cloud (Server) $\leftarrow$ Pi (Client) の方向で接続します [cite: 136]。
    * Backendが無言になるとTailscaleのNATテーブルが消えて接続が切れるため、**移動命令がない時でもHeartbeatを送り続けること** を徹底してください。
* **CORS:**
    * [cite_start]FrontendとBackendが別ポートになる場合、CORS設定 (`allow_origins`) を忘れないでください [cite: 141]。