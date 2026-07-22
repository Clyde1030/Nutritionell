'use client';
import { useEffect, useRef, useState } from 'react';
import s from './ScanTab.module.css';

interface Props {
  onCapture: (file: File) => void;
  onClose: () => void;
  onFallbackUpload: () => void;
}

/**
 * Live camera capture using getUserMedia. Works on desktop webcams and mobile
 * cameras (prefers the rear camera). Falls back to file upload if the camera
 * is unavailable or permission is denied.
 */
export default function CameraCapture({ onCapture, onClose, onFallbackUpload }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser does not support camera access.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
      } catch (e: any) {
        const name = e?.name || '';
        if (name === 'NotAllowedError') setError('Camera permission was denied. You can allow it in your browser settings, or upload a photo instead.');
        else if (name === 'NotFoundError') setError('No camera was found on this device. Upload a photo instead.');
        else setError('Could not start the camera. Upload a photo instead.');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const stop = () => streamRef.current?.getTracks().forEach(t => t.stop());

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (!blob) return;
      stop();
      onCapture(new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  };

  return (
    <div className={s.cameraOverlay} onClick={() => { stop(); onClose(); }}>
      <div className={s.cameraModal} onClick={e => e.stopPropagation()}>
        <button className={s.cameraClose} onClick={() => { stop(); onClose(); }} aria-label="Close">✕</button>
        {error ? (
          <div className={s.cameraError}>
            <p className={s.cameraErrorText}>{error}</p>
            <button className={s.cameraCaptureBtn} onClick={() => { stop(); onClose(); onFallbackUpload(); }}>
              Upload a photo instead
            </button>
          </div>
        ) : (
          <>
            <video ref={videoRef} className={s.cameraVideo} playsInline muted />
            <button className={s.cameraCaptureBtn} onClick={capture} disabled={!ready}>
              {ready ? '📷  Capture' : 'Starting camera…'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
