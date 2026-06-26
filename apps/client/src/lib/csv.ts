// Download a list as a CSV file. Uses ';' (FR Excel) + a UTF-8 BOM so accents render.
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
  const esc = (v: string | number | null | undefined) => {
    const s = String(v ?? '');
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + lines], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
