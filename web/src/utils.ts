// Форматирование дат, имён и оценок (русская локаль).
import type { PersonRef } from './types';

export function fullName(p: PersonRef): string {
  return [p.last_name, p.first_name, p.middle_name].filter(Boolean).join(' ');
}

export function shortName(p: PersonRef): string {
  return `${p.last_name} ${p.first_name}`;
}

export function initials(p: PersonRef): string {
  return `${p.last_name[0] ?? ''}${p.first_name[0] ?? ''}`.toUpperCase();
}

const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const dateTimeFmt = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});
const fullFmt = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() ? dateTimeFmt.format(d) : fullFmt.format(d);
}

export function formatDue(iso: string | null): string {
  if (!iso) return 'Без срока';
  return `Срок: ${formatDateTime(iso)}`;
}

export function isOverdue(iso: string | null): boolean {
  return !!iso && Date.parse(iso) < Date.now();
}

// Перевод значения для <input type="datetime-local">
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

// Отображение оценки по шкале курса. Хранение всегда в баллах.
export function formatGrade(
  grade: number | null,
  maxPoints: number | null,
  scale: 'POINTS' | 'FIVE' | 'PERCENT',
): string {
  if (grade === null) return '—';
  if (!maxPoints || scale === 'POINTS') return maxPoints ? `${grade} из ${maxPoints}` : String(grade);
  const ratio = grade / maxPoints;
  if (scale === 'PERCENT') return `${Math.round(ratio * 100)}%`;
  // Пятибалльная шкала: стандартные пороги 85/65/40
  const five = ratio >= 0.85 ? 5 : ratio >= 0.65 ? 4 : ratio >= 0.4 ? 3 : 2;
  return String(five);
}

export function formatBytes(size: number | null): string {
  if (!size) return '';
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} КБ`;
  return `${(size / 1024 / 1024).toFixed(1)} МБ`;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const COURSEWORK_TYPE_LABEL: Record<string, string> = {
  ASSIGNMENT: 'Задание',
  QUIZ: 'Тест',
  QUESTION: 'Вопрос',
  MATERIAL: 'Материал',
};

export const SUBMISSION_STATE_LABEL: Record<string, string> = {
  ASSIGNED: 'Назначено',
  TURNED_IN: 'Сдано',
  RETURNED: 'Проверено',
  RECLAIMED: 'Сдача отменена',
};
