const express = require('express');
const crypto = require('node:crypto');
const fs = require('node:fs');
const app = express();
const PORT = process.env.PORT || 3000;
const FRANKFURTER_URL = 'https://api.frankfurter.dev/v1';
const path = require('path');
app.use(express.json());
app.use((req, res, next) => {
  const allowedOrigin = process.env.FRONTEND_ORIGIN;
  if (allowedOrigin && req.headers.origin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      return res.status(204).end();
    }
  }
  next();
});

const DATA_FILE = process.env.MONEYFLOW_DATA_FILE || path.join(__dirname, 'data', 'accounts.json');
const SESSION_COOKIE = 'moneyflow_session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const sessions = new Map();
const defaultCategories = {
  income: ['เงินเดือน', 'โบนัส', 'รายได้เสริม'],
  expense: ['อาหาร', 'เดินทาง', 'ที่พัก', 'ช้อปปิ้ง', 'ค่าสาธารณูปโภค'],
};

function readAccounts() {
  try {
    const accounts = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return accounts && typeof accounts === 'object' && !Array.isArray(accounts) ? accounts : {};
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

let accounts = readAccounts();

function saveAccounts() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const temporaryFile = `${DATA_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(accounts, null, 2), { mode: 0o600 });
  fs.renameSync(temporaryFile, DATA_FILE);
}

function publicAccount(account) {
  return { id: account.id, email: account.email };
}

function cookieOptions() {
  const crossOrigin = Boolean(process.env.FRONTEND_ORIGIN);
  return { httpOnly: true, sameSite: crossOrigin ? 'none' : 'lax', secure: process.env.NODE_ENV === 'production' || crossOrigin, path: '/', maxAge: SESSION_MAX_AGE };
}

function createSession(account, res) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId: account.id, expiresAt: Date.now() + SESSION_MAX_AGE });
  res.cookie(SESSION_COOKIE, token, cookieOptions());
}

function requireAccount(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  const session = token && sessions.get(token);
  const account = session && session.expiresAt > Date.now()
    ? accounts[session.userId]
    : null;
  if (!account) {
    if (token) sessions.delete(token);
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });
  }
  req.account = account;
  next();
}

app.use((req, res, next) => {
  req.cookies = Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(part => {
    const separator = part.indexOf('=');
    return [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())];
  }));
  next();
});

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) return reject(error);
      resolve({ salt, hash: derivedKey.toString('hex') });
    });
  });
}

app.get('/api/auth/me', requireAccount, (req, res) => res.json({ user: publicAccount(req.account) }));

app.post('/api/auth/register', async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = req.body.password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'กรุณากรอกอีเมลให้ถูกต้องและรหัสผ่านอย่างน้อย 8 ตัวอักษร' });
  }
  if (Object.values(accounts).some(account => account.email === email)) {
    return res.status(409).json({ error: 'อีเมลนี้มีบัญชีอยู่แล้ว' });
  }

  try {
    const { salt, hash } = await hashPassword(password);
    if (Object.values(accounts).some(item => item.email === email)) {
      return res.status(409).json({ error: 'อีเมลนี้มีบัญชีอยู่แล้ว' });
    }
    const account = {
      id: crypto.randomUUID(), email, passwordSalt: salt, passwordHash: hash,
      history: [], categories: structuredClone(defaultCategories),
    };
    accounts[account.id] = account;
    saveAccounts();
    createSession(account, res);
    res.status(201).json({ user: publicAccount(account) });
  } catch {
    res.status(500).json({ error: 'สร้างบัญชีไม่สำเร็จ กรุณาลองอีกครั้ง' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = req.body.password;
  const account = Object.values(accounts).find(item => item.email === email);
  if (!account || typeof password !== 'string') return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  try {
    const { hash } = await hashPassword(password, account.passwordSalt);
    const supplied = Buffer.from(hash, 'hex');
    const expected = Buffer.from(account.passwordHash, 'hex');
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
      return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }
    createSession(account, res);
    res.json({ user: publicAccount(account) });
  } catch {
    res.status(500).json({ error: 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) sessions.delete(token);
  const crossOrigin = Boolean(process.env.FRONTEND_ORIGIN);
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: crossOrigin ? 'none' : 'lax', secure: process.env.NODE_ENV === 'production' || crossOrigin, path: '/' });
  res.status(204).end();
});

// Separate chaining keeps category insertion and lookup predictable at O(1) average.
class HashTable {
  constructor(size = 31) {
    this.buckets = Array.from({ length: size }, () => []);
  }

  hash(key) {
    let value = 0;
    for (const character of key) value = (value * 31 + character.charCodeAt(0)) % this.buckets.length;
    return value;
  }

  add(value) {
    const normalized = value.trim();
    if (!normalized) return false;
    const key = normalized.toLocaleLowerCase('th-TH');
    const bucket = this.buckets[this.hash(key)];
    if (bucket.some(item => item.key === key)) return false;
    bucket.push({ key, value: normalized });
    return true;
  }

  values() {
    return this.buckets.flat().map(item => item.value).sort((a, b) => a.localeCompare(b, 'th'));
  }
}

async function fetchJson(path) {
  const response = await fetch(`${FRANKFURTER_URL}${path}`);
  if (!response.ok) throw new Error(`Frankfurter ตอบกลับ ${response.status}`);
  return response.json();
}

app.get('/api/currencies', async (req, res) => {
  try {
    const data = await fetchJson('/currencies');
    res.json({ currencies: { THB: 'Thai Baht', ...data } });
  } catch (error) {
    res.status(502).json({ error: `โหลดสกุลเงินไม่สำเร็จ: ${error.message}` });
  }
});

app.get('/api/categories', requireAccount, (req, res) => {
  const account = req.account;
  res.json(Object.fromEntries(Object.keys(defaultCategories).map(type => {
    const table = new HashTable();
    (account.categories?.[type] || defaultCategories[type]).forEach(category => table.add(category));
    return [type, table.values()];
  })));
});

app.post('/api/categories', requireAccount, (req, res) => {
  const { type, name } = req.body;
  if (!['income', 'expense'].includes(type) || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'ข้อมูลหมวดหมู่ไม่ถูกต้อง' });
  }
  const table = new HashTable();
  (req.account.categories?.[type] || defaultCategories[type]).forEach(category => table.add(category));
  table.add(name);
  req.account.categories[type] = table.values();
  saveAccounts();
  res.status(201).json({ categories: req.account.categories[type] });
});

app.get('/api/history', requireAccount, (req, res) => res.json({ records: req.account.history || [] }));

app.post('/api/history', requireAccount, (req, res) => {
  const record = req.body;
  if (!record || typeof record.createdAt !== 'string' || typeof record.from !== 'string' || typeof record.to !== 'string'
    || !Array.isArray(record.incomes) || !Array.isArray(record.expenses) || !record.result || typeof record.result !== 'object') {
    return res.status(400).json({ error: 'ข้อมูลประวัติไม่ถูกต้อง' });
  }
  req.account.history = [record, ...(req.account.history || [])].slice(0, 1000);
  try {
    saveAccounts();
    res.status(201).json({ record });
  } catch {
    res.status(500).json({ error: 'บันทึกประวัติไม่สำเร็จ' });
  }
});

app.delete('/api/history', requireAccount, (req, res) => {
  req.account.history = [];
  try {
    saveAccounts();
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'ลบประวัติไม่สำเร็จ' });
  }
});

app.post('/api/summary', requireAccount, async (req, res) => {
  const { from, to, incomes = [], expenses = [] } = req.body;
  if (!from || !to || !Array.isArray(incomes) || !Array.isArray(expenses)) {
    return res.status(400).json({ error: 'กรุณาระบุสกุลเงินต้นทาง ปลายทาง และรายการเงินให้ครบ' });
  }

  const incomeTotal = incomes.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const expenseTotal = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  if (![incomeTotal, expenseTotal].every(Number.isFinite) || incomeTotal < 0 || expenseTotal < 0) {
    return res.status(400).json({ error: 'จำนวนเงินต้องเป็นตัวเลขที่ไม่ติดลบ' });
  }

  try {
    const rate = from === to ? 1 : (await fetchJson(`/latest?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`)).rates[to];
    if (!rate) throw new Error('ไม่พบอัตราแลกเปลี่ยนของสกุลเงินที่เลือก');
    res.json({
      from,
      to,
      rate,
      income: incomeTotal * rate,
      expense: expenseTotal * rate,
      balance: (incomeTotal - expenseTotal) * rate,
    });
  } catch (error) {
    res.status(502).json({ error: `คำนวณอัตราแลกเปลี่ยนไม่สำเร็จ: ${error.message}` });
  }
});

if (require.main === module) app.listen(PORT, () => console.log(`http://localhost:${PORT}`));

module.exports = app;