import mongoose from 'mongoose';
import os from 'os';

const _SECONDS = 5000;

export const countConnection = (): void => {
  const numConnections = mongoose.connections.length;
  console.log(`Number of connections: ${numConnections}`);
};

export const checkOverload = (): void => {
  setInterval(() => {
    const numConnections = mongoose.connections.length;
    const numCores = os.cpus().length;
    const memoryUsed = process.memoryUsage().rss / 1024 / 1024; // in MB
    // Assume 1 core can handle 5 connections
    const maxConnections = numCores * 5;

    if (numConnections > maxConnections) {
      console.log('Server is overloaded!');
      console.log(`Number of connections: ${numConnections}`);
      console.log(`Number of cores: ${numCores}`);
      console.log(`Memory used: ${memoryUsed} MB`);
      process.exit(1);
    }
  }, _SECONDS); // Monitor every 5 seconds
};
