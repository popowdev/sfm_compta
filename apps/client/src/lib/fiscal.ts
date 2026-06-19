import type { FiscalConfig } from '@rp-compta/shared';
import { apiFetch } from './api';

export const getFiscalConfig = () => apiFetch<FiscalConfig>('/api/fiscal');

export const saveFiscalConfig = (config: FiscalConfig) =>
  apiFetch<FiscalConfig>('/api/fiscal', { method: 'PUT', body: JSON.stringify(config) });
