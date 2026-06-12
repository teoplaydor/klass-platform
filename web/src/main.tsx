// Старт приложения: загружаем бренд-конфиг и сессию, затем рендерим.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { get } from './api';
import { applyBrand } from './brand';
import type { BrandConfig, User } from './types';
import { App } from './App';
import './theme.css';

async function bootstrap() {
  try {
    const [brand, me] = await Promise.all([
      get<BrandConfig>('/api/config'),
      get<{ user: User | null }>('/api/auth/me').catch(() => ({ user: null })),
    ]);
    applyBrand(brand);
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App brand={brand} initialUser={me.user} />
      </StrictMode>,
    );
  } catch {
    document.title = 'Сервис недоступен';
    document.getElementById('root')!.innerHTML =
      '<div style="display:flex;min-height:100vh;align-items:center;justify-content:center;font-family:system-ui">' +
      '<div style="text-align:center"><h2>Сервис временно недоступен</h2>' +
      '<p>Не удалось связаться с сервером. Обновите страницу через минуту.</p></div></div>';
  }
}

void bootstrap();
