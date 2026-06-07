# Rover 実機 起動手順・動作チェック

久しぶりに実機を動かすときの確認手順です。最初は必ずタイヤを浮かせるか、駆動輪が地面を蹴らない状態で確認してください。

## 0. 事前準備

### 準備するもの

- Rover 本体
- 走行用 LiPo
- 制御系電源用モバイルバッテリー
- プロポ T8FB BT
- Mission Planner を入れた PC
- `rover-gcs` を起動する PC
- Tailscale 接続環境

### 安全確認

- プロポのスロットルを中立にする。
- Rover のタイヤ周辺に物がないことを確認する。
- 最初の ARM はタイヤを浮かせた状態で行う。
- 異常時は次の順で停止する。
  1. プロポのスロットルを中立
  2. Mission Planner または GCS で `DISARM`
  3. 走行用 LiPo を外す

## 1. 本体と Mission Planner の接続

### 起動

1. プロポの電源を入れる。
2. Rover の制御系電源を入れる。
3. Pixhawk の起動音、LED、ブザーを確認する。
4. Raspberry Pi / Rpanion を使う場合は、Pi の起動完了まで待つ。
5. 走行用 LiPo は、通信確認が終わるまで接続しない。必要な場合もタイヤを浮かせてから接続する。

### ネットワーク確認

1. PC と Rover 側 Raspberry Pi が同じ Tailnet にいることを確認する。
2. Rpanion / MAVLink Router の送信先に Mission Planner 用 PC が入っていることを確認する。
   - Mission Planner 用: `udp:<Mission Planner PC の Tailscale IP>:14550`
   - GCS 用は後段で使う: `udp:<GCS PC または WSL の Tailscale IP>:14552`

### Mission Planner 接続

1. Mission Planner を起動する。
2. 接続方式を選ぶ。
   - Tailscale / UDP 接続: `UDP`、ポート `14550`
   - USB 直結: 対象の `COM` ポート、通常 `115200` または `57600`
3. `CONNECT` を押す。
4. Heartbeat を受信し、HUD に機体姿勢とモードが表示されることを確認する。

### Mission Planner 動作チェック

- `Flight Data` で機体姿勢が動くこと。
- `Messages` に致命的な PreArm エラーが残っていないこと。
- `Battery` 電圧が異常値でないこと。
- `GPS` が必要なモードで使える状態であること。
- `Setup > Mandatory Hardware > Radio Calibration` で RC 入力が動くこと。
- 距離センサーを使う場合は `Status` や `Quick` 表示で RangeFinder / Sonar / LiDAR の値が変わること。

### 合格条件

- Mission Planner が接続済みになる。
- `MANUAL` または確認用の安全なモードに変更できる。
- RC 入力、電圧、センサー値が明らかにおかしくない。

## 2. プロポによる操作

### ARM 前チェック

1. Rover を台に乗せるか、駆動輪を浮かせる。
2. Mission Planner でモードを `MANUAL` にする。
3. プロポのステア、スロットル、各スイッチをゆっくり動かす。
4. Mission Planner の Radio Calibration 画面で、次を確認する。
   - ステアリングが RC1 として動く。
   - スロットルが RC3 として動く。
   - 中立が概ね `1500` 付近。
   - 最小 / 最大が概ね `1000` / `2000` 付近。

### ARM と低出力チェック

1. スロットル中立、ステア中立にする。
2. Mission Planner またはプロポ操作で ARM する。
3. ほんの少しだけ前進入力を入れ、タイヤの回転方向を確認する。
4. ほんの少しだけ後退入力を入れ、逆方向に回ることを確認する。
5. ステアを左右に切り、サーボの向きが実車の左右と一致することを確認する。
6. スロットルを中立に戻し、タイヤが止まることを確認する。
7. `DISARM` する。

### 地上低速チェック

