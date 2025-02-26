'use strict';

const amatch = require('./match');
const clients = require('./redis-clients');
const config = require('../config');
const randInt = require('./prng').randInt;
const updateStats = require('./stats');
const utils = require('./utils');

const fifolength = config.songsinarun * config.gameswithnorepeats;
const rooms = {}; // The Object that contains all the room instances
const { songsClient, usersClient } = clients;
const isString = utils.isString;
const isUsername = utils.isUsername;
let primus;
let sparks;

/**
 * Expose a function to set up the rooms.
 */

module.exports = function (options) {
  const refs = require('./sparks')(options);
  primus = refs.primus;
  sparks = refs.sparks;
  config.rooms.forEach(function (room) {
    rooms[room] = new Room(room);
  });
};

module.exports.rooms = rooms;

/**
 * Room constructor.
 */

function Room(roomname) {
  this.artist = null; // Artists in lowercase
  this.artistName = null; // Artists of the track
  this.artworkUrl = null; // The URL of the album cover
  this.feat = null; // Featured artists
  this.finishline = 1; // A counter to handle the 3 fastest answers
  this.playedtracks = []; // The list of already played songs
  this.previewUrl = null; // The URL for the preview of the track
  this.roomname = roomname;
  this.songcounter = 0; // A counter for the track of the current game
  this.songtimeleft = 0; // Remaining time for the current playing track
  this.status = 3; // The room status
  this.title = null; // Title in lowercase
  this.trackName = null; // Title of the track
  this.trackViewUrl = null; // The iTunes URL of the track
  this.trackscount = 0; // The number of available tracks in the room
  this.totusers = 0; // The number of players in the room
  this.usersData = Object.create(null);

  this.initialize();
}

/**
 * Room states.
 */

Room.PLAYING = 0; // A track is playing
Room.LOADING = 1; // A track is loading
Room.ENDING = 2; // The game is over
Room.STARTING = 3; // A new game is about to start

/**
 * Add points and collect players' statistics.
 */

Room.prototype.addPointsAndStats = function (nickname, allinone) {
  const stats = {};
  const userData = this.usersData[nickname];

  switch (this.finishline) {
    case 1:
      this.finishline++;
      if (allinone) {
        stats.points = 6;
        userData.points += 6;
      } else {
        stats.points = 5;
        userData.points += 5;
      }
      stats.gold = true;
      userData.golds++;
      userData.roundpoints = 6;
      break;
    case 2:
      this.finishline++;
      if (allinone) {
        stats.points = 5;
        userData.points += 5;
      } else {
        stats.points = 4;
        userData.points += 4;
      }
      stats.silver = true;
      userData.silvers++;
      userData.roundpoints = 5;
      break;
    case 3:
      this.finishline++;
      if (allinone) {
        stats.points = 4;
        userData.points += 4;
      } else {
        stats.points = 3;
        userData.points += 3;
      }
      stats.bronze = true;
      userData.bronzes++;
      userData.roundpoints = 4;
      break;
    default:
      if (allinone) {
        stats.points = 3;
        userData.points += 3;
      } else {
        stats.points = 2;
        userData.points += 2;
      }
      userData.roundpoints = 3;
  }

  userData.guessed++;
  userData.guesstime = 30000 - this.songtimeleft;
  userData.matched = 'both';
  userData.totguesstime += userData.guesstime;

  if (userData.registered) {
    stats.guesstime = userData.guesstime;
    stats.userscore = userData.points;
    updateStats(nickname, stats);
  }
};

/**
 * Add a new player in the room.
 */

Room.prototype.addUser = function (spark, loggedin) {
  const nickname = spark.nickname;
  const usersData = this.usersData;

  sparks[nickname] = spark;

  usersData[nickname] = {
    bronzes: 0,
    golds: 0,
    guessed: 0,
    guesstime: null,
    matched: null,
    nickname: nickname,
    points: 0,
    registered: loggedin,
    roundpoints: 0,
    silvers: 0,
    totguesstime: 0
  };

  this.totusers++;

  // Broadcast new user event
  primus.send('updateoverview', this.roomname, this.totusers);
  spark.send('ready', {
    trackscount: this.trackscount,
    usersData: usersData,
    nickname: nickname,
    loggedin: loggedin,
    state: {
      previewUrl: this.previewUrl,
      timeleft: this.songtimeleft,
      status: this.status
    }
  });
  primus
    .room(this.roomname)
    .except(spark.id)
    .send('newuser', nickname, usersData);
};

/**
 * Build the podium and start a new game.
 */

