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
```

Package npm : `@louis/sextant`.
Le nom non-scope `sextant` est deja pris sur npm, mais le binaire expose reste `sextant`.

```ts
import { workflow, step, branch, effect } from "@louis/sextant";
```

## Verification package

```bash
npm test
npm run pack:smoke
```

Phrase produit :

> Un processus code. Une vue macro. Des sous-flows lisibles. Des regles au clic.
