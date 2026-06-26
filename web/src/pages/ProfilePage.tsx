// Профиль: данные пользователя и смена пароля.
import { useState, type FormEvent } from 'react';
import { patch, post } from '../api';
import { useAuth, useUser } from '../auth';
import { Field, useToast } from '../components/ui';
import type { User } from '../types';

export function ProfilePage() {
  const user = useUser();
  const { setUser } = useAuth();
  const toast = useToast();

  const [lastName, setLastName] = useState(user.last_name);
  const [firstName, setFirstName] = useState(user.first_name);
  const [middleName, setMiddleName] = useState(user.middle_name ?? '');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await patch<{ user: User }>('/api/auth/profile', { lastName, firstName, middleName });
      setUser(r.user);
      toast.success('Профиль сохранён');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await post('/api/auth/change-password', { oldPassword, newPassword });
      setOldPassword('');
      setNewPassword('');
      toast.success('Пароль изменён');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="content-narrow" style={{ maxWidth: 560 }}>
      <h1 className="mb-16">Профиль</h1>

      <form className="card card-pad mb-16" onSubmit={saveProfile}>
        <h2 className="mb-16">Личные данные</h2>
        <Field label="Электронная почта">
          <input className="input" value={user.email} disabled />
        </Field>
        <Field label="Фамилия">
          <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
        </Field>
        <Field label="Имя">
          <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        </Field>
        <Field label="Отчество">
          <input className="input" value={middleName} onChange={(e) => setMiddleName(e.target.value)} />
        </Field>
        <button className="btn" disabled={busy}>
          Сохранить
        </button>
      </form>

      <form className="card card-pad" onSubmit={changePassword}>
        <h2 className="mb-16">Смена пароля</h2>
        <Field label="Текущий пароль">
          <input
            className="input"
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        <Field label="Новый пароль (не короче 8 символов)">
          <input
            className="input"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>
        <button className="btn" disabled={busy}>
          Изменить пароль
        </button>
      </form>
    </div>
  );
}
