node-np
=======

_standalone last.fm bot written in node.js_


Requirements
------------

You need to have node.js and npm installed.


Installation
------------

Download node-np from github: `git clone https://github.com/omnidan/node-np`.

Install dependencies: Run `npm install` in the node-np directory.


Configuration
-------------

Now create a `config.json` file in the node-np directory. It should look like
the example below. More networks can be added. (Config is JSON format)
```
{
  "networks": [
    {
      "address": "localhost",
      "port": 6667,
      "channels": ["#lounge"],
      "nick": "np",
      "admin": "dan",
      "prefix": "."
    }
  ]
}
```


Running
-------

Simply run `node main.js` and the bot should connect to the configured networks.
