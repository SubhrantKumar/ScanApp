# Mobile Barcode Scanner (static website)

This is a minimal static website that uses your phone camera to scan barcodes and display the decoded data.

Features
- Uses the browser `BarcodeDetector` API when available.
- Falls back to `@zxing/library` (included via CDN) on unsupported browsers.

Quick start (serve locally)

1. Open a terminal in this folder.
2. Run a simple static server (Python example):

```bash
python -m http.server 8000
```

3. Open the site from your phone's browser at `http://<your-pc-ip>:8000/` (or `http://localhost:8000` on the same device).

Notes
- Camera access requires HTTPS on most devices; `localhost` is treated as secure for testing.
-- The page will automatically request camera access and start scanning when opened.
