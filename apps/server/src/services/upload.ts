import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import multer from 'multer';
import { env } from '../env';

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

const TICKET_UPLOAD_DIR = path.join(env.UPLOAD_DIR, 'tickets');
mkdirSync(TICKET_UPLOAD_DIR, { recursive: true });

export const ticketUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TICKET_UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, safeName(file.mimetype)),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 3 },
  fileFilter: (_req, file, cb) => cb(null, IMAGE_MIMES.includes(file.mimetype)),
});

export const ticketFilePath = (filename: string) => path.join(TICKET_UPLOAD_DIR, filename);

const EVENT_POSTER_DIR = path.join(env.UPLOAD_DIR, 'events');
mkdirSync(EVENT_POSTER_DIR, { recursive: true });

export const eventPosterUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, EVENT_POSTER_DIR),
    filename: (_req, file, cb) => cb(null, safeName(file.mimetype)),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, IMAGE_MIMES.includes(file.mimetype)),
});

export const eventPosterUrl = (filename: string) => `/uploads/events/${filename}`;

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

const CONCESSION_IMG_DIR = path.join(env.UPLOAD_DIR, 'concession');
mkdirSync(CONCESSION_IMG_DIR, { recursive: true });

export const concessionImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, CONCESSION_IMG_DIR),
    filename: (_req, file, cb) => cb(null, safeName(file.mimetype)),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, IMAGE_MIMES.includes(file.mimetype)),
});

export const concessionImageUrl = (filename: string) => `/uploads/concession/${filename}`;
