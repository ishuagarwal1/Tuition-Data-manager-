import { useCallback, useEffect, useState } from 'react'
import { LayoutDashboard, Users, IndianRupee } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase, MONTHS, money } from './supabase'
import { downloadReceipt } from './receipt'
import Shell from './Shell'
const now = new Date(), M = now.getMonth() + 1, Y = now.getFullYear()
const badge = { paid: 'bg-green-100 text-green-700', unpaid: 'bg-red-100 text-red-700', partial: 'bg-orange-100 text-orange-700', overdue: 'bg-yellow-100 text-yellow-800' }
const st = f => f.status !== 'paid' && new Date(f.due_date) < new Date() ? (f.status === 'unpaid' ? 'overdue' : 'partial') : f.status

function Dashboard() {
  const [d, setD] = useState(null)
  useEffect(() => { (async () => {
    const [s, f] = await Promise.all([supabase.from('students').select('status, joined_on'), supabase.from('fee_records').select('month,year,total_fee,amount_paid')])
    const cur = (f.data || []).filter(x => x.month === M && x.year === Y)
    const chart = MONTHS.map((m, i) => ({ m, paid: (f.data || []).filter(x => x.year === Y && x.month === i + 1).reduce((a, x) => a + +x.amount_paid, 0) }))
    setD({ total: s.data.length, active: s.data.filter(x => x.status === 'active').length,
      collected: cur.reduce((a, x) => a + +x.amount_paid, 0), pending: cur.reduce((a, x) => a + (x.total_fee - x.amount_paid), 0), chart })
  })() }, [])
  if (!d) return <p>Loading…</p>
  const cards = [['Total Students', d.total], ['Active', d.active], ['Inactive', d.total - d.active], ['Collected (this month)', money(d.collected)], ['Pending (this month)', money(d.pending)]]
  return (<><h1 className="text-xl font-semibold">Dashboard</h1>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{cards.map(([k, v]) => <div key={k} className="card"><p className="text-xs text-slate-500">{k}</p><p className="text-xl font-semibold text-brand-900">{v}</p></div>)}</div>
    <div className="card h-72"><p className="mb-2 text-sm font-medium">Fee collection {Y}</p>
      <ResponsiveContainer width="100%" height="90%"><BarChart data={d.chart}><XAxis dataKey="m" /><YAxis /><Tooltip /><Bar dataKey="paid" fill="#3b4fc4" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></>)
}

