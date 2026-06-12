// Единый формат ошибок API: { error: { code, message } }.
import type { Request, Response, NextFunction } from 'express';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new ApiError(400, 'BAD_REQUEST', message);
export const unauthorized = (message = 'Требуется вход в систему') => new ApiError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Недостаточно прав') => new ApiError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Не найдено') => new ApiError(404, 'NOT_FOUND', message);
export const conflict = (message: string) => new ApiError(409, 'CONFLICT', message);

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  // Ошибка multer о превышении размера файла
  if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: 'Файл слишком большой' } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Внутренняя ошибка сервера' } });
}
