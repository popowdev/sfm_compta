Config = {}

-- URL de l'endpoint RP Compta.
-- Mettre https://exemple.tld/api/fivem/sync une fois le DNS posé.
Config.SyncUrl = 'https://exemple.tld/api/fivem/sync'

-- Token secret : DOIT être IDENTIQUE à FIVEM_SYNC_TOKEN côté RP Compta (fichier .env du serveur).
Config.SyncToken = 'COLLE_ICI_LE_TOKEN'

-- Regroupement des changements (ms). 1 requête max toutes les 1,5 s, et seulement s'il y a du changement.
Config.FlushInterval = 1500

-- Réconciliation complète (ms). Filet anti-drift : renvoie tout l'état toutes les 5 min.
Config.ReconcileInterval = 300000
