// node-np - standalone last.fm bot written in node.js

var log = require('log-simple')();

var VERSION = '0.5.14';
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

log.setDebug(config.debug);
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
    db     = require('./db_' + DBCONFIG.driver)(DBCONFIG);

var network_config = {};
var id = 0;
config.networks.forEach(function (network) {
  network.id = "" + id;
  client.add(network);
  log.debug('connecting to network ' + id + ':', JSON.stringify(network));
  network_config[id] = network;
  id++;
});

// command line input
var readline = require('readline'),
    util = require('util');

var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.setPrompt("> ", 2);
rl.on("line", function (line) {
    if (line.trim() !== "") console.log(eval('client.' + line));
    rl.prompt();
});
rl.on('close', function () {
    return process.exit(1);
});
rl.on("SIGINT", function () {
    return process.exit(1);
});

// bot begins here

var LastFmNode = require('lastfm').LastFmNode;

var lastfm = new LastFmNode({
  api_key: APIKEY
});
log.debug('using last.fm API with key:', APIKEY);

client.on('motd', function (err, event) {
  if (network_config[event.network] && network_config[event.network].nickserv) {
    log.debug('identifying with NickServ on network ' + event.network + ':', JSON.stringify(network_config[event.network].nickserv));
    client.send('NickServ', 'IDENTIFY ' + network_config[event.network].nickserv, event.network);
  }

  if (network_config[event.network] && network_config[event.network].channels) {
    log.debug('joining channels on network ' + event.network + ':', JSON.stringify(network_config[event.network].channels));
    client.join(network_config[event.network].channels, event.network);
  }

  rl.prompt();
});

function compareUsers(event, nick1, nick2, callback) {
  lastfm.request('tasteometer.compare', {
    type1: 'user',
    value1: nick1,
    type2: 'user',
    value2: nick2,
    handlers: {
      success: function (data) {
        var score = Number((parseFloat(data.comparison.result.score) * 100).toFixed(2));
        var artists = data && data.comparison && data.comparison.result && data.comparison.result.artists && data.comparison.result.artists.artist;

        var str = 'Comparing \'' + client.format.get('bold', event.network) + nick1 + client.format.get('bold', event.network) + '\' with \'' + client.format.get('bold', event.network) + nick2 + client.format.get('bold', event.network) + '\': ';
        str += client.format.get('bold', event.network);
        if (score < 10) str += client.format.get('normal', event.network);
        else if (score < 25) str += client.format.get('brown', event.network);
        else if (score < 50) str += client.format.get('red', event.network);
        else if (score < 75) str += client.format.get('yellow', event.network);
        else if (score < 95) str += client.format.get('green', event.network);
        else str += client.format.get('aqua', event.network);
        str += score + '%';
        str += client.format.get('reset', event.network);

        if (artists) {
          for (var i=0; i < artists.length; i++) {
            if (artists[i].name) {
              if (i === 0) str += ' - Common artists include: ';

              str += client.format.get('teal', event.network) + client.format.get('bold', event.network) + artists[i].name + client.format.get('reset', event.network);

              if (i != artists.length-1) str += ', ';
            }
          }
        }

        callback(str);
      },
      error: function (err) {
        log.debug('compareUsers error:', err.stack);
        callback('last.fm api error - compareUsers/tasteometer.compare: ' + err.message);
      }
    }
  });
}

