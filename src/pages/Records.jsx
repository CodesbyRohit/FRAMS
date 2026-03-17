import React, { useState, useEffect } from 'react';
import { Filter, Search, Loader2 } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

const Records = () => {
  const [records, setRecords] = useState([]);
  const [usersInfo, setUsersInfo] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [filterDate, setFilterDate] = useState('');
  const [filterRole, setFilterRole] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = async () => {
    try {
      const [attendanceRes, usersRes] = await Promise.all([
        api.get('/attendance'),
        api.get('/users')
      ]);
      setRecords(attendanceRes.data);
      setUsersInfo(usersRes.data);
    } catch (error) {
      console.error('Failed to load records:', error);
      toast.error('Failed to sync history logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Compute final filtered array
  const filteredRecords = records.filter(r => {
    const matchesDate = filterDate ? (r.date === filterDate) : true;
    const matchesRole = filterRole !== 'All' ? r.role.toLowerCase() === filterRole.toLowerCase() : true;
    const matchesSearch = searchQuery ? r.name.toLowerCase().includes(searchQuery.toLowerCase()) : true;
    return matchesDate && matchesRole && matchesSearch;
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '60vh', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="animate-spin" size={48} color="#3b82f6" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>Attendance Records</h1>
          <p style={{ color: 'var(--text-muted)' }}>Search and filter live attendance logs from database.</p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {/* Search Box */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-card)', padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
            <Search size={16} color="var(--text-muted)" />
            <input 
              type="text" 
              placeholder="Search name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', outline: 'none', width: '130px' }}
            />
          </div>

          {/* Role Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-card)', padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
            <Filter size={16} color="var(--text-muted)" />
            <select 
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', outline: 'none' }}
            >
              <option value="All">All Roles</option>
              <option value="Student">Student</option>
              <option value="Faculty">Faculty</option>
              <option value="Admin">Admin</option>
            </select>
          </div>

          {/* Date Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-card)', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
            <Filter size={16} color="var(--text-muted)" />
            <input 
              type="date" 
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', outline: 'none', colorScheme: 'dark' }}
            />
            {filterDate && (
              <button onClick={() => setFilterDate('')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem', padding: '0 0.5rem' }}>
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="glass-panel" style={{ borderRadius: '1rem', overflow: 'hidden' }}>
        {filteredRecords.length > 0 ? (
          <table className="glass-table">
            <thead>
              <tr>
                <th style={{ width: '80px', textAlign: 'center' }}>Profile</th>
                <th>Name</th>
                <th>Role</th>
                <th>Date</th>
                <th>Time</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((record, idx) => {
                const userObj = usersInfo.find(u => u._id === record.userId);
                return (
                  <tr key={idx}>
                    <td style={{ textAlign: 'center' }}>
                      {userObj && userObj.faceImage ? (
                        <img src={userObj.faceImage} alt={record.name} style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border-color)' }} />
                      ) : (
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'var(--bg-primary)', display: 'inline-block', border: '1px solid var(--border-color)' }}></div>
                      )}
                    </td>
                    <td style={{ fontWeight: 500 }}>{record.name}</td>
                    <td>
                      <span className={`badge badge-${record.role?.toLowerCase() || 'unknown'}`}>
                        {record.role || 'Unknown'}
                      </span>
                    </td>
                    <td>{record.date}</td>
                    <td>{record.time}</td>
                    <td style={{ color: record.confidenceScore > 80 ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
                      {record.confidenceScore}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            No attendance records matched your filters.
          </div>
        )}
      </div>
    </div>
  );
};

export default Records;
