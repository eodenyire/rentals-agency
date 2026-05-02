/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useParams } from 'react-router-dom';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User, signOut } from 'firebase/auth';
import { auth } from './lib/firebase';
import { LayoutDashboard, Home, Users, FileText, CreditCard, LogOut, LogIn, Menu, X, Plus, BarChart3, Download, FileJson } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { usePropertyData, useTenantData, useLeaseData, usePaymentData, useReminderData } from './hooks/useData';
import { format, addMonths, isBefore, isEqual, parseISO, differenceInDays, startOfDay } from 'date-fns';
import { Property, Tenant, Lease, Payment, ReminderLog } from './types';

// --- Utils ---
function generatePaymentSchedule(startDate: string, endDate: string, amount: number) {
  const schedule = [];
  try {
    let current = parseISO(startDate);
    const end = parseISO(endDate);

    // If dates are invalid, return empty
    if (isNaN(current.getTime()) || isNaN(end.getTime())) return [];

    // Limit to 240 months (20 years) to avoid infinite loops if dates are weird
    let count = 0;
    while ((isBefore(current, end) || isEqual(current, end)) && count < 240) {
      schedule.push({
        date: new Date(current),
        amount: amount,
      });
      current = addMonths(current, 1);
      count++;
    }
  } catch (e) {
    console.error("Error generating schedule:", e);
  }
  return schedule;
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Auth Context ---
interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

// --- Components ---

function Header() {
  const { user, login, logout } = useAuth();
  
  return (
    <header className="h-20 border-b border-brand-border bg-white flex items-center justify-between px-10 sticky top-0 z-10">
      <div className="flex items-center gap-8">
        <h2 className="text-lg font-medium tracking-tight">System Console</h2>
        <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>
        <span className="text-slate-400 text-sm hidden sm:block">Portfolio Overview</span>
      </div>
      
      <div className="flex items-center gap-6">
        {user ? (
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-semibold">{user.displayName}</span>
              <span className="text-xs text-slate-400">{user.email}</span>
            </div>
            <img 
              referrerPolicy="no-referrer" 
              src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} 
              alt="Profile" 
              className="w-10 h-10 rounded-full border border-slate-200 shadow-sm"
            />
            <button 
              onClick={logout}
              className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
              title="Logout"
            >
              <LogOut size={20} />
            </button>
          </div>
        ) : (
          <button 
            onClick={login}
            className="btn-primary flex items-center gap-2"
          >
            <LogIn size={18} />
            AUTHORIZE
          </button>
        )}
      </div>
    </header>
  );
}

function Sidebar() {
  const location = useLocation();
  
  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: Home, label: 'Properties', path: '/properties' },
    { icon: Users, label: 'Tenants', path: '/tenants' },
    { icon: FileText, label: 'Lease Agreements', path: '/leases' },
    { icon: CreditCard, label: 'Rent Collection', path: '/payments' },
    { icon: BarChart3, label: 'Fiscal Reports', path: '/reports' },
  ];

  return (
    <aside className="w-64 border-r border-brand-border bg-white h-[calc(100vh-64px)] hidden md:flex flex-col">
      <div className="p-8 border-b border-brand-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-primary flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-white"></div>
          </div>
          <h1 className="text-xl font-bold tracking-tight">PropSync</h1>
        </div>
      </div>
      <nav className="flex-1 p-4 flex flex-col gap-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "px-4 py-3 text-sm transition-all border-l-4",
                isActive 
                  ? "nav-item-active" 
                  : "text-slate-500 hover:bg-slate-50 border-transparent"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      
      <div className="p-6 border-t border-brand-border">
        <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
          v4.2.0-STABLE
        </div>
      </div>
    </aside>
  );
}

