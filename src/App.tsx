/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  TrendingDown, 
  TrendingUp, 
  Coins, 
  Zap, 
  Settings, 
  History, 
  Plus, 
  Flame,
  Trophy,
  ArrowLeft,
  Info
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { format, subDays, startOfDay, isSameDay, parseISO } from 'date-fns';
import { cn } from './lib/utils';

// --- Types ---

interface UsageEvent {
  id: string;
  timestamp: string;
  type: 'puff' | 'cigarette';
  cost: number;
}

interface UserSettings {
  monthlyBudget: number | string;
  puffsPerDayBaseline: number | string;
  cigarettesPerDayBaseline: number | string;
  currency: string;
  manualPuffPrice?: number | string;
  manualCigarettePrice?: number | string;
}

// --- Constants ---

const STORAGE_KEY = 'quit_hero_data';
const SETTINGS_KEY = 'quit_hero_settings';

// --- Helper Functions ---

const getInitialSettings = (): UserSettings => {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error("Failed to parse settings", e);
  }
  return {
    monthlyBudget: 150,
    puffsPerDayBaseline: 200,
    cigarettesPerDayBaseline: 10,
    currency: '€',
    manualPuffPrice: 0.04,
    manualCigarettePrice: 0.31
  };
};

const getInitialEvents = (): UsageEvent[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error("Failed to parse events", e);
  }
  return [];
};

// --- Components ---

