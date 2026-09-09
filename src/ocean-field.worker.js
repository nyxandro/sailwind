import { createOceanField } from './ocean-field.js';
import { COARSE_OCEAN_COORDINATES } from './ocean-grid.js';
import { createOceanPatch } from './ocean-patch.js';

let coarseField;
let previous;

self.addEventListener('message', ({ data: { id, x, z } }) => {
  const first = !coarseField;
  if (first) coarseField = createOceanField(COARSE_OCEAN_COORDINATES, 0, 0);
  previous = createOceanPatch(coarseField, x, z, previous);
  const field = previous.field.slice();
  const coarseSamples = previous.coarseSamples.slice();
  const message = { id, x, z, field, coarseSamples };
  const transfer = [field.buffer, coarseSamples.buffer];
  if (first) {
    message.coarseField = coarseField.slice();
    transfer.push(message.coarseField.buffer);
  }
  self.postMessage(message, transfer);
});
