const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  role: { type: String, enum: ['admin', 'faculty', 'student'], required: true },
  password: { type: String, required: true },
  department: { type: String, required: false },
  researchPapers: { type: Number, required: false, default: 0 },
  // Biometric fields are never returned unless a query explicitly selects them
  // (`.select('+faceDescriptor')`). Only the verification service needs the descriptor.
  faceDescriptor: { type: [Number], required: false, select: false },
  faceImage: { type: String, required: false, select: false }, // base64 JPEG data URL
  faceEnrolledAt: { type: Date },
  behaviorProfile: {
    blinkRate: { type: Number, default: 0 },
    movementPattern: { type: Number, default: 0 },
    stabilityScore: { type: Number, default: 0 },
    avgScanTime: { type: Number, default: 0 },
    adaptiveThreshold: { type: Number, default: 0.75 }
  },
  riskProfile: {
    avgBehaviorScore: { type: Number, default: 0.8 },
    avgScanTime: { type: Number, default: 2000 },
    anomalyCount: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now }
});

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

userSchema.pre('save', async function() {
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
