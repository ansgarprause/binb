const clientOptions = {
  url: process.env.REDIS_URL,
  // necessary for fly.io
  family: "IPv6",
};

const songsPrefix = "songs:";
exports.songsPrefix = songsPrefix;
exports.songsClientOptions = {
    ...clientOptions,
    prefix: songsPrefix,
};

const usersPrefix = "users:";
exports.usersPrefix = usersPrefix;
exports.usersClientOptions = {
    ...clientOptions,
    prefix: usersPrefix,
};
