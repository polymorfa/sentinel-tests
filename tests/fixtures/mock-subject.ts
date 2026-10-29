import type { Subject } from '../../support/types.ts';
export function createSubject(): Subject {
  return {
    id: 'synthetic-contract-fixture',
    capabilities: [],
    async runCase() {
      return { status: 'unsupported' };
    },
  };
}
