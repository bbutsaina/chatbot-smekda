const bcrypt = require('bcryptjs');
// A valid bcrypt hash (cost 12) of an unguessable random string. Used as the
// comparison target when the submitted email does not exist, so that a missing
// account and a wrong password take comparable time.
const h = bcrypt.hashSync('irIS2::no-such-account::' + require('crypto').randomBytes(16).toString('hex'), 12);
console.log(h);
console.error('length=' + h.length);