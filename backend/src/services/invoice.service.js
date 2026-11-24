const PDFDocument = require('pdfkit');
const Setting = require('../models/Setting');
const Payment = require('../models/Payment');

/**
 * Tax invoice PDFs for jobs and AMC/CMC plans. Every number comes from the stored bill / payments — nothing is
 * recalculated here. Amounts print as "Rs." because the built-in PDF fonts have no rupee glyph.
 */

const rs = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—');
const INK = '#0b1324';
const MUTED = '#5d667a';
const BLUE = '#1456d8';
const LINE = '#e6ebf3';

function header(doc, biz, title, number, issued) {
  doc.fillColor(BLUE).fontSize(20).font('Helvetica-Bold').text(biz.companyName || 'Aftenza', 40, 40);
  doc.fillColor(MUTED).fontSize(9).font('Helvetica')
    .text([biz.address, [biz.state, biz.pincode].filter(Boolean).join(' '), biz.phoneNumber && `${biz.phoneCountryCode || ''} ${biz.phoneNumber}`, biz.email].filter(Boolean).join('\n'), 40, 66, { width: 280 });
  if (biz.gstin) doc.fillColor(INK).font('Helvetica-Bold').text(`GSTIN: ${biz.gstin}`, 40, doc.y + 2);
  doc.fillColor(INK).fontSize(16).font('Helvetica-Bold').text(title, 330, 40, { width: 225, align: 'right' });
  doc.fontSize(9).font('Helvetica').fillColor(MUTED)
    .text(`Invoice no: ${number}`, 330, 62, { width: 225, align: 'right' })
    .text(`Date: ${date(issued)}`, 330, 75, { width: 225, align: 'right' });
  doc.moveTo(40, 130).lineTo(555, 130).strokeColor(LINE).stroke();
}

function party(doc, y, left, right) {
  doc.fontSize(8).font('Helvetica-Bold').fillColor(MUTED).text('BILLED TO', 40, y).text(right.title, 330, y);
  doc.fontSize(10).font('Helvetica').fillColor(INK).text(left.join('\n'), 40, y + 13, { width: 270 });
  const leftEnd = doc.y;
  doc.text(right.lines.join('\n'), 330, y + 13, { width: 225 });
  return Math.max(leftEnd, doc.y) + 14;
}

/** The bill table: one row per line, covered lines show what they would have cost. */
function table(doc, y, rows) {
  const cols = [40, 300, 345, 430];
  doc.rect(40, y, 515, 20).fill('#f4f7fc');
  doc.fillColor(MUTED).fontSize(8).font('Helvetica-Bold');
  ['DESCRIPTION', 'QTY', 'RATE', 'AMOUNT'].forEach((h, i) => doc.text(h, cols[i] + 6, y + 6, { width: i === 0 ? 250 : 120, align: i === 0 ? 'left' : i === 3 ? 'right' : 'left', ...(i === 3 && { width: 119 }) }));
  y += 26;
  doc.font('Helvetica').fontSize(9.5);
  for (const r of rows) {
    if (y > 720) { doc.addPage(); y = 50; }
    doc.fillColor(INK).text(r.label, cols[0] + 6, y, { width: 250 });
    const h = doc.heightOfString(r.label, { width: 250 });
    if (r.note) doc.fillColor('#137a43').fontSize(8).text(r.note, cols[0] + 6, y + h + 1, { width: 250 }).fontSize(9.5);
    doc.fillColor(INK).text(String(r.qty || 1), cols[1] + 6, y).text(rs(r.rate), cols[2] + 6, y).text(rs(r.amount), cols[3] + 6, y, { width: 119, align: 'right' });
    y += h + (r.note ? 14 : 6);
    doc.moveTo(40, y).lineTo(555, y).strokeColor(LINE).stroke();
    y += 6;
  }
  return y;
}

function totals(doc, y, items) {
  for (const [label, value, bold] of items) {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9.5).fillColor(bold ? INK : MUTED)
      .text(label, 330, y, { width: 125 }).fillColor(INK).text(value, 455, y, { width: 100, align: 'right' });
    y += bold ? 18 : 15;
  }
  return y;
}

function footer(doc, biz) {
  doc.fontSize(8).font('Helvetica').fillColor(MUTED)
    .text(`This is a computer-generated invoice from ${biz.companyName || 'Aftenza'} and needs no signature.`, 40, 780, { width: 515, align: 'center' });
}

const gstSplit = (bill) => {
  // intra-state supply: GST shown as CGST + SGST halves
  const half = Math.round((bill.gst || 0) * 50) / 100;
  return [[`CGST ${(bill.gstPercent || 0) / 2}%`, rs(half)], [`SGST ${(bill.gstPercent || 0) / 2}%`, rs(Math.round(((bill.gst || 0) - half) * 100) / 100)]];
};