1. 広い場所に移動する。
2. 障害物、人、ケーブルがないことを確認する。
3. 低速で 1 m 程度だけ前進する。
4. 中立で停止する。
5. 低速で左右旋回する。
6. 後退を短く確認する。
7. `DISARM` する。

### 合格条件

- プロポ入力で前進、停止、後退、左右ステアが期待通りに動く。
- 中立で勝手に動かない。
- プロポ操作が常に最優先の停止手段として使える。

## 3. GCS のローカルでの起動

このリポジトリのバックエンドは MAVLink を UDP `14552` で待ち受けます。フロントエンドは通常 `http://localhost:5173` です。

### WSL / Linux で一括起動する場合

```bash
cd ~/rover-gcs
./start_dev.sh
```

起動後、次を確認します。

- Backend: `http://localhost:8000/api/health`
- Frontend: `http://localhost:5173`
- Backend ログ: `/tmp/backend.log`
- Frontend ログ: `/tmp/frontend.log`

### 手動起動する場合

ターミナル 1:

```bash
cd ~/rover-gcs/backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

ターミナル 2:

```bash
cd ~/rover-gcs/frontend
npm run dev
```

Windows ネイティブで起動する場合は、環境に合わせて仮想環境の有効化だけ読み替えます。

```powershell
cd C:\Users\ta1na\source\rover-gcs\backend
.\venv\Scripts\Activate.ps1
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

別ターミナル:

```powershell
cd C:\Users\ta1na\source\rover-gcs\frontend
npm run dev
```

### ローカル起動チェック

1. ブラウザで `http://localhost:5173` を開く。
2. 必要ならログインする。
3. 画面上の接続状態が表示されることを確認する。
4. `http://localhost:8000/api/health` が `status: ok` を返すことを確認する。
5. Windows Firewall を使っている場合は、必要に応じて次を許可する。
   - TCP `5173`: Frontend
   - TCP `8000`: Backend
   - UDP `14552`: MAVLink

### 合格条件

- フロントエンドが表示される。
- バックエンドの health check が通る。
- ブラウザの WebSocket 接続エラーが継続しない。

## 4. 本体と GCS の接続、操作

### 接続準備

1. GCS を起動した PC の Tailscale IP を確認する。
2. WSL で GCS を動かしている場合は、Rover 側から到達できる WSL / Tailscale 側の IP を使う。
3. Rpanion / MAVLink Router で、GCS 向け出力を追加または確認する。

```text
udp:<GCS PC または WSL の Tailscale IP>:14552
```

4. GCS バックエンドログに次のような流れが出ることを確認する。

```text
[backend] Waiting for MAVLink heartbeat on udp:0.0.0.0:14552...
[backend] MAVLink heartbeat received
```

### GCS 接続チェック

1. Rover は DISARM のままにする。
2. ブラウザで GCS を開く。
3. `HEARTBEAT` が表示されることを確認する。
4. Mode が Mission Planner と一致することを確認する。
5. Battery、GPS、速度、方位、RC_CHANNELS が更新されることを確認する。
6. 地図上の位置が更新されることを確認する。
7. 距離センサーを使う場合は `Sonar` / `LiDAR` 表示が変わることを確認する。

### GCS 操作チェック

最初は必ずタイヤを浮かせた状態で行います。

1. GCS で `DISARMED` 表示であることを確認する。
2. モードを `MANUAL` または `HOLD` に切り替え、Mission Planner 側でも同じモードになったことを確認する。
3. GCS から `ARM` する。
4. ジョイスティックまたは操作ボタンで、ごく短く前進入力を入れる。
5. Backend ログに `RC_OVERRIDE sent` が出ることを確認する。
6. スロットル中立または `STOP` で停止することを確認する。
7. 左右ステアを短く確認する。
8. 後退を短く確認する。
9. GCS で `DISARM` する。
10. プロポ入力で GCS 操作を上書き・停止できることを確認する。

### Auto-stop チェック

