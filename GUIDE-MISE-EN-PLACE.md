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

Copilot Studio → **+ Nouveau flux d'agent**, ou Power Automate → **Flux de cloud planifié**.

### 3.1 Déclencheur et paramètres

| # | Action | Nom | Paramètres |
|---|---|---|---|
| 1 | **Périodicité** (Recurrence) | – | Toutes les **2 minutes**. ⚙ *Paramètres* → **Contrôle d'accès concurrentiel : activé, degré 1** (évite deux exécutions en même temps, donc des mails en double) |
| 2 | **Initialiser une variable** ×6 | – | `EmailTest` (Chaîne) = `jpacaud@elydan.eu` · `R1_min` (Entier) = 10 · `R2_min` (Entier) = 20 · `Fact_min` (Entier) = 30 · `Periode_min` (Entier) = 30 · `Tarif` (Entier) = 130 |
| 3 | SharePoint **Obtenir les éléments** | `Tourets_actifs` | Liste ABAS_Tourets. Filtre : `Statut eq 'En livraison'` |
| 4 | SharePoint **Obtenir les éléments** | `Clients` | Liste ABAS_Clients |
| 5 | **Appliquer à chacun** (Apply to each) | `Pour_chaque_client` | Sur : `outputs('Clients')?['body/value']` |

### 3.2 Dans `Pour_chaque_client`

Dans les filtres ci-dessous, **MIN** désigne le nombre de minutes depuis l'expédition. Recopie l'expression suivante à la place de MIN :
```
div(sub(ticks(utcNow()), ticks(item()?['DateExpedition'])), 600000000)
```
Une minute vaut 600 000 000 ticks, et `div` fait une division entière.

> Libellés de cette interface : **Message** = Compose · **Demander** = Request · **Jointure** = Join · **Créer un tableau HTML** = Create HTML table.

Les **Filtrer un tableau** (Filter array) se saisissent en **mode avancé** (« Modifier en mode avancé »).

| # | Action | Nom | Paramètres |
|---|---|---|---|
| a | **Filtrer un tableau** | `Tourets_du_client` | De : `outputs('Tourets_actifs')?['body/value']`. Condition : `@equals(item()?['CodeClient'], items('Pour_chaque_client')?['Title'])` |
| b | **Filtrer un tableau** | `A_relancer_1` | De : `body('Tourets_du_client')`. Condition : `@and(empty(item()?['Relance1']), greaterOrEquals(MIN, variables('R1_min')))` |
| c | **Filtrer un tableau** | `A_relancer_2` | De : `body('Tourets_du_client')`. Condition : `@and(not(empty(item()?['Relance1'])), empty(item()?['Relance2']), greaterOrEquals(MIN, variables('R2_min')))` |
| d | **Filtrer un tableau** | `A_facturer` | De : `body('Tourets_du_client')`. Condition : `@and(greaterOrEquals(MIN, variables('Fact_min')), less(coalesce(item()?['NbFactures'], 0), add(div(sub(MIN, variables('Fact_min')), variables('Periode_min')), 1)))` |

La condition de `A_facturer` se lit ainsi : le nombre de périodes dues vaut 1 + (MIN − 30) ÷ 30. Si le touret a été facturé moins de fois que ce nombre, on le facture une fois de plus. On reproduit donc la règle « tout mois commencé est facturé ».

#### Bloc Relance 1 – **Condition** `Si_relance_1` : `length(body('A_relancer_1'))` est supérieur à `0`. Dans **Oui** :

| Action | Nom | Paramètres |
|---|---|---|
| **Sélectionner** (Select) | `Lignes_R1` | De : `body('A_relancer_1')`. Mappage : `Touret` → `item()?['Title']` · `Type` → `item()?['TypeTouret']` · `BL` → `item()?['BL']` · `Expédié le` → `convertFromUtc(item()?['DateExpedition'], 'Romance Standard Time', 'dd/MM/yyyy HH:mm')` |
| **Sélectionner** (mode texte, bouton « Mode texte ») | `Numeros_R1` | De : `body('A_relancer_1')`. Valeur : `item()?['Title']` |
| **Créer un tableau HTML** | `Table_R1` | De : `body('Lignes_R1')` |
| Outlook **Envoyer un e-mail (V2)** | `Mail_R1` | À : `variables('EmailTest')`. Objet : `[TEST] Relance 1 – tourets à retourner – @{items('Pour_chaque_client')?['NomClient']}`. Corps : voir modèle ci-dessous |
| SharePoint **Créer un élément** | `Journal_R1` | Liste ABAS_Relances. Title : `concat('R1-', items('Pour_chaque_client')?['Title'], '-', formatDateTime(utcNow(), 'yyyyMMddHHmmss'))`. CodeClient / NomClient : du client. Niveau : 1. Tourets : `join(body('Numeros_R1'), ', ')`. Destinataire : `items('Pour_chaque_client')?['EmailClient']`. DateEnvoi : `utcNow()` |
| **Appliquer à chacun** | `Maj_R1` | Sur : `body('A_relancer_1')` → **Mettre à jour l'élément** ABAS_Tourets. Id : `items('Maj_R1')?['ID']`. Title : `items('Maj_R1')?['Title']`. Relance1 : `utcNow()` |

