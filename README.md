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
npx sextant scan src/docagent/index.ts --entry processIncomingAttachment -o docagent.html
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

## Verification package

```bash
npm test
npm run pack:smoke
npm run self:scan -- --llm
```

Phrase produit :

> Un processus code. Une vue macro. Des sous-flows lisibles. Des regles au clic.
