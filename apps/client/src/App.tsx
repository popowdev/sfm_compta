import { type ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Companies from '@/pages/Companies';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/auth/AuthContext';

function IrsRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user?.appRoles.includes('irs')) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function ProtectedApp() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route
          path="/entreprises"
          element={
            <IrsRoute>
              <Companies />
            </IrsRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <ProtectedApp />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
