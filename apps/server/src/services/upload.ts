import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import multer from 'multer';
import { env } from '../env';

const COMPANY_UPLOAD_DIR = path.join(env.UPLOAD_DIR, 'companies');
mkdirSync(COMPANY_UPLOAD_DIR, { recursive: true });

export const companyLogoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, COMPANY_UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().slice(0, 6);
      cb(null, `${randomBytes(12).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.mimetype));
  },
});

export const companyLogoUrl = (filename: string) => `/uploads/companies/${filename}`;
