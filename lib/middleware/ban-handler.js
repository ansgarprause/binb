'use strict';

const { usersClient } = require('../redis-clients');
const forwarded = require('forwarded-for');
const utils = require('../utils');

/**
 * Expose a middleware to filter banned IPs.
 */

module.exports = function (req, res, next) {
  res.setHeader('Cache-Control', 'no-store, no-cache');

  const address = forwarded(req, req.headers);

  usersClient.ttl(['ban:' + address.ip], function (err, ttl) {
    if (err) {
      return next(err);
    }

    if (ttl < 0) {
      return next();
    }

    ttl = Math.round(ttl / 60);

    res.render('banned', {
      slogan: utils.randomSlogan(),
      ttl: (ttl || 'less than a') + ' minute' + (ttl < 2 ? '' : 's')
    });
  });
};
