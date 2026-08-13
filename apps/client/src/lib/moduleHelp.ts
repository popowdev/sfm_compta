import type { ModuleKey } from '@rp-compta/shared';

export interface ModuleHelp {
  whatFor: string;
  config?: string;
  howTo: string;
}

export const MODULE_HELP: Partial<Record<ModuleKey, ModuleHelp>> = {
  caisse: {
    whatFor: 'Encaisser les ventes de l’entreprise. Chaque vente alimente le chiffre d’affaires et la compta.',
    config: 'Taux de commission du vendeur : la part d’une vente reversée à l’employé qui encaisse.',
    howTo: 'Ajoute tes articles/services au catalogue, puis « Nouvelle vente » pour encaisser. Le CA remonte sur l’accueil et dans l’exercice.',
  },
  garage: {
    whatFor: 'Facturer les réparations et les customs de véhicules. Le total entre au CA, une commission revient au mécano.',
    config: 'Taux de commission mécano (fixe, ou celui de son grade).',
    howTo: 'Enregistre une réparation ou un custom avec le mécano concerné : sa commission remonte automatiquement dans sa paie.',
  },
  badgeuse: {
    whatFor: 'Pointer les heures des employés. Les heures nourrissent les paies (taux horaire) et le remboursement des salaires.',
    config: 'Plafond d’heures hebdo et primes de pointe (heures de nuit).',
    howTo: 'Les employés pointent (prise / fin de service). Leurs heures se retrouvent dans « Ma paie » et dans l’exercice.',
  },
  stocks: {
    whatFor: 'Suivre les matières premières et articles, avec une alerte quand un stock passe sous son seuil.',
    howTo: 'Crée tes articles, fixe un seuil bas, et enregistre les entrées/sorties. Les alertes s’affichent sur l’accueil.',
  },
  clients: {
    whatFor: 'Tenir un fichier clients, avec fidélité et comptes crédit.',
    config: 'Activer la fidélité et personnaliser ses paliers.',
    howTo: 'Ajoute un client, suis son solde et son palier. Relié à la caisse pour le crédit client.',
  },
  depenses: {
    whatFor: 'Enregistrer les charges de l’entreprise (loyer, matériel, carburant…). Elles pèsent dans le résultat.',
    howTo: 'Nouvelle dépense : montant, catégorie, déductible ou non. Reprise automatiquement dans l’exercice.',
  },
  exercices: {
    whatFor: 'Le cœur comptable : résultat, charges, paies et impôts, calculés semaine par semaine.',
    howTo: 'Crée un exercice (une semaine) : il agrège ventes, dépenses, modules et paies. Clôture-le pour figer les chiffres.',
  },
  rh: {
    whatFor: 'Gérer les fiches employés : contrats, grille salariale, performances, avertissements.',
    howTo: 'Chaque employé venu du jeu a une fiche à compléter (salaire, taux). La grille salariale alimente les paies.',
  },
  taxi: {
    whatFor: 'Facturer les courses (citoyens, concitoyens, VIP) et suivre la flotte.',
    config: 'Commission du chauffeur.',
    howTo: 'Enregistre une course avec le chauffeur : son gain remonte dans sa paie, le total au CA.',
  },
  runs: {
    whatFor: 'Facturer des livraisons à la course. Le montant se partage entreprise / employé.',
    config: 'Prix d’une run et part reversée à l’employé.',
    howTo: 'Enregistre une run avec l’employé livreur : sa part remonte dans sa paie.',
  },
  pawnshop: {
    whatFor: 'Racheter des objets aux clients, les stocker, puis les revendre au grossiste.',
    config: 'Commission du vendeur.',
    howTo: 'Rachat (sort du cash, entre en stock) puis revente au grossiste (entre du cash). La revente alimente le CA.',
  },
  chasse: {
    whatFor: 'Racheter du gibier au chasseur puis le revendre au grossiste.',
    config: 'Commission du vendeur.',
    howTo: 'Crée tes produits, enregistre les rachats chasseur et les reventes grossiste.',
  },
  concession: {
    whatFor: 'Vendre des véhicules neuf/occasion, avec une vitrine publique partageable. La marge alimente le CA.',
    config: 'Commission du vendeur et vitrine publique.',
    howTo: '« + Véhicule » pour remplir le parc (prix d’achat + revente), « Vendre » enregistre une vente et le client.',
  },
  cargaison: {
    whatFor: 'Enregistrer des commandes B2B. L’entreprise garde une part, le reste se partage à parts égales entre les employés cochés.',
    config: 'Part de l’entreprise en % (le reste va aux employés).',
    howTo: 'Nouvelle commande : client, N° de BL, produit, montant, et coche les employés présents. Le total entre au CA, les parts en paie.',
  },
  locations: {
    whatFor: 'Gérer des locations et leurs cautions.',
    config: 'Champs caution, durée, heure.',
    howTo: 'Enregistre une location avec sa caution et sa durée, puis suis son état.',
  },
  immobilier: {
    whatFor: 'Gérer les propriétés de l’entreprise et leurs loyers.',
    howTo: 'Ajoute une propriété, son locataire et son loyer, puis suis les paiements.',
  },
  immo_carte: {
    whatFor: 'Visualiser les propriétés sur une carte interactive.',
    howTo: 'Les propriétés apparaissent par numéro ; clique un point pour ouvrir sa fiche.',
  },
  declarations: {
    whatFor: 'Déclarer tes résultats à l’IRS directement depuis le site.',
    howTo: 'Crée une déclaration hebdomadaire à partir de tes chiffres.',
  },
  subventions: {
    whatFor: 'Suivre tes demandes de subventions, dont le remboursement des salaires par l’État.',
    howTo: 'Dépose une demande et suis son statut (approuvée / payée).',
  },
  dividendes: {
    whatFor: 'Verser des dividendes aux actionnaires.',
    howTo: 'Déclare un versement : il est réparti selon le capital détenu.',
  },
  actionnaires: {
    whatFor: 'Répartir le capital de l’entreprise entre actionnaires.',
    howTo: 'La répartition se gère avec l’IRS ; elle sert au calcul des dividendes.',
  },
  documents: {
    whatFor: 'Ranger les documents de l’entreprise dans des dossiers.',
    howTo: 'Crée des dossiers, dépose des fichiers et partage-les à l’équipe.',
  },
  stats: {
    whatFor: 'Visualiser l’activité de l’entreprise en graphiques.',
    howTo: 'Consulte les courbes de CA, les tops articles et l’activité de l’équipe.',
  },
  messagerie: {
    whatFor: 'Échanger avec l’IRS depuis l’entreprise.',
    howTo: 'Écris un message : les réponses de l’IRS arrivent ici.',
  },
  tickets: {
    whatFor: 'Gérer un support / des tickets internes.',
    howTo: 'Ouvre un ticket, suis les échanges, et clôture quand c’est réglé.',
  },
};
