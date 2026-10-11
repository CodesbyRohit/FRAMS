const Attendance = require('../models/Attendance');
const User = require('../models/User');

const markAttendance = async (req, res) => {
  const { userId, name, role, date, time, confidenceScore, status, riskLevel, riskScore, riskReason, scanTime } = req.body;

  console.log(`[BACKEND] Marking attendance for ${userId || name}. Confidence: ${confidenceScore}%`);
  
  // 1. Confidence Threshold (Lowered to 50% for better reliability)
  const THRESHOLD = 50;
  if (confidenceScore < THRESHOLD) {
    console.warn(`[BACKEND] Rejected: Confidence too low (${confidenceScore}%). Required: ${THRESHOLD}%`);
    return res.status(400).json({ 
      success: false, 
      message: `Confidence too low (${confidenceScore}%). Minimum ${THRESHOLD}% required.` 
    });
  }

  // 2. Prevent Multiple Scans (Daily Check)
  const today = date || new Date().toISOString().split('T')[0];
  const existingRecord = await Attendance.findOne({ userId, date: today });

  if (existingRecord) {
    return res.status(200).json({ 
      success: true, 
      alreadyMarked: true,
      message: 'Attendance already marked for today.',
      timestamp: existingRecord.time
    });
  }

  // 3. Create Attendance Record
  try {
    const attendance = await Attendance.create({
      userId,
      name,
      role: role || 'student',
      date: today,
      time: time || new Date().toLocaleTimeString(),
      confidenceScore,
      status: status || 'present',
      riskLevel: riskLevel || 'LOW',
      riskScore: riskScore || 0,
      riskReason: riskReason || 'Normal behavior'
    });

    // 4. Update User Risk Profile
    if (userId) {
      const user = await User.findById(userId);
      if (user) {
         if (!user.riskProfile) {
           user.riskProfile = { avgBehaviorScore: 0.8, avgScanTime: 2000, anomalyCount: 0 };
         }
         if (scanTime) {
           user.riskProfile.avgScanTime = (user.riskProfile.avgScanTime * 0.9) + (scanTime * 0.1);
         }
         if (riskLevel === 'HIGH') {
           user.riskProfile.anomalyCount += 1;
         }
         await user.save();
      }
    }

    console.log(`[BACKEND] Attendance SUCCESS for ${name} [RISK: ${riskLevel || 'LOW'}]`);
    res.status(201).json(attendance);
  } catch (error) {
    console.error(`[BACKEND] Attendance ERROR for ${name}:`, error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false, 
        message: 'Validation Error', 
        details: error.message 
      });
    }
    res.status(500).json({ success: false, message: 'Server error marking attendance' });
  }
};

const getAttendance = async (req, res) => {
  const attendance = await Attendance.find({}).sort({ createdAt: -1 });
  res.json(attendance);
};

const getStudentAttendance = async (req, res) => {
  try {
    const attendance = await Attendance.find({ userId: req.params.id }).sort({ createdAt: -1 });
    res.json(attendance);
  } catch (error) {
    // Return empty array for demo-only or invalid IDs to prevent 500 crashes
    res.json([]);
  }
};

const clearAllAttendance = async (req, res) => {
  try {
    await Attendance.deleteMany({});
    res.json({ message: 'All attendance records cleared.' });
  } catch (error) {
    res.status(500).json({ message: 'Error clearing attendance' });
  }
};

module.exports = { markAttendance, getAttendance, getStudentAttendance, clearAllAttendance };
