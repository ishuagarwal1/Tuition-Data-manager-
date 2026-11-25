import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import Login from './Login'
import Teacher from './Teacher'
import Parent from './Parent'
export default function App() {
  const [session, setSession] = useState(undefined), [profile, setProfile] = useState(null), [err, setErr] = useState('')
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!session) return setProfile(null)
    supabase.from('profiles').select('*, tuition_centres(*)').eq('id', session.user.id).single()
      .then(({ data, error }) => error ? setErr('Your account is not set up yet. Contact your tuition teacher.') : setProfile(data))
  }, [session])
  if (session === undefined) return <p className="p-10 text-center">Loading…</p>
  if (!session) return <Login />
  if (err) return <div className="p-10 text-center"><p>{err}</p><button className="btn2 mt-4" onClick={() => supabase.auth.signOut()}>Sign out</button></div>
  if (!profile) return <p className="p-10 text-center">Loading…</p>
  return profile.role === 'teacher' ? <Teacher profile={profile} /> : <Parent profile={profile} />
}
