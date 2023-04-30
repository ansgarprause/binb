'use strict';

const redis = require('redis');

/**
 * Setting up redis clients.
 */

const songsClient = redis.createClient({ auth_pass: process.env.DB_AUTH });
const usersClient = redis.createClient({ auth_pass: process.env.DB_AUTH });

songsClient.on('error', function(err) {
  console.error(err.message);
});

usersClient.on('error', function(err) {
  console.error(err.message);
});

usersClient.select(1);

/**
 * Expose the clients
 */

exports.songsClient = songsClient;
exports.usersClient = usersClient;
