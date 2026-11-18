import 'dotenv/config';
import { createServer as createViteServer } from 'vite';
import app from './server.ts';

const port = Number(process.env.PORT || 3000);

async function startDevelopmentServer() {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  // Register Vite after the API routes so /api/* remains handled by Express.
  app.use(vite.middlewares);

  app.listen(port, '0.0.0.0', () => {
    console.log(`Trading Journal development server: http://localhost:${port}`);
  });
}

startDevelopmentServer().catch((error) => {
  console.error('Could not start Trading Journal development server:', error);
  process.exitCode = 1;
});
