// Сервис тестов: валидация вопросов и автопроверка ответов.
import { all, get, run } from '../../core/db.js';
import { badRequest, conflict } from '../../core/errors.js';

export interface QuizQuestionRow {
  id: number;
  coursework_id: number;
  type: 'SINGLE' | 'MULTI' | 'TEXT';
  text: string;
  options: string | null; // JSON-массив строк
  correct: string;        // JSON: число | число[] | строка[]
  points: number;
  position: number;
}

export function questionsOf(courseworkId: number): QuizQuestionRow[] {
  return all<QuizQuestionRow>(
    'SELECT * FROM quiz_questions WHERE coursework_id = ? ORDER BY position, id',
    courseworkId,
  );
}

// Версия вопроса для ученика: без правильных ответов.
export function studentView(q: QuizQuestionRow) {
  return {
    id: q.id,
    type: q.type,
    text: q.text,
    options: q.options ? (JSON.parse(q.options) as string[]) : null,
    points: q.points,
    position: q.position,
  };
}

export function teacherView(q: QuizQuestionRow) {
  return { ...studentView(q), correct: JSON.parse(q.correct) as unknown };
}

interface QuestionInput {
  type?: unknown;
  text?: unknown;
  options?: unknown;
  correct?: unknown;
  points?: unknown;
}

// Есть ли уже ответы учеников на вопросы этого теста.
export function hasStudentAnswers(courseworkId: number): boolean {
  return !!get(
    `SELECT 1 FROM quiz_answers a JOIN quiz_questions q ON q.id = a.question_id
     WHERE q.coursework_id = ? LIMIT 1`,
    courseworkId,
  );
}

// Полная замена вопросов теста. Возвращает суммарный балл.
// Запрещена после того, как ученики начали отвечать: каскадное удаление
// вопросов стёрло бы их ответы и результаты автопроверки.
export function replaceQuestions(courseworkId: number, rawQuestions: unknown): number {
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0 || rawQuestions.length > 100) {
    throw badRequest('Тест должен содержать от 1 до 100 вопросов');
  }
  if (hasStudentAnswers(courseworkId)) {
    throw conflict(
      'Ученики уже отвечали на этот тест — изменение вопросов удалило бы их ответы. Создайте копию задания.',
    );
  }
  run('DELETE FROM quiz_questions WHERE coursework_id = ?', courseworkId);
  let total = 0;
  rawQuestions.forEach((raw: QuestionInput, index: number) => {
    const type = String(raw.type ?? '');
    if (!['SINGLE', 'MULTI', 'TEXT'].includes(type)) {
      throw badRequest(`Вопрос ${index + 1}: тип должен быть SINGLE, MULTI или TEXT`);
    }
    const text = String(raw.text ?? '').trim();
    if (!text) throw badRequest(`Вопрос ${index + 1}: текст обязателен`);
    const points = Number(raw.points ?? 1);
    if (!Number.isFinite(points) || points < 0 || points > 1000) {
      throw badRequest(`Вопрос ${index + 1}: некорректные баллы`);
    }

    let options: string[] | null = null;
    let correct: unknown;
    if (type === 'TEXT') {
      const variants = Array.isArray(raw.correct) ? raw.correct : [raw.correct];
      const cleaned = variants.map((v) => String(v ?? '').trim()).filter(Boolean);
      if (cleaned.length === 0) throw badRequest(`Вопрос ${index + 1}: укажите хотя бы один верный ответ`);
      correct = cleaned;
    } else {
      if (!Array.isArray(raw.options) || raw.options.length < 2 || raw.options.length > 20) {
        throw badRequest(`Вопрос ${index + 1}: нужно от 2 до 20 вариантов ответа`);
      }
      options = raw.options.map((o) => String(o ?? '').trim());
      if (options.some((o) => !o)) throw badRequest(`Вопрос ${index + 1}: пустой вариант ответа`);
      if (type === 'SINGLE') {
        const idx = Number(raw.correct);
        if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) {
          throw badRequest(`Вопрос ${index + 1}: некорректный верный вариант`);
        }
        correct = idx;
      } else {
        const idxs = Array.isArray(raw.correct) ? raw.correct.map(Number) : [];
        if (idxs.length === 0 || idxs.some((i) => !Number.isInteger(i) || i < 0 || i >= (options as string[]).length)) {
          throw badRequest(`Вопрос ${index + 1}: некорректный список верных вариантов`);
        }
        correct = [...new Set(idxs)].sort((a, b) => a - b);
      }
    }
    run(
      'INSERT INTO quiz_questions (coursework_id, type, text, options, correct, points, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
      courseworkId, type, text, options ? JSON.stringify(options) : null, JSON.stringify(correct), points, index,
    );
    total += points;
  });
  return total;
}

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/ё/g, 'е');

