import {
  FileText,
  HandCoins,
  BookOpen,
  Receipt,
  ShoppingCart,
  Wrench,
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
  Landmark,
  Calculator,
  Store,
  MessageCircle,
  LineChart,
  FolderArchive,
  Home,
  Map,
  Car,
  Gem,
  Truck,
  Target,
  type LucideIcon,
} from 'lucide-react';
import type { ModuleKey } from '@rp-compta/shared';

const ICONS: Record<ModuleKey, LucideIcon> = {
  declarations: FileText,
  subventions: HandCoins,
  exercices: BookOpen,
  depenses: Receipt,
  caisse: ShoppingCart,
  garage: Wrench,
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
  documents: FolderArchive,
  immobilier: Home,
  immo_carte: Map,
  taxi: Car,
  pawnshop: Gem,
  runs: Truck,
  chasse: Target,
};

export function moduleIcon(key: string): LucideIcon {
  return ICONS[key as ModuleKey] ?? Folder;
}

const GROUP_ICONS: Record<string, LucideIcon> = {
  Fiscalité: Landmark,
  Comptabilité: Calculator,
  Commerce: Store,
  'Ressources humaines': Users,
  Communication: MessageCircle,
  Pilotage: LineChart,
};

export function groupIcon(group: string): LucideIcon {
  return GROUP_ICONS[group] ?? Folder;
}
