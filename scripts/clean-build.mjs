import fs from 'node:fs';

// Remove only generated Vercel static output; keep source assets in static-assets/.
fs.rmSync('public', { recursive: true, force: true });
