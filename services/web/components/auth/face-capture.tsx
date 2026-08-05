'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';

interface FaceCaptureProps {
  onCapture: (dataUrl: string) => void;
  captureLabel?: string;
}

/**
 * Browser camera capture used for face enrollment and face login. The image
 * is sent straight to the Trust Service — ANIMA itself never stores raw
 * photos, only embeddings produced by the trust layer.
 */
export function FaceCapture({ onCapture, captureLabel = 'Capture' }: FaceCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setActive(true);
    } catch {
      setError('Camera unavailable. You can still use a passkey.');
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    onCapture(canvas.toDataURL('image/jpeg', 0.9));
  }, [onCapture]);

  useEffect(() => () => stop(), [stop]);

  return (
    <div className="space-y-3">
      {active ? (
        <>
          <video
            ref={videoRef}
            muted
            playsInline
            className="aspect-[4/3] w-full rounded-xl border border-white/10 bg-ink-900 object-cover"
          />
          <div className="flex gap-3">
            <Button onClick={capture} className="flex-1">
              {captureLabel}
            </Button>
            <Button variant="ghost" onClick={stop}>
              Stop camera
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.02] text-sm text-slate-500">
            {error ?? 'Camera is off'}
          </div>
          <Button variant="ghost" onClick={start} className="w-full">
            Start camera
          </Button>
        </>
      )}
    </div>
  );
}
