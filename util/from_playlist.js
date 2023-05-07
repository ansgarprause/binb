'use strict';

const https = require('https');
const selectAll = require('hast-util-selec').selectAll;

function artistsFromPlaylist(playlistUrl) {
    https.get(playlistUrl, (resp) => {
        let data = '';

        // A chunk of data has been received.
        resp.on('data', (chunk) => {
            data += chunk;
        });

        // The whole response has been received. Print out the result.
        resp.on('end', () => {
            console.log(data);
            const $ = cheerio.load(data);
            const content = $('.songs-list > div > div:nth-child(2) > div:nth-child(3) > div:nth-child');
            console.log(content);
        });

    }).on("error", (err) => {
        console.log("Error: " + err.message);
    });
}

module.exports = {
    artistsFromPlaylist,
}

artistsFromPlaylist("https://music.apple.com/de/playlist/pop-rewind/pl.f642b91321c94b8d995689d0651cc2c6");
