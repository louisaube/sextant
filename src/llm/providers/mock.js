export function createMockProvider(enrichment) {
  let calls = 0;

  return {
    name: "mock",
    async enrichProcess() {
      calls++;
      return typeof enrichment === "function" ? enrichment(calls) : enrichment;
    },
    get calls() {
      return calls;
    }
  };
}
