import { type ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { hasAppAccess } from '@rp-compta/shared';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Companies from '@/pages/Companies';
import Fiscal from '@/pages/Fiscal';
import Modules from '@/pages/Modules';
import IrsDeclarations from '@/pages/IrsDeclarations';
import IrsSubventions from '@/pages/IrsSubventions';
import IrsMessages from '@/pages/IrsMessages';
import EntrepriseIndex from '@/pages/EntrepriseIndex';
import ModulePage from '@/pages/ModulePage';
import CompanySettings from '@/pages/CompanySettings';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/auth/AuthContext';

function IrsRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!hasAppAccess(user?.appRoles ?? [], 'irs')) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function StaffRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!(user?.appRoles ?? []).includes('staff')) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function ProtectedApp() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/entreprise/:id" element={<EntrepriseIndex />} />
        <Route path="/entreprise/:id/m/:moduleKey" element={<ModulePage />} />
        <Route path="/entreprise/:id/parametres" element={<CompanySettings />} />
        <Route
          path="/entreprises"
          element={
            <IrsRoute>
              <Companies />
            </IrsRoute>
          }
        />
        <Route
          path="/bareme"
          element={
            <IrsRoute>
              <Fiscal />
            </IrsRoute>
          }
        />
        <Route
          path="/declarations"
          element={
            <IrsRoute>
              <IrsDeclarations />
            </IrsRoute>
          }
        />
        <Route
          path="/subventions"
          element={
            <IrsRoute>
              <IrsSubventions />
            </IrsRoute>
          }
        />
        <Route
          path="/messages"
          element={
            <IrsRoute>
              <IrsMessages />
            </IrsRoute>
          }
        />
        <Route
          path="/modules"
          element={
            <StaffRoute>
              <Modules />
            </StaffRoute>
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
