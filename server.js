const dotenv = require('dotenv');
const mongoose = require('mongoose');

process.on('uncaughtException', (error) => {
  if (process.env.NODE_ENV === 'development') console.log(error);
  else console.log(error.name, error.message);

  console.log('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  process.exit(1);
});

dotenv.config({ path: './.env' });

const { checkOverload } = require('./helpers/checkConnect');
checkOverload();

require('./database/initMongodb');

const app = require('./app');

const server = app.listen(process.env.PORT, () => {
  console.log(
    `Server is running with ${process.env.NODE_ENV.toUpperCase()} mode on port ${
      process.env.PORT
    }`
  );
});

process.on('unhandledRejection', (error) => {
  if (process.env.NODE_ENV === 'development') console.log(error);
  else console.log(error.name, error.message);

  console.log('UNHANDLED REJECTION! 💥 Shutting down...');
  server.close(() => {
    process.exit(1);
  });
});
