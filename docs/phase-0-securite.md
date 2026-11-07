# Phase 0 — Tester les correctifs de sécurité en local (Windows)

Ce guide permet de vérifier sur votre poste que la branche `phase-0-securite` corrige les failles relevées par l'audit, sans rien casser. Comptez 15 minutes pour les tests automatiques et 10 minutes pour les tests manuels.

Toutes les commandes se tapent dans **PowerShell**.

## 1. Prérequis

- **Node.js** 22 LTS (au minimum 20.19). Vérifiez avec `node --version`. Pour l'installer : `winget install OpenJS.NodeJS.LTS`, puis rouvrez PowerShell.
- **Git** : `git --version`. Pour l'installer : `winget install Git.Git`.
- **GitHub CLI** connecté à votre compte (`gh auth status`), déjà fait.
- Le **port 8000** doit être libre.

## 2. Récupérer la branche

Première fois :

```powershell
gh repo clone SCORPIO-JRB/svgedit-scorpio-jrb
cd svgedit-scorpio-jrb
git checkout phase-0-securite
```

Si le dépôt est déjà cloné :

```powershell
cd svgedit-scorpio-jrb
git fetch origin
git checkout phase-0-securite
git pull
```

## 3. Installer et construire

```powershell
npm ci
npm run build
```

`npm run build` construit le cœur `@svgedit/svgcanvas`, puis l'éditeur dans `dist/editor`. Relancez-le après chaque changement de branche.

## 4. Tests automatiques

### Rapide : uniquement les tests de sécurité (2 minutes)

```powershell
npx vitest run tests/unit/security-phase0.test.js
```

Résultat attendu : `Tests 15 passed (15)`.

```powershell
npx playwright install chromium
npx playwright test tests/e2e/security.spec.js
```

La première commande télécharge le navigateur de test, une seule fois. Résultat attendu : `5 passed`. Playwright démarre et arrête lui-même le serveur sur le port 8000.

### Complet : toute la suite du projet (10 à 15 minutes)

```powershell
npm test
```

Cette commande lance le lint, les tests unitaires avec couverture, puis tous les tests de bout en bout. Résultats attendus :

- tests unitaires : `Test Files 46 passed (46)` et `Tests 632 passed (632)` ;
- tests de bout en bout : `88 passed`.

## 5. Tests manuels dans le navigateur

### Lancer l'éditeur

```powershell
npm run start:e2e
```

Ouvrez http://localhost:8000/index.html dans Chrome ou Edge. Arrêtez le serveur avec `Ctrl+C` à la fin.

### Charger un fichier de test

