const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const resultEl = document.getElementById('result');
const resultsList = document.getElementById('resultsList');
const clearBtn = document.getElementById('clearBtn');
const removeBtn = document.getElementById('removeBtn');
const downloadBtn = document.getElementById('downloadBtn');

let currentStream = null;
let barcodeDetectorSupported = ('BarcodeDetector' in window);
let barcodeDetector = null;
let zxingReader = null;
let scanning = false;
let currentDeviceId = null;
let results = []; // array of {id, raw, uid, name, amount, time}
const seenValues = new Set();
let lastScanTime = 0; // ms

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

    const span = document.createElement('div');
    span.className = 'value';
    const idEl = document.createElement('div'); idEl.className = 'id'; idEl.textContent = item.uid || item.raw || '';
    const nameEl = document.createElement('div'); nameEl.className = 'name'; nameEl.textContent = item.name || '';
    const amtEl = document.createElement('div'); amtEl.className = 'amount'; amtEl.textContent = item.amount != null ? (item.amount.toLocaleString()) : '';
    span.appendChild(idEl);
    span.appendChild(nameEl);
    span.appendChild(amtEl);

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

function addResult(entry) {
  // entry can be string or object {raw, uid, name, amount}
  const id = Date.now() + '-' + Math.floor(Math.random()*1000);
  const now = Date.now();
  let obj;
  if (typeof entry === 'string') obj = { id, raw: entry, uid: entry, name: '', amount: null, time: now };
  else obj = { id, raw: entry.raw || '', uid: entry.uid || entry.id || '', name: entry.name || '', amount: entry.amount != null ? entry.amount : null, time: now };
  results.unshift(obj);
  renderResults();
  if (resultEl) resultEl.textContent = obj.uid + ' / ' + obj.name + ' / ' + (obj.amount != null ? obj.amount : '');
}

function showToast(message, type = 'success', ms = 3000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const t = document.createElement('div');
  t.className = 'toast ' + (type || '');
  t.textContent = message;
  container.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(8px)'; }, ms - 400);
  setTimeout(() => { try { container.removeChild(t); } catch(e){} }, ms);
}

function processBarcode(raw) {
  if (!raw) return;
  const now = Date.now();
  if (seenValues.has(raw)) { showToast('Duplicate barcode ignored', 'warn'); return; }
  if (now - lastScanTime < 3000) { showToast('Please wait 3 seconds between scans', 'warn'); return; }
  // parse up to three values: id, name, amount (allow separators , | ; : )
  const parts = raw.split(/[,|;:]/).map(p => p.trim());
  const uid = parts[0] || '';
  const name = parts[1] || '';
  let amt = null;
  if (parts.length >= 3 && parts[2] && parts[2].trim() !== '') {
    const parsed = parseFloat(parts[2].replace(/[^0-9.-]/g, ''));
    if (!isNaN(parsed)) {
      if (parsed > 20000) { amt = 20000; showToast('Amount capped to 20000', 'warn'); }
      else amt = parsed;
    } else {
      // keep amount blank when not numeric
      amt = null;
      showToast('Amount not numeric; stored blank', 'warn');
    }
  }

  seenValues.add(raw);
  lastScanTime = now;
  addResult({ raw, uid, name, amount: amt });
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
        for (const b of barcodes) processBarcode(b.rawValue || JSON.stringify(b));
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
            processBarcode(result.text);
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
    seenValues.clear();
    lastScanTime = 0;
    if (resultEl) resultEl.textContent = 'Cleared all results.';
    showToast('All results cleared', 'success');
  });
}

// Remove Selected button
if (removeBtn) {
  removeBtn.addEventListener('click', () => {
    const checked = Array.from(resultsList.querySelectorAll('input.sel:checked')).map(i => i.dataset.id);
    if (!checked.length) return;
    // remove selected results and also clear seenValues for removed raws (allow re-scan)
    for (const id of checked) {
      const found = results.find(r => r.id === id);
      if (found && found.raw) seenValues.delete(found.raw);
    }
    results = results.filter(r => !checked.includes(r.id));
    renderResults();
    if (resultEl) resultEl.textContent = 'Removed selected items.';
  });
}

// Download PDF button
if (downloadBtn) {
  downloadBtn.addEventListener('click', () => {
    if (!results || !results.length) { showToast('No results to download', 'warn'); return; }
    // build a printable clone
    const wrap = document.createElement('div');
    const h = document.createElement('h2'); h.textContent = 'Scanned Codes'; wrap.appendChild(h);
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th style="text-align:left;padding:6px;border-bottom:1px solid #ddd">ID</th><th style="text-align:left;padding:6px;border-bottom:1px solid #ddd">Name</th><th style="text-align:right;padding:6px;border-bottom:1px solid #ddd">Amount</th><th style="text-align:right;padding:6px;border-bottom:1px solid #ddd">Time</th></tr>';
    table.appendChild(thead);
    const tb = document.createElement('tbody');
    for (const r of results) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td style="padding:6px;border-bottom:1px solid #f1f1f1">${r.uid}</td><td style="padding:6px;border-bottom:1px solid #f1f1f1">${r.name}</td><td style="padding:6px;border-bottom:1px solid #f1f1f1;text-align:right">${r.amount != null ? r.amount.toLocaleString() : ''}</td><td style="padding:6px;border-bottom:1px solid #f1f1f1;text-align:right">${new Date(r.time).toLocaleTimeString()}</td>`;
      tb.appendChild(tr);
    }
    table.appendChild(tb);
    wrap.appendChild(table);
    const opt = { margin:0.4, filename: 'scanned_codes.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 } };
    html2pdf().set(opt).from(wrap).save();
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
            for (const b of barcodes) processBarcode(b.rawValue || JSON.stringify(b));
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
            if (resObj) { processBarcode(resObj.text || resObj); return; }
          } catch (e) {
            // Some builds use callback style; attempt sync decode
            try {
              const sync = reader.decodeFromImage(img);
              if (sync) { processBarcode(sync.text || sync); return; }
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
