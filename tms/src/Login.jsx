import { useState } from 'react'
import { GraduationCap } from 'lucide-react'
import { supabase } from './supabase'
export default function Login() {
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  const go = async e => { e.preventDefault(); setBusy(true); setMsg('')
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
    if (error) setMsg('Incorrect email or password.'); setBusy(false) }
  const reset = async () => { if (!email) return setMsg('Enter your email first.')
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin })
    setMsg(error ? error.message : 'Password reset email sent.') }
  return (<div className="grid min-h-screen place-items-center bg-gradient-to-br from-brand-50 to-white p-4">
    <form onSubmit={go} className="card w-full max-w-sm space-y-4 p-6">
      <div className="text-center"><div className="mx-auto mb-2 grid h-14 w-14 place-items-center rounded-2xl bg-brand-600 text-white"><GraduationCap /></div>
        <h1 className="text-xl font-semibold text-brand-900">Tuition Manager</h1><p className="text-sm text-slate-500">Teacher & parent login</p></div>
      <input className="inp" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
      <input className="inp" type="password" placeholder="Password" value={pw} onChange={e => setPw(e.target.value)} required />
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      <button className="btn w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <button type="button" onClick={reset} className="w-full text-sm text-brand-600">Forgot password?</button>
    </form></div>)
}
