import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const config={
  productId:'005', title:'Cozy Autumn Adventures',
  prefix:'LumiumX-Cozy-Autumn-Adventures',
  // Preserve all 1254 x 1254 source pixels inside both paper sizes.
  dpi:180, allowSquare:true, limit:19_000_000, forceBundles:true,
  storyPath:join(root,'story-order.json'),
  pngName:(id,format)=>`LumiumX-Autumn-${id}-${format}.png`,
  guide:{title:'Cozy Autumn Adventures',
    introduction:'Explore 20 cozy autumn coloring scenes in two paper sizes.',
    closing:'Make a little time for autumn creativity.',printService:true}
};