Modèle de corps du mail de relance (à remplacer par le vrai gabarit plus tard) :
```html
<p style="color:#b26a00"><b>SIMULATION</b> – destinataire réel prévu : @{items('Pour_chaque_client')?['EmailClient']}</p>
<p>Bonjour,</p>
<p>Sauf erreur de notre part, les tourets suivants livrés à <b>@{items('Pour_chaque_client')?['NomClient']}</b> ne nous ont pas encore été retournés :</p>
@{body('Table_R1')}
<p>Merci de nous signaler leur mise à disposition en scannant le QR code présent sur chaque touret.</p>
<p>Cordialement,<br>Elydan</p>
```

#### Bloc Relance 2 – même chose que le bloc Relance 1

Duplique le bloc Relance 1 (menu ··· → **Copier dans mon Presse-papiers**, puis **Coller**) et remplace :
- `A_relancer_1` → `A_relancer_2`, et les noms `_R1` → `_R2` ;
- `Relance 1` → `Relance 2` dans l'objet du mail, `R1-` → `R2-` et Niveau 1 → 2 dans le journal ;
- dans `Maj_R2`, renseigner **Relance2** au lieu de Relance1.

#### Bloc Facturation – **Condition** `Si_facture` : `length(body('A_facturer'))` est supérieur à `0`. Dans **Oui** :

| Action | Nom | Paramètres |
|---|---|---|
| **Message** (Compose) | `Num_facture` | `concat('FS-', formatDateTime(utcNow(), 'yyyyMMdd-HHmm'), '-', items('Pour_chaque_client')?['Title'])` |
| **Message** (Compose) | `Montant_total` | `mul(length(body('A_facturer')), variables('Tarif'))` |
| **Sélectionner** | `Lignes_facture` | De : `body('A_facturer')`. `Touret` → `item()?['Title']` · `Type` → `item()?['TypeTouret']` · `BL` → `item()?['BL']` · `Période n°` → `add(coalesce(item()?['NbFactures'], 0), 1)` · `Montant (€)` → `variables('Tarif')` |
| **Sélectionner** (mode texte) | `Numeros_facture` | De : `body('A_facturer')`. Valeur : `item()?['Title']` |
| **Créer un tableau HTML** | `Table_facture` | De : `body('Lignes_facture')` |
| SharePoint **Créer un élément** | `Enregistrer_facture` | Liste ABAS_Factures. Title : `outputs('Num_facture')`. CodeClient / NomClient : du client. Tourets : `join(body('Numeros_facture'), ', ')`. NbTourets : `length(body('A_facturer'))`. Montant : `outputs('Montant_total')`. DateFacture : `utcNow()` |
| Outlook **Envoyer un e-mail (V2)** | `Mail_facture` | À : `variables('EmailTest')`. Objet : `[TEST] Facture de location fictive @{outputs('Num_facture')} – @{items('Pour_chaque_client')?['NomClient']}`. Corps : client, tableau `@{body('Table_facture')}`, total `@{outputs('Montant_total')} € HT` |
| **Appliquer à chacun** | `Maj_facture` | Sur : `body('A_facturer')` → **Mettre à jour l'élément** ABAS_Tourets. Id / Title : `items('Maj_facture')?['ID']` / `['Title']`. NbFactures : `add(coalesce(items('Maj_facture')?['NbFactures'], 0), 1)`. DerniereFacture : `utcNow()` |

**Enregistrer** et laisser le flux activé pendant les tests.

> 💡 **Coût :** une exécution toutes les 2 minutes donne environ 720 exécutions par jour. Dans Copilot Studio, les flux d'agent consomment des crédits Copilot à l'action. Vérifie le mode de facturation de ton environnement, et **désactive le flux 2 en dehors des sessions de test**. Dans Power Automate avec une licence Premium, il n'y a pas ce coût à l'action.

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
