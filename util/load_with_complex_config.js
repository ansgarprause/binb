'use strict';

const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const limiter = require('limiter');
const { RateLimiter } = limiter;

const config = require('../config');
const rooms = config.rooms;
const { songsClientOptions } = require('../redis-config');
songsClientOptions.legacyMode = false;
const songsClient = require('redis').createClient(songsClientOptions);

const limiterITunes = new RateLimiter({ tokensPerInterval: 1, interval: 500 }); // interval in ms
const limiterAppleMusic = new RateLimiter({
  tokensPerInterval: 1,
  interval: 'second'
});

function extractId(url) {
  return Number(url.split('/').at(-1));
}

function dedup(list) {
  return Array.from(new Set(list));
}

async function scrapeLinksFromPage(pageUrl, selector) {
  await limiterAppleMusic.removeTokens(1);
  const response = await fetch(pageUrl);
  const body = await response.text();
  const dom = new JSDOM(body);
  const elements = dom.window.document.querySelectorAll(selector);
  let links = Array.from(elements).map((element) => element.href);
  links = Array.from(new Set(links));
  return links;
}

async function getArtistUrlsFromPlaylistUrls(playlistUrls) {
  const artistsFromPlaylistsPromises = playlistUrls.map(
    getArtistUrlsFromPlaylistUrl
  );
  return (await Promise.all(artistsFromPlaylistsPromises)).flat();
}

async function getArtistUrlsFromPlaylistUrl(playlistUrl) {
  return scrapeLinksFromPage(playlistUrl, '.songs-list__col--secondary a');
}

async function getSongUrlsFromPlaylistUrls(playlistUrls) {
  const songUrlsFromPlaylistsPromises = playlistUrls.map(
    getSongUrlsFromPlaylistUrl
  );
  return (await Promise.all(songUrlsFromPlaylistsPromises)).flat();
}

async function getSongUrlsFromPlaylistUrl(playlistUrl) {
  return scrapeLinksFromPage(playlistUrl, 'a[data-testid="track-seo-link"]');
}

async function getSongsByEntityUrl(artistUrls, limit = 1, sort = 'popular') {
  await limiterITunes.removeTokens(1);

  const url = new URL('https://itunes.apple.com/lookup');
  url.searchParams.set('id', artistUrls.map(extractId));
  url.searchParams.set('entity', 'song');
  url.searchParams.set('limit', limit);
  url.searchParams.set('sort', sort);

  const response = await fetch(url);
  const { results } = await response.json();
  const songs = results.filter((result) => result.wrapperType === 'track');
  return songs;
}

async function getSongsByEntityUrlInBatches(artistUrls, limit, sort) {
  const batchSize = 50;

  let batches = [];
  for (let i = 0; i < artistUrls.length; i += batchSize) {
    batches.push(artistUrls.slice(i, i + batchSize));
  }

  const promises = batches.map((batch) => {
    return getSongsByEntityUrl(batch, limit, sort);
  });

  return (await Promise.all(promises)).flat();
}

async function insertTrack(roomName, track, score) {
  if (track.wrapperType === 'artist') {
    return;
  }

  await songsClient.hSet('song:' + track.trackId, {
    artistName: track.artistName,
    trackName: track.trackName,
    trackViewUrl: track.trackViewUrl,
    previewUrl: track.previewUrl,
    artworkUrl60: track.artworkUrl60,
    artworkUrl100: track.artworkUrl100
  });

  await songsClient.zAdd(roomName, [
    { score: score, value: track.trackId.toString() }
  ]);
}

async function readConfig(config) {
  const promises = Object.entries(config).map(([roomName, roomConfig]) => {
    return readRoom(roomName, roomConfig);
  });
  return Promise.all(promises);
}

async function readRoom(roomName, roomConfig) {
  console.log(`Loading songs for room ${roomName}...`);
  // get artist from playlists
  const artistsFromPlaylists = await getArtistUrlsFromPlaylistUrls(
    roomConfig.artistsFromPlaylist
  );
  console.log(
    `${artistsFromPlaylists.length} artist urls determined from playlist urls.`
  );

  // merge artists with artists from playlists
  const artistUrls = dedup([...roomConfig.artists, ...artistsFromPlaylists]);
  console.log(
    `${artistUrls.length} artist urls after merge with configured artists and deduplication.`
  );

  // get songs for artists -> song with metadata
  const songsFromArtists = await getSongsByEntityUrlInBatches(
    artistUrls,
    roomConfig.songsPerArtistCount,
    roomConfig.songsPerArtistSort
  );
  console.log(`${songsFromArtists.length} songs from lookup by artist urls.`);

  // get songs for playlists -> songids (1)
  const songUrlsFromPlaylists = await getSongUrlsFromPlaylistUrls(
    roomConfig.songsFromPlaylist
  );
  console.log(
    `${songUrlsFromPlaylists.length} song urls determined from playlist urls.`
  );

  // merge (1) with list of songs from roomconfig (2)
  const songUrls = dedup([...songUrlsFromPlaylists, ...roomConfig.songs]);
  console.log(
    `${songUrls.length} song urls after merge with configured songs and deduplication.`
  );

  // get metadata for all songs in (2)
  const songsFromDirectLookup = await getSongsByEntityUrlInBatches(songUrls);
  console.log(
    `${songsFromDirectLookup.length} songs from lookup by song urls.`
  );

  const songs = dedup([...songsFromArtists, ...songsFromDirectLookup]);
  console.log(
    `${songs.length} songs after merge of song lookup by artist urls and direct lookup.`
  );

  console.log(`All songs in room ${roomName}:`);
  console.log(songs.map((song) => song.trackViewUrl).join('\n'));
  // insert all songs with metadata into redis

  const insertPromises = songs.map((song, songId) =>
    insertTrack(roomName, song, songId)
  );
  await Promise.all(insertPromises);
  console.log(`Finished loading for room ${roomName}`);
}

async function run() {
  await songsClient.connect();

  await songsClient.del(rooms);

  console.log('Loading sample tracks... ');
  await readConfig(config.songs);
  console.log('Finished loading sample tracks.');

  await songsClient.disconnect();
}

run();
