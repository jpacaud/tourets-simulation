# Simulation tourets – scan QR → workflow → faux ABAS

Prototype de test, **données fictives uniquement**.

- `index.html` : application de scan (GitHub Pages).
  - Sans paramètre : mode bureau, avec les QR codes et la connexion au workflow.
  - `?t=TEST-001&a=exp` : scan « Départ en livraison », qui démarre le cycle.
  - `?t=TEST-001` : scan « Retour », avec localisation, qui arrête le cycle.
- `data/abas-simulation.json` : clients et tourets fictifs affichés par l'app.
- `sharepoint/creer-faux-abas.js` : crée le faux ABAS (listes SharePoint) depuis la console du navigateur.
- `GUIDE-MISE-EN-PLACE.md` : mise en place pas à pas (SharePoint, flux Power Automate / Copilot Studio, scénario de test).

L'URL du workflow n'est pas stockée dans le dépôt. Elle est saisie dans l'app et gardée dans le navigateur.
