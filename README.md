# Sextant

Sextant transforme du code TypeScript / JavaScript en graphe de processus visualisable.

Il reste leger :

- workflow code-first ;
- rendu Mermaid + ELK ;
- HTML autonome ;
- details au clic ;
- scan apres-coup depuis un point d'entree.

```bash
npm install
npm run demo
```

Puis ouvrir `examples/inscription.html`.

## V0

```bash
npx sextant render src/workflows/inscription.workflow.ts -o inscription.html
npx sextant watch src/workflows/inscription.workflow.ts -o inscription.html
npx sextant scan src/docagent/index.ts --entry processIncomingAttachment --depth 2 -o docagent.html
npx sextant scan src/docagent/index.ts --entry processIncomingAttachment --llm -o docagent.html
npx sextant scan-project . -o sextant-project.html --lang fr
```

Package npm : `@louis/sextant`.
Le nom non-scope `sextant` est deja pris sur npm, mais le binaire expose reste `sextant`.

```ts
import { workflow, step, branch, effect } from "@louis/sextant";
```

## LLM scan enrichment

LLM enrichment is opt-in and uses DeepSeek V4 Pro by default.
The LLM enriches the heuristic Manifest; it does not replace deterministic extraction.

```bash
set DEEPSEEK_API_KEY=...
npx sextant scan src/docagent/index.ts --entry processIncomingAttachment --llm --lang fr
npx sextant scan-project . --llm --lang fr
```

Options:

```bash
--provider deepseek
--model deepseek-v4-pro
--thinking high
--thinking max
--no-thinking
--llm-timeout-ms 300000
--no-cache
```

## Scan projet macro

`scan-project` ajoute une couche de retro-engineering globale :

- sens probable du projet ;
- responsabilites principales ;
- decisions d'architecture probables ;
- hypotheses et questions a confirmer ;
- vue macro, jamais graphe geant.

Cette couche sert a comprendre le projet. Pour verifier un flux reel, utiliser ensuite `scan <file> --entry <name>`.

## Resource frames bornees

`scan` suit les appels locaux avec une profondeur bornee, par defaut `--depth 2`.

- `--depth 0` : seulement le point d'entree.
- `--depth 1` : appels locaux directs.
- `--depth 2` : appels directs et appels des sous-frames.

Les fonctions top-level et les methodes de classes locales peuvent servir de point d'entree :

```bash
npx sextant scan src/scan/inferProcess.js --entry AstProcessBuilder.emitStatements -o emit-statements.html
```

Les frames peuvent etre `code`, `front`, `route`, `data`, `storage` ou `integration`.
Si Sextant trouve le code local, le rapport ecrit un HTML cliquable pour la frame. Sinon la frontiere reste visible comme frame opaque.

Privacy: `scan-project --llm` envoie plusieurs fichiers source au provider LLM pour produire la lecture globale. Utiliser `scan-project` sans `--llm` pour rester 100% local. Les cles restent uniquement en variables d'environnement et ne doivent jamais etre ecrites dans le repo.

## Verification package

```bash
npm test
npm run pack:smoke
npm run self:scan -- --llm
```

Phrase produit :

> Un processus code. Une vue macro. Des sous-flows lisibles. Des regles au clic.
