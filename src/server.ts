import dotenv from 'dotenv';
// import path from 'path';
import { Server } from 'http';
import { Application } from 'express';

process.on('uncaughtException', (error) => {
  if (process.env.NODE_ENV === 'development') console.log(error);
  else console.log(error.name, error.message);

  console.log('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  process.exit(1);
});

dotenv.config();
//dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { checkOverload } from './helpers/checkConnect';
checkOverload();

import './database/initMongodb';

const app: Application = require('./app').default;

const server: Server = app.listen(process.env.PORT, () => {
  console.log(
    `Server is running with ${process.env.NODE_ENV!.toUpperCase()} mode on port ${
      process.env.PORT
    }`
  );
});

process.on('unhandledRejection', (error: any) => {
  if (process.env.NODE_ENV === 'development') console.log(error);
  else console.log(error.name, error.message);

  console.log('UNHANDLED REJECTION! 💥 Shutting down...');
  server.close(() => {
    process.exit(1);
  });
});
