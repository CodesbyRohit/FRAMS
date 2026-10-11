import * as faceapi from 'face-api.js';

// Models are served locally from /public/models; no video or face data leaves
// the browser except the 128-number descriptor sent to the FRAMS server.
class FaceService {
  constructor() {
    this.MODEL_URL = '/models';
    this.loading = null;
  }

  loadModels() {
    if (!this.loading) {
      this.loading = Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(this.MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(this.MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(this.MODEL_URL),
      ]).catch((err) => {
        this.loading = null; // allow a retry
        throw err;
      });
    }
    return this.loading;
  }

  async detectSingleFace(input, minConfidence = 0.5) {
    await this.loadModels();
    return faceapi
      .detectSingleFace(input, new faceapi.SsdMobilenetv1Options({ minConfidence }))
      .withFaceLandmarks()
      .withFaceDescriptor();
  }

  async detectAllFaces(input, minConfidence = 0.5) {
    await this.loadModels();
    return faceapi
      .detectAllFaces(input, new faceapi.SsdMobilenetv1Options({ minConfidence }))
      .withFaceLandmarks()
      .withFaceDescriptors();
  }
}

export const faceService = new FaceService();
