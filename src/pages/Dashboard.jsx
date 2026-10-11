import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  Users, UserCheck, GraduationCap, Activity, 
  ArrowUpRight, ArrowRight, Camera, FileText, UserPlus, Minus,
  Shield, ShieldCheck, ShieldAlert, Trash2, RefreshCcw, Loader2, UserX
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import api from '../services/api';
import NumberTicker from '../components/NumberTicker';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b']; // Blue, Emerald, Amber

const DashboardCard = ({ title, value, icon: Icon, color, trend }) => {
  return (
    <div className="glow-low animate-fade-in" style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: '0.5rem', borderLeft: `4px solid ${color}`, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, right: 0, opacity: 0.05, pointerEvents: 'none', transform: 'translate(20%, -20%)' }}>
         <Icon size={120} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
        <div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', fontFamily: 'var(--hud-font)', marginBottom: '0.5rem' }}>
            {title}
          </p>
          <div className="stat-value" style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text-main)', textShadow: `0 0 15px ${color}40` }}>
            <NumberTicker value={value} />
          </div>
        </div>
        <div style={{ color: color, filter: `drop-shadow(0 0 8px ${color})` }}>
          <Icon size={28} />
        </div>
      </div>
      <div style={{ marginTop: '1rem', position: 'relative', zIndex: 1 }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: trend > 0 ? 'var(--stark-green)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontFamily: 'var(--hud-font)' }}>
          {trend > 0 ? <ArrowUpRight size={14} /> : <Minus size={14} />}
          {trend > 0 ? `+${trend} CYCLIC INCREASE` : 'STABLE SIGNAL'}
        </span>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ 
    totalUsers: 0, 
    studentsPresentToday: 0, 
    facultyPresentToday: 0, 
    attendanceToday: 0, 
    recentScans: [],
    trendData: [],
    roleDistribution: [],
    allUsers: [],
    totalAnomalies: 0,
    highRiskAttempts: 0,
    riskDistribution: [],
    riskTrendData: []
  });

  const fetchDashboardData = async () => {
    try {
      // Use individual requests to handle role differences
      const attendanceRes = await api.get('/attendance');
      const attendance = attendanceRes.data;

      let users = [];
      try {
        const usersRes = await api.get('/users');
        users = usersRes.data;
      } catch (err) {
        console.warn('Could not fetch user list (likely insufficient permissions)');
        // Fallback: extract users from attendance records if needed, 
        // but normally faculty should have access now.
      }
      const today = new Date().toISOString().split('T')[0];

      // Process Stats
      const todayAttendance = (attendance || []).filter(a => a?.date === today);
      const studentAttendance = todayAttendance.filter(a => a?.role === 'student').length;
      const facultyAttendance = todayAttendance.filter(a => a?.role === 'faculty' || a?.role === 'admin').length;

      // Distribution
      const roles = ['student', 'faculty', 'admin'];
      const distribution = roles.map(role => ({
        name: role.charAt(0).toUpperCase() + role.slice(1),
        value: (users || []).filter(u => u?.role === role).length
      })).filter(d => d.value > 0);

      // Trend Data (Last 7 days)
      const last7Days = [...Array(7)].map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d.toISOString().split('T')[0];
      }).reverse();

      const trendData = last7Days.map(date => ({
        name: new Date(date).toLocaleDateString(undefined, { weekday: 'short' }),
        Attendance: (attendance || []).filter(a => a?.date === date).length
      }));

      // Risk Metrics Integration
      let totalAnomalies = 0;
      (users || []).forEach(u => {
        if (u?.riskProfile?.anomalyCount) totalAnomalies += u.riskProfile.anomalyCount;
      });

      const highRiskAttempts = (attendance || []).filter(a => (a?.riskLevel || 'LOW') === 'HIGH').length;

      const riskLevels = ['LOW', 'MEDIUM', 'HIGH'];
      const riskDistribution = riskLevels.map(level => ({
        name: level,
        value: (attendance || []).filter(a => (a?.riskLevel || 'LOW') === level).length
      })).filter(d => d.value > 0);

      const riskTrendData = last7Days.map(date => {
        const dayAtt = (attendance || []).filter(a => a?.date === date);
        const avgRisk = dayAtt.length > 0 
           ? dayAtt.reduce((sum, a) => sum + (a?.riskScore || 0), 0) / dayAtt.length 
           : 0;
            
        return {
          name: new Date(date).toLocaleDateString(undefined, { weekday: 'short' }),
          AvgRiskScore: Math.round(avgRisk)
        };
      });

      setStats({
        totalUsers: users?.length || 0,
        studentsPresentToday: studentAttendance || 0,
        facultyPresentToday: facultyAttendance || 0,
        attendanceToday: todayAttendance?.length || 0,
        recentScans: attendance?.slice(0, 10) || [],
        trendData: trendData || [],
        roleDistribution: distribution || [],
        allUsers: users || [],
        totalAnomalies: totalAnomalies || 0,
        highRiskAttempts: highRiskAttempts || 0,
        riskDistribution: riskDistribution || [],
        riskTrendData: riskTrendData || []
      });
    } catch (error) {
      console.error('Dashboard fetch error:', error);
      toast.error('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '60vh', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="animate-spin" size={48} color="#3b82f6" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '2rem' }}>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="text-glow-arc" style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem', color: 'var(--text-main)', letterSpacing: '2px', textTransform: 'uppercase' }}>
            Command Center
          </h1>
          <p style={{ color: 'var(--accent-blue)', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', letterSpacing: '2px', fontFamily: 'var(--hud-font)' }}>
            <Activity size={14} className="animate-pulse" /> SYSTEM.RECON // ACTIVE
          </p>
        </div>
        
        {/* Quick Actions */}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {isAdmin && (
            <NavLink to="/register" className="action-btn">
              <UserPlus size={16} /> Register User
            </NavLink>
          )}
          <NavLink to="/scanner" className="action-btn action-btn-emerald">
            <Camera size={16} /> Open Scanner
          </NavLink>
          <NavLink to="/records" className="action-btn action-btn-amber">
            <FileText size={16} /> View Records
          </NavLink>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <DashboardCard title="Registered Profiles" value={stats.totalUsers} icon={Users} color="var(--accent-blue)" trend={0} />
        <DashboardCard title="Active Personnel" value={stats.studentsPresentToday} icon={GraduationCap} color="var(--stark-green)" trend={stats.studentsPresentToday} />
        <DashboardCard title="Security Clearances" value={stats.facultyPresentToday} icon={Shield} color="var(--stark-gold)" trend={stats.facultyPresentToday} />
        <DashboardCard title="Cyclic Scans" value={stats.attendanceToday} icon={UserCheck} color="var(--accent-blue)" trend={stats.attendanceToday} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <DashboardCard title="Anomalous Flags" value={stats.totalAnomalies} icon={UserX} color="var(--stark-red)" trend={stats.totalAnomalies} />
        <DashboardCard title="High Risk Events" value={stats.highRiskAttempts} icon={ShieldAlert} color="var(--stark-red)" trend={stats.highRiskAttempts} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '1.5rem', alignItems: 'start' }}>
        
        {/* Left Column: Charts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
          {/* Trend Chart */}
          <div className="glow-low" style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: '0.5rem', height: '400px', display: 'flex', flexDirection: 'column', border: '1px solid var(--border-color)' }}>
            <h3 className="text-glow-arc" style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '1.5px', fontFamily: 'var(--hud-font)' }}>
               Reconciliation Stream // 7D
            </h3>
            <div style={{ flex: 1, width: '100%', minHeight: '300px' }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <AreaChart data={stats.trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorAttendance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(8px)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '0.5rem', color: '#f8fafc', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }} 
                    itemStyle={{ color: '#3b82f6', fontWeight: 600 }}
                  />
                  <Area type="monotone" dataKey="Attendance" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorAttendance)" animationDuration={1000} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Distribution Donut Chart */}
          <div className="saas-card" style={{ height: '340px', display: 'flex', flexDirection: 'column' }}>
             <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', color: '#f8fafc' }}>
              Identity Distribution
            </h3>
            <div style={{ flex: 1, width: '100%', position: 'relative', minHeight: 0 }}>
              {stats.roleDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.roleDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                      animationDuration={1500}
                    >
                      {stats.roleDistribution?.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(8px)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '0.5rem', color: '#f8fafc' }} 
                    />
                    <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                  No Profiles Registered
                </div>
              )}
            </div>
          </div>

          {/* Risk Trend Chart */}
          <div className="saas-card" style={{ height: '340px', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1.5rem', color: '#f97316' }}>
              Anomaly & Risk Trend
            </h3>
            <div style={{ flex: 1, width: '100%', minHeight: '250px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.riskTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} domain={[0, 100]} />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(8px)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '0.5rem', color: '#f8fafc' }} />
                  <Area type="monotone" dataKey="AvgRiskScore" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorRisk)" animationDuration={1500} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Risk Distribution Donut Chart */}
          <div className="saas-card" style={{ height: '340px', display: 'flex', flexDirection: 'column' }}>
             <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', color: '#f8fafc' }}>
              Risk Assessment Distribution
            </h3>
            <div style={{ flex: 1, width: '100%', position: 'relative', minHeight: 0 }}>
              {stats.riskDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.riskDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                      animationDuration={1500}
                    >
                      {stats.riskDistribution?.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.name === 'LOW' ? '#10b981' : (entry.name === 'MEDIUM' ? '#f59e0b' : '#ef4444')} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(8px)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '0.5rem', color: '#f8fafc' }} />
                    <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                  No Assessment Data
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Live Feed */}
        <div className="glow-medium" style={{ background: 'var(--hud-bg)', padding: '1.5rem', borderRadius: '0.5rem', display: 'flex', flexDirection: 'column', height: '100%', minHeight: '764px', border: '1px solid var(--accent-blue)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(34, 211, 238, 0.2)', paddingBottom: '1rem' }}>
            <h3 className="text-glow-arc" style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '2px', fontFamily: 'var(--hud-font)' }}>Live Recon Feed</h3>
            <span style={{ fontSize: '0.7rem', backgroundColor: 'rgba(34, 211, 238, 0.1)', color: 'var(--accent-blue)', padding: '0.25rem 0.75rem', borderRadius: '2px', border: '1px solid rgba(34, 211, 238, 0.3)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--hud-font)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--accent-blue)', display: 'inline-block', boxShadow: '0 0 8px var(--accent-blue)' }} className="animate-pulse"></span>
              SECURE
            </span>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {stats.recentScans?.length > 0 ? (
              stats.recentScans.map((scan, idx) => {
                const isStudent = scan?.role?.toLowerCase() === 'student';
                const userObj = stats.allUsers?.find(u => u?._id === scan?.userId);

                return (
                  <div key={`${scan?.userId}-${scan?.time}-${idx}`} className="feed-item" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.05)', transition: 'all 0.2s ease', animationDelay: `${idx * 0.1}s` }}>
                     {/* Image */}
                     <div style={{ position: 'relative' }}>
                       {userObj?.faceImage ? (
                         <img src={userObj.faceImage} alt={scan?.name} style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', border: `2px solid ${isStudent ? '#3b82f6' : '#10b981'}` }} />
                       ) : (
                         <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'var(--bg-primary)', border: `2px solid ${isStudent ? '#3b82f6' : '#10b981'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800 }}>
                           {(scan?.name || 'U').charAt(0)}
                         </div>
                       )}
                       <div style={{ position: 'absolute', bottom: -2, right: -2, backgroundColor: isStudent ? '#3b82f6' : '#10b981', borderRadius: '50%', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--bg-card)' }}>
                          <ShieldCheck size={10} color="#fff" />
                       </div>
                     </div>
                     
                     {/* Details */}
                     <div style={{ flex: 1 }}>
                       <p style={{ fontWeight: 600, fontSize: '0.95rem', color: '#f8fafc', marginBottom: '0.1rem' }}>{scan?.name || 'Personnel'}</p>
                       <p style={{ fontSize: '0.75rem', color: isStudent ? '#60a5fa' : '#34d399', fontWeight: 500, textTransform: 'capitalize' }}>{scan?.role || 'Guest'}</p>
                     </div>

                     {/* Time & Arrow */}
                     <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                       <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{scan?.time || '--:--'}</span>
                       <ArrowRight size={14} color="var(--border-color)" />
                     </div>
                  </div>
                )
              })
            ) : (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                <Activity size={32} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                <p style={{ fontSize: '0.875rem' }}>Awaiting initial scans...</p>
              </div>
            )}
          </div>
        </div>

        {isAdmin && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1.5rem' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#f8fafc' }}>System Maintenance</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <button 
                   onClick={async () => {
                     if (confirm('Are you sure you want to delete ALL registered users? This cannot be undone.')) {
                       const tId = toast.loading('Resetting system...');
                       try {
                         const { data } = await api.delete('/users/bulk/clear');
                         toast.success(data.message, { id: tId });
                         fetchDashboardData();
                       } catch (err) {
                         toast.error(err.response?.data?.message || 'Failed to reset system', { id: tId });
                       }
                     }
                   }}
                   className="action-btn"
                   style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                >
                   <Trash2 size={18} /> Delete All Users
                </button>
                <button 
                   onClick={async () => {
                     if (confirm('Are you sure you want to clear all attendance records?')) {
                       const tId = toast.loading('Clearing records...');
                       try {
                         const { data } = await api.delete('/attendance/clear');
                         toast.success(data.message, { id: tId });
                         fetchDashboardData();
                       } catch (err) {
                         toast.error(err.response?.data?.message || 'Failed to clear records', { id: tId });
                       }
                     }
                   }}
                   className="action-btn"
                   style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.2)' }}
                >
                   <RefreshCcw size={18} /> Clear Records
                </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
