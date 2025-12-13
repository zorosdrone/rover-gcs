import React, { useEffect, useRef, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

const realSizes = {
    'person': 0.5,
    'bicycle': 0.6,
    'car': 1.8,
    'motorcycle': 0.8,
    'airplane': 30.0,
    'bus': 2.5,
    'train': 3.0,
    'truck': 2.5,
    'boat': 3.0,
    'traffic light': 0.3,
    'fire hydrant': 0.3,
    'stop sign': 0.75,
    'parking meter': 0.2,
    'bench': 1.5,
    'bird': 0.1,
    'cat': 0.15,
    'dog': 0.2,
    'horse': 0.5,
    'sheep': 0.3,
    'cow': 0.5,
    'elephant': 1.5,
    'bear': 0.8,
    'zebra': 0.6,
    'giraffe': 0.6,
    'backpack': 0.35,
    'umbrella': 1.0,
    'handbag': 0.3,
    'tie': 0.1,
    'suitcase': 0.5,
    'frisbee': 0.25,
    'skis': 0.1,
    'snowboard': 0.3,
    'sports ball': 0.22,
    'kite': 0.8,
    'baseball bat': 0.07,
    'baseball glove': 0.2,
    'skateboard': 0.2,
    'surfboard': 0.5,
    'tennis racket': 0.3,
    'bottle': 0.07,
    'wine glass': 0.08,
    'cup': 0.08,
    'fork': 0.03,
    'knife': 0.03,
    'spoon': 0.04,
    'bowl': 0.15,
    'banana': 0.04,
    'apple': 0.08,
    'sandwich': 0.12,
    'orange': 0.08,
    'broccoli': 0.1,
    'carrot': 0.03,
    'hot dog': 0.05,
    'pizza': 0.3,
    'donut': 0.1,
    'cake': 0.2,
    'chair': 0.5,
    'couch': 2.0,
    'potted plant': 0.3,
    'bed': 1.5,
    'dining table': 1.5,
    'toilet': 0.4,
    'tv': 1.0,
    'laptop': 0.35,
    'mouse': 0.06,
    'remote': 0.05,
    'keyboard': 0.45,
    'cell phone': 0.07,
    'microwave': 0.5,
    'oven': 0.6,
    'toaster': 0.25,
    'sink': 0.5,
    'refrigerator': 0.8,
    'book': 0.15,
    'clock': 0.3,
    'vase': 0.15,
    'scissors': 0.1,
    'teddy bear': 0.3,
    'hair drier': 0.1,
    'toothbrush': 0.02
};

const VdoPlayerWithYolo = ({ viewId = "43wygAK" }) => {
    const iframeRef = useRef(null);
    const canvasRef = useRef(null);
    const offscreenCanvasRef = useRef(document.createElement('canvas')); // Workaround for cross-frame video
    const [model, setModel] = useState(null);
    const [isYoloEnabled, setIsYoloEnabled] = useState(false);
    const [status, setStatus] = useState("Initializing...");
    const [debugInfo, setDebugInfo] = useState("");
    
    // Load Model
    useEffect(() => {
        const loadModel = async () => {
            try {
                setStatus("Loading Model...");
                await tf.ready();
                const loadedModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
                setModel(loadedModel);
                setStatus("Model Loaded");
            } catch (err) {
                console.error("Failed to load model", err);
                setStatus("Model Error");
            }
        };
        loadModel();
    }, []);

    // Debug Loop
    useEffect(() => {
        const interval = setInterval(() => {
            if (iframeRef.current) {
                const iframe = iframeRef.current;
                try {
                    const innerDoc = iframe.contentDocument || iframe.contentWindow.document;
                    const video = innerDoc.querySelector('video');
                    console.log("VDO Debug:", {
                        iframeLoaded: !!innerDoc,
                        videoFound: !!video,
                        readyState: video ? video.readyState : 'N/A',
                        paused: video ? video.paused : 'N/A',
                        srcObject: video ? (video.srcObject ? 'Stream Present' : 'None') : 'N/A',
                        videoWidth: video ? video.videoWidth : 'N/A'
                    });
                } catch (e) {
                    console.log("VDO Debug Error:", e.message);
                }
            }
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    // Detection Loop
    useEffect(() => {
        if (!isYoloEnabled || !model || !iframeRef.current) return;

        let animationId;
        const iframe = iframeRef.current;
        
        const detect = async () => {
            try {
                // Access video inside iframe
                // Note: This requires the iframe to be same-origin
                const innerDoc = iframe.contentDocument || iframe.contentWindow.document;
                const video = innerDoc.querySelector('video');

                if (video) {
                    setDebugInfo(`Video Found: ${video.videoWidth}x${video.videoHeight} (Ready: ${video.readyState})`);
                } else {
                    setDebugInfo("Searching for video element...");
                }

                if (video && video.readyState >= 2) { // HAVE_CURRENT_DATA or better
                    // Workaround: Draw video to offscreen canvas to fix cross-frame issue
                    const offscreen = offscreenCanvasRef.current;
                    offscreen.width = video.videoWidth;
                    offscreen.height = video.videoHeight;
                    const offCtx = offscreen.getContext('2d');
                    offCtx.drawImage(video, 0, 0);

                    // Detect from offscreen canvas
                    const predictions = await model.detect(offscreen);
                    
                    if (predictions.length > 0) {
                        setDebugInfo(`Objects: ${predictions.length}`);
                    }

                    const canvas = canvasRef.current;
                    const ctx = canvas.getContext('2d');
                    
                    // Match canvas to iframe size (only update if changed to avoid flickering)
                    if (canvas.width !== iframe.clientWidth || canvas.height !== iframe.clientHeight) {
                        canvas.width = iframe.clientWidth;
                        canvas.height = iframe.clientHeight;
                    }
                    
                    // Clear canvas right before drawing
                    ctx.clearRect(0, 0, canvas.width, canvas.height);

                    // Draw
                    predictions.forEach(prediction => {
                        // Calculate scale
                        const scaleX = canvas.width / video.videoWidth;
                        const scaleY = canvas.height / video.videoHeight;
                        
                        const [x, y, w, h] = prediction.bbox;
                        
                        const drawX = x * scaleX;
                        const drawY = y * scaleY;
                        const drawW = w * scaleX;
                        const drawH = h * scaleY;

                        // Draw Box
                        ctx.strokeStyle = '#00FFFF';
                        ctx.lineWidth = 2;
                        ctx.strokeRect(drawX, drawY, drawW, drawH);
                        
                        // Label Background
                        const label = `${prediction.class} ${Math.round(prediction.score*100)}%`;
                        ctx.font = '16px Arial';
                        const textWidth = ctx.measureText(label).width;
                        
                        ctx.fillStyle = 'rgba(0, 255, 255, 0.2)';
                        ctx.fillRect(drawX, drawY > 20 ? drawY - 20 : 0, textWidth + 10, 20);

                        // Label Text
                        ctx.fillStyle = '#00FFFF';
                        ctx.fillText(label, drawX + 5, drawY > 20 ? drawY - 5 : 15);
                        
                        // Distance (Simple estimation)
                        const realSize = realSizes[prediction.class] || 0.5;
                        // Focal length approximation needs calibration, using 600 as placeholder
                        const estimatedDist = (600 * realSize) / w; // using raw width from video
                        
                        ctx.fillStyle = 'red';
                        ctx.font = 'bold 18px Arial';
                        ctx.fillText(`${estimatedDist.toFixed(1)}m`, drawX, drawY + drawH + 20);
                    });
                }
            } catch (e) {
                // console.error("Detection error", e);
                // Suppress errors during initialization or when video is not ready
                setDebugInfo(`Error: ${e.message}`);
            }
            
            // Throttle to ~10 FPS (100ms) to reduce load and flickering
            animationId = setTimeout(() => {
                requestAnimationFrame(detect);
            }, 100);
        };

        detect();

        return () => {
            if (animationId) clearTimeout(animationId);
        };
    }, [isYoloEnabled, model]);

    const reloadIframe = () => {
        console.log("Reloading iframe...");
        if (iframeRef.current) {
            // Force reload by resetting src
            const currentSrc = iframeRef.current.src;
            iframeRef.current.src = '';
            setTimeout(() => {
                iframeRef.current.src = currentSrc;
            }, 100);
        }
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', backgroundColor: '#000' }}>
            <iframe 
                ref={iframeRef}
                id="rover-frame"
                src={`/vdo/index.html?view=${viewId}&autoplay=1&playsinline=1`}
                title="Rover Camera"
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                allow="autoplay; camera; microphone; fullscreen; picture-in-picture; display-capture"
            />
            <canvas 
                ref={canvasRef}
                style={{ 
                    position: 'absolute', 
                    top: 0, 
                    left: 0, 
                    width: '100%', 
                    height: '100%', 
                    pointerEvents: 'none',
                    display: isYoloEnabled ? 'block' : 'none'
                }}
            />
            <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 100, display: 'flex', gap: '5px' }}>
                <button 
                    onClick={reloadIframe}
                    style={{
                        backgroundColor: '#17a2b8',
                        color: 'white',
                        border: 'none',
                        padding: '5px 10px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                    }}
                >
                    Reload Cam
                </button>
                <button 
                    onClick={() => setIsYoloEnabled(!isYoloEnabled)}
                    style={{
                        backgroundColor: isYoloEnabled ? '#28a745' : '#6c757d',
                        color: 'white',
                        border: 'none',
                        padding: '5px 10px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                    }}
                >
                    {isYoloEnabled ? "YOLO ON" : "YOLO OFF"}
                </button>
                {isYoloEnabled && (
                    <div style={{ 
                        color: 'white', 
                        fontSize: '0.8em', 
                        marginTop: '5px', 
                        textAlign: 'right', 
                        textShadow: '1px 1px 2px black',
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        padding: '2px 5px',
                        borderRadius: '3px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-end'
                    }}>
                        <div>{status}</div>
                        <div style={{ color: '#aaa', fontSize: '0.9em' }}>{debugInfo}</div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default VdoPlayerWithYolo;