// Проверяет один ответ, возвращает начисленные баллы.
function gradeAnswer(q: QuizQuestionRow, answer: unknown): number {
  // Отсутствие ответа — всегда 0 баллов (без приведения null к числу 0,
  // иначе пропущенный вопрос с верным вариантом №0 получал бы полный балл)
  if (answer === null || answer === undefined || answer === '') return 0;
  const correct = JSON.parse(q.correct) as unknown;
  if (q.type === 'SINGLE') {
    return Number(answer) === Number(correct) ? q.points : 0;
  }
  if (q.type === 'MULTI') {
    if (!Array.isArray(answer)) return 0;
    const given = [...new Set(answer.map(Number))].sort((a, b) => a - b);
    const expected = correct as number[];
    return given.length === expected.length && given.every((v, i) => v === expected[i]) ? q.points : 0;
  }
  // TEXT
  const given = normalize(String(answer ?? ''));
  if (!given) return 0;
  return (correct as string[]).some((c) => normalize(c) === given) ? q.points : 0;
}

// Сохраняет ответы ученика (без проверки) — до сдачи.
export function saveAnswers(submissionId: number, courseworkId: number, rawAnswers: unknown): void {
  if (typeof rawAnswers !== 'object' || rawAnswers === null) {
    throw badRequest('Ожидается объект answers: {questionId: ответ}');
  }
  const questions = new Map(questionsOf(courseworkId).map((q) => [q.id, q]));
  for (const [qidRaw, answer] of Object.entries(rawAnswers as Record<string, unknown>)) {
    const qid = Number(qidRaw);
    if (!questions.has(qid)) throw badRequest('Ответ на вопрос не из этого теста');
    run(
      `INSERT INTO quiz_answers (submission_id, question_id, answer) VALUES (?, ?, ?)
       ON CONFLICT(submission_id, question_id) DO UPDATE SET answer = excluded.answer, awarded = NULL`,
      submissionId, qid, JSON.stringify(answer ?? null),
    );
  }
}

// Автопроверка всех ответов сдачи. Возвращает итоговый балл.
export function autograde(submissionId: number, courseworkId: number): number {
  let total = 0;
  for (const q of questionsOf(courseworkId)) {
    const row = get<{ answer: string | null }>(
      'SELECT answer FROM quiz_answers WHERE submission_id = ? AND question_id = ?',
      submissionId, q.id,
    );
    const answer = row?.answer ? (JSON.parse(row.answer) as unknown) : null;
    const awarded = gradeAnswer(q, answer);
    run(
      `INSERT INTO quiz_answers (submission_id, question_id, answer, awarded) VALUES (?, ?, ?, ?)
       ON CONFLICT(submission_id, question_id) DO UPDATE SET awarded = excluded.awarded`,
      submissionId, q.id, JSON.stringify(answer), awarded,
    );
    total += awarded;
  }
  return total;
}

export function answersOf(submissionId: number) {
  return all<{ question_id: number; answer: string | null; awarded: number | null }>(
    'SELECT question_id, answer, awarded FROM quiz_answers WHERE submission_id = ?',
    submissionId,
  ).map((r) => ({
    questionId: r.question_id,
    answer: r.answer ? (JSON.parse(r.answer) as unknown) : null,
    awarded: r.awarded,
  }));
}
