# Firefox Bookmarks Sync To Nextcloud

> **Synchronisez vos marques-pages Firefox avec Nextcloud de manière transparente et sécurisée**

Une extension Firefox open-source qui synchronise automatiquement vos marques-pages avec votre instance Nextcloud, en utilisant l'API officielle de l'application [Bookmarks](https://apps.nextcloud.com/apps/bookmarks).

---

## ⭐ Fonctionnalités

| Fonctionnalité | Description |
|---------------|-------------|
| ✅ **Synchronisation bidirectionnelle** | Les modifications dans Firefox ou Nextcloud sont synchronisées des deux côtés |
| ✅ **Synchronisation automatique** | Synchronisation périodique en arrière-plan (configurable) |
| ✅ **Détection des conflits** | Identifie les modifications concurrentes sur le même marque-page |
| ✅ **Résolution des conflits** | Interface pour choisir entre la version locale, distante ou fusionner |
| ✅ **Gestion des dossiers** | Prend en charge la hiérarchie des dossiers |
| ✅ **Support des tags** | Synchronise les tags (fonctionnalité Nextcloud) |
| ✅ **Journal des synchronisations** | Historique des opérations avec horodatage |
| ✅ **Export des marque-pages** | Exportez vos marque-pages au format HTML |
| ✅ **Interface multilingue** | Prise en charge du français (autres langues à venir) |
| ✅ **Affichage de la progression** | Voir l'état de la synchronisation en temps réel dans le popup |
| ✅ **Gestion intelligente des favicons** | Batch processing et cache pour éviter le rate limiting |

---

## 📦 Prérequis

1. **Un serveur Nextcloud** (version 20 ou ultérieure recommandée)
2. **L'application Bookmarks activée**
   - Va dans **Paramètres → Applications → Bookmarks** et active-la
3. **Un token d'API**
   - Va dans **Paramètres → Sécurité → Tokens d'application**
   - Crée un nouveau token avec accès à l'API Bookmarks

---

## 🚀 Installation

### Méthode 1: Chargement temporaire (pour développement)

1. Clonez ou téléchargez ce dépôt :
   ```bash
   git clone https://github.com/votre-utilisateur/firefox-bookmarks-sync-to-nextcloud.git
   cd firefox-bookmarks-sync-to-nextcloud
   ```

2. Ouvre Firefox et va sur `about:debugging`

3. Clique sur **"This Firefox"** (à gauche)

4. Clique sur **"Load Temporary Add-on"**

5. Sélectionne le fichier `manifest.json` dans le dossier du projet

⚠️ **Note** : L'extension sera désinstallée à la fermeture de Firefox. Pour une installation permanente, utilise la méthode 2.

### Méthode 2: Installation permanente

1. Créez un fichier ZIP du dossier :
   ```bash
   zip -r firefox-bookmarks-sync-to-nextcloud.zip firefox-bookmarks-sync-to-nextcloud/
   ```

2. Allez sur `about:addons` dans Firefox

3. Glissez-déposez le fichier ZIP ou cliquez sur **"Install Add-on From File"**

4. Suivez les instructions à l'écran

### Méthode 3: Utilisation de web-ext (recommandé pour le développement)

1. Installe [web-ext](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/) :
   ```bash
   npm install --global web-ext
   ```

2. Dans le dossier du projet, exécute :
   ```bash
   web-ext run
   ```
   
   Cela lancera Firefox avec l'extension temporairement chargée.

---

## ⚙️ Configuration

1. **Ouvrez l'extension** : Cliquez sur l'icône dans la barre d'outils de Firefox

2. **Cliquez sur "Paramètres"** (⚙️)

3. **Remplissez les champs** :
   - **URL de Nextcloud** : `https://cloud.votredomaine.com` (sans / à la fin)
   - **Nom d'utilisateur** : Votre identifiant Nextcloud
   - **Token d'API** : Le token généré précédemment

4. **Configurez la synchronisation** :
   - Activez/désactivez la synchronisation automatique
   - Définissez l'intervalle (en minutes)
   - Activez la synchronisation au démarrage

5. **Testez la connexion** : Cliquez sur "Tester la connexion" pour vérifier que tout fonctionne

6. **Enregistrez** : Cliquez sur "Enregistrer"

7. **Lancez la synchronisation** : Cliquez sur "Synchroniser maintenant" pour tester

---

## 📁 Structure du projet

```
firefox-bookmarks-sync-to-nextcloud/
├── manifest.json              # Configuration de l'extension
├── background/               # Logique en arrière-plan
│   ├── cache.js              # Cache des favicons et bookmarks
│   ├── batch.js              # Traitement par lots
│   ├── config.js             # Configuration
│   ├── logger.js             # Journalisation
│   ├── storage.js            # Gestion du stockage IndexedDB
│   ├── nextcloud_api.js      # Client API Nextcloud
│   └── sync.js               # Synchronisation principale
├── popup/                    # Interface du popup
│   ├── popup.html            # HTML du popup
│   ├── popup.js              # Logique du popup
│   └── popup.css             # Styles du popup
├── options/                  # Page des paramètres
│   ├── options.html          # HTML des options
│   ├── options.js            # Logique des options
│   └── options.css           # Styles des options
├── lib/                      # Bibliothèques
│   └── browser-polyfill.js   # Polyfill browser/chrome API
├── icons/                    # Icônes de l'extension
│   ├── icon.svg              # Icône principale (SVG)
│   ├── icon-16.svg           # Icône 16x16
│   ├── icon-32.svg           # Icône 32x32
│   ├── icon-48.svg           # Icône 48x48
│   └── icon-96.svg           # Icône 96x96
├── _locales/                 # Tradutions
│   └── fr/                  # Français
│       └── messages.json    # Messages traduits
├── README.md                 # Ce fichier
└── .gitignore                # Fichiers à ignorer
```

---

## 🔧 Génération des icônes PNG

L'extension utilise des icônes SVG par défaut, mais Firefox recommande des icônes PNG. Pour générer les PNG à partir du SVG :

1. Installe ImageMagick :
   ```bash
   # Sur Ubuntu/Debian
   sudo apt install imagemagick
   
   # Sur macOS
   brew install imagemagick
   ```

2. Exécute le script :
   ```bash
   chmod +x icons/generate_icons.sh
   ./icons/generate_icons.sh
   ```

3. Met à jour le `manifest.json` pour pointer vers les fichiers PNG :
   ```json
   "icons": {
     "16": "icons/icon-16.png",
     "32": "icons/icon-32.png",
     "48": "icons/icon-48.png",
     "96": "icons/icon-96.png"
   }
   ```

---

## 🛠️ Développement

### Configuration de l'environnement

1. Installe les dépendances (optionnel, pour le développement) :
   ```bash
   npm install
   ```

2. Pour tester en mode développement :
   ```bash
   web-ext run
   ```

3. Pour créer un package :
   ```bash
   web-ext build
   ```

### Fonctionnalités techniques

#### Gestion intelligente des favicons
- **Cache local** : Les favicons sont mis en cache pour éviter les requêtes répétées
- **Batch processing** : Les favicons sont récupérés par lots (10 par lot, 5 requêtes simultanées max)
- **Retry automatique** : En cas d'erreur 429/500, retry avec backoff exponentiel
- **Gestion des erreurs** : Les favicons manquants (404) sont gérés gracieusement

#### Communication robuste
- **Connexion persistante** : Utilisation de `runtime.connect()` pour éviter la perte de messages
- **Double sécurisé** : Fallback sur `runtime.sendMessage()` pour la compatibilité
- **Messages de progression** : Affichage en temps réel dans le popup

### Architecture technique

- **Service Worker** (`background/sync.js`) : Gère la synchronisation en arrière-plan
- **API Nextcloud** (`background/nextcloud_api.js`) : Client REST pour l'API Bookmarks
- **Cache** (`background/cache.js`) : Stockage local des favicons et bookmarks
- **Batch Processor** (`background/batch.js`) : Traitement par lots pour éviter le rate limiting
- **UI** : popup pour les actions rapides, options pour la configuration

### Points d'entrée principaux

| Fichier | Rôle |
|--------|------|
| `background/sync.js` | Logique de synchronisation, détection des conflits |
| `background/cache.js` | Cache des favicons et bookmarks |
| `background/batch.js` | Traitement par lots |
| `popup/popup.js` | Interface utilisateur du popup |
| `options/options.js` | Page de configuration |

---

## 📜 Historique des versions

| Version | Date | Changements |
|---------|------|-------------|
| **4.5.13** | 2026-08-20 | Implémente la synchronisation bidirectionnelle de la **structure des dossiers** : les dossiers Firefox et Nextcloud manquants sont créés automatiquement de chaque côté (parents avant enfants) et une correspondance persistante (`folderMapping` dans `browser.storage.local`) fait le lien entre les deux, ce qui permet aux marque-pages d'être placés dans le bon dossier lors de la création/mise à jour. Corrige au passage deux bugs dans `nextcloud_api.js` qui empêchaient tout classement en dossier de fonctionner : le champ envoyé à l'API était `folder` (singulier) au lieu de `folders` (tableau d'IDs, nom réel attendu par l'API Bookmarks v2), et la création de dossier envoyait `name` au lieu de `title` |
| **4.5.12** | 2026-08-20 | Retire le double ✅ affiché par "Tester la connexion" dans le popup (le message du background contient déjà l'emoji). Ajoute une progression détaillée pendant la phase de synchronisation par lots (auparavant figée à 35% pendant toute la durée des créations/mises à jour/suppressions, sans aucun retour visuel). Ajoute dans `options.html#bookmarks` un indicateur détaillant l'écart Local/Nextcloud (marque-pages uniquement locaux, uniquement Nextcloud, doublons d'URL côté Firefox) pour diagnostiquer les écarts persistants entre les deux compteurs |
| **4.5.11** | 2026-08-20 | Nettoyage du popup (retrait des infos de debug verbeuses, suppression du bouton "Voir les marque-pages" redondant, rafraîchissement réactif de "Dernière synchronisation" au lieu d'un délai fixe de 3s) et correction des favicons cassées dans `options.html#bookmarks` (SVG inline mal échappé qui cassait l'attribut `src` et prenait toute la place) |
| **4.5.10** | 2026-08-20 | Correction d'une synchronisation silencieusement bloquée : l'écouteur `storage.onChanged` remettait `nextcloudAPI` à `null` dès qu'un paramètre changeait, y compris pendant une synchronisation déjà en cours, provoquant l'échec silencieux de tous les ajouts/mises à jour/suppressions restants (`nextcloudAPI is null`). `fullSync()` recharge déjà la config à chaque appel via `initNextcloudAPI()`, donc ce reset était inutile et a été retiré |
| **4.5.9** | 2026-08-19 | Nettoyage des scripts background : suppression du fallback `globalScope`/`window`/`global` (inutile dans une WebExtension Firefox, `self` est toujours disponible) et factorisation de l'export global des modules via un helper `exposeGlobal()` dans `errors.js`, chargé en premier |
| **4.5.8** | 2026-08-17 | Correction du nom de l'application, bouton "Voir tous les bookmarks" corrigé, connexion persistante pour la progression |
| **4.5.7** | 2026-08-17 | Ajout du polyfill dans popup.html |
| **4.5.6** | 2026-08-17 | Logs de debug pour progression et bouton |
| **4.5.5** | 2026-08-17 | Correction registrement écouteur de messages |
| **4.5.4** | 2026-08-17 | Affichage de la progression dans le popup |
| **4.5.3** | 2026-08-17 | Correction rate limiting et cache des favicons |
| **4.5.2** | 2026-08-17 | Version initiale avec statistiques de synchronisation |

---

## 🐛 Résolution des problèmes

### Problème : L'extension ne se charge pas

**Solutions possibles** :
1. Vérifie que le `manifest.json` est valide (utilise [Manifest Validator](https://extensionworkshop.com/documentation/develop/manifest-validator/))
2. Vérifie les erreurs dans la console : `Ctrl+Shift+J` → onglet "Console"
3. Assure-toi que tous les fichiers sont au bon endroit

### Problème : Erreur de connexion à Nextcloud

**Solutions possibles** :
1. Vérifie que l'URL de Nextcloud est correcte (sans / à la fin)
2. Vérifie que le token d'API est valide (génère-en un nouveau si nécessaire)
3. Assure-toi que l'application Bookmarks est activée sur ton Nextcloud
4. Vérifie que ton serveur Nextcloud est accessible depuis ton navigateur
5. Si tu utilises HTTPS, assure-toi que le certificat SSL est valide

### Problème : Les marques-pages ne se synchronisent pas

**Solutions possibles** :
1. Vérifie que la synchronisation automatique est activée dans les paramètres
2. Clique sur "Synchroniser maintenant" pour forcer une synchronisation
3. Vérifie les logs dans le popup pour voir les erreurs
4. Assure-toi que tu as les permissions nécessaires sur Firefox (accès aux marques-pages)

### Problème : Conflits fréquents

**Solutions possibles** :
1. Active la résolution automatique des conflits dans les paramètres avancés
2. Vérifie que l'horloge de ton ordinateur est synchronisée (les conflits sont détectés via les timestamps)
3. Évite de modifier le même marque-page simultanément sur plusieurs appareils

---

## 📚 API Nextcloud Bookmarks

L'extension utilise l'API REST officielle de Nextcloud Bookmarks. Pour plus d'informations, consulte :

- [Documentation officielle](https://github.com/nextcloud/bookmarks/blob/master/docs/api.md)
- [Code source de l'API](https://github.com/nextcloud/bookmarks)

### Endpoints réellement utilisés (`background/nextcloud_api.js`)

> ⚠️ L'extension n'utilise **pas** l'API OCS (`/ocs/v2.php/...`) mais l'API REST v2 native de l'app Bookmarks, en base sur `{baseUrl}/index.php/apps/bookmarks/public/rest/v2`. Authentification en **Basic Auth** (`username:token` encodé en base64), avec le header `OCS-APIRequest: true` requis par Nextcloud 34+.

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/folder` | Liste tous les dossiers (aussi utilisé pour `testConnection()`) |
| POST | `/folder` | Crée un dossier (`{"title": "...", "parent_folder": -1}`) |
| GET | `/bookmark?page=-1` | Liste tous les marques-pages |
| GET | `/bookmark/{id}` | Récupère un marque-page |
| POST | `/bookmark` | Crée un marque-page (`folders` = tableau d'IDs, pas `folder`) |
| PUT | `/bookmark/{id}` | Met à jour un marque-page |
| DELETE | `/bookmark/{id}` | Supprime un marque-page |
| GET | `/bookmark?search[]={query}&page=-1` | Recherche de marques-pages |
| GET | `/tag` | Liste tous les tags |
| GET/PUT/DELETE | `/bookmark/{id}/favicon` | Gestion du favicon d'un marque-page |

Vérifié le 2026-09-09 par appels directs `curl` (sans navigateur) contre `cloud.netark.fr` : round-trip create/read/update/delete sur un bookmark et un dossier, confirmant que les champs `folders` (tableau) et `title` (dossier) fonctionnent bien avec l'API réelle.

---

## 🤝 Contribuer

Les contributions sont les bienvenues ! Voici comment contribuer :

1. **Fork** le projet
2. **Crée une branche** pour ta fonctionnalité (`git checkout -b feature/amazing-feature`)
3. **Commit** tes modifications (`git commit -m 'Add amazing feature'`)
4. **Push** vers la branche (`git push origin feature/amazing-feature`)
5. **Ouvre une Pull Request**

### Idées de contributions

- [ ] Ajout du support pour d'autres langues
- [ ] Chiffrement des données avant synchronisation
- [ ] Synchronisation des favicons
- [ ] Support des collections de marques-pages
- [ ] Intégration avec l'API Firefox Sync (pour une solution hybride)
- [ ] Tests automatisés

---

## 👤 À propos

**Nom** : Firefox Bookmarks Sync To Nextcloud  
**Auteur** : Luke  
**Version** : 4.5.8  
**Licence** : MIT  

Cette extension a été développée pour faciliter la synchronisation des marques-pages entre Firefox et Nextcloud, avec une attention particulière à la gestion des conflits, à la performance (batch processing, cache, retry) et à l'expérience utilisateur.

---

## 📜 Licence

Ce projet est sous licence **MIT**. Consulte le fichier [LICENSE](LICENSE) pour plus de détails.

---

## 🙏 Remerciements

- [Nextcloud](https://nextcloud.com/) - Pour leur excellente plateforme open-source
- [Mozilla](https://www.mozilla.org/) - Pour Firefox et les WebExtensions
- [Bookmarks App](https://github.com/nextcloud/bookmarks) - L'application Nextcloud utilisée

---

## 📧 Contact

Pour toute question ou suggestion, ouvre une **Issue** sur le dépôt du projet.
