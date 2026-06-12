// Вход и регистрация.
import { useState, type FormEvent } from 'react';
import { post } from '../api';
import { useBrand } from '../brand';
import { useAuth } from '../auth';
import { Field, useToast } from '../components/ui';
import type { User } from '../types';

export function LoginPage() {
  const brand = useBrand();
  const { setUser } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body =
        mode === 'login'
          ? { email, password }
          : { email, password, lastName, firstName, middleName: middleName || undefined };
      const r = await post<{ user: User }>(`/api/auth/${mode}`, body);
      setUser(r.user);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card card-pad" style={{ width: '100%', maxWidth: 400 }}>
        <div className="row" style={{ marginBottom: 6 }}>
          <span className="logo-mark">{brand.product.logoText}</span>
          <h1>{brand.product.name}</h1>
        </div>
        <p className="muted small mb-16">{brand.product.tagline}</p>

        <form onSubmit={submit}>
          {mode === 'register' && (
            <>
              <Field label="Фамилия">
                <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </Field>
              <Field label="Имя">
                <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </Field>
              <Field label="Отчество (необязательно)">
                <input className="input" value={middleName} onChange={(e) => setMiddleName(e.target.value)} />
              </Field>
            </>
          )}
          <Field label="Электронная почта">
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </Field>
          <Field label="Пароль">
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'register' ? 8 : undefined}
              required
            />
          </Field>
          <button className="btn" style={{ width: '100%' }} disabled={busy}>
            {mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
          </button>
        </form>

        {brand.features.registration && (
          <p className="small muted mt-16" style={{ textAlign: 'center' }}>
            {mode === 'login' ? (
              <>
                Нет аккаунта?{' '}
                <a style={{ cursor: 'pointer' }} onClick={() => setMode('register')}>
                  Зарегистрироваться
                </a>
              </>
            ) : (
              <>
                Уже есть аккаунт?{' '}
                <a style={{ cursor: 'pointer' }} onClick={() => setMode('login')}>
                  Войти
                </a>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
