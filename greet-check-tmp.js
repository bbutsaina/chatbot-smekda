require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, port: +process.env.DB_PORT,
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });
  const [rows] = await c.query("SELECT `key`, `value` FROM app_settings");
  console.log('=== app_settings (source of the greeting shown on /chat) ===');
  rows.forEach(r => console.log(`  ${r.key} = ${JSON.stringify(r.value)}`));

  const [h] = await c.query('SELECT COUNT(*) AS c FROM history_chat');
  console.log('\nhistory_chat rows:', h[0].c);
  await c.end();
})();