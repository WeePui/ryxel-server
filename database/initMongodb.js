const mongoose = require('mongoose');

const dbConnectionString = process.env.DB_CONNECTION
  ? process.env.DB_CONNECTION.replace('<PASSWORD>', process.env.DB_PASSWORD)
  : null;

if (!dbConnectionString) {
  console.error('Database connection string is not defined.');
  process.exit(1);
}

class Database {
  constructor() {
    this.connect();
  }

  connect(type = 'mongodb') {
    if (process.env.NODE_ENV === 'development') {
      mongoose.set('debug', true);
      mongoose.set('debug', { color: true });
    }

    mongoose
      .connect(dbConnectionString, { maxPoolSize: 100 })
      .then(() => {
        console.log('Database connection successful!');
      })
      .catch((error) => {
        console.error('Database connection failed:', error.message);
      });
  }

  static getInstance() {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }
}

const instanceMongoDB = Database.getInstance();

module.exports = instanceMongoDB;
