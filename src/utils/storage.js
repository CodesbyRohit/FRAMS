/**
 * LocalStorage wrapper for F.R.A.M.S data.
 * Simulates a backend database.
 */

const USERS_KEY = 'frams_users';
const ATTENDANCE_KEY = 'attendance_records';

export const storage = {
  // --- USERS ---
  getUsers: () => {
    const data = localStorage.getItem(USERS_KEY);
    return data ? JSON.parse(data) : [];
  },
  
  saveUser: (user) => {
    const users = storage.getUsers();
    // user should have: id, name, role, descriptor (array), snapshot, researchPapers, department
    users.push(user);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  },

  // --- ATTENDANCE ---
  getAttendance: () => {
    const data = localStorage.getItem(ATTENDANCE_KEY);
    return data ? JSON.parse(data) : [];
  },

  markAttendance: (record) => {
    const records = storage.getAttendance();
    
    // Prevent duplicate within the same day for the same user name
    const existing = records.find(
      r => r.name === record.name && r.date === record.date
    );
    
    if (existing) {
      return { success: false, message: 'Attendance already marked for today' };
    }

    records.push(record);
    localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(records));
    
    // Dispatch event for real-time dashboard updates
    window.dispatchEvent(new Event('attendance_updated'));
    
    return { success: true, message: `Attendance marked for ${record.name}` };
  },

  // --- STATS ---
  getStats: () => {
    const users = storage.getUsers();
    const attendance = storage.getAttendance();
    
    const todayIso = new Date().toISOString().split('T')[0];
    const todayUs = new Date().toLocaleDateString('en-US');
    
    const todayAttendance = attendance.filter(a => a.date === todayIso || a.date === todayUs);
    
    // Role distribution among all registered users
    const totalStudents = users.filter(u => u.role.toLowerCase() === 'student').length;
    const totalFaculty = users.filter(u => u.role.toLowerCase() === 'faculty').length;
    const totalAdmins = users.filter(u => u.role.toLowerCase() === 'admin').length;
    
    // Students/Faculty present today
    const studentsPresentToday = todayAttendance.filter(a => a.role.toLowerCase() === 'student').length;
    const facultyPresentToday = todayAttendance.filter(a => a.role.toLowerCase() === 'faculty' || a.role.toLowerCase() === 'admin').length;

    // Build trend chart data (last 7 days)
    const trendData = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i)); // Chronological order: oldest to newest
      const dateIso = d.toISOString().split('T')[0];
      const dateUs = d.toLocaleDateString('en-US');
      
      const count = attendance.filter(r => r.date === dateIso || r.date === dateUs).length;
      return {
        name: d.toLocaleDateString('en-US', { weekday: 'short' }),
        Attendance: count
      };
    });

    return {
      totalUsers: users.length,
      roleDistribution: [
        { name: 'Student', value: totalStudents },
        { name: 'Faculty', value: totalFaculty },
        { name: 'Admin', value: totalAdmins }
      ].filter(r => r.value > 0),
      attendanceToday: todayAttendance.length,
      studentsPresentToday,
      facultyPresentToday,
      trendData,
      recentScans: attendance.slice(-6).reverse() // Get the last 6 scans
    };
  },

  // --- MAINTENANCE ---
  clearUsers: () => {
    localStorage.removeItem(USERS_KEY);
    window.dispatchEvent(new Event('users_updated'));
  },

  clearAttendance: () => {
    localStorage.removeItem(ATTENDANCE_KEY);
    window.dispatchEvent(new Event('attendance_updated'));
  }
};
