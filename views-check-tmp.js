const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const VIEWS = path.join(__dirname, 'views');

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith('.ejs')) acc.push(full);
  }
  return acc;
}

const files = walk(VIEWS);
let failures = 0;

console.log('=== 1. Compile check (syntax) ===');
for (const f of files) {
  try {
    ejs.compile(fs.readFileSync(f, 'utf8'), { filename: f });
    console.log('PASS  ' + path.relative(VIEWS, f));
  } catch (e) {
    failures++;
    console.log('FAIL  ' + path.relative(VIEWS, f) + ' :: ' + e.message);
  }
}

console.log('\n=== 2. Include resolution (real render) ===');
// Data each page needs so EJS does not throw ReferenceError on undefined.
const DASHBOARD = {
  title: 'Dashboard', activePage: 'dashboard', adminName: 'Tester',
  totalChats: 3, totalKeywords: 12, unanswered: 1,
  recentActivity: [{ token: 'SES-1', pesan_masuk: 'hi', pesan_keluar: 'halo' }],
  flash: null, csrfToken: 'a'.repeat(64),
};
const FAQ = {
  title: 'Management FAQ', activePage: 'faq', adminName: 'Tester',
  faqs: [{ id: 1, kode: 'PPDB', isi: 'Isi' }], total: 1, perPage: 9,
  currentPage: 1, totalPages: 1, search: '', category: '',
  categories: ['PPDB'], flash: null, formError: null, formValues: {},
  csrfToken: 'a'.repeat(64),
};
const HISTORY = {
  title: 'Log History', activePage: 'history', adminName: 'Tester',
  logs: [{ id: 1, token: 'SES-1', pesan_masuk: 'hi', pesan_keluar: '' }],
  total: 1, perPage: 9, currentPage: 1, totalPages: 1, search: '',
  flash: null, csrfToken: 'a'.repeat(64),
};
const SETTINGS = {
  title: 'Settings', activePage: 'settings', adminName: 'Tester',
  adminEmail: 'admin@smekda.sch.id',
  greeting: 'Greeting text', fallback: 'Fallback text',
  flash: null, formError: null, csrfToken: 'a'.repeat(64),
};
const SUPPORT = {
  title: 'Help & Support', activePage: 'support', adminName: 'Tester',
  flash: null, csrfToken: 'a'.repeat(64),
};
const LOGIN = { error: null, email: '' };

const targets = [
  ['admin/dashboard.ejs', DASHBOARD],
  ['admin/faq.ejs', FAQ],
  ['admin/history.ejs', HISTORY],
  ['admin/settings.ejs', SETTINGS],
  ['admin/support.ejs', SUPPORT],
  ['admin/login.ejs', LOGIN],
];

const rendered = {};
for (const [rel, data] of targets) {
  const full = path.join(VIEWS, rel);
  try {
    rendered[rel] = ejs.render(fs.readFileSync(full, 'utf8'), data, { filename: full });
    console.log('PASS  render ' + rel + ' (' + rendered[rel].length + ' bytes)');
  } catch (e) {
    failures++;
    console.log('FAIL  render ' + rel + ' :: ' + e.message);
  }
}

console.log('\n=== 3. Assert rendered output ===');
const checks = [
  ['faq renders sidebar logo', () => rendered['admin/faq.ejs'].includes('/images/smekda.png')],
  ['faq renders Add New Data button', () => rendered['admin/faq.ejs'].includes('+ Add New Data')],
  ['faq renders search input name="q"', () => rendered['admin/faq.ejs'].includes('name="q"')],
  ['faq renders 5-9 dropdown options', () => ['"5"','"6"','"7"','"8"','"9"'].every((o) => rendered['admin/faq.ejs'].includes('<option value=' + o))],
  ['faq dropdown arrow pinned far right', () => /pointer-events-none absolute inset-y-0 right-0/.test(rendered['admin/faq.ejs'])],
  ['faq renders pagination partial', () => rendered['admin/faq.ejs'].includes('faq-pagination-buttons')],
  ['all 4 nav items present', () => ['/admin/dashboard', '/admin/faq', '/admin/settings', '/admin/support'].every((h) => rendered['admin/dashboard.ejs'].includes('href="' + h + '"'))],
  ['history nav item present', () => rendered['admin/dashboard.ejs'].includes('href="/admin/history"')],
  ['active indicator on dashboard', () => /activePage === 'dashboard' \? navActive : navIdle/.test(rendered['admin/dashboard.ejs'])],
  ['settings posts to /admin/settings/update', () => rendered['admin/settings.ejs'].includes('action="/admin/settings/update"')],
  ['settings has Save Changes capsule', () => rendered['admin/settings.ejs'].includes('Save Changes') && rendered['admin/settings.ejs'].includes('rounded-full')],
  ['settings carries csrf token', () => rendered['admin/settings.ejs'].includes('a'.repeat(64))],
  ['settings binds both textareas', () => rendered['admin/settings.ejs'].includes('name="greeting_message"') && rendered['admin/settings.ejs'].includes('name="fallback_message"')],
  ['settings values from db injected', () => rendered['admin/settings.ejs'].includes('Greeting text') && rendered['admin/settings.ejs'].includes('Fallback text')],
  ['support page renders accordion', () => rendered['admin/support.ejs'].includes('quick-guide-accordion')],
  ['logout form targets /admin/logout', () => rendered['admin/dashboard.ejs'].includes('action="/admin/logout"')],
  ['no unresolved EJS delimiters', () => Object.values(rendered).every((h) => !h.includes('<%') && !h.includes('%>'))],
];

for (const [label, fn] of checks) {
  try {
    if (fn()) console.log('PASS  ' + label);
    else {
      failures++;
      console.log('FAIL  ' + label);
    }
  } catch (e) {
    failures++;
    console.log('FAIL  ' + label + ' :: ' + e.message);
  }
}

console.log('\n=== 4. XSS escaping spot-check ===');
const XSS = Object.assign({}, FAQ, { faqs: [{ id: 1, kode: '<script>alert(1)</script>', isi: '"><img src=x>' }] });
try {
  const f = path.join(VIEWS, 'admin/faq.ejs');
  const out = ejs.render(fs.readFileSync(f, 'utf8'), XSS, { filename: f });
  if (out.includes('<script>alert(1)</script>')) {
    failures++;
    console.log('FAIL  injected kode not escaped');
  } else {
    console.log('PASS  injected kode escaped by <%= %>');
  }
} catch (e) {
  failures++;
  console.log('FAIL  xss check :: ' + e.message);
}

console.log('\n' + (failures === 0 ? 'ALL VIEW CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
