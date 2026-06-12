// Демонстрационные данные: учитель, ученики, два курса с заданиями,
// тестом, объявлениями, сдачами и оценками. Запуск: npm run seed
import { get, run, now, tx } from './core/db.js';
import { hashPassword } from './modules/auth/passwords.js';

if (get('SELECT id FROM users LIMIT 1')) {
  console.log('БД уже содержит данные — сид пропущен. Удалите server/data/platform.db для пересоздания.');
  process.exit(0);
}

const ts = now();
const iso = (daysFromNow: number, hour = 23, minute = 59) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

function addUser(email: string, lastName: string, firstName: string, middleName: string | null, role = 'USER'): number {
  return run(
    'INSERT INTO users (email, password_hash, last_name, first_name, middle_name, global_role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    email, hashPassword('demo1234'), lastName, firstName, middleName, role, ts,
  ).lastInsertRowid;
}

tx(() => {
  const teacher = addUser('teacher@demo.ru', 'Иванова', 'Мария', 'Сергеевна');
  const teacher2 = addUser('teacher2@demo.ru', 'Кузнецов', 'Андрей', 'Павлович');
  const students = [
    addUser('student1@demo.ru', 'Петров', 'Алексей', 'Дмитриевич'),
    addUser('student2@demo.ru', 'Сидорова', 'Анна', 'Игоревна'),
    addUser('student3@demo.ru', 'Волков', 'Никита', 'Андреевич'),
    addUser('student4@demo.ru', 'Морозова', 'Дарья', 'Олеговна'),
    addUser('student5@demo.ru', 'Лебедев', 'Максим', 'Витальевич'),
  ];
  addUser('admin@demo.ru', 'Администратор', 'Платформы', null, 'ADMIN');

  // ---------- Курс 1: Алгебра ----------
  const algebra = run(
    `INSERT INTO courses (name, section, subject, room, description, owner_id, enrollment_code, theme_color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    'Алгебра', '9 «Б»', 'Математика', 'Кабинет 214',
    'Курс алгебры за 9 класс: квадратичные функции, уравнения и неравенства, прогрессии.',
    teacher, 'ALG9B24', 'blue', ts, ts,
  ).lastInsertRowid;
  run("INSERT INTO course_members (course_id, user_id, role, joined_at) VALUES (?, ?, 'TEACHER', ?)", algebra, teacher, ts);
  run("INSERT INTO course_members (course_id, user_id, role, joined_at) VALUES (?, ?, 'TEACHER', ?)", algebra, teacher2, ts);
  for (const s of students) {
    run("INSERT INTO course_members (course_id, user_id, role, joined_at) VALUES (?, ?, 'STUDENT', ?)", algebra, s, ts);
  }

  const tFunc = run('INSERT INTO topics (course_id, name, position) VALUES (?, ?, 1)', algebra, 'Квадратичная функция').lastInsertRowid;
  const tEq = run('INSERT INTO topics (course_id, name, position) VALUES (?, ?, 2)', algebra, 'Уравнения и неравенства').lastInsertRowid;

  // Задание со сдачами в разных состояниях
  const hw1 = run(
    `INSERT INTO coursework (course_id, topic_id, type, title, description, max_points, due_at, state, allow_late, created_by, created_at, updated_at)
     VALUES (?, ?, 'ASSIGNMENT', ?, ?, 10, ?, 'PUBLISHED', 1, ?, ?, ?)`,
    algebra, tFunc,
    'Построение графика квадратичной функции',
    'Постройте графики функций y = x² − 4x + 3 и y = −2x² + 8x − 6.\n\nДля каждой функции укажите: вершину параболы, ось симметрии, нули функции, промежутки возрастания и убывания.\n\nРаботу выполните в тетради, приложите фотографию или скан.',
    iso(2, 18, 0), teacher, ts, ts,
  ).lastInsertRowid;

  // Сдачи: один вернул с оценкой, один сдал, остальные — назначено
  const sub1 = run(
    "INSERT INTO submissions (coursework_id, student_id, state, answer_text, draft_grade, grade, turned_in_at, returned_at, updated_at) VALUES (?, ?, 'RETURNED', ?, 9, 9, ?, ?, ?)",
    hw1, students[0], 'Графики построил, фото приложить не смог — опишу словами: вершина первой параболы (2; −1), нули x=1 и x=3.', iso(-1, 16, 20), iso(-1, 19, 0), ts,
  ).lastInsertRowid;
  run("INSERT INTO submission_events (submission_id, actor_id, event, payload, created_at) VALUES (?, ?, 'TURNED_IN', NULL, ?)", sub1, students[0], iso(-1, 16, 20));
  run("INSERT INTO submission_events (submission_id, actor_id, event, payload, created_at) VALUES (?, ?, 'RETURNED', ?, ?)", sub1, teacher, '{"grade":9}', iso(-1, 19, 0));
  run("INSERT INTO comments (scope, scope_id, author_id, text, created_at) VALUES ('SUBMISSION', ?, ?, ?, ?)", sub1, teacher, 'Хорошая работа. В следующий раз приложите фото построения — за оформление снят один балл.', iso(-1, 19, 1));

  const sub2 = run(
    "INSERT INTO submissions (coursework_id, student_id, state, answer_text, turned_in_at, updated_at) VALUES (?, ?, 'TURNED_IN', ?, ?, ?)",
    hw1, students[1], 'Выполнила оба графика, файл с фотографией приложу позже.', iso(0, 9, 45), ts,
  ).lastInsertRowid;
  run("INSERT INTO submission_events (submission_id, actor_id, event, payload, created_at) VALUES (?, ?, 'TURNED_IN', NULL, ?)", sub2, students[1], iso(0, 9, 45));

  // Тест с автопроверкой
  const quiz1 = run(
    `INSERT INTO coursework (course_id, topic_id, type, title, description, max_points, due_at, state, allow_late, quiz_show_score, created_by, created_at, updated_at)
     VALUES (?, ?, 'QUIZ', ?, ?, 5, ?, 'PUBLISHED', 1, 1, ?, ?, ?)`,
    algebra, tEq,
    'Проверочная работа: квадратные уравнения',
    'Тест по теме «Квадратные уравнения». На выполнение отводится одна попытка, баллы видны сразу после сдачи.',
    iso(4, 20, 0), teacher, ts, ts,
  ).lastInsertRowid;
  run(
    `INSERT INTO quiz_questions (coursework_id, type, text, options, correct, points, position) VALUES (?, 'SINGLE', ?, ?, ?, 1, 0)`,
    quiz1, 'Сколько корней имеет уравнение x² − 6x + 9 = 0?',
    JSON.stringify(['Ни одного', 'Один', 'Два', 'Бесконечно много']), '1',
  );
  run(
    `INSERT INTO quiz_questions (coursework_id, type, text, options, correct, points, position) VALUES (?, 'SINGLE', ?, ?, ?, 1, 1)`,
    quiz1, 'Чему равен дискриминант уравнения 2x² − 5x + 2 = 0?',
    JSON.stringify(['9', '17', '25', '41']), '0',
  );
  run(
    `INSERT INTO quiz_questions (coursework_id, type, text, options, correct, points, position) VALUES (?, 'MULTI', ?, ?, ?, 2, 2)`,
    quiz1, 'Отметьте уравнения, которые являются квадратными:',
    JSON.stringify(['3x + 1 = 0', 'x² = 16', '5x² − x + 2 = 0', '1/x² = 4']), '[1,2]',
  );
  run(
    `INSERT INTO quiz_questions (coursework_id, type, text, options, correct, points, position) VALUES (?, 'TEXT', ?, NULL, ?, 1, 3)`,
    quiz1, 'Запишите больший корень уравнения x² − 5x + 6 = 0 (только число).',
    JSON.stringify(['3']),
  );

  // Вопрос для обсуждения
  run(
    `INSERT INTO coursework (course_id, topic_id, type, title, description, max_points, due_at, state, allow_late, created_by, created_at, updated_at)
     VALUES (?, ?, 'QUESTION', ?, ?, 2, ?, 'PUBLISHED', 1, ?, ?, ?)`,
    algebra, tEq,
    'Где в жизни встречаются квадратичные зависимости?',
    'Приведите один пример из физики, экономики или повседневной жизни, где величина зависит от другой по квадратичному закону. Объясните, почему.',
    iso(6, 20, 0), teacher, ts, ts,
  );

  // Материал
  run(
    `INSERT INTO coursework (course_id, topic_id, type, title, description, state, created_by, created_at, updated_at)
     VALUES (?, ?, 'MATERIAL', ?, ?, 'PUBLISHED', ?, ?, ?)`,
    algebra, tFunc,
    'Конспект: свойства квадратичной функции',
    'Опорный конспект по свойствам функции y = ax² + bx + c: направление ветвей, вершина, ось симметрии, наибольшее и наименьшее значения. Используйте при подготовке к контрольной.',
    teacher, ts, ts,
  );

  // Черновик задания (виден только учителю)
  run(
    `INSERT INTO coursework (course_id, topic_id, type, title, description, max_points, state, created_by, created_at, updated_at)
     VALUES (?, ?, 'ASSIGNMENT', ?, ?, 20, 'DRAFT', ?, ?, ?)`,
    algebra, tEq,
    'Контрольная работа за четверть',
    'Черновик: итоговая контрольная по темам четверти. Опубликовать после прохождения прогрессий.',
    teacher, ts, ts,
  );

  // Объявления
  const ann1 = run(
    `INSERT INTO announcements (course_id, author_id, text, state, pinned, created_at, updated_at) VALUES (?, ?, ?, 'PUBLISHED', 1, ?, ?)`,
    algebra, teacher,
    'Уважаемые ученики! Контрольная работа по теме «Квадратичная функция» пройдёт в следующий четверг. На уроке в понедельник разберём типовые задания — приходите с вопросами.',
    iso(-2, 10, 0), iso(-2, 10, 0),
  ).lastInsertRowid;
  run("INSERT INTO comments (scope, scope_id, author_id, text, created_at) VALUES ('ANNOUNCEMENT', ?, ?, ?, ?)", ann1, students[2], 'А будут ли задачи с параметром?', iso(-2, 12, 30));
  run("INSERT INTO comments (scope, scope_id, author_id, text, created_at) VALUES ('ANNOUNCEMENT', ?, ?, ?, ?)", ann1, teacher, 'Нет, задачи с параметром останутся на факультатив.', iso(-2, 13, 5));

  run(
    `INSERT INTO announcements (course_id, author_id, text, state, created_at, updated_at) VALUES (?, ?, ?, 'PUBLISHED', ?, ?)`,
    algebra, teacher,
    'Выложила конспект по свойствам квадратичной функции в раздел «Задания» — он пригодится при выполнении домашней работы.',
    iso(-1, 9, 0), iso(-1, 9, 0),
  );

  // ---------- Курс 2: Информатика ----------
  const cs = run(
    `INSERT INTO courses (name, section, subject, room, description, owner_id, enrollment_code, theme_color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    'Информатика', '9 «Б»', 'Информатика', 'Кабинет 318',
    'Основы программирования на Python: переменные, циклы, функции, работа со строками.',
    teacher2, 'INF9B24', 'teal', ts, ts,
  ).lastInsertRowid;
  run("INSERT INTO course_members (course_id, user_id, role, joined_at) VALUES (?, ?, 'TEACHER', ?)", cs, teacher2, ts);
  for (const s of [students[0], students[1], students[2]]) {
    run("INSERT INTO course_members (course_id, user_id, role, joined_at) VALUES (?, ?, 'STUDENT', ?)", cs, s, ts);
  }
  // Учитель алгебры здесь — ученик (демонстрация ролей на уровне курса)
  run("INSERT INTO course_members (course_id, user_id, role, joined_at) VALUES (?, ?, 'STUDENT', ?)", cs, teacher, ts);

  const tPy = run('INSERT INTO topics (course_id, name, position) VALUES (?, ?, 1)', cs, 'Циклы и условия').lastInsertRowid;
  run(
    `INSERT INTO coursework (course_id, topic_id, type, title, description, max_points, due_at, state, allow_late, created_by, created_at, updated_at)
     VALUES (?, ?, 'ASSIGNMENT', ?, ?, 15, ?, 'PUBLISHED', 0, ?, ?, ?)`,
    cs, tPy,
    'Практика: цикл while',
    'Напишите программу, которая запрашивает числа до тех пор, пока пользователь не введёт 0, после чего выводит сумму и среднее арифметическое введённых чисел.\n\nПриложите файл .py или вставьте код текстом в поле ответа.',
    iso(1, 21, 0), teacher2, ts, ts,
  );

  run(
    `INSERT INTO announcements (course_id, author_id, text, state, created_at, updated_at) VALUES (?, ?, ?, 'PUBLISHED', ?, ?)`,
    cs, teacher2,
    'Напоминаю: завтра занятие пройдёт в компьютерном классе 318. С собой — тетрадь и выполненное домашнее задание.',
    iso(0, 8, 30), iso(0, 8, 30),
  );

  // Уведомления для демонстрации «колокольчика»
  run(
    "INSERT INTO notifications (user_id, type, title, body, link, created_at) VALUES (?, 'WORK_RETURNED', ?, ?, ?, ?)",
    students[0], 'Работа проверена: 9 из 10', 'Построение графика квадратичной функции', `/courses/${algebra}/coursework/${hw1}`, iso(-1, 19, 0),
  );
  run(
    "INSERT INTO notifications (user_id, type, title, body, link, created_at) VALUES (?, 'WORK_TURNED_IN', ?, ?, ?, ?)",
    teacher, 'Сидорова Анна: сдана работа', 'Построение графика квадратичной функции', `/courses/${algebra}/coursework/${hw1}/review`, iso(0, 9, 45),
  );

  // Банк комментариев учителя
  run("INSERT INTO comment_bank (user_id, text, created_at) VALUES (?, ?, ?)", teacher, 'Отличная работа, так держать.', ts);
  run("INSERT INTO comment_bank (user_id, text, created_at) VALUES (?, ?, ?)", teacher, 'Проверьте вычисления во втором пункте — там арифметическая ошибка.', ts);
  run("INSERT INTO comment_bank (user_id, text, created_at) VALUES (?, ?, ?)", teacher, 'Не хватает обоснования. Допишите, почему выбран именно этот способ решения.', ts);
});

console.log('Демо-данные созданы.');
console.log('Учитель:  teacher@demo.ru / demo1234');
console.log('Ученик:   student1@demo.ru / demo1234');
console.log('Админ:    admin@demo.ru / demo1234');
