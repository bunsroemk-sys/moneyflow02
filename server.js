const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
const FRANKFURTER_URL = 'https://api.frankfurter.dev/v1';
const path = require('path');
app.use(require('express').static(path.join(__dirname, 'public')));
app.get('/', (req,res)=> {res.sendFile(path.join(__dirname, 'public', 'index.html'));});
app.use(express.json());
app.use(express.static('public'));

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

const categories = {
  income: new HashTable(),
  expense: new HashTable(),
};

const defaultCategories = {
  income: ['เงินเดือน', 'โบนัส', 'รายได้เสริม'],
  expense: ['อาหาร', 'เดินทาง', 'ที่พัก', 'ช้อปปิ้ง', 'ค่าสาธารณูปโภค'],
};

for (const type of Object.keys(defaultCategories)) {
  defaultCategories[type].forEach(category => categories[type].add(category));
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

app.get('/api/categories', (req, res) => {
  res.json({ income: categories.income.values(), expense: categories.expense.values() });
});

app.post('/api/categories', (req, res) => {
  const { type, name } = req.body;
  if (!['income', 'expense'].includes(type) || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'ข้อมูลหมวดหมู่ไม่ถูกต้อง' });
  }
  categories[type].add(name);
  res.status(201).json({ categories: categories[type].values() });
});

app.post('/api/summary', async (req, res) => {
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

app.listen(PORT, () => console.log(`🚀 http://localhost:${PORT}`));
module.exports=app;