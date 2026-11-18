// Vercel Function: mọi request /api/* được rewrite về đây (xem vercel.json).
// `_handler.js` là bản bundle của server.ts, được tạo khi chạy `npm run build`
// (scripts/build-api.mjs) và không commit vào git.
export { default } from './_handler.js';
