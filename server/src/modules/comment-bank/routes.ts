// Модуль «Банк комментариев»: личные быстрые ответы преподавателя для проверки работ.
import { Router } from 'express';
import { all, get, run, now } from '../../core/db.js';
import { notFound, forbidden } from '../../core/errors.js';
import { str, idParam } from '../../core/validate.js';
import { currentUser, requireAuth } from '../auth/middleware.js';

export const commentBankRouter = Router();
commentBankRouter.use(requireAuth);

commentBankRouter.get('/', (req, res) => {
  const user = currentUser(req);
  res.json({
    items: all('SELECT * FROM comment_bank WHERE user_id = ? ORDER BY id DESC', user.id),
  });
});

commentBankRouter.post('/', (req, res) => {
  const user = currentUser(req);
  const text = str(req.body, 'text', { max: 2000 });
  const { lastInsertRowid: id } = run(
    'INSERT INTO comment_bank (user_id, text, created_at) VALUES (?, ?, ?)',
    user.id, text, now(),
  );
  res.status(201).json({ item: get('SELECT * FROM comment_bank WHERE id = ?', id) });
});

commentBankRouter.delete('/:id', (req, res) => {
  const user = currentUser(req);
  const id = idParam(req.params.id);
  const row = get<{ user_id: number }>('SELECT user_id FROM comment_bank WHERE id = ?', id);
  if (!row) throw notFound('Запись не найдена');
  if (row.user_id !== user.id) throw forbidden();
  run('DELETE FROM comment_bank WHERE id = ?', id);
  res.json({ ok: true });
});
