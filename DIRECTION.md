# Sextant - Note de cadrage

## 1. Direction

Sextant transforme du code TypeScript / JavaScript en processus visualisable.

Le but n'est pas de refaire Make ou n8n.
Le but est inverse :

> garder la puissance du code, mais obtenir la lisibilite visuelle d'un workflow.

Make et n8n sont faciles a lire, mais difficiles a maintenir comme du vrai code.
Le code pur est puissant, versionnable et testable, mais les processus metier y deviennent vite opaques.

Sextant fait le pont.

Il produit :

- une vue macro du processus ;
- des sous-flows lisibles ;
- des details au clic : conditions, filtres, regles, entrees, sorties, source ;
- un export Mermaid + HTML autonome.

Phrase produit :

> Un processus code. Une vue macro. Des sous-flows lisibles. Des regles au clic.

## 2. Positionnement

Sextant n'est pas :

- un moteur d'execution ;
- une plateforme SaaS ;
- un clone de Make ;
- un editeur visuel ;
- un scanner global de repository ;
- une documentation automatique exhaustive.

Sextant est :

> un instrument leger de visualisation de processus codes.

Usage cible :

```bash
npm install sextant
npx sextant render src/workflows/inscription.workflow.ts -o inscription.html
npx sextant watch src/workflows/inscription.workflow.ts
npx sextant scan src/docagent/index.ts --entry processIncomingAttachment -o docagent.html
```

## 3. Deux modes

### Mode natif

On ecrit le processus avec des primitives Sextant.

```ts
workflow("Inscription famille", () => {
  step("Recevoir la demande", receiveRequest);

  branch("Dossier complet ?", {
    rules: [
      "Piece d'identite presente",
      "Justificatif CAF present",
      "Caution acceptee"
    ],

    yes: () => {
      effect("Creer deal Pipedrive", createDeal);
      effect("Envoyer contrat", sendContract);
    },

    no: () => {
      effect("Demander pieces manquantes", requestDocs);
    }
  });
});
```

Le graphe n'est pas devine.
Il nait avec le code.

### Mode apres-coup

On installe Sextant dans un projet existant.

```bash
npx sextant scan src/docagent/index.ts --entry processIncomingAttachment
```

Sextant scanne un point d'entree et produit une premiere carte :

- appels de fonctions ;
- decisions ;
- erreurs ;
- effets externes ;
- sous-flows probables.

Ce mode est moins fiable que le mode natif.
Il sert a cartographier, pas a garantir.

## 4. Principe visuel

Regle cle :

> Le graphe montre le chemin. Le detail montre les regles.

Le graphe principal reste sobre :

- etapes ;
- decisions ;
- effets externes ;
- sous-flows ;
- erreurs majeures ;
- sorties.

Les conditions, filtres, seuils, mappings, exceptions et regles metier vivent dans le panneau de detail.

Exemple :

```txt
Noeud : Dossier complet ?
Type : branch

Regles :
- piece d'identite obligatoire
- caution obligatoire avant contrat

Conditions :
- hasIdentityDocument === true
- depositAccepted === true

Entrees :
- family.documents
- deal.customFields

Sorties :
- yes -> Creer deal Pipedrive
- no -> Demander pieces

Source :
- src/workflows/inscription.ts:42
```

## 5. Gros processus

Piege a eviter :

> un gros workflow -> un enorme diagramme.

Regle stricte :

> aucune vue ne doit depasser 25 noeuds.

Un gros processus doit etre decoupe.

```txt
DocAgent
  - Resoudre le deal
  - Recuperer les pieces jointes
  - Classer le document
  - Ranger dans Drive
  - Mettre a jour Pipedrive
  - Gerer REVIEW_NEEDED
```

Chaque bloc ouvre son propre HTML.

Sextant doit donc produire :

- une vue macro ;
- des vues par sous-flow ;
- des details par noeud.

## 6. Socle theorique

Sextant part d'une idee simple :

> on ne comprend pas un processus code ligne par ligne ; on le comprend par plans.

Un developpeur lit avec des hypotheses :

- "ce bloc valide" ;
- "celui-ci orchestre" ;
- "celui-la notifie" ;
- "ici on sort du flux normal".

Sextant rend ces plans visibles.

Trois principes :

1. Comprendre, c'est verifier une hypothese.
   Le graphe montre si le code fait bien ce que l'on croit.

2. Un processus metier est plus lisible qu'une foret de fonctions.
   Les noeuds doivent parler metier : inscrire, relancer, classer, notifier, synchroniser.

3. La charge cognitive doit etre reduite par niveaux.
   Vue macro d'abord. Detail ensuite. Jamais tout en meme temps.

## 7. Architecture technique

Le coeur est un format pivot :

> Process Manifest

Pipeline :

```txt
Code TypeScript / JavaScript
        |
        v
Process Manifest JSON
        |
        v
Mermaid + ELK
        |
        v
HTML autonome
```

Le manifest contient :

- nodes ;
- edges ;
- details ;
- subflows ;
- sources.

Exemple :

```json
{
  "id": "dossier-complet",
  "type": "branch",
  "label": "Dossier complet ?",
  "details": {
    "rules": [
      "Piece d'identite obligatoire",
      "Caution obligatoire avant contrat"
    ],
    "conditions": [
      "hasIdentityDocument === true",
      "depositAccepted === true"
    ],
    "inputs": ["family.documents", "deal.customFields"],
    "outputs": ["yes", "no"],
    "source": {
      "file": "src/workflows/inscription.ts",
      "line": 42
    }
  }
}
```

## 8. Choix V0

V0 reste volontairement legere :

- Mermaid ;
- layout ELK ;
- HTML autonome ;
- style clair proche Claude ;
- pas de serveur ;
- pas de runtime obligatoire ;
- pas de React Flow au depart.

Mermaid + ELK est le premier pari.
React Flow ne vient que si Mermaid + hierarchie stricte ne suffit plus.

Le mode scan peut recevoir un enrichissement LLM opt-in :

- provider abstrait ;
- DeepSeek en premier adapter ;
- cle via `DEEPSEEK_API_KEY` uniquement ;
- cache local dans `.sextant-cache/llm` ;
- le LLM enrichit le Process Manifest, mais ne remplace pas l'extraction deterministe.

## 9. Roadmap

### V0.x

- rendu Mermaid + ELK ;
- HTML autonome ;
- style propre ;
- details par noeud ;
- clic vers panneau lateral.

### V0.y

- `subflow()` ;
- vue macro ;
- HTML separe par sous-flow ;
- limite de 25 noeuds par vue.

### V1

- React Flow seulement si necessaire ;
- compound nodes ;
- navigation plus Make-like ;
- toujours depuis le Process Manifest.

## 10. Non-objectifs immediats

A refuser maintenant :

- editeur visuel ;
- moteur d'execution ;
- plateforme SaaS ;
- import Make / n8n ;
- scan global de tout un repo ;
- multi-langage ;
- documentation automatique exhaustive ;
- React Flow immediat.

## 11. Boussole

Sextant doit rester leger, code-first, exportable.

Il ne doit pas cacher le code.
Il doit le rendre visible.

Formule finale :

> Ecrire comme du code. Voir comme un workflow. Deployer apres coup.
