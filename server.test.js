const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moneyflow-test-'));
process.env.MONEYFLOW_DATA_FILE = path.join(directory, 'accounts.json');
const app = require('./server');
let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(directory, { recursive: true, force: true });
});

test('backend serves API endpoints only', async () => {
  const pageResponse = await fetch(`${baseUrl}/`);
  assert.equal(pageResponse.status, 404);
  const apiResponse = await fetch(`${baseUrl}/api/not-found`);
  assert.equal(apiResponse.status, 404);
});

test('accounts persist and history is isolated behind login', async () => {
  const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'person@example.com', password: 'strong-pass-123' }),
  });
  assert.equal(registerResponse.status, 201);
  const cookie = registerResponse.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(`${baseUrl}/api/history`)).status, 401);

  const record = {
    createdAt: new Date().toISOString(), from: 'THB', to: 'USD', incomes: [], expenses: [],
    result: { income: 0, expense: 0, balance: 0 },
  };
  const saveResponse = await fetch(`${baseUrl}/api/history`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(record),
  });
  assert.equal(saveResponse.status, 201);

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'PERSON@example.com', password: 'strong-pass-123' }),
  });
  assert.equal(loginResponse.status, 200);
  const loginCookie = loginResponse.headers.get('set-cookie').split(';')[0];
  const historyResponse = await fetch(`${baseUrl}/api/history`, { headers: { cookie: loginCookie } });
  assert.deepEqual((await historyResponse.json()).records, [record]);
  const firstUser = JSON.parse(await (await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: loginCookie } })).text()).user;
  const storedAccount = JSON.parse(fs.readFileSync(process.env.MONEYFLOW_DATA_FILE, 'utf8'))[firstUser.id];
  assert.equal(storedAccount.passwordHash.length, 128);
  assert.equal(JSON.stringify(storedAccount).includes('strong-pass-123'), false);

  const addCategoryResponse = await fetch(`${baseUrl}/api/categories`, {
    method: 'POST', headers: { cookie: loginCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'income', name: 'งานพิเศษส่วนตัว' }),
  });
  assert.equal(addCategoryResponse.status, 201);

  const secondRegisterResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'another@example.com', password: 'another-pass-123' }),
  });
  assert.equal(secondRegisterResponse.status, 201);
  const secondCookie = secondRegisterResponse.headers.get('set-cookie').split(';')[0];
  assert.deepEqual((await (await fetch(`${baseUrl}/api/history`, { headers: { cookie: secondCookie } })).json()).records, []);
  const secondCategories = await (await fetch(`${baseUrl}/api/categories`, { headers: { cookie: secondCookie } })).json();
  assert.equal(secondCategories.income.includes('งานพิเศษส่วนตัว'), false);
});