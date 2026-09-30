const bcrypt = require('bcryptjs');
const fake = '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
console.log('dummy hash length:', fake.length, '(valid bcrypt hashes are 60)');
try {
  console.log('compareSync on dummy ->', bcrypt.compareSync('x', fake));
} catch (e) {
  console.log('compareSync THROWS:', e.message);
}
const real = bcrypt.hashSync('admin123', 10);
console.log('real hash length   :', real.length);
console.log('roundtrip correct  :', bcrypt.compareSync('admin123', real));
console.log('roundtrip wrong    :', bcrypt.compareSync('nope', real));