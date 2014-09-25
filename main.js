// node-np - standalone last.fm bot written in node.js

var log = require('log-simple')();

var VERSION = '0.5.6';
/* TODO
 * Connect to new networks, join channels, etc.. without restarting (+0.1.0)
 * Better NPM integration, publish on NPM (+0.0.1)
 */
log.info('node-np v' + VERSION);

var DBCONFIG = {
  driver: 'json',
  file: 'mappings.json'
};

// configuration
var config = require('./config.json');
if (config && config.apikey) APIKEY = config.apikey;
else APIKEY = '4c563adf68bc357a4570d3e7986f6481';

log.setDebug(false);
var maxTags = 4;

if (config) {
  if (config.debug) {
    log.setDebug(config.debug);
  }
  if (config.tags) {
    if (typeof config.tags === 'number') maxTags = config.tags;
  }
}
log.debug('successfully loaded configuration');

// irc client setup
var client = require('coffea')(),
    net    = require('net'),
    db     = require('./db_' + DBCONFIG.driver)(DBCONFIG);

var network_config = {};
config.networks.forEach(function (network) {
  var id = client.add(network);
  log.debug('connecting to network ' + id + ':', JSON.stringify(network));
  network_config[id] = network;
});

// bot begins here

var LastFmNode = require('lastfm').LastFmNode;

var lastfm = new LastFmNode({
  api_key: APIKEY
});
log.debug('using last.fm API with key:', APIKEY);

client.on('motd', function (event) {
  if (network_config[event.network] && network_config[event.network].nickserv) {
    log.debug('identifying with NickServ on network ' + event.network + ':', JSON.stringify(network_config[event.network].nickserv));
    client.send('NickServ', 'IDENTIFY ' + network_config[event.network].nickserv, event.network);
  }

  if (network_config[event.network] && network_config[event.network].channels) {
    log.debug('joining channels on network ' + event.network + ':', JSON.stringify(network_config[event.network].channels));
    client.join(network_config[event.network].channels, event.network);
  }
});

function compareUsers(nick1, nick2, callback) {
  lastfm.request('tasteometer.compare', {
    type1: 'user',
    value1: nick1,
    type2: 'user',
    value2: nick2,
    handlers: {
      success: function (data) {
        var score = Number((parseFloat(data.comparison.result.score) * 100).toFixed(2));
        var artists = data.comparison.result.artists.artist;

        var str = 'Comparing \'' + client.format.bold + nick1 + client.format.bold + '\' with \'' + client.format.bold + nick2 + client.format.bold + '\': ';
        str += client.format.bold;
        if (score < 10) str += client.format.normal;
        else if (score < 25) str += client.format.brown;
        else if (score < 50) str += client.format.red;
        else if (score < 75) str += client.format.yellow;
        else if (score < 95) str += client.format.green;
        else str += client.format.aqua;
        str += score + '%';
        str += client.format.reset;

        if (artists) {
          for (var i=0; i < artists.length; i++) {
            if (artists[i].name) {
              if (i === 0) str += ' - Common artists include: ';

              str += client.format.teal + client.format.bold + artists[i].name + client.format.reset;

              if (i != artists.length-1) str += ', ';
            }
          }
        }

        callback(str);
      },
      error: function (err) {
        callback(err.message);
      }
    }
  });
}

