// node-np - standalone last.fm bot written in node.js

var log = require('log-simple')({init: false});

var VERSION = '0.4.2';
/* TODO
 * If track genres not found, show album/artist genres (+0.0.1)
 * Connect to new networks, join channels, etc.. without restarting (+0.1.0)
 * Show when the last played track was played (+0.0.1)
 * Change logging to log-simple and log more stuff (+0.0.1)
 * Better NPM integration, publish on NPM (+0.0.1)
 */
log.info('node-np v' + VERSION);

var DBCONFIG = {
  driver: 'json',
  file: 'mappings.json'
};

var config = require('./config.json');
if (config && config.apikey) APIKEY = config.apikey;
else APIKEY = '4c563adf68bc357a4570d3e7986f6481';

var coffea = require('coffea'),
    net    = require('net'),
    db     = require('./db_' + DBCONFIG.driver)(DBCONFIG);

var clients = [];
config.networks.forEach(function (network) {
  var id = clients.length;
  clients.push(
    coffea(
      net.connect({
        host: network.address,
        port: network.port
      })
    )
  );
  clients[id].config = network;
});

// bot begins here

var LastFmNode = require('lastfm').LastFmNode;

var lastfm = new LastFmNode({
  api_key: APIKEY
});

clients.forEach(function (client) {
  client.nick(client.config.nick);
  client.user(client.config.nick, client.config.nick);

  client.on('motd', function (motd) {
    if (client.config && client.config.nickserv) {
      client.send('NickServ', 'IDENTIFY ' + client.config.nickserv);
    }

    client.join(client.config.channels);
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

          var str = 'Comparing \'\x02' + nick1 + '\x02\' with \'\x02' + nick2 + '\x02\': ';
          str += '\x02';
          if (score < 25) str += '\x0301';
          else if (score < 50) str += '\x0305';
          else if (score < 75) str += '\x0304';
          else if (score < 90) str += '\x0308';
          else str += '\x0303';
          str += score + '%';
          str += '\x02\x03';

          if (artists) {
            for (var i=0; i < artists.length; i++) {
              if (artists[i].name) {
                if (i == 0) str += ' - Common artists include: ';

                str += '\x0310\x02' + artists[i].name + '\x02\x03';

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

  function getRecentTrack(nick, callback) {
    lastfm.request('user.getRecentTracks', {
      user: nick,
      limit: 1,
      handlers: {
        success: function (data) {
          if (data.recenttracks.hasOwnProperty('track')) {
            var track = (data.recenttracks.track instanceof Array) ? data.recenttracks.track[0] : data.recenttracks.track;
            var now_playing = track.hasOwnProperty('@attr') && track['@attr'].nowplaying === 'true';
            lastfm.request('track.getInfo', {
              mbid: track.mbid,
              track: track.name,
              artist: track.artist['#text'],
              username: nick,
              handlers: {
                success: function (data) {
                  var track = data.track;

                  if (now_playing) {
                    var str = '\'\x02' + nick + '\x02\' is now playing: ';
                  } else {
                    var str = '\'\x02' + nick + '\x02\' is not listening to anything right now. The last played track was: ';
                  }

                  if (track.artist && track.artist.name) str += '\x037\x02' + track.artist.name + '\x02\x03 - ';

                  if (track.album && track.album.title) str += '\x037\x02' + track.album.title + '\x02\x03 - ';

                  str += '\x037\x02' + track.name + '\x02\x03';

                  if (track.userloved && (track.userloved !== '0')) str += ' [\x0304<3\x03 - ';
                  else if (track.userplaycount) str += ' [';

                  if (track.userplaycount) str += 'playcount \x02' + track.userplaycount + 'x\x02]';
                  else if (track.userloved && (track.userloved !== '0')) str += 'playcount \x020x\x02]'; // this shouldn't happen unless the user loves a track with no plays (and who would do that?)

                  if (track.toptags) {
                    var tags = (track.toptags instanceof Array) ? track.toptags : [track.toptags];
                    for (var i=0; i < tags.length; i++) {
                      if (tags[i].tag && tags[i].tag.name) {
                        if (i == 0) str += ' (';

                        str += '\x0310\x02' + tags[i].tag.name + '\x02\x03';

                        if (i != tags.length-1) str += ', ';
                        else str += ')';
                      }
                    }
                  }

                  if (track.duration) {
                    var secs = (track.duration / 1000); // ms to sec
                    var mins = Math.floor(secs / 60); // sec to min
                    secs = Math.round(((secs / 60) - mins) * 60); // remaining seconds
                    str += ' [\x037\x02';
                    if (mins < 10) str += '0';
                    str += mins + ':';
                    if (secs < 10) str += '0';
                    str += secs;
                    str += '\x02\x03]';
                  }

                  callback(str);
                },
                error: function (err) {
                  callback(err.message);
                }
              }
            });
          } else {
            callback('\'' + nick + '\' hasn\'t scrobbled any tracks yet.');
          }
        },

        error: function (err) {
          callback(err.message);
        }
      }
    });
  }

  client.on('privatemessage', function(event) {
    var args = event.message.split(' ');

    // admin commands
    if (event.user.getNick() == client.config.admin) {
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
            np(event.user, key);
          }
          break;
        default:
          client.send(event.user, 'I don\'t understand you');
          break;
      }
    }
  });

  function np(to, nick) {
    var resolved_nick = db.get(nick, nick);
    if (resolved_nick == nick) db.set(nick, nick); // store this nick for wp command
    getRecentTrack(resolved_nick, function(msg) {
      client.send(to, msg);
    });
  }

  function compare(to, nick1, nick2) {
    compareUsers(db.get(nick1, nick1), db.get(nick2, nick2), function(msg) {
      client.send(to, msg);
    });
  }

  client.on('message', function(event) {
    if (event.message.match(/\(np\)/g) || event.message.match(/lastfm:np/g)) np(event.channel, event.user.getNick());
    if (event.message.substr(0, 1) == client.config.prefix) {
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
            client.send(event.channel, '\'' + event.user.getNick() + '\' is now associated with http://last.fm/user/' + args[1]); // TODO: check if last.fm user exists?
          } else {
            client.send(event.channel, client.config.prefix + 'setuser needs a last.fm username');
          }
          break;
        case 'help':
          client.send(event.channel, 'I am a last.fm bot. Use "' + client.config.prefix + 'setuser LAST_FM_NICK" to associate your irc nick with your last.fm account. Then run "' + client.config.prefix + 'np"');
          break;
        case 'np':
          if (args.length > 1) {
            np(event.channel, args[1]);
          } else {
            np(event.channel, event.user.getNick());
          }
          break;
        case 'compare':
          if (args.length > 2) {
            compare(event.channel, args[1], args[2]);
          } else if (args.length > 1) {
            compare(event.channel, event.user.getNick(), args[1]);
          } else {
            client.send(event.channel, 'Use "' + client.config.prefix + 'compare NICK" or "' + client.config.prefix + 'compare NICK1 NICK2"');
          }
      }
    }
  });
});
