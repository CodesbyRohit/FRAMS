import * as faceapi from 'face-api.js';

class FaceService {
  constructor() {
    this.modelsLoaded = false;
    // Use local models folder served by Vite
    this.MODEL_URL = '/models';
  }

  async loadModels() {
    if (this.modelsLoaded) return;
    try {
      console.log('[FACE_SERVICE] Loading AI Models from:', this.MODEL_URL);
      await faceapi.nets.ssdMobilenetv1.loadFromUri(this.MODEL_URL);
      await faceapi.nets.faceLandmark68Net.loadFromUri(this.MODEL_URL);
      await faceapi.nets.faceRecognitionNet.loadFromUri(this.MODEL_URL);
      this.modelsLoaded = true;
      console.log('[FACE_SERVICE] Models Ready.');
    } catch (err) {
      console.error('[FACE_SERVICE] Model loading failed', err);
      throw err;
    }
  }

  async detectSingleFace(videoEl) {
    if (!this.modelsLoaded) await this.loadModels();
    return await faceapi
      .detectSingleFace(videoEl, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
      .withFaceLandmarks()
      .withFaceDescriptor();
  }

  async detectAllFaces(videoEl) {
    if (!this.modelsLoaded) await this.loadModels();
    return await faceapi
      .detectAllFaces(videoEl, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.2 }))
      .withFaceLandmarks()
      .withFaceDescriptors();
  }

  createMatcher(labeledDescriptors) {
    // labeledDescriptors is an array of faceapi.LabeledFaceDescriptors
    if (labeledDescriptors.length === 0) return null;
    return new faceapi.FaceMatcher(labeledDescriptors, 0.6);
  }
}

export const faceService = new FaceService();
