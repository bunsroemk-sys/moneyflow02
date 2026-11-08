let currencyNames = {};
let categoryData = { income: [], expense: [] };
let historyRecords = [];
let authMode = 'login';
let activeUserId = null;

function renderAuth({ status, user = null, error = '', mode = authMode }) {
  const component = document.getElementById('authComponent');
  if (status === 'loading') {
    component.innerHTML = '<p class="state-message" role="status">กำลังตรวจสอบบัญชี...</p>';
    return;
  }
  if (status === 'success' && user) {
    component.innerHTML = `<div class="account-bar"><span>เข้าสู่ระบบด้วย <strong>${escapeHtml(user.email)}</strong></span><button id="logoutButton" class="secondary" type="button">ออกจากระบบ</button></div>`;
    document.getElementById('logoutButton').addEventListener('click', logout);
    return;
  }

  const registering = mode === 'register';
  component.innerHTML = `<form id="authForm" class="auth-form">
    <div><h2>${registering ? 'สร้างบัญชี' : 'เข้าสู่ระบบ'}</h2><p>${registering ? 'ใช้บัญชีนี้เพื่อเปิดดูข้อมูลของคุณจากอุปกรณ์อื่น' : 'เข้าสู่ระบบเพื่อดูข้อมูลที่บันทึกไว้กับบัญชีของคุณ'}</p></div>
    <label for="authEmail">อีเมล</label><input id="authEmail" name="email" type="email" autocomplete="email" required maxlength="254">
    <label for="authPassword">รหัสผ่าน</label><input id="authPassword" name="password" type="password" autocomplete="${registering ? 'new-password' : 'current-password'}" minlength="8" maxlength="128" required>
    ${error ? `<p class="auth-error" role="alert">${escapeHtml(error)}</p>` : ''}
    <button class="primary" type="submit" ${status === 'submitting' ? 'disabled' : ''}>${status === 'submitting' ? 'กำลังดำเนินการ...' : registering ? 'สมัครบัญชี' : 'เข้าสู่ระบบ'}</button>
    <button id="authModeButton" class="auth-mode" type="button">${registering ? 'มีบัญชีแล้ว? เข้าสู่ระบบ' : 'ยังไม่มีบัญชี? สมัครใช้งาน'}</button>
  </form>`;
  document.getElementById('authForm').addEventListener('submit', submitAuth);
  document.getElementById('authModeButton').addEventListener('click', () => {
    authMode = registering ? 'login' : 'register';
    renderAuth({ status: 'idle' });
  });
}

function renderDashboardState({ status, message = '' }) {
  const element = document.getElementById('dashboardState');
  element.textContent = message;
  element.hidden = !message;
  element.className = `state-message ${status}`;
  element.setAttribute('role', status === 'error' ? 'alert' : 'status');
}

async function submitAuth(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  renderAuth({ status: 'submitting' });
  try {
    const response = await fetch(`/api/auth/${authMode}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'ดำเนินการไม่สำเร็จ');
    await enterDashboard(result.user);
  } catch (error) {
    renderAuth({ status: 'error', error: error.message });
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  historyRecords = [];
  activeUserId = null;
  document.getElementById('dashboardContent').hidden = true;
  document.getElementById('summary').hidden = true;
  document.getElementById('incomeRows').replaceChildren();
  document.getElementById('expenseRows').replaceChildren();
  showError('');
  authMode = 'login';
  renderAuth({ status: 'idle' });
}

async function enterDashboard(user) {
  if (activeUserId !== user.id) {
    historyRecords = [];
    document.getElementById('summary').hidden = true;
    document.getElementById('incomeRows').replaceChildren();
    document.getElementById('expenseRows').replaceChildren();
    showError('');
  }
  activeUserId = user.id;
  document.getElementById('authPanel').hidden = false;
  document.getElementById('dashboardContent').hidden = false;
  renderAuth({ status: 'success', user });
  await loadDashboard();
}

async function loadDashboard() {
  renderDashboardState({ status: 'loading', message: 'กำลังโหลดข้อมูลบัญชี...' });
  renderHistory({ records: historyRecords, status: 'loading' });
  try {
    const [currencyResponse, categoryResponse] = await Promise.all([fetch('/api/currencies'), fetch('/api/categories')]);
    if (!currencyResponse.ok || !categoryResponse.ok) throw new Error('โหลดข้อมูลเริ่มต้นไม่สำเร็จ');
    currencyNames = (await currencyResponse.json()).currencies;
    categoryData = await categoryResponse.json();
    renderCurrencies();
    addRow('income');
    addRow('expense');
    renderDashboardState({ status: 'success', message: 'โหลดข้อมูลบัญชีสำเร็จ' });
  } catch (error) {
    renderDashboardState({ status: 'error', message: error.message });
    renderHistory({ records: historyRecords, status: 'error', error: error.message });
    return;
  }
  await loadHistory();
}

function renderCurrencies() {
  const options = Object.entries(currencyNames).sort(([a], [b]) => a.localeCompare(b)).map(([code, name]) => `<option value="${code}">${code} - ${name}</option>`).join('');
  document.getElementById('fromCurrency').innerHTML = options;
  document.getElementById('toCurrency').innerHTML = options;
  document.getElementById('fromCurrency').value = 'THB';
  document.getElementById('toCurrency').value = 'USD';
}

function addRow(type) {
  const container = document.getElementById(`${type}Rows`);
  const row = document.createElement('div');
  row.className = 'entry';
  row.innerHTML = `<select class="category" aria-label="หมวดหมู่"></select><input class="custom-category" type="text" placeholder="ระบุหมวดหมู่" aria-label="ระบุหมวดหมู่" hidden><input class="amount" type="number" min="0" step="0.01" placeholder="จำนวนเงิน" aria-label="จำนวนเงิน"><button class="secondary" type="button">ลบ</button>`;
  const categorySelect = row.querySelector('.category');
  categorySelect.innerHTML = [...categoryData[type], 'อื่นๆ'].map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
  categorySelect.addEventListener('change', () => {
    const customInput = row.querySelector('.custom-category');
    customInput.hidden = categorySelect.value !== 'อื่นๆ';
    customInput.required = !customInput.hidden;
    if (!customInput.hidden) customInput.focus();
  });
  row.querySelector('button').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[character]);
}

function collectRows(type) {
  return [...document.querySelectorAll(`#${type}Rows .entry`)].map(row => {
    const selectedCategory = row.querySelector('.category').value;
    const customCategory = row.querySelector('.custom-category').value.trim();
    return {
      category: selectedCategory === 'อื่นๆ' ? customCategory : selectedCategory,
      amount: Number(row.querySelector('.amount').value || 0),
    };
  }).filter(item => item.amount > 0);
}

