import { useEffect, useState } from 'react'
import { Home, Bell } from 'lucide-react'
import { supabase, MONTHS, money } from './supabase'
import { downloadReceipt } from './receipt'
import Shell from './Shell'
export default function Parent({ profile }) {
  const centre = profile.tuition_centres, [page, setPage] = useState('home'), [kids, setKids] = useState(null), [sel, setSel] = useState(null)
  const [fees, setFees] = useState([]), [att, setAtt] = useState([]), [ann, setAnn] = useState([]), [url, setUrl] = useState(null)
  useEffect(() => { supabase.from('students').select('*, classes(name)').then(({ data }) => { setKids(data || []); setSel(data?.[0]?.id) })
    supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(10).then(({ data }) => setAnn(data || [])) }, [])
  const kid = kids?.find(k => k.id === sel)
  useEffect(() => { if (!sel) return
    supabase.from('fee_records').select('*, students(full_name, student_code, classes(name)), payments(*)').eq('student_id', sel).order('year', { ascending: false }).order('month', { ascending: false }).then(({ data }) => setFees(data || []))
    supabase.from('attendance').select('status').eq('student_id', sel).then(({ data }) => setAtt(data || []))
    setUrl(null); if (kid?.photo_path) supabase.storage.from('student-photos').createSignedUrl(kid.photo_path, 3600).then(({ data }) => setUrl(data?.signedUrl)) }, [sel, kid?.photo_path])
  const present = att.filter(a => a.status === 'present').length, pct = att.length ? Math.round(present * 100 / att.length) : null
  const cur = fees[0], pending = fees.reduce((a, f) => a + (f.total_fee - f.amount_paid), 0)
  return (<Shell title={centre?.name || 'Parent Portal'} nav={[['home', 'Home', Home], ['news', 'Announcements', Bell]]} page={page} setPage={setPage}>
    <p className="text-lg font-semibold">Welcome, {profile.full_name || 'Parent'}</p>
    {!kids ? <p>Loading…</p> : !kids.length ? <div className="card text-center text-slate-500">No child is linked to your account yet. Please contact the teacher.</div> : <>
      {kids.length > 1 && <select className="inp" value={sel} onChange={e => setSel(e.target.value)}>{kids.map(k => <option key={k.id} value={k.id}>{k.full_name}</option>)}</select>}
      {page === 'home' && kid && <>
        <div className="card flex items-center gap-4">{url ? <img src={url} alt="" className="h-20 w-20 rounded-2xl object-cover" /> : <div className="grid h-20 w-20 place-items-center rounded-2xl bg-brand-50 text-2xl text-brand-600">{kid.full_name[0]}</div>}
          <div><p className="text-lg font-semibold">{kid.full_name}</p><p className="text-sm text-slate-500">ID {kid.student_code} · {kid.classes?.name || '—'} · {money(kid.monthly_fee)}/month</p></div></div>
        <div className="grid grid-cols-3 gap-3"><div className="card"><p className="text-xs text-slate-500">Latest fee</p><p className="font-semibold capitalize">{cur ? `${MONTHS[cur.month - 1]}: ${cur.status}` : '—'}</p></div>
          <div className="card"><p className="text-xs text-slate-500">Pending</p><p className="font-semibold">{money(pending)}</p></div>
          <div className="card"><p className="text-xs text-slate-500">Attendance</p><p className="font-semibold">{pct === null ? '—' : pct + '%'}</p></div></div>
        <div className="card"><p className="mb-2 font-medium">Payment history</p>{!fees.length ? <p className="text-sm text-slate-500">No fee records yet.</p> : fees.map(f => (
          <div key={f.id} className="flex items-center justify-between border-t py-2 text-sm"><span>{MONTHS[f.month - 1]} {f.year} · {money(f.amount_paid)} / {money(f.total_fee)} <i className="text-slate-400">({f.status})</i></span>
            <span className="flex gap-1">{f.payments.filter(p => !p.voided).map(p => <button key={p.id} className="btn2 !px-2 !py-1" onClick={() => downloadReceipt({ centre, fee: f, payment: p })}>Receipt #{p.receipt_no}</button>)}</span></div>))}</div></>}
      {page === 'news' && <div className="space-y-2">{!ann.length ? <div className="card text-slate-500">No announcements.</div> : ann.map(a => <div key={a.id} className="card"><p className="font-medium">{a.title}</p><p className="text-sm text-slate-600">{a.body}</p></div>)}</div>}</>}</Shell>)
}
