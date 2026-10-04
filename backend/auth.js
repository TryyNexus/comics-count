const jwt = require('jsonwebtoken');
const { db } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'comics-count-secret-super-secure-key-2026';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, display_name: user.display_name },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function authMiddleware(req, res, next) {
  // Support Authorization header or query token
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Autenticazione richiesta. Effettua il login.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Verify user still exists in database
    const user = db.prepare('SELECT id, username, display_name FROM users WHERE id = ?').get(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'Utente non trovato o sessione scaduta.' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sessione non valida o scaduta. Effettua nuovamente il login.' });
  }
}

module.exports = {
  authMiddleware,
  generateToken,
  JWT_SECRET
};
