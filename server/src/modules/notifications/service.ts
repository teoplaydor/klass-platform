// Сервис уведомлений. Внутри приложения уведомления хранятся в БД («колокольчик»).
// Дополнительные каналы (email, Telegram, SMS) подключаются реализацией
// интерфейса NotificationChannel — см. docs/МОДУЛИ.md.
import { run, now } from '../../core/db.js';
import { brand } from '../../config.js';

export type NotificationType =
  | 'NEW_COURSEWORK'
  | 'NEW_ANNOUNCEMENT'
  | 'WORK_RETURNED'
  | 'WORK_TURNED_IN'
  | 'INVITED'
  | 'COMMENT';

export interface NotificationMessage {
  userId: number;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}

export interface NotificationChannel {
  deliver(message: NotificationMessage): void | Promise<void>;
}

const channels: NotificationChannel[] = [];

// Точка расширения: registerChannel(new TelegramChannel(token)) и т. п.
export function registerChannel(channel: NotificationChannel): void {
  channels.push(channel);
}

export function notify(userIds: number[], message: Omit<NotificationMessage, 'userId'>): void {
  if (!brand.features.notifications) return;
  const ts = now();
  for (const userId of userIds) {
    run(
      'INSERT INTO notifications (user_id, type, title, body, link, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      userId,
      message.type,
      message.title,
      message.body ?? null,
      message.link ?? null,
      ts,
    );
    for (const channel of channels) {
      // Внешние каналы не должны ронять основной поток
      Promise.resolve(channel.deliver({ userId, ...message })).catch((e) =>
        console.error('Ошибка канала уведомлений:', e),
      );
    }
  }
}