function StudentForm({ centre, student, classes, onDone }) {
  const [f, setF] = useState(student || { status: 'active', monthly_fee: centre.default_fee || 0, fee_due_day: centre.fee_due_day || 10 })
  const [p, setP] = useState({ full_name: '', phone: '', email: '' }), [photo, setPhoto] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const set = (k, v) => setF({ ...f, [k]: v })
  const save = async e => { e.preventDefault(); setBusy(true); setErr('')
    const row = { full_name: f.full_name, dob: f.dob || null, gender: f.gender || null, joined_on: f.joined_on || undefined, class_id: f.class_id || null, school_name: f.school_name,
      batch: f.batch, status: f.status, monthly_fee: +f.monthly_fee, fee_due_day: +f.fee_due_day, remarks: f.remarks, emergency_contact: f.emergency_contact }
    let id = student?.id
    if (student) { const { error } = await supabase.from('students').update(row).eq('id', id); if (error) return fail(error) }
    else { const { data, error } = await supabase.from('students').insert({ ...row, centre_id: centre.id, student_code: 'S' + Date.now().toString().slice(-6) }).select().single()
      if (error) return fail(error); id = data.id
      if (p.full_name) { const { data: pr, error: e2 } = await supabase.from('parents').insert({ centre_id: centre.id, ...p }).select().single()
        if (e2) return fail(e2); await supabase.from('student_parents').insert({ student_id: id, parent_id: pr.id }) } }
    if (photo) { const path = `${centre.id}/${id}.jpg`; const { error } = await supabase.storage.from('student-photos').upload(path, photo, { upsert: true })
      if (error) return fail(error); await supabase.from('students').update({ photo_path: path }).eq('id', id) }
    onDone() }
  const fail = e => { setErr(e.message); setBusy(false) }
  return (<form onSubmit={save} className="card space-y-3">
    <h2 className="font-semibold">{student ? 'Edit student' : 'New student'}</h2>
    <div className="grid gap-3 sm:grid-cols-2">
      <input className="inp" placeholder="Full name *" required value={f.full_name || ''} onChange={e => set('full_name', e.target.value)} />
      <input className="inp" type="date" title="Date of birth" value={f.dob || ''} onChange={e => set('dob', e.target.value)} />
      <select className="inp" value={f.class_id || ''} onChange={e => set('class_id', e.target.value)}><option value="">Class</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <input className="inp" placeholder="School" value={f.school_name || ''} onChange={e => set('school_name', e.target.value)} />
      <input className="inp" placeholder="Batch / timing" value={f.batch || ''} onChange={e => set('batch', e.target.value)} />
      <select className="inp" value={f.status} onChange={e => set('status', e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select>
      <input className="inp" type="number" min="0" placeholder="Monthly fee" value={f.monthly_fee} onChange={e => set('monthly_fee', e.target.value)} />
      <input className="inp" type="number" min="1" max="28" placeholder="Due day" value={f.fee_due_day} onChange={e => set('fee_due_day', e.target.value)} />
      <input className="inp" type="file" accept="image/*" onChange={e => setPhoto(e.target.files[0])} /></div>
    {!student && <><p className="pt-2 text-sm font-medium">Parent / guardian</p><div className="grid gap-3 sm:grid-cols-3">
      <input className="inp" placeholder="Name" value={p.full_name} onChange={e => setP({ ...p, full_name: e.target.value })} />
      <input className="inp" placeholder="Phone" value={p.phone} onChange={e => setP({ ...p, phone: e.target.value })} />
      <input className="inp" type="email" placeholder="Email" value={p.email} onChange={e => setP({ ...p, email: e.target.value })} /></div></>}
    <textarea className="inp" placeholder="Remarks" value={f.remarks || ''} onChange={e => set('remarks', e.target.value)} />
    {err && <p className="text-sm text-red-600">{err}</p>}
    <div className="flex gap-2"><button className="btn" disabled={busy}>{busy ? 'Saving…' : student ? 'Update Student' : 'Save Student'}</button><button type="button" className="btn2" onClick={() => onDone(true)}>Cancel</button></div></form>)
}

function Students({ centre }) {
  const [rows, setRows] = useState(null), [classes, setClasses] = useState([]), [q, setQ] = useState(''), [cls, setCls] = useState(''), [stat, setStat] = useState(''), [edit, setEdit] = useState(null), [pg, setPg] = useState(0)
  const load = useCallback(async () => { const [s, c] = await Promise.all([
    supabase.from('students').select('*, classes(name), student_parents(parents(full_name, phone))').order('created_at', { ascending: false }), supabase.from('classes').select('*')])
    setRows(s.data || []); setClasses(c.data || []) }, [])
  useEffect(() => { load() }, [load])
  if (edit) return <StudentForm centre={centre} student={edit === 'new' ? null : edit} classes={classes} onDone={c => { setEdit(null); c || load() }} />
  const list = (rows || []).filter(s => (!q || (s.full_name + s.student_code).toLowerCase().includes(q.toLowerCase())) && (!cls || s.class_id === cls) && (!stat || s.status === stat))
  const pages = Math.ceil(list.length / 10)
  const archive = async s => { if (confirm(`Archive ${s.full_name}?`)) { await supabase.from('students').update({ status: 'archived' }).eq('id', s.id); load() } }
  return (<><div className="flex items-center justify-between"><h1 className="text-xl font-semibold">All Students</h1><button className="btn" onClick={() => setEdit('new')}>+ Add Student</button></div>
    <div className="grid gap-2 sm:grid-cols-3"><input className="inp" placeholder="Search name or ID" value={q} onChange={e => { setQ(e.target.value); setPg(0) }} />
      <select className="inp" value={cls} onChange={e => setCls(e.target.value)}><option value="">All classes</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select className="inp" value={stat} onChange={e => setStat(e.target.value)}><option value="">All status</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></div>
    {!rows ? <p>Loading…</p> : !list.length ? <div className="card py-10 text-center text-slate-500">No students found.</div> :
      <div className="space-y-2">{list.slice(pg * 10, pg * 10 + 10).map(s => { const par = s.student_parents[0]?.parents
        return (<div key={s.id} className="card flex flex-wrap items-center justify-between gap-2">
          <div><p className="font-medium">{s.full_name} <span className="text-xs text-slate-400">{s.student_code}</span></p>
            <p className="text-sm text-slate-500">{s.classes?.name || 'No class'} · {par?.full_name || '—'} {par?.phone || ''} · {money(s.monthly_fee)}/mo · {s.status}</p></div>
          <div className="flex gap-2"><button className="btn2" onClick={() => setEdit(s)}>Edit</button>{s.status !== 'archived' && <button className="btn2" onClick={() => archive(s)}>Archive</button>}</div></div>) })}
        {pages > 1 && <div className="flex justify-center gap-2"><button className="btn2" disabled={!pg} onClick={() => setPg(pg - 1)}>Prev</button><span className="py-2 text-sm">{pg + 1}/{pages}</span><button className="btn2" disabled={pg + 1 >= pages} onClick={() => setPg(pg + 1)}>Next</button></div>}</div>}</>)
}

function Fees({ centre }) {
  const [m, setM] = useState(M), [y, setY] = useState(Y), [rows, setRows] = useState(null), [pay, setPay] = useState(null), [msg, setMsg] = useState('')
  const load = useCallback(async () => { const { data } = await supabase.from('fee_records').select('*, students(full_name, student_code, classes(name))').eq('month', m).eq('year', y).order('created_at'); setRows(data || []) }, [m, y])
  useEffect(() => { load() }, [load])
  const generate = async () => { const { data: ss } = await supabase.from('students').select('id, monthly_fee, fee_due_day').eq('status', 'active')
    const recs = ss.map(s => ({ centre_id: centre.id, student_id: s.id, month: m, year: y, total_fee: s.monthly_fee, due_date: `${y}-${String(m).padStart(2, '0')}-${String(s.fee_due_day).padStart(2, '0')}` }))
    const { error } = await supabase.from('fee_records').upsert(recs, { onConflict: 'student_id,month,year', ignoreDuplicates: true })
    setMsg(error ? error.message : 'Fee records generated (existing ones were kept).'); load() }
  return (<><h1 className="text-xl font-semibold">Fee Management</h1>
    <div className="flex flex-wrap gap-2"><select className="inp w-auto" value={m} onChange={e => setM(+e.target.value)}>{MONTHS.map((x, i) => <option key={x} value={i + 1}>{x}</option>)}</select>
      <input className="inp w-24" type="number" value={y} onChange={e => setY(+e.target.value)} /><button className="btn" onClick={generate}>Generate records</button></div>
    {msg && <p className="text-sm text-slate-600">{msg}</p>}
    {!rows ? <p>Loading…</p> : !rows.length ? <div className="card py-10 text-center text-slate-500">No fee records for this month. Click “Generate records”.</div> :
      <div className="space-y-2">{rows.map(r => { const s = st(r); return (<div key={r.id} className="card flex flex-wrap items-center justify-between gap-2">
        <div><p className="font-medium">{r.students.full_name} <span className="text-xs text-slate-400">{r.students.student_code} · {r.students.classes?.name}</span></p>
          <p className="text-sm text-slate-500">Fee {money(r.total_fee)} · Paid {money(r.amount_paid)} · Balance {money(r.total_fee - r.amount_paid)}</p></div>
        <div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge[s]}`}>{s}</span>
          {r.status !== 'paid' && <button className="btn" onClick={() => setPay(r)}>Record Payment</button>}<ReceiptBtn fee={r} centre={centre} /></div></div>) })}</div>}
    {pay && <PayModal fee={pay} onClose={() => { setPay(null); load() }} centre={centre} />}</>)
}
function ReceiptBtn({ fee, centre }) {
  if (!+fee.amount_paid) return null
  const go = async () => { const { data } = await supabase.from('payments').select('*').eq('fee_record_id', fee.id).eq('voided', false).order('created_at', { ascending: false }).limit(1)
    if (data?.[0]) downloadReceipt({ centre, fee, payment: data[0] }) }
  return <button className="btn2" onClick={go}>Receipt</button>
}
function PayModal({ fee, onClose, centre }) {
  const bal = fee.total_fee - fee.amount_paid
  const [f, setF] = useState({ amount: bal, method: 'cash', date: new Date().toISOString().slice(0, 10), ref: '', remarks: '' }), [err, setErr] = useState(''), [done, setDone] = useState(null), [busy, setBusy] = useState(false)
  const submit = async e => { e.preventDefault(); setErr(''); if (!(+f.amount > 0) || +f.amount > bal) return setErr(`Enter an amount between 1 and ${bal}.`)
    setBusy(true); const { data, error } = await supabase.rpc('record_payment', { p_fee: fee.id, p_amount: +f.amount, p_method: f.method, p_date: f.date, p_ref: f.ref || null, p_remarks: f.remarks || null })
    setBusy(false); if (error) return setErr(error.message); setDone(data) }
  return (<div className="fixed inset-0 z-50 grid place-items-end bg-black/40 sm:place-items-center"><form onSubmit={submit} className="card w-full max-w-md space-y-3 rounded-b-none sm:rounded-b-2xl">
    <h2 className="font-semibold">Record payment · {fee.students.full_name}</h2><p className="text-sm text-slate-500">Balance {money(bal)}</p>
    {done ? <><p className="text-green-700">Payment saved. Receipt #{done.receipt_no}</p>
      <div className="flex gap-2"><button type="button" className="btn" onClick={() => downloadReceipt({ centre, fee: { ...fee, amount_paid: +fee.amount_paid + +done.amount }, payment: done })}>Download receipt</button><button type="button" className="btn2" onClick={onClose}>Close</button></div></> : <>
      <input className="inp" type="number" min="1" max={bal} value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} />
      <select className="inp" value={f.method} onChange={e => setF({ ...f, method: e.target.value })}><option value="cash">Cash</option><option value="upi">UPI</option><option value="bank_transfer">Bank Transfer</option><option value="other">Other</option></select>
      <input className="inp" type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} />
      <input className="inp" placeholder="Transaction / reference ID" value={f.ref} onChange={e => setF({ ...f, ref: e.target.value })} />
      <input className="inp" placeholder="Remarks" value={f.remarks} onChange={e => setF({ ...f, remarks: e.target.value })} />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex gap-2"><button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save payment'}</button><button type="button" className="btn2" onClick={onClose}>Cancel</button></div></>}</form></div>)
}

export default function Teacher({ profile }) {
  const [page, setPage] = useState('dash'), centre = profile.tuition_centres
  const nav = [['dash', 'Dashboard', LayoutDashboard], ['students', 'Students', Users], ['fees', 'Fees', IndianRupee]]
  return (<Shell title={centre?.name || 'Tuition Manager'} nav={nav} page={page} setPage={setPage}>
    {page === 'dash' && <Dashboard />}{page === 'students' && <Students centre={centre} />}{page === 'fees' && <Fees centre={centre} />}</Shell>)
}
