// Вложения (файлы и ссылки). Жизненный цикл файла:
// 1) POST /api/files — файл сохраняется на диск, создаётся запись owner_type='UPLOAD';
// 2) при создании задания/объявления/сдачи запись «закрепляется» за владельцем —
//    это защищает от прикрепления чужих загрузок.
import { all, get, run, now } from '../../core/db.js';
import { badRequest } from '../../core/errors.js';

export type OwnerType = 'COURSEWORK' | 'ANNOUNCEMENT' | 'SUBMISSION';

export interface AttachmentRow {
  id: number;
  owner_type: string;
  owner_id: number;
  kind: 'FILE' | 'LINK';
  title: string | null;
  url: string | null;
  file_name: string | null;
  stored_name: string | null;
  mime: string | null;
  size: number | null;
  uploaded_by: number | null;
  created_at: string;
}

export interface AttachmentInput {
  kind: 'FILE' | 'LINK';
  // для FILE: id записи, созданной при загрузке
  fileId?: number;
  // для LINK:
  url?: string;
  title?: string;
}

export function attachmentsFor(ownerType: string, ownerId: number): AttachmentRow[] {
  return all<AttachmentRow>(
    'SELECT * FROM attachments WHERE owner_type = ? AND owner_id = ? ORDER BY id',
    ownerType,
    ownerId,
  );
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Привязывает набор вложений к владельцу. items приходит из тела запроса.
export function attachItems(
  items: unknown,
  ownerType: OwnerType,
  ownerId: number,
  userId: number,
  maxCount: number,
): void {
  if (items === undefined || items === null) return;
  if (!Array.isArray(items)) throw badRequest('Поле «attachments» должно быть массивом');
  const existing = attachmentsFor(ownerType, ownerId).length;
  if (existing + items.length > maxCount) {
    throw badRequest(`Не более ${maxCount} вложений`);
  }
  for (const raw of items) {
    const item = raw as AttachmentInput;
    if (item.kind === 'FILE') {
      const fileId = Number(item.fileId);
      if (!Number.isInteger(fileId)) throw badRequest('Для файла требуется fileId');
      const row = get<AttachmentRow>('SELECT * FROM attachments WHERE id = ?', fileId);
      if (!row || row.kind !== 'FILE' || row.owner_type !== 'UPLOAD' || row.uploaded_by !== userId) {
        throw badRequest('Файл не найден или уже прикреплён');
      }
      run('UPDATE attachments SET owner_type = ?, owner_id = ? WHERE id = ?', ownerType, ownerId, fileId);
    } else if (item.kind === 'LINK') {
      const url = String(item.url ?? '');
      if (!isHttpUrl(url)) throw badRequest('Некорректная ссылка (нужен http/https)');
      const title = item.title ? String(item.title).slice(0, 300) : null;
      run(
        'INSERT INTO attachments (owner_type, owner_id, kind, title, url, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ownerType, ownerId, 'LINK', title, url, userId, now(),
      );
    } else {
      throw badRequest('Вложение должно иметь kind: FILE или LINK');
    }
  }
}

export function deleteAttachment(id: number): void {
  run('DELETE FROM attachments WHERE id = ?', id);
}
