const clientOptions = {
  url: process.env.REDIS_URL,
  family: process.env.REDIS_FAMILY,
  legacyMode: true
};

const songsPrefix = 'songs:';
exports.songsPrefix = songsPrefix;
exports.songsClientOptions = {
  ...clientOptions,
  prefix: songsPrefix
};

const usersPrefix = 'users:';
exports.usersPrefix = usersPrefix;
exports.usersClientOptions = {
  ...clientOptions,
  prefix: usersPrefix
};
