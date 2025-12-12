const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusDiv = document.getElementById('status');

// カメラのセットアップ
async function setupCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                facingMode: 'environment', // リアカメラ優先
                width: { ideal: 640 },
                height: { ideal: 480 }
            }, 
            audio: false
        });
        video.srcObject = stream;
        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                resolve(video);
            };
        });
    } catch (e) {
        alert("カメラの起動に失敗しました: " + e.message);
        throw e;
    }
}

// 描画処理
function renderPredictions(predictions) {
    // 映像を描画
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // フォント設定
    ctx.font = '18px Arial';
    ctx.textBaseline = 'top';

    predictions.forEach(prediction => {
        const [x, y, width, height] = prediction.bbox;
        const label = `${prediction.class} (${Math.round(prediction.score * 100)}%)`;

        // バウンディングボックス
        ctx.strokeStyle = '#00FFFF';
        ctx.lineWidth = 4;
        ctx.strokeRect(x, y, width, height);

        // ラベル背景
        const textWidth = ctx.measureText(label).width;
        ctx.fillStyle = '#00FFFF';
        ctx.fillRect(x, y, textWidth + 10, 25);

        // ラベルテキスト
        ctx.fillStyle = '#000000';
        ctx.fillText(label, x + 5, y + 5);
    });
}

// 推論ループ
function detectFrame(video, model) {
    model.detect(video).then(predictions => {
        renderPredictions(predictions);
        requestAnimationFrame(() => {
            detectFrame(video, model);
        });
    });
}

// メイン処理
async function run() {
    // 1. カメラ起動
    await setupCamera();
    
    // キャンバスサイズをビデオに合わせる
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // 2. モデルロード (COCO-SSD)
    statusDiv.innerText = "Loading model...";
    console.log("Loading model...");
    
    // lite_mobilenet_v2 を指定して軽量化
    const model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
    
    console.log("Model loaded.");
    statusDiv.innerText = "Running";

    // 3. 推論ループ開始
    detectFrame(video, model);
}

run();
