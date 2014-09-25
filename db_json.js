// simple json database driver for javascript
// reinventing the wheel - because why not? *shrugs*

var fs = require('fs');

// TODO: this fails when the file exists but has invalid data/is empty

function DB_JSON(config, do_not_load) {
  if (config.file) this.file = config.file;
  else this.file = 'DB_JSON.json';

  if (config.data) this.data = config.data;
  else this.data = '{}';

  this.storage = '{}';

  if (!do_not_load) {
    var _this = this;
    this.load(function(err) {
      if (err) console.error('[DB_JSON] Error:', err);
      else console.log('[DB_JSON] initialized');
    });
  }
}

DB_JSON.prototype.load = function(callback) {
  // TODO: if storage already has something, merge the new storage data into the existing storage data
  // TODO: add reload parameter/function that overwrites the current storage data
  var _this = this;
  fs.exists(this.file, function(exists) {
    if (!exists) {
      fs.writeFile(_this.file, _this.data, function (err) {
        if (err) {
          if (callback) callback(err);
        } else {
          _this.storage = _this.data;
          if (callback) callback();
        }
      });
    } else {
      fs.readFile(_this.file, 'utf8', function(err, data) {
        if (err) {
          if (callback) callback(err);
        } else {
          try {
            _this.storage = JSON.parse(data);
            if (callback) callback();
          } catch (err_) {
            if (callback) callback(err_);
          }
        }
      });
    }
  });
};

DB_JSON.prototype.flush = function(callback) {
  try {
    data = JSON.stringify(this.storage);
  } catch (err) {
    throw Error('[DB_JSON] This shouldn\'t happen unless someone fucked with the storage data A LOT.');
  }

  fs.writeFile(this.file, data, function(err) {
    if (!callback) {
      if (err) throw err;
    } else {
      if (err) callback(err);
      else callback();
    }
  });
};

DB_JSON.prototype.set = function(key, value) {
  this.storage[key.toLowerCase()] = value;
};

DB_JSON.prototype.get = function(key, default_value) {
  if (default_value) {
    if (!this.exists(key)) return default_value;
  }
  return this.storage[key.toLowerCase()];
};

DB_JSON.prototype.del = function(key) {
  delete this.storage[key.toLowerCase()];
};

DB_JSON.prototype.count = function() {
  return Object.keys(this.storage).length;
};

DB_JSON.prototype.exists = function(key) {
  return key.toLowerCase() in this.storage;
};

DB_JSON.prototype.dump = function() {
  return JSON.stringify(this.storage);
};

DB_JSON.prototype.dumpRaw = function() {
  return this.storage;
};

module.exports = function(config) {
  return new DB_JSON(config);
};
