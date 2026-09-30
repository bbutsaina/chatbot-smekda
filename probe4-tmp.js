require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  for (const t of ['keywords', 'respon']) {
    try {
      const [cols] = await c.query('SHOW COLUMNS FROM ??', [t]);
      console.log(`\n=== ${t} columns ===`);
      cols.forEach((x) => {
        console.log(`  ${x.Field.padEnd(20)} ${x.Type.padEnd(16)} null=${x.Null} key=${x.Key} default=${x.Default}`);
      });
      const [fk] = await c.query(
        'SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
        [t]
      );
      console.log(`  FKs: ${fk.length ? JSON.stringify(fk) : 'none'}`);
      const [n] = await c.query(`SELECT COUNT(*) AS c FROM \`${t}\``);
      console.log(`  rows: ${n[0].c}`);
    } catch (e) {
      console.log(`\n=== ${t} === ERROR ${e.message}`);
    }
  }

  await c.end();
})();
