// Camera access with human-readable failure reasons.
export const CAMERA_ERRORS = {
  unsupported: { title: 'Camera not available in this browser', text: 'Use a current version of Chrome, Edge, Firefox or Safari over HTTPS or localhost.' },
  denied: { title: 'Camera permission was denied', text: 'Allow camera access for this site in the browser’s address bar, then try again.' },
  missing: { title: 'No camera found', text: 'Connect a camera, or check that it is enabled in system settings.' },
  busy: { title: 'Camera is in use', text: 'Close other apps or tabs that are using the camera, then try again.' },
  unknown: { title: 'Camera could not start', text: 'Try again. If it keeps failing, reload the page.' },
};

export const classifyCameraError = (err) => {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'missing';
    case 'NotReadableError':
    case 'AbortError':
      return 'busy';
    default:
      return err?.message === 'unsupported' ? 'unsupported' : 'unknown';
  }
};

export const openCamera = async () => {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
  return navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
    audio: false,
  });
};

export const stopStream = (stream) => stream?.getTracks().forEach((t) => t.stop());

// Mean luma of a small downscaled frame (0–255). Cheap enough to run ~1×/s.
export const measureBrightness = (video, canvas) => {
  const w = 32;
  const h = 24;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  return sum / (w * h);
};
