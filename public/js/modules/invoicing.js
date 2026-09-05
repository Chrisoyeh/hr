import { dom } from './dom.js';
import { state, generateInvoiceNumber } from '../state.js';
import { saveDatabase } from '../services/firestore.js';
import { todayISO, formatDate, formatCurrency, showToast } from '../utils.js';

export function renderInvoices() {
  const invoices = [...(state.db?.clientInvoices || [])];
  const search = (dom.invoiceSearch?.value || '').toLowerCase().trim();
  const statusFilter = dom.invoiceStatusFilter?.value || 'all';

  const filtered = invoices.filter((inv) => {
    const matchesSearch = !search ||
      (inv.invoiceNumber || '').toLowerCase().includes(search) ||
      (inv.schoolName || '').toLowerCase().includes(search) ||
      (inv.description || '').toLowerCase().includes(search);
    const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  }).sort((a, b) => new Date(b.issueDate || b.createdAt) - new Date(a.issueDate || a.createdAt));

  let totalBilled = 0;
  let totalReceived = 0;
  let totalOutstanding = 0;

  invoices.forEach(inv => {
    const amount = Number(inv.amount || 0);
    totalBilled += amount;
    if (inv.status === 'Paid') {
      totalReceived += amount;
    } else {
      totalOutstanding += amount;
    }
  });

  if (dom.invoicesBilledMetric) dom.invoicesBilledMetric.textContent = formatCurrency(totalBilled);
  if (dom.invoicesReceivedMetric) dom.invoicesReceivedMetric.textContent = formatCurrency(totalReceived);
  if (dom.invoicesOutstandingMetric) dom.invoicesOutstandingMetric.textContent = formatCurrency(totalOutstanding);

  if (dom.invoicesTableBody) {
    if (filtered.length === 0) {
      dom.invoicesTableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No client invoices found.</td></tr>';
    } else {
      dom.invoicesTableBody.innerHTML = filtered.map((inv) => {
        let badgeClass = 'chip-secondary';
        if (inv.status === 'Paid') badgeClass = 'chip-success';
        else if (inv.status === 'Sent') badgeClass = 'chip-warning';
        else if (inv.status === 'Overdue') badgeClass = 'chip-danger';

        return `
          <tr>
            <td><strong class="text-info">${inv.invoiceNumber}</strong></td>
            <td>
              <div class="fw-semibold">${inv.schoolName || 'Unknown School'}</div>
              <small class="text-muted">${inv.description || 'Curriculum & Retainer'}</small>
            </td>
            <td>${formatDate(inv.issueDate)}</td>
            <td>${inv.dueDate ? formatDate(inv.dueDate) : '—'}</td>
            <td class="text-end fw-bold">${formatCurrency(inv.amount)}</td>
            <td><span class="chip ${badgeClass}">${inv.status}</span></td>
            <td class="text-end">
              <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-info" data-action="view-invoice" data-id="${inv.id}" title="View / Print Invoice"><i class="bi bi-printer"></i></button>
                ${inv.status !== 'Paid' ? `<button class="btn btn-outline-success" data-action="settle-invoice" data-id="${inv.id}" title="Mark Settled & Post to Revenue"><i class="bi bi-check-circle"></i> Settle</button>` : ''}
                <button class="btn btn-outline-secondary" data-action="edit-invoice" data-id="${inv.id}" title="Edit"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-outline-danger" data-action="delete-invoice" data-id="${inv.id}" title="Delete"><i class="bi bi-trash"></i></button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  populateInvoiceSchoolOptions();
}

export function populateInvoiceSchoolOptions() {
  if (!dom.invoiceSchoolSelect) return;
  const schools = state.db?.schools || [];
  const currentVal = dom.invoiceSchoolSelect.value;
  dom.invoiceSchoolSelect.innerHTML = '<option value="">-- Select Client School --</option>' +
    schools.map(s => `<option value="${s.id}">${s.name} (${s.code || 'SCH'})</option>`).join('');
  if (currentVal) dom.invoiceSchoolSelect.value = currentVal;
}

export async function submitInvoice(event, refreshAll) {
  event.preventDefault();
  if (!state.db.clientInvoices) state.db.clientInvoices = [];

  const invoiceId = dom.invoiceId?.value;
  const schoolId = dom.invoiceSchoolSelect?.value;
  const school = (state.db?.schools || []).find(s => s.id === schoolId);
  const amount = Number(dom.invoiceAmount?.value || 0);
  const issueDate = dom.invoiceIssueDate?.value || todayISO(0);
  const dueDate = dom.invoiceDueDate?.value || '';
  const description = dom.invoiceDescription?.value?.trim() || 'Curriculum Retainer & Services';
  const status = dom.invoiceStatus?.value || 'Sent';

  if (invoiceId) {
    // Update
    const idx = state.db.clientInvoices.findIndex(inv => inv.id === invoiceId);
    if (idx >= 0) {
      state.db.clientInvoices[idx] = {
        ...state.db.clientInvoices[idx],
        schoolId,
        schoolName: school ? school.name : state.db.clientInvoices[idx].schoolName,
        amount,
        issueDate,
        dueDate,
        description,
        status,
        updatedAt: new Date().toISOString()
      };
      showToast('Invoice updated successfully.', 'success');
    }
  } else {
    // Create
    const newInvoice = {
      id: crypto.randomUUID(),
      invoiceNumber: generateInvoiceNumber(),
      schoolId,
      schoolName: school ? school.name : 'Client Institution',
      amount,
      issueDate,
      dueDate,
      description,
      status,
      createdAt: new Date().toISOString()
    };
    state.db.clientInvoices.push(newInvoice);
    showToast(`Invoice ${newInvoice.invoiceNumber} created.`, 'success');
  }

  await saveDatabase();
  resetInvoiceForm();
  if (typeof refreshAll === 'function') refreshAll();
}

export function resetInvoiceForm() {
  if (dom.invoiceForm) dom.invoiceForm.reset();
  if (dom.invoiceId) dom.invoiceId.value = '';
  if (dom.invoiceIssueDate) dom.invoiceIssueDate.value = todayISO(0);
  if (dom.invoiceDueDate) dom.invoiceDueDate.value = todayISO(14);
  if (dom.invoiceStatus) dom.invoiceStatus.value = 'Sent';
  if (dom.invoiceFormTitle) dom.invoiceFormTitle.textContent = 'Create Client Invoice';
  if (dom.invoiceSubmitBtn) dom.invoiceSubmitBtn.textContent = 'Generate Invoice';
}

export async function settleInvoice(invoiceId, refreshAll) {
  const inv = (state.db?.clientInvoices || []).find(i => i.id === invoiceId);
  if (!inv) return;
  if (inv.status === 'Paid') {
    showToast('Invoice is already settled.', 'info');
    return;
  }

  inv.status = 'Paid';
  inv.paidAt = new Date().toISOString();

  // Auto-record in General Ledger if not already posted
  if (!state.db.financeTransactions) state.db.financeTransactions = [];
  const existingTxn = state.db.financeTransactions.find(t => t.referenceNo === inv.invoiceNumber);

  if (!existingTxn) {
    const txn = {
      id: crypto.randomUUID(),
      txnRef: `TXN-${todayISO(0).replace(/-/g, '').slice(2, 6)}-${String(state.db.financeTransactions.length + 1).padStart(3, '0')}`,
      type: 'Revenue',
      category: 'School Retainer',
      department: 'Academic',
      amount: Number(inv.amount),
      date: todayISO(0),
      description: `Settlement for Invoice ${inv.invoiceNumber} (${inv.schoolName}): ${inv.description}`,
      paymentMethod: 'Bank Transfer',
      status: 'Completed',
      referenceNo: inv.invoiceNumber,
      payeePayer: inv.schoolName,
      createdAt: new Date().toISOString(),
      createdBy: state.session?.email || 'admin'
    };
    state.db.financeTransactions.push(txn);
  }

  await saveDatabase();
  showToast(`Invoice ${inv.invoiceNumber} marked Paid and posted to Revenue Ledger!`, 'success');
  if (typeof refreshAll === 'function') refreshAll();
}

export function openPrintInvoiceModal(invoiceId) {
  const inv = (state.db?.clientInvoices || []).find(i => i.id === invoiceId);
  if (!inv) return;
  const school = (state.db?.schools || []).find(s => s.id === inv.schoolId);

  const modalEl = document.getElementById('invoicePrintModal');
  const bodyEl = document.getElementById('invoicePrintModalBody');
  if (!modalEl || !bodyEl) return;

  bodyEl.innerHTML = `
    <div class="printable-invoice p-4">
      <div class="d-flex justify-content-between align-items-start border-bottom pb-4 mb-4">
        <div class="d-flex align-items-center gap-3">
          <img src="logo.jpg" alt="HLTS Logo" style="width: 54px; height: 54px; object-fit: contain; border-radius: 8px;">
          <div>
            <h4 class="mb-0 fw-bold">HLTS LIMITED</h4>
            <div class="text-muted small">Human Capital, Technology & Educational Operations</div>
            <div class="text-muted small">info@hltsltd.com | +234 (0) 800 000 0000</div>
          </div>
        </div>
        <div class="text-end">
          <h3 class="text-primary mb-1 fw-bold">INVOICE</h3>
          <div class="fw-bold">${inv.invoiceNumber}</div>
          <span class="badge ${inv.status === 'Paid' ? 'text-bg-success' : 'text-bg-warning'} px-3 py-1 mt-1">${inv.status.toUpperCase()}</span>
        </div>
      </div>

      <div class="row mb-4">
        <div class="col-6">
          <div class="text-muted small text-uppercase fw-semibold mb-1">Billed To:</div>
          <h5 class="mb-1">${inv.schoolName}</h5>
          <div class="small text-muted">${school?.location || 'Client Institution'}</div>
          ${school?.contactPerson ? `<div class="small text-muted">Attn: ${school.contactPerson} (${school.contactPhone || ''})</div>` : ''}
        </div>
        <div class="col-6 text-end">
          <div class="small mb-1"><span class="text-muted">Issue Date:</span> <strong>${formatDate(inv.issueDate)}</strong></div>
          <div class="small mb-1"><span class="text-muted">Due Date:</span> <strong>${inv.dueDate ? formatDate(inv.dueDate) : 'On Receipt'}</strong></div>
          <div class="small"><span class="text-muted">Payment Term:</span> <strong>Bank Transfer / Direct Deposit</strong></div>
        </div>
      </div>

      <div class="table-responsive mb-4">
        <table class="table table-bordered table-dark">
          <thead class="table-secondary text-dark">
            <tr>
              <th>Description / Scope of Work</th>
              <th class="text-center" style="width: 80px;">Qty</th>
              <th class="text-end" style="width: 140px;">Unit Price</th>
              <th class="text-end" style="width: 140px;">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div class="fw-semibold">${inv.description || 'Curriculum Delivery, Supervisory Support & LMS Services'}</div>
                <div class="small text-muted">Academic Term & Operational Retainer</div>
              </td>
              <td class="text-center">1</td>
              <td class="text-end">${formatCurrency(inv.amount)}</td>
              <td class="text-end fw-bold">${formatCurrency(inv.amount)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" class="text-end fw-bold">Subtotal:</td>
              <td class="text-end fw-bold">${formatCurrency(inv.amount)}</td>
            </tr>
            <tr>
              <td colspan="3" class="text-end fw-bold">Tax / VAT (0%):</td>
              <td class="text-end">₦0.00</td>
            </tr>
            <tr class="table-active">
              <td colspan="3" class="text-end fw-bold fs-5">Total Payable:</td>
              <td class="text-end fw-bold fs-5 text-success">${formatCurrency(inv.amount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="p-3 bg-secondary bg-opacity-10 border rounded mb-4">
        <h6 class="fw-bold mb-2"><i class="bi bi-bank me-2"></i>Remittance / Bank Account Details:</h6>
        <div class="row small">
          <div class="col-sm-4"><strong>Bank Name:</strong> Opay</div>
          <div class="col-sm-4"><strong>Account Name:</strong> High Level Tech services Limited</div>
          <div class="col-sm-4"><strong>Account Number:</strong> 6141061967</div>
        </div>
      </div>

      <div class="d-flex justify-content-between align-items-center text-muted small pt-3 border-top">
        <div>Thank you for partnering with HLTS Limited.</div>
        <div>Generated by HLTS Operations Hub</div>
      </div>
    </div>
  `;

  const modal = new bootstrap.Modal(modalEl);
  modal.show();
}
