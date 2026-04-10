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
  monthlyBudget: number;
  puffsPerDayBaseline: number;
  cigarettesPerDayBaseline: number;
  currency: string;
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
    currency: '€'
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
  const dailyBudget = useMemo(() => settings.monthlyBudget / 30, [settings.monthlyBudget]);
  const hourlyBudget = useMemo(() => dailyBudget / 24, [dailyBudget]);
  const secondBudget = useMemo(() => hourlyBudget / 3600, [hourlyBudget]);

  // Cost per unit based on baseline
  const totalUnitsPerDay = useMemo(() => 
    Math.max(1, settings.puffsPerDayBaseline + (settings.cigarettesPerDayBaseline * 10)), 
    [settings]
  );
  
  const costPerPuff = useMemo(() => dailyBudget / totalUnitsPerDay, [dailyBudget, totalUnitsPerDay]);
  const costPerCigarette = useMemo(() => costPerPuff * 10, [costPerPuff]);

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

  const totalSaved = useMemo(() => {
    if (events.length === 0) return 0;
    const firstEvent = parseISO(events[0].timestamp);
    const daysSinceStart = Math.max(1, Math.ceil((new Date().getTime() - firstEvent.getTime()) / (1000 * 60 * 60 * 24)));
    const expectedSpend = daysSinceStart * dailyBudget;
    const actualSpend = events.reduce((acc, e) => acc + e.cost, 0);
    return expectedSpend - actualSpend;
  }, [events, dailyBudget]);

  const level = useMemo(() => {
    const saved = Math.max(0, totalSaved);
    if (saved < 10) return { name: 'Novice', icon: '🌱', next: 10 };
    if (saved < 50) return { name: 'Saver', icon: '💰', next: 50 };
    if (saved < 200) return { name: 'Investor', icon: '📈', next: 200 };
    if (saved < 500) return { name: 'Wealthy', icon: '💎', next: 500 };
    return { name: 'QuitHero Legend', icon: '👑', next: Infinity };
  }, [totalSaved]);

  // Live Savings Ticker
  const [liveSavings, setLiveSavings] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      // Calculate how much "budget" has passed since the start of the day
      const now = new Date();
      const start = startOfDay(now);
      const secondsPassed = (now.getTime() - start.getTime()) / 1000;
      const budgetAccrued = secondsPassed * secondBudget;
      setLiveSavings(budgetAccrued - todaySpent);
    }, 100);
    return () => clearInterval(interval);
  }, [secondBudget, todaySpent]);

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
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full space-y-8 bg-[#141414] p-8 rounded-3xl border border-white/10 shadow-2xl"
        >
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 bg-emerald-500/10 rounded-2xl mb-2">
              <Zap className="w-8 h-8 text-emerald-500" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">QuitHero Setup</h1>
            <p className="text-gray-400">Let's turn your quitting journey into a game.</p>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400 uppercase tracking-wider">Monthly Budget ({settings.currency})</label>
              <input 
                type="number" 
                value={settings.monthlyBudget}
                onChange={e => setSettings(s => ({ ...s, monthlyBudget: Number(e.target.value) }))}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                placeholder="e.g. 150"
              />
              <p className="text-xs text-gray-500">How much do you currently spend on nicotine per month?</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400 uppercase tracking-wider">Daily Puffs</label>
                <input 
                  type="number" 
                  value={settings.puffsPerDayBaseline}
                  onChange={e => setSettings(s => ({ ...s, puffsPerDayBaseline: Number(e.target.value) }))}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400 uppercase tracking-wider">Daily Cigs</label>
                <input 
                  type="number" 
                  value={settings.cigarettesPerDayBaseline}
                  onChange={e => setSettings(s => ({ ...s, cigarettesPerDayBaseline: Number(e.target.value) }))}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                />
              </div>
            </div>

            <button 
              onClick={() => setIsSetup(false)}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-4 rounded-xl transition-all transform active:scale-95 shadow-lg shadow-emerald-500/20"
            >
              START JOURNEY
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="p-6 flex justify-between items-center sticky top-0 bg-[#050505]/80 backdrop-blur-xl z-50 border-bottom border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Zap className="w-6 h-6 text-black fill-current" />
          </div>
          <div>
            <h2 className="font-bold text-lg leading-none">QuitHero</h2>
            <span className="text-[10px] text-emerald-500 font-mono uppercase tracking-widest">Active Session</span>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <div className="hidden sm:flex flex-col items-end mr-2">
            <span className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">Level</span>
            <span className="font-bold text-sm text-emerald-400">{level.icon} {level.name}</span>
          </div>
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className="p-2 hover:bg-white/5 rounded-full transition-colors"
          >
            <History className="w-6 h-6 text-gray-400" />
          </button>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 hover:bg-white/5 rounded-full transition-colors"
          >
            <Settings className="w-6 h-6 text-gray-400" />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-6 space-y-8 pb-32">
        {/* Main Stats Card */}
        <section className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-[2rem] blur opacity-20 group-hover:opacity-30 transition duration-1000"></div>
          <div className="relative bg-[#111] border border-white/10 rounded-[2rem] p-8 space-y-6 overflow-hidden">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="text-xs font-mono text-gray-500 uppercase tracking-widest">Live Balance Today</p>
                <div className="flex items-baseline gap-2">
                  <motion.h1 
                    key={liveSavings.toFixed(2)}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "text-6xl font-black tracking-tighter",
                      liveSavings >= 0 ? "text-emerald-400" : "text-rose-500"
                    )}
                  >
                    {liveSavings >= 0 ? '+' : ''}{liveSavings.toFixed(2)}
                    <span className="text-2xl ml-1">{settings.currency}</span>
                  </motion.h1>
                </div>
              </div>
              <div className="bg-white/5 p-3 rounded-2xl border border-white/10">
                <Coins className="w-6 h-6 text-emerald-500" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
              <div className="space-y-1">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Total Saved</p>
                <p className="text-xl font-bold text-white">{totalSaved.toFixed(2)}{settings.currency}</p>
              </div>
              <div className="space-y-1 text-right">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Today Spent</p>
                <p className="text-xl font-bold text-rose-500">{todaySpent.toFixed(2)}{settings.currency}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
              <div className="space-y-1">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Lifetime Puffs</p>
                <p className="text-lg font-bold text-emerald-500/80">{totalStats.puffs}</p>
              </div>
              <div className="space-y-1 text-right">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Lifetime Cigs</p>
                <p className="text-lg font-bold text-rose-500/80">{totalStats.cigarettes}</p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-mono text-gray-500">
                <span>DAILY LIMIT: {dailyBudget.toFixed(2)}{settings.currency}</span>
                <span>{((todaySpent / dailyBudget) * 100).toFixed(0)}%</span>
              </div>
              <div className="h-3 bg-white/5 rounded-full overflow-hidden border border-white/5">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (todaySpent / dailyBudget) * 100)}%` }}
                  className={cn(
                    "h-full transition-colors duration-500",
                    (todaySpent / dailyBudget) > 0.8 ? "bg-rose-500" : "bg-emerald-500"
                  )}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Action Buttons */}
        <section className="grid grid-cols-2 gap-4">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => addEvent('puff')}
            className="relative h-40 bg-[#141414] border border-white/10 rounded-3xl flex flex-col items-center justify-center gap-3 group overflow-hidden"
          >
            <div className="absolute top-3 right-3 bg-emerald-500/20 px-2 py-0.5 rounded-md border border-emerald-500/20">
              <span className="text-[10px] font-bold text-emerald-500">{todayStats.puffs}</span>
            </div>
            <div className="absolute inset-0 bg-emerald-500/0 group-hover:bg-emerald-500/5 transition-colors" />
            <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <Zap className="w-8 h-8 text-emerald-500" />
            </div>
            <div className="text-center">
              <p className="font-bold text-lg">PUFF</p>
              <p className="text-[10px] font-mono text-gray-500">-{costPerPuff.toFixed(2)}{settings.currency}</p>
            </div>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => addEvent('cigarette')}
            className="relative h-40 bg-[#141414] border border-white/10 rounded-3xl flex flex-col items-center justify-center gap-3 group overflow-hidden"
          >
            <div className="absolute top-3 right-3 bg-rose-500/20 px-2 py-0.5 rounded-md border border-rose-500/20">
              <span className="text-[10px] font-bold text-rose-500">{todayStats.cigarettes}</span>
            </div>
            <div className="absolute inset-0 bg-rose-500/0 group-hover:bg-rose-500/5 transition-colors" />
            <div className="w-14 h-14 bg-rose-500/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <Flame className="w-8 h-8 text-rose-500" />
            </div>
            <div className="text-center">
              <p className="font-bold text-lg">CIGARETTE</p>
              <p className="text-[10px] font-mono text-gray-500">-{costPerCigarette.toFixed(2)}{settings.currency}</p>
            </div>
          </motion.button>
        </section>

        {/* Chart Section */}
        <section className="bg-[#111] border border-white/10 rounded-3xl p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-sm uppercase tracking-widest text-gray-400">Weekly Performance</h3>
            <div className="flex gap-4 text-[10px] font-mono">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                <span>SAVED</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-rose-500 rounded-full" />
                <span>SPENT</span>
              </div>
            </div>
          </div>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorSaved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  stroke="#666" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '12px', fontSize: '12px' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="saved" 
                  stroke="#10b981" 
                  fillOpacity={1} 
                  fill="url(#colorSaved)" 
                  strokeWidth={3}
                />
                <Area 
                  type="monotone" 
                  dataKey="spent" 
                  stroke="#f43f5e" 
                  fill="transparent" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Tips / Motivation */}
        <section className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 flex gap-4 items-center">
          <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center shrink-0">
            <Trophy className="w-6 h-6 text-emerald-500" />
          </div>
          <div className="flex-1">
            <div className="flex justify-between items-center mb-1">
              <p className="text-sm font-bold text-emerald-400">Next Milestone: {level.next}{settings.currency}</p>
              <p className="text-[10px] font-mono text-gray-500">{((totalSaved / level.next) * 100).toFixed(0)}%</p>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (totalSaved / level.next) * 100)}%` }}
                className="h-full bg-emerald-500"
              />
            </div>
            <p className="text-[10px] text-gray-500 mt-2 uppercase tracking-wider">Keep saving to reach the next rank!</p>
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
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-x-0 bottom-0 h-[80vh] bg-[#111] border-t border-white/10 rounded-t-[3rem] z-[70] p-8 overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-bold">Usage History</h2>
                <button 
                  onClick={() => setShowHistory(false)}
                  className="p-2 bg-white/5 rounded-full"
                >
                  <ArrowLeft className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                {events.length === 0 ? (
                  <div className="text-center py-20 text-gray-500">
                    <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>No activity recorded yet.</p>
                  </div>
                ) : (
                  [...events].reverse().map(event => (
                    <div key={event.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center",
                          event.type === 'puff' ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                        )}>
                          {event.type === 'puff' ? <Zap className="w-5 h-5" /> : <Flame className="w-5 h-5" />}
                        </div>
                        <div>
                          <p className="font-bold capitalize">{event.type}</p>
                          <p className="text-[10px] text-gray-500">{format(parseISO(event.timestamp), 'MMM d, HH:mm')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <p className="font-mono text-rose-500">-{event.cost.toFixed(2)}{settings.currency}</p>
                        <button 
                          onClick={() => deleteEvent(event.id)}
                          className="p-2 text-gray-600 hover:text-rose-500 transition-colors"
                        >
                          <Plus className="w-4 h-4 rotate-45" />
                        </button>
                      </div>
                    </div>
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
              className="fixed inset-y-0 right-0 w-full max-w-md bg-[#111] border-l border-white/10 z-[70] p-8 overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-bold">Settings</h2>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-2 bg-white/5 rounded-full"
                >
                  <ArrowLeft className="w-6 h-6 rotate-180" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Monthly Budget</label>
                  <input 
                    type="number" 
                    value={settings.monthlyBudget}
                    onChange={e => setSettings(s => ({ ...s, monthlyBudget: Number(e.target.value) }))}
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Puffs Baseline (Daily)</label>
                  <input 
                    type="number" 
                    value={settings.puffsPerDayBaseline}
                    onChange={e => setSettings(s => ({ ...s, puffsPerDayBaseline: Number(e.target.value) }))}
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Cigarettes Baseline (Daily)</label>
                  <input 
                    type="number" 
                    value={settings.cigarettesPerDayBaseline}
                    onChange={e => setSettings(s => ({ ...s, cigarettesPerDayBaseline: Number(e.target.value) }))}
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
                
                <div className="pt-8 border-t border-white/5">
                  <button 
                    onClick={() => {
                      if(confirm('Are you sure you want to reset all data?')) {
                        setEvents([]);
                        localStorage.removeItem(STORAGE_KEY);
                      }
                    }}
                    className="w-full py-4 text-rose-500 font-bold border border-rose-500/20 rounded-xl hover:bg-rose-500/5 transition-colors"
                  >
                    RESET ALL DATA
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
