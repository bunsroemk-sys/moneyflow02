import { useEffect, useState } from 'react';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const emptyCategories = { income: [], expense: [] };
const newEntry = () => ({ id: crypto.randomUUID(), category: '', customCategory: '', amount: '' });

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json', ...options.headers } : options.headers,
  });
  if (response.status === 204) return null;
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'ดำเนินการไม่สำเร็จ');
  return result;
}

const formatMoney = (value, currency) => `${Number(value).toLocaleString('th-TH', { maximumFractionDigits: 2 })} ${currency}`;

function App() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [currencies, setCurrencies] = useState({});
  const [categories, setCategories] = useState(emptyCategories);
  const [from, setFrom] = useState('THB');
  const [to, setTo] = useState('USD');
  const [rows, setRows] = useState({ income: [], expense: [] });
  const [summary, setSummary] = useState(null);
  const [historyRecords, setHistoryRecords] = useState([]);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historyStatus, setHistoryStatus] = useState('loading');
  const [historyError, setHistoryError] = useState('');
  const [dashboardStatus, setDashboardStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadHistory() {
    setHistoryStatus('loading');
    setHistoryError('');
    try {
      const result = await request('/api/history');
      setHistoryRecords(result.records);
      setHistoryStatus('success');
    } catch (loadError) {
      setHistoryError(loadError.message);
      setHistoryStatus('error');
    }
  }

  async function loadDashboard() {
    setDashboardStatus('กำลังโหลดข้อมูลบัญชี...');
    try {
      const [currencyResult, categoryResult] = await Promise.all([
        request('/api/currencies'),
        request('/api/categories'),
      ]);
      setCurrencies(currencyResult.currencies);
      setCategories(categoryResult);
      setRows({ income: [newEntry()], expense: [newEntry()] });
      setDashboardStatus('');
      await loadHistory();
    } catch (loadError) {
      setDashboardStatus(loadError.message);
    }
  }

  useEffect(() => {
    let cancelled = false;
    request('/api/auth/me').then(async (result) => {
      if (cancelled) return;
      setUser(result.user);
      await loadDashboard();
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function submitAuth(event) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError('');
    const formData = new FormData(event.currentTarget);
    try {
      const result = await request(`/api/auth/${authMode}`, {
        method: 'POST',
        body: JSON.stringify({ email: formData.get('email'), password: formData.get('password') }),
      });
      setUser(result.user);
      setSummary(null);
      setError('');
      await loadDashboard();
    } catch (submitError) {
      setAuthError(submitError.message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function logout() {
    try {
      await request('/api/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      setRows({ income: [], expense: [] });
      setHistoryRecords([]);
      setSummary(null);
      setError('');
      setAuthMode('login');
    }
  }

  function updateEntry(type, id, key, value) {
    setRows((current) => ({
      ...current,
      [type]: current[type].map((entry) => entry.id === id ? { ...entry, [key]: value } : entry),
    }));
  }

  function addEntry(type) {
    setRows((current) => ({ ...current, [type]: [...current[type], newEntry()] }));
  }

  function removeEntry(type, id) {
    setRows((current) => ({ ...current, [type]: current[type].filter((entry) => entry.id !== id) }));
  }

  function resetForm(keepSummary = false) {
    setRows({ income: [newEntry()], expense: [newEntry()] });
    if (!keepSummary) setSummary(null);
  }

  async function calculateSummary() {
    setError('');
    const collect = (type) => rows[type].map((entry) => ({
      category: entry.category === 'อื่นๆ' ? entry.customCategory.trim() : entry.category,
      amount: Number(entry.amount || 0),
    })).filter((entry) => entry.amount > 0);
    const incomes = collect('income');
    const expenses = collect('expense');
    const activeEntries = [...rows.income, ...rows.expense].filter((entry) => Number(entry.amount) > 0);
    if (!incomes.length && !expenses.length) {
      setError('กรุณากรอกจำนวนเงินอย่างน้อย 1 รายการก่อนบันทึก');
      return;
    }
    if (activeEntries.some((entry) => !entry.category || (entry.category === 'อื่นๆ' && !entry.customCategory.trim()))) {
      setError('กรุณาระบุชื่อหมวดหมู่สำหรับรายการ “อื่นๆ”');
      return;
    }

    setBusy(true);
    try {
      const result = await request('/api/summary', {
        method: 'POST',
        body: JSON.stringify({ from, to, incomes, expenses }),
      });
      const record = { createdAt: new Date().toISOString(), from, to, incomes, expenses, result };
      setSummary(result);
      await request('/api/history', { method: 'POST', body: JSON.stringify(record) });
      setHistoryRecords((current) => [record, ...current].slice(0, 1000));
      resetForm(true);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  }

  async function clearHistory() {
    if (!historyRecords.length || !window.confirm('ต้องการลบประวัติทั้งหมดหรือไม่? เมื่อลบแล้วจะไม่สามารถกู้คืนได้')) return;
    try {
      await request('/api/history', { method: 'DELETE' });
      setHistoryRecords([]);
      setHistoryStatus('success');
      setHistoryError('');
    } catch (clearError) {
      setHistoryError(clearError.message);
      setHistoryStatus('error');
    }
  }

  const currencyOptions = Object.entries(currencies).sort(([a], [b]) => a.localeCompare(b));
  const historyDate = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

  const filteredHistoryRecords = historyRecords.filter((record) => {
  if (historyFilter === 'income') {
    return (record.incomes || []).length > 0;
  }

  if (historyFilter === 'expense') {
    return (record.expenses || []).length > 0;
  }

  return true;
}); 

  return (
    <>
      <nav className="site-nav" aria-label="เมนูหลัก">
        <div className="site-nav-inner">
          <a href="#home">หน้าแรก</a>
          {!user ? (
            <a href="#login">เข้าสู่ระบบ</a>
          ) : (
            <>
              <a href="#entry">บันทึกรายการ</a>
              <a href="#history">ประวัติรายการ</a>
            </>
          )}
        </div>
      </nav>
      <header className="hero" id="home">
        <div className="hero-inner">
          <span className="eyebrow">MONEYFLOW · PERSONAL FINANCE</span>
          <h1>จัดการเงินของคุณ<br />ให้ง่ายขึ้นในทุกวัน</h1>
          <p>ติดตามรายรับและรายจ่าย พร้อมแปลงสกุลเงินได้ในที่เดียว</p>
        </div>
      </header>
      <main>
        {!user ? (
          <section className="panel auth-panel" id="login" aria-live="polite">
            <form className="auth-form" onSubmit={submitAuth}>
              <div>
                <h2>{authMode === 'register' ? 'สร้างบัญชี' : 'เข้าสู่ระบบ'}</h2>
                <p>{authMode === 'register' ? 'ใช้บัญชีนี้เพื่อเปิดดูข้อมูลของคุณจากอุปกรณ์อื่น' : 'เข้าสู่ระบบเพื่อดูข้อมูลที่บันทึกไว้กับบัญชีของคุณ'}</p>
              </div>
              <label htmlFor="authEmail">อีเมล</label>
              <input id="authEmail" name="email" type="email" autoComplete="email" maxLength="254" required />
              <label htmlFor="authPassword">รหัสผ่าน</label>
              <input id="authPassword" name="password" type="password" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} minLength="8" maxLength="128" required />
              {authError && <p className="alert error" role="alert">{authError}</p>}
              <button className="primary" type="submit" disabled={authBusy}>{authBusy ? 'กำลังดำเนินการ...' : authMode === 'register' ? 'สมัครบัญชี' : 'เข้าสู่ระบบ'}</button>
              <button className="text-button" type="button" onClick={() => { setAuthMode(authMode === 'register' ? 'login' : 'register'); setAuthError(''); }}>
                {authMode === 'register' ? 'มีบัญชีแล้ว? เข้าสู่ระบบ' : 'ยังไม่มีบัญชี? สมัครใช้งาน'}
              </button>
            </form>
          </section>
        ) : (
          <div className="dashboard">
            <section className="account-bar">
              <span>เข้าสู่ระบบด้วย <strong>{user.email}</strong></span>
              <button className="secondary compact" type="button" onClick={logout}>ออกจากระบบ</button>
            </section>
            {dashboardStatus && <p className="alert" role="status">{dashboardStatus}</p>}
            {error && <p className="alert error" role="alert">{error}</p>}

            <section className="panel" id="entry">
              <div className="section-heading">
                <span className="heading-icon" aria-hidden="true">↗</span>
                <div><h2>บันทึกรายการ</h2><p>เพิ่มรายการและเลือกสกุลเงินที่ต้องการคำนวณ</p></div>
              </div>
              <div className="form-grid">
                {[
                  { type: 'income', title: 'รายรับ', currency: from, setCurrency: setFrom },
                  { type: 'expense', title: 'รายจ่าย', currency: to, setCurrency: setTo },
                ].map(({ type, title, currency, setCurrency }) => (
                  <div className="form-column" key={type}>
                    <label htmlFor={`${type}Currency`}>{type === 'income' ? 'สกุลเงินต้นทาง' : 'สกุลเงินปลายทาง'}</label>
                    <select id={`${type}Currency`} value={currency} onChange={(event) => setCurrency(event.target.value)}>
                      {currencyOptions.map(([code, name]) => <option value={code} key={code}>{code} - {name}</option>)}
                    </select>
                    <h3 className={`${type}-title`}>{title}</h3>
                    <div className="entries">
                      {rows[type].map((entry) => (
                        <div className="entry" key={entry.id}>
                          <select aria-label={`หมวดหมู่${title}`} value={entry.category} onChange={(event) => updateEntry(type, entry.id, 'category', event.target.value)}>
                            <option value="" disabled>เลือกหมวดหมู่</option>
                            {[...categories[type], 'อื่นๆ'].map((category) => <option value={category} key={category}>{category}</option>)}
                          </select>
                          {entry.category === 'อื่นๆ' && <input aria-label="ระบุหมวดหมู่" placeholder="ระบุหมวดหมู่" value={entry.customCategory} onChange={(event) => updateEntry(type, entry.id, 'customCategory', event.target.value)} />}
                          <input aria-label={`จำนวนเงิน${title}`} type="number" min="0" step="0.01" placeholder="จำนวนเงิน" value={entry.amount} onChange={(event) => updateEntry(type, entry.id, 'amount', event.target.value)} />
                          <button className="secondary remove" type="button" aria-label={`ลบรายการ${title}`} onClick={() => removeEntry(type, entry.id)}>ลบ</button>
                        </div>
                      ))}
                    </div>
                    <button className="secondary add" type="button" onClick={() => addEntry(type)}>+ เพิ่ม{title}</button>
                  </div>
                ))}
              </div>
              <div className="actions">
                <button className="secondary" type="button" onClick={() => resetForm()}>ล้างฟอร์มปัจจุบัน</button>
                <button className="primary" type="button" onClick={calculateSummary} disabled={busy}>{busy ? 'กำลังคำนวณ...' : 'บันทึกและคำนวณ　→'}</button>
              </div>
            </section>

            {summary && (
              <section className="panel summary-panel" aria-live="polite">
                <div className="section-heading"><span className="heading-icon" aria-hidden="true">▤</span><div><h2>สรุปผล</h2><p>ภาพรวมการเงินของคุณในสกุลเงินปลายทาง</p></div></div>
                <div className="summary-grid">
                  <div className="metric"><span>รายรับรวม</span><strong>{formatMoney(summary.income, summary.to)}</strong></div>
                  <div className="metric expense"><span>รายจ่ายรวม</span><strong>{formatMoney(summary.expense, summary.to)}</strong></div>
                  <div className="metric balance"><span>คงเหลือ</span><strong>{formatMoney(summary.balance, summary.to)}</strong></div>
                </div>
                <p className="rate">อัตราแลกเปลี่ยน 1 {summary.from} = {summary.rate} {summary.to}</p>
              </section>
            )}

            <section className="panel history-panel" id="history">
              <div className="history-heading">
                <div className="section-heading"><span className="heading-icon" aria-hidden="true">◷</span><div><h2>ประวัติรายการ</h2><p>บันทึกวันและเวลาไว้กับบัญชีของคุณ</p></div></div>
                <div className="history-actions"><span className="history-count">{historyRecords.length} รายการ</span><button className="history-delete" type="button" onClick={clearHistory} disabled={!historyRecords.length}>ลบประวัติ</button></div>
              </div>
              
              <div className="history-filters" role="group" aria-label="กรองประวัติ">
                <button type="button" className={historyFilter === 'all' ? 'active' : ''} onClick={() => setHistoryFilter('all')}>ทั้งหมด</button>
                <button type="button" className={historyFilter === 'income' ? 'active' : ''} onClick={() => setHistoryFilter('income')}>มีรายรับ</button>
                <button type="button" className={historyFilter === 'expense' ? 'active' : ''} onClick={() => setHistoryFilter('expense')}>มีรายจ่าย</button>
              </div>

              <div className="history-list" aria-live="polite">
                {historyStatus === 'loading' && <div className="history-empty" role="status">กำลังโหลดประวัติ...</div>}
                {historyStatus === 'error' && <div className="history-empty history-error" role="alert">{historyError}<button className="secondary history-retry" type="button" onClick={loadHistory}>ลองโหลดอีกครั้ง</button></div>}
                {historyStatus === 'success' && !historyRecords.length && <div className="history-empty">รายการที่บันทึกจะแสดงที่นี่</div>}
                {historyStatus === 'success' && historyRecords.length > 0 && !filteredHistoryRecords.length && <div className="history-empty">ไม่พบประวัติในหมวดหมู่นี้</div>}
                {historyStatus === 'success' && filteredHistoryRecords.map((record) => {
                  const createdAt = new Date(record.createdAt);
                  const sourceBalance = (record.incomes || []).reduce((sum, item) => sum + Number(item.amount || 0), 0)
                    - (record.expenses || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
                  return (
                    <article className="history-record" key={`${record.createdAt}-${record.from}-${record.to}`}>
                      <div className="history-record-header">
                        <time className="history-date" dateTime={record.createdAt}>{Number.isNaN(createdAt.getTime()) ? 'ไม่ทราบวันที่' : historyDate.format(createdAt)}</time>
                        <span className="history-currency">{record.from} → {record.to}</span>
                      </div>

                      <div className="history-totals">
                        {[
                          ['รับรวม', record.result.income, record.to, ''],
                          ['จ่ายรวม', record.result.expense, record.to, ''],
                          ['คงเหลือ (ต้นทาง)', sourceBalance, record.from, 'source-balance'],
                          ['คงเหลือ (ปลายทาง)', record.result.balance, record.to, 'balance'],
                        ].map(([label, amount, code, className]) => (
                          <div className={`history-total ${className}`} key={label}>
                            <span>{label}</span>
                            <strong>{formatMoney(amount, code)}</strong>
                          </div>
                        ))}
                      </div>

                      <div className="history-items">
                        {[
                          [record.incomes || [], 'รายรับ', 'income'],
                          [record.expenses || [], 'รายจ่าย', 'expense'],
                        ]
                          .filter(([items, title, type]) => historyFilter === 'all' || historyFilter === type)
                          .map(([items, title]) => (
                            <div key={title}>
                              <h4>{title}</h4>
                              {items.length ? items.map((item, index) => (
                                <div className="history-item" key={`${item.category}-${index}`}>
                                  <span>{item.category}</span>
                                  <strong>{formatMoney(item.amount, record.from)}</strong>
                                </div>
                              )) : <div className="history-item">ไม่มีรายการ</div>}
                            </div>
                          ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </main>
    </>
  );
}

export default App;
