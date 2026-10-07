# Plan Maison

Application web locale pour dessiner des plans de maison en 2D (murs, ouvertures, objets, cotes, export PNG et PDF).

## Installation

    npm install
    npx playwright install chromium   # une seule fois, pour les tests e2e

## Utilisation

- `npm run dev` : lance l'application sur http://localhost:5173
- `npm test` : tests unitaires (Vitest) ; `npm run typecheck` : vérification des types
- `npm run e2e` : tests de bout en bout (Playwright) ; `npm run build` : build de production
