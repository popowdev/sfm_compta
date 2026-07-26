import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthContext';
import { ToastProvider, toast } from '@/components/ui/toast';
import { ConfirmProvider } from '@/components/ui/confirm';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ApiError } from '@/lib/api';
import App from './App';
import './styles/index.css';

function surfaceServerError(err: unknown): void {
  if (err instanceof ApiError && err.status === 429) {
    toast('Tu vas un peu trop vite — patiente quelques secondes.', 'info');
    return;
  }
  if (err instanceof ApiError && err.status >= 500 && err.errorId) {
    toast(`Erreur technique — code ${err.errorId}. Communique-le au staff.`, 'error');
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
  queryCache: new QueryCache({ onError: surfaceServerError }),
  mutationCache: new MutationCache({ onError: surfaceServerError }),
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <ConfirmProvider>
              <ErrorBoundary>
                <App />
              </ErrorBoundary>
            </ConfirmProvider>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