function parseTrackInfo(event, track, nick, callback) {
  var str;

  if (!track) return callback('last.fm api error - parseTrackInfo: track undefined');

  if (track.now_playing) {
    str = '\'' + client.format.get('bold', event.network) + nick + client.format.get('bold', event.network) + '\' is now playing: ';
  } else {
    str = '\'' + client.format.get('bold', event.network) + nick + client.format.get('bold', event.network) + '\' is not listening to anything right now. The last played track (on ' + track.date + ' UTC) was: ';
  }

  if (track.artist && track.artist.name) str += client.format.get('olive', event.network) + client.format.get('bold', event.network) + track.artist.name + client.format.get('reset', event.network) + ' - ';

  if (track.album && track.album.title) str += client.format.get('olive', event.network) + client.format.get('bold', event.network) + track.album.title + client.format.get('reset', event.network) + ' - ';

  str += client.format.get('olive', event.network) + client.format.get('bold', event.network) + track.name + client.format.get('reset', event.network);

  if (track.userloved && (track.userloved !== '0')) str += ' [' + client.format.get('red', event.network) + '<3' + client.format.get('normal', event.network) + ' - ';
  else if (track.userplaycount) str += ' [';

  if (track.userplaycount) str += 'playcount ' + client.format.get('bold', event.network) + track.userplaycount + 'x' + client.format.get('bold', event.network) + ']';
  else if (track.userloved && (track.userloved !== '0')) str += 'playcount ' + client.format.get('bold', event.network) + '0x' + client.format.get('bold', event.network) + ']'; // this shouldn't happen unless the user loves a track with no plays (and who would do that?)

  if (track.toptags) {
    var tags = (track.toptags instanceof Array) ? track.toptags : [track.toptags];
    var max = (tags.length < maxTags) ? tags.length : maxTags;
    for (var i=0; i < max; i++) {
      if (tags[i] && tags[i].name) {
        if (i === 0) str += ' (';

        str += client.format.get('teal', event.network) + client.format.get('bold', event.network) + tags[i].name + client.format.get('reset', event.network);

        if (i != max-1) str += ', ';
        else str += ')';
      }
    }
  }

  if (track.duration) {
    var secs = (track.duration / 1000); // ms to sec
    var mins = Math.floor(secs / 60); // sec to min
    secs = Math.round(((secs / 60) - mins) * 60); // remaining seconds
    str += ' [' + client.format.get('olive', event.network) + client.format.get('bold', event.network);
    if (mins < 10) str += '0';
    str += mins + ':';
    if (secs < 10) str += '0';
    str += secs;
    str += client.format.get('reset', event.network) + ']';
  }

  callback(str);
}

function getArtistTags(event, track, nick, callback) {
  log.debug('getting artist tags');
  lastfm.request('artist.getTopTags', {
    mbid: track && track.artist && track.artist.mbid,
    artist: track && track.artist && track.artist.name,
    autocorrect: 1,
    handlers: {
      success: function (data) {
        var tags;
        if (data && data.toptags && data.toptags.tag) {
          tags = (data.toptags.tag instanceof Array) ? data.toptags.tag : [data.toptags];
        } else {
          tags = [];
        }

        if (tags.length > 0) {
          track.toptags = tags;
          parseTrackInfo(event, track, nick, callback);
        } else {
          parseTrackInfo(event, track, nick, callback); // no tags
        }
      },
      error: function (err) {
        log.debug('getArtistTags error:', err.stack);
        log.debug('you can probably ignore this error above, this track has no tags.');
        parseTrackInfo(event, track, nick, callback); // no tags
      }
    }
  });
}

function getAlbumTags(event, track, nick, callback) {
  log.debug('getting album tags', track, track.album);
  lastfm.request('album.getTopTags', {
    mbid: track && track.album && track.album.mbid,
    autocorrect: 1,
    handlers: {
      success: function (data) {
        var tags;
        if (data && data.toptags && data.toptags.tag) {
          tags = (data.toptags.tag instanceof Array) ? data.toptags.tag : [data.toptags];
        } else {
          tags = [];
        }

        if (tags.length > 0) {
          track.toptags = tags;
          parseTrackInfo(event, track, nick, callback);
        } else {
          // get tags from artist
          getArtistTags(event, track, nick, callback);
        }
      },
      error: function (err) {
        // get tags from artist
        log.debug('getAlbumTags error:', err);
        log.debug('you can probably ignore this error above, trying to get tags from artist...');
        getArtistTags(event, track, nick, callback); // no tags
      }
    }
  });
}

