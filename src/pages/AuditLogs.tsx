import React, { useState, useEffect } from 'react';
import { Search, Filter, History, User, Shield, Clock, Download, Calendar, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { firestoreService } from '../services/firestoreService';
import { AuditLog, User as UserType } from '../types';
import { formatDateTime, cn } from '../lib/utils';
import { toast } from 'sonner';

export default function AuditLogs() {
  const { user: currentUser } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState({
    start: '',
    end: ''
  });
  const [appliedFilters, setAppliedFilters] = useState({
    search: '',
    start: '',
    end: ''
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const [l, u] = await Promise.all([
          firestoreService.getCollection<AuditLog>('auditLogs'),
          firestoreService.getCollection<UserType>('users')
        ]);
        
        const enriched = l.map(log => ({
          ...log,
          user: u.find(user => user.uid === log.userId)
        })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        setLogs(enriched);
        setLoading(false);
        await firestoreService.logActivity('Viewed Audit Logs', 'Audit Logs', {}, currentUser?.uid, currentUser?.email);
      } catch (error) {
        console.error('Error loading audit logs:', error);
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const filteredLogs = logs.filter(log => {
    const searchStr = `${log.action} ${log.module} ${log.userEmail || log.user?.email || 'System'} ${JSON.stringify(log.details)}`.toLowerCase();
    const matchesSearch = searchStr.includes(appliedFilters.search.toLowerCase());
    
    let matchesDate = true;
    if (appliedFilters.start) {
      matchesDate = matchesDate && new Date(log.timestamp) >= new Date(appliedFilters.start);
    }
    if (appliedFilters.end) {
      // Set end date to end of day
      const endDate = new Date(appliedFilters.end);
      endDate.setHours(23, 59, 59, 999);
      matchesDate = matchesDate && new Date(log.timestamp) <= endDate;
    }
    
    return matchesSearch && matchesDate;
  });

  const handleSearch = () => {
    setAppliedFilters({
      search: searchQuery,
      start: dateFilter.start,
      end: dateFilter.end
    });
    toast.success('Filters applied');
  };

  const handleDownloadCSV = () => {
    if (filteredLogs.length === 0) {
      toast.error('No logs to download');
      return;
    }

    const headers = ['Timestamp', 'User Email', 'Action', 'Module', 'Details'];
    const csvContent = [
      headers.join(','),
      ...filteredLogs.map(log => {
        const details = log.details ? JSON.stringify(log.details).replace(/"/g, '""') : '';
        return [
          `"${formatDateTime(log.timestamp)}"`,
          `"${log.userEmail || log.user?.email || 'System'}"`,
          `"${log.action}"`,
          `"${log.module}"`,
          `"${details}"`
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Audit logs downloaded successfully');
  };

  const stats = {
    total: logs.length,
    today: logs.filter(l => new Date(l.timestamp).toDateString() === new Date().toDateString()).length,
    users: new Set(logs.map(l => l.userId)).size,
    modules: new Set(logs.map(l => l.module)).size
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Audit Logs</h1>
          <p className="text-muted-foreground mt-1">Traceability and compliance tracking for all system actions.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Logs', value: stats.total, icon: History, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Today\'s Activity', value: stats.today, icon: Clock, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Active Users', value: stats.users, icon: User, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Modules Tracked', value: stats.modules, icon: Shield, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map((stat, i) => (
          <div key={i} className="bg-card p-4 rounded-xl border shadow-sm flex items-center gap-4">
            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", stat.bg)}>
              <stat.icon className={cn("w-5 h-5", stat.color)} />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{stat.label}</p>
              <p className="text-2xl font-bold">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-muted/30 flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text"
              placeholder="Search logs by action, email or module..."
              className="w-full pl-10 pr-4 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-40">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input 
                type="date"
                className="w-full pl-9 pr-3 py-2 bg-background border rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary/20"
                value={dateFilter.start}
                onChange={(e) => setDateFilter({ ...dateFilter, start: e.target.value })}
              />
            </div>
            <span className="text-muted-foreground text-xs">to</span>
            <div className="relative flex-1 md:w-40">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input 
                type="date"
                className="w-full pl-9 pr-3 py-2 bg-background border rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary/20"
                value={dateFilter.end}
                onChange={(e) => setDateFilter({ ...dateFilter, end: e.target.value })}
              />
            </div>
            {(dateFilter.start || dateFilter.end) && (
              <button 
                onClick={() => {
                  setDateFilter({ start: '', end: '' });
                  setAppliedFilters({ ...appliedFilters, start: '', end: '' });
                }}
                className="p-2 hover:bg-accent rounded-lg text-muted-foreground transition-colors"
                title="Clear date filter"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button 
              onClick={handleSearch}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity whitespace-nowrap text-xs"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search</span>
            </button>
            <button 
              onClick={handleDownloadCSV}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors whitespace-nowrap text-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                <th className="px-6 py-4 font-semibold">S.No</th>
                <th className="px-6 py-4 font-semibold">Timestamp</th>
                <th className="px-6 py-4 font-semibold">User Email</th>
                <th className="px-6 py-4 font-semibold">Action</th>
                <th className="px-6 py-4 font-semibold">Module</th>
                <th className="px-6 py-4 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredLogs.map((log, index) => (
                <tr key={log.id} className="hover:bg-accent/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium">
                    {index + 1}
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground whitespace-nowrap">
                    {formatDateTime(log.timestamp)}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium">
                    {log.userEmail || log.user?.email || 'System'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-1 rounded text-[10px] font-bold uppercase",
                      log.action.toLowerCase().includes('delete') ? "bg-rose-50 text-rose-700" :
                      log.action.toLowerCase().includes('create') ? "bg-emerald-50 text-emerald-700" :
                      log.action.toLowerCase().includes('update') ? "bg-blue-50 text-blue-700" : "bg-slate-50 text-slate-700"
                    )}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium">{log.module}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    <div className="max-w-md space-y-1">
                      {log.details ? Object.entries(log.details).map(([key, value]) => (
                        <div key={key} className="flex gap-2 text-[11px]">
                          <span className="font-bold uppercase opacity-50 min-w-[60px]">{key}:</span>
                          <span className="text-foreground break-all">
                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                          </span>
                        </div>
                      )) : '-'}
                    </div>
                  </td>
                </tr>
              ))}

              {filteredLogs.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center text-muted-foreground">
                    No audit logs found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