async function loadHistory() {
  renderHistory({ records: historyRecords, status: 'loading' });
  try {
    const response = await fetch('/api/history');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'โหลดประวัติไม่สำเร็จ');
    historyRecords = result.records;
    renderHistory({ records: historyRecords, status: 'success' });
  } catch (error) {
    renderHistory({ records: historyRecords, status: 'error', error: error.message });
  }
}

function formatMoney(value, currency) {
  return `${Number(value).toLocaleString('th-TH', { maximumFractionDigits: 2 })} ${currency}`;
}

async function appendHistoryRecord(record) {
  const response = await fetch('/api/history', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'บันทึกประวัติไม่สำเร็จ');
  historyRecords = [record, ...historyRecords].slice(0, 1000);
  renderHistory({ records: historyRecords, status: 'success' });
}

function renderHistory({ records, status, error = '' }) {
  const list = document.getElementById('historyList');
  if (!list) return;
  historyRecords = records;
  const count = document.getElementById('historyCount');
  count.textContent = `${historyRecords.length} รายการ`;
  document.getElementById('clearHistoryButton').disabled = historyRecords.length === 0;
  list.replaceChildren();

  if (status === 'loading') {
    list.innerHTML = '<div class="history-empty" role="status">กำลังโหลดประวัติ...</div>';
    return;
  }
  if (status === 'error') {
    const message = document.createElement('div');
    message.className = 'history-empty history-error';
    message.setAttribute('role', 'alert');
    message.textContent = error || 'โหลดประวัติไม่สำเร็จ';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'secondary history-retry';
    retry.textContent = 'ลองโหลดอีกครั้ง';
    retry.addEventListener('click', loadHistory);
    list.append(message, retry);
    return;
  }
  if (historyRecords.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.innerHTML = '<span aria-hidden="true">◷</span>รายการที่บันทึกจะแสดงที่นี่';
    list.appendChild(empty);
    return;
  }

  const dateFormatter = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  for (const record of historyRecords) {
    const card = document.createElement('article');
    card.className = 'history-record';

    const header = document.createElement('div');
    header.className = 'history-record-header';
    const date = document.createElement('time');
    date.className = 'history-date';
    date.dateTime = record.createdAt;
    const createdAt = new Date(record.createdAt);
    date.textContent = Number.isNaN(createdAt.getTime()) ? 'ไม่ทราบวันที่' : dateFormatter.format(createdAt);
    const currencies = document.createElement('span');
    currencies.className = 'history-currency';
    currencies.textContent = `${record.from} → ${record.to}`;
    header.append(date, currencies);

    const itemGroups = document.createElement('div');
    itemGroups.className = 'history-items';
    for (const [type, title] of [['incomes', 'รายรับ'], ['expenses', 'รายจ่าย']]) {
      const group = document.createElement('div');
      const heading = document.createElement('h4');
      heading.textContent = title;
      group.appendChild(heading);
      const items = record[type] || [];
      if (items.length === 0) {
        const emptyItem = document.createElement('div');
        emptyItem.className = 'history-item';
        emptyItem.textContent = 'ไม่มีรายการ';
        group.appendChild(emptyItem);
      }
      for (const item of items) {
        const line = document.createElement('div');
        line.className = 'history-item';
        const category = document.createElement('span');
        category.textContent = item.category;
        const amount = document.createElement('strong');
        amount.textContent = formatMoney(item.amount, record.from);
        line.append(category, amount);
        group.appendChild(line);
      }
      itemGroups.appendChild(group);
    }

    const totals = document.createElement('div');
    totals.className = 'history-totals';
    const sourceBalance = (record.incomes || []).reduce((sum, item) => sum + Number(item.amount || 0), 0)
      - (record.expenses || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    for (const [label, value, currency, className] of [
      ['รับรวม', record.result.income, record.to, ''],
      ['จ่ายรวม', record.result.expense, record.to, ''],
      ['คงเหลือ (ต้นทาง)', sourceBalance, record.from, 'source-balance'],
      ['คงเหลือ (ปลายทาง)', record.result.balance, record.to, 'balance'],
    ]) {
      const total = document.createElement('div');
      total.className = `history-total ${className}`.trim();
      const caption = document.createElement('span');
      caption.textContent = label;
      const amount = document.createElement('strong');
      amount.textContent = formatMoney(value, currency);
      total.append(caption, amount);
      totals.appendChild(total);
    }

    card.append(header, itemGroups, totals);
    list.appendChild(card);
  }
}

async function clearHistory() {
  if (historyRecords.length === 0) return;
  if (!window.confirm('ต้องการลบประวัติทั้งหมดหรือไม่? เมื่อลบแล้วจะไม่สามารถกู้คืนได้')) return;
  try {
    const response = await fetch('/api/history', { method: 'DELETE' });
    if (!response.ok) throw new Error('ลบประวัติไม่สำเร็จ');
    historyRecords = [];
    renderHistory({ records: historyRecords, status: 'success' });
  } catch (error) {
    renderHistory({ records: historyRecords, status: 'error', error: error.message });
  }
}

async function calculateSummary() {
  const incomes = collectRows('income');
  const expenses = collectRows('expense');
  if (incomes.length === 0 && expenses.length === 0) {
    showError('กรุณากรอกจำนวนเงินอย่างน้อย 1 รายการก่อนบันทึก');
    return;
  }
  const rows = [...incomes, ...expenses];
  const hasMissingCategory = [...document.querySelectorAll('#incomeRows .entry, #expenseRows .entry')].some(row => {
    const amount = Number(row.querySelector('.amount').value || 0);
    return amount > 0 && row.querySelector('.category').value === 'อื่นๆ' && !row.querySelector('.custom-category').value.trim();
  });
  if (hasMissingCategory || rows.some(item => !item.category)) {
    showError('กรุณาระบุชื่อหมวดหมู่สำหรับรายการ “อื่นๆ”');
    return;
  }

  const from = document.getElementById('fromCurrency').value;
  const to = document.getElementById('toCurrency').value;
  try {
    const response = await fetch('/api/summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to, incomes, expenses }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    const format = value => `${value.toLocaleString('th-TH', { maximumFractionDigits: 2 })} ${result.to}`;
    document.getElementById('incomeTotal').textContent = format(result.income);
    document.getElementById('expenseTotal').textContent = format(result.expense);
    document.getElementById('balanceTotal').textContent = format(result.balance);
    document.getElementById('rateInfo').textContent = `อัตราแลกเปลี่ยน 1 ${result.from} = ${result.rate} ${result.to}`;
    document.getElementById('summary').hidden = false;
    await appendHistoryRecord({ createdAt: new Date().toISOString(), from, to, incomes, expenses, result });
    resetForm({ keepSummary: true });
    showError('');
  } catch (error) { showError(error.message); }
}

function resetForm({ keepSummary = false } = {}) {
  document.getElementById('incomeRows').innerHTML = '';
  document.getElementById('expenseRows').innerHTML = '';
  if (!keepSummary) document.getElementById('summary').hidden = true;
  addRow('income');
  addRow('expense');
}

function showError(message) {
  const errorBox = document.getElementById('error');
  errorBox.textContent = message;
  errorBox.style.display = message ? 'block' : 'none';
}

async function initializeApp() {
  renderAuth({ status: 'loading' });
  try {
    const response = await fetch('/api/auth/me');
    if (!response.ok) throw new Error('not-authenticated');
    const result = await response.json();
    await enterDashboard(result.user);
  } catch {
    document.getElementById('dashboardContent').hidden = true;
    document.getElementById('authPanel').hidden = false;
    renderAuth({ status: 'idle' });
  }
}

window.addEventListener('load', initializeApp);
