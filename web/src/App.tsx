// Маршрутизация приложения.
import { useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { BrandContext } from './brand';
import { AuthContext } from './auth';
import { ToastProvider } from './components/ui';
import { Shell } from './components/Shell';
import type { BrandConfig, User } from './types';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { CoursePage } from './pages/CoursePage';
import { CourseworkEditorPage } from './pages/CourseworkEditorPage';
import { CourseworkDetailPage } from './pages/CourseworkDetailPage';
import { ReviewPage } from './pages/ReviewPage';
import { TodoPage } from './pages/TodoPage';
import { CalendarPage } from './pages/CalendarPage';
import { ArchivePage } from './pages/ArchivePage';
import { ProfilePage } from './pages/ProfilePage';

export function App({ brand, initialUser }: { brand: BrandConfig; initialUser: User | null }) {
  const [user, setUser] = useState<User | null>(initialUser);

  return (
    <BrandContext.Provider value={brand}>
      <AuthContext.Provider value={{ user, setUser }}>
        <ToastProvider>
          <BrowserRouter>
            {user ? (
              <Shell>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/courses/:courseId" element={<CoursePage />} />
                  <Route path="/courses/:courseId/coursework/new" element={<CourseworkEditorPage />} />
                  <Route path="/courses/:courseId/coursework/:courseworkId" element={<CourseworkDetailPage />} />
                  <Route path="/courses/:courseId/coursework/:courseworkId/edit" element={<CourseworkEditorPage />} />
                  <Route path="/courses/:courseId/coursework/:courseworkId/review" element={<ReviewPage />} />
                  <Route path="/todo" element={<TodoPage />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/archive" element={<ArchivePage />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Shell>
            ) : (
              <Routes>
                <Route path="*" element={<LoginPage />} />
              </Routes>
            )}
          </BrowserRouter>
        </ToastProvider>
      </AuthContext.Provider>
    </BrandContext.Provider>
  );
}
