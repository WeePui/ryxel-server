const mongoose = require('mongoose');
const os = require('os');
const process = require('process');

const _SECONDS = 5000;

exports.countConnection = () => {
  const numConnections = mongoose.connections.length;
  console.log(`Number of connections: ${numConnections}`);
};

exports.checkOverload = () => {
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
  }, _SECONDS); // Monitor 5 seconds
};