function parseTrackInfo(track, nick, callback) {
  var str;

  if (track.now_playing) {
    str = '\'' + client.format.bold + nick + client.format.bold + '\' is now playing: ';
  } else {
    str = '\'' + client.format.bold + nick + client.format.bold + '\' is not listening to anything right now. The last played track (on ' + track.date + ' UTC) was: ';
  }

  if (track.artist && track.artist.name) str += client.format.olive + client.format.bold + track.artist.name + client.format.reset + ' - ';

  if (track.album && track.album.title) str += client.format.olive + client.format.bold + track.album.title + client.format.reset + ' - ';

  str += client.format.olive + client.format.bold + track.name + client.format.reset;

  if (track.userloved && (track.userloved !== '0')) str += ' [' + client.format.red + '<3' + client.format.normal + ' - ';
  else if (track.userplaycount) str += ' [';

  if (track.userplaycount) str += 'playcount ' + client.format.bold + track.userplaycount + 'x' + client.format.bold + ']';
  else if (track.userloved && (track.userloved !== '0')) str += 'playcount ' + client.format.bold + '0x' + client.format.bold + ']'; // this shouldn't happen unless the user loves a track with no plays (and who would do that?)

  if (track.toptags) {
    var tags = (track.toptags instanceof Array) ? track.toptags : [track.toptags];
    var max = (tags.length < maxTags) ? tags.length : maxTags;
    for (var i=0; i < max; i++) {
      if (tags[i] && tags[i].name) {
        if (i === 0) str += ' (';

        str += client.format.teal + client.format.bold + tags[i].name + client.format.reset;

        if (i != max-1) str += ', ';
        else str += ')';
      }
    }
  }

  if (track.duration) {
    var secs = (track.duration / 1000); // ms to sec
    var mins = Math.floor(secs / 60); // sec to min
    secs = Math.round(((secs / 60) - mins) * 60); // remaining seconds
    str += ' [' + client.format.olive + client.format.bold;
    if (mins < 10) str += '0';
    str += mins + ':';
    if (secs < 10) str += '0';
    str += secs;
    str += client.format.reset + ']';
  }

  callback(str);
}

function getArtistTags(track, nick, callback) {
  log.debug('getting artist tags');
  lastfm.request('artist.getTopTags', {
    mbid: track.artist.mbid,
    artist: track.artist.name,
    autocorrect: 1,
    handlers: {
      success: function (data) {
        var tags;
        if (data.toptags && data.toptags.tag) {
          tags = (data.toptags.tag instanceof Array) ? data.toptags.tag : [data.toptags];
        } else {
          tags = [];
        }

        if (tags.length > 0) {
          track.toptags = tags;
          parseTrackInfo(track, nick, callback);
        } else {
          parseTrackInfo(track, nick, callback); // no tags
        }
      },
      error: function (err) {
        log.debug('getArtistTags error:', err);
        log.debug('you can probably ignore this error above, this track has no tags.');
        parseTrackInfo(track, nick, callback); // no tags
      }
    }
  });
}

function getAlbumTags(track, nick, callback) {
  log.debug('getting album tags', track, track.album);
  lastfm.request('album.getTopTags', {
    mbid: track.album.mbid,
    autocorrect: 1,
    handlers: {
      success: function (data) {
        var tags;
        if (data.toptags && data.toptags.tag) {
          tags = (data.toptags.tag instanceof Array) ? data.toptags.tag : [data.toptags];
        } else {
          tags = [];
        }

        if (tags.length > 0) {
          track.toptags = tags;
          parseTrackInfo(track, nick, callback);
        } else {
          // get tags from artist
          getArtistTags(track, nick, callback);
        }
      },
      error: function (err) {
        // get tags from artist
        log.debug('getAlbumTags error:', err);
        log.debug('you can probably ignore this error above, trying to get tags from artist...');
        getArtistTags(track, nick, callback);
      }
    }
  });
}

function getRecentTrack(nick, callback) {
  lastfm.request('user.getRecentTracks', {
    user: nick,
    limit: 1,
    handlers: {
      success: function (data) {
        if (data.recenttracks.hasOwnProperty('track')) {
          var track = (data.recenttracks.track instanceof Array) ? data.recenttracks.track[0] : data.recenttracks.track;
          var now_playing = track.hasOwnProperty('@attr') && track['@attr'].nowplaying === 'true';
          var date = (track.date && track.date['#text']) ? track.date['#text'] : undefined; 
          lastfm.request('track.getInfo', {
            mbid: track.mbid,
            track: track.name,
            artist: track.artist['#text'],
            username: nick,
            handlers: {
              success: function (data) {
                data.track.date = date;
                data.track.now_playing = now_playing;

                var tags;
                if (data.track.toptags && data.track.toptags.tag && (data.track.toptags.tag instanceof Array)) {
                  tags = data.track.toptags.tag;
                } else {
                  if ((typeof data.track.toptags === 'string') && (data.track.toptags.length > 0)) {
                    var tag = data.track.toptags.trim().replace('\\n', '');
                    tags = [tag];
                  } else {
                    tags = [];
                  }
                }

                if (tags.length > 0) {
                  data.track.toptags = tags;
                  parseTrackInfo(data.track, nick, callback);
                } else {
                  if (data.album) {
                    // get tags from album
                    getAlbumTags(data.track, nick, callback);
                  } else {
                    // get tags from artist
                    getArtistTags(data.track, nick, callback);
                  }
                }
              },
              error: function (err) {
                log.error('getRecentTrack error:', err);
                callback(err.message);
              }
            }
          });
        } else {
          callback('\'' + client.format.bold + nick + client.format.bold + '\' hasn\'t scrobbled any tracks yet.');
        }
      },

      error: function (err) {
        callback(err.message);
      }
    }
  });
}

