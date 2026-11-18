import { build } from 'esbuild';

// Gói server.ts (Express app) thành một file JS thuần để Vercel chạy trực tiếp,
// không phụ thuộc vào việc Vercel tự biên dịch TypeScript.
// Các package trong node_modules giữ nguyên là external và được Vercel đóng gói kèm.
await build({
  entryPoints: ['server.ts'],
  outfile: 'api/_handler.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'external',
  sourcemap: false,
  logLevel: 'info',
});
