import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { JWT_SECRET } from '@repo/backend-common/config';

dotenv.config();

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws, req) => {
  
  const url = req.url;

  if (!url) {
    return;
  }

  const quertParams = new URLSearchParams(url?.split('?')[1]);
  const token = quertParams.get('token') || '';

  const decodedUser = jwt.verify(token, JWT_SECRET);

  if (!decodedUser) {
    ws.close();
    return;
  }

  ws.on('message', (message) => {
    console.log(`Received message: ${message}`);
  });
  
});