function isAdmin(event, callback) {
  if (!callback) return;
  if (network_config[event.network] && network_config[event.network].admin) {
    var admin = network_config[event.network].admin;
    if (network_config[event.network].adminNickServ) {
      client.whois(event.user.getNick(), function(err, res) {
        if (!res) callback(false);
        else {
          var user = res.account;
          if (!user) callback(false);
          else callback((admin instanceof Array) ? (admin.indexOf(user) > -1) : user === admin);
        }
      });
    } else {
      var user = event.user.getNick();
      callback((admin instanceof Array) ? (admin.indexOf(user) > -1) : user === admin);
    }
  } else {
    callback(false);
  }
}

client.on('privatemessage', function(event) {
  var args = event.message.split(' ');

  // admin commands
  isAdmin(event, function (admin) {
    if (admin) {
      switch (args[0]) {
        case 'dump':
          client.send(event.user, db.dump());
          break;
        case 'flush':
          db.flush(function(err) {
            if (err) client.send(event.user, 'Error: ' + JSON.stringify(err));
            else client.send(event.user, 'done');
          });
          break;
        case 'count':
          client.send(event.user, JSON.stringify(db.count()));
          break;
        case 'del':
          if (args.length >= 2) {
            db.del(args[1]);
            db.flush();
            client.send(event.user, 'done');
          } else client.send(event.user, 'needs more arguments');
          break;
        case 'get':
          if (args.length >= 2) {
            client.send(event.user, args[1] + ': ' + db.get(args[1]));
          } else client.send(event.user, 'needs more arguments');
          break;
        case 'set':
          if (args.length >= 3) {
            db.set(args[1], args[2]);
            db.flush();
            client.send(event.user, 'done');
          } else client.send(event.user, 'needs more arguments');
          break;
        case 'reload':
          client.send(event.user, 'wip'); // TODO
          break;
        case 'wp':
          var dbdump = db.dumpRaw();
          for (var key in db.dumpRaw()) {
            np(event.user, key, true);
          }
          break;
        default:
          client.send(event.user, 'I don\'t understand you');
          break;
      }
    }
  });
});

function np(to, nick, wp) {
  log.debug('np(', wp ? to.getNick() : to.getName(), ',', nick, ',', wp, ')');
  var resolved_nick = db.get(nick, nick);
  if (resolved_nick == nick) db.set(nick, nick); // store this nick for wp command
  getRecentTrack(resolved_nick, function(msg) {
    client.send(to, wp ? '[' + client.format.bold + nick + client.format.bold + '] ' + msg : msg);
  });
}

function whois(to, nick, wp) {
  log.debug('whois(', wp ? to.getNick() : to.getName(), ',', nick, ')');
  var resolved_nick = db.get(nick, nick);
  if (resolved_nick == nick) db.set(nick, nick); // store this nick for wp command
  client.send(to, '\'' + client.format.bold + nick + client.format.bold + '\' is \'' + client.format.bold + resolved_nick + client.format.bold + '\' on last.fm: http://last.fm/user/' + resolved_nick);
}

function compare(to, nick1, nick2) {
  log.debug('compare(', to, ',', nick1, ',', nick2, ')');
  compareUsers(db.get(nick1, nick1), db.get(nick2, nick2), function(msg) {
    client.send(to, msg);
  });
}