Les fichiers sont dans `tests\fixtures\security\`.

1. Copiez le contenu du fichier dans le presse-papiers :

   ```powershell
   Get-Content tests\fixtures\security\s2-nom-de-calque.svg -Raw | Set-Clipboard
   ```

2. Dans l'éditeur, cliquez sur le bouton **Edit Source** (icône `</>` en haut à gauche, raccourci `U`).
3. Sélectionnez tout le texte (`Ctrl+A`), collez (`Ctrl+V`), puis cliquez sur **Apply Changes**.

Si une fenêtre propose d'enregistrer les préférences dans le navigateur, vous pouvez cliquer sur OK ou l'ignorer.

### Scénarios

| Test | Action | Résultat attendu avec le correctif | Sans le correctif |
| --- | --- | --- | --- |
| **S1** — chargement de code par l'URL | Ouvrir http://localhost:8000/index.html?extPath=https://example.invalid/x. Appuyer sur `F12`, onglet **Console**, taper `svgEditor.configObj.curConfig.extPath`. Onglet **Réseau**, filtrer sur `example.invalid`. | La console affiche `http://localhost:8000/extensions`. Aucune requête vers `example.invalid`. | La console affiche `https://example.invalid/x` et une dizaine de requêtes partent vers ce site. |
| **S2** — nom de calque piégé | Charger `s2-nom-de-calque.svg`, puis double-cliquer sur le rectangle vert. | Le fil d'Ariane en haut du dessin affiche le texte `Calque <img src=x onerror=...> > groupe_test`. Aucune boîte d'alerte. | Une boîte d'alerte « Faille S2 : le nom du calque est execute » s'ouvre. |
| **S3** — feuille de style externe | Ouvrir `F12`, onglet **Réseau**, filtrer sur `example.invalid`. Charger `s3-style-externe.svg`, puis rouvrir **Edit Source**. | Aucune requête vers `example.invalid`. Le source contient `<style>rect.piege { fill: none } rect.ok { fill: #2a7 }</style>`. Le rectangle de gauche n'a que son contour, celui de droite est vert. | Deux requêtes vers `example.invalid`. Le source garde `@import url(https://example.invalid/...)`. |
| **S4** — lien `javascript:` | Charger `s4-lien-javascript.svg`, puis rouvrir **Edit Source**. | Le lien du rectangle rouge n'a plus d'attribut `href`. Le lien `https://www.scorp-io.com/` du rectangle bleu est conservé. | Le source contient `href="javascript:alert(...)"`. |
| **S6** — outil initial par l'URL | Ouvrir http://localhost:8000/index.html?initTool=wireframe, puis http://localhost:8000/index.html?initTool=rect. | Avec `wireframe`, l'éditeur s'ouvre normalement en mode sélection. Avec `rect`, l'outil rectangle est actif. | Avec `wireframe`, l'éditeur s'ouvre en mode filaire (formes en contour) : l'URL a cliqué un bouton hors de la barre d'outils. |
| **B9** — identifiant commençant par un chiffre | Charger `b9-id-numerique.svg`. | Un disque rouge et un rectangle bleu apparaissent. | L'import échoue : le dessin reste vide ou un message d'erreur s'affiche. |
| **Contrôle** — fonctionnalités légitimes | Charger `controle-fonctionnalites-legitimes.svg`, puis rouvrir **Edit Source**. | Rectangle et disque en dégradé, texte « Bonjour Scorp-io », petite image. Le source conserve le dégradé, la feuille de style locale et le lien https. | Identique : ce fichier ne doit pas changer. |

## 6. Comparer avec la version d'origine (facultatif)

Pour voir les failles avant correctif :

```powershell
git checkout master
npm run build
npm run start:e2e
```

Refaites les scénarios S1 à S6 : vous obtenez les résultats de la colonne « Sans le correctif ». Revenez ensuite sur la branche corrigée :

```powershell
git checkout phase-0-securite
npm run build
```

## 7. Dépannage

- **`Port 8000 is in use`** : un autre serveur tourne. Trouvez-le avec `Get-NetTCPConnection -LocalPort 8000 | Select-Object OwningProcess`, puis arrêtez-le, ou fermez l'autre fenêtre PowerShell qui exécute `npm run start:e2e`.
- **`npm ci` échoue avec `EPERM` ou `EBUSY`** : fermez les éditeurs ouverts sur le dossier (VS Code), désactivez temporairement l'analyse antivirus du dossier, puis relancez.
- **`Unsupported engine`** : mettez Node.js à jour (`winget upgrade OpenJS.NodeJS.LTS`).
- **Les tests E2E sont ignorés avec un avertissement Playwright** : lancez `npx playwright install chromium`, puis relancez `npm test`.

## 8. Ce que contient la branche

- **Configuration par URL** : `extPath`, `imgPath`, toute option se terminant par `Path`, `userExtensions`, `forceStorage` et `allowedOrigins` sont ignorés quand ils viennent de l'URL. Le paramètre `lang` est validé. `initTool` ne peut activer que les boutons de la barre d'outils.
- **Fil d'Ariane** : il est construit avec des nœuds DOM, donc les noms venant du document restent du texte.
- **Filtre d'import** :
  - liens `javascript:`, `vbscript:` et `data:` hors images supprimés ;
  - dans `<style>`, `@import` et `url()` externes neutralisés, y compris derrière des échappements CSS ;
  - contrôle des liens saisis dans l'éditeur ;
  - plus de re-parsing HTML lors du dégroupage.
- **Identifiants** : ceux qui commencent par un chiffre ou contiennent des guillemets ne font plus échouer les recherches d'éléments.
- **Tests** : `tests/unit/security-phase0.test.js` (15 tests), `tests/e2e/security.spec.js` (5 tests) et les fichiers de test manuels `tests/fixtures/security/`.

La branche n'est pas fusionnée dans `master`. Pour revenir en arrière, il suffit de rester sur `master`.