function ConfirmationModal({ 
  isOpen, 
  title, 
  message, 
  onConfirm, 
  onCancel, 
  confirmLabel = "Confirm", 
  cancelLabel = "Cancel",
  variant = 'danger'
}: { 
  isOpen: boolean; 
  title: string; 
  message: string; 
  onConfirm: () => void; 
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'primary' | 'danger';
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-white w-full max-w-md shadow-2xl p-10 border-t-8 border-rose-600"
          >
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-rose-50 flex items-center justify-center shrink-0">
                  <X className="text-rose-600" size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold tracking-tight text-slate-900 uppercase italic">{title}</h3>
                  <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mt-1">Status: Pending verification</p>
                </div>
              </div>
              
              <div className="p-6 bg-slate-50 border border-slate-100">
                <p className="text-sm text-slate-600 leading-relaxed font-medium">
                  {message}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4">
                <button 
                  onClick={onCancel}
                  className="py-4 text-[10px] font-black border border-slate-200 text-slate-400 hover:border-slate-900 hover:text-slate-900 transition-all uppercase tracking-[0.2em]"
                >
                  {cancelLabel}
                </button>
                <button 
                  onClick={() => {
                    onConfirm();
                    onCancel();
                  }}
                  className={cn(
                    "py-4 text-[10px] font-black text-white transition-all uppercase tracking-[0.2em] shadow-lg",
                    variant === 'danger' ? "bg-rose-600 hover:bg-rose-700 shadow-rose-100" : "bg-slate-900 hover:bg-black shadow-slate-100"
                  )}
                >
                  {confirmLabel}
                </button>
              </div>
              
              <div className="text-center">
                <p className="text-[8px] font-black text-slate-300 uppercase tracking-[0.3em]">Authorized Session Protocol 88-X</p>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// --- Page Components ---

function Dashboard() {
  const { properties } = usePropertyData();
  const { leases } = useLeaseData();
  const { payments } = usePaymentData();
  const { reminders, logReminder } = useReminderData();
  const { tenants } = useTenantData();
  const [isProcessing, setIsProcessing] = useState(false);

  const totalRevenue = payments
    .filter(p => p.status === 'PAID')
    .reduce((val, p) => val + p.amount, 0);

  const pendingPayments = payments.filter(p => p.status === 'PENDING').length;
  const activeLeases = leases.filter(l => l.status === 'ACTIVE').length;
  const occupancyRate = properties.length > 0 ? (activeLeases / properties.length) : 0;

  const executeQueue = async () => {
    setIsProcessing(true);
    const results = [];
    
    try {
      for (const lease of leases.filter(l => l.status === 'ACTIVE')) {
        const leasePayments = payments.filter(p => p.leaseId === lease.id && p.status === 'PENDING');
        const tenant = tenants.find(t => t.id === lease.tenantId);
        const property = properties.find(p => p.id === lease.propertyId);
        
        if (!tenant) continue;

        for (const payment of leasePayments) {
          const dueDate = startOfDay(parseISO(payment.dueDate));
          const today = startOfDay(new Date());
          const daysUntilDue = differenceInDays(dueDate, today);

          // Check each configured lead time
          const leadTimes = lease.reminderLeadTimes || [7, 2];
          for (const leadTime of leadTimes) {
            // If we are at or past the lead time day, but not past the due date
            if (daysUntilDue <= leadTime && daysUntilDue >= 0) {
              // Check if already sent
              const alreadySent = reminders.some(r => 
                r.paymentId === payment.id && 
                r.leadTimeDays === leadTime && 
                r.status === 'SENT'
              );

              if (!alreadySent) {
                // Dispatch!
                console.log(`Triggering reminder for ${tenant.name} - ${leadTime} days before due`);
                
                try {
                  const response = await fetch('/api/send-reminder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      tenantEmail: tenant.email,
                      tenantName: tenant.name,
                      propertyName: property?.name || 'Your Property',
                      dueDate: format(dueDate, 'MMM dd, yyyy'),
                      leadTime: leadTime,
                      amount: payment.amount
                    })
                  });

                  if (response.ok) {
                    await logReminder({
                      leaseId: lease.id,
                      paymentId: payment.id,
                      tenantId: tenant.id,
                      managerId: lease.managerId,
                      leadTimeDays: leadTime,
                      sentAt: new Date().toISOString(),
                      status: 'SENT',
                      recipientEmail: tenant.email
                    });
                    results.push(`Sent ${leadTime}-day reminder to ${tenant.name}`);
                  }
                } catch (err) {
                  console.error("Failed to send reminder via API:", err);
                }
              }
            }
          }
        }
      }
      
      if (results.length > 0) {
        alert(`${results.length} reminders processed and logged to the ledger.`);
      } else {
        alert("Automation Queue: No new reminders required for current pending payments.");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const sentCount = reminders.length;
  const inQueueCount = payments.filter(p => p.status === 'PENDING').length;

  return (
    <section className="space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Revenue', value: `$${totalRevenue.toLocaleString()}`, progress: 0.75, color: 'text-slate-900', secondary: 'Collected' },
          { label: 'Active Agreements', value: activeLeases.toString(), progress: occupancyRate, color: 'text-indigo-600', secondary: `${(occupancyRate * 100).toFixed(0)}% Occupancy` },
          { label: 'Pending Deposits', value: pendingPayments.toString(), progress: 0.45, color: 'text-orange-600', secondary: 'Due this week' },
          { label: 'System Health', value: 'Optimal', progress: 1, color: 'text-emerald-600', secondary: 'All processes normal' },
        ].map((stat, i) => (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
            key={stat.label} 
            className="glass-card p-6"
          >
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 font-bold">{stat.label}</p>
            <h3 className={cn("text-2xl font-black mb-1", stat.color)}>{stat.value}</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase">{stat.secondary}</p>
            <div className="mt-4 h-1 bg-slate-100">
              <div 
                className={cn("h-full transition-all duration-1000", stat.color.replace('text-', 'bg-'))} 
                style={{ width: `${stat.progress * 100}%` }}
              ></div>
            </div>
          </motion.div>
        ))}
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card overflow-hidden">
            <div className="px-6 py-5 border-b border-brand-border flex items-center justify-between bg-white">
              <h4 className="font-black text-xs uppercase tracking-tighter">Recent Payment Status</h4>
              <Link to="/payments" className="text-[10px] font-bold text-brand-primary uppercase tracking-widest hover:underline">View All Records</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                  <tr>
                    <th className="px-6 py-4">Participant</th>
                    <th className="px-6 py-4">Transaction</th>
                    <th className="px-6 py-4">Due Date</th>
                    <th className="px-6 py-4 text-right">Verification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {payments.slice(0, 5).map((payment) => (
                    <tr key={payment.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-semibold text-slate-600 tracking-tight">User #{payment.tenantId.slice(-4)}</span>
                      </td>
                      <td className="px-6 py-4 mono-data font-medium text-slate-900">${payment.amount.toLocaleString()}</td>
                      <td className="px-6 py-4 text-slate-400">
                        {format(new Date(payment.dueDate), 'MMM dd, yyyy')}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={cn(
                          "px-2 py-1 text-[10px] font-black uppercase tracking-tighter",
                          payment.status === 'PAID' ? "bg-emerald-50 text-emerald-700" :
                          payment.status === 'OVERDUE' ? "bg-rose-50 text-rose-700" :
                          "bg-orange-50 text-orange-700"
                        )}>
                          {payment.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {payments.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic text-xs uppercase tracking-widest">
                        Database Synchronizing... No Records
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        
        <div className="space-y-6">
          <div className="glass-card flex flex-col h-full bg-white">
            <div className="p-6 border-b border-brand-border">
              <h4 className="font-black text-xs uppercase tracking-tighter">Automated Reminders</h4>
              <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-widest">Next scheduled batch: 12:00 PM</p>
            </div>
            <div className="flex-1 p-6 space-y-6 overflow-hidden">
              <div className="flex gap-4">
                <div className="w-1 bg-brand-primary shrink-0"></div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-tighter">Payments Pending ({inQueueCount})</p>
                  <p className="text-sm mt-1 text-slate-600 leading-tight">Reminders will be dispatched according to lease lead-times.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-1 bg-emerald-500 shrink-0"></div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-tighter">Total Sent ({sentCount})</p>
                  <p className="text-sm mt-1 text-slate-600 leading-tight">Records of successfully synchronized tenant notifications.</p>
                </div>
              </div>
              
              {reminders.slice(0, 3).map(reminder => (
                <div key={reminder.id} className="flex gap-4 opacity-70">
                  <div className="w-1 bg-slate-300 shrink-0"></div>
                  <div>
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-tighter">{format(new Date(reminder.sentAt), 'MMM dd | HH:mm')}</p>
                    <p className="text-xs mt-0.5 text-slate-500 line-clamp-1">{reminder.leadTimeDays}d Reminder &rarr; {reminder.recipientEmail}</p>
                  </div>
                </div>
              ))}
            </div>
            <button 
              onClick={executeQueue}
              disabled={isProcessing}
              className={cn(
                "m-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-colors",
                isProcessing ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "bg-slate-900 text-white hover:bg-slate-800"
              )}
            >
              {isProcessing ? 'Processing Queue...' : 'Execute Queue Now'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Properties() {
  const { properties, addProperty } = usePropertyData();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', address: '', type: 'HOUSE' as const });
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'HOUSE' | 'FLAT' | 'BUSINESS'>('ALL');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addProperty(formData);
    setShowForm(false);
    setFormData({ name: '', address: '', type: 'HOUSE' });
  };

  const filteredProperties = properties.filter(p => typeFilter === 'ALL' || p.type === typeFilter);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight">Portfolio Management</h2>
          <p className="text-slate-500 text-sm">Asset tracking and status monitoring.</p>
        </div>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="btn-primary flex items-center gap-2"
        >
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? 'CANCEL' : 'REGISTER ASSET'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 pb-2">
        {['ALL', 'HOUSE', 'FLAT', 'BUSINESS'].map((type) => (
          <button
            key={type}
            onClick={() => setTypeFilter(type as any)}
            className={cn(
              "px-6 py-2 text-[10px] font-black uppercase tracking-widest border transition-all",
              typeFilter === type 
                ? "bg-slate-900 text-white border-slate-900" 
                : "bg-white text-slate-400 border-slate-200 hover:border-slate-900 hover:text-slate-900"
            )}
          >
            {type}
          </button>
        ))}
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <form onSubmit={handleSubmit} className="glass-card p-8 space-y-6 max-w-2xl bg-white">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Asset Name</label>
                  <input 
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Identification Label"
                    className="w-full px-4 py-3 border border-slate-200 focus:outline-none focus:border-brand-primary transition-all text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Asset Class</label>
                  <select 
                    value={formData.type}
                    onChange={e => setFormData({ ...formData, type: e.target.value as any })}
                    className="w-full px-4 py-3 border border-slate-200 focus:outline-none focus:border-brand-primary transition-all text-sm appearance-none bg-white"
                  >
                    <option value="HOUSE">Residential / House</option>
                    <option value="FLAT">Residential / Unit</option>
                    <option value="BUSINESS">Commercial / Office</option>
                  </select>
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Location Vector</label>
                  <input 
                    required
                    value={formData.address}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Full Physical Address"
                    className="w-full px-4 py-3 border border-slate-200 focus:outline-none focus:border-brand-primary transition-all text-sm"
                  />
                </div>
              </div>
              <button 
                type="submit"
                className="bg-slate-900 text-white px-8 py-3 text-[10px] font-black uppercase tracking-[0.2em] active:scale-95 transition-all"
              >
                PROCEED WITH REGISTRATION
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
      
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        {filteredProperties.map((property, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            key={property.id} 
            className="glass-card overflow-hidden group hover:shadow-md transition-all duration-300 bg-white"
          >
            <div className="h-2 w-full bg-slate-100">
              <div className={cn(
                "h-full transition-all duration-1000",
                property.type === 'HOUSE' ? "bg-indigo-600 w-1/4" : 
                property.type === 'FLAT' ? "bg-indigo-600 w-2/4" : "bg-indigo-600 w-full"
              )} />
            </div>
            <div className="p-8 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{property.type}</p>
                  <h3 className="font-bold text-xl">{property.name}</h3>
                </div>
                <div className="w-10 h-10 border border-slate-100 flex items-center justify-center text-slate-300">
                  <Home size={20} />
                </div>
              </div>
              <p className="text-sm text-slate-500 flex items-start gap-2 leading-relaxed h-10 line-clamp-2">
                {property.address}
              </p>
              
              <div className="pt-6 border-t border-slate-100 flex items-center gap-4">
                <Link 
                  to={`/properties/${property.id}`}
                  className="flex-1 text-center py-3 text-[10px] font-black border border-slate-900 rounded-none hover:bg-slate-900 hover:text-white transition-all uppercase tracking-[0.2em]"
                >
                  Inspect Asset
                </Link>
                <Link 
                  to={`/leases?property=${property.id}`}
                  className="px-4 text-center py-3 text-[10px] font-black border border-slate-200 rounded-none hover:border-slate-900 hover:text-slate-900 transition-all uppercase tracking-[0.2em]"
                >
                   Legal
                </Link>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const { properties } = usePropertyData();
  const { leases } = useLeaseData();
  const { payments } = usePaymentData();
  const { tenants } = useTenantData();

  const property = properties.find(p => p.id === id);
  const propertyLeases = leases.filter(l => l.propertyId === id && l.status === 'ACTIVE');
  const propertyPayments = payments.filter(p => p.propertyId === id);

  // Total projected rent (active leases)
  const totalMonthlyRent = propertyLeases.reduce((acc, lease) => acc + lease.rentAmount, 0);

  // Outstanding / Overdue
  const overduePayments = propertyPayments.filter(p => p.status === 'OVERDUE');
  const outstandingBalance = overduePayments.reduce((acc, p) => acc + p.amount, 0);

  if (!property) {
    return (
      <div className="py-20 text-center">
        <p className="text-slate-400 font-black uppercase tracking-widest">Asset record not found</p>
        <Link to="/properties" className="text-brand-primary hover:underline mt-4 inline-block font-bold">Return to Portfolio</Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <Link to="/properties" className="text-[10px] font-black text-slate-400 hover:text-slate-900 flex items-center gap-1 uppercase tracking-widest mb-2 transition-colors">
            ← Asset Portfolio
          </Link>
          <h2 className="text-3xl font-black tracking-tight text-slate-900">{property.name}</h2>
          <p className="text-slate-500 text-sm font-mono tracking-tighter uppercase">{property.address}</p>
          <span className="mt-2 inline-block px-2 py-0.5 bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest w-fit">
            {property.type}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="glass-card p-8 bg-white border-l-4 border-emerald-500">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Projected Monthly Yield</p>
          <h3 className="text-4xl font-black text-slate-900">${totalMonthlyRent.toLocaleString()}</h3>
          <p className="text-xs text-slate-400 mt-2 font-bold uppercase tracking-widest">Sum of active lease commitments</p>
        </div>
        <div className="glass-card p-8 bg-white border-l-4 border-rose-500">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Outstanding Arrears</p>
          <h3 className="text-4xl font-black text-rose-600">${outstandingBalance.toLocaleString()}</h3>
          <p className="text-xs text-slate-400 mt-2 font-bold uppercase tracking-widest">Accumulated overdue payments</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-card p-8 bg-white space-y-6">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-50 pb-4">On-Site Participants</h3>
            {propertyLeases.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No active occupants assigned to this asset.</p>
            ) : (
              <div className="space-y-4">
                {propertyLeases.map(lease => {
                  const tenant = tenants.find(t => t.id === lease.tenantId);
                  return (
                    <div key={lease.id} className="p-4 border border-slate-100 space-y-2">
                       <p className="text-[9px] font-black text-brand-primary uppercase tracking-widest">Lease Active</p>
                       <p className="text-sm font-bold text-slate-900">{tenant?.name || "Anonymous Resident"}</p>
                       <p className="text-xs text-slate-400 font-mono">{tenant?.email}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
           <div className="glass-card overflow-hidden bg-white">
            <div className="px-8 py-5 border-b border-brand-border bg-slate-50">
              <h4 className="font-black text-xs uppercase tracking-tighter text-slate-400">Financial History Summary</h4>
            </div>
            <table className="w-full text-left">
              <thead className="text-[9px] font-black text-slate-300 tracking-[0.2em] uppercase border-b border-slate-100">
                <tr>
                  <th className="px-8 py-4">Status</th>
                  <th className="px-8 py-4">Due Date</th>
                  <th className="px-8 py-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {propertyPayments.slice(0, 10).map(payment => (
                  <tr key={payment.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-5">
                      <span className={cn(
                        "px-2 py-0.5 text-[8px] font-black uppercase tracking-tighter border",
                        payment.status === 'PAID' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                        payment.status === 'OVERDUE' ? "bg-rose-50 text-rose-700 border-rose-100" :
                        "bg-orange-50 text-orange-700 border-orange-100"
                      )}>
                        {payment.status}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-sm font-medium text-slate-500">
                      {format(new Date(payment.dueDate), 'MMM dd, yyyy')}
                    </td>
                    <td className="px-8 py-5 text-right font-mono font-black text-slate-900">
                      ${payment.amount.toLocaleString()}
                    </td>
                  </tr>
                ))}
                {propertyPayments.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-8 py-12 text-center text-slate-300 text-[10px] font-black uppercase tracking-widest">
                      No payment data available for this asset.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Tenants() {
  const { tenants, addTenant } = useTenantData();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', address: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addTenant(formData);
    setShowForm(false);
    setFormData({ name: '', email: '', phone: '', address: '' });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight">Participant Directory</h2>
          <p className="text-slate-500 text-sm">Tenant and occupant synchronization.</p>
        </div>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="btn-primary flex items-center gap-2"
        >
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? 'CANCEL' : 'ADD PARTICIPANT'}
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <form onSubmit={handleSubmit} className="glass-card p-8 space-y-6 max-w-2xl bg-white mb-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Legal Identity / Name</label>
                  <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-3 border border-slate-200 text-sm focus:border-brand-primary focus:outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Contact Vector (Email)</label>
                  <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-4 py-3 border border-slate-200 text-sm focus:border-brand-primary focus:outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Audio Link (Phone)</label>
                  <input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full px-4 py-3 border border-slate-200 text-sm focus:border-brand-primary font-mono focus:outline-none" />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Secondary Vector (Billing Address)</label>
                  <input value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full px-4 py-3 border border-slate-200 text-sm focus:border-brand-primary focus:outline-none" />
                </div>
              </div>
              <button type="submit" className="bg-slate-900 text-white px-8 py-3 text-[10px] font-black uppercase tracking-[0.2em] active:scale-95 transition-all">SYNCHRONIZE RECORD</button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="glass-card overflow-hidden bg-white">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-[10px] font-black text-slate-400 tracking-[0.2em] uppercase">
            <tr>
              <th className="px-8 py-5">Identity</th>
              <th className="px-8 py-5">Communication</th>
              <th className="px-8 py-5 text-center">Status</th>
              <th className="px-8 py-5 text-right">Protocol</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tenants.map((tenant) => (
              <tr key={tenant.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-8 py-6">
                  <span className="text-sm font-bold text-slate-900 tracking-tight">{tenant.name}</span>
                </td>
                <td className="px-8 py-6">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-slate-600">{tenant.email}</span>
                    <span className="text-[10px] text-slate-400 font-mono tracking-widest uppercase mt-0.5">{tenant.phone || 'No direct link'}</span>
                  </div>
                </td>
                <td className="px-8 py-6 text-center">
                  <span className="text-[9px] font-black px-2 py-1 bg-emerald-50 text-emerald-700 uppercase tracking-widest border border-emerald-100">Verified</span>
                </td>
                <td className="px-8 py-6 text-right">
                  <Link 
                    to={`/tenants/${tenant.id}`}
                    className="text-[10px] font-black text-brand-primary hover:underline tracking-widest uppercase"
                  >
                    Inspect
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TenantDetail() {
  const { id } = useParams<{ id: string }>();
  const { tenants } = useTenantData();
  const { leases } = useLeaseData();
  const { payments } = usePaymentData();
  const { properties } = usePropertyData();

  const tenant = tenants.find(t => t.id === id);
  const tenantLeases = leases.filter(l => l.tenantId === id);
  const tenantPayments = payments.filter(p => p.tenantId === id);

  if (!tenant) {
    return (
      <div className="py-20 text-center">
        <p className="text-slate-400 font-black uppercase tracking-widest">Participant record not found</p>
        <Link to="/tenants" className="text-brand-primary hover:underline mt-4 inline-block font-bold">Return to Directory</Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <Link to="/tenants" className="text-[10px] font-black text-slate-400 hover:text-slate-900 flex items-center gap-1 uppercase tracking-widest mb-2 transition-colors">
            ← Participant Directory
          </Link>
          <h2 className="text-3xl font-black tracking-tight text-slate-900">{tenant.name}</h2>
          <p className="text-slate-500 text-sm font-mono tracking-tighter uppercase">{tenant.email} • {tenant.phone || "No direct link"}</p>
          {tenant.address && <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1 italic">{tenant.address}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-8">
          <div className="glass-card p-8 bg-white space-y-6">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-50 pb-4">Active Agreements</h3>
            {tenantLeases.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No active contracts found for this identity.</p>
            ) : (
              <div className="space-y-4">
                {tenantLeases.map(lease => {
                  const prop = properties.find(p => p.id === lease.propertyId);
                  return (
                    <div key={lease.id} className="p-4 border border-slate-100 space-y-2">
                      <p className="text-[9px] font-black text-brand-primary uppercase tracking-widest">{lease.status}</p>
                      <p className="text-sm font-bold text-slate-900">{prop?.name || "Asset Syncing..."}</p>
                      <p className="text-xl font-black italic text-slate-900 mt-1">${lease.rentAmount.toLocaleString()}<span className="text-[10px] font-normal not-italic text-slate-400">/mo</span></p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-8">
          <div className="glass-card overflow-hidden bg-white">
            <div className="px-8 py-5 border-b border-brand-border bg-slate-50">
              <h4 className="font-black text-xs uppercase tracking-tighter text-slate-400">Financial History</h4>
            </div>
            <table className="w-full text-left">
              <thead className="text-[9px] font-black text-slate-300 tracking-[0.2em] uppercase border-b border-slate-100">
                <tr>
                  <th className="px-8 py-4">Verification</th>
                  <th className="px-8 py-4">Due Date</th>
                  <th className="px-8 py-4 text-right">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {tenantPayments.map(payment => (
                  <tr key={payment.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-5">
                      <span className={cn(
                        "px-2 py-0.5 text-[8px] font-black uppercase tracking-tighter border",
                        payment.status === 'PAID' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                        payment.status === 'OVERDUE' ? "bg-rose-50 text-rose-700 border-rose-100" :
                        "bg-orange-50 text-orange-700 border-orange-100"
                      )}>
                        {payment.status}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-sm font-medium text-slate-500">
                      {format(new Date(payment.dueDate), 'MMM dd, yyyy')}
                    </td>
                    <td className="px-8 py-5 text-right font-mono font-black text-slate-900">
                      ${payment.amount.toLocaleString()}
                    </td>
                  </tr>
                ))}
                {tenantPayments.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-8 py-12 text-center text-slate-300 text-[10px] font-black uppercase tracking-widest">
                      Zero Financial Ingress Detected
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Leases() {
  const { leases, createLease, terminateLease } = useLeaseData();
  const { properties } = usePropertyData();
  const { tenants } = useTenantData();
  const [showForm, setShowForm] = useState(false);
  const [selectedLeaseId, setSelectedLeaseId] = useState<string | null>(null);
  const [leaseToTerminate, setLeaseToTerminate] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'TERMINATED' | 'EXPIRED'>('ALL');
  const [autoCalculate, setAutoCalculate] = useState(false);
  const [formData, setFormData] = useState({ 
    propertyId: '', 
    tenantId: '', 
    rentAmount: 0, 
    startDate: '', 
    endDate: '',
    reminderLeadTimes: '7, 2' // Comma separated for UI
  });

  useEffect(() => {
    if (autoCalculate && formData.startDate) {
      const start = new Date(formData.startDate);
      if (!isNaN(start.getTime())) {
        const end = new Date(start);
        end.setFullYear(start.getFullYear() + 1);
        // Standard 12 month term usually ends the day before the anniversary
        end.setDate(end.getDate() - 1);
        setFormData(prev => ({
          ...prev,
          endDate: end.toISOString().split('T')[0]
        }));
      }
    }
  }, [formData.startDate, autoCalculate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (new Date(formData.endDate) <= new Date(formData.startDate)) {
      alert("CHRONOLOGICAL ERROR: Termination date must be after the initiation date.");
      return;
    }

    const leadTimes = formData.reminderLeadTimes
      .split(',')
      .map(t => parseInt(t.trim()))
      .filter(t => !isNaN(t));
    
    createLease({
      ...formData,
      reminderLeadTimes: leadTimes
    });
    setShowForm(false);
    setAutoCalculate(false);
  };

  const filteredLeases = leases.filter(l => statusFilter === 'ALL' || l.status === statusFilter);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight">Contract Registry</h2>
          <p className="text-slate-500 text-sm">Agreement lifecycle and asset mapping.</p>
        </div>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="btn-primary flex items-center gap-2"
        >
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? 'CANCEL' : 'INITIATE AGREEMENT'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 pb-2">
        {['ALL', 'ACTIVE', 'TERMINATED', 'EXPIRED'].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status as any)}
            className={cn(
              "px-6 py-2 text-[10px] font-black uppercase tracking-widest border transition-all",
              statusFilter === status 
                ? "bg-slate-900 text-white border-slate-900" 
                : "bg-white text-slate-400 border-slate-200 hover:border-slate-900 hover:text-slate-900"
            )}
          >
            {status}
          </button>
        ))}
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <form onSubmit={handleSubmit} className="glass-card p-10 space-y-8 max-w-3xl bg-white mb-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Target Asset</label>
                  <select required value={formData.propertyId} onChange={e => setFormData({...formData, propertyId: e.target.value})} className="w-full px-4 py-3 border border-slate-200 text-sm bg-white cursor-pointer focus:border-brand-primary focus:outline-none appearance-none">
                    <option value="">Select Property Instance</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Primary Participant</label>
                  <select required value={formData.tenantId} onChange={e => setFormData({...formData, tenantId: e.target.value})} className="w-full px-4 py-3 border border-slate-200 text-sm bg-white cursor-pointer focus:border-brand-primary focus:outline-none appearance-none">
                    <option value="">Select Tenant Record</option>
                    {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Monthly Commitment (USD)</label>
                  <input required type="number" value={formData.rentAmount} onChange={e => setFormData({...formData, rentAmount: parseFloat(e.target.value)})} className="w-full px-4 py-3 border border-slate-200 text-sm font-mono focus:border-brand-primary focus:outline-none" />
                </div>
                <div className="md:col-span-2">
                  <div className="flex items-center gap-2 mb-4">
                    <input 
                      type="checkbox" 
                      id="auto-calc" 
                      checked={autoCalculate} 
                      onChange={e => setAutoCalculate(e.target.checked)}
                      className="w-4 h-4 accent-slate-900"
                    />
                    <label htmlFor="auto-calc" className="text-[10px] font-black text-slate-900 uppercase tracking-widest cursor-pointer select-none">
                      Enable Standard 12-Month Term Calculation
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Start Phase</label>
                    <input required type="date" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} className="w-full px-4 py-3 border border-slate-200 text-sm focus:border-brand-primary focus:outline-none" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Termination</label>
                    <input 
                      required 
                      type="date" 
                      min={formData.startDate}
                      value={formData.endDate} 
                      onChange={e => setFormData({...formData, endDate: e.target.value})} 
                      className="w-full px-4 py-3 border border-slate-200 text-sm focus:border-brand-primary focus:outline-none" 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Reminder Lead Times (Days before due)</label>
                  <input required type="text" value={formData.reminderLeadTimes} onChange={e => setFormData({...formData, reminderLeadTimes: e.target.value})} placeholder="e.g. 7, 2" className="w-full px-4 py-3 border border-slate-200 text-sm focus:border-brand-primary focus:outline-none" />
                  <p className="text-[9px] text-slate-400 font-bold uppercase italic tracking-widest mt-1">Separate multiples with commas.</p>
                </div>
              </div>
              <button type="submit" className="bg-slate-900 text-white px-10 py-4 text-[10px] font-black uppercase tracking-[0.3em] active:scale-95 transition-all">GENERATE SYSTEM CONTRACT</button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        {filteredLeases.map((lease) => {
          const prop = properties.find(p => p.id === lease.propertyId);
          const tenant = tenants.find(t => t.id === lease.tenantId);
          return (
            <div key={lease.id} className="glass-card p-8 flex flex-col justify-between hover:border-brand-primary transition-all group bg-white">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">ID: {lease.id.slice(-6)}</span>
                  <span className={cn(
                    "px-3 py-1 text-[9px] font-black uppercase tracking-widest border",
                    lease.status === 'ACTIVE' ? "bg-indigo-50 text-indigo-700 border-indigo-100" : "bg-slate-50 text-slate-500 border-slate-100"
                  )}>{lease.status}</span>
                </div>
                <div>
                  <h4 className="font-bold text-lg text-slate-900 tracking-tight leading-tight">{prop?.name || 'Undefined Asset'}</h4>
                  <p className="text-[10px] text-brand-primary font-black uppercase tracking-widest mt-1.5">{tenant?.name || 'No Verified Occupant'}</p>
                </div>
                <div className="pt-6 flex items-center justify-between border-t border-slate-100">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Rent Value</p>
                    <p className="font-bold text-2xl mono-data text-slate-900">${lease.rentAmount.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Termination</p>
                    <p className="text-xs font-bold text-slate-900 uppercase tracking-tighter italic">{format(new Date(lease.endDate), 'MMM yyyy')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-8">
                  <Link 
                    to={`/leases/${lease.id}`}
                    className="flex-1 py-4 text-[10px] font-black border border-slate-200 text-slate-500 hover:border-slate-900 hover:text-slate-900 transition-all uppercase tracking-[0.25em] flex items-center justify-center gap-2 group/btn"
                  >
                    Audit Record
                  </Link>
                  <button 
                    onClick={() => setSelectedLeaseId(lease.id)}
                    className="flex-1 py-4 text-[10px] font-black border border-slate-900 bg-slate-900 text-white hover:bg-slate-800 transition-all uppercase tracking-[0.25em] flex items-center justify-center gap-2 group/btn"
                  >
                    <CreditCard size={14} className="group-hover/btn:scale-110 transition-transform" />
                    Schedule
                  </button>
                </div>
                {lease.status === 'ACTIVE' && (
                  <button 
                    onClick={() => setLeaseToTerminate(lease.id)}
                    className="w-full mt-2 py-3 text-[10px] font-black border border-rose-100 text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition-all uppercase tracking-[0.25em] flex items-center justify-center gap-2"
                  >
                    Terminate Agreement
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ConfirmationModal 
        isOpen={!!leaseToTerminate}
        title="Termination protocol"
        message="Are you sure you want to terminate this agreement immediately? This process is irreversible and will update the end record to the current timestamp."
        confirmLabel="Execute termination"
        onConfirm={() => leaseToTerminate && terminateLease(leaseToTerminate)}
        onCancel={() => setLeaseToTerminate(null)}
      />

      <AnimatePresence>
        {selectedLeaseId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedLeaseId(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.95 }}
              className="relative bg-white w-full max-w-xl shadow-2xl flex flex-col max-h-[85vh] z-10"
            >
              <div className="p-10 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold tracking-tight text-slate-900">Payment Schedule</h3>
                  <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mt-2">Projected Financial Ledger</p>
                </div>
                <button 
                  onClick={() => setSelectedLeaseId(null)}
                  className="w-12 h-12 flex items-center justify-center hover:bg-slate-50 text-slate-400 transition-colors border border-slate-100"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-10 space-y-6">
                {(() => {
                  const lease = leases.find(l => l.id === selectedLeaseId);
                  if (!lease) return null;
                  const schedule = generatePaymentSchedule(lease.startDate, lease.endDate, lease.rentAmount);
                  const prop = properties.find(p => p.id === lease.propertyId);
                  const tenant = tenants.find(t => t.id === lease.tenantId);
                  
                  return (
                    <>
                      <div className="p-6 bg-slate-50 border-l-4 border-slate-900 flex justify-between items-center mb-8">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{prop?.name || 'Asset'}</p>
                          <p className="text-sm font-bold text-slate-900">{tenant?.name || 'Occupant'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Base Rate</p>
                          <p className="text-xl font-black text-slate-900">${lease.rentAmount.toLocaleString()}/mo</p>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        {schedule.length === 0 ? (
                          <div className="text-center py-12 text-slate-400">
                            <p className="text-[10px] font-black uppercase tracking-widest">No valid phases detected</p>
                          </div>
                        ) : (
                          schedule.map((item, i) => (
                            <div key={i} className="flex items-center justify-between p-5 border border-slate-100 hover:border-slate-300 transition-all group/item bg-white">
                              <div className="flex items-center gap-6">
                                <span className="text-[9px] font-black text-slate-300 group-hover/item:text-slate-900 transition-colors w-4">
                                  {(i + 1).toString().padStart(2, '0')}
                                </span>
                                <div>
                                  <p className="text-sm font-bold text-slate-900">{format(item.date, 'MMMM dd, yyyy')}</p>
                                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] mt-1">Scheduled Maturity</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-base font-black text-slate-900">${item.amount.toLocaleString()}</p>
                                <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mt-1">Status: Open</p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
              
              <div className="p-10 bg-slate-50 border-t border-slate-100">
                <button 
                  onClick={() => setSelectedLeaseId(null)}
                  className="w-full bg-slate-900 text-white py-5 text-[10px] font-black uppercase tracking-[0.3em] hover:bg-black transition-all active:scale-95"
                >
                  DISMISS LEDGER
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Payments() {
  const { payments, recordPayment, addPayment } = usePaymentData();
  const { properties } = usePropertyData();
  const { tenants } = useTenantData();
  const { leases } = useLeaseData();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    leaseId: '',
    amount: 0,
    dueDate: new Date().toISOString().split('T')[0]
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const lease = leases.find(l => l.id === formData.leaseId);
    if (!lease) return;

    addPayment({
      leaseId: lease.id,
      propertyId: lease.propertyId,
      tenantId: lease.tenantId,
      amount: formData.amount,
      dueDate: formData.dueDate,
      paidAt: null
    });
    setShowForm(false);
    setFormData({ leaseId: '', amount: 0, dueDate: new Date().toISOString().split('T')[0] });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight">Financial Ledger</h2>
          <p className="text-slate-500 text-sm"> Rent collection cycle and reconciliation.</p>
        </div>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="bg-slate-900 text-white px-8 py-3 text-[10px] font-black uppercase tracking-[0.2em] active:scale-95 transition-all shadow-xl shadow-slate-200"
        >
          {showForm ? 'DISCARD ENTRY' : 'NEW TRANSACTION'}
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <form onSubmit={handleSubmit} className="glass-card p-10 space-y-8 bg-white border-t-4 border-brand-primary">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Target Lease Agreement</label>
                   <select 
                     required 
                     value={formData.leaseId} 
                     onChange={e => {
                       const lease = leases.find(l => l.id === e.target.value);
                       setFormData({
                         ...formData, 
                         leaseId: e.target.value,
                         amount: lease ? lease.rentAmount : 0
                       });
                     }}
                     className="w-full px-4 py-3 border border-slate-200 text-sm focus:border-brand-primary focus:outline-none bg-white font-bold"
                   >
                     <option value="">Select Protocol...</option>
                     {leases.filter(l => l.status === 'ACTIVE').map(lease => {
                       const p = properties.find(prop => prop.id === lease.propertyId);
                       const t = tenants.find(ten => ten.id === lease.tenantId);
                       return (
                         <option key={lease.id} value={lease.id}>
                           {p?.name} - {t?.name} (${lease.rentAmount}/mo)
                         </option>
                       );
                     })}
                   </select>
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Value (USD)</label>
                  <input 
                    required 
                    type="number" 
                    value={formData.amount} 
                    onChange={e => setFormData({...formData, amount: parseFloat(e.target.value)})} 
                    className="w-full px-4 py-3 border border-slate-200 text-sm font-mono focus:border-brand-primary focus:outline-none" 
                  />
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Maturity Date</label>
                  <input 
                    required 
                    type="date" 
                    value={formData.dueDate} 
                    onChange={e => setFormData({...formData, dueDate: e.target.value})} 
                    className="w-full px-4 py-3 border border-slate-200 text-sm font-mono focus:border-brand-primary focus:outline-none" 
                  />
                  {new Date(formData.dueDate) < new Date() && (
                    <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest mt-1">
                      ⚠️ DATE IN RETROSPECT: Record will initialize as OVERDUE
                    </p>
                  )}
                </div>
              </div>
              <button type="submit" className="bg-slate-900 text-white px-8 py-4 text-[10px] font-black uppercase tracking-[0.3em] active:scale-95 transition-all">
                COMMIT TRANSACTION
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="glass-card overflow-hidden bg-white">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-[10px] font-black text-slate-400 tracking-[0.2em] uppercase">
            <tr>
              <th className="px-8 py-5">Sync State</th>
              <th className="px-8 py-5">Source / Entity</th>
              <th className="px-8 py-5">Value (USD)</th>
              <th className="px-8 py-5">Phase End</th>
              <th className="px-8 py-5 text-right">Protocol</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payments.map((payment) => {
              const prop = properties.find(p => p.id === payment.propertyId);
              const tenant = tenants.find(t => t.id === payment.tenantId);
              return (
                <tr key={payment.id} className="hover:bg-slate-100 transition-colors">
                  <td className="px-8 py-6">
                    <span className={cn(
                      "px-3 py-1 text-[9px] font-black uppercase tracking-tighter border",
                      payment.status === 'PAID' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                      payment.status === 'OVERDUE' ? "bg-rose-50 text-rose-700 border-rose-100" :
                      "bg-orange-50 text-orange-700 border-orange-100"
                    )}>
                      {payment.status}
                    </span>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-900 tracking-tight">{prop?.name || 'Unknown Asset'}</span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{tenant?.name || 'Resident Unknown'}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6 mono-data font-black text-slate-900 text-lg tracking-tighter">${payment.amount.toLocaleString()}</td>
                  <td className="px-8 py-6 text-slate-400 font-medium text-sm">
                    {format(new Date(payment.dueDate), 'MMM dd, yyyy')}
                  </td>
                  <td className="px-8 py-6 text-right">
                    {payment.status === 'PENDING' && (
                      <button 
                        onClick={() => recordPayment(payment.id)}
                        className="text-[10px] font-black tracking-widest uppercase text-white bg-slate-900 px-6 py-2.5 hover:bg-black transition-all active:scale-95"
                      >
                        RECONCILE
                      </button>
                    )}
                    {payment.status === 'PAID' && (
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-black uppercase text-emerald-600 mb-0.5 tracking-widest" >Verified</span>
                        <span className="text-[10px] uppercase font-mono font-bold text-slate-300 tracking-tighter" >
                          {payment.paidAt ? format(new Date(payment.paidAt), 'dd/MM/yy') : '--'}
                        </span>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LeaseDetail() {
  const { id } = useParams<{ id: string }>();
  const { leases, terminateLease } = useLeaseData();
  const { properties } = usePropertyData();
  const { tenants } = useTenantData();
  const { payments } = usePaymentData();
  const [isTerminating, setIsTerminating] = useState(false);

  const lease = leases.find(l => l.id === id);
  const property = properties.find(p => p?.id === lease?.propertyId);
  const tenant = tenants.find(t => t?.id === lease?.tenantId);
  const leasePayments = payments.filter(p => p.leaseId === id);

  if (!lease) {
    return (
      <div className="py-20 text-center">
        <p className="text-slate-400 font-black uppercase tracking-widest">Lease document not found</p>
        <Link to="/leases" className="text-brand-primary hover:underline mt-4 inline-block font-bold font-mono">BACK TO LEDGER</Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <Link to="/leases" className="text-[10px] font-black text-slate-400 hover:text-slate-900 flex items-center gap-1 uppercase tracking-widest mb-2 transition-colors">
            ← Registry
          </Link>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 uppercase">Lease Protocol {lease.id.slice(-6)}</h2>
          <div className="flex items-center gap-3 mt-2">
            <span className={cn(
              "px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] border",
              lease.status === 'ACTIVE' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
              lease.status === 'TERMINATED' ? "bg-rose-50 text-rose-700 border-rose-100" :
              "bg-slate-100 text-slate-600 border-slate-200"
            )}>
              {lease.status}
            </span>
            <span className="text-slate-400 text-xs font-mono">V_RECORD_SIG: {lease.id}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1 space-y-6">
          <div className="glass-card p-6 bg-white border-t-2 border-slate-900">
             <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-4">Contracting Asset</h4>
             <div className="space-y-1">
               <p className="text-xl font-bold text-slate-900">{property?.name || "UNLINKED ASSET"}</p>
               <p className="text-xs text-slate-500 font-mono italic">{property?.address}</p>
             </div>
             <Link to={`/properties/${property?.id}`} className="mt-6 block w-full text-center py-2 text-[9px] font-black bg-slate-50 text-slate-600 hover:bg-slate-900 hover:text-white transition-all uppercase tracking-widest">Inspect Property Record</Link>
          </div>

          <div className="glass-card p-6 bg-white border-t-2 border-slate-900">
             <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-4">Designated Tenant</h4>
             <div className="space-y-1">
               <p className="text-xl font-bold text-slate-900">{tenant?.name || "ANONYMOUS ENTITY"}</p>
               <p className="text-xs text-slate-500 font-mono">{tenant?.email}</p>
             </div>
             <Link to={`/tenants/${tenant?.id}`} className="mt-6 block w-full text-center py-2 text-[9px] font-black bg-slate-50 text-slate-600 hover:bg-slate-900 hover:text-white transition-all uppercase tracking-widest">Inspect Tenant Bio</Link>
          </div>
        </div>

        <div className="md:col-span-2 space-y-8">
          <div className="grid grid-cols-2 gap-4">
             <div className="p-6 bg-white border border-slate-100">
               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Fiscal Commitment</p>
               <p className="text-3xl font-black text-slate-900">${lease.rentAmount.toLocaleString()}<span className="text-xs text-slate-400 ml-1 font-mono">/MO</span></p>
             </div>
             <div className="p-6 bg-white border border-slate-100">
               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Temporal Range</p>
               <p className="text-sm font-bold text-slate-900 font-mono uppercase">
                 {format(new Date(lease.startDate), 'MMM dd, yy')} → {format(new Date(lease.endDate), 'MMM dd, yy')}
               </p>
             </div>
          </div>

          <div className="glass-card overflow-hidden bg-white">
            <div className="px-8 py-5 border-b border-brand-border bg-slate-50 flex items-center justify-between">
              <h4 className="font-black text-xs uppercase tracking-tighter text-slate-400">Transaction Audit Trail</h4>
              <button className="text-[9px] font-black text-brand-primary uppercase tracking-widest hover:underline">Export CSV</button>
            </div>
            <table className="w-full text-left">
              <thead className="text-[9px] font-black text-slate-300 tracking-[0.2em] uppercase border-b border-slate-100">
                <tr>
                  <th className="px-8 py-4">Verification</th>
                  <th className="px-8 py-4">Deadline</th>
                  <th className="px-8 py-4 text-right">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 font-mono">
                {leasePayments.map(payment => (
                  <tr key={payment.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-5">
                      <span className={cn(
                        "px-2 py-0.5 text-[8px] font-black uppercase tracking-tighter border",
                        payment.status === 'PAID' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                        payment.status === 'OVERDUE' ? "bg-rose-50 text-rose-700 border-rose-100" :
                        "bg-orange-50 text-orange-700 border-orange-100"
                      )}>
                        {payment.status}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-xs font-bold text-slate-500">
                      {format(new Date(payment.dueDate), 'yyyy.MM.dd')}
                    </td>
                    <td className="px-8 py-5 text-right font-black text-slate-900">
                      ${payment.amount.toLocaleString()}.00
                    </td>
                  </tr>
                ))}
                {leasePayments.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-8 py-12 text-center text-slate-300 text-[10px] font-black uppercase tracking-widest">
                      Zero transaction nodes recorded for this protocol.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          {lease.status === 'ACTIVE' && (
            <div className="pt-6">
              <button 
                onClick={() => setIsTerminating(true)}
                className="w-full py-4 text-[11px] font-black bg-rose-600 text-white hover:bg-rose-700 transition-all uppercase tracking-[0.4em] shadow-xl shadow-rose-200"
              >
                Execute Global Termination
              </button>
            </div>
          )}

          <ConfirmationModal 
            isOpen={isTerminating}
            title="Emergency Abort"
            message={`You are about to terminate Lease Protocol ${lease.id.slice(-6)}. This action will cease all active billing periods and lock the agreement history.`}
            confirmLabel="Confirm Abort"
            onConfirm={() => terminateLease(lease.id)}
            onCancel={() => setIsTerminating(false)}
          />
        </div>
      </div>
    </div>
  );
}

function Reports() {
  const { payments } = usePaymentData();

  // Aggregate by month for trends
  const monthlyData = payments.reduce((acc: any, p) => {
    const month = format(new Date(p.dueDate), 'yyyy-MM');
    if (!acc[month]) acc[month] = { collected: 0, overdue: 0, pending: 0 };
    if (p.status === 'PAID') acc[month].collected += p.amount;
    else if (p.status === 'OVERDUE') acc[month].overdue += p.amount;
    else acc[month].pending += p.amount;
    return acc;
  }, {});

  const sortedMonths = Object.keys(monthlyData).sort();
  
  const currentMonthKey = format(new Date(), 'yyyy-MM');
  const currentMonth = monthlyData[currentMonthKey] || { collected: 0, overdue: 0, pending: 0 };

  const exportCSV = () => {
    const headers = ['Month', 'Collected', 'Overdue', 'Pending'];
    const rows = sortedMonths.map(m => [
      m,
      monthlyData[m].collected,
      monthlyData[m].overdue,
      monthlyData[m].pending
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `fiscal_report_${format(new Date(), 'yyyy_MM_dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text('FISCAL PERFORMANCE REPORT', 14, 22);
    doc.setFontSize(10);
    doc.text(`Generated on: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 14, 30);
    doc.text(`System Reference: PROPSYNC-CORE-MOD-9`, 14, 35);

    autoTable(doc, {
      startY: 45,
      head: [['MONTH', 'COLLECTED (USD)', 'OVERDUE (USD)', 'PENDING (USD)']],
      body: sortedMonths.map(m => [
        m,
        `$${monthlyData[m].collected.toLocaleString()}`,
        `$${monthlyData[m].overdue.toLocaleString()}`,
        `$${monthlyData[m].pending.toLocaleString()}`
      ]),
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] }
    });

    doc.save(`fiscal_report_${format(new Date(), 'yyyy_MM_dd')}.pdf`);
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-black tracking-tighter text-slate-900 uppercase">Fiscal Intelligence</h2>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Aggregate revenue audit and collection trends.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={exportCSV} className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 text-[10px] font-black uppercase tracking-widest hover:border-slate-900 transition-all active:scale-95 cursor-pointer">
            <FileJson size={14} />
            Export CSV
          </button>
          <button onClick={exportPDF} className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-slate-200 active:scale-95 cursor-pointer">
            <Download size={14} />
            Export PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-8 bg-white border-t-4 border-emerald-500">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Month to Date (Paid)</p>
          <h3 className="text-4xl font-black text-slate-900">${currentMonth.collected.toLocaleString()}</h3>
          <p className="text-[10px] font-bold text-emerald-600 mt-2 uppercase tracking-tighter italic">Verified Transactions</p>
        </div>
        <div className="glass-card p-8 bg-white border-t-4 border-rose-500">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Aggregate Arrears</p>
          <h3 className="text-4xl font-black text-rose-600">${currentMonth.overdue.toLocaleString()}</h3>
          <p className="text-[10px] font-bold text-rose-400 mt-2 uppercase tracking-tighter italic">Breach of Protocol</p>
        </div>
        <div className="glass-card p-8 bg-white border-t-4 border-orange-500">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Expected Yield</p>
          <h3 className="text-4xl font-black text-orange-600">${currentMonth.pending.toLocaleString()}</h3>
          <p className="text-[10px] font-bold text-orange-400 mt-2 uppercase tracking-tighter italic">Pending Synchronization</p>
        </div>
      </div>

      <div className="glass-card overflow-hidden bg-white">
        <div className="px-8 py-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Monthly Performance Ledger</h4>
        </div>
        <div className="p-0 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-white text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] border-b border-slate-100">
              <tr>
                <th className="px-8 py-5">Period</th>
                <th className="px-8 py-5">Collected</th>
                <th className="px-8 py-5">Overdue</th>
                <th className="px-8 py-5">Pending</th>
                <th className="px-8 py-5 text-right">Performance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[...sortedMonths].reverse().map(month => {
                const data = monthlyData[month];
                const total = data.collected + data.overdue + data.pending;
                const ratio = total > 0 ? (data.collected / total) : 0;
                
                return (
                  <tr key={month} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-6 font-mono text-sm font-bold text-slate-900">{month}</td>
                    <td className="px-8 py-6 font-mono text-sm text-emerald-600 font-black">${data.collected.toLocaleString()}</td>
                    <td className="px-8 py-6 font-mono text-sm text-rose-500 font-bold">${data.overdue.toLocaleString()}</td>
                    <td className="px-8 py-6 font-mono text-sm text-slate-400">${data.pending.toLocaleString()}</td>
                    <td className="px-8 py-6 text-right">
                       <div className="inline-flex items-center gap-3">
                         <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                           <div className="h-full bg-emerald-500" style={{ width: `${ratio * 100}%` }}></div>
                         </div>
                         <span className="text-[10px] font-black text-slate-900">{(ratio * 100).toFixed(0)}%</span>
                       </div>
                    </td>
                  </tr>
                );
              })}
              {sortedMonths.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center text-slate-300 text-[10px] font-black uppercase tracking-[0.3em]">
                    Zero Fiscal Activity Recorded in Node
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

// --- Main App Component ---

function MainLayout() {
  const { user, login } = useAuth();
  
  if (!user) {
    return (
      <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center p-6 text-center font-sans">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full glass-card p-16 space-y-10 bg-white"
        >
          <div className="w-16 h-16 bg-brand-primary mx-auto flex items-center justify-center text-white">
            <div className="w-8 h-8 border-4 border-white"></div>
          </div>
          <div className="space-y-3">
            <h1 className="text-2xl font-black tracking-[0.2em] uppercase">PropSync</h1>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest leading-loose max-w-[240px] mx-auto">Geometric Precision in Asset Management.</p>
          </div>
          <button 
            onClick={login}
            className="w-full bg-slate-900 text-white py-4 font-black text-xs uppercase tracking-[0.3em] hover:bg-black transition-all active:scale-95 flex items-center justify-center gap-3"
          >
            <LogIn size={18} />
            AUTHORIZE ACCESS
          </button>
          <div className="pt-4 flex items-center justify-center gap-4">
            <div className="h-px w-8 bg-slate-200"></div>
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Secured Node</p>
            <div className="h-px w-8 bg-slate-200"></div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-10 max-w-7xl mx-auto w-full overflow-y-auto bg-slate-50">
          <AnimatePresence mode="wait">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/properties" element={<Properties />} />
              <Route path="/properties/:id" element={<PropertyDetail />} />
              <Route path="/tenants" element={<Tenants />} />
              <Route path="/tenants/:id" element={<TenantDetail />} />
              <Route path="/leases" element={<Leases />} />
              <Route path="/leases/:id" element={<LeaseDetail />} />
              <Route path="/payments" element={<Payments />} />
              <Route path="/reports" element={<Reports />} />
            </Routes>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <MainLayout />
      </Router>
    </AuthProvider>
  );
}
