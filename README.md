node-np
=======

_standalone last.fm bot written in node.js_

__NOTE: This branch uses ES6 proxies, make sure to run your programs with the `--harmony_proxies` flag and ideally on the latest io.js version (that's what I'm testing with): `node --harmony_proxies script.js`__


Requirements
------------

You need to have node.js and npm installed.


Installation
------------

Download node-np from github: `git clone https://github.com/omnidan/node-np`.

Install dependencies: Run `npm install` in the node-np directory.


Configuration
-------------

_NOTE: In 0.5 `address` is now called `host` to work with the new coffea library._

Now create a `config.json` file in the node-np directory. It should look like
the example below. More networks can be added. (Config is JSON format)
```
{
  "networks": [
    {
      "host": "localhost",
      "port": 6667,
      "channels": ["#lounge"],
      "nick": "np",
      "admin": "dan",
      "adminNickServ": false,
      "prefix": "."
    }
  ],
  "maxTags": 4,
  "debug": false
}
```

If something doesn't work, please set `debug` to `true` and include the logs in your bug report.

Setting `adminNickServ` to `true` will do a whois and check the nickserv account of the user.

As of 0.5, `admin` can be an array too, so you can specify multiple admins for node-np.

As of 0.5.2, you can set `maxTags`, which limits the amount of tags that will be shown. Default: 4


Running
-------

Simply run `node main.js` and the bot should connect to the configured networks.