client.on('message', function(event) {
  if (event.message.match(/\(np\)/g) || event.message.match(/lastfm:np/g)) np(event.channel, event.user.getNick());
  if (network_config[event.network] && network_config[event.network].prefix && (event.message.substr(0, 1) == network_config[event.network].prefix)) {
    var args = event.message.substr(1).split(' ');

    // user commands
    switch (args[0]) {
      case 'source':
      case 'version':
        client.send(event.channel, 'node-np v' + VERSION + ' (standalone last.fm bot written in node.js) - Source: https://github.com/omnidan/node-np');
        break;
      case 'issue':
      case 'issues':
      case 'bug':
        client.send(event.channel, 'Please file issue requests here: https://github.com/omnidan/node-np/issues');
        break;
      case 'strip':
        client.send(event.channel, '*takes off its clothes* I\'m running on node v' + process.versions.node + ' with v8 v' + process.versions.v8);
        break;
      case 'setuser':
        if (args.length > 1) {
          db.set(event.user.getNick(), args[1]);
          db.flush();
          client.send(event.channel, '\'' + client.format.bold + event.user.getNick() + client.format.bold + '\' is now associated with http://last.fm/user/' + args[1]); // TODO: check if last.fm user exists?
        } else {
          client.send(event.channel, network_config[event.network].prefix + 'setuser needs a last.fm username');
        }
        break;
      case 'help':
        client.send(event.channel, 'I am a last.fm bot. Use "' + client.format.bold + network_config[event.network].prefix + 'setuser LAST_FM_NICK' + client.format.bold + 
          '" to associate your irc nick with your last.fm account. Then run "' + client.format.bold + network_config[event.network].prefix + 'np' + client.format.bold + '"');
        break;
      case 'np':
        if (args.length > 1) {
          np(event.channel, args[1]);
        } else {
          np(event.channel, event.user.getNick());
        }
        break;
      case 'wp':
        isAdmin(event, function (admin) {
          if (admin) {
            client.send(event.channel, event.user.getNick() + ' ;)');
            var dbdump = db.dumpRaw();
            for (var key in db.dumpRaw()) {
              np(event.user, key, true);
            }
          }
        });
        break;
      case 'whois':
        if (args.length > 1) {
          whois(event.channel, args[1]);
        } else {
          whois(event.channel, event.user.getNick());
        }
        break;
      case 'wwhois':
        isAdmin(event, function (admin) {
          if (admin) {
            client.send(event.channel, event.user.getNick() + ' ;)');
            var dbdump = db.dumpRaw();
            for (var key in db.dumpRaw()) {
              whois(event.user, key, true);
            }
          }
        });
        break;
      case 'compare':
        if (args.length > 2) {
          compare(event.channel, args[1], args[2]);
        } else if (args.length > 1) {
          compare(event.channel, event.user.getNick(), args[1]);
        } else {
          client.send(event.channel, 'Use "' + client.format.bold + network_config[event.network].prefix + 'compare NICK' + client.format.bold +
            '" or "' + client.format.bold + network_config[event.network].prefix + 'compare NICK1 NICK2' + client.format.bold + '"');
        }
        break;
      case 'join': // join #channel (network) (nostore), join #channel (nostore)
        // TODO: move to function
        if (args.length > 2) {
          client.send(event.channel, 'Not implemented yet.'); // TODO: get network from coffea and set to network
        } else if (args.length > 1) {
          client.join(args[1]);
          if (!args[3]) {
            // TODO: store channel in config
          }
        } else {
          client.send(event.channel, 'Use "' + client.format.bold + network_config[event.network].prefix + 'join #CHANNEL' + client.format.bold +
            '" or "' + client.format.bold + network_config[event.network].prefix + 'join #CHANNEL NETWORK' + client.format.bold + '"');
        }
        break;
      case 'part': // part #channel (network) (nostore), part #channel (nostore)
        // TODO: move to function
        if (args.length > 2) {
          client.send(event.channel, 'Not implemented yet.'); // TODO: get network from coffea and set to network
        } else if (args.length > 1) {
          client.part(args[1]);
          if (!args[3]) {
            // TODO: store channel in config
          }
        } else {
          client.send(event.channel, 'Use "' + client.format.bold + network_config[event.network].prefix + 'part #CHANNEL' + client.format.bold +
            '" or "' + client.format.bold + network_config[event.network].prefix + 'part #CHANNEL NETWORK' + client.format.bold + '"');
        }
        break;
      case 'connect': // connect name network (port) (ssl) (nostore), connect network (port) (ssl) (nostore)
        break;
      case 'disconnect': // disconnect name (nostore)
        break;
    }
  }
});