/** Streams the invoice for a job into `res`. */
async function serviceInvoice(sr, res) {
  const { businessSetup: biz = {} } = await Setting.get();
  const bill = sr.bill || {};
  const payments = await Payment.find({ serviceRequestId: sr._id, status: 'paid' }).sort({ paidAt: 1 }).lean();
  const number = `${biz.invoicePrefix || 'INV'}-${sr.srNumber.replace(/^SR-/, '')}`;
  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Invoice ${number}` } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${number}.pdf"`);
  doc.pipe(res);

  header(doc, biz, 'TAX INVOICE', number, sr.closedAt || sr.approvedAt || sr.completedAt || sr.updatedAt);
  let y = party(doc, 142,
    [sr.customerName, sr.customerPhone && `+91 ${sr.customerPhone}`, sr.address, sr.city].filter(Boolean),
    { title: 'SERVICE', lines: [`${sr.srNumber} · ${(sr.jobType || '').replace('_', ' ')}`, [sr.brand, sr.model].filter(Boolean).join(' '), sr.subtypeName, sr.serialNumber && `Serial ${sr.serialNumber}`, sr.coverage && sr.coverage !== 'none' ? `Coverage: ${sr.coverage === 'warranty' ? 'OEM warranty' : sr.coverage.toUpperCase()}` : null].filter(Boolean) });

  y = table(doc, y, (bill.lines || []).map((l) => ({ label: l.label, qty: l.qty, rate: l.unitPrice, amount: l.amount, note: l.covered ? `${l.note || 'Covered'} (list ${rs(l.listAmount)})` : undefined })));
  y += 6;
  const rows = [['Subtotal', rs(bill.subtotal)]];
  if (bill.prepaidDiscount) rows.push(['Prepaid discount', `- ${rs(bill.prepaidDiscount)}`]);
  if (bill.couponDiscount) rows.push([`Coupon ${bill.couponCode || ''}`, `- ${rs(bill.couponDiscount)}`]);
  if (!bill.prepaidDiscount && !bill.couponDiscount && bill.discount) rows.push(['Discount', `- ${rs(bill.discount)}`]);
  rows.push(['Taxable value', rs(bill.taxable)], ...gstSplit(bill));
  if (bill.creditNote) rows.push(['Credit note', `- ${rs(bill.creditNote)}`]);
  rows.push(['Total', rs(bill.total), true], ['Paid', rs(bill.paid)]);
  if (bill.refunded) rows.push(['Refunded', rs(bill.refunded)]);
  rows.push([bill.due > 0 ? 'Balance due' : 'Balance', rs(bill.due || 0), true]);
  y = totals(doc, y, rows);

  if (payments.length) {
    y = Math.max(y, doc.y) + 10;
    doc.fontSize(8).font('Helvetica-Bold').fillColor(MUTED).text('PAYMENTS', 40, y);
    y += 13;
    doc.font('Helvetica').fontSize(9).fillColor(INK);
    for (const p of payments) {
      const how = p.provider === 'cash' ? 'Cash' : p.provider === 'wallet' ? 'Wallet' : `Online ${p.paymentId || ''}`;
      doc.text(`${date(p.paidAt)} · ${how}`, 40, y, { width: 360 }).text(rs(p.amount), 455, y, { width: 100, align: 'right' });
      y += 14;
      if (p.refundedAmount) { doc.fillColor(MUTED).text(`  refunded ${rs(p.refundedAmount)}`, 40, y); doc.fillColor(INK); y += 14; }
    }
  }
  footer(doc, biz);
  doc.end();
}

/** Streams the invoice for an AMC / CMC plan purchase. */
async function planInvoice(sub, customer, res) {
  const { businessSetup: biz = {}, gstPercent = 18 } = await Setting.get();
  const number = `${biz.invoicePrefix || 'INV'}-P${String(sub._id).slice(-6).toUpperCase()}`;
  // plan prices are GST-inclusive: split the tax out of the price paid
  const total = sub.price;
  const taxable = Math.round((total / (1 + gstPercent / 100)) * 100) / 100;
  const gst = Math.round((total - taxable) * 100) / 100;
  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Invoice ${number}` } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${number}.pdf"`);
  doc.pipe(res);
  header(doc, biz, 'TAX INVOICE', number, sub.startDate || sub.createdAt);
  let y = party(doc, 142, [customer?.name, customer?.phone && `+91 ${customer.phone}`].filter(Boolean),
    { title: 'PLAN', lines: [sub.planSnapshot?.name, [sub.brand, sub.model].filter(Boolean).join(' '), sub.serialNumber && `Serial ${sub.serialNumber}`, `${date(sub.startDate)} to ${date(sub.endDate)}`].filter(Boolean) });
  y = table(doc, y, [{ label: `${sub.type.toUpperCase()} · ${sub.planSnapshot?.name || ''}`, qty: 1, rate: taxable + (sub.inspectionCredit ? 0 : 0), amount: taxable, note: sub.inspectionCredit ? `Inspection fee of ${rs(sub.inspectionCredit)} adjusted` : undefined }]);
  totals(doc, y + 6, [['Taxable value', rs(taxable)], ...gstSplit({ gst, gstPercent }), ['Total', rs(total), true], ['Paid', rs(sub.status === 'pending_payment' ? 0 : total)]]);
  footer(doc, biz);
  doc.end();
}

module.exports = { serviceInvoice, planInvoice };
