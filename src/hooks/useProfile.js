import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { computeGoalTargets } from '../services/calculations';

const DEFAULT_TARGETS = { calories: 2000, protein: 150, carbs: 200, fat: 67 };

// Targets that drive the whole app (rings, progress) come from the same
// goal-aware calculation as the Profile "Current Goals" card.
const computeTargets = computeGoalTargets;

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
