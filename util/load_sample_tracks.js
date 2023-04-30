'use strict';

const artistIds = require('./artist-ids');
const http = require('http');
const JSONStream = require('JSONStream');
const limit = 50; // The number of songs to retrieve for each artist
const parser = JSONStream.parse(['results', true]);
const { songsClient } = require('../lib/redis-clients');
let rooms = require('../config').rooms;
let songId = 0;

const options = {
  headers: { 'content-type': 'application/json' },
  host: 'itunes.apple.com',
  // Look up multiple artists by their IDs and get `limit` songs for each one
  path:
    '/lookup?id=' +
    Object.values(artistIds).flat().join(",") +
    '&entity=song&limit=' +
    limit,
  port: 80
};

/**
 * Set the rooms in which the songs of a given artist will be loaded.
 */

parser.on('data', function(track) {
  if (track.wrapperType === 'artist') {
    return;
  }

  songsClient.hmset(
    'song:' + songId,
    'artistName',
    track.artistName,
    'trackName',
    track.trackName,
    'trackViewUrl',
    track.trackViewUrl,
    'previewUrl',
    track.previewUrl,
    'artworkUrl60',
    track.artworkUrl60,
    'artworkUrl100',
    track.artworkUrl100
  );

  for (const [room, roomArtistIds] of Object.entries(artistIds)) {
    if (roomArtistIds.includes(track.artistId)) {
      const score = songId;
      songsClient.zadd(room, score, songId);
    }
  }

  songId++;
});

parser.on('end', function() {
  songsClient.quit();
  process.stdout.write('OK\n');
});

songsClient.del(rooms, function(err) {
  if (err) {
    throw err;
  }
  process.stdout.write('Loading sample tracks... ');
  http.get(options, function(res) {
    res.pipe(parser);
  });
});