Room.prototype.gameOver = function () {
  const podium = [];
  const usersData = this.usersData;

  // Build podium
  for (const key in usersData) {
    podium.push(usersData[key]);
  }
  podium.sort(function (a, b) {
    return b.points - a.points;
  });
  podium.splice(3);

  primus.room(this.roomname).send('gameover', podium);

  // Collect podium stats
  podium.forEach(function (user, index) {
    if (user.registered) {
      updateStats(user.nickname, { podiumplace: index + 1 });
    }
  });

  this.resetPoints(false);
  this.songcounter = 0;

  // Check if FIFO is full
  if (this.playedtracks.length === fifolength) {
    this.playedtracks.splice(0, config.songsinarun);
  }

  // Start a new game
  this.status = Room.STARTING;
  setTimeout(this.sendLoadTrack.bind(this), 5000);
};

/**
 * Initialize the room.
 */

Room.prototype.initialize = function () {
  const room = this;

  songsClient.zcard([this.roomname], function (err, card) {
    if (err) {
      throw err;
    }

    room.trackscount = card;
    room.sendLoadTrack();
  });
};

/**
 * Send a chat message.
 */

Room.prototype.onChatMessage = function (msg, spark, to) {
  const from = spark.nickname;

  if (isString(to)) {
    // Check if the recipient is in the room
    if (this.usersData[to]) {
      spark.send('chatmsg', msg, from, to);
      sparks[to].send('chatmsg', msg, from, to);
    }
    return;
  }

  // Censor answers from chat
  const feat = this.feat;
  const msglcase = msg.toLowerCase();

  if (
    this.status === Room.PLAYING &&
    (amatch(this.artist, msglcase, true) ||
      (feat && amatch(feat, msglcase, true)) ||
      amatch(this.title, msglcase))
  ) {
    const notice = 'You are probably right, but you have to use the box above.';
    spark.send('chatmsg', notice, 'binb', from);
    return;
  }

  primus.room(this.roomname).send('chatmsg', msg, from);
};

/**
 * Handle players' guesses.
 */

Room.prototype.onGuess = function (spark, guess) {
  if (this.status !== Room.PLAYING) {
    return;
  }

  const artist = this.artist;
  const feat = this.feat;
  const title = this.title;
  const userData = this.usersData[spark.nickname];

  // The user hasn't guessed anything
  if (!userData.matched) {
    if (artist === title && amatch(title, guess, true)) {
      return this.onPair(spark, true);
    }
    if (amatch(artist, guess, true) || (feat && amatch(feat, guess, true))) {
      return this.onMatch(spark, 'artist');
    }
    if (amatch(title, guess)) {
      return this.onMatch(spark, 'title');
    }
    return spark.send('nomatch');
  }

  // The user has guessed the track or the artist
  if (userData.matched !== 'both') {
    if (userData.matched === 'artist') {
      if (amatch(title, guess)) {
        return this.onPair(spark);
      }
      return spark.send('nomatch');
    }
    if (amatch(artist, guess, true) || (feat && amatch(feat, guess, true))) {
      return this.onPair(spark);
    }
    return spark.send('nomatch');
  }

  // The user has guessed both track and artist
  spark.send('stoptrying');
};

/**
 * Inform a player that he/she is being ignored.
 */

Room.prototype.onIgnore = function (who, executor, callback) {
  // Check if the player is in the room
  if (this.usersData[who]) {
    sparks[who].send('chatmsg', executor + ' is ignoring you.', 'binb', who);
    return callback(true, who);
  }
  callback(false);
};

/**
 * Kick and optionally ban a player.
 */

Room.prototype.onKick = function (who, why, executor, duration, callback) {
  const room = this;

  if (typeof duration === 'function') {
    callback = duration;
    duration = 0;
  }

  usersClient.hget(['user:' + executor, 'role'], function (err, role) {
    if (err) {
      console.error(err.message);
      return callback(true);
    }

    // Check if the sender can kick other players
    if (role < 1) {
      return callback(false);
    }

    // Check if the target player is in the room
    if (room.usersData[who]) {
      const notice =
        'you have been kicked by ' + executor + (why && ' (' + why + ')') + '.';
      const target = sparks[who];

      if (duration) {
        usersClient.setex('ban:' + target.address.ip, duration, who);
      }

      target.send('chatmsg', notice, 'binb', who);
      target.end();
    }

    callback(true);
  });
};

/**
 * Handle cases where the player has guessed title or artist.
 */

Room.prototype.onMatch = function (spark, what) {
  const nickname = spark.nickname;
  const usersData = this.usersData;
  const userData = usersData[nickname];

  userData.matched = what;
  userData.points++;
  userData.roundpoints++;
  spark.send(what + 'matched');
  primus.room(this.roomname).send('updateusers', usersData);

  if (userData.registered) {
    updateStats(nickname, {
      points: 1,
      userscore: userData.points
    });
  }
};

/**
 * Handle cases where the player has guessed both title and artist.
 */

Room.prototype.onPair = function (spark, allinone) {
  this.addPointsAndStats(spark.nickname, allinone);
  spark.send('bothmatched');
  primus.room(this.roomname).send('updateusers', this.usersData);
};

/**
 * Add an unauthenticated player in the room after checking that his/her
 * nickname is valid.
 */

