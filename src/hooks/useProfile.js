import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { calculateBMR, calculateTDEE, calculateAge, calculateMacros } from '../services/calculations';

const DEFAULT_TARGETS = { calories: 2000, protein: 150, carbs: 200, fat: 67 };

function computeTargets(profile) {
  if (!profile) return null;
  const age = calculateAge(profile.dob);
  const bmr = calculateBMR(
    parseFloat(profile.weight_kg),
    parseFloat(profile.height_cm),
    age,
    profile.gender || 'MALE'
  );
  const tdee = calculateTDEE(bmr, profile.activity_level || 'MODERATE');
  if (!tdee) return null;
  const macros = calculateMacros(tdee);
  return { calories: tdee, ...macros };
}

export function useProfile(session) {
  const [profile, setProfile] = useState(null);
  const [targets, setTargets] = useState(DEFAULT_TARGETS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user?.id) { setLoading(false); return; }
    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setProfile(data);
          const t = computeTargets(data);
          if (t) setTargets(t);
        }
      })
      .finally(() => setLoading(false));
  }, [session?.user?.id]);

  const refresh = async () => {
    if (!session?.user?.id) return;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();
    if (data) {
      setProfile(data);
      const t = computeTargets(data);
      if (t) setTargets(t);
    }
  };

  return { profile, targets, loading, refresh };
}
