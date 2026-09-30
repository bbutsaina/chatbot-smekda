const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3000';
let failures = 0;

function check(label, cond, extra) {
  if (cond) console.log('PASS  ' + label);
  else { failures++; console.log('FAIL  ' + label + (extra ? ' :: ' + extra : '')); }
}

function curl(args) {
  const out = execSync(`curl.exe -s -i ${args}`, { encoding: 'utf8' });
  const i = out.indexOf('\r\n\r\n');
  return {
    status: parseInt(out.slice(0, i).split(/\r?\n/)[0].split(' ')[1], 10),
    head: out.slice(0, i), body: out.slice(i + 4),
  };
}

// ---- GET /chat ----
let r = curl(`"${BASE}/chat"`);
check('GET /chat returns 200', r.status === 200, `status=${r.status}`);
check('chat page renders without admin guard', r.body.includes('chat-form'));
check('input id is chat-input', r.body.includes('id="chat-input"'));
check('placeholder matches spec', r.body.includes('placeholder="Tanya apa saja tentang sekolah..."'));
check('send button present', r.body.includes('id="chat-send"'));
check('has fetch to /api/chatbot/query', r.body.includes("fetch('/api/chatbot/query'"));
check('sends { query: message }', r.body.includes('JSON.stringify({ query: message })'));
check('greeting comes from DB, not e2e junk', !r.body.includes('Hi from eze'), 'stale e2e greeting in page');
check('greeting rendered from app_settings', r.body.includes('Cure your curiosity'));

// ---- matched queries ----
const CASES = [
  ['kapan pendaftaran ppdb?', 'Pendaftaran siswa baru dibuka'],
  ['dimana alamat sekolah?', 'Jl. Veteran No. 24'],
  ['jam pelajaran berapa', 'Senin sampai Sabtu'],
  ['ada jurusan apa saja', 'Teknik Komputer dan Jaringan'],
];
for (const [q, needle] of CASES) {
  r = curl(`-X POST "${BASE}/api/chatbot/query" -H "Content-Type: application/json" -d "{\\"query\\":${JSON.stringify(q)}}"`);
  let d = {};
  try { d = JSON.parse(r.body); } catch (e) { /* reported below */ }
  check(`matched: "${q}"`, r.status === 200 && d.matched === true && String(d.reply || '').includes(needle),
    `status=${r.status} reply=${JSON.stringify(d.reply)}`);
  check(`  -> returns { reply } string`, typeof d.reply === 'string');
}

// ---- fallback ----
r = curl(`-X POST "${BASE}/api/chatbot/query" -H "Content-Type: application/json" -d "{\\"query\\":\\"zzzqqqxyzzy\\"}"`);
let d = JSON.parse(r.body);
check('unmatched query returns fallback from app_settings', d.matched === false && d.reply.includes('catch that'), JSON.stringify(d));

// ---- message alias still accepted ----
r = curl(`-X POST "${BASE}/api/chatbot/query" -H "Content-Type: application/json" -d "{\\"message\\":\\"alamat sekolah\\"}"`);
d = JSON.parse(r.body);
check('legacy { message } key still accepted', d.matched === true, JSON.stringify(d));

// ---- validation ----
r = curl(`-X POST "${BASE}/api/chatbot/query" -H "Content-Type: application/json" -d "{\\"query\\":\\"   \\"}"`);
check('empty query returns 400', r.status === 400, `status=${r.status}`);
r = curl(`-X POST "${BASE}/api/chatbot/query" -H "Content-Type: application/json" -d "{}"`);
check('missing query returns 400', r.status === 400, `status=${r.status}`);

// ---- logging ----
r = curl(`-X POST "${BASE}/api/chatbot/query" -H "Content-Type: application/json" -d "{\\"query\\":\\"log probe xyzzy\\"}"`);
check('unmatched query still logged', r.status === 200);

const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, port: +process.env.DB_PORT,
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE,
  });
  const [rows] = await c.query('SELECT token, pesan_masuk, pesan_keluar FROM history_chat ORDER BY id DESC');
  check('history_chat has logged rows', rows.length >= 6, `rows=${rows.length}`);
  check('log stores inbound message', rows.some(r => r.pesan_masuk === 'log probe xyzzy'));
  check('log stores fallback reply', rows.some(r => r.pesan_keluar && r.pesan_keluar.includes('catch that')));
  check('log stores matched answers', rows.some(r => r.pesan_keluar && r.pesan_keluar.includes('Veteran')));
  check('every log row has a token', rows.every(r => !!r.token));

  // admin log history must show them
  const login = curl(`-X POST "${BASE}/admin/login" -d "email=admin@smekda.sch.id&password=admin123"`);
  const jar = `connect.sid=${decodeURIComponent((login.head.match(/^set-cookie:\s*connect\.sid=([^;]*)/im) || [])[1])}`;
  const hist = curl(`"${BASE}/admin/history" -b "${jar}"`);
  check('admin log history shows chat records', hist.body.includes('log probe xyzzy'));
  const dash = curl(`"${BASE}/admin/dashboard" -b "${jar}"`);
  check('dashboard counters render with live data', dash.status === 200);

  await c.end();
  console.log('\n' + (failures === 0 ? 'ALL CHAT E2E CHECKS PASSED' : failures + ' CHAT CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
})();