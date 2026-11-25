import { useState } from 'react'
import { Menu, X, LogOut } from 'lucide-react'
import { supabase } from './supabase'
export default function Shell({ title, nav, page, setPage, children }) {
  const [open, setOpen] = useState(false)
  const Nav = () => nav.map(([k, label, Icon]) => (
    <button key={k} onClick={() => { setPage(k); setOpen(false) }}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm ${page === k ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}><Icon size={18} />{label}</button>))
  return (<div className="min-h-screen lg:flex">
    <aside className={`fixed inset-y-0 left-0 z-40 w-64 space-y-1 bg-white p-4 shadow-lg transition-transform lg:static lg:translate-x-0 ${open ? '' : '-translate-x-full'}`}>
      <div className="mb-4 flex items-center justify-between"><b className="text-brand-900">{title}</b><button className="lg:hidden" onClick={() => setOpen(false)}><X /></button></div>
      <Nav /><button onClick={() => supabase.auth.signOut()} className="flex w-full items-center gap-3 px-3 py-3 text-sm text-red-600"><LogOut size={18} />Sign out</button></aside>
    <div className="min-w-0 flex-1"><header className="sticky top-0 z-30 flex items-center gap-3 bg-white/90 p-3 shadow-sm backdrop-blur lg:hidden">
      <button onClick={() => setOpen(true)}><Menu /></button><b>{title}</b></header>
      <main className="mx-auto max-w-6xl space-y-4 p-4">{children}</main></div></div>)
}
