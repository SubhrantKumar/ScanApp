const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const resultEl = document.getElementById('result');
const resultsList = document.getElementById('resultsList');
const clearBtn = document.getElementById('clearBtn');
const removeBtn = document.getElementById('removeBtn');

let currentStream = null;
let barcodeDetectorSupported = ('BarcodeDetector' in window);
let barcodeDetector = null;
let zxingReader = null;
let scanning = false;
let currentDeviceId = null;
let results = []; // array of {id, value, time}

function renderResults() {
  if (!resultsList) return;
  resultsList.innerHTML = '';
  for (const item of results) {
    const li = document.createElement('li');
    li.dataset.id = item.id;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'sel';
    cb.dataset.id = item.id;
    cb.addEventListener('change', updateRemoveButtonVisibility);
    const span = document.createElement('span');
    span.className = 'value';
    span.textContent = item.value;
    const time = document.createElement('div');
    time.className = 'time';
    time.textContent = new Date(item.time).toLocaleTimeString();
    li.appendChild(cb);
    li.appendChild(span);
    li.appendChild(time);
    resultsList.appendChild(li);
  }
  updateRemoveButtonVisibility();
}

function updateRemoveButtonVisibility() {
  if (!removeBtn || !resultsList) return;
  const anyChecked = Array.from(resultsList.querySelectorAll('input.sel')).some(i => i.checked);
  removeBtn.style.display = anyChecked ? 'inline-block' : 'none';
}

function addResult(value) {
  const id = Date.now() + '-' + Math.floor(Math.random()*1000);
  results.unshift({ id, value, time: Date.now() });
  renderResults();
  if (resultEl) resultEl.textContent = value;
}

async function startCamera(deviceId) {
  stopCamera();
  const constraints = { video: {} };
  if (deviceId) constraints.video.deviceId = { exact: deviceId };
  else constraints.video.facingMode = { ideal: 'environment' };

  try {
    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = currentStream;
    await video.play();
    scanning = true;
    detectLoop();
  } catch (err) {
    resultEl.textContent = 'Camera error: ' + err.message;
  }
}

function stopCamera() {
  scanning = false;
  if (currentStream) {
    currentStream.getTracks().forEach(t => t.stop());
    currentStream = null;
  }
  if (zxingReader) {
    try { zxingReader.reset(); } catch (e) {}
  }
}

async function detectLoop() {
  if (!scanning) return;

  if (barcodeDetectorSupported) {
    try {
      if (!barcodeDetector) barcodeDetector = new BarcodeDetector();
      const barcodes = await barcodeDetector.detect(video);
      if (barcodes && barcodes.length) {
        for (const b of barcodes) addResult(b.rawValue || JSON.stringify(b));
      }
    } catch (err) {
      barcodeDetectorSupported = false;
    }
    requestAnimationFrame(detectLoop);
  } else {
    if (!zxingReader && window.ZXing && ZXing.BrowserMultiFormatReader) {
      zxingReader = new ZXing.BrowserMultiFormatReader();
      try {
        zxingReader.decodeFromVideoDevice(currentDeviceId || null, 'video', (result, error) => {
          if (result) {
            addResult(result.text);
          }
        });
        return;
      } catch (e) {
        console.warn('ZXing init error', e);
      }
    }
    requestAnimationFrame(detectLoop);
  }
}

function showResult(text) {
  resultEl.textContent = text;
}

window.addEventListener('load', async () => {
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    startCamera();
  } else {
    resultEl.textContent = 'Camera not supported in this browser.';
  }
});

window.addEventListener('pagehide', stopCamera);

// Clear All button
if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    results = [];
    renderResults();
    if (resultEl) resultEl.textContent = 'Cleared all results.';
  });
}

// Remove Selected button
if (removeBtn) {
  removeBtn.addEventListener('click', () => {
    const checked = Array.from(resultsList.querySelectorAll('input.sel:checked')).map(i => i.dataset.id);
    if (!checked.length) return;
    results = results.filter(r => !checked.includes(r.id));
    renderResults();
    if (resultEl) resultEl.textContent = 'Removed selected items.';
  });
}

// Capture button handler: grab one frame and process it
const captureBtn = document.getElementById('captureBtn');
if (captureBtn) {
  captureBtn.addEventListener('click', async () => {
    resultEl.textContent = 'Processing…';
    try {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Try BarcodeDetector on the captured image
      if (barcodeDetectorSupported) {
        try {
          if (!barcodeDetector) barcodeDetector = new BarcodeDetector();
          const barcodes = await barcodeDetector.detect(canvas);
          if (barcodes && barcodes.length) {
            for (const b of barcodes) addResult(b.rawValue || JSON.stringify(b));
            return;
          }
        } catch (e) {
          barcodeDetectorSupported = false;
        }
      }

      // Fallback using ZXing: try decoding from a temporary image
      if (window.ZXing && ZXing.BrowserMultiFormatReader) {
        try {
          const reader = new ZXing.BrowserMultiFormatReader();
          const dataUrl = canvas.toDataURL('image/png');
          const img = new Image();
          img.src = dataUrl;
          await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
          // decodeFromImage may return a promise or throw; handle both
          try {
            const resObj = await reader.decodeFromImage(img);
            if (resObj) { addResult(resObj.text || resObj); return; }
          } catch (e) {
            // Some builds use callback style; attempt sync decode
            try {
              const sync = reader.decodeFromImage(img);
              if (sync) { addResult(sync.text || sync); return; }
            } catch (err) {}
          }
        } catch (e) {
          console.warn('ZXing image decode failed', e);
        }
      }

      showResult('No barcode detected.');
    } catch (err) {
      resultEl.textContent = 'Error processing frame: ' + err.message;
    }
  });
}
