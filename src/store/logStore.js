import React, { useState, useEffect, createContext, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';

const STORE_KEY = 'macromate_food_logs_v2';
export const DEFAULT_TARGETS = { calories: 2000, protein: 150, carbs: 200, fat: 67 };

// ── Date helpers ──────────────────────────────────────────────────────────────

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getPreviousDays(n) {
  const days = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return days;
}

export function sumEntries(entries = []) {
  return entries.reduce(
    (acc, e) => ({
      calories: acc.calories + (e.calories || 0),
      protein: acc.protein + (e.protein_g || 0),
      carbs: acc.carbs + (e.carbs_g || 0),
      fat: acc.fat + (e.fat_g || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

// ── Local persistence ─────────────────────────────────────────────────────────

async function loadLocal() {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

async function saveLocal(logs) {
  try { await AsyncStorage.setItem(STORE_KEY, JSON.stringify(logs)); } catch {}
}

// ── Supabase sync ─────────────────────────────────────────────────────────────

// Fetch last 7 days of logs from Supabase and merge into local state.
async function syncFromCloud(userId) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const since = sevenDaysAgo.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('food_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('logged_date', since)
    .order('logged_at', { ascending: true });

  if (error || !data) return null;

  // Reshape cloud rows into { 'YYYY-MM-DD': [entry, …] }
  const byDate = {};
  for (const row of data) {
    const d = row.logged_date;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push({
      id: row.id,
      name: row.name,
      calories: row.calories,
      protein_g: row.protein_g,
      carbs_g: row.carbs_g,
      fat_g: row.fat_g,
      quantity_g: row.quantity_g,
      source: row.source,
      logged_at: row.logged_at,
      meal_type: row.meal_type || 'BREAKFAST',
    });
  }
  return byDate;
}

async function upsertToCloud(userId, date, entry) {
  const { error } = await supabase.from('food_logs').upsert({
    id: entry.id,
    user_id: userId,
    logged_date: date,
    name: entry.name,
    calories: entry.calories,
    protein_g: entry.protein_g,
    carbs_g: entry.carbs_g,
    fat_g: entry.fat_g,
    quantity_g: entry.quantity_g,
    source: entry.source,
    logged_at: entry.logged_at,
    meal_type: entry.meal_type || 'BREAKFAST',
  });
  if (error) console.warn('[logStore] cloud upsert failed:', error.message);
}

async function deleteFromCloud(id) {
  const { error } = await supabase.from('food_logs').delete().eq('id', id);
  if (error) console.warn('[logStore] cloud delete failed:', error.message);
}

// ── Context ───────────────────────────────────────────────────────────────────

export const LogContext = createContext(null);

export function LogProvider({ children, session, targets = DEFAULT_TARGETS }) {
  const [logs, setLogs] = useState({});
  const [ready, setReady] = useState(false);
  const userId = session?.user?.id;

  useEffect(() => {
    (async () => {
      const local = await loadLocal();
      setLogs(local);
      setReady(true);
      if (userId) {
        const cloud = await syncFromCloud(userId);
        if (cloud) {
          // Cloud wins for dates it has data for (cloud is source of truth)
          setLogs(prev => {
            const merged = { ...prev, ...cloud };
            saveLocal(merged);
            return merged;
          });
        }
      }
    })();
  }, [userId]);

  const addEntry = async (date, food) => {
    const entry = {
      id: crypto.randomUUID(),
      name: food.name,
      calories: Math.round(food.calories || 0),
      protein_g: Math.round((food.protein_g || 0) * 10) / 10,
      carbs_g: Math.round((food.carbs_g || 0) * 10) / 10,
      fat_g: Math.round((food.fat_g || 0) * 10) / 10,
      quantity_g: food.quantity_g || 100,
      source: food.source || 'manual',
      logged_at: new Date().toISOString(),
      meal_type: food.meal_type || 'BREAKFAST',
    };
    setLogs(prev => {
      const next = { ...prev, [date]: [...(prev[date] || []), entry] };
      saveLocal(next);
      return next;
    });
    if (userId) upsertToCloud(userId, date, entry);
    return entry;
  };

  const removeEntry = async (date, id) => {
    setLogs(prev => {
      const next = { ...prev, [date]: (prev[date] || []).filter(e => e.id !== id) };
      saveLocal(next);
      return next;
    });
    if (userId) deleteFromCloud(id);
  };

  const updateEntry = async (date, id, updates) => {
    let updated;
    setLogs(prev => {
      const next = {
        ...prev,
        [date]: (prev[date] || []).map(e => {
          if (e.id !== id) return e;
          updated = { ...e, ...updates };
          return updated;
        }),
      };
      saveLocal(next);
      return next;
    });
    if (userId && updated) upsertToCloud(userId, date, updated);
  };

  const getEntries = (date) => logs[date] || [];

  return (
    <LogContext.Provider value={{ logs, ready, targets, addEntry, removeEntry, updateEntry, getEntries }}>
      {children}
    </LogContext.Provider>
  );
}

export function useLog() {
  return useContext(LogContext);
}
