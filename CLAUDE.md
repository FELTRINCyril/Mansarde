# Plan Maison - conventions

App web locale de plan 2D et 3D. V1 (plan 2D) : spec docs/superpowers/specs/2026-10-07-plan-maison-v1-design.md,
plan docs/superpowers/plans/2026-10-07-plan-maison-v1.md. V2 (3D, pentes, poutres, placards, vérifications) :
spec docs/superpowers/specs/2026-10-08-plan-maison-v2-design.md, plan docs/superpowers/plans/2026-10-08-plan-maison-v2.md.
Décisions prises pendant l'implémentation : docs/superpowers/decisions/.

- `src/core` = TypeScript pur, aucune API navigateur ni React. Toute modification du projet passe
  par une commande de `src/core/commands` (jamais de mutation directe ailleurs).
- Unités : cm partout dans le modèle. Y vers le bas. Rotation en degrés, sens horaire à l'écran.
- Code/commentaires/commits : ASCII anglais. Interface : français avec accents, sans tiret long,
  guillemets typographiques, ellipse, flèches unicode, signe multiplication.
- Commandes : `npm test`, `npm run typecheck`, `npm run e2e`, `npm run dev`.
- Pas de Co-Authored-By dans les commits.
