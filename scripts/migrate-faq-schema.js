/**
 * FAQ schema migration -- Option A.
 *
 * Consolidates the three single-purpose tables into `respon` so one row holds
 * a complete FAQ entry, then drops the broken shared-PK foreign keys that made
 * `respon` unwritable.
 *
 * Background: `respon.id` was simultaneously a FK to kuota.id, navigation.id
 * and keywords.id. With those parents empty that made every INSERT fail with
 * ER_NO_REFERENCED_ROW_2, so the admin FAQ create route could not work.
 *
 * Idempotent: safe to run repeatedly. Re-running is a no-op.
 *
 * Usage: node scripts/migrate-faq-schema.js
 */
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

const connConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'db_chatbot',
};

// The FKs we remove, keyed by constraint name so we never guess.
const DEAD_FKS = ['respon_ibfk_1', 'respon_ibfk_2', 'respon_ibfk_3'];

// Columns and indexes added to `respon`, with the DDL used when absent.
// Indexes use ADD INDEX because they are not standalone ADD COLUMN clauses.
const NEW_COLUMNS = [
  { name: 'menu', ddl: "ADD COLUMN `menu` varchar(150) NOT NULL DEFAULT ''" },
  { name: 'label', ddl: "ADD COLUMN `label` varchar(150) NOT NULL DEFAULT ''" },
  { name: 'kata_pemicu', ddl: "ADD COLUMN `kata_pemicu` varchar(255) NOT NULL DEFAULT ''" },
  // Indexes that make the FAQ list filters fast.
  { name: 'idx_respon_menu', ddl: 'ADD INDEX `idx_respon_menu` (`menu`)' },
  { name: 'idx_respon_menu_label', ddl: 'ADD INDEX `idx_respon_menu_label` (`menu`, `label`)' },
];

async function currentColumns() {
  const [rows] = await conn.query('SHOW COLUMNS FROM respon');
  return rows;
}

async function dropDeadFks() {
  const [fks] = await conn.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'respon'
       AND REFERENCED_TABLE_NAME IS NOT NULL`
  );
  const present = fks.map((f) => f.CONSTRAINT_NAME);
  const toDrop = DEAD_FKS.filter((name) => present.includes(name));

  for (const name of toDrop) {
    await conn.query(`ALTER TABLE respon DROP FOREIGN KEY \`${name}\``);
    console.log(`  dropped FK ${name}`);
  }
  if (!toDrop.length) console.log('  no dead FKs present');
  return toDrop;
}

async function addColumns(existing) {
  for (const col of NEW_COLUMNS) {
    if (existing.has(col.name)) {
      console.log(`  already has ${col.name}`);
      continue;
    }
    await conn.query(`ALTER TABLE respon ${col.ddl}`);
    console.log(`  added ${col.name}`);
  }
}

// `kode` was NOT NULL with no default. The new UI collects menu/label/
// keywords/response and no longer asks for a bare kode, so the column has to
// become nullable or every INSERT fails.
async function relaxKode(existing) {
  const kode = existing.get('kode');
  if (!kode) {
    console.log('  kode column absent, nothing to relax');
    return;
  }
  if (kode.Null === 'YES') {
    console.log('  kode already nullable');
    return;
  }
  await conn.query('ALTER TABLE respon MODIFY COLUMN `kode` varchar(150) NULL DEFAULT NULL');
  console.log('  kode -> nullable');
}

async function main(conn) {
  console.log('FAQ schema migration (Option A)');
  console.log(`target: ${process.env.DB_DATABASE || 'db_chatbot'}\n`);

  const existing = new Map(
    (await currentColumns()).map((c) => [c.Field, c])
  );

  console.log('1. remove shared-PK foreign keys');
  await dropDeadFks();

  console.log('2. add menu / label / kata_pemicu');
  await addColumns(existing);

  console.log('3. backfill existing rows, then relax kode');
  // Any pre-existing row gets a sane menu/label so the new columns are not
  // blank, and kata_pemicu mirrors kode so keyword search keeps working.
  await conn.query(
    `UPDATE respon SET
       menu = CASE WHEN menu = '' THEN 'Umum' ELSE menu END,
       label = CASE WHEN label = '' THEN COALESCE(NULLIF(kode, ''), CONCAT('FAQ ', id)) ELSE label END,
       kata_pemicu = CASE WHEN kata_pemicu = '' THEN COALESCE(NULLIF(kode, ''), CONCAT('FAQ ', id)) ELSE kata_pemicu END
     WHERE menu = '' OR label = '' OR kata_pemicu = ''`
  );
  await relaxKode(existing);

  const [after] = await conn.query('SHOW CREATE TABLE respon');
  console.log('\nfinal respon definition:\n');
  console.log(after[0]['Create Table']);

  console.log('migration complete.');
}

let conn = null;

mysql
  .createConnection(connConfig)
  .then((connection) => {
    conn = connection;
    return main(conn);
  })
  .then(async () => {
    if (conn) await conn.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('\nMIGRATION FAILED:', err.code || '', err.message);
    console.error('respon may be partially altered. Re-run after reviewing the error above.');
    if (conn) await conn.end().catch(() => {});
    process.exit(1);
  });