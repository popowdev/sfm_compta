import { lazyRetry } from '@/lib/lazyRetry';
import { Suspense, type ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { hasAppAccess } from '@rp-compta/shared';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/auth/AuthContext';

const Login = lazyRetry(() => import('@/pages/Login'));
const Dashboard = lazyRetry(() => import('@/pages/Dashboard'));
const Companies = lazyRetry(() => import('@/pages/Companies'));
const Fiscal = lazyRetry(() => import('@/pages/Fiscal'));
const Modules = lazyRetry(() => import('@/pages/Modules'));
const IrsDeclarations = lazyRetry(() => import('@/pages/IrsDeclarations'));
const IrsSubventions = lazyRetry(() => import('@/pages/IrsSubventions'));
const IrsDividends = lazyRetry(() => import('@/pages/IrsDividends'));
const IrsUsers = lazyRetry(() => import('@/pages/IrsUsers'));
const IrsMessages = lazyRetry(() => import('@/pages/IrsMessages'));
const IrsDocuments = lazyRetry(() => import('@/pages/IrsDocuments'));
const IrsAudit = lazyRetry(() => import('@/pages/IrsAudit'));
const TicketLogs = lazyRetry(() => import('@/pages/TicketLogs'));
const EntrepriseIndex = lazyRetry(() => import('@/pages/EntrepriseIndex'));
const ModulePage = lazyRetry(() => import('@/pages/ModulePage'));
const CompanySettings = lazyRetry(() => import('@/pages/CompanySettings'));
const Evenements = lazyRetry(() => import('@/pages/Evenements'));
const MaPaie = lazyRetry(() => import('@/pages/MaPaie'));
const Fivem = lazyRetry(() => import('@/pages/Fivem'));
const Associations = lazyRetry(() => import('@/pages/Associations'));
const Calendrier = lazyRetry(() => import('@/pages/Calendrier'));
const Support = lazyRetry(() => import('@/pages/Support'));
const SupportStaff = lazyRetry(() => import('@/pages/SupportStaff'));
const Annonces = lazyRetry(() => import('@/pages/Annonces'));
const Bourse = lazyRetry(() => import('@/pages/Bourse'));
const AssociationIndex = lazyRetry(() => import('@/pages/AssociationIndex'));
const AssociationMembers = lazyRetry(() => import('@/pages/AssociationMembers'));
const AssociationTresorerie = lazyRetry(() => import('@/pages/AssociationTresorerie'));
const AssociationDocuments = lazyRetry(() => import('@/pages/AssociationDocuments'));
const AssociationSettings = lazyRetry(() => import('@/pages/AssociationSettings'));

function PageLoader() {
  return <div className="p-8 text-sm text-muted-foreground">Chargement…</div>;
}

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

function DevRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user?.isDev) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function ProtectedApp() {
  return (
    <AppLayout>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/entreprise/:slug" element={<EntrepriseIndex />} />
          <Route path="/entreprise/:slug/m/:moduleKey" element={<ModulePage />} />
          <Route path="/entreprise/:slug/parametres" element={<CompanySettings />} />
          <Route path="/entreprise/:slug/evenements" element={<Evenements />} />
          <Route path="/entreprise/:slug/ma-paie" element={<MaPaie />} />
          <Route path="/associations" element={<Associations />} />
          <Route path="/calendrier" element={<Calendrier />} />
          <Route path="/support" element={<Support />} />
          <Route path="/support/:ref" element={<Support />} />
          <Route path="/staff/support" element={<SupportStaff />} />
          <Route path="/staff/support/:ref" element={<SupportStaff />} />
          <Route path="/annonces" element={<Annonces />} />
          <Route path="/bourse" element={<Bourse />} />
          <Route path="/association/:slug" element={<AssociationIndex />} />
          <Route path="/association/:slug/membres" element={<AssociationMembers />} />
          <Route path="/association/:slug/tresorerie" element={<AssociationTresorerie />} />
          <Route path="/association/:slug/documents" element={<AssociationDocuments />} />
          <Route path="/association/:slug/parametres" element={<AssociationSettings />} />
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
            path="/dividendes"
            element={
              <IrsRoute>
                <IrsDividends />
              </IrsRoute>
            }
          />
          <Route
            path="/comptes"
            element={
              <StaffRoute>
                <IrsUsers />
              </StaffRoute>
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
            path="/irs-documents"
            element={
              <IrsRoute>
                <IrsDocuments />
              </IrsRoute>
            }
          />
          <Route
            path="/audit"
            element={
              <IrsRoute>
                <IrsAudit />
              </IrsRoute>
            }
          />
          <Route
            path="/fivem"
            element={
              <StaffRoute>
                <Fivem />
              </StaffRoute>
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
          <Route
            path="/dev/logs-tickets"
            element={
              <DevRoute>
                <TicketLogs />
              </DevRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppLayout>
  );
}

export default function App() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Chargement…</div>}>
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
    </Suspense>
  );
}
