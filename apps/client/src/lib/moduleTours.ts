import type { TourStep } from '@/components/GuidedTour';
import type { Employee } from '@/lib/employees';

export const MODULE_TOUR_STEPS: Record<string, TourStep[]> = {
  rh: [
    { title: 'Module RH / Employés', body: 'Ici tu gères toute ton équipe. Voici un exemple avec une fiche fictive.' },
    { target: '[data-tour="rh-tabs"]', title: '3 onglets', body: 'Employés (les fiches), Personnel (visite médicale, avertissements, véhicule) et Flotte (les véhicules de l’entreprise).' },
    { target: '[data-tour="rh-kpis"]', title: 'Tes indicateurs', body: 'D’un coup d’œil : le nombre d’employés, combien sont actifs, et les avertissements.' },
    { target: '[data-tour="rh-new"]', title: 'Ajouter un employé', body: 'Clique ici pour créer une fiche : nom, grade, type de contrat, salaire horaire, commission…' },
    { target: '[data-tour="rh-card"]', title: 'Une fiche employé', body: 'Voici à quoi ressemble une fiche remplie : nom, grade, contrat et salaire. Clique dessus pour voir tout le détail.' },
    { title: 'À toi de jouer', body: 'Cet exemple disparaît en fermant le tuto. Ajoute tes vrais employés avec « Nouvel employé ».' },
  ],
  exercices: [
    { title: 'Les exercices comptables', body: 'Chaque semaine de ton entreprise devient un « exercice » : une photo figée de tes chiffres. Section par section : bilan, paies et impôts.' },
    { target: '[data-tour="ex-actions"]', title: 'Créer la semaine', body: '« Semaine en cours » fait tout : il crée la période et va chercher tout seul tes ventes, tes heures de badgeuse et tes dépenses. « Nouvel exercice » sert aux cas particuliers où tu veux fixer les dates à la main.' },
    { target: '[data-tour="ex-card"]', title: 'Une semaine de compta', body: 'Chaque carte = une semaine, avec ses dates, son chiffre d’affaires et son état. Clique dessus pour déplier tout le détail en dessous (déjà ouvert ici pour le tuto).' },
    { target: '[data-tour="ex-status-badge"]', title: 'Ouvert ou gelé', body: 'Vert « ouvert » = la semaine tourne, les chiffres bougent et tu peux tout ajuster. Gris « clôturé » = la semaine est gelée : elle se fige toute seule le dimanche soir et sert de preuve figée pour l’IRS.' },
    { target: '[data-tour="ex-card-actions"]', title: 'Clôturer / rouvrir', body: 'Le cadenas clôture (ou rouvre) la semaine et fige tout — bilan, paies, impôts. Le crayon corrige un libellé, la poubelle supprime. On ne peut pas clôturer une semaine encore en cours : elle se gèle seule à la fin.' },
    { target: '[data-tour="ex-kpis"]', title: 'Le tableau de bord', body: 'D’un coup d’œil : ce que tu as vendu, ce que ça a coûté, et ce qu’il te reste. La dernière carte « Résultat après impôts » est la plus importante : c’est l’argent réellement dans ta poche. Rouge = tu as perdu de l’argent.' },
    { target: '[data-tour="ex-pnl"]', title: 'Le parcours de l’argent', body: 'Le cœur de ta compta, raconté comme une histoire : l’argent rentre, une partie sort (salaires + dépenses), il reste un bénéfice. Suis les 3 étapes de gauche à droite — la 1ʳᵉ liste même d’où vient ton CA (garage, taxi, ventes…).' },
    { target: '[data-tour="ex-tax"]', title: 'Les impôts', body: 'Une fois ton bénéfice connu, l’État prélève sa part selon le barème. Si tu te verses des dividendes (part du bénéfice sortie pour toi), saisis le montant ici : l’outil calcule aussitôt l’impôt en plus dessus. Tu vois le vrai coût de te payer.' },
    { target: '[data-tour="ex-net-result"]', title: 'Le résultat net', body: 'LE chiffre qui compte : ce qu’il reste après avoir tout payé, charges ET impôts. Vert = ton entreprise est rentable cette semaine ; rouge = elle t’a coûté de l’argent, il faut revoir tes prix ou tes charges.' },
    { target: '[data-tour="ex-charts"]', title: 'Tes ventes en visuel', body: 'L’histogramme montre tes jours forts et tes jours creux (utile pour les plannings). Le camembert révèle comment tes clients paient (cash, carte, virement…) — ce qui compte pour ta trésorerie.' },
    { target: '[data-tour="ex-perf-employees"]', title: 'Performance de l’équipe', body: 'Le classement de tes vendeurs : qui a généré le plus de CA et quelle part du total il représente. La colonne « Remises » repère qui casse trop les prix. Une base objective pour décider des primes.' },
    { target: '[data-tour="ex-top-products"]', title: 'Top produits', body: 'Tes meilleures ventes — et surtout lesquelles rapportent vraiment. Un produit peut faire beaucoup de CA mais peu de marge : c’est la marge (colonne de droite) qui remplit la caisse, pas le chiffre brut.' },
    { target: '[data-tour="ex-payroll"]', title: 'Les paies', body: 'Les salaires, calculés tout seuls à partir des heures de badgeuse, des ventes et des réparations. Le total versé s’affiche dans le titre. Ce bloc détaillé n’apparaît que si tu as l’accès « Badgeuse ».' },
    { target: '[data-tour="ex-payroll-columns"]', title: 'Une paie, brique par brique', body: 'Chaque colonne décompose un salaire : la Base vient des heures, la Commission dépend du grade, et des colonnes s’ajoutent par activité (garage, taxi, runs…). Tu n’ajustes que 2 cases : Prime (récompenser) et Retenue (sanctionner). « Plafonné » = le plafond a coupé une partie.' },
    { target: '[data-tour="ex-sales"]', title: 'Le détail des ventes', body: 'Le journal de chaque vente de la semaine. Déplie une vente pour voir les produits, télécharge une facture PNG, ou annule une vente erronée (ça recrédite le stock et le client). Recherche et filtre paiement pour retrouver une transaction.' },
    { target: '[data-tour="ex-notes"]', title: 'Tes notes', body: 'Un espace libre pour ce que les chiffres ne disent pas : un événement, l’explication d’un écart, un point pour l’IRS. Une fois la semaine clôturée, ces notes se figent avec le reste.' },
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
