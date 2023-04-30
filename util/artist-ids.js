'use strict';

/**
 * Expose an object with some iTunes artist IDs.
 */

const extractId = (url) => {
  return Number(url.split("/").at(-1));
}

module.exports = {
  britpop: [
    "https://music.apple.com/us/artist/blur/528564",
    "https://music.apple.com/us/artist/oasis/512633",
    "https://music.apple.com/us/artist/pulp/312518",
    "https://music.apple.com/us/artist/radiohead/657515",
    "https://music.apple.com/us/artist/supergrass/391069",
    "https://music.apple.com/us/artist/the-verve/528110",
    "https://music.apple.com/us/artist/travis/475835",
  ].map(extractId),
  taylor: [
    "https://music.apple.com/us/artist/taylor-swift/159260351",
  ].map(extractId),
  kadavar: [
    "https://music.apple.com/us/artist/kadavar/534423387",
  ].map(extractId),
};