1. GCS の `Auto-stop` を `60 cm` などに設定する。
2. Rover は低速、またはタイヤを浮かせた状態にする。
3. 距離センサー前に障害物を近づける。
4. GCS が `STOP` を送ることを確認する。
5. Backend ログに `COMMAND received` と `STOP` が出ることを確認する。
6. `Auto-stop` を不要時は `Off` に戻す。

### 地上での最終確認

1. 低速制限を意識して、短距離だけ前進する。
2. `STOP` で止める。
3. プロポで停止できることを再確認する。
4. GCS で `DISARM` する。
5. 走行用 LiPo、制御系電源の順に切る。

### 合格条件

- GCS が Heartbeat と主要テレメトリを受信する。
- GCS から mode change、ARM / DISARM、STOP が効く。
- GCS 操作中でもプロポで安全に停止・復帰できる。
- Auto-stop を使う場合、距離センサー値に応じて STOP が出る。

## 5. 異常時の切り分け

### Mission Planner はつながるが GCS がつながらない

- GCS バックエンドが起動しているか確認する。
- UDP `14552` が Firewall で遮断されていないか確認する。
- Rpanion / MAVLink Router の出力先が `14552` になっているか確認する。
- WSL で動かしている場合、Windows 側 IP ではなく WSL / Tailscale 側の到達可能な IP を指定しているか確認する。

### GCS は表示されるが操作できない

- Backend ログに `MAVLink heartbeat received` があるか確認する。
- `RC_OVERRIDE sent` が出るか確認する。
- ArduPilot 側のモードが RC override を受け付ける状態か確認する。
- ARM できているか確認する。

### プロポ操作の向きがおかしい

- Mission Planner の Radio Calibration で RC1 / RC3 の増減方向を確認する。
- 必要ならプロポ側または ArduPilot パラメータでリバース設定を確認する。
- タイヤを浮かせた状態で再確認する。

### 勝手に動く、止まらない

1. プロポを中立にする。
2. GCS または Mission Planner で `DISARM` する。
3. 走行用 LiPo を外す。
4. RC 中立、ESC キャリブレーション、GCS の RC override 送信状態を確認する。

## 6. SSH / Tailscale 復旧メモ

今回の確認では、Rover 側 Raspberry Pi は `pizero2` として Tailscale に登録されています。Web サーバー側は DigitalOcean Droplet を使っている前提で記載します。Droplet 名、Public IPv4、Tailscale 名は将来変わる可能性があるため、DigitalOcean Control Panel と `tailscale status` で都度確認してください。

### Raspberry Pi に SSH できない

まず PC から名前解決と疎通を確認します。

```powershell
ping pizero2.local
ssh pi@pizero2.local
```

IPv4 が分かっている場合は、同じ Wi-Fi セグメントにいることを確認してから接続します。

```powershell
ssh pi@<Raspberry Pi の IPv4>
```

ラズパイ側で IP を確認する場合:

```bash
hostname -I
ip addr show wlan0
iwgetid
```

PC とラズパイが同じ Wi-Fi にいても IPv4 でつながらない場合は、両者のアドレス帯を確認します。正常な例では、PC とラズパイが同じ IPv4 セグメントに入っています。

```text
PC:      192.168.x.10
pizero2: 192.168.x.20
```

IPv6 の `2001:...` で応答する場合、IPv6 経由では SSH できることがあります。

```powershell
ssh -6 pi@pizero2.local
```

ただし、グローバル IPv6 への直接 SSH は外部から到達可能になる場合があるため、常用は Tailscale 経由を優先します。

### Raspberry Pi の Tailscale が DNS エラーになる

`tailscale status` で `Logged out` や `NoState` になり、次のような DNS エラーが出る場合があります。

```text
failed to resolve "controlplane.tailscale.com"
```

このとき `/etc/resolv.conf` が Tailscale DNS の `100.100.100.100` を向いたままだと、ログアウト状態では名前解決できません。