Room.prototype.join = function (spark, nickname) {
  let feedback;
  const room = this;

  if (nickname === 'binb') {
    feedback = 'That name is reserved.';
  } else if (!isUsername(nickname)) {
    feedback = 'Name must contain only alphanumeric characters.';
  } else if (sparks[nickname]) {
    feedback = 'Name already taken.';
  }

  if (feedback) {
    return spark.send('nickname', feedback);
  }

  // Check if requested nickname belongs to a registered user
  usersClient.exists(['user:' + nickname], function (err, exists) {
    if (!primus.spark(spark.id)) {
      if (err) {
        console.error(err.message);
      }
      return;
    }

    if (err) {
      console.error(err.message);
      return spark.send('nickname', 'Could not check name availability.');
    }

    if (exists) {
      return spark.send('nickname', 'That name belongs to a registered user.');
    }

    if (!spark.nickname) {
      spark.nickname = nickname;
      spark.join(room.roomname, function () {
        room.addUser(spark, false);
      });
    }
  });
};

/**
 * Inform a player that he/she is no longer ignored.
 */

Room.prototype.onUnignore = function (who, executor) {
  if (this.usersData[who]) {
    const notice = executor + ' has stopped ignoring you.';
    sparks[who].send('chatmsg', notice, 'binb', who);
  }
};

/**
 * Remove a player from the room.
 */

Room.prototype.removeUser = function (nickname) {
  const usersData = this.usersData;

  // Delete the references
  delete sparks[nickname];
  delete usersData[nickname];

  this.totusers--;

  // Broadcast the event
  primus.send('updateoverview', this.roomname, this.totusers);
  primus.room(this.roomname).send('userleft', nickname, usersData);
};

/**
 * Clean up users' data.
 */

Room.prototype.resetPoints = function (roundonly) {
  const usersData = this.usersData;
  let userData;

  for (const key in usersData) {
    userData = usersData[key];
    if (!roundonly) {
      userData.points = 0;
      userData.guessed = 0;
      userData.totguesstime = 0;
      userData.golds = 0;
      userData.silvers = 0;
      userData.bronzes = 0;
    }
    userData.roundpoints = 0;
    userData.matched = null;
    userData.guesstime = null;
  }
};

/**
 * Extract a random track and send the load event to all connected clients.
 */

Room.prototype.sendLoadTrack = function () {
  this.status = Room.LOADING;

  const index = randInt(this.trackscount);
  const room = this;

  songsClient.zrange([this.roomname, index, index], function (err, res) {
    if (err) {
      throw err;
    }

    const id = res[0];
    // Check if extracted track is in the list of already played tracks
    if (~room.playedtracks.indexOf(id)) {
      return room.sendLoadTrack();
    }

    room.playedtracks.push(id);

    songsClient.hmget(
      [
        'song:' + id,
        'artistName',
        'trackName',
        'previewUrl',
        'artworkUrl60',
        'trackViewUrl'
      ],
      function (err, replies) {
        if (err) {
          throw err;
        }

        room.artistName = replies[0];
        room.artist = room.artistName.toLowerCase();
        room.trackName = replies[1];
        room.title = room.trackName.toLowerCase();
        room.feat = /feat\. (.+?)[)\]]/.test(room.title) ? RegExp.$1 : null;
        room.previewUrl = replies[2];
        room.artworkUrl = replies[3];
        room.trackViewUrl = replies[4];
        primus.room(room.roomname).send('loadtrack', room.previewUrl);

        setTimeout(room.sendPlayTrack.bind(room), 5000);
      }
    );
  });
};

/**
 * Send the play event to all connected clients.
 */

Room.prototype.sendPlayTrack = function () {
  this.status = Room.PLAYING;
  this.songcounter++;

  primus.room(this.roomname).send('playtrack', {
    counter: this.songcounter,
    tot: config.songsinarun,
    users: this.usersData
  });

  this.startTimer(Date.now() + 30000, 50);
  setTimeout(this.sendTrackInfo.bind(this), 30000);
};

/**
 * Send the track info to all connected clients.
 */

Room.prototype.sendTrackInfo = function () {
  primus.room(this.roomname).send('trackinfo', {
    artworkUrl: this.artworkUrl,
    artistName: this.artistName,
    trackName: this.trackName,
    trackViewUrl: this.trackViewUrl
  });

  this.finishline = 1;

  if (this.songcounter < config.songsinarun) {
    this.resetPoints(true);
    return this.sendLoadTrack();
  }

  this.status = Room.ENDING;
  setTimeout(this.gameOver.bind(this), 5000);
};

/**
 * Start a timer to periodically update the remaining time of the playing song.
 */

Room.prototype.startTimer = function (end, delay) {
  const room = this;

  room.songtimeleft = end - Date.now();

  const interval = setInterval(function () {
    room.songtimeleft = end - Date.now();
    if (room.songtimeleft < delay) {
      clearInterval(interval);
    }
  }, delay);
};
