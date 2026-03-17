import React from 'react';
import Papa from 'papaparse';
import { Download, FileDown, GraduationCap, Users } from 'lucide-react';
import { storage } from '../utils/storage';
import toast from 'react-hot-toast';

const Export = () => {
  const handleExportStudents = () => {
    const records = storage.getAttendance();
    const studentsOnly = records.filter(r => r.role.toLowerCase() === 'student');
    
    if (studentsOnly.length === 0) {
      toast.error('No student records found to export');
      return;
    }

    // Student format explicitly requested: Name | Role | Date | Time
    const exportData = studentsOnly.map(r => ({
      Name: r.name,
      Role: r.role,
      Date: r.date,
      Time: r.time
    }));

    exportCsv(exportData, 'student_attendance');
  };

  const handleExportFacultyAdmin = () => {
    const records = storage.getAttendance();
    const facultyAdmins = records.filter(r => r.role.toLowerCase() === 'faculty' || r.role.toLowerCase() === 'admin');
    
    if (facultyAdmins.length === 0) {
      toast.error('No faculty/admin records found to export');
      return;
    }

    const users = storage.getUsers();
    
    // Faculty/Admin format explicitly requested: Name | Role | Research Papers | Department | Date | Time
    const exportData = facultyAdmins.map(r => {
      const u = users.find(user => user.id === r.userId || user.name === r.name);
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

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>Data Export</h1>
        <p style={{ color: 'var(--text-muted)' }}>Export accurate CSV templates for academic records.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        <div className="glass-panel" style={{ padding: '2rem', borderRadius: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ width: '64px', height: '64px', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-blue)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
            <GraduationCap size={32} />
          </div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>Student Attendance</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '2rem' }}>
            Includes: Name, Role, Date, Time
          </p>
          <button onClick={handleExportStudents} className="btn-primary" style={{ width: '100%', maxWidth: '200px' }}>
            <FileDown size={18} /> Download CSV
          </button>
        </div>

        <div className="glass-panel" style={{ padding: '2rem', borderRadius: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ width: '64px', height: '64px', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
            <Users size={32} />
          </div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>Faculty & Admins</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '2rem' }}>
            Includes: Name, Role, Research Papers, Dept, Date, Time
          </p>
          <button onClick={handleExportFacultyAdmin} className="btn-primary" style={{ width: '100%', maxWidth: '200px', backgroundColor: '#10b981' }}>
            <FileDown size={18} /> Download CSV
          </button>
        </div>
      </div>
    </div>
  );
};

export default Export;
