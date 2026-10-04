// Rota só do app logado (Ajuda). O cadastro usa o mesmo texto num modal.

import { router, useLocalSearchParams } from "expo-router";

import { LegalDocument, type LegalDoc } from "@/components/legal/LegalDocument";

export default function LegalScreen() {
  const params = useLocalSearchParams<{ doc?: string }>();
  const raw = Array.isArray(params.doc) ? params.doc[0] : params.doc;
  const doc: LegalDoc = raw === "privacy" ? "privacy" : "terms";

  return (
    <LegalDocument
      doc={doc}
      onClose={() => {
        if (router.canGoBack()) router.back();
      }}
    />
  );
}
