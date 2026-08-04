import { useEffect, useRef, useState } from 'react';
import { BarcodeFormat, BrowserMultiFormatReader } from '@zxing/browser';

export function useBarcodeScanner(onDetected: (barcode: string) => void) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let stopScanner: (() => void) | undefined;
    const start = async () => {
      if (!window.isSecureContext) { setStatus('Camera scanning requires HTTPS.'); return; }
      try {
        const localAudio = document.querySelector<HTMLAudioElement>('.local-audio-player audio');
        const wasPlaying = Boolean(localAudio && !localAudio.paused && !localAudio.ended);
        const video = videoRef.current;
        if (!video) return;
        const reader = new BrowserMultiFormatReader();
        reader.possibleFormats = [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128];
        setStatus('Point the camera at the barcode.');
        const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, video, (result) => {
          const barcode = result?.getText().trim();
          if (cancelled || !barcode) return;
          controls.stop(); setOpen(false); onDetectedRef.current(barcode);
        });
        stopScanner = () => controls.stop();
        if (wasPlaying && localAudio?.paused) {
          try { await localAudio.play(); } catch { setStatus('Camera is ready. If iPhone paused playback, tap Play in the player to resume.'); }
        }
      } catch { setStatus('Unable to open the camera. Check the browser camera permission.'); }
    };
    void start();
    return () => { cancelled = true; stopScanner?.(); };
  }, [open]);
  return { open, setOpen, status, setStatus, videoRef };
}
