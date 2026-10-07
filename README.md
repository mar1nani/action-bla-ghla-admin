# Action BLA Ghla

MVP de gestion de stock pour achats en France, envois vers le Maroc,
commandes clients, marge et statistiques, avec un cout technique minimal.

## Stack

- Node.js
- Express
- frontend HTML/CSS/JS sans framework
- stockage local JSON dans `data/store.json` en developpement
- stockage Neon Postgres via `DATABASE_URL` en production
- images produits et factures stockees en base quand `DATABASE_URL` est defini

## Demarrage

```bash
npm install
npm run dev
```

Puis ouvrir `http://localhost:3000`.

## Variables d'environnement

Copie `.env.example` si tu veux preparer un mode production:

```bash
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
ALLOW_LOCAL_STORE_FALLBACK=true
PORT=3000
```

Si `DATABASE_URL` est absent:
- l'application utilise `data/store.json`
- les images restent sur le disque local dans `public/uploads`

Si `DATABASE_URL` est present:
- l'application utilise Neon Postgres avec une table `app_store`
- les images sont enregistrees dans la base pour etre compatibles avec Render
- au premier lancement, le contenu local existant est importe automatiquement vers la base
- si la base distante tombe, l'application peut temporairement basculer sur le JSON local
  si `ALLOW_LOCAL_STORE_FALLBACK=true`

## Ce qui est deja implemente

- catalogue produits avec poids, cout achat EUR, prix vente MAD et seuil de stock
- upload photo produit depuis l'appareil avec conversion automatique en WebP
- achats fournisseur qui alimentent le stock France
- envois Maroc qui transferent le stock et repartissent le cout transport
- commandes clients qui sortent le stock Maroc avec calcul de benefice et marge
- dashboard avec stocks, activite, alertes et statistiques
- interface mobile-first avec un style dashboard moderne

## Hypotheses metier actuelles

- achats et transport en EUR
- ventes et benefices en MAD
- taux EUR vers MAD modifiable dans les reglages
- authentification locale avec mots de passe haches
- stock suivi sur deux zones: France et Maroc

## Structure

- `server.js`: routes API et serveur Express
- `lib/store.js`: persistance hybride local JSON / Neon Postgres
- `lib/metrics.js`: calculs de stock, couts, marges et stats
- `public/`: interface frontend
- `render.yaml`: configuration Render

## Endpoints utiles

- `GET /api/health`
- `GET /api/app-state`
- `PUT /api/settings`
- `POST /api/products`
- `POST /api/purchases`
- `POST /api/shipments`
- `POST /api/orders`

## Point d'attention pour l'hebergement

Le stockage local JSON est parfait en local, mais Render utilise un disque
ephemere par defaut. Pour un deploiement propre, il faut donc definir
`DATABASE_URL` vers Neon.

## Deploiement Render + Neon

1. Cree un projet Neon et recupere la `connection string`.
2. Cree un repository GitHub avec ce projet.
3. Sur Render, cree un `Web Service` depuis le repository GitHub.
4. Render detectera `render.yaml`.
5. Dans Render, ajoute la variable `DATABASE_URL` avec la valeur Neon.
6. Lance le premier deploiement.

Health check:

- `GET /api/health`

## GitHub

Le projet a deja son depot git local. Comme `gh` n'est pas installe sur cette
machine, cree d'abord un repository vide sur GitHub, puis pousse le projet:

```bash
cd /Users/marouane/Projects/action-bla-ghla/action-bla-ghla-admin
git add .
git commit -m "Prepare Render and Neon deployment"
git remote add origin https://github.com/TON-USER/action-bla-ghla-admin.git
git push -u origin main
```

## Application installable (PWA)

L'app s'installe sur l'écran d'accueil du téléphone et du bureau, et s'ouvre en plein écran :

- **Android / Chrome / Edge (bureau)** : bouton « Installer » (bannière dans l'app, ou menu du navigateur).
- **iPhone / iPad (Safari)** : Partager → « Sur l'écran d'accueil ».

Fichiers : `public/manifest.webmanifest`, `public/sw.js` (service worker), `public/offline.html`,
`public/pwa.js` (enregistrement + invitation à installer), icônes dans `public/icons/` et splash iOS dans `public/splash/`.
Le service worker ne met jamais `/api` en cache. Pour forcer une mise à jour du cache, change `VERSION` dans `public/sw.js`.

## Wishlist Gallery : actions groupées

Dans la galerie (et la wishlist produits), touche le rond en haut à gauche d'une carte pour sélectionner
plusieurs éléments. Une barre flottante propose : **Acheté**, **À acheter** (onglet Acheté) et **Supprimer**.
API : `POST /api/gallery-items/bulk` et `POST /api/wishlist/bulk` avec `{ ids: [...], action: "purchase" | "unpurchase" | "delete" }`.
Aucune migration de base : les données restent dans le document JSON existant.

## Déploiement sur Vercel

L'app Express est exposée comme fonction Vercel (`api/index.js` + `vercel.json`) : pas de mise en veille de 50 s comme sur l'offre gratuite de Render.

1. Vercel → **Add New → Project** → importer le dépôt GitHub (preset « Other », aucune commande de build).
2. Variables d'environnement :
   - `DATABASE_URL` : la même chaîne Neon que sur Render (les données sont conservées, c'est la même base)
   - `ALLOW_LOCAL_STORE_FALLBACK` = `false` (le disque de Vercel est en lecture seule)
   - `SESSION_SECRET` : une longue valeur aléatoire (les connexions sont des cookies signés, plus gardées en mémoire)
3. Project Settings → Functions → **Region** : choisir la même région que la base Neon (latence).
4. Deploy. Les utilisateurs devront se reconnecter une fois lors du changement.

Limite Vercel : corps de requête 4,5 Mo (les images sont déjà compressées côté navigateur).

## Catalogue clients (vitrine « Boutique »)

- **Admin** : menu « Catalogue clients » (ou Ventes → Catalogue). **Importer des articles** depuis :
  - un **lien** de page catégorie/liste (ex. `https://www.action.com/fr-fr/c/cuisine/`, plusieurs pages d'un coup) ;
  - un **PDF** de catalogue (lu dans le navigateur : photos, titres, prix détectés page par page) ;
  - le **code d'une page** collé à la main (quand un site bloque la lecture automatique).
  Les articles arrivent en brouillon avec photo, titre, prix source en € et catégorie devinée. Ensuite : **Chiffrer en DH**
  (coefficient × taux EUR→MAD, arrondi), sélection multiple, **Publier**.
- **Public** : `/boutique` — catalogue haut de gamme par catégories, recherche, fiche article, bouton « Commander sur WhatsApp »
  (numéro réglable dans « Réglages de la vitrine »). API publique : `GET /api/public/showcase`.
- Les photos du catalogue sont stockées **hors du document principal** : table `app_images` (créée automatiquement, `CREATE TABLE IF NOT EXISTS`),
  servies par `/media/:id` avec cache long. En local : dossier `data/media/`.
- Import par lien : respecte le `robots.txt`, refuse les adresses privées, signale les sites protégés (anti-robots).

```sql
-- Création manuelle (facultative : l'app le fait seule au démarrage)
CREATE TABLE IF NOT EXISTS app_images (
  id TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
