// Маршруты уведомлений («колокольчик»).
import { Router } from 'express';
import { all, get, run } from '../../core/db.js';
import { brand } from '../../config.js';
import { forbidden } from '../../core/errors.js';
import { currentUser, requireAuth } from '../auth/middleware.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);
notificationsRouter.use((_req, _res, next) => {
  if (!brand.features.notifications) throw forbidden('Уведомления отключены');
  next();
});

notificationsRouter.get('/', (req, res) => {
  const user = currentUser(req);
  const items = all(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50',
    user.id,
  );
  const unread = get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0',
    user.id,
  )!.n;
  res.json({ notifications: items, unreadCount: unread });
});

notificationsRouter.post('/read', (req, res) => {
  const user = currentUser(req);
  const ids = req.body?.ids;
  if (Array.isArray(ids) && ids.length > 0) {
    for (const raw of ids) {
      const id = Number(raw);
      if (Number.isInteger(id)) {
        run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', id, user.id);
      }
    }
  } else {
    run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', user.id);
  }
  res.json({ ok: true });
});
