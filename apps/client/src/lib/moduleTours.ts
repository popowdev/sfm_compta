import type { TourStep } from '@/components/GuidedTour';
import type { Employee } from '@/lib/employees';

export const MODULE_TOUR_STEPS: Record<string, TourStep[]> = {
  rh: [
    { title: 'Module RH / Employés 👥', body: 'Ici tu gères toute ton équipe. On te montre un exemple avec une fiche fictive.' },
    { target: '[data-tour="rh-tabs"]', title: '3 onglets', body: 'Employés (les fiches), Personnel (visite médicale, avertissements, véhicule) et Flotte (les véhicules de l’entreprise).' },
    { target: '[data-tour="rh-kpis"]', title: 'Tes indicateurs', body: 'D’un coup d’œil : le nombre d’employés, combien sont actifs, et les avertissements.' },
    { target: '[data-tour="rh-new"]', title: 'Ajouter un employé', body: 'Clique ici pour créer une fiche : nom, grade, type de contrat, salaire horaire, commission…' },
    { target: '[data-tour="rh-card"]', title: 'Une fiche employé', body: 'Voici à quoi ressemble une fiche remplie : nom, grade, contrat et salaire. Clique dessus pour voir tout le détail.' },
    { title: 'À toi de jouer 🚀', body: 'Cet exemple disparaît en fermant le tuto. Ajoute tes vrais employés avec « Nouvel employé ».' },
  ],
};

const demoEmp = (id: number, name: string, gradeName: string, contractSigned: boolean, hourlyRate: number, commissionRate: number, warnings: number): Employee => ({
  id, companyId: 0, userId: null, name, phone: '555-0100', iban: null,
  dateOfBirth: '1998-04-12', hireDate: '2026-06-01', companyRoleId: null,
  contractType: 'cdi', contractSigned, hourlyRate, commissionRate, warnings,
  terminationReason: null, active: true, notes: null, createdAt: '2026-06-01T09:00:00',
  gradeName, linkedName: null,
});

export const DEMO_EMPLOYEES: Employee[] = [
  demoEmp(-1, 'Jean Dupont (exemple)', 'Gérant', true, 120, 10, 0),
  demoEmp(-2, 'Marie Leroy (exemple)', 'Vendeuse', true, 90, 15, 1),
  demoEmp(-3, 'Paul Martin (exemple)', 'Apprenti', false, 60, 5, 0),
];
