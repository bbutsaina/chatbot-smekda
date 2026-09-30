require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, port: +process.env.DB_PORT,
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  const [k] = await c.query('SELECT COUNT(*) AS c FROM keywords');
  console.log('keywords rows:', k[0].c, '<-- empty: no trigger words live here');

  const [r] = await c.query('SELECT COUNT(*) AS c FROM respon');
  console.log('respon rows  :', r[0].c, '<-- trigger words live here (kata_pemicu)');

  const [sample] = await c.query('SELECT id, menu, label, kata_pemicu FROM respon LIMIT 3');
  console.log('\nsample respon rows:');
  sample.forEach(s => console.log('  ', JSON.stringify(s)));

  console.log('\n--- can keywords be JOINed to respon? ---');
  try {
    const [j] = await c.query(
      'SELECT r.isi FROM keywords k JOIN respon r ON r.id = k.id LIMIT 1'
    );
    console.log('join returned', j.length, 'rows');
  } catch (e) {
    console.log('join FAILED:', e.code, e.message);
  }

  console.log('\n--- history_chat columns (for logging) ---');
  const [h] = await c.query('SHOW COLUMNS FROM history_chat');
  h.forEach(x => console.log(`   ${x.Field} ${x.Type} null=${x.Null} default=${x.Default}`));

  await c.end();
})();