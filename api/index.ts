import { createServer } from '../backend/dist/index.js';

let appInstance: any = null;

async function getApp() {
  if (!appInstance) {
    const { server } = await createServer();
    await server.ready();
    appInstance = server;
  }
  return appInstance;
}

export default async function handler(req: any, res: any) {
  // CORS fallback headers for serverless execution
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers?.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const app = await getApp();
  app.server.emit('request', req, res);
}
