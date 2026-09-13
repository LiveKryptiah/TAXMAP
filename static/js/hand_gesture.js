/**
 * Provincial Government of Isabela — Real Property Tax Mapping System (TM-RPAIS)
 * Hand Gesture Control Engine (Touchless GIS Navigation)
 * Powered by Google MediaPipe Hands (100% Client-Side In-Browser Inference)
 *
 * Gestures:
 *  - ✊ Grab / Fist: Drag physical map (Hand moves left -> Map moves left)
 *  - 🤏 Pinch (Thumb + Index): Pinch in to Zoom Out, Spread apart to Zoom In
 *  - ✋ Open Hand: Neutral idle (reposition hand without moving map)
 */

(() => {
  'use strict';

  // Configurable Sensitivity Parameters
  const GESTURE_CONFIG = {
    PAN_SENSITIVITY: 1100,       // Pixels panned per unit of normalized hand translation
    ZOOM_SENSITIVITY: 4.0,       // Zoom change factor per unit of finger distance change
    GESTURE_THRESHOLD: 0.005,    // Dead zone to reject micro-jitter / hand tremors
    SMOOTHING_FACTOR: 0.35,      // Exponential Moving Average filter weight (0 = freeze, 1 = raw)
    PINCH_DEADZONE: 0.007,       // Minimum finger distance change to trigger zoom
    CURL_THRESHOLD: 1.05         // Ratio of tip-to-wrist vs PIP-to-wrist distance for curl
  };

  window.HandGestureConfig = GESTURE_CONFIG;

  // Skeletal Joint Bone Connections
  const SKELETON_BONES = [
    [0, 1], [1, 2], [2, 3], [3, 4],        // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8],        // Index
    [5, 9], [9, 10], [10, 11], [11, 12],   // Middle
    [9, 13], [13, 14], [14, 15], [15, 16], // Ring
    [13, 17], [17, 18], [18, 19], [19, 20],// Pinky
    [0, 17]                                // Palm base
  ];

  // Runtime State
  let isRunning = false;
  let isModelReady = false;
  let isModelLoading = false;
  let currentFacingMode = 'user'; // 'user' (front) or 'environment' (rear)
  let mediaStream = null;
  let handsDetector = null;
  let rafId = null;
  let isProcessingFrame = false;

  // Kinematic Filter States
  let smoothedCenter = null;
  let prevGrabPos = null;
  let prevPinchDist = null;
  let activeGesture = 'NONE'; // 'NONE', 'OPEN', 'GRAB', 'PINCH'

  // DOM Cache
  let btnHandControl = null;
  let handHud = null;
  let handHudBody = null;
  let handVideo = null;
  let handCanvas = null;
  let canvasCtx = null;
  let statusDot = null;
  let statusText = null;
  let gestureBadge = null;
  let gestureIcon = null;
  let gestureName = null;
  let btnSwitchCamera = null;
  let btnMinimizeHud = null;
  let btnCloseHud = null;

  /**
   * Initialize DOM hooks & attach event listeners
   */
  function initDOM() {
    btnHandControl = document.getElementById('btn-hand-control');
    handHud = document.getElementById('hand-gesture-hud');
    handHudBody = document.getElementById('hand-hud-body');
    handVideo = document.getElementById('hand-video');
    handCanvas = document.getElementById('hand-canvas');
    if (handCanvas) canvasCtx = handCanvas.getContext('2d');

    statusDot = document.getElementById('hand-status-dot');
    statusText = document.getElementById('hand-status-text');
    gestureBadge = document.getElementById('hand-gesture-badge');
    gestureIcon = document.getElementById('hand-gesture-icon');
    gestureName = document.getElementById('hand-gesture-name');

    btnSwitchCamera = document.getElementById('btn-switch-camera');
    btnMinimizeHud = document.getElementById('btn-minimize-hand-hud');
    btnCloseHud = document.getElementById('btn-close-hand-hud');

    if (btnHandControl) {
      btnHandControl.addEventListener('click', () => {
        if (isRunning) {
          stopHandControl();
        } else {
          startHandControl();
        }
      });
    }

    if (btnCloseHud) {
      btnCloseHud.addEventListener('click', stopHandControl);
    }

    if (btnMinimizeHud) {
      btnMinimizeHud.addEventListener('click', toggleMinimize);
    }

    if (btnSwitchCamera) {
      btnSwitchCamera.addEventListener('click', switchCamera);
    }
  }

  /**
   * Euclidean distance between two 2D points
   */
  function dist(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
  }

  /**
   * Check if a finger is curled into the palm
   */
  function isFingerCurled(tipIdx, pipIdx, landmarks, wrist) {
    const dTip = dist(landmarks[tipIdx], wrist);
    const dPip = dist(landmarks[pipIdx], wrist);
    return dTip < dPip * GESTURE_CONFIG.CURL_THRESHOLD;
  }

  /**
   * Classify hand gesture based on 21 landmarks
   */
  function classifyGesture(landmarks) {
    const wrist = landmarks[0];

    // Check curl status of 4 fingers (Index, Middle, Ring, Pinky)
    const indexCurled = isFingerCurled(8, 6, landmarks, wrist);
    const middleCurled = isFingerCurled(12, 10, landmarks, wrist);
    const ringCurled = isFingerCurled(16, 14, landmarks, wrist);
    const pinkyCurled = isFingerCurled(20, 18, landmarks, wrist);

    const curledCount = [indexCurled, middleCurled, ringCurled, pinkyCurled].filter(Boolean).length;

    // Distance between thumb tip (4) and index tip (8)
    const pinchDist = dist(landmarks[4], landmarks[8]);

    // Intentional Grab (Fist) -> At least 3 fingers tightly curled
    if (curledCount >= 3) {
      return {
        type: 'GRAB',
        icon: '✊',
        label: 'Grabbing / Panning',
        pinchDist: null
      };
    }

    // Pinch Zoom -> Thumb and index tips close together, other fingers not curled into fist
    if (curledCount < 3 && pinchDist < 0.16) {
      return {
        type: 'PINCH',
        icon: '🤏',
        label: 'Pinch Zooming',
        pinchDist: pinchDist
      };
    }

    // Open Hand -> All or most fingers extended
    return {
      type: 'OPEN',
      icon: '✋',
      label: 'Open Hand (Idle)',
      pinchDist: pinchDist
    };
  }

  /**
   * Render skeletal landmarks and bone connections on preview canvas
   */
  function drawLandmarks(landmarks, gestureType) {
    if (!handCanvas || !canvasCtx) return;

    canvasCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);

    // Color theme based on gesture
    let strokeColor = 'rgba(255, 255, 255, 0.65)';
    let jointColor = '#ffffff';

    if (gestureType === 'GRAB') {
      strokeColor = '#10b981'; // Vibrant Emerald Green
      jointColor = '#34d399';
    } else if (gestureType === 'PINCH') {
      strokeColor = '#06b6d4'; // Luminous Cyan
      jointColor = '#67e8f9';
    }

    // Draw bones
    canvasCtx.lineWidth = 2.5;
    canvasCtx.strokeStyle = strokeColor;
    canvasCtx.shadowColor = strokeColor;
    canvasCtx.shadowBlur = 6;

    for (let i = 0; i < SKELETON_BONES.length; i++) {
      const [fromIdx, toIdx] = SKELETON_BONES[i];
      const p1 = landmarks[fromIdx];
      const p2 = landmarks[toIdx];

      canvasCtx.beginPath();
      canvasCtx.moveTo(p1.x * handCanvas.width, p1.y * handCanvas.height);
      canvasCtx.lineTo(p2.x * handCanvas.width, p2.y * handCanvas.height);
      canvasCtx.stroke();
    }

    // Draw joints
    canvasCtx.shadowBlur = 4;
    for (let i = 0; i < landmarks.length; i++) {
      const pt = landmarks[i];
      const x = pt.x * handCanvas.width;
      const y = pt.y * handCanvas.height;

      canvasCtx.beginPath();
      const radius = (i === 4 || i === 8 || i === 0) ? 4.5 : 3.0;
      canvasCtx.arc(x, y, radius, 0, 2 * Math.PI);
      canvasCtx.fillStyle = jointColor;
      canvasCtx.fill();
    }
  }

  /**
   * MediaPipe Results Callback
   */
  function onResults(results) {
    if (!isRunning) return;

    const map = window.taxMap;
    const hasHand = results.multiHandLandmarks && results.multiHandLandmarks.length > 0;

    if (!hasHand) {
      // Hand lost or not detected
      activeGesture = 'NONE';
      prevGrabPos = null;
      prevPinchDist = null;
      smoothedCenter = null;

      if (statusText) statusText.textContent = 'Searching for Hand...';
      if (statusDot) statusDot.className = 'hand-hud-status-dot';
      if (gestureIcon) gestureIcon.textContent = '🔍';
      if (gestureName) gestureName.textContent = 'No Hand Detected';
      if (canvasCtx && handCanvas) canvasCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);
      return;
    }

    // Focus on primary hand (first detected)
    const landmarks = results.multiHandLandmarks[0];
    const classification = classifyGesture(landmarks);
    activeGesture = classification.type;

    // Update UI Badge
    if (gestureIcon) gestureIcon.textContent = classification.icon;
    if (gestureName) gestureName.textContent = classification.label;
    if (statusText) statusText.textContent = `Hand Control: ${classification.type}`;
    if (statusDot) statusDot.className = 'hand-hud-status-dot indicator-pulse';

    // Draw on overlay canvas
    drawLandmarks(landmarks, classification.type);

    if (!map) return;

    // 1. Handle Grab / Pan Gesture
    if (classification.type === 'GRAB') {
      prevPinchDist = null;

      // Track middle MCP (landmark 9) as palm center
      const rawCenter = { x: landmarks[9].x, y: landmarks[9].y };

      if (!smoothedCenter) {
        smoothedCenter = { ...rawCenter };
      } else {
        const alpha = GESTURE_CONFIG.SMOOTHING_FACTOR;
        smoothedCenter.x = smoothedCenter.x * (1 - alpha) + rawCenter.x * alpha;
        smoothedCenter.y = smoothedCenter.y * (1 - alpha) + rawCenter.y * alpha;
      }

      if (!prevGrabPos) {
        prevGrabPos = { ...smoothedCenter };
      } else {
        const dx = smoothedCenter.x - prevGrabPos.x;
        const dy = smoothedCenter.y - prevGrabPos.y;
        const distMoved = Math.hypot(dx, dy);

        if (distMoved > GESTURE_CONFIG.GESTURE_THRESHOLD) {
          // In user (front-facing) camera: user moves hand left -> sensor sees right (+dx).
          // To make map follow hand naturally: hand left -> map left (panBy negative x).
          const signX = (currentFacingMode === 'user') ? -1 : 1;
          const signY = 1;

          const panX = signX * dx * GESTURE_CONFIG.PAN_SENSITIVITY;
          const panY = signY * dy * GESTURE_CONFIG.PAN_SENSITIVITY;

          map.panBy([panX, panY], { animate: false });
          prevGrabPos = { ...smoothedCenter };
        }
      }
    }

    // 2. Handle Pinch / Zoom Gesture
    else if (classification.type === 'PINCH') {
      prevGrabPos = null;
      smoothedCenter = null;

      const currentDist = classification.pinchDist;

      if (prevPinchDist !== null && currentDist !== null) {
        const deltaD = currentDist - prevPinchDist;

        if (Math.abs(deltaD) > GESTURE_CONFIG.PINCH_DEADZONE) {
          let deltaZoom = deltaD * GESTURE_CONFIG.ZOOM_SENSITIVITY;
          // Clamp per-frame zoom speed for smooth transitions
          deltaZoom = Math.max(-0.12, Math.min(0.12, deltaZoom));

          const curZoom = map.getZoom();
          const targetZoom = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), curZoom + deltaZoom));

          map.setZoom(targetZoom, { animate: false });
          prevPinchDist = currentDist;
        }
      } else {
        prevPinchDist = currentDist;
      }
    }

    // 3. Open Hand / Idle Gesture
    else {
      // Neutral hand in view: map stays still, clear drag anchors
      prevGrabPos = null;
      prevPinchDist = null;
      smoothedCenter = null;
    }
  }

  /**
   * Continuous animation loop sending frames to MediaPipe
   */
  async function processVideoFrame() {
    if (!isRunning) return;

    if (handVideo && handVideo.readyState >= 2 && handsDetector && !isProcessingFrame) {
      isProcessingFrame = true;
      try {
        await handsDetector.send({ image: handVideo });
      } catch (err) {
        console.warn('MediaPipe send frame error:', err);
      } finally {
        isProcessingFrame = false;
      }
    }

    rafId = requestAnimationFrame(processVideoFrame);
  }

  /**
   * Load MediaPipe Hands model from CDN
   */
  async function loadHandsModel() {
    if (isModelReady) return true;
    if (isModelLoading) return false;

    isModelLoading = true;
    if (statusText) statusText.textContent = 'Loading MediaPipe AI Model...';

    return new Promise((resolve) => {
      try {
        if (typeof window.Hands === 'undefined') {
          console.error('MediaPipe Hands script not loaded in window');
          isModelLoading = false;
          resolve(false);
          return;
        }

        handsDetector = new window.Hands({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        handsDetector.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.65,
          minTrackingConfidence: 0.65
        });

        handsDetector.onResults(onResults);
        isModelReady = true;
        isModelLoading = false;
        resolve(true);
      } catch (err) {
        console.error('Failed to initialize MediaPipe Hands:', err);
        isModelLoading = false;
        resolve(false);
      }
    });
  }

  /**
   * Start Hand Gesture Control & Camera Stream
   */
  async function startHandControl() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Camera access is not supported by your browser or connection (HTTPS required).');
      return;
    }

    if (btnHandControl) {
      btnHandControl.classList.add('active');
      btnHandControl.title = 'Hand Gesture Control: ACTIVE (Click to turn off)';
    }

    if (handHud) {
      handHud.style.display = 'flex';
    }

    if (statusText) statusText.textContent = 'Requesting Camera Access...';

    try {
      // 1. Acquire camera stream
      const constraints = {
        video: {
          facingMode: currentFacingMode,
          width: { ideal: 320, max: 640 },
          height: { ideal: 240, max: 480 },
          frameRate: { ideal: 30, max: 30 }
        },
        audio: false
      };

      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      handVideo.srcObject = mediaStream;

      // Update mirror effect depending on camera
      if (currentFacingMode === 'user') {
        handVideo.style.transform = 'scaleX(-1)';
        handCanvas.style.transform = 'scaleX(-1)';
      } else {
        handVideo.style.transform = 'none';
        handCanvas.style.transform = 'none';
      }

      await new Promise((resolve) => {
        handVideo.onloadedmetadata = () => {
          handVideo.play();
          handCanvas.width = handVideo.videoWidth || 320;
          handCanvas.height = handVideo.videoHeight || 240;
          resolve();
        };
      });

      // 2. Load MediaPipe model if needed
      const ready = await loadHandsModel();
      if (!ready) {
        alert('Could not initialize MediaPipe Hand Landmarker. Check network connection.');
        stopHandControl();
        return;
      }

      isRunning = true;
      if (statusText) statusText.textContent = 'Hand Control: Active';
      if (statusDot) statusDot.className = 'hand-hud-status-dot indicator-pulse';

      // 3. Start detection loop
      rafId = requestAnimationFrame(processVideoFrame);
    } catch (err) {
      console.error('Camera stream error:', err);
      let errMsg = 'Could not access camera.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errMsg = 'Camera permission was denied. Please allow camera permissions in your browser address bar to use Hand Control.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errMsg = 'No camera device found on this system.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errMsg = 'Camera is already in use by another application.';
      }
      alert(errMsg);
      stopHandControl();
    }
  }

  /**
   * Stop Hand Gesture Control & Release Camera
   */
  function stopHandControl() {
    isRunning = false;

    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }

    if (handVideo) {
      handVideo.srcObject = null;
    }

    if (canvasCtx && handCanvas) {
      canvasCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);
    }

    if (btnHandControl) {
      btnHandControl.classList.remove('active');
      btnHandControl.title = 'Hand Gesture Control (Camera-based Pan & Pinch Zoom)';
    }

    if (handHud) {
      handHud.style.display = 'none';
    }

    prevGrabPos = null;
    prevPinchDist = null;
    smoothedCenter = null;
    activeGesture = 'NONE';
  }

  /**
   * Switch between front (user) and rear (environment) camera
   */
  async function switchCamera() {
    if (!isRunning) return;

    currentFacingMode = (currentFacingMode === 'user') ? 'environment' : 'user';

    // Restart stream with new constraint
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }

    if (statusText) statusText.textContent = `Switching to ${currentFacingMode === 'user' ? 'Front' : 'Rear'} Camera...`;

    try {
      const constraints = {
        video: {
          facingMode: currentFacingMode,
          width: { ideal: 320, max: 640 },
          height: { ideal: 240, max: 480 }
        },
        audio: false
      };

      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      handVideo.srcObject = mediaStream;

      if (currentFacingMode === 'user') {
        handVideo.style.transform = 'scaleX(-1)';
        handCanvas.style.transform = 'scaleX(-1)';
      } else {
        handVideo.style.transform = 'none';
        handCanvas.style.transform = 'none';
      }

      await new Promise((resolve) => {
        handVideo.onloadedmetadata = () => {
          handVideo.play();
          handCanvas.width = handVideo.videoWidth || 320;
          handCanvas.height = handVideo.videoHeight || 240;
          resolve();
        };
      });

      if (statusText) statusText.textContent = 'Hand Control: Active';
    } catch (err) {
      console.warn('Switch camera error:', err);
      // Fallback to front
      currentFacingMode = 'user';
    }
  }

  /**
   * Minimize / expand preview box
   */
  function toggleMinimize() {
    if (!handHudBody) return;
    const isCollapsed = handHudBody.style.display === 'none';
    handHudBody.style.display = isCollapsed ? 'block' : 'none';

    const icon = document.getElementById('icon-minimize-hand');
    if (icon) {
      icon.innerHTML = isCollapsed
        ? '<line x1="5" y1="12" x2="19" y2="12"></line>'
        : '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>';
    }
  }

  // Auto-init when document is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDOM);
  } else {
    initDOM();
  }
})();
