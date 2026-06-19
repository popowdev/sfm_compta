# RP Compta

Plateforme de **comptabilité fiscale centralisée** pour un serveur RP FiveM (espace IRS + espaces entreprises + modules activables).

## ⭐ Mot d'ordre

On ne veut **PAS** un site « vite fait ». On veut un truc **bien fait, moderne et fluide** — qualité avant rapidité. On prend le temps de bien architecturer, et chaque phase est finie proprement (validée/testée) avant la suivante. Surfaces **flat** (pas de dégradés/glow/grain), vert émeraude en accent seulement. Voir la DA : <https://exemple.tld/style.html>.

## Stack

- **Front** — Vite + React + TypeScript + **shadcn/ui** (Tailwind v4) + React Router + TanStack Query + socket.io-client + react-hook-form/zod + recharts.
- **Back** — Node + Express + TypeScript + **Socket.IO** + MySQL via **Drizzle ORM**.
- **Partagé** — `@rp-compta/shared` : schémas zod + types communs (source de vérité unique).
- **Temps réel** — Socket.IO (rooms par entreprise + room IRS) + invalidation TanStack Query → pas de F5, pas de double saisie.
- **Auth** — Discord OAuth2 (whitelist = rôle Discord lu via `guilds.members.read`) + révocation en direct.

## Structure (monorepo pnpm)

```
rp-compta/
├─ apps/
│  ├─ client/     # Vite + React + shadcn (UI)
│  └─ server/     # Express + Drizzle + Socket.IO (API)
├─ packages/
│  └─ shared/     # @rp-compta/shared — zod + types partagés
├─ ecosystem.config.cjs   # PM2 (prod : rp-compta-api)
└─ pnpm-workspace.yaml
```

## Prérequis

- Node ≥ 20 (testé sur 22), pnpm 10, MariaDB/MySQL.

## Démarrage

```bash
pnpm install

# Base de données
cp apps/server/.env.example apps/server/.env   # puis renseigner DB_* et SESSION_SECRET
pnpm db:push                                    # crée les tables (schéma Phase 0)

# Dev (client + serveur en parallèle)
pnpm dev
# client : http://localhost:5173   |   API : http://localhost:4010
```

## Scripts (racine)

| Commande            | Effet                                            |
| ------------------- | ------------------------------------------------ |
| `pnpm dev`          | Lance client + serveur en parallèle              |
| `pnpm dev:server`   | API seule (tsx watch)                            |
| `pnpm dev:client`   | Front seul (vite)                                |
| `pnpm build`        | Build de tous les packages                       |
| `pnpm typecheck`    | Vérification TypeScript de tout le monorepo      |
| `pnpm db:push`      | Applique le schéma Drizzle à la base             |
| `pnpm format`       | Prettier sur tout le repo                        |

## Ports & prod

- API : **4010**. Client dev : **5173**.
- Prod : front buildé servi par nginx, API derrière nginx (proxy `/api` + upgrade WebSocket pour `/socket.io`), process `rp-compta-api` via PM2.

## Conventions

- TypeScript strict partout. Validation **zod** côté serveur ET formulaires (depuis `@rp-compta/shared`).
- Composants UI via shadcn (`pnpm dlx shadcn@latest add <composant>`), tokens de couleur dans `apps/client/src/styles/index.css`.
- Pas de secret commité (`.env` ignoré ; seul `.env.example` est versionné).
