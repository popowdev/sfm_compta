import {
  FileText,
  HandCoins,
  BookOpen,
  Receipt,
  ShoppingCart,
  Contact,
  Boxes,
  CalendarClock,
  Users,
  Fingerprint,
  LifeBuoy,
  MessagesSquare,
  BarChart3,
  Scale,
  Coins,
  PieChart,
  Folder,
  type LucideIcon,
} from 'lucide-react';
import type { ModuleKey } from '@rp-compta/shared';

const ICONS: Record<ModuleKey, LucideIcon> = {
  declarations: FileText,
  subventions: HandCoins,
  exercices: BookOpen,
  depenses: Receipt,
  caisse: ShoppingCart,
  clients: Contact,
  stocks: Boxes,
  locations: CalendarClock,
  rh: Users,
  badgeuse: Fingerprint,
  tickets: LifeBuoy,
  messagerie: MessagesSquare,
  stats: BarChart3,
  bareme: Scale,
  dividendes: Coins,
  actionnaires: PieChart,
};

export function moduleIcon(key: string): LucideIcon {
  return ICONS[key as ModuleKey] ?? Folder;
}
