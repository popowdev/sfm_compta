import { lazy, type ComponentType } from 'react';

const RELOAD_KEY = 'rp-compta.chunk-reload';

// Après un déploiement, le nom des chunks JS change. Un onglet ouvert avant le déploiement
// garde en mémoire les anciens noms → l'import dynamique échoue ("Failed to fetch dynamically
// imported module"). On recharge alors la page UNE fois pour récupérer le build à jour.
// Le drapeau en sessionStorage évite toute boucle de rechargement.
export function lazyRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): ReturnType<typeof lazy<T>> {
  return lazy(async () => {
    try {
      const mod = await factory();
      sessionStorage.removeItem(RELOAD_KEY);
      return mod;
    } catch (err) {
      if (!sessionStorage.getItem(RELOAD_KEY)) {
        sessionStorage.setItem(RELOAD_KEY, '1');
        window.location.reload();
        // La page se recharge : on renvoie une promesse qui ne se résout jamais.
        return new Promise<{ default: T }>(() => {});
      }
      // Déjà rechargé et ça échoue encore → vraie panne, on laisse remonter à l'ErrorBoundary.
      throw err;
    }
  });
}
