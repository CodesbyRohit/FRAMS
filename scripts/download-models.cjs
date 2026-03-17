const https = require('https');
const fs = require('fs');
const path = require('path');

const modelsDir = path.join(__dirname, '../public/models');
if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
}

// Sharded weights from the original face-api.js repo
const baseUrl = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/';

const filesToDownload = [
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model-shard1',
  'ssd_mobilenetv1_model-shard2', // Missing previously
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
  'face_recognition_model-shard2'
];

console.log('Finalizing face-api.js model shards...');

let completed = 0;

filesToDownload.forEach(file => {
  const filePath = path.join(modelsDir, file);
  
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 100) {
    console.log(`[OK] ${file} exists.`);
    completed++;
    if(completed === filesToDownload.length) console.log('All models verified.');
    return;
  }
  
  const fileStream = fs.createWriteStream(filePath);
  https.get(baseUrl + file, (response) => {
    if (response.statusCode !== 200) {
      console.error(`[FAIL] ${file}: ${response.statusCode}`);
      completed++;
      fs.unlink(filePath, () => {});
      return;
    }
    
    response.pipe(fileStream);
    fileStream.on('finish', () => {
      fileStream.close();
      console.log(`[DONE] ${file}`);
      completed++;
      if (completed === filesToDownload.length) {
        console.log('Verification/Download complete.');
      }
    });
  }).on('error', (err) => {
    fs.unlink(filePath, () => {}); 
    console.error(`Error: ${file}: ${err.message}`);
  });
});
