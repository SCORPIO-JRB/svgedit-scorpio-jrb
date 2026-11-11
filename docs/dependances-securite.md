# Revue des dépendances et des failles connues

Branche `deps-securite`, depuis `master` (novembre 2026). `npm audit` relevait 27 alertes : 2 critiques, 9 élevées, 16 modérées. Après mise à jour, il n'en reste aucune dans le code livré et 11 modérées dans les outils de développement.

## 1. Le code livré au navigateur

| Librairie | Version | Rôle | État |
| --- | --- | --- | --- |
| `jspdf` | 4.2.1 | Export PDF | Dernière version, aucune alerte. |
| `svg2pdf.js` | 2.7.0 | Dessin SVG dans le PDF | Aucune alerte. La 2.9.0 existe. |
| `i18next` | 26.3.6 | Traductions | Aucune alerte. La 27 existe : c'est une version majeure. |
| `browser-fs-access` | 0.38.0 | Ouvrir et enregistrer | À jour, aucune alerte. |
| `elix` | 15.0.1 | Boutons, menus, dialogues | Aucune alerte, mais plus publiée depuis 2021. |
| `pathseg` | 1.2.1 | Polyfill `SVGPathSeg` | Aucune alerte, mais plus publiée depuis 2021. |

jsPDF tire deux librairies, que le build met dans `Editor.js`. Elles sont mises à jour dans le fichier de verrouillage, sans toucher `package.json` :

| Librairie | Avant → après | Alertes | Portée dans l'éditeur |
| --- | --- | --- | --- |
| `dompurify` | 3.4.11 → 3.4.17 | 1 critique, 1 élevée, 1 modérée et 3 faibles : contournements du nettoyage HTML (XSS) | Seule la méthode `html()` de jsPDF s'en sert, et l'éditeur ne l'appelle pas. Ces failles ne sont donc pas exploitables ici, mais le code était livré. |
| `fflate` | 0.8.2 → 0.8.3 | 1 modérée : boucle infinie de `unzipSync` sur une archive ZIP64 malformée | L'éditeur n'ouvre pas d'archive ZIP. |

## 2. Les outils de développement

| Paquet | Avant → après | Alerte la plus grave | Ce qu'elle permet |
| --- | --- | --- | --- |
| `vite` | 8.1.4 → 8.3.8 | Élevée | Le serveur de développement peut servir des fichiers hors de `server.fs.allow`. Or `npm start` écoute sur tout le réseau (`--host`). |
| `vitest`, `@vitest/coverage-v8` | 4.1.10 → 4.1.12 | Modérée | Injection de code par un mock enregistré sans authentification ; lecture de fichiers par une redirection de mock. |
| `rimraf` | 6.1.3 → 6.1.4 | Modérée | Hérite de la faille de `glob` ci-dessous. |
| `shell-quote` (par `npm-run-all`) | 1.10.0 → 1.12.0 | Critique | Injection de commande par `quote()`. Les scripts ne lui passent que des arguments du dépôt. |
| `undici` (par `jsdom`) | 7.28.0 → 7.30.2 | Élevée | Contournement de la vérification TLS, empoisonnement de cache. Les tests unitaires ne font pas de requête. |
| `postcss`, `nanoid`, `source-map-js` (par `vite`) | 8.5.16 → 8.5.32 ; 3.3.15 → 3.3.20 ; 1.2.1 → 1.2.2 | Élevée | Lecture de fichiers `.map` hors du projet ; blocages. |
| `brace-expansion`, `js-yaml`, `markdown-it`, `browserslist` | Correctifs dans les mêmes versions majeures | Élevée | Blocages (DoS) sur une entrée hostile. |

## 3. Ce qui reste : 11 alertes modérées, acceptées

`glob` 9 à 14.0.1 et `minimatch` 7 à 11.0.0. Ils arrivent par trois outils :

- `nyc`, pour le rapport de couverture E2E ;
- `test-exclude`, par `vite-plugin-istanbul` ;
- `remark-cli`, pour le contrôle des fichiers Markdown.

Seul `glob` 14.0.2 corrige la faille. Pour la faire disparaître, `npm audit fix --force` rétrograderait `nyc` en 17, `remark-cli` en 11 et `vite-plugin-istanbul` en 6. Le remède serait pire que le mal.

Ces outils ne lisent que les motifs de fichiers écrits dans le dépôt : aucune entrée hostile ne leur parvient. On les reprendra quand ces paquets passeront à `glob` 14.

## 4. Hors des dépendances : à suivre

- **La CI tourne sous Node 20, en fin de vie depuis le 30 avril 2026.** Elle utilise aussi `actions/checkout@v3` et `actions/setup-node@v3`. Il faudrait passer à Node 22 ou 24 et aux actions v4.
- **Aucune alerte automatique.** Il n'y a pas de `.github/dependabot.yml`, ni de `npm audit` en CI. Un `npm audit --omit=dev --audit-level=high` bloquerait une faille du code livré.
- **`standard` 17 repose sur ESLint 8**, qui n'est plus maintenu. Il n'existe pas encore de version de `standard` sur ESLint 9.
- **Du code tiers est copié dans `src/`** : jPicker (adapté de la 1.1.6, 2010), jGraduate et une partie d'Elix (`se-elix`). Aucun `npm audit` ne le surveille.
- **npm 10 plante sur ce dépôt** à la mise à jour de `vite` et de `vitest`, avec l'erreur `Cannot read properties of null (reading 'edgesOut')`. Ce bogue vient d'Arborist. `npx npm@11` fait la mise à jour, et le fichier produit s'installe avec npm 10 (`npm ci`).

## 5. Vérifications

- `npm ci` avec npm 10, depuis le nouveau fichier de verrouillage ;
- `npm audit --omit=dev` : 0 alerte ;
- `npm audit` : 11 modérées, celles de la section 3 ;
- `npm run lint` ;
- tests unitaires : 85 fichiers, 1 148 tests ;
- `npm run build` ;
- suite E2E complète sur ce build : 674 tests sur 675 passent. L'échec est un test chronométré de l'onglet Calques (5 000 objets en moins de 50 ms : 53,7 ms mesurées, tests lancés en parallèle). Lancé seul 10 fois, il passe chaque fois, avant comme après la mise à jour.
