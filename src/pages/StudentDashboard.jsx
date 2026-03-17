import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  Calendar, 
  Clock, 
  TrendingUp, 
  Activity,
  History,
  Award,
  Loader2
} from 'lucide-react';
import { 
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import toast from 'react-hot-toast';

const StudentDashboard = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [stats, setStats] = useState([]);

  const fetchStudentData = async () => {
    try {
      const { data: attendance } = await api.get(`/attendance/student/${user._id}`);
      
      // Process attendance history
      const history = attendance.map(a => ({
        date: a.date,
        status: 'Present',
        time: a.time
      }));
      setAttendanceHistory(history);

      // Process stats
      const totalClasses = 30; // Mock total classes for calc
      const attended = attendance.length;
      const rate = Math.round((attended / totalClasses) * 100);
      const lastScan = attendance[0]?.time || '--:--';

      setStats([
        { label: 'Attendance Rate', value: `${rate}%`, icon: TrendingUp, color: '#3b82f6' },
        { label: 'Classes Attended', value: `${attended}/${totalClasses}`, icon: CheckCircle2, color: '#10b981' },
        { label: 'Last Scan', value: lastScan, icon: Clock, color: '#f59e0b' },
        { label: 'Profile Status', value: 'Active', icon: Award, color: '#8b5cf6' },
      ]);

      // Process chart data (Last 7 days)
      const last7Days = [...Array(7)].map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d.toISOString().split('T')[0];
      }).reverse();

      const chart = last7Days.map(date => ({
        name: new Date(date).toLocaleDateString(undefined, { weekday: 'short' }),
        score: attendance.some(a => a.date === date) ? 100 : 0
      }));
      setChartData(chart);

    } catch (error) {
      console.error('Failed to fetch student dashboard data:', error);
      toast.error('Could not sync your attendance history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && user._id) {
      fetchStudentData();
    }
  }, [user]);

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '60vh', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="animate-spin" size={48} color="#3b82f6" />
      </div>
    );
  }

  return (
    <div className="student-dashboard" style={{ padding: '1.5rem', animate: 'fade-in 0.5s ease-out' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, marginBottom: '0.25rem' }}>
          Welcome back, {user?.username}
        </h1>
        <p style={{ color: 'var(--text-muted)' }}>Here's your personal attendance summary from cloud</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {stats.map((stat, idx) => (
          <div key={idx} className="glass-panel" style={{ padding: '1.5rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div style={{ padding: '0.5rem', borderRadius: '0.75rem', backgroundColor: `${stat.color}15`, color: stat.color }}>
                <stat.icon size={24} />
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{stat.label}</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stat.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
        <div className="glass-panel" style={{ padding: '2rem', borderRadius: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
            <Activity size={20} color="var(--accent-blue)" />
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Attendance Performance</h3>
          </div>
          <div style={{ height: '300px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} />
                <YAxis stroke="var(--text-muted)" fontSize={12} domain={[0, 100]} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem' }}
                  itemStyle={{ color: '#f8fafc' }}
                />
                <Area type="monotone" dataKey="score" stroke="#3b82f6" fillOpacity={1} fill="url(#colorScore)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '2rem', borderRadius: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <History size={20} color="var(--accent-blue)" />
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Recent Attendance Logs</h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '1rem 0', color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: 500 }}>Date</th>
                  <th style={{ padding: '1rem 0', color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: 500 }}>Time</th>
                  <th style={{ padding: '1rem 0', color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: 500 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {attendanceHistory.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: idx !== attendanceHistory.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                    <td style={{ padding: '1rem 0', fontWeight: 500 }}>{item.date}</td>
                    <td style={{ padding: '1rem 0', color: 'var(--text-muted)' }}>{item.time}</td>
                    <td style={{ padding: '1rem 0' }}>
                      <span style={{ 
                        padding: '0.25rem 0.75rem', 
                        borderRadius: '999px', 
                        fontSize: '0.75rem', 
                        fontWeight: 600,
                        backgroundColor: item.status === 'Present' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        color: item.status === 'Present' ? '#10b981' : '#ef4444'
                      }}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {attendanceHistory.length === 0 && (
                  <tr>
                    <td colSpan="3" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No records found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