確認:

```bash
ping -c 3 8.8.8.8
ping -c 3 google.com
cat /etc/resolv.conf
```

`8.8.8.8` は通るが `google.com` が失敗する場合は DNS 問題です。一時復旧:

```bash
sudo rm /etc/resolv.conf
printf "nameserver 8.8.8.8\nnameserver 1.1.1.1\n" | sudo tee /etc/resolv.conf
ping -c 3 google.com
sudo tailscale up --reset
```

認証 URL が出たら PC / スマホで開いてログインします。復帰後:

```bash
tailscale status
tailscale ip -4
```

### Raspberry Pi のホスト名を変更した場合

Linux ホスト名は Tailscale 名とは別です。今回のラズパイは `raspberrypi` から `pizero2` に変更しました。

```bash
sudo hostnamectl set-hostname pizero2
```

`sudo: unable to resolve host pizero2` が出る場合は、`/etc/hosts` に新しい名前がない状態です。`/etc/hosts` に次を入れます。

```text
127.0.1.1    pizero2
```

確認:

```bash
hostname
cat /etc/hosts
```

反映を確実にするには再起動します。

```bash
sudo reboot
```

再起動後:

```powershell
ssh pi@pizero2.local
```

### DigitalOcean Droplet に SSH できない

DigitalOcean Droplet の Public IPv4 は Control Panel の Droplet 概要画面で確認します。

1. DigitalOcean Control Panel を開く。
2. `Droplets` から対象 Droplet を選ぶ。
3. `Public IPv4` を確認する。

PC から SSH ポートを確認します。

```powershell
Test-NetConnection <Droplet の Public IPv4> -Port 22
```

通る場合:

```powershell
ssh root@<Droplet の Public IPv4>
```

Tailscale が復帰している場合は、`tailscale status` で対象 Droplet の Tailscale 名または `100.x.x.x` の IP を確認します。

```powershell
tailscale status
tailscale ping <Droplet の Tailscale 名>
ssh root@<Droplet の Tailscale 名>
```

または Tailscale IP で接続します。

```powershell
ssh root@<Droplet の Tailscale IP>
```

### DigitalOcean Web Console が handshake timeout する

DigitalOcean の Web Console で次のエラーが出る場合があります。

```text
Error: Timed out while waiting for handshake
```

この場合は、Droplet Console 側の接続確立に失敗しています。まず通常 SSH の `22` 番を確認し、それでも入れない場合は DigitalOcean の Recovery Console を使います。

### DigitalOcean Recovery Console で root パスワードを再設定する

Recovery Console でパスワードが分からない場合は、DigitalOcean Control Panel の Droplet `Settings` から root パスワードを再設定します。

1. 対象 Droplet の `Settings` を開く。
2. `Reset root password` セクションへ進む。
3. 確認欄に表示されている Droplet 名をそのまま入力する。
4. `Reset Root Password` を押す。
5. メールで届いた一時パスワードを使い、Recovery Console で `root` としてログインする。

初回ログイン時はパスワード変更を求められます。

```text
login: root
password: メールで届いた一時パスワード
(current) UNIX password: メールで届いた一時パスワード
Enter new UNIX password: 新しいパスワード
Retype new UNIX password: 新しいパスワード
```

ログイン後、サービス状態を確認します。

```bash
hostname
ip addr
ip route
systemctl status ssh
systemctl status droplet-agent
systemctl status tailscaled
tailscale status
```

Tailscale がログアウトしている場合:

```bash
sudo tailscale up
```

認証 URL が出たら PC / スマホで開いてログインします。復帰後、ラズパイや PC から `tailscale status` を実行し、対象 Droplet に `offline` が付いていなければ Tailscale は有効です。

```text
100.x.x.x  <Droplet の Tailscale 名>  <Tailscale アカウント>  linux  -
```
