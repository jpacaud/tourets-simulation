/* =====================================================================
   Faux ABAS – création des listes SharePoint de simulation
   ---------------------------------------------------------------------
   Utilisation :
   1. Ouvrir le site SharePoint de test dans Edge ou Chrome
      (ex. https://elydan.sharepoint.com/sites/Tourets-Simulation).
   2. F12 > onglet « Console ». Si le navigateur bloque le collage, taper « allow pasting ».
   3. Coller tout ce fichier puis Entrée.
   4. Ensuite, pour remettre la simulation à zéro : taper  resetSimulation()  dans la console.

   Le script peut être relancé sans risque : il ne recrée pas ce qui existe déjà.
   ===================================================================== */
(async () => {
  // Adresse du site cible. Laisser vide pour la détecter depuis la page ouverte,
  // ou la forcer, ex. "https://elydan-my.sharepoint.com/personal/jpacaud_elydan_eu".
  const SITE_FORCE = "";

  async function detectSite() {
    if (SITE_FORCE) return SITE_FORCE.replace(/\/$/, "");
    const m = location.pathname.match(/^\/(sites|teams|personal)\/[^/]+/i);
    if (m) return location.origin + m[0];
    if (/-my\.sharepoint\.com$/i.test(location.hostname)) {
      // Nouvelle interface OneDrive (/my) : on demande l'adresse du site personnel
      const r = await fetch("/_api/SP.UserProfiles.PeopleManager/GetMyProperties?$select=PersonalUrl", {headers: {Accept: "application/json;odata=nometadata"}});
      if (r.ok) return (await r.json()).PersonalUrl.replace(/\/$/, "");
    }
    throw new Error("Cette page n'est pas un site SharePoint (ex. page d'accueil SharePoint).\n" +
      "Ouvre ton OneDrive dans le navigateur (https://elydan-my.sharepoint.com) ou un site d'équipe (/sites/...), puis relance le script.");
  }
  const SITE = await detectSite();
  console.log(`Site cible : ${SITE}`);

  // Mêmes données que data/abas-simulation.json
  const CLIENTS = [
    {Title: "CLI-001", NomClient: "Exemple TP Rhône-Alpes", Contact: "M. Exemple – 06 00 00 00 01", EmailClient: "contact@exemple-tp-ra.test"},
    {Title: "CLI-002", NomClient: "Exemple Réseaux Sud", Contact: "Mme Exemple – 06 00 00 00 02", EmailClient: "contact@exemple-reseaux-sud.test"},
    {Title: "CLI-003", NomClient: "Exemple Fibre Ouest", Contact: "M. Exemple – 06 00 00 00 03", EmailClient: "contact@exemple-fibre-ouest.test"}
  ];
  const TOURETS = [
    {Title: "TEST-001", TypeTouret: "Touret bois Ø1600", CodeClient: "CLI-001", NomClient: "Exemple TP Rhône-Alpes", BL: "BL-2026-104512", Commande: "CDE-88412"},
    {Title: "TEST-002", TypeTouret: "Touret bois Ø1250", CodeClient: "CLI-002", NomClient: "Exemple Réseaux Sud", BL: "BL-2026-104530", Commande: "CDE-88437"},
    {Title: "TEST-003", TypeTouret: "Touret métal Ø2000", CodeClient: "CLI-003", NomClient: "Exemple Fibre Ouest", BL: "BL-2026-104577", Commande: "CDE-88501"},
    {Title: "TEST-004", TypeTouret: "Touret bois Ø1600", CodeClient: "CLI-001", NomClient: "Exemple TP Rhône-Alpes", BL: "BL-2026-104512", Commande: "CDE-88412"},
    {Title: "TEST-005", TypeTouret: "Touret bois Ø1400", CodeClient: "CLI-001", NomClient: "Exemple TP Rhône-Alpes", BL: "BL-2026-104598", Commande: "CDE-88533"},
    {Title: "TEST-006", TypeTouret: "Touret type E (métal Ø2400)", CodeClient: "CLI-002", NomClient: "Exemple Réseaux Sud", BL: "BL-2026-104530", Commande: "CDE-88437"}
  ];

  // Champ : [nom interne, type, options]
  const LISTS = {
    ABAS_Clients: {titre: "CodeClient", champs: [
      ["NomClient", "Text"], ["Contact", "Text"], ["EmailClient", "Text"]]},
    ABAS_Tourets: {titre: "NumTouret", champs: [
      ["TypeTouret", "Text"], ["CodeClient", "Text"], ["NomClient", "Text"], ["BL", "Text"], ["Commande", "Text"],
      ["Statut", "Choice", ["En stock", "En livraison", "Retourné", "Perdu", "Abîmé"]],
      ["DateExpedition", "DateTime"], ["Relance1", "DateTime"], ["Relance2", "DateTime"],
      ["NbFactures", "Number"], ["DerniereFacture", "DateTime"],
      ["DateRetour", "DateTime"], ["AdresseRetour", "Note"], ["GPSRetour", "Text"]]},
    ABAS_Relances: {titre: "Reference", champs: [
      ["CodeClient", "Text"], ["NomClient", "Text"], ["Niveau", "Number"], ["Tourets", "Note"],
      ["Destinataire", "Text"], ["DateEnvoi", "DateTime"]]},
    ABAS_Factures: {titre: "NumFacture", champs: [
      ["CodeClient", "Text"], ["NomClient", "Text"], ["Tourets", "Note"], ["NbTourets", "Number"],
      ["Montant", "Number"], ["DateFacture", "DateTime"]]},
    ABAS_Scans: {titre: "NumTouret", champs: [
      ["Action", "Text"], ["DateScan", "DateTime"], ["Donnees", "Note"]]}
  };

  const H = {"Accept": "application/json;odata=verbose", "Content-Type": "application/json;odata=verbose"};
  const api = p => `${SITE}/_api/web${p}`;
  const digest = (await (await fetch(`${SITE}/_api/contextinfo`, {method: "POST", headers: H})).json()).d.GetContextWebInformation.FormDigestValue;
  const W = {...H, "X-RequestDigest": digest};
  async function call(url, opts = {}) {
    const r = await fetch(url, {headers: W, ...opts});
    if (!r.ok && r.status !== 404) throw new Error(`${r.status} ${url}\n${await r.text()}`);
    return r.status === 404 ? null : (r.status === 204 ? {} : r.json());
  }
  const enc = s => s.replace(/'/g, "''");
  const lst = n => api(`/lists/getbytitle('${enc(n)}')`);

  function fieldXml([name, type, choices]) {
    const base = `Name='${name}' StaticName='${name}' DisplayName='${name}'`;
    if (type === "DateTime") return `<Field Type='DateTime' Format='DateTime' ${base} />`;
    if (type === "Note") return `<Field Type='Note' NumLines='4' RichText='FALSE' ${base} />`;
    if (type === "Choice") return `<Field Type='Choice' ${base} Format='Dropdown'><Default>${choices[0]}</Default><CHOICES>${choices.map(c => `<CHOICE>${c}</CHOICE>`).join("")}</CHOICES></Field>`;
    if (type === "Number") return `<Field Type='Number' ${base}><Default>0</Default></Field>`;
    return `<Field Type='Text' ${base} />`;
  }

  async function ensureList(name, def) {
    let l = await call(lst(name));
    if (!l) {
      await call(api("/lists"), {method: "POST", body: JSON.stringify({__metadata: {type: "SP.List"}, BaseTemplate: 100, Title: name})});
      console.log(`✔ Liste créée : ${name}`);
    } else console.log(`= Liste existante : ${name}`);
    // Renomme l'affichage de la colonne Title (le nom interne reste « Title »)
    await call(lst(name) + "/fields/getbyinternalnameortitle('Title')", {method: "POST", headers: {...W, "X-HTTP-Method": "MERGE", "IF-MATCH": "*"},
      body: JSON.stringify({__metadata: {type: "SP.Field"}, Title: def.titre})});
    for (const f of def.champs) {
      const exists = await call(lst(name) + `/fields/getbyinternalnameortitle('${f[0]}')`);
      if (exists) continue;
      await call(lst(name) + "/fields/createfieldasxml", {method: "POST",
        body: JSON.stringify({parameters: {__metadata: {type: "SP.XmlSchemaFieldCreationInformation"}, SchemaXml: fieldXml(f), Options: 8 | 16}})});
      console.log(`   + colonne ${f[0]} (${f[1]})`);
    }
  }

  async function entityType(name) {
    return (await call(lst(name) + "?$select=ListItemEntityTypeFullName")).d.ListItemEntityTypeFullName;
  }
  async function upsert(name, rows) {
    const type = await entityType(name);
    for (const row of rows) {
      const found = (await call(lst(name) + `/items?$select=Id&$filter=Title eq '${enc(row.Title)}'`)).d.results;
      if (found.length) continue;
      await call(lst(name) + "/items", {method: "POST", body: JSON.stringify({__metadata: {type}, ...row})});
      console.log(`   + ${name} : ${row.Title}`);
    }
  }

  for (const [name, def] of Object.entries(LISTS)) await ensureList(name, def);
  await upsert("ABAS_Clients", CLIENTS);
  await upsert("ABAS_Tourets", TOURETS.map(t => ({...t, Statut: "En stock", NbFactures: 0})));

  // Remet tous les tourets « En stock » et vide les dates du cycle
  window.resetSimulation = async () => {
    const type = await entityType("ABAS_Tourets");
    const items = (await call(lst("ABAS_Tourets") + "/items?$select=Id,Title&$top=500")).d.results;
    for (const it of items) {
      await call(lst("ABAS_Tourets") + `/items(${it.Id})`, {method: "POST", headers: {...W, "X-HTTP-Method": "MERGE", "IF-MATCH": "*"},
        body: JSON.stringify({__metadata: {type}, Statut: "En stock", DateExpedition: null, Relance1: null, Relance2: null,
          NbFactures: 0, DerniereFacture: null, DateRetour: null, AdresseRetour: "", GPSRetour: ""})});
    }
    console.log(`✔ ${items.length} tourets remis « En stock ». (Les listes Relances / Factures / Scans ne sont pas vidées.)`);
  };

  console.log(`\n✔ Faux ABAS prêt sur ${SITE}\n  Listes : ${Object.keys(LISTS).join(", ")}\n  Pour réinitialiser : resetSimulation()`);
})().catch(e => console.error("✖ Erreur :", e));
