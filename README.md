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
PORT=3000
```

Si `DATABASE_URL` est absent:
- l'application utilise `data/store.json`
- les images restent sur le disque local dans `public/uploads`

Si `DATABASE_URL` est present:
- l'application utilise Neon Postgres avec une table `app_store`
- les images sont enregistrees dans la base pour etre compatibles avec Render
- au premier lancement, le contenu local existant est importe automatiquement vers la base

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
