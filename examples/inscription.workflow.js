import { workflow, step, branch, effect, subflow } from "../src/index.js";

const validationDossier = workflow("Validation dossier", () => {
  step("Verifier identite", null, {
    rules: ["Piece d'identite obligatoire"],
    inputs: ["family.documents.identity"]
  });

  step("Verifier justificatif CAF", null, {
    rules: ["Justificatif CAF requis si aide declaree"],
    inputs: ["family.documents.caf"]
  });

  branch("Dossier complet ?", {
    rules: [
      "Piece d'identite presente",
      "Justificatif CAF present si requis",
      "Caution acceptee"
    ],
    conditions: [
      "hasIdentityDocument === true",
      "cafRequired ? hasCafDocument === true : true",
      "depositAccepted === true"
    ],
    inputs: ["family.documents", "deal.customFields"],
    yes: () => {
      step("Valider le dossier");
    },
    no: () => {
      effect("Demander pieces manquantes", null, {
        outputs: ["email.toFamily"]
      });
    }
  });
});

export const inscriptionWorkflow = workflow("Inscription famille", () => {
  step("Recevoir la demande", null, {
    inputs: ["form.family", "form.children"]
  });

  subflow("Validation dossier", validationDossier, {
    summary: "Controle des pieces et des preconditions avant inscription."
  });

  branch("Famille eligible ?", {
    rules: ["La famille doit avoir au moins un enfant eligible"],
    conditions: ["eligibleChildren.length > 0"],
    yes: () => {
      effect("Creer deal Pipedrive", null, {
        inputs: ["family", "eligibleChildren"],
        outputs: ["pipedrive.dealId"]
      });

      effect("Envoyer contrat", null, {
        inputs: ["contract.pdf", "family.email"],
        outputs: ["email.sent"]
      });
    },
    no: () => {
      effect("Notifier refus", null, {
        rules: ["Message court, sans detail interne de scoring"]
      });
    }
  });

  step("Marquer inscription prete", null, {
    outputs: ["registration.status = READY"]
  });
});
