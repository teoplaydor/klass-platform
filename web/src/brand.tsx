// Контекст бренда: конфиг загружается с сервера при старте, поэтому
// ребрендинг (название, цвета, шрифт) не требует пересборки фронтенда.
import { createContext, useContext } from 'react';
import type { BrandConfig } from './types';

export const BrandContext = createContext<BrandConfig | null>(null);

export function useBrand(): BrandConfig {
  const brand = useContext(BrandContext);
  if (!brand) throw new Error('BrandContext не инициализирован');
  return brand;
}

// Переносит токены бренда в CSS-переменные и заголовок документа.
export function applyBrand(brand: BrandConfig): void {
  const root = document.documentElement;
  root.style.setProperty('--brand-primary', brand.theme.colorPrimary);
  root.style.setProperty('--brand-primary-hover', brand.theme.colorPrimaryHover);
  root.style.setProperty('--brand-accent', brand.theme.colorAccent);
  root.style.setProperty('--brand-danger', brand.theme.colorDanger);
  root.style.setProperty('--brand-font', brand.theme.fontFamily);
  root.style.setProperty('--brand-radius', brand.theme.radius);
  document.title = brand.product.name;
}

export function courseColor(brand: BrandConfig, key: string): string {
  return brand.theme.courseColors[key] ?? brand.theme.colorPrimary;
}
