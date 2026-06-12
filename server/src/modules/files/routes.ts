// Модуль «Файлы»: загрузка и скачивание с проверкой прав доступа.
import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs';
import { extname, join } from 'node:path';
import { brand, config } from '../../config.js';
import { get, run, now } from '../../core/db.js';
import { badRequest, forbidden, notFound } from '../../core/errors.js';
import { idParam } from '../../core/validate.js';
import { memberRole } from '../../core/access.js';
import { currentUser, requireAuth } from '../auth/middleware.js';
import type { AttachmentRow } from './attachments.js';

export const filesRouter = Router();
filesRouter.use(requireAuth);

const storage = multer.diskStorage({
  destination: config.uploadsDir,
  filename: (_req, file, cb) => {
    // Расширение сохраняем для удобства просмотра каталога, имя — случайное
    const ext = extname(file.originalname).slice(0, 12).replace(/[^.\w]/g, '');
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: brand.limits.maxUploadSizeMb * 1024 * 1024 },
});

filesRouter.post('/', upload.single('file'), (req, res) => {
  const user = currentUser(req);
  if (!brand.features.fileUploads) throw forbidden('Загрузка файлов отключена');
  if (!req.file) throw badRequest('Файл не передан (поле «file»)');
  // multer отдаёт originalname в latin1 — восстанавливаем UTF-8 (кириллица в именах)
  const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const { lastInsertRowid: id } = run(
    `INSERT INTO attachments (owner_type, owner_id, kind, file_name, stored_name, mime, size, uploaded_by, created_at)
     VALUES ('UPLOAD', ?, 'FILE', ?, ?, ?, ?, ?, ?)`,
    user.id, originalName, req.file.filename, req.file.mimetype, req.file.size, user.id, now(),
  );
  const row = get<AttachmentRow>('SELECT * FROM attachments WHERE id = ?', id);
  res.status(201).json({ file: row });
});

// Доступ к файлу определяется его владельцем (заданием, объявлением, сдачей).
function canAccess(att: AttachmentRow, userId: number): boolean {
  switch (att.owner_type) {
    case 'UPLOAD':
      return att.uploaded_by === userId;
    case 'COURSEWORK': {
      const cw = get<{ course_id: number }>('SELECT course_id FROM coursework WHERE id = ?', att.owner_id);
      return !!cw && memberRole(cw.course_id, userId) !== null;
    }
    case 'ANNOUNCEMENT': {
      const a = get<{ course_id: number }>('SELECT course_id FROM announcements WHERE id = ?', att.owner_id);
      return !!a && memberRole(a.course_id, userId) !== null;
    }
    case 'SUBMISSION': {
      const s = get<{ student_id: number; coursework_id: number }>(
        'SELECT student_id, coursework_id FROM submissions WHERE id = ?',
        att.owner_id,
      );
      if (!s) return false;
      if (s.student_id === userId) return true;
      const cw = get<{ course_id: number }>('SELECT course_id FROM coursework WHERE id = ?', s.coursework_id);
      return !!cw && memberRole(cw.course_id, userId) === 'TEACHER';
    }
    default:
      return false;
  }
}

// Удаление вложения: автор поста/работы или преподаватель курса.
function canDelete(att: AttachmentRow, userId: number): boolean {
  switch (att.owner_type) {
    case 'UPLOAD':
      return att.uploaded_by === userId;
    case 'COURSEWORK': {
      const cw = get<{ course_id: number }>('SELECT course_id FROM coursework WHERE id = ?', att.owner_id);
      return !!cw && memberRole(cw.course_id, userId) === 'TEACHER';
    }
    case 'ANNOUNCEMENT': {
      const a = get<{ course_id: number; author_id: number }>(
        'SELECT course_id, author_id FROM announcements WHERE id = ?', att.owner_id,
      );
      return !!a && (a.author_id === userId || memberRole(a.course_id, userId) === 'TEACHER');
    }
    case 'SUBMISSION': {
      const s = get<{ student_id: number; state: string }>(
        'SELECT student_id, state FROM submissions WHERE id = ?', att.owner_id,
      );
      // Ученик убирает вложение, пока работа не сдана
      return !!s && s.student_id === userId && s.state !== 'TURNED_IN';
    }
    default:
      return false;
  }
}

filesRouter.delete('/:id', (req, res) => {
  const user = currentUser(req);
  const id = idParam(req.params.id);
  const att = get<AttachmentRow>('SELECT * FROM attachments WHERE id = ?', id);
  if (!att) throw notFound('Вложение не найдено');
  if (!canDelete(att, user.id)) throw forbidden('Нет прав на удаление вложения');
  run('DELETE FROM attachments WHERE id = ?', id);
  if (att.kind === 'FILE' && att.stored_name) {
    // Файл на диске удаляем после записи в БД; ошибки диска не критичны
    unlink(join(config.uploadsDir, att.stored_name), () => {});
  }
  res.json({ ok: true });
});

filesRouter.get('/:id', (req, res) => {
  const user = currentUser(req);
  const id = idParam(req.params.id);
  const att = get<AttachmentRow>('SELECT * FROM attachments WHERE id = ?', id);
  if (!att || att.kind !== 'FILE' || !att.stored_name) throw notFound('Файл не найден');
  if (!canAccess(att, user.id)) throw forbidden('Нет доступа к файлу');
  const filename = att.file_name ?? 'file';
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  if (att.mime) res.setHeader('Content-Type', att.mime);
  res.sendFile(join(config.uploadsDir, att.stored_name));
});
