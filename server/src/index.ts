// Точка входа сервера: сборка модулей в одно Express-приложение.
// Каждый модуль — самостоятельный Router; состав определяется этим файлом.
import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { brand, config } from './config.js';
import { errorHandler, notFound } from './core/errors.js';
import { attachUser } from './modules/auth/middleware.js';
import { authRouter } from './modules/auth/routes.js';
import { yandexEnabled, yandexRouter } from './modules/auth/yandex.js';
import { coursesRouter } from './modules/courses/routes.js';
import { topicsRouter } from './modules/topics/routes.js';
import { courseworkRouter } from './modules/coursework/routes.js';
import { submissionsRouter } from './modules/submissions/routes.js';
import { announcementsRouter } from './modules/announcements/routes.js';
import { commentsRouter } from './modules/comments/routes.js';
import { gradesRouter } from './modules/grades/routes.js';
import { filesRouter } from './modules/files/routes.js';
import { notificationsRouter } from './modules/notifications/routes.js';
import { plannerRouter } from './modules/planner/routes.js';
import { commentBankRouter } from './modules/comment-bank/routes.js';
import { quizzesRouter } from './modules/quizzes/routes.js';
import { startScheduler } from './core/scheduler.js';

const app = express();
app.disable('x-powered-by');
// За обратным прокси (nginx) корректно определять протокол и IP клиента
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(attachUser);

// Публичная конфигурация бренда: фронтенд получает её при загрузке,
// поэтому ребрендинг не требует пересборки клиента.
app.get('/api/config', (_req, res) => {
  res.json({
    product: brand.product,
    theme: brand.theme,
    features: brand.features,
    limits: brand.limits,
    auth: { yandex: yandexEnabled },
  });
});

app.use('/api/auth', authRouter);
app.use('/api/auth', yandexRouter);
app.use('/api/courses', coursesRouter);
app.use('/api', topicsRouter);
app.use('/api', courseworkRouter);
app.use('/api', submissionsRouter);
app.use('/api', announcementsRouter);
app.use('/api/comments', commentsRouter);
app.use('/api', gradesRouter);
app.use('/api/files', filesRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api', plannerRouter);
app.use('/api/comment-bank', commentBankRouter);
app.use('/api', quizzesRouter);

app.use('/api', (_req, _res, next) => next(notFound('Маршрут API не найден')));

// Продакшен: сервер отдаёт собранный фронтенд (web/dist) и SPA-fallback.
if (existsSync(config.webDistDir)) {
  app.use(express.static(config.webDistDir));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) {
      next();
      return;
    }
    res.sendFile(join(config.webDistDir, 'index.html'));
  });
}

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`${brand.product.name}: сервер запущен на http://localhost:${config.port}`);
});

startScheduler();
