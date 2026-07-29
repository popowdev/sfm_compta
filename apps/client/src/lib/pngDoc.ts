const FONT = 'Arial, Helvetica, sans-serif';
const DARK = '#0f172a';
const ACCENT = '#10b981';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const W = 800;
const H = 1120;

function esc(s: string): string {
  return String(s ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function wrap(text: string, max: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((`${cur} ${w}`).trim().length > max) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = (`${cur} ${w}`).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function header(companyName: string, title: string, rightTop: string): string {
  return `
    <rect x="0" y="0" width="${W}" height="110" fill="${DARK}"/>
    <text x="40" y="52" font-family="${FONT}" font-size="26" font-weight="700" fill="#ffffff">${esc(companyName)}</text>
    <text x="40" y="84" font-family="${FONT}" font-size="15" font-weight="700" fill="${ACCENT}" letter-spacing="1">${esc(title)}</text>
    <text x="${W - 40}" y="52" font-family="${FONT}" font-size="13" fill="#94a3b8" text-anchor="end">${esc(rightTop)}</text>
  `;
}

function frame(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>
    ${body}
    <text x="${W / 2}" y="${H - 28}" font-family="${FONT}" font-size="11" fill="${MUTED}" text-anchor="middle">Document généré via RP Compta</text>
  </svg>`;
}

export function downloadSvgAsPng(svg: string, filename: string, scale = 2): void {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      URL.revokeObjectURL(url);
      return;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob((png) => {
      if (!png) return;
      const a = document.createElement('a');
      const href = URL.createObjectURL(png);
      a.href = href;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1500);
    }, 'image/png');
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert('Échec de la génération du PNG.');
  };
  img.src = url;
}

export interface ContractData {
  companyName: string;
  employeeName: string;
  positionLabel: string;
  contractLabel: string;
  hireDate: string;
  dateOfBirth: string;
  hourlyRate: number;
  commissionRate: number;
  today: string;
}

export function buildContractSvg(d: ContractData): string {
  const rows: [string, string][] = [
    ['Poste', d.positionLabel],
    ['Type de contrat', d.contractLabel],
    ["Date d'embauche", d.hireDate || '—'],
    ['Date de naissance', d.dateOfBirth || '—'],
    ['Rémunération', `${Math.round(d.hourlyRate)} $/h${d.commissionRate > 0 ? ` + ${d.commissionRate}% de commission` : ''}`],
  ];
  let y = 175;
  const intro = wrap(
    `Le présent contrat de travail est établi entre l'entreprise ${d.companyName}, ci-après « l'employeur », et ${d.employeeName}, ci-après « le salarié ».`,
    78,
  )
    .map((l) => `<text x="40" y="${(y += 24) - 24}" font-family="${FONT}" font-size="15" fill="${DARK}">${esc(l)}</text>`)
    .join('');

  y += 20;
  const fields = rows
    .map(([k, v]) => {
      const yy = (y += 38);
      return `
        <text x="40" y="${yy}" font-family="${FONT}" font-size="13" fill="${MUTED}">${esc(k)}</text>
        <text x="280" y="${yy}" font-family="${FONT}" font-size="15" font-weight="600" fill="${DARK}">${esc(v)}</text>
        <line x1="40" y1="${yy + 12}" x2="${W - 40}" y2="${yy + 12}" stroke="${LINE}"/>`;
    })
    .join('');

  y += 50;
  const clause = wrap(
    `Le salarié s'engage à respecter le règlement intérieur de l'entreprise et la législation en vigueur dans l'État de San Andreas. Ce contrat prend effet à la date d'embauche indiquée et peut être rompu selon les conditions légales applicables.`,
    82,
  )
    .map((l) => `<text x="40" y="${(y += 22) - 22}" font-family="${FONT}" font-size="13" fill="#334155">${esc(l)}</text>`)
    .join('');

  const sigY = 940;
  const sign = `
    <text x="160" y="${sigY}" font-family="${FONT}" font-size="13" fill="${MUTED}" text-anchor="middle">L'employeur</text>
    <line x1="60" y1="${sigY + 48}" x2="260" y2="${sigY + 48}" stroke="${DARK}"/>
    <text x="${W - 160}" y="${sigY}" font-family="${FONT}" font-size="13" fill="${MUTED}" text-anchor="middle">Le salarié</text>
    <text x="${W - 160}" y="${sigY + 70}" font-family="${FONT}" font-size="13" font-weight="600" fill="${DARK}" text-anchor="middle">${esc(d.employeeName)}</text>
    <line x1="${W - 260}" y1="${sigY + 48}" x2="${W - 60}" y2="${sigY + 48}" stroke="${DARK}"/>`;

  return frame(
    `${header(d.companyName, 'CONTRAT DE TRAVAIL', `Fait le ${d.today}`)}${intro}${fields}${clause}${sign}`,
  );
}

export interface InvoiceLine {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}
export interface InvoiceData {
  companyName: string;
  saleId: number;
  date: string;
  clientName: string;
  sellerName: string;
  paymentLabel: string;
  lines: InvoiceLine[];
  subtotal: number;
  discount: number;
  total: number;
}

export function buildInvoiceSvg(d: InvoiceData): string {
  let y = 165;
  const meta = `
    <text x="40" y="${y}" font-family="${FONT}" font-size="14" fill="${MUTED}">Client : <tspan font-weight="600" fill="${DARK}">${esc(d.clientName)}</tspan></text>
    <text x="${W - 40}" y="${y}" font-family="${FONT}" font-size="14" fill="${MUTED}" text-anchor="end">Vendeur : <tspan font-weight="600" fill="${DARK}">${esc(d.sellerName)}</tspan></text>`;

  y += 40;
  const thY = y;
  const tableHead = `
    <rect x="40" y="${thY - 18}" width="${W - 80}" height="28" fill="#f1f5f9"/>
    <text x="52" y="${thY}" font-family="${FONT}" font-size="12" font-weight="700" fill="${MUTED}">DÉSIGNATION</text>
    <text x="520" y="${thY}" font-family="${FONT}" font-size="12" font-weight="700" fill="${MUTED}" text-anchor="end">QTÉ</text>
    <text x="640" y="${thY}" font-family="${FONT}" font-size="12" font-weight="700" fill="${MUTED}" text-anchor="end">P.U.</text>
    <text x="${W - 52}" y="${thY}" font-family="${FONT}" font-size="12" font-weight="700" fill="${MUTED}" text-anchor="end">TOTAL</text>`;

  y += 14;
  const shown = d.lines.slice(0, 20);
  const rows = shown
    .map((l) => {
      const yy = (y += 30);
      const chars = [...l.name];
      const nm = chars.length > 46 ? `${chars.slice(0, 45).join('')}…` : l.name;
      return `
        <text x="52" y="${yy}" font-family="${FONT}" font-size="14" fill="${DARK}">${esc(nm)}</text>
        <text x="520" y="${yy}" font-family="${FONT}" font-size="14" fill="${DARK}" text-anchor="end">${esc(l.quantity.toLocaleString('fr-FR'))}</text>
        <text x="640" y="${yy}" font-family="${FONT}" font-size="14" fill="${DARK}" text-anchor="end">${money(l.unitPrice)} $</text>
        <text x="${W - 52}" y="${yy}" font-family="${FONT}" font-size="14" font-weight="600" fill="${DARK}" text-anchor="end">${money(l.lineTotal)} $</text>
        <line x1="40" y1="${yy + 10}" x2="${W - 40}" y2="${yy + 10}" stroke="${LINE}"/>`;
    })
    .join('');
  const more =
    d.lines.length > shown.length
      ? `<text x="52" y="${(y += 26)}" font-family="${FONT}" font-size="12" fill="${MUTED}">+ ${d.lines.length - shown.length} ligne(s) supplémentaire(s)</text>`
      : '';

  y += 50;
  const totals = `
    <text x="${W - 220}" y="${y}" font-family="${FONT}" font-size="14" fill="${MUTED}">Sous-total</text>
    <text x="${W - 52}" y="${y}" font-family="${FONT}" font-size="14" fill="${DARK}" text-anchor="end">${money(d.subtotal)} $</text>
    ${
      d.discount > 0
        ? `<text x="${W - 220}" y="${y + 26}" font-family="${FONT}" font-size="14" fill="${MUTED}">Remise</text>
           <text x="${W - 52}" y="${y + 26}" font-family="${FONT}" font-size="14" fill="${DARK}" text-anchor="end">− ${money(d.discount)} $</text>`
        : ''
    }
    <rect x="${W - 300}" y="${y + (d.discount > 0 ? 44 : 18)}" width="260" height="44" rx="8" fill="${DARK}"/>
    <text x="${W - 280}" y="${y + (d.discount > 0 ? 72 : 46)}" font-family="${FONT}" font-size="16" font-weight="700" fill="#ffffff">TOTAL</text>
    <text x="${W - 52}" y="${y + (d.discount > 0 ? 72 : 46)}" font-family="${FONT}" font-size="18" font-weight="700" fill="${ACCENT}" text-anchor="end">${money(d.total)} $</text>`;

  const pay = `<text x="40" y="${y + (d.discount > 0 ? 60 : 34)}" font-family="${FONT}" font-size="13" fill="${MUTED}">Paiement : <tspan font-weight="600" fill="${DARK}">${esc(d.paymentLabel)}</tspan></text>`;

  return frame(
    `${header(d.companyName, `FACTURE N° ${d.saleId}`, `Le ${d.date}`)}${meta}${tableHead}${rows}${more}${totals}${pay}`,
  );
}

function intFmt(n: number): string {
  return Math.round(n).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
}

export interface PayrollDoc {
  companyName: string;
  exerciceLabel: string;
  period: string;
  today: string;
  rows: { name: string; gradeName: string | null; hours: number; base: number; commission: number; total: number; isPaid: boolean }[];
}

export function buildPayrollSvg(d: PayrollDoc): string {
  const rows = d.rows.slice(0, 26);
  const totHours = d.rows.reduce((s, r) => s + r.hours, 0);
  const totBase = d.rows.reduce((s, r) => s + r.base, 0);
  const totComm = d.rows.reduce((s, r) => s + r.commission, 0);
  const totPaid = d.rows.reduce((s, r) => s + r.total, 0);
  const nbPaid = d.rows.filter((r) => r.isPaid).length;

  const thY = 214;
  const x = { name: 40, hours: 380, base: 490, comm: 600, total: 712, paid: 758 };
  let y = thY + 30;
  const body = rows
    .map((r) => {
      const row = `
    <text x="${x.name}" y="${y}" font-family="${FONT}" font-size="13" fill="${DARK}">${esc(r.name.slice(0, 30))}</text>
    ${r.gradeName ? `<text x="${x.name}" y="${y + 13}" font-family="${FONT}" font-size="10" fill="${MUTED}">${esc(r.gradeName.slice(0, 30))}</text>` : ''}
    <text x="${x.hours}" y="${y}" font-family="${FONT}" font-size="13" fill="${DARK}" text-anchor="end">${intFmt(r.hours)} h</text>
    <text x="${x.base}" y="${y}" font-family="${FONT}" font-size="13" fill="${MUTED}" text-anchor="end">${intFmt(r.base)}</text>
    <text x="${x.comm}" y="${y}" font-family="${FONT}" font-size="13" fill="${MUTED}" text-anchor="end">${intFmt(r.commission)}</text>
    <text x="${x.total}" y="${y}" font-family="${FONT}" font-size="13" font-weight="700" fill="${DARK}" text-anchor="end">${intFmt(r.total)}</text>
    <text x="${x.paid}" y="${y}" font-family="${FONT}" font-size="13" font-weight="700" fill="${r.isPaid ? ACCENT : '#cbd5e1'}" text-anchor="middle">${r.isPaid ? '✓' : '–'}</text>
    <line x1="40" y1="${y + 11}" x2="${W - 40}" y2="${y + 11}" stroke="${LINE}" stroke-width="1"/>`;
      y += 30;
      return row;
    })
    .join('');

  const totY = y + 8;
  const boxY = totY + 24;
  const inner = `
    ${header(d.companyName, 'RÉCAPITULATIF DES PAIES', d.today)}
    <text x="40" y="145" font-family="${FONT}" font-size="16" font-weight="700" fill="${DARK}">${esc(d.exerciceLabel)}</text>
    <text x="40" y="168" font-family="${FONT}" font-size="13" fill="${MUTED}">Période : ${esc(d.period)}</text>

    <rect x="40" y="${thY - 18}" width="${W - 80}" height="26" fill="#f1f5f9"/>
    <text x="${x.name}" y="${thY}" font-family="${FONT}" font-size="11" font-weight="700" fill="${MUTED}">EMPLOYÉ</text>
    <text x="${x.hours}" y="${thY}" font-family="${FONT}" font-size="11" font-weight="700" fill="${MUTED}" text-anchor="end">HEURES</text>
    <text x="${x.base}" y="${thY}" font-family="${FONT}" font-size="11" font-weight="700" fill="${MUTED}" text-anchor="end">BASE</text>
    <text x="${x.comm}" y="${thY}" font-family="${FONT}" font-size="11" font-weight="700" fill="${MUTED}" text-anchor="end">COMM.</text>
    <text x="${x.total}" y="${thY}" font-family="${FONT}" font-size="11" font-weight="700" fill="${MUTED}" text-anchor="end">TOTAL</text>
    <text x="${x.paid}" y="${thY}" font-family="${FONT}" font-size="11" font-weight="700" fill="${MUTED}" text-anchor="middle">PAYÉ</text>
    ${body}
    <text x="${x.name}" y="${totY}" font-family="${FONT}" font-size="13" font-weight="700" fill="${DARK}">TOTAL (${d.rows.length} employé${d.rows.length > 1 ? 's' : ''})</text>
    <text x="${x.hours}" y="${totY}" font-family="${FONT}" font-size="13" font-weight="700" fill="${DARK}" text-anchor="end">${intFmt(totHours)} h</text>
    <text x="${x.base}" y="${totY}" font-family="${FONT}" font-size="13" font-weight="700" fill="${DARK}" text-anchor="end">${intFmt(totBase)}</text>
    <text x="${x.comm}" y="${totY}" font-family="${FONT}" font-size="13" font-weight="700" fill="${DARK}" text-anchor="end">${intFmt(totComm)}</text>
    <text x="${x.total}" y="${totY}" font-family="${FONT}" font-size="13" font-weight="700" fill="${ACCENT}" text-anchor="end">${intFmt(totPaid)}</text>

    <rect x="40" y="${boxY}" width="${W - 80}" height="52" rx="8" fill="${DARK}"/>
    <text x="60" y="${boxY + 22}" font-family="${FONT}" font-size="12" fill="#94a3b8">MASSE SALARIALE TOTALE</text>
    <text x="60" y="${boxY + 42}" font-family="${FONT}" font-size="20" font-weight="700" fill="#ffffff">${intFmt(totPaid)} $</text>
    <text x="${W - 60}" y="${boxY + 22}" font-family="${FONT}" font-size="12" fill="#94a3b8" text-anchor="end">Payés</text>
    <text x="${W - 60}" y="${boxY + 42}" font-family="${FONT}" font-size="20" font-weight="700" fill="${ACCENT}" text-anchor="end">${nbPaid}/${d.rows.length}</text>
    ${d.rows.length > 26 ? `<text x="40" y="${boxY + 80}" font-family="${FONT}" font-size="11" fill="${MUTED}">Note : ${d.rows.length - 26} employé(s) supplémentaire(s) non affiché(s).</text>` : ''}`;
  return frame(inner);
}
