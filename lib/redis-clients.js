'use strict';

const redis = require('redis');
const { songsClientOptions, usersClientOptions } = require('../redis-config');

/**
 * Setting up redis clients.
 */

const songsClient = redis.createClient(songsClientOptions);
const usersClient = redis.createClient(usersClientOptions);

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
