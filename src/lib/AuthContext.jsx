import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Отримуємо поточну сесію
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setLoading(false);
    });

    // Слухаємо зміни авторизації
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else { setProfile(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (data) {
      setProfile(data);
    } else {
      // Створюємо профіль якщо не існує
      await createProfile(userId);
    }
    setLoading(false);
  }

  async function createProfile(userId) {
    const { data: userData } = await supabase.auth.getUser();
    const meta = userData.user?.user_metadata || {};

    const newProfile = {
      id:       userId,
      username: meta.full_name || meta.name || meta.user_name || 'Player',
      avatar:   meta.avatar_url || meta.picture || null,
      points:   0,
      streak:   0,
      wins:     0,
      losses:   0,
      glicko_rating:      1500,
      glicko_rd:          350,
      glicko_volatility:  0.06,
    };

    const { data } = await supabase
      .from('profiles')
      .insert(newProfile)
      .select()
      .single();

    setProfile(data);
  }

  async function signInWithDiscord() {
    await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo: window.location.origin },
    });
  }

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signInWithDiscord, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
