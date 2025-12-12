let video = document.getElementById('video');
let canvasOutput = document.getElementById('canvasOutput');
let ctxOutput = canvasOutput.getContext('2d');
let statusDiv = document.getElementById('status');

let streaming = false;
let cap = null;
let frame = null;
let frameGray = null;
let oldGray = null;
let flow = null;

// OpenCV.jsのロード完了時に呼ばれる関数
function onOpenCvReady() {
    statusDiv.innerHTML = 'OpenCV.js is ready. Starting camera...';
    startCamera();
}

async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',
                width: { ideal: 640 },
                height: { ideal: 480 }
            },
            audio: false
        });
        video.srcObject = stream;
        video.play();
        
        video.onloadedmetadata = () => {
            video.width = video.videoWidth;
            video.height = video.videoHeight;
            canvasOutput.width = video.videoWidth;
            canvasOutput.height = video.videoHeight;
            
            startProcessing();
        };
    } catch (err) {
        statusDiv.innerHTML = 'Error starting camera: ' + err;
        console.error(err);
    }
}

function startProcessing() {
    if (streaming) return;
    
    try {
        cap = new cv.VideoCapture(video);
        frame = new cv.Mat(video.height, video.width, cv.CV_8UC4);
        frameGray = new cv.Mat(video.height, video.width, cv.CV_8UC1);
        oldGray = new cv.Mat(video.height, video.width, cv.CV_8UC1);
        flow = new cv.Mat(video.height, video.width, cv.CV_32FC2);

        // 最初のフレームを読み込み、グレースケールに変換して保存
        cap.read(frame);
        cv.cvtColor(frame, oldGray, cv.COLOR_RGBA2GRAY);

        streaming = true;
        statusDiv.innerHTML = 'Running Optical Flow (Farneback)';
        
        requestAnimationFrame(processVideo);
    } catch (err) {
        statusDiv.innerHTML = 'Error initializing OpenCV: ' + err;
        console.error(err);
    }
}

function processVideo() {
    if (!streaming) return;

    try {
        let begin = Date.now();

        // 新しいフレームを読み込む
        cap.read(frame);
        cv.cvtColor(frame, frameGray, cv.COLOR_RGBA2GRAY);

        // オプティカルフロー計算 (Farneback法)
        // pyr_scale, levels, winsize, iterations, poly_n, poly_sigma, flags
        cv.calcOpticalFlowFarneback(oldGray, frameGray, flow, 0.5, 3, 15, 3, 5, 1.2, 0);

        // 結果の描画 (元の映像を表示)
        cv.imshow('canvasOutput', frame);

        // フローの可視化 (ベクトルを描画)
        drawFlow(flow);

        // 現在のフレームを次の比較用に保存
        frameGray.copyTo(oldGray);

        // パフォーマンス計測
        let delay = 1000/30 - (Date.now() - begin);
        setTimeout(processVideo, delay);
    } catch (err) {
        console.error(err);
        streaming = false;
        statusDiv.innerHTML = 'Error during processing: ' + err;
    }
}

function drawFlow(flow) {
    const step = 16; // グリッドの間隔
    const scale = 2; // ベクトルの長さのスケール
    
    ctxOutput.strokeStyle = 'rgb(0, 255, 0)';
    ctxOutput.lineWidth = 1;
    ctxOutput.beginPath();

    const cols = flow.cols;
    const rows = flow.rows;
    
    let totalMag = 0;
    let count = 0;

    // OpenCV.jsの仕様上、data32FはプロパティとしてFloat32Arrayを返す実装が多い
    if (flow.data32F) {
        const data = flow.data32F;
        for (let y = 0; y < rows; y += step) {
            for (let x = 0; x < cols; x += step) {
                const index = (y * cols + x) * 2;
                const fx = data[index];
                const fy = data[index + 1];
                
                const mag = Math.sqrt(fx * fx + fy * fy);
                if (mag > 1.0) {
                    ctxOutput.moveTo(x, y);
                    ctxOutput.lineTo(x + fx * scale, y + fy * scale);
                    
                    totalMag += mag;
                    count++;
                }
            }
        }
    } else {
        // フォールバック (遅いが確実)
        for (let y = 0; y < rows; y += step) {
            for (let x = 0; x < cols; x += step) {
                let flowVec = flow.floatPtr(y, x);
                let fx = flowVec[0];
                let fy = flowVec[1];

                const mag = Math.sqrt(fx * fx + fy * fy);
                if (mag > 1.0) {
                    ctxOutput.moveTo(x, y);
                    ctxOutput.lineTo(x + fx * scale, y + fy * scale);
                    
                    totalMag += mag;
                    count++;
                }
            }
        }
    }
    
    ctxOutput.stroke();

    // 衝突警告ロジック
    // 平均フロー量が大きい場合、物体が近いか、カメラが速く動いている
    const avgFlow = count > 0 ? totalMag / count : 0;
    
    // 閾値は環境に合わせて調整が必要
    const warningThreshold = 15.0; 
    const dangerThreshold = 30.0;

    let msg = `Avg Flow: ${avgFlow.toFixed(2)}`;
    let color = "black";

    if (avgFlow > dangerThreshold) {
        msg += " <br><span style='color:red; font-size:24px; font-weight:bold;'>COLLISION WARNING! (Too Close/Fast)</span>";
        statusDiv.style.backgroundColor = "rgba(255, 0, 0, 0.3)";
    } else if (avgFlow > warningThreshold) {
        msg += " <br><span style='color:orange; font-size:20px; font-weight:bold;'>Caution: Approaching</span>";
        statusDiv.style.backgroundColor = "rgba(255, 165, 0, 0.3)";
    } else {
        statusDiv.style.backgroundColor = "transparent";
    }
    
    statusDiv.innerHTML = msg;
}

// クリーンアップ (ページを離れるときなど)
window.onunload = () => {
    if (cap) {
        frame.delete();
        frameGray.delete();
        oldGray.delete();
        flow.delete();
    }
};