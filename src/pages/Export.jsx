import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { Download, FileDown, GraduationCap, Users, UserCheck, Loader2 } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

const Export = () => {
  const [attendance, setAttendance] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [attendanceRes, usersRes] = await Promise.all([
          api.get('/attendance'),
          api.get('/users')
        ]);
        setAttendance(attendanceRes.data);
        setUsers(usersRes.data);
      } catch (error) {
        console.error('Failed to fetch data for export:', error);
        toast.error('Failed to sync data from database');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleExportStudents = () => {
    const studentsOnly = attendance.filter(r => r.role.toLowerCase() === 'student');
    
    if (studentsOnly.length === 0) {
      toast.error('No student attendance records found');
      return;
    }

    const exportData = studentsOnly.map(r => ({
      Name: r.name,
      Role: r.role,
      Date: r.date,
      Time: r.time,
      Confidence: `${r.confidenceScore}%`
    }));

    exportCsv(exportData, 'student_attendance');
  };

  const handleExportFacultyAdmin = () => {
    const facultyAdmins = attendance.filter(r => r.role.toLowerCase() === 'faculty' || r.role.toLowerCase() === 'admin');
    
    if (facultyAdmins.length === 0) {
      toast.error('No faculty/admin records found');
      return;
    }

    const exportData = facultyAdmins.map(r => {
      const u = users.find(user => user._id === r.userId || user.name === r.name);
      return {
        Name: r.name,
        Role: r.role,
        'Research Papers': u ? (u.researchPapers || '0') : '0',
        Department: u ? (u.department || 'N/A') : 'N/A',
        Date: r.date,
        Time: r.time
      };
    });

    exportCsv(exportData, 'faculty_admin_attendance');
  };

  const handleExportStudentList = () => {
    const allStudents = users.filter(u => u.role.toLowerCase() === 'student');
    
    if (allStudents.length === 0) {
      toast.error('No registered students found in database');
      return;
    }

    const exportData = allStudents.map(u => ({
      Name: u.name,
      Email: u.email,
      Department: u.department || 'N/A',
      Username: u.username || 'N/A',
      'Date Joined': u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'
    }));

    exportCsv(exportData, 'registered_students');
  };

  const exportCsv = (data, filename) => {
    try {
      const csv = Papa.unparse(data);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Successfully exported data');
    } catch (err) {
      toast.error('Failed to export CSV');
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '60vh', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="animate-spin" size={48} color="#3b82f6" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '2rem' }}>
        <h1 className="text-glow-arc" style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
           Data Extraction
        </h1>
        <p style={{ color: 'var(--accent-blue)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '2px', fontFamily: 'var(--hud-font)' }}>
           SYSTEM.IO // EXPORT_PROTOCOLS_READY
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        <div className="glow-low" style={{ background: 'var(--bg-card)', padding: '2rem', borderRadius: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', border: '1px solid var(--border-color)' }}>
          <div style={{ width: '64px', height: '64px', backgroundColor: 'rgba(34, 211, 238, 0.1)', color: 'var(--accent-blue)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem', boxShadow: '0 0 15px rgba(34, 211, 238, 0.3)' }}>
            <GraduationCap size={32} />
          </div>
          <h3 className="text-glow-arc" style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-main)', textTransform: 'uppercase', fontFamily: 'var(--hud-font)' }}>Student Data</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '2rem', fontFamily: 'var(--hud-font)' }}>
            RECON_LOGS: PERSONNEL_ATTENDANCE
          </p>
          <button onClick={handleExportStudents} className="btn-primary" style={{ width: '100%', maxWidth: '200px' }}>
             EXTRACT CSV
          </button>
        </div>

        <div className="glow-low" style={{ background: 'var(--bg-card)', padding: '2rem', borderRadius: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', border: '1px solid var(--border-color)' }}>
          <div style={{ width: '64px', height: '64px', backgroundColor: 'rgba(34, 211, 238, 0.1)', color: 'var(--accent-blue)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem', boxShadow: '0 0 15px rgba(34, 211, 238, 0.3)' }}>
            <UserCheck size={32} />
          </div>
          <h3 className="text-glow-arc" style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-main)', textTransform: 'uppercase', fontFamily: 'var(--hud-font)' }}>Registry List</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '2rem', fontFamily: 'var(--hud-font)' }}>
            RECON_LOGS: IDENT_DATABASE
          </p>
          <button onClick={handleExportStudentList} className="btn-primary" style={{ width: '100%', maxWidth: '200px' }}>
             EXTRACT CSV
          </button>
        </div>

        <div className="glow-low" style={{ background: 'var(--bg-card)', padding: '2rem', borderRadius: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', border: '1px solid var(--stark-green)' }}>
          <div style={{ width: '64px', height: '64px', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--stark-green)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem', boxShadow: '0 0 15px rgba(16, 185, 129, 0.3)' }}>
            <Users size={32} />
          </div>
          <h3 className="text-glow-arc" style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--stark-green)', textTransform: 'uppercase', fontFamily: 'var(--hud-font)' }}>Admin Staff</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '2rem', fontFamily: 'var(--hud-font)' }}>
            RECON_LOGS: CLEARANCE_PERS
          </p>
          <button onClick={handleExportFacultyAdmin} className="btn-primary" style={{ width: '100%', maxWidth: '200px', backgroundColor: 'var(--stark-green)', borderColor: 'var(--stark-green)' }}>
             EXTRACT CSV
          </button>
        </div>
      </div>
    </div>
  );
};

export default Export;

