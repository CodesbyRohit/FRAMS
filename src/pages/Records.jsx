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
  const filteredRecords = (records || []).filter(r => {
    const matchesDate = filterDate ? (r?.date === filterDate) : true;
    const matchesRole = filterRole !== 'All' ? (r?.role || 'unknown').toLowerCase() === filterRole.toLowerCase() : true;
    const matchesSearch = searchQuery ? (r?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) : true;
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
          <h1 className="text-glow-arc" style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
             Archive Retrieval
          </h1>
          <p style={{ color: 'var(--accent-blue)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '2px', fontFamily: 'var(--hud-font)' }}>
             SYSTEM.LOGS // DATA_QUERY_ACTIVE
          </p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', fontFamily: 'var(--hud-font)' }}>
          {/* Search Box */}
          <div className="glow-low" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-card)', padding: '0.5rem 1rem', borderRadius: '0.25rem', border: '1px solid var(--border-color)' }}>
            <Search size={14} color="var(--accent-blue)" />
            <input 
              type="text" 
              placeholder="SEARCH IDENT..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', outline: 'none', width: '130px', fontSize: '0.75rem', textTransform: 'uppercase' }}
            />
          </div>

          {/* Role Filter */}
          <div className="glow-low" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-card)', padding: '0.5rem 1rem', borderRadius: '0.25rem', border: '1px solid var(--border-color)' }}>
            <Filter size={14} color="var(--accent-blue)" />
            <select 
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', outline: 'none', fontSize: '0.75rem', textTransform: 'uppercase' }}
            >
              <option value="All">ALL PERSONNEL</option>
              <option value="Student">STUDENTS</option>
              <option value="Faculty">FACULTY</option>
              <option value="Admin">ADMIN</option>
            </select>
          </div>

          {/* Date Filter */}
          <div className="glow-low" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-card)', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid var(--border-color)' }}>
            <Filter size={14} color="var(--accent-blue)" />
            <input 
              type="date" 
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', outline: 'none', colorScheme: 'dark', fontSize: '0.75rem' }}
            />
            {filterDate && (
              <button onClick={() => setFilterDate('')} style={{ background: 'none', border: 'none', color: 'var(--stark-red)', cursor: 'pointer', fontSize: '0.7rem', padding: '0 0.5rem', fontWeight: 800 }}>
                X
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
              {filteredRecords?.map((record, idx) => {
                const userObj = usersInfo?.find(u => u?._id === record?.userId);
                return (
                  <tr key={`${record?.userId || idx}-${idx}`}>
                    <td style={{ textAlign: 'center' }}>
                      {userObj?.faceImage ? (
                        <img src={userObj.faceImage} alt={record?.name} style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border-color)' }} />
                      ) : (
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'var(--bg-primary)', display: 'inline-block', border: '1px solid var(--border-color)' }}></div>
                      )}
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--text-main)', letterSpacing: '0.5px' }}>
                      {record?.name?.toUpperCase() || 'PERSONNEL'}
                    </td>
                    <td style={{ fontFamily: 'var(--hud-font)', fontSize: '0.75rem' }}>
                      <span className={`badge badge-${record?.role?.toLowerCase() || 'guest'}`} style={{ borderRadius: '2px', border: '1px solid currentColor' }}>
                        {record?.role?.toUpperCase() || 'GUEST'}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--hud-font)', color: 'var(--text-muted)', fontSize: '0.75rem' }}>{record?.date || '----'}</td>
                    <td style={{ fontFamily: 'var(--hud-font)', color: 'var(--text-muted)', fontSize: '0.75rem' }}>{record?.time || '--:--'}</td>
                    <td style={{ color: (record?.confidenceScore || 0) > 80 ? 'var(--stark-green)' : 'var(--stark-gold)', fontWeight: 800, fontFamily: 'var(--hud-font)' }}>
                      {record?.confidenceScore || 0}%
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
