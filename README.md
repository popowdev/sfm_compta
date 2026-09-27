# RP Compta

Plateforme de comptabilité fiscale centralisée pour un serveur RP FiveM.
Chaque entreprise du serveur dispose de son espace privé, piloté par un espace
IRS qui voit l'ensemble. Les accès sont adossés aux jobs in-game via une
ressource de synchronisation ESX.

## Pile technique

- `apps/client` — React 18, Vite, TypeScript, Tailwind
- `apps/server` — Express, TypeScript, Drizzle ORM, MariaDB/MySQL
- `apps/bot` — bot Discord (discord.js) pour la whitelist et les tickets
- `packages/shared` — types et logique de modules partagés
- `fivem/rp_compta_sync` — ressource Lua de synchronisation ESX

## Démarrage

Prérequis : Node >= 20, pnpm, une base MariaDB ou MySQL.

```bash
pnpm install
cp apps/server/.env.example apps/server/.env
```

Renseigner au minimum `DB_*`, `SESSION_SECRET` et les identifiants OAuth
Discord dans `apps/server/.env`, puis :

```bash
pnpm db:migrate
pnpm dev
```

Client : http://localhost:5173 — API : http://localhost:4010

## Scripts

| Commande | Effet |
| --- | --- |
| `pnpm dev` | client et serveur en mode développement |
| `pnpm build` | build de production de tous les paquets |
| `pnpm typecheck` | vérification TypeScript sur tout le dépôt |
| `pnpm db:generate` | génère une migration Drizzle depuis le schéma |
| `pnpm db:migrate` | applique les migrations |

## Déploiement

`ecosystem.config.cjs` fournit une configuration PM2 pour l'API et le bot.
Les chemins sont relatifs à la racine du dépôt.

```bash
pnpm build
pm2 start ecosystem.config.cjs
```
