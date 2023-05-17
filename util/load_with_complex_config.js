'use strict';

const jsdom = require("jsdom");
const { songsClientOptions } = require('../redis-config');
const songsClient = require('redis').createClient(songsClientOptions);

const { JSDOM } = jsdom;

const roomconfig = {
    britpop: {
        "songsPerArtistCount": 3,
        "songsPerArtistSort": "popular",
        "artistsFromPlaylist": [
            "https://music.apple.com/de/playlist/pop-rewind/pl.f642b91321c94b8d995689d0651cc2c6"
        ],
        "songsFromPlaylist": [
            "https://music.apple.com/de/playlist/pop-rewind/pl.f642b91321c94b8d995689d0651cc2c6"
        ],
        "artists": [
            "https://music.apple.com/us/artist/blur/528564"
        ],
        "songs": [
            "https://music.apple.com/de/song/stay/1574968888"
        ]
    }
}

async function scrapeLinksFromPage(pageUrl, selector) {
    const response = await fetch(pageUrl);
    const body = await response.text();
    const dom = new JSDOM(body);
    const elements = dom.window.document.querySelectorAll(selector);
    let links = Array.from(elements).map(element => element.href);
    links = Array.from(new Set(links));
    return links;
}

async function getArtistUrlsFromPlaylistUrl(playlistUrl) {
    return scrapeLinksFromPage(playlistUrl, '.songs-list__col--secondary a');
}

async function getSongUrlsFromPlaylistUrl(playlistUrl) {
    return scrapeLinksFromPage(playlistUrl, 'a[data-testid="track-seo-link"]');
}

async function insertTrack(roomName, track) {
    if (track.wrapperType === 'artist') {
        return;
    }

    songsClient.hmset(
        'song:' + track.trackId,
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

    const score = track.trackId;
    songsClient.zadd(roomName, score, track.trackId);
}

const extractId = (url) => {
    return Number(url.split('/').at(-1));
};

async function getSongsByEntityUrl(artistUrls, limit=1, sort="popular") {
    const url = new URL("https://itunes.apple.com/lookup");
    url.searchParams.set("id", artistUrls.map(extractId));
    url.searchParams.set("entity", "song");
    url.searchParams.set("limit", limit);
    url.searchParams.set("sort", sort);

    const response = await fetch(url);
    const { results } = await response.json();
    const songs = results.filter(result => result.wrapperType === "track");
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

function dedup(list) {
    return Array.from(new Set(list));
}

async function readConfig(config) {
    const promises = Object.entries(config).map(([roomName, roomConfig]) => {
        return readRoom(roomName, roomConfig);
    })
    return Promise.all(promises);
}

async function readRoom(roomName, roomConfig) {
    // get artist from playlists
    const artistsFromPlaylistsPromises = roomConfig.artistsFromPlaylist.map(getArtistUrlsFromPlaylistUrl);
    const artistsFromPlaylists = (await Promise.all(artistsFromPlaylistsPromises)).flat();

    // merge artists with artists from playlists
    const artistUrls = dedup([...roomConfig.artists, ...artistsFromPlaylists]);

    // get songs for artists -> song with metadata
    const songsFromArtists = await getSongsByEntityUrlInBatches(artistUrls, roomConfig.songsPerArtistCount, roomConfig.songsPerArtistSort);

    // get songs for playlists -> songids (1)
    const songUrlsFromPlaylistsPromises = roomConfig.songsFromPlaylist.map(getSongUrlsFromPlaylistUrl);
    const songUrlsFromPlaylists = (await Promise.all(songUrlsFromPlaylistsPromises)).flat();

    // merge (1) with list of songs from roomconfig (2)
    const songUrls = dedup([...songUrlsFromPlaylists, ...roomConfig.songs]);

    // get metadata for all songs in (2)
    const songsFromDirectLookup = await getSongsByEntityUrlInBatches(songUrls);

    const songs = dedup([...songsFromArtists, ...songsFromDirectLookup]);

    console.log(songs.length);
    console.log(songs);
    // insert all songs with metadata into redis

    songs.forEach((song) => insertTrack(roomName, song));
}

readConfig(roomconfig);