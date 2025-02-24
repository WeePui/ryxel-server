import mongoose from 'mongoose';

const dbConnectionString = process.env.DB_CONNECTION
  ? process.env.DB_CONNECTION.replace('<PASSWORD>', process.env.DB_PASSWORD!)
  : null;

if (!dbConnectionString) {
  console.error('Database connection string is not defined.');
  process.exit(1);
}

class Database {
  private static instance: Database;

  private constructor() {
    this.connect();
  }

  private connect(type = 'mongodb') {
    // if (process.env.NODE_ENV === 'development') {
    //   mongoose.set('debug', true);
    //   mongoose.set('debug', { color: true });
    // }

    mongoose
      .connect(dbConnectionString!, { maxPoolSize: 100 })
      .then(() => {
        console.log('Database connection successful!');
      })
      .catch((error) => {
        console.error('Database connection failed:', error.message);
      });
  }

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }
}

const instanceMongoDB = Database.getInstance();

export default instanceMongoDB;
