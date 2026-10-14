'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';

interface FaceCaptureProps {
  /** Receives `frameCount` JPEG data URLs (one for enrollment, a burst for sign-in). */
  onCapture: (frames: string[]) => void;
  captureLabel?: string;
  frameCount?: number;
  /** Delay between burst frames; 12 × 150 ms ≈ 1.8 s, long enough for one blink. */
  frameIntervalMs?: number;
}

/**
 * Browser camera capture used for face enrollment and face sign-in. Frames
 * are sent to the API, which forwards them to the Trust Service; ANIMA never
 * stores raw photos. Sign-in needs a short burst so a blink can be detected.
 */
export function FaceCapture({
  onCapture,
  captureLabel = 'Capture',
  frameCount = 1,
  frameIntervalMs = 150,
}: FaceCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

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

  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const frames: string[] = [];
    setCapturing(true);
    try {
      for (let i = 0; i < frameCount; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, frameIntervalMs));
        canvas.getContext('2d')?.drawImage(video, 0, 0);
        // Lower quality for bursts keeps each frame well under the API's per-frame cap.
        frames.push(canvas.toDataURL('image/jpeg', frameCount > 1 ? 0.7 : 0.9));
      }
    } finally {
      setCapturing(false);
    }
    onCapture(frames);
  }, [onCapture, frameCount, frameIntervalMs]);

  useEffect(() => () => stop(), [stop]);

  return (
    <div className="space-y-3">
      {/* Always mounted so start() can attach the stream before `active` flips. */}
      <video
        ref={videoRef}
        muted
        playsInline
        className={`aspect-[4/3] w-full rounded-xl border border-white/10 bg-ink-900 object-cover ${active ? '' : 'hidden'}`}
      />
      {active ? (
        <>
          {frameCount > 1 && (
            <p className="text-center text-[11px] text-slate-500">Look at the camera and blink once during capture.</p>
          )}
          <div className="flex gap-3">
            <Button onClick={capture} className="flex-1" loading={capturing}>
              {capturing ? 'Capturing…' : captureLabel}
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