export default function App() {
  const [settings, setSettings] = useState<UserSettings>(getInitialSettings);
  const [events, setEvents] = useState<UsageEvent[]>(getInitialEvents);
  const [isSetup, setIsSetup] = useState(!localStorage.getItem(SETTINGS_KEY));
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Persistence
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  }, [events]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  // Calculations
  const dailyBudget = useMemo(() => Number(settings.monthlyBudget) / 30, [settings.monthlyBudget]);
  
  // 16 hours active day as requested
  const activeHoursPerDay = 16;
  const hourlyRate = useMemo(() => dailyBudget / activeHoursPerDay, [dailyBudget]);

  // Cost per unit based on baseline
  const totalUnitsPerDay = useMemo(() => 
    Math.max(1, Number(settings.puffsPerDayBaseline) + (Number(settings.cigarettesPerDayBaseline) * 10)), 
    [settings.puffsPerDayBaseline, settings.cigarettesPerDayBaseline]
  );
  
  const costPerPuff = useMemo(() => {
    const manual = Number(settings.manualPuffPrice);
    if (settings.manualPuffPrice !== undefined && manual > 0) {
      return manual;
    }
    return dailyBudget / totalUnitsPerDay;
  }, [dailyBudget, totalUnitsPerDay, settings.manualPuffPrice]);

  const costPerCigarette = useMemo(() => {
    const manual = Number(settings.manualCigarettePrice);
    if (settings.manualCigarettePrice !== undefined && manual > 0) {
      return manual;
    }
    return costPerPuff * 10;
  }, [costPerPuff, settings.manualCigarettePrice]);

  const todayEvents = useMemo(() => 
    events.filter(e => isSameDay(parseISO(e.timestamp), new Date())),
    [events]
  );

  const todaySpent = useMemo(() => 
    todayEvents.reduce((acc, e) => acc + e.cost, 0),
    [todayEvents]
  );

  const todayStats = useMemo(() => {
    return {
      puffs: todayEvents.filter(e => e.type === 'puff').length,
      cigarettes: todayEvents.filter(e => e.type === 'cigarette').length
    };
  }, [todayEvents]);

  const totalStats = useMemo(() => {
    return {
      puffs: events.filter(e => e.type === 'puff').length,
      cigarettes: events.filter(e => e.type === 'cigarette').length
    };
  }, [events]);

  const liveBalance = useMemo(() => Number(dailyBudget) - todaySpent, [dailyBudget, todaySpent]);

  const totalSaved = useMemo(() => {
    if (events.length === 0) return 0;
    
    // Group events by day to calculate past days savings
    const eventsByDay: { [key: string]: number } = {};
    events.forEach(e => {
      const dayKey = format(parseISO(e.timestamp), 'yyyy-MM-dd');
      eventsByDay[dayKey] = (eventsByDay[dayKey] || 0) + e.cost;
    });

    const todayKey = format(new Date(), 'yyyy-MM-dd');
    const pastDays = Object.keys(eventsByDay).filter(day => day < todayKey);
    
    // Sum up (dailyBudget - daySpent) for all past days
    const pastSavings = pastDays.reduce((acc, day) => acc + (dailyBudget - eventsByDay[day]), 0);
    
    // Also account for days where NO events happened (pure savings)
    const firstEventDate = startOfDay(parseISO(events[0].timestamp));
    const todayDate = startOfDay(new Date());
    const totalDaysSinceStart = Math.max(0, Math.floor((todayDate.getTime() - firstEventDate.getTime()) / (1000 * 60 * 60 * 24)));
    
    // If there were days with 0 events, they won't be in pastDays keys
    // Total past days = totalDaysSinceStart
    const daysWithEvents = pastDays.length;
    const daysWithoutEvents = Math.max(0, totalDaysSinceStart - daysWithEvents);
    
    const pastDaysSavings = pastSavings + (daysWithoutEvents * dailyBudget);
    
    // If today's balance is negative, deduct it from total saved immediately
    const currentOverspending = liveBalance < 0 ? liveBalance : 0;
    
    return pastDaysSavings + currentOverspending;
  }, [events, dailyBudget, liveBalance]);

  // Hourly Rate Meter Logic
  const hourlyStatus = useMemo(() => {
    const now = new Date();
    const start = startOfDay(now);
    // Assume active day starts at 08:00
    const wakeupHour = 8;
    const currentHour = now.getHours();
    const hoursActiveSoFar = Math.max(0, Math.min(activeHoursPerDay, currentHour - wakeupHour));
    
    const targetSpentSoFar = hoursActiveSoFar * hourlyRate;
    const diff = targetSpentSoFar - todaySpent;
    
    return {
      diff,
      isSaving: diff >= 0,
      hoursActive: hoursActiveSoFar
    };
  }, [todaySpent, hourlyRate]);

  const level = useMemo(() => {
    const saved = Math.max(0, totalSaved);
    if (saved < 10) return { name: 'Novice', icon: '🌱', next: 10 };
    if (saved < 50) return { name: 'Saver', icon: '💰', next: 50 };
    if (saved < 200) return { name: 'Investor', icon: '📈', next: 200 };
    if (saved < 500) return { name: 'Wealthy', icon: '💎', next: 500 };
    return { name: 'QuitHero Legend', icon: '👑', next: Infinity };
  }, [totalSaved]);

  const addEvent = (type: 'puff' | 'cigarette') => {
    const newEvent: UsageEvent = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      type,
      cost: type === 'puff' ? costPerPuff : costPerCigarette
    };
    setEvents(prev => [...prev, newEvent]);
  };

  const deleteEvent = (id: string) => {
    setEvents(prev => prev.filter(e => e.id !== id));
  };

  // Chart Data
  const chartData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = subDays(new Date(), 6 - i);
      const dayEvents = events.filter(e => isSameDay(parseISO(e.timestamp), date));
      const spent = dayEvents.reduce((acc, e) => acc + e.cost, 0);
      return {
        name: format(date, 'EEE'),
        spent: Number(spent.toFixed(2)),
        budget: Number(dailyBudget.toFixed(2)),
        saved: Number((dailyBudget - spent).toFixed(2))
      };
    });
    return last7Days;
  }, [events, dailyBudget]);

  if (isSetup) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-6 font-sans bg-atmosphere">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full space-y-10 glass rounded-[3rem] p-10 shadow-2xl relative overflow-hidden"
        >
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl" />
          
          <div className="text-center space-y-4 relative">
            <motion.div 
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="inline-flex p-4 bg-emerald-500/10 rounded-[2rem] mb-2 border border-emerald-500/20 shadow-inner"
            >
              <Zap className="w-10 h-10 text-emerald-500" />
            </motion.div>
            <h1 className="text-4xl font-black tracking-tighter">QuitHero</h1>
            <p className="text-gray-400 text-sm font-medium uppercase tracking-widest opacity-70">Initialize your journey</p>
          </div>

          <div className="space-y-8 relative">
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] ml-1">Monthly Budget ({settings.currency})</label>
              <input 
                type="text" 
                inputMode="decimal"
                value={settings.monthlyBudget}
                onChange={e => {
                  const val = e.target.value;
                  if (val === '' || /^\d*\.?\d*$/.test(val)) {
                    setSettings(s => ({ ...s, monthlyBudget: val }));
                  }
                }}
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all placeholder:text-white/10"
                placeholder="0.00"
              />
              <p className="text-[10px] text-gray-500 font-medium ml-1">Current monthly nicotine expenditure</p>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] ml-1">Daily Puffs</label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  value={settings.puffsPerDayBaseline}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === '' || /^\d*$/.test(val)) {
                      setSettings(s => ({ ...s, puffsPerDayBaseline: val }));
                    }
                  }}
                  className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
                />
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] ml-1">Daily Cigs</label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  value={settings.cigarettesPerDayBaseline}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === '' || /^\d*$/.test(val)) {
                      setSettings(s => ({ ...s, cigarettesPerDayBaseline: val }));
                    }
                  }}
                  className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-white/5 space-y-6">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] text-center">Manual Pricing (Optional)</p>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] ml-1">Puff Price</label>
                  <input 
                    type="text" 
                    inputMode="decimal"
                    value={settings.manualPuffPrice ?? ''}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === '' || /^\d*\.?\d*$/.test(val)) {
                        setSettings(s => ({ ...s, manualPuffPrice: val }));
                      }
                    }}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-xl font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all placeholder:text-white/10"
                    placeholder="Auto"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] ml-1">Cig Price</label>
                  <input 
                    type="text" 
                    inputMode="decimal"
                    value={settings.manualCigarettePrice ?? ''}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === '' || /^\d*\.?\d*$/.test(val)) {
                        setSettings(s => ({ ...s, manualCigarettePrice: val }));
                      }
                    }}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-xl font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all placeholder:text-white/10"
                    placeholder="Auto"
                  />
                </div>
              </div>
            </div>

            <motion.button 
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsSetup(false)}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-black py-5 rounded-2xl transition-all shadow-xl shadow-emerald-500/20 uppercase tracking-widest text-sm"
            >
              Start Journey
            </motion.button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-emerald-500/30 bg-atmosphere">
      {/* Header */}
      <header className="p-6 flex justify-between items-center sticky top-0 bg-[#050505]/40 backdrop-blur-md z-50 border-b border-white/5">
        <div className="flex items-center gap-3">
          <motion.div 
            whileHover={{ scale: 1.05, rotate: 5 }}
            className="w-11 h-11 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20"
          >
            <Zap className="w-6 h-6 text-black fill-current" />
          </motion.div>
          <div>
            <h2 className="font-bold text-xl tracking-tight leading-none">QuitHero</h2>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] text-emerald-500/80 font-mono uppercase tracking-[0.2em]">Live Session</span>
            </div>
          </div>
        </div>
        <div className="flex gap-3 items-center">
          <div className="hidden sm:flex flex-col items-end mr-2">
            <span className="text-[10px] text-gray-500 font-mono uppercase tracking-widest opacity-60">Current Rank</span>
            <span className="font-bold text-sm text-emerald-400 flex items-center gap-1.5">
              <span>{level.icon}</span>
              <span className="tracking-tight">{level.name}</span>
            </span>
          </div>
          <div className="flex bg-white/5 p-1 rounded-full border border-white/10">
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className="p-2.5 hover:bg-white/10 rounded-full transition-all active:scale-90"
            >
              <History className="w-5 h-5 text-gray-300" />
            </button>
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="p-2.5 hover:bg-white/10 rounded-full transition-all active:scale-90"
            >
              <Settings className="w-5 h-5 text-gray-300" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-6 space-y-10 pb-32">
        {/* Action Buttons */}
        <section className="grid grid-cols-2 gap-6">
          <motion.button
            whileHover={{ y: -4, scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => addEvent('puff')}
            className="relative h-44 glass rounded-[2rem] flex flex-col items-center justify-center gap-4 group overflow-hidden transition-all duration-300 hover:border-emerald-500/30"
          >
            <div className="absolute top-4 right-4 glass-dark px-3 py-1 rounded-lg border border-white/10">
              <span className="text-xs font-bold text-emerald-400 font-mono">{todayStats.puffs}</span>
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/0 to-emerald-500/5 group-hover:opacity-100 transition-opacity" />
            <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-500 group-hover:bg-emerald-500/20 shadow-inner">
              <Zap className="w-9 h-9 text-emerald-500" />
            </div>
            <div className="text-center space-y-1">
              <p className="font-bold text-xl tracking-tight">PUFF</p>
              <p className="text-[11px] font-mono text-gray-500 tracking-wider">-{costPerPuff.toFixed(2)}{settings.currency}</p>
            </div>
          </motion.button>

          <motion.button
            whileHover={{ y: -4, scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => addEvent('cigarette')}
            className="relative h-44 glass rounded-[2rem] flex flex-col items-center justify-center gap-4 group overflow-hidden transition-all duration-300 hover:border-rose-500/30"
          >
            <div className="absolute top-4 right-4 glass-dark px-3 py-1 rounded-lg border border-white/10">
              <span className="text-xs font-bold text-rose-400 font-mono">{todayStats.cigarettes}</span>
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-rose-500/0 to-rose-500/5 group-hover:opacity-100 transition-opacity" />
            <div className="w-16 h-16 bg-rose-500/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-500 group-hover:bg-rose-500/20 shadow-inner">
              <Flame className="w-9 h-9 text-rose-500" />
            </div>
            <div className="text-center space-y-1">
              <p className="font-bold text-xl tracking-tight">CIGARETTE</p>
              <p className="text-[11px] font-mono text-gray-500 tracking-wider">-{costPerCigarette.toFixed(2)}{settings.currency}</p>
            </div>
          </motion.button>
        </section>

        {/* Main Stats Card */}
        <section className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500/30 to-cyan-500/30 rounded-[2.5rem] blur-xl opacity-0 group-hover:opacity-100 transition duration-1000"></div>
          <div className="relative glass rounded-[2.5rem] p-10 space-y-8 overflow-hidden">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-[11px] font-mono text-gray-400 uppercase tracking-[0.2em] opacity-70">Live Balance Today</p>
                <div className="flex items-baseline gap-2">
                  <motion.h1 
                    key={events.length}
                    initial={{ opacity: 0.8, scale: 0.9, y: 10 }}
                    animate={{ 
                      opacity: 1, 
                      scale: 1, 
                      y: 0,
                      transition: { type: "spring", damping: 12, stiffness: 200 }
                    }}
                    className={cn(
                      "text-7xl font-black tracking-tighter text-glow-emerald",
                      liveBalance >= 0 ? "text-emerald-400" : "text-rose-500 text-glow-rose"
                    )}
                  >
                    {liveBalance >= 0 ? '+' : ''}{liveBalance.toFixed(2)}
                    <span className="text-3xl ml-2 font-light opacity-50">{settings.currency}</span>
                  </motion.h1>
                </div>
              </div>
              <motion.div 
                animate={{ rotate: [0, 10, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="bg-emerald-500/10 p-4 rounded-2xl border border-emerald-500/20"
              >
                <Coins className="w-7 h-7 text-emerald-500" />
              </motion.div>
            </div>

            {/* Hourly Rate Meter */}
            <div className="glass-dark rounded-2xl p-4 border border-white/5 space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-2 h-2 rounded-full animate-pulse",
                    hourlyStatus.isSaving ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"
                  )} />
                  <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Hourly Pace ({hourlyStatus.hoursActive}h active)</span>
                </div>
                <span className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-md",
                  hourlyStatus.isSaving ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                )}>
                  {hourlyStatus.isSaving ? 'SAVING SIDE' : 'OVERSPENDING'}
                </span>
              </div>
              <div className="flex justify-between items-end">
                <div className="space-y-0.5">
                  <p className="text-[9px] text-gray-500 uppercase font-bold">Target Pace</p>
                  <p className="text-sm font-mono font-bold text-gray-300">{hourlyRate.toFixed(2)}{settings.currency}/hr</p>
                </div>
                <div className="text-right space-y-0.5">
                  <p className="text-[9px] text-gray-500 uppercase font-bold">Current Diff</p>
                  <p className={cn(
                    "text-sm font-mono font-bold",
                    hourlyStatus.isSaving ? "text-emerald-400" : "text-rose-500"
                  )}>
                    {hourlyStatus.isSaving ? '+' : ''}{hourlyStatus.diff.toFixed(2)}{settings.currency}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 pt-8 border-t border-white/10">
              <div className="space-y-1">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold opacity-60">Total Saved</p>
                <p className="text-2xl font-bold text-white tracking-tight">{totalSaved.toFixed(2)}{settings.currency}</p>
              </div>
              <div className="space-y-1 text-right">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold opacity-60">Today Spent</p>
                <p className="text-2xl font-bold text-rose-500 tracking-tight">{todaySpent.toFixed(2)}{settings.currency}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 pt-6 border-t border-white/10">
              <div className="space-y-1">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold opacity-60">Lifetime Puffs</p>
                <p className="text-xl font-bold text-emerald-500/90 tracking-tight">{totalStats.puffs}</p>
              </div>
              <div className="space-y-1 text-right">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold opacity-60">Lifetime Cigs</p>
                <p className="text-xl font-bold text-rose-500/90 tracking-tight">{totalStats.cigarettes}</p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-3">
              <div className="flex justify-between text-[11px] font-mono text-gray-400 opacity-70">
                <span className="uppercase tracking-wider">DAILY LIMIT: {dailyBudget.toFixed(2)}{settings.currency}</span>
                <span className="font-bold">{((todaySpent / dailyBudget) * 100).toFixed(0)}%</span>
              </div>
              <div className="h-4 bg-black/40 rounded-full overflow-hidden border border-white/5 p-1">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (todaySpent / dailyBudget) * 100)}%` }}
                  className={cn(
                    "h-full rounded-full transition-colors duration-700 shadow-[0_0_15px_rgba(16,185,129,0.2)]",
                    (todaySpent / dailyBudget) > 0.8 ? "bg-gradient-to-r from-rose-500 to-orange-500" : "bg-gradient-to-r from-emerald-500 to-cyan-500"
                  )}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Chart Section */}
        <section className="glass rounded-[2.5rem] p-8 space-y-6">
          <div className="flex justify-between items-center">
            <div className="space-y-1">
              <h3 className="font-bold text-sm uppercase tracking-[0.2em] text-gray-400 opacity-80">Performance Analysis</h3>
              <p className="text-[10px] text-gray-500 font-mono">LAST 7 DAYS ACTIVITY</p>
            </div>
            <div className="flex gap-5 text-[10px] font-mono font-bold">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                <span className="opacity-70">SAVED</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 bg-rose-500 rounded-full shadow-[0_0_8px_rgba(244,63,94,0.4)]" />
                <span className="opacity-70">SPENT</span>
              </div>
            </div>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorSaved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  stroke="rgba(255,255,255,0.3)" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  dy={10}
                />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(10,10,10,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', backdropFilter: 'blur(10px)', fontSize: '12px' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="saved" 
                  stroke="#10b981" 
                  fillOpacity={1} 
                  fill="url(#colorSaved)" 
                  strokeWidth={4}
                  animationDuration={2000}
                />
                <Area 
                  type="monotone" 
                  dataKey="spent" 
                  stroke="#f43f5e" 
                  fill="transparent" 
                  strokeWidth={2}
                  strokeDasharray="6 6"
                  animationDuration={2000}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Tips / Motivation */}
        <section className="glass-dark border border-emerald-500/20 rounded-[2rem] p-6 flex gap-6 items-center">
          <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center shrink-0 border border-emerald-500/20 shadow-inner">
            <Trophy className="w-7 h-7 text-emerald-500" />
          </div>
          <div className="flex-1 space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-sm font-bold text-emerald-400 tracking-tight">Next Milestone: {level.next}{settings.currency}</p>
              <p className="text-[11px] font-mono text-gray-400 font-bold">{((totalSaved / level.next) * 100).toFixed(0)}%</p>
            </div>
            <div className="h-2 bg-black/40 rounded-full overflow-hidden border border-white/5">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (totalSaved / level.next) * 100)}%` }}
                className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
              />
            </div>
            <p className="text-[10px] text-gray-500 uppercase tracking-[0.15em] font-medium">Keep saving to reach the next rank!</p>
          </div>
        </section>
      </main>

      {/* History Drawer */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60]"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 h-[85vh] glass rounded-t-[3.5rem] z-[70] p-10 overflow-y-auto shadow-[0_-20px_50px_rgba(0,0,0,0.5)]"
            >
              <div className="flex justify-between items-center mb-10">
                <div className="space-y-1">
                  <h2 className="text-3xl font-black tracking-tighter">Usage History</h2>
                  <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">Review your activity</p>
                </div>
                <button 
                  onClick={() => setShowHistory(false)}
                  className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 transition-all active:scale-90"
                >
                  <ArrowLeft className="w-6 h-6 text-gray-300" />
                </button>
              </div>

              <div className="space-y-4">
                {events.length === 0 ? (
                  <div className="text-center py-32 space-y-4">
                    <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mx-auto border border-white/5 opacity-20">
                      <History className="w-10 h-10" />
                    </div>
                    <p className="text-gray-500 font-medium">No activity recorded yet.</p>
                  </div>
                ) : (
                  [...events].reverse().map(event => (
                    <motion.div 
                      layout
                      key={event.id} 
                      className="flex items-center justify-between p-5 glass-dark rounded-3xl border border-white/5 hover:border-white/10 transition-colors group"
                    >
                      <div className="flex items-center gap-5">
                        <div className={cn(
                          "w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner",
                          event.type === 'puff' ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                        )}>
                          {event.type === 'puff' ? <Zap className="w-6 h-6" /> : <Flame className="w-6 h-6" />}
                        </div>
                        <div>
                          <p className="font-bold text-lg tracking-tight capitalize">{event.type}</p>
                          <p className="text-[11px] font-mono text-gray-500 uppercase tracking-wider">{format(parseISO(event.timestamp), 'MMM d, HH:mm')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <p className="font-mono font-bold text-rose-500 text-lg">-{event.cost.toFixed(2)}{settings.currency}</p>
                        <button 
                          onClick={() => deleteEvent(event.id)}
                          className="p-2.5 text-gray-600 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Plus className="w-5 h-5 rotate-45" />
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Settings Drawer */}
      <AnimatePresence>
        {showSettings && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60]"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed inset-y-0 right-0 w-full max-w-md glass z-[70] p-10 overflow-y-auto shadow-[-20px_0_50px_rgba(0,0,0,0.5)]"
            >
              <div className="flex justify-between items-center mb-12">
                <div className="space-y-1">
                  <h2 className="text-3xl font-black tracking-tighter">Settings</h2>
                  <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">Customize your experience</p>
                </div>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 transition-all active:scale-90"
                >
                  <ArrowLeft className="w-6 h-6 text-gray-300 rotate-180" />
                </button>
              </div>

              <div className="space-y-10">
                <div className="space-y-4">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] ml-1">Monthly Budget</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      inputMode="decimal"
                      value={settings.monthlyBudget}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
                          setSettings(s => ({ ...s, monthlyBudget: val }));
                        }
                      }}
                      className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
                    />
                    <span className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-500 font-bold">{settings.currency}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] ml-1">Daily Puffs</label>
                    <input 
                      type="text" 
                      inputMode="numeric"
                      value={settings.puffsPerDayBaseline}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === '' || /^\d*$/.test(val)) {
                          setSettings(s => ({ ...s, puffsPerDayBaseline: val }));
                        }
                      }}
                      className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
                    />
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] ml-1">Daily Cigs</label>
                    <input 
                      type="text" 
                      inputMode="numeric"
                      value={settings.cigarettesPerDayBaseline}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === '' || /^\d*$/.test(val)) {
                          setSettings(s => ({ ...s, cigarettesPerDayBaseline: val }));
                        }
                      }}
                      className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5 space-y-6">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] text-center">Manual Pricing (Optional)</p>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] ml-1">Puff Price</label>
                      <input 
                        type="text" 
                        inputMode="decimal"
                        value={settings.manualPuffPrice ?? ''}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === '' || /^\d*\.?\d*$/.test(val)) {
                            setSettings(s => ({ ...s, manualPuffPrice: val }));
                          }
                        }}
                        className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-xl font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all placeholder:text-white/10"
                        placeholder="Auto"
                      />
                    </div>
                    <div className="space-y-4">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] ml-1">Cig Price</label>
                      <input 
                        type="text" 
                        inputMode="decimal"
                        value={settings.manualCigarettePrice ?? ''}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === '' || /^\d*\.?\d*$/.test(val)) {
                            setSettings(s => ({ ...s, manualCigarettePrice: val }));
                          }
                        }}
                        className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-xl font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all placeholder:text-white/10"
                        placeholder="Auto"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-10 border-t border-white/10">
                  <button 
                    onClick={() => {
                      if (confirm('Are you sure you want to reset all data? This cannot be undone.')) {
                        setEvents([]);
                        localStorage.removeItem(STORAGE_KEY);
                      }
                    }}
                    className="w-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-bold py-5 rounded-2xl border border-rose-500/20 transition-all uppercase tracking-widest text-xs"
                  >
                    Reset All Data
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
