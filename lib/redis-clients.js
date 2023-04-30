'use strict';

const redis = require('redis');

/**
 * Setting up redis clients.
 */

const clientOptions = {
  url: process.env.REDIS_URL,
  // necessary for fly.io
  family: "IPv6",
};

const songsClient = redis.createClient({ ...clientOptions, prefix: "songs:" });
const usersClient = redis.createClient({ ...clientOptions, prefix: "users:" });

songsClient.on('error', function(err) {
  console.error(err.message);
});

usersClient.on('error', function(err) {
  console.error(err.message);
});

/**
 * Expose the clients
 */

exports.songsClient = songsClient;
exports.usersClient = usersClient;
