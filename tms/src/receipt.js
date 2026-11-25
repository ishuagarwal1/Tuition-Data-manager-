import { jsPDF } from 'jspdf'
import { MONTHS } from './supabase'
export function downloadReceipt({ centre, fee, payment }) {
  const d = new jsPDF(); const bal = fee.total_fee - fee.amount_paid
  d.setFontSize(18); d.text(centre?.name || 'Tuition Centre', 20, 22)
  d.setFontSize(11); d.text('PAYMENT RECEIPT', 20, 32)
  const rows = [['Receipt No', payment.receipt_no], ['Student', fee.students?.full_name], ['Student ID', fee.students?.student_code],
    ['Class', fee.students?.classes?.name || '-'], ['Month', `${MONTHS[fee.month - 1]} ${fee.year}`], ['Total Fee', fee.total_fee],
    ['Amount Paid', payment.amount], ['Remaining Balance', bal], ['Method', payment.method], ['Date', payment.paid_on]]
  rows.forEach(([k, v], i) => { d.text(k, 20, 48 + i * 9); d.text(String(v ?? '-'), 80, 48 + i * 9) })
  d.line(130, 160, 190, 160); d.text("Teacher's Signature", 135, 167)
  d.save(`receipt-${payment.receipt_no}.pdf`)
}