function getRecentTrack(event, nick, callback) {
  lastfm.request('user.getRecentTracks', {
    user: nick,
    limit: 1,
    handlers: {
      success: function (data) {
        if (data && data.recenttracks && data.recenttracks.hasOwnProperty('track')) {
          var track = (data.recenttracks.track instanceof Array) ? data.recenttracks.track[0] : data.recenttracks.track;
          var now_playing = track && track.hasOwnProperty('@attr') && track['@attr'].nowplaying === 'true';
          var date = (track && track.date && track.date['#text']) ? track.date['#text'] : undefined;
          lastfm.request('track.getInfo', {
            mbid: track && track.mbid,
            track: track && track.name,
            artist: track && track.artist && track.artist['#text'],
            username: nick,
            handlers: {
              success: function (data) {
                if (!data || !data.track) {
                  return callback('last.fm api error - getRecentTrack/user.getRecentTracks: data.track undefined');
                }

                data.track.date = date;
                data.track.now_playing = now_playing;

                var tags;
                if (data && data.track && data.track.toptags && data.track.toptags.tag && (data.track.toptags.tag instanceof Array)) {
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
                  parseTrackInfo(event, data.track, nick, callback);
                } else {
                  if (data.album) {
                    // get tags from album
                    getAlbumTags(event, data.track, nick, callback);
                  } else {
                    // get tags from artist
                    getArtistTags(event, data.track, nick, callback);
                  }
                }
              },
              error: function (err) {
                log.error('getRecentTrack error:', err.stack);
                callback('last.fm api error - getRecentTrack/user.getRecentTracks: ' + err.message);
              }
            }
          });
        } else {
          callback('\'' + client.format.get('bold', event.network) + nick + client.format.get('bold', event.network) + '\' hasn\'t scrobbled any tracks yet.');
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
      client.whois(event.user.nick, function (err, res) {
        if (!res) callback(false);
        else {
          var user = res.account;
          if (!user) callback(false);
          else callback((admin instanceof Array) ? (admin.indexOf(user) > -1) : user === admin);
        }
      });
    } else {
      var user = event.user.nick;
      callback((admin instanceof Array) ? (admin.indexOf(user) > -1) : user === admin);
    }
  } else {
    callback(false);
  }
}

client.on('privatemessage', function(err, event) {
  var args = event.message.split(' ');

  // admin commands
  isAdmin(event, function (admin) {
    if (admin) {
      switch (args[0]) {
        case 'dump':
          event.reply(db.dump());
          break;
        case 'flush':
          db.flush(function(err) {
            if (err) event.reply('Error: ' + JSON.stringify(err));
            else event.reply('done');
          });
          break;
        case 'count':
          event.reply(JSON.stringify(db.count()));
          break;
        case 'del':
          if (args.length >= 2) {
            db.del(args[1]);
            db.flush();
            event.reply('done');
          } else event.reply('needs more arguments');
          break;
        case 'get':
          if (args.length >= 2) {
            event.reply(args[1] + ': ' + db.get(args[1]));
          } else event.reply('needs more arguments');
          break;
        case 'set':
          if (args.length >= 3) {
            db.set(args[1], args[2]);
            db.flush();
            event.reply('done');
          } else event.reply('needs more arguments');
          break;
        case 'reload':
          event.reply('wip'); // TODO
          break;
        case 'wp':
          var dbdump = db.dumpRaw();
          for (var key in db.dumpRaw()) {
            np(event, key, true);
          }
          break;
        default:
          event.reply('I don\'t understand you');
          break;
      }
    }
  });
});

function np(event, nick, wp) {
  log.debug('np(', nick, ',', wp, ')');
  var resolved_nick = db.get(nick, nick);
  if (resolved_nick == nick) db.set(nick, nick); // store this nick for wp command
  getRecentTrack(event, resolved_nick, function(msg) {
    event.reply(wp ? '[' + client.format.get('bold', event.network) + nick + client.format.get('bold', event.network) + '] ' + msg : msg);
  });
}

function whois(event, nick, wp) {
  log.debug('whois(', nick, ')');
  var resolved_nick = db.get(nick, nick);
  if (resolved_nick == nick) db.set(nick, nick); // store this nick for wp command
  event.reply('\'' + client.format.get('bold', event.network) + nick + client.format.get('bold', event.network) + '\' is \'' + client.format.get('bold', event.network) + resolved_nick + client.format.get('bold', event.network) + '\' on last.fm: http://last.fm/user/' + resolved_nick);
}

function compare(event, nick1, nick2) {
  log.debug('compare(', nick1, ',', nick2, ')');
  compareUsers(event, db.get(nick1, nick1), db.get(nick2, nick2), function(msg) {
    event.reply(msg);
  });
}


client.on('message', function (event) {
    if (event.message.match(/\(np\)/g) || event.message.match(/lastfm:np/g)) np(event, event.user.nick);
});

client.on('command', function (event) {
  switch (event.cmd) {
    case 'source':
    case 'version':
      event.reply('node-np v' + VERSION + ' (standalone last.fm bot written in node.js) - coffea v' + client.version + ' - Source: https://github.com/omnidan/node-np');
      break;
    case 'issue':
    case 'issues':
    case 'bug':
      event.reply('Please file issue requests here: https://github.com/omnidan/node-np/issues');
      break;
    case 'strip':
      event.reply('*takes off its clothes* I\'m running on node v' + process.versions.node + ' with v8 v' + process.versions.v8);
      break;
    case 'setuser':
      if (event.args.length > 0) {
        db.set(event.user.nick, event.args[0]);
        db.flush();
        event.reply('\'' + client.format.get('bold', event.network) + event.user.nick + client.format.get('bold', event.network) + '\' is now associated with http://last.fm/user/' + event.args[0]); // TODO: check if last.fm user exists?
      } else {
        event.reply(network_config[event.network].prefix + 'setuser needs a last.fm username');
      }
      break;
    case 'help':
      event.reply('I am a last.fm bot. Use "' + client.format.get('bold', event.network) + network_config[event.network].prefix + 'setuser LAST_FM_NICK' + client.format.get('bold', event.network) +
        '" to associate your irc nick with your last.fm account. Then run "' + client.format.get('bold', event.network) + network_config[event.network].prefix + 'np' + client.format.get('bold', event.network) + '"');
      break;
    case 'np':
      if (event.args.length > 0) {
        np(event, event.args[0]);
      } else {
        np(event, event.user.nick);
      }
      break;
    case 'wp':
      isAdmin(event, function (admin) {
        if (admin) {
          var dbdump = db.dumpRaw();
          for (var key in db.dumpRaw()) {
            np(event, event.user, key, true);
          }
        }
      });
      break;
    case 'whois':
      if (event.args.length > 0) {
        whois(event, event.args[0]);
      } else {
        whois(event, event.user.nick);
      }
      break;
    case 'wwhois':
      isAdmin(event, function (admin) {
        if (admin) {
          event.reply(event.user.nick + ' ;)');
          var dbdump = db.dumpRaw();
          for (var key in db.dumpRaw()) {
            whois(event, event.user, key, true);
          }
        }
      });
      break;
    case 'compare':
      if (event.args.length > 1) {
        compare(event, event.args[0], event.args[1]);
      } else if (event.args.length > 0) {
        compare(event, event.user.nick, event.args[0]);
      } else {
        event.reply('Use "' + client.format.get('bold', event.network) + network_config[event.network].prefix + 'compare NICK' + client.format.get('bold', event.network) +
          '" or "' + client.format.get('bold', event.network) + network_config[event.network].prefix + 'compare NICK1 NICK2' + client.format.get('bold', event.network) + '"');
      }
      break;
    case 'join': // join #channel (network) (nostore), join #channel (nostore)
      // TODO: move to function, allow in PM too
      isAdmin(event, function (admin) {
        if (event.args.length > 1) {
          event.reply('Not implemented yet.'); // TODO: get network from coffea and set to network
        } else if (event.args.length > 0) {
          client.join(event.args[0]);
          // if (!event.args[2]) {
            // TODO: store channel in config
          // }
        } else {
          event.reply('Use "' + client.format.get('bold', event.network) + network_config[event.network].prefix + 'join #CHANNEL' + client.format.get('bold', event.network) +
            '" or "' + client.format.get('bold', event.network) + network_config[event.network].prefix + 'join #CHANNEL NETWORK' + client.format.get('bold', event.network) + '"');
        }
      });
      break;
    case 'part': // part #channel (network) (nostore), part #channel (nostore)
      // TODO: move to function, allow in PM too
      isAdmin(event, function (admin) {
        if (event.args.length > 1) {
          event.reply('Not implemented yet.'); // TODO: get network from coffea and set to network
        } else if (event.args.length > 0) {
          client.part(event.args[0]);
          // if (!event.args[2]) {
            // TODO: store channel in config
          // }
        } else {
          event.reply('Use "' + client.format.get('bold', event.network) + network_config[event.network].prefix + 'part #CHANNEL' + client.format.get('bold', event.network) +
            '" or "' + client.format.get('bold', event.network) + network_config[event.network].prefix + 'part #CHANNEL NETWORK' + client.format.get('bold', event.network) + '"');
        }
      });
      break;
    case 'connect': // connect name network (port) (ssl) (nostore), connect network (port) (ssl) (nostore)
      break;
    case 'disconnect': // disconnect name (nostore)
      break;
  }
});
