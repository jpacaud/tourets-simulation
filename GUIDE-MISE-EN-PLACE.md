# Simulation du cycle des tourets – guide de mise en place

_09/10/2026 – POC de test, données fictives uniquement._

## Vue d'ensemble

```
 Téléphone (app GitHub Pages)                Power Automate / Copilot Studio            SharePoint = faux ABAS
 ───────────────────────────                 ───────────────────────────────            ──────────────────────
 Scan QR « Départ »  ──POST action=expedition──▶ Flux 1 « Réception scan » ──écrit──▶ ABAS_Tourets : En livraison + DateExpedition
 Scan QR « Retour »  ──POST action=retour─────▶ Flux 1 « Réception scan » ──écrit──▶ ABAS_Tourets : Retourné + DateRetour
                                                                                       ABAS_Scans   : journal des scans
                                               Flux 2 « Cycle » (toutes les 2 min)
                                               lit ABAS_Tourets (Statut = En livraison)
                                               ├─ ≥ 10 min : mail relance 1  ──────▶ ABAS_Relances
                                               ├─ ≥ 20 min : mail relance 2  ──────▶ ABAS_Relances
                                               └─ ≥ 30 min, puis toutes les 30 min :
                                                  facture fictive + mail     ──────▶ ABAS_Factures
```

On respecte la règle du projet : **le workflow ne lit que le faux ABAS**. Le scan de retour ne « parle » pas au flux 2. Il écrit un retour dans ABAS, et le flux 2 ne voit plus le touret.
Le flux 2 s'arrête aussi si on passe le statut à **Perdu** ou **Abîmé** à la main dans la liste, comme dans la vraie saisie manuelle.

| Simulation | Réel |
|---|---|
| +10 min : relance 1 | M+2 |
| +20 min : relance 2 | M+5 |
| +30 min : 1re facture, puis toutes les 30 min | M+6, puis chaque mois commencé |
| Mail à moi-même, préfixé [TEST] | Mail au client |
| Liste ABAS_Factures | Facture créée dans ABAS |

---

## Étape 1 – Créer le faux ABAS dans SharePoint (5 min)

1. Choisir où créer les listes :
   - **Site personnel (OneDrive)** : toujours disponible, sans droits admin. Ouvrir OneDrive dans le navigateur. L'adresse du site est `https://<tenant>-my.sharepoint.com/personal/<prenom_nom_domaine>`, et c'est elle qu'on choisira dans Power Automate (« Entrer une valeur personnalisée »).
   - **Site d'une équipe Teams** dont tu es membre : dans Teams → l'équipe → onglet **Fichiers** → **Ouvrir dans SharePoint**.
   - **Nouveau site** : page d'accueil SharePoint → **+ Créer un site**. Ce bouton est absent si l'admin a désactivé la création de sites.
2. Ouvrir la page d'accueil du site dans Edge ou Chrome.
3. Appuyer sur **F12**, puis ouvrir l'onglet **Console**. Si le navigateur refuse le collage, taper `allow pasting` puis Entrée.
4. Copier tout le contenu de `sharepoint/creer-faux-abas.js`, le coller dans la console et valider.
5. Le script crée 5 listes et y insère les données fictives :

| Liste | Rôle | Colonnes principales |
|---|---|---|
| **ABAS_Clients** | Clients (3) | Title (= CodeClient), NomClient, Contact, EmailClient |
| **ABAS_Tourets** | Tourets (6), état du cycle | Title (= NumTouret), CodeClient, NomClient, BL, Statut, DateExpedition, Relance1, Relance2, NbFactures, DerniereFacture, DateRetour, AdresseRetour |
| **ABAS_Relances** | Journal des relances envoyées | Title (= Reference), CodeClient, Niveau, Tourets, DateEnvoi |
| **ABAS_Factures** | Factures fictives | Title (= NumFacture), CodeClient, Tourets, NbTourets, Montant, DateFacture |
| **ABAS_Scans** | Journal des scans reçus | Title (= NumTouret), Action, DateScan, Donnees |

> La colonne interne `Title` est affichée sous un autre nom (NumTouret, CodeClient…). Dans les filtres Power Automate, il faut écrire **`Title`**.

**Pour remettre la simulation à zéro**, dans la console du site : `resetSimulation()`. Tous les tourets repassent « En stock ».

Si la console est bloquée par la DSI, crée les listes à la main avec les colonnes ci-dessus. Les types sont : Date et heure pour les Date*/Relance*, Nombre pour Nb*/Montant/Niveau, Choix pour Statut (En stock, En livraison, Retourné, Perdu, Abîmé).

---

## Étape 2 – Flux 1 « Tourets – Réception scan » (déclencheur HTTP)

À créer dans **make.powerautomate.com** (environnement **ELYDAN (default)**) → **+ Créer** → **Flux de cloud instantané** → **Ignorer**, puis nommer le flux `Tourets – Réception scan`.

