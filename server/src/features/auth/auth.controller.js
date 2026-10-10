import * as authService from './auth.service.js';

export async function login(req, res) {
  const { username, password } = req.body;

  const user = await authService.login({
    username,
    password,
    ip: req.ip,
    userAgent: req.get('user-agent') ?? null,
  });

  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  res.json({ user });
}
