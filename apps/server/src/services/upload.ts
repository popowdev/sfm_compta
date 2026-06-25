import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import multer from 'multer';
import { env } from '../env';

// Canonical extension derived from the (allow-listed) MIME type — NEVER from the
// client-supplied filename. This guarantees only inert extensions ever hit disk,
// so nginx (which derives Content-Type from the extension) can never serve an
// uploaded blob as text/html or image/svg+xml. Defends against stored XSS even if
// the multipart Content-Type header is spoofed.
const MIME_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'text/plain': '.txt',
  'text/csv': '.csv',
};
function safeName(mimetype: string): string {
  return `${randomBytes(12).toString('hex')}${MIME_EXT[mimetype] ?? '.bin'}`;
}

const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const COMPANY_UPLOAD_DIR = path.join(env.UPLOAD_DIR, 'companies');
mkdirSync(COMPANY_UPLOAD_DIR, { recursive: true });

export const companyLogoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, COMPANY_UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, safeName(file.mimetype)),
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, IMAGE_MIMES.includes(file.mimetype)),
});

export const companyLogoUrl = (filename: string) => `/uploads/companies/${filename}`;

const SUBVENTION_UPLOAD_DIR = path.join(env.UPLOAD_DIR, 'subventions');
mkdirSync(SUBVENTION_UPLOAD_DIR, { recursive: true });

const SUBVENTION_MIMES = [...IMAGE_MIMES, 'application/pdf'];

export const subventionUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, SUBVENTION_UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, safeName(file.mimetype)),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 11 },
  fileFilter: (_req, file, cb) => cb(null, SUBVENTION_MIMES.includes(file.mimetype)),
});

export const subventionFileUrl = (filename: string) => `/uploads/subventions/${filename}`;

const DOCUMENT_UPLOAD_DIR = path.join(env.UPLOAD_DIR, 'documents');
mkdirSync(DOCUMENT_UPLOAD_DIR, { recursive: true });

export const DOCUMENT_MIMES = Object.keys(MIME_EXT);

export const documentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, DOCUMENT_UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, safeName(file.mimetype)),
  }),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, DOCUMENT_MIMES.includes(file.mimetype)),
});

export const documentFileUrl = (filename: string) => `/uploads/documents/${filename}`;