### ⚠ Licence : le déclencheur HTTP est Premium

Le déclencheur **Demander → Lors de la réception d'une requête HTTP** est un connecteur **Premium**. Sans licence Premium, on peut le placer dans le concepteur, mais le flux ne pourra pas être enregistré ou activé. **Ce flux 1 est le seul élément Premium de la simulation.** Le flux 2 n'utilise que des connecteurs standard : Périodicité, SharePoint, Outlook et Opération de données.

Options à voir avec ton responsable :

| Option | Coût | Remarque |
|---|---|---|
| **Licence Power Automate Premium** pour ton compte | Abonnement mensuel par utilisateur (voir le tarif en vigueur avec l'admin M365) | Solution la plus simple, et c'est celle du guide |
| **Essai Premium gratuit** (durée limitée) | 0 € | Proposé par Power Automate quand on enregistre un flux Premium, si l'admin a autorisé les essais |
| **Flux d'agent dans Copilot Studio** | Crédits Copilot Studio consommés à chaque action | Les connecteurs Premium sont utilisables avec une licence Copilot Studio. À vérifier avec l'admin |
| **Plan B sans Premium : Microsoft Forms** | 0 € | Le scan ouvre un formulaire déjà rempli, et l'utilisateur appuie sur « Envoyer ». Le flux démarre sur « Lorsqu'une nouvelle réponse est envoyée » (standard). Il faut un clic de plus et l'app doit être adaptée |

Il faut aussi que l'admin Power Platform autorise les déclencheurs HTTP « Tout le monde », s'ils sont bloqués par une stratégie DLP.

### 2.1 Pas à pas : premiers blocs et premier test

Libellés de cette interface : le connecteur **Request** s'appelle **Demander**, et l'action **Compose** s'appelle **Message** (dans **Opération de données**). La recherche par mot-clé trouve mal les outils intégrés : passe plutôt par **Ajouter une action → Outils intégrés**, ou par le filtre **Prédéfini**.

**A. Le déclencheur**
1. Dans l'éditeur, clique sur **Ajouter un déclencheur**, puis **Outils intégrés** (ou filtre **Prédéfini**) → **Demander**.
2. Choisis **Lors de la réception d'une requête HTTP**.
3. Dans le panneau du déclencheur :
   - **Qui peut déclencher le flux** : **Tout le monde** ;
   - **Schéma JSON du corps de la demande** : laisser **vide** ;
   - **Paramètres avancés → Méthode** : **POST**.

**B. L'action « Payload »**
1. Sous le déclencheur, clique sur **+** → **Ajouter une action** → **Outils intégrés** → **Opération de données** → **Message**.
2. Renomme l'action : en haut de son panneau, clique sur le titre **Message**, efface-le, tape `Payload` et appuie sur **Entrée**.
3. Clique dans le champ **Entrées**. Deux icônes apparaissent, un éclair ⚡ (contenu dynamique) et **fx** (expression) : clique sur **fx**.
4. Colle l'expression ci-dessous et clique sur **Ajouter** (ou **OK**). Le champ affiche alors un jeton violet `json(...)`.
   ```
   json(string(triggerBody()))
   ```

**C. Enregistrer et copier l'URL**
1. En haut à droite, clique sur **Enregistrer**. En cas d'erreur, l'icône **stéthoscope** (Vérificateur de flux) donne le détail.
2. Clique de nouveau sur le déclencheur : le champ **URL HTTP**, vide avant l'enregistrement, est maintenant rempli.
3. Copie l'URL avec l'icône **copier** à droite du champ.

> 🔒 Garde cette URL pour toi : sa partie `sig=` suffit pour déclencher le flux. Si elle a circulé, tu peux la régénérer en supprimant puis en recréant le déclencheur.

**D. Envoyer un scan de test**
1. Appuie sur **Windows + X** → **Terminal** (ou **Windows PowerShell**).
2. Tape la première ligne, en gardant les **apostrophes** autour de l'URL, puis appuie sur **Entrée** :
   ```powershell
   $url = 'COLLE_TON_URL_ICI'
   ```
3. Tape la deuxième ligne, puis appuie sur **Entrée** :
   ```powershell
   Invoke-RestMethod -Method Post -Uri $url -ContentType 'text/plain' -Body '{"action":"expedition","touret":"TEST-001"}'
   ```
4. À ce stade, rien ne s'affiche, et c'est normal : le flux n'a pas encore d'action Réponse. Si du texte rouge apparaît, c'est une erreur à analyser.

**E. Vérifier ce que le flux a reçu**
1. Dans l'éditeur, clique sur **← Précédent** pour ouvrir la page de détails du flux.
2. En bas, dans **Historique d'exécution sur 28 jours**, une ligne doit apparaître avec l'heure du test. Si ce n'est pas le cas, clique sur **Actualiser**.
3. Clique sur la **date** de l'exécution. Chaque bloc porte une coche verte ✅ ou une croix rouge ❌.
4. Clique sur **Payload** et regarde la section **Sorties**. On attend :
   ```json
   { "action": "expedition", "touret": "TEST-001" }
   ```
5. Si **Payload** est en échec avec un message sur une valeur base64, remplace l'expression par `json(base64ToString(triggerBody()?['$content']))`.

Quand ce test est bon, on complète le flux avec le tableau ci-dessous, à partir de la ligne 3.

### 2.2 Tableau récapitulatif du flux 1

Les noms d'actions ci-dessous sont à respecter **exactement** (avec `_`), car les expressions y font référence.

| # | Action | Nom à donner | Paramètres |
|---|---|---|---|
| 1 | connecteur **Demander** (Request) → **Lors de la réception d'une requête HTTP** (When an HTTP request is received) | – | *Qui peut déclencher* : **Tout le monde**. *Méthode* : POST. **Pas de schéma JSON.** |
| 2 | **Message** (Compose) | `Payload` | Entrée : `json(string(triggerBody()))` |
| 3 | SharePoint **Obtenir les éléments** (Get items) | `Chercher_touret` | Site : ton site. Liste : ABAS_Tourets. Requête de filtre : `Title eq '@{outputs('Payload')?['touret']}'`. Nombre maximal : 1 |
| 4 | **Condition** | `Touret_connu` | `length(outputs('Chercher_touret')?['body/value'])` **est supérieur à** `0` |
| 4-Non | **Réponse** (Response) puis **Terminer** (Terminate) | `Reponse_404` | Code 404. En-têtes : `Access-Control-Allow-Origin` = `*`. Corps : `{"ok": false, "message": "Touret inconnu"}`. Terminer : Réussi |
| 5 | **Message** (après la condition) | `Touret` | `first(outputs('Chercher_touret')?['body/value'])` |
| 6 | **Switch** | `Selon_action` | Sur : `outputs('Payload')?['action']` |
| 6a | Cas **`expedition`** → SharePoint **Mettre à jour l'élément** (Update item) | `Maj_expedition` | Liste ABAS_Tourets. Id : `outputs('Touret')?['ID']`. Title : `outputs('Touret')?['Title']`. Statut : **En livraison**. DateExpedition : `utcNow()`. NbFactures : `0`. Relance1, Relance2, DerniereFacture, DateRetour : `null` (expression) |
| 6b | Cas **`retour`** → **Mettre à jour l'élément** | `Maj_retour` | Id et Title : idem. Statut : **Retourné**. DateRetour : `utcNow()`. AdresseRetour : `outputs('Payload')?['position']?['adresse']`. GPSRetour : `concat(outputs('Payload')?['position']?['lat'], ',', outputs('Payload')?['position']?['lng'])` |
| 6c | Cas **par défaut** → **Réponse** + **Terminer** | `Reponse_400` | Code 400, même en-tête CORS, corps `{"ok": false, "message": "Action inconnue"}` |
| 7 | SharePoint **Créer un élément** (Create item) | `Journal_scan` | Liste ABAS_Scans. Title : `outputs('Payload')?['touret']`. Action : `outputs('Payload')?['action']`. DateScan : `utcNow()`. Donnees : `string(outputs('Payload'))` |
| 8 | **Réponse** | `Reponse_OK` | Code 200. En-têtes : `Content-Type` = `application/json`, `Access-Control-Allow-Origin` = `*`. Corps : voir ci-dessous |

Corps de la réponse 200 :
```json
{
  "ok": true,
  "touret": "@{outputs('Payload')?['touret']}",
  "action": "@{outputs('Payload')?['action']}",
  "statut": "@{if(equals(outputs('Payload')?['action'], 'expedition'), 'En livraison', 'Retourné')}"
}
```

**Enregistrer**, puis rouvrir le déclencheur et **copier l'URL HTTP**. C'est elle qu'on colle dans l'app.

### Tester le flux 1 sans l'app (PowerShell)
```powershell
$url = "<URL du déclencheur>"
Invoke-RestMethod -Method Post -Uri $url -ContentType "text/plain" -Body '{"action":"expedition","touret":"TEST-001"}'
```
→ La réponse doit contenir `ok: True`, et TEST-001 passe « En livraison » dans ABAS_Tourets.

> Pourquoi `text/plain` ? Un navigateur qui envoie du `application/json` vers un autre domaine fait d'abord une requête de vérification CORS (OPTIONS). Avec `text/plain`, cette vérification n'a pas lieu, et le flux relit le JSON avec `json(string(triggerBody()))`.
> Si l'action `Payload` échoue sur « valeur base64 », remplace son expression par `json(base64ToString(triggerBody()?['$content']))`.

---

## Étape 3 – Flux 2 « Tourets – Cycle relances et facturation » (planifié)

✅ **Aucun connecteur Premium** : ce flux fonctionne avec une licence Microsoft 365 standard.

**Principe** : toutes les 2 minutes, le flux lit les tourets « En livraison » du faux ABAS. Pour chaque client, il cherche les tourets qui doivent recevoir la relance 1, la relance 2 ou une facture, envoie **un seul mail par client et par type**, puis met à jour les tourets concernés.

**Structure finale du flux :**
```
Périodicité (toutes les 2 min)
├─ Initialiser la variable ×6        EmailTest, R1_min, R2_min, Fact_min, Periode_min, Tarif
├─ Tourets_actifs                    (SharePoint – Obtenir les éléments)
├─ Clients                           (SharePoint – Obtenir les éléments)
└─ Pour_chaque_client                (Pour chaque)
   ├─ Tourets_du_client              (Filtrer un tableau)
   ├─ A_relancer_1                   (Filtrer un tableau)
   ├─ A_relancer_2                   (Filtrer un tableau)
   ├─ A_facturer                     (Filtrer un tableau)
   ├─ Si_relance_1  (Condition) → Oui : Lignes_R1, Numeros_R1, Table_R1, Mail_R1, Journal_R1, Maj_R1
   ├─ Si_relance_2  (Condition) → Oui : Lignes_R2, Numeros_R2, Table_R2, Mail_R2, Journal_R2, Maj_R2
   └─ Si_facture    (Condition) → Oui : Num_facture, Montant_total, Lignes_facture, Numeros_facture,
                                         Table_facture, Enregistrer_facture, Mail_facture, Maj_facture
```

**Règles qui valent pour tout le flux :**
- **Noms des actions** : renomme chaque action **exactement** comme indiqué, avec les `_` et sans accents. Pour cela, clique sur son titre en haut de son panneau, tape le nouveau nom et appuie sur **Entrée**. Les expressions désignent les actions par leur nom.
- **Expressions** (texte en `code`) : clique dans le champ, puis sur **fx**, colle l'expression et clique sur **Ajouter**. Ne tape pas une expression directement dans le champ : elle serait prise comme du texte.
- **Actions intégrées** : passe par **Ajouter une action → Outils intégrés**. Dans cette interface, Compose s'appelle **Message**, et les actions **Filtrer un tableau**, **Sélectionner** et **Créer un tableau HTML** sont dans **Opération de données**.
- **Site SharePoint** : dans chaque action SharePoint, choisis **Entrer une valeur personnalisée** et colle `https://elydan-my.sharepoint.com/personal/jpacaud_elydan_eu`.
- **Enregistrement** : clique sur **Enregistrer** régulièrement. En cas d'erreur, l'icône **stéthoscope** (Vérificateur de flux) indique l'action en cause.

---

### 3.1 Créer le flux et son déclencheur

1. Sur **make.powerautomate.com** : **+ Créer** → **Flux de cloud planifié**.
2. Nom du flux : `Tourets – Cycle relances et facturation`.
3. **Répéter toutes les** : `2` **Minute**, puis **Créer**. Le déclencheur **Périodicité** (Recurrence) est déjà en place.
4. **Éviter les exécutions en double** : clique sur le déclencheur **Périodicité**, puis sur l'onglet **Paramètres** du panneau. Active **Contrôle d'accès concurrentiel** et règle **Degré de parallélisme** sur **1**.

### 3.2 Les 6 variables

Sous le déclencheur : **+** → **Ajouter une action** → **Outils intégrés** → **Variable** → **Initialiser la variable**. Répète l'opération 6 fois, chaque nouvelle variable sous la précédente :

| Nom | Type | Valeur |
|---|---|---|
| `EmailTest` | Chaîne (String) | `jpacaud@elydan.eu` |
| `R1_min` | Entier (Integer) | `10` |
| `R2_min` | Entier | `20` |
| `Fact_min` | Entier | `30` |
| `Periode_min` | Entier | `30` |
| `Tarif` | Entier | `130` |

Ici, les valeurs se tapent directement, sans **fx**. Tu n'as pas besoin de renommer ces actions : c'est le champ **Nom** de la variable qui compte.

### 3.3 Lire le faux ABAS

**Action `Tourets_actifs`**
1. **+** → **Ajouter une action** → recherche `SharePoint` → **Obtenir les éléments** (Get items).
2. Renomme-la `Tourets_actifs`.
3. **Adresse du site** : **Entrer une valeur personnalisée** → `https://elydan-my.sharepoint.com/personal/jpacaud_elydan_eu`.
4. **Nom de la liste** : `ABAS_Tourets`.
5. Ouvre **Paramètres avancés**, puis **Requête de filtre** et tape tel quel (sans fx) :
   ```
   Statut eq 'En livraison'
   ```
6. **Nombre maximal** : `500`.

**Action `Clients`**
1. **+** → SharePoint → **Obtenir les éléments**, renommée `Clients`.
2. Même site. **Nom de la liste** : `ABAS_Clients`. Pas de filtre.

**Enregistre.**

### 3.4 La boucle par client

1. **+** → **Ajouter une action** → **Outils intégrés** → **Control** → **Pour chaque** (Apply to each).
2. Renomme-la `Pour_chaque_client`.
3. Dans le champ **Sélectionner une sortie des étapes précédentes**, clique sur **fx** et colle :
   ```
   outputs('Clients')?['body/value']
   ```

**Toutes les actions suivantes vont À L'INTÉRIEUR de `Pour_chaque_client`.** Utilise le **+** situé dans le cadre de la boucle, et non celui qui se trouve en dessous.

### 3.5 Les 4 filtres

Pour chaque filtre :
1. **+** (dans la boucle) → **Outils intégrés** → **Opération de données** → **Filtrer un tableau**, puis renomme l'action.
2. Champ **De** : **fx**, puis colle l'expression « De ».
3. Sous la condition, clique sur **Modifier en mode avancé** et **remplace tout le contenu** par l'expression « Condition », qui commence par `@`. En mode avancé, on colle directement le texte, sans fx.

**`Tourets_du_client`**, pour garder les tourets actifs de ce client :
- De : `outputs('Tourets_actifs')?['body/value']`
- Condition :
  ```
  @equals(item()?['CodeClient'], items('Pour_chaque_client')?['Title'])
  ```

**`A_relancer_1`**, pour les tourets expédiés depuis au moins 10 min et pas encore relancés :
- De : `body('Tourets_du_client')`
- Condition :
  ```
  @and(empty(item()?['Relance1']), greaterOrEquals(div(sub(ticks(utcNow()), ticks(item()?['DateExpedition'])), 600000000), variables('R1_min')))
  ```

**`A_relancer_2`**, pour les tourets déjà relancés une fois et expédiés depuis au moins 20 min :
- De : `body('Tourets_du_client')`
- Condition :
  ```
  @and(not(empty(item()?['Relance1'])), empty(item()?['Relance2']), greaterOrEquals(div(sub(ticks(utcNow()), ticks(item()?['DateExpedition'])), 600000000), variables('R2_min')))
  ```

**`A_facturer`**, pour les tourets expédiés depuis au moins 30 min qui n'ont pas encore été facturés pour la période en cours :
- De : `body('Tourets_du_client')`
- Condition :
  ```
  @and(greaterOrEquals(div(sub(ticks(utcNow()), ticks(item()?['DateExpedition'])), 600000000), variables('Fact_min')), less(coalesce(item()?['NbFactures'], 0), add(div(sub(div(sub(ticks(utcNow()), ticks(item()?['DateExpedition'])), 600000000), variables('Fact_min')), variables('Periode_min')), 1)))
  ```

> Comment lire les calculs : `div(sub(ticks(utcNow()), ticks(DateExpedition)), 600000000)` donne le nombre de minutes écoulées depuis l'expédition (une minute vaut 600 000 000 ticks). Pour la facturation, le nombre de périodes dues vaut 1 + (minutes − 30) ÷ 30 : 1 période à 30 min, 2 à 60 min, 3 à 90 min… Si le touret a été facturé moins de fois que ce nombre, on le facture une fois de plus. C'est la règle « tout mois commencé est facturé ».

**Enregistre.**

### 3.6 Bloc Relance 1

**La condition**
1. **+** (dans la boucle, sous les filtres) → **Outils intégrés** → **Control** → **Condition**, renommée `Si_relance_1`.
2. Valeur de gauche : **fx** → `length(body('A_relancer_1'))`
3. Opérateur : **est supérieur à**. Valeur de droite : `0`

**Toutes les actions ci-dessous vont dans la branche « Vrai » (ou « Oui ») de `Si_relance_1`.**

**a. `Lignes_R1`** : **Opération de données → Sélectionner**
- De : **fx** → `body('A_relancer_1')`
- **Mappage** : une ligne par colonne du tableau du mail. Tape la clé à gauche et mets la valeur à droite avec **fx** :

| Clé | Valeur (fx) |
|---|---|
| `Touret` | `item()?['Title']` |
| `Type` | `item()?['TypeTouret']` |
| `BL` | `item()?['BL']` |
| `Expédié le` | `convertFromUtc(item()?['DateExpedition'], 'Romance Standard Time', 'dd/MM/yyyy HH:mm')` |

**b. `Numeros_R1`** : **Opération de données → Sélectionner**, qui sert à obtenir la simple liste des numéros
- De : **fx** → `body('A_relancer_1')`
- À droite de **Mappage**, clique sur l'icône **Basculer en mode texte** (« T »), puis dans l'unique champ : **fx** → `item()?['Title']`

**c. `Table_R1`** : **Opération de données → Créer un tableau HTML**
- De : **fx** → `body('Lignes_R1')`
- Colonnes : **Automatique**

**d. `Mail_R1`** : **+** → recherche `Outlook` → **Office 365 Outlook** → **Envoyer un e-mail (V2)**
- La première fois, Power Automate demande de se connecter : accepte avec ton compte Elydan.
- **À** : **fx** → `variables('EmailTest')`
- **Objet** : **fx** →
  ```
  concat('[TEST] Relance 1 – tourets à retourner – ', items('Pour_chaque_client')?['NomClient'])
  ```
- **Corps** : clique dans le corps, puis **fx** →
  ```
  concat('<p style="color:#b26a00"><b>SIMULATION</b> – destinataire réel prévu : ', items('Pour_chaque_client')?['EmailClient'], '</p><p>Bonjour,</p><p>Sauf erreur de notre part, les tourets suivants livrés à <b>', items('Pour_chaque_client')?['NomClient'], '</b> ne nous ont pas encore été retournés :</p>', body('Table_R1'), '<p>Merci de nous signaler leur mise à disposition en scannant le QR code présent sur chaque touret.</p><p>Cordialement,<br>Elydan</p>')
  ```
  Ce corps sera remplacé par le gabarit officiel plus tard.

**e. `Journal_R1`** : **SharePoint → Créer un élément**
- Site : valeur personnalisée (voir plus haut). Liste : `ABAS_Relances`.
- Les colonnes de la liste apparaissent. Ouvre **Afficher tout** (ou **Paramètres avancés**) si certaines sont masquées :

| Colonne | Valeur (fx) |
|---|---|
| **Reference** (colonne Title) | `concat('R1-', items('Pour_chaque_client')?['Title'], '-', formatDateTime(utcNow(), 'yyyyMMddHHmmss'))` |
| CodeClient | `items('Pour_chaque_client')?['Title']` |
| NomClient | `items('Pour_chaque_client')?['NomClient']` |
| Niveau | `1` (tapé directement) |
| Tourets | `join(body('Numeros_R1'), ', ')` |
| Destinataire | `items('Pour_chaque_client')?['EmailClient']` |
| DateEnvoi | `utcNow()` |

**f. `Maj_R1`** : noter la relance sur chaque touret concerné
1. **Control → Pour chaque**, renommée `Maj_R1`. Sortie : **fx** → `body('A_relancer_1')`
2. **Dans** `Maj_R1` : **SharePoint → Mettre à jour l'élément** (Update item)
   - Site : valeur personnalisée. Liste : `ABAS_Tourets`
   - **Id** : **fx** → `items('Maj_R1')?['ID']`
   - **NumTouret** (colonne Title, obligatoire) : **fx** → `items('Maj_R1')?['Title']`
   - **Relance1** : **fx** → `utcNow()`
   - Laisse **tous les autres champs vides** : ils ne seront pas modifiés.

**Enregistre.**

### 3.7 Bloc Relance 2

Même construction que la relance 1, **dans la boucle `Pour_chaque_client`**, sous `Si_relance_1` et non à l'intérieur. Refais-la plutôt que de la copier : une copie renomme les actions et casse les expressions.

| Élément | Valeur pour la relance 2 |
|---|---|
| Condition | `Si_relance_2` : **fx** `length(body('A_relancer_2'))` **est supérieur à** `0` |
| `Lignes_R2` | De : `body('A_relancer_2')`. Même mappage que `Lignes_R1` |
| `Numeros_R2` | De : `body('A_relancer_2')`. Mode texte : `item()?['Title']` |
| `Table_R2` | De : `body('Lignes_R2')` |
| `Mail_R2` – À | `variables('EmailTest')` |
| `Mail_R2` – Objet | `concat('[TEST] Relance 2 – tourets à retourner – ', items('Pour_chaque_client')?['NomClient'])` |
| `Mail_R2` – Corps | voir ci-dessous |
| `Journal_R2` | Comme `Journal_R1`, avec **Reference** : `concat('R2-', items('Pour_chaque_client')?['Title'], '-', formatDateTime(utcNow(), 'yyyyMMddHHmmss'))`, **Niveau** : `2`, **Tourets** : `join(body('Numeros_R2'), ', ')` |
| `Maj_R2` | **Pour chaque** sur `body('A_relancer_2')`, avec dedans **Mettre à jour l'élément** : Id `items('Maj_R2')?['ID']`, NumTouret `items('Maj_R2')?['Title']`, **Relance2** `utcNow()` |

Corps de `Mail_R2` (fx) :
```
concat('<p style="color:#b26a00"><b>SIMULATION</b> – destinataire réel prévu : ', items('Pour_chaque_client')?['EmailClient'], '</p><p>Bonjour,</p><p>Malgré notre précédente relance, les tourets suivants livrés à <b>', items('Pour_chaque_client')?['NomClient'], '</b> ne nous ont toujours pas été retournés :</p>', body('Table_R2'), '<p>Sans retour de votre part, la location sera facturée ', string(variables('Tarif')), ' € HT par touret et par mois commencé.</p><p>Cordialement,<br>Elydan</p>')
```

**Enregistre.**

### 3.8 Bloc Facturation

**La condition** : **Control → Condition**, renommée `Si_facture`, **dans la boucle** sous `Si_relance_2`.
- Gauche : **fx** → `length(body('A_facturer'))` · **est supérieur à** · `0`

**Dans la branche « Vrai » :**

**a. `Num_facture`** : **Opération de données → Message**
- Entrées : **fx** → `concat('FS-', formatDateTime(utcNow(), 'yyyyMMdd-HHmm'), '-', items('Pour_chaque_client')?['Title'])`

**b. `Montant_total`** : **Message**
- Entrées : **fx** → `mul(length(body('A_facturer')), variables('Tarif'))`

**c. `Lignes_facture`** : **Sélectionner**
- De : **fx** → `body('A_facturer')`
- Mappage :

| Clé | Valeur (fx) |
|---|---|
| `Touret` | `item()?['Title']` |
| `Type` | `item()?['TypeTouret']` |
| `BL` | `item()?['BL']` |
| `Période n°` | `add(coalesce(item()?['NbFactures'], 0), 1)` |
| `Montant (€ HT)` | `variables('Tarif')` |

**d. `Numeros_facture`** : **Sélectionner** en mode texte
- De : `body('A_facturer')` · valeur : `item()?['Title']`

**e. `Table_facture`** : **Créer un tableau HTML**
- De : **fx** → `body('Lignes_facture')`

**f. `Enregistrer_facture`** : **SharePoint → Créer un élément**, liste `ABAS_Factures`

| Colonne | Valeur (fx) |
|---|---|
| **NumFacture** (colonne Title) | `outputs('Num_facture')` |
| CodeClient | `items('Pour_chaque_client')?['Title']` |
| NomClient | `items('Pour_chaque_client')?['NomClient']` |
| Tourets | `join(body('Numeros_facture'), ', ')` |
| NbTourets | `length(body('A_facturer'))` |
| Montant | `outputs('Montant_total')` |
| DateFacture | `utcNow()` |

**g. `Mail_facture`** : **Office 365 Outlook → Envoyer un e-mail (V2)**
- À : `variables('EmailTest')`
- Objet (fx) :
  ```
  concat('[TEST] Facture de location fictive ', outputs('Num_facture'), ' – ', items('Pour_chaque_client')?['NomClient'])
  ```
- Corps (fx) :
  ```
  concat('<p style="color:#b26a00"><b>SIMULATION</b> – facture fictive, destinataire réel prévu : ', items('Pour_chaque_client')?['EmailClient'], '</p><p>Facture <b>', outputs('Num_facture'), '</b> – location de tourets non restitués – client <b>', items('Pour_chaque_client')?['NomClient'], '</b></p>', body('Table_facture'), '<p><b>Total : ', string(outputs('Montant_total')), ' € HT</b></p>')
  ```

**h. `Maj_facture`** : **Control → Pour chaque** sur **fx** `body('A_facturer')`, avec dedans **SharePoint → Mettre à jour l'élément**, liste `ABAS_Tourets` :
- Id : `items('Maj_facture')?['ID']`
- NumTouret : `items('Maj_facture')?['Title']`
- NbFactures : `add(coalesce(items('Maj_facture')?['NbFactures'], 0), 1)`
- DerniereFacture : `utcNow()`

**Enregistre.** Le flux est complet.

### 3.9 Tester le flux 2 sans l'app (ni Premium)

Le flux 2 ne lit que la liste `ABAS_Tourets`. On peut donc simuler une expédition **à la main** :

1. Ouvre la liste : https://elydan-my.sharepoint.com/personal/jpacaud_elydan_eu/Lists/ABAS_Tourets
2. Sur **TEST-001**, clique sur **Modifier** (ou ouvre l'élément et clique sur **Modifier tout**) :
   - **Statut** : `En livraison` ;
   - **DateExpedition** : aujourd'hui, **il y a 35 minutes**, pour déclencher tout de suite relance 1, relance 2 et facture ;
   - **Enregistrer**.
3. Fais de même avec **TEST-004** (même client CLI-001), pour vérifier le regroupement dans un seul mail.
4. Dans Power Automate, ouvre le flux 2 et clique sur **Tester** → **Manuellement** → **Tester**, sans attendre les 2 minutes.

**Résultats attendus :**
- **1re exécution** : un mail **Relance 1** pour *Exemple TP Rhône-Alpes*, listant TEST-001 et TEST-004, et une facture **FS-…** de 260 € (2 × 130 €). Les colonnes Relance1, NbFactures = 1 et DerniereFacture sont remplies.
- **2e exécution** (2 min plus tard) : un mail **Relance 2**. La relance 2 attend que la relance 1 soit enregistrée, d'où ce décalage d'une exécution.
- Ensuite, plus rien jusqu'à 60 min après l'expédition, puis une facture « Période n° 2 ».
- **Arrêter le cycle** : passe **Statut** à `Retourné` (ou `Perdu` / `Abîmé`). Les exécutions suivantes ne font plus rien pour ce touret.

En cas d'erreur, ouvre l'exécution dans l'historique et clique sur l'action en rouge : son message indique en général le nom d'action ou la colonne en cause.

> 💡 **Désactive le flux 2 en dehors des tests** (page du flux → **Désactiver**), pour éviter qu'il tourne toutes les 2 minutes en continu.

---

## Étape 4 – Brancher l'app

1. Ouvrir l'app (GitHub Pages) sur le PC, **sans** `?t=` dans l'URL : c'est le mode bureau.
2. Dans **Connexion au workflow**, coller l'URL du flux 1, puis **Enregistrer sur cet appareil**.
3. Un **QR de configuration** apparaît. Le scanner une fois avec le téléphone : l'URL est enregistrée dans le navigateur du téléphone.

L'URL du flux **n'est jamais écrite dans le code**, parce que le dépôt GitHub est public et que cette URL contient une signature qui permet de déclencher le flux. Elle reste dans le navigateur de chaque appareil (localStorage). Ne diffuse pas le QR de configuration.

---

## Étape 5 – Scénario de test (≈ 1 h)

| T | Action | Résultat attendu |
|---|---|---|
| 0 | `resetSimulation()` dans la console SharePoint | 6 tourets « En stock » |
| 0 | Scanner **Départ** de TEST-001, TEST-004 et TEST-002 | Message « Workflow notifié ✔ ». ABAS_Tourets : En livraison + DateExpedition. ABAS_Scans : 3 lignes |
| +10 min | – | **2 mails** relance 1 : un pour CLI-001 (TEST-001 + TEST-004 regroupés), un pour CLI-002 (TEST-002) |
| +15 min | Scanner **Retour** de TEST-002 (localiser → « Prêt à enlever ») | TEST-002 « Retourné », DateRetour, AdresseRetour renseignée |
| +20 min | – | Relance 2 **uniquement pour CLI-001**. Rien pour CLI-002 : le retour a arrêté le cycle ✔ |
| +30 min | – | Facture FS-… pour CLI-001 : 2 tourets × 130 € = 260 € |
| +40 min | Dans SharePoint, passer TEST-004 en **Perdu** (saisie manuelle) | – |
| +60 min | – | Facture période 2 pour CLI-001 avec **TEST-001 seul** (130 €) |
| +65 min | Scanner **Retour** de TEST-001 | Plus aucun mail ni facture |

Les mails arrivent avec un retard de 0 à 2 minutes, selon le moment où passe la périodicité.

---

## Dépannage

| Symptôme | Cause probable / solution |
|---|---|
| L'app affiche « réponse non lisible (réseau ou CORS) » | Le flux a peut-être tourné quand même : regarder son historique d'exécution. Vérifier l'en-tête `Access-Control-Allow-Origin: *` dans **toutes** les actions Réponse |
| HTTP 401/403 depuis l'app | Le déclencheur n'est pas sur « Tout le monde », ou le tenant bloque les déclencheurs anonymes |
| Le flux 1 échoue sur `Payload` | Voir la variante `base64ToString` à l'étape 2 |
| Le filtre `Statut eq 'En livraison'` ne renvoie rien | Vérifier que la colonne Statut s'appelle bien `Statut` (nom interne) et la casse de la valeur |
| Mails en double | Contrôle d'accès concurrentiel du déclencheur Périodicité non réglé sur 1 |
| `ticks` échoue | Un touret « En livraison » sans DateExpedition (modifié à la main) : renseigner la date ou repasser en « En stock » |

## Pour la suite (vers le réel)
- Remplacer les listes SharePoint par les lectures/écritures ABAS (API REST ou export planifié + écriture EDP), selon la réponse de l'intégrateur.
- Passer les variables `R1_min`, `R2_min`, `Fact_min` et `Periode_min` en mois (`addToTime(..., 2, 'Month')`), et régler la périodicité sur 1 fois par jour.
- Remplacer le corps de mail par le gabarit officiel, et l'adresse `EmailTest` par `EmailClient`.
- Remplacer « Créer un élément ABAS_Factures » par la création de la facture dans ABAS.
