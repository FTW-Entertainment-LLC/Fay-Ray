require('../models/Episode.js');
/**
 * Constructs the botsan object
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.0.0
 * @param {boolean} [host=null]
 * @param {boolean} [clean=null]
 * @constructor
 * @property {Object} FeedParser
 * @property {Object} request
 * @property {Object} async
 * @property {Object} WebTorrent
 * @property {Object} fs
 * @property {Object} ini
 * @property {Object} spawn
 * @property {Object} exec
 * @property {Object} path
 * @property {Object} colors
 * @property {Object} events
 * @property {Object} FClient             - FTP Client
 * @property {Object} moment
 * @property {Object} readline
 * @property {Object} os
 * @property {Object} retry
 * @property {Object} date
 * @property {Object} tclient             - WebTorrent client
 * @property {Object[]} nyaa_queue
 * @property {Object[]} torrent_queue
 * @property {string[]} in_torrent_queue
 * @property {Object[]} downloaded_list
 * @property {Object[]} cleanup_queue
 * @property {Object[]} host              - From param host
 * @property {Object} myEmitter           - Event emitter
 * @property {Object} discord
 * @property {Object[]} application_status
 * @property {Object[]} episode_status
 * @property {Object[]} last_refresh
 * @property {Object} config
 * @property {Object[]} anime_list
 */
function Botsan(host, clean) {
  "use strict";
  this.FeedParser = require('feedparser')
  this.request = require('request');
  this.async = require('async');
  this.WebTorrent = require('webtorrent');
  this.fs = require('fs');
  this.ini = require('ini');
  this.spawn = require('child_process').spawn;
  this.exec = require('child_process').exec;
  this.path = require('path');
  this.colors = require('colors');
  this.events = require("events");
  this.FClient = require('ftp');
  this.moment = require('moment');
  const readline = require('readline');
  this.os = require('os');
  //TODO change to async retry
  this.retry = require('retry');
  this.date = new Date();
  this.tclient = new this.WebTorrent();
  this.nyaa_queue = null;
  this.torrent_queue = null;
  this.in_torrent_queue = [];
  this.downloaded_list = [];
  this.cleanup_queue = this.async.queue(deleteFile, 1);
  this.host = host;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const EventEmitter = require('events');
  class MyEmitter extends EventEmitter {
  }
  this.myEmitter = new MyEmitter();

  //Discord
  const Discord = require('discord.io');
  this.discord = new Discord.Client({
    token: "MjQ1ODM3NDA2MzE2NjU4Njkw.CwR6kw.7Jijdp9wStlmzwMqvqnUCyNQ4TY",
    autorun: true
  });
  this.discord.on('ready', function (event) {
    console.log('Logged in as %s - %s\n', this.username, this.id);
  });


  //These variables are for the console output only. Handled by the functions UpdateData, UpdateAppData and writeData
  this.application_status = [];
  this.episode_status = [];
  this.last_refresh = 0;

  //Config
  this.config;
  this.anime_list;

  this.loadSettings();

  const Control = require('./control.js');
  let control = null;
  if (host) {
    control = new Control(this);
  }

  //Starts the queue on start, and then once every hour.
  if (clean) {
    this.checkCleanup();
    const botsan = this;
    const minutes = 60, the_interval = minutes * 60 * 1000;
    setInterval(function () {
      botsan.checkCleanup();
    }, the_interval);
  }
  rl.on('SIGCONT', () => {
    this.writeData();
  });

}
/**
 * Download object
 * TODO: This is a model
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.0.0
 * @param {number} uploadsID  - Uploads board ID, all series are identified
 * by this number. For more info this can be matched from the anime object.
 * @param {string} filename   - Filename/Path of the downloaded file
 * @param {number} episodeno  - Episode number
 */
Botsan.prototype.downloaded = function downloaded(uploadsID, filename, episodeno) {
  this.uploadsID = uploadsID;
  this.filename = filename;
  this.episodeno = episodeno;
};
/**
 * Check if this is used? Otherwise remove. Looks like old code that's remained.
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.0.0
 * @param uploadsID
 * @param filename
 * @param episodeno
 * @param quality
 * @deprecated
 */
//TODO: Check if this is used? Otherwise remove. Looks like old code that's remained.
Botsan.prototype.transcode = function transcode(uploadsID, filename, episodeno, quality) {
  this.uploadsID = uploadsID; //Uploads board ID, all series are identified by this number.
  //For more info this can be matched from the anime object.
  this.filename = filename; //Filename
  this.episodeno = episodeno; //Episode number
  this.quality = quality; //Quality
};

/**
 * Returns the status of a episode
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.0.0
 * @param {Object} Obj
 * @returns {(null|Object[])}
 */
Botsan.prototype.getDataStatus = function getDataStatus(Obj) {
  for (i = 0; i < this.episode_status.length; i++) {
    //If there's a torrenturl, then identify the episode by the torrenturl. Otherwise do it by the title, which is used as filename in Fay.js
    //Ray uses the torrenturl, and title is the anime title.
    if ((Obj.torrenturl == null && this.episode_status[i].Episode.title == Obj.title) ||
      (Obj.torrenturl != null && this.episode_status[i].Episode.torrenturl == Obj.torrenturl)) {
      return this.episode_status[i].Status;
    }
  }
  return null;
}

/**
 * TODO: Is this replacable by a javascript function?
 * Replaces a string in an array
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.0.0
 * @param {string[]} array    - The array
 * @param {string} oldstring  - The string that should be replaced
 * @param {string} newstring  - What the string should be replaced as
 */
Botsan.prototype.replaceStrInArr = function replaceStrInArr(array,
                                                            oldstring,
                                                            newstring) {
  var index = array.indexOf(oldstring);
  if (index >= 0) {
    array[index] = newstring;
  }
}

/**
 * Removes string from an array
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.0.0
 * @param {string[]} array
 * @param {string} string
 */
Botsan.prototype.removeStrFromArr = function replaceStrInArr(array, string) {
  if (!Array.isArray(array))
    return;
  var index = array.indexOf(string);
  if (index >= 0) {
    array.splice(index, 1);
  }
}

/**
 * Returns object's filename
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.0.0
 * @param {Object[]} arr
 * @param {string} arr.filename
 * @param {string} filename
 * @returns {(null|Object)}
 */
Botsan.prototype.getObjByFilename = function getObjByFilename(arr, filename) {
  var found = null;
  for (i = 0; i < arr.length; i++) {
    if (arr[i].filename == filename) {
      found = arr[i];
      break;
    }
  }
  return found;
}
/**
 * TODO: Console model
 * This updates or adds the episode console obj to the which is used to refresh the
 * console.
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.0.0
 * @param {Object} Obj
 * @returns {number}
 */
Botsan.prototype.updateData = function updateData(Obj) {
  var found = false;
  var counter;
  Obj.time = new Date().toISOString();
  for (var i = 0; i < this.episode_status.length; i++) {
    //If there's a torrenturl, then identify the episode by the torrenturl. Otherwise do it by the title, which is used as filename in Fay.js
    //Ray uses the torrenturl, and title is the anime title.
    if ((Obj.torrenturl == null && this.episode_status[i].Episode.title == Obj.Episode.title) ||
      (Obj.torrenturl != null && this.episode_status[i].Episode.torrenturl == Obj.Episode.torrenturl)) {
      this.episode_status[i].Progress = Obj.Progress;
      this.episode_status[i].Status = Obj.Status;
      found = true;
      break;
    }
  }


  if (found == false) {
    this.episode_status.push(Obj);
    this.episode_status.sort(this.compareEpisodeData);
  }
  this.writeData();
  return i;
}
/**
 * Clears a episode console obj
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.0.0
 * @param {Object} Obj
 */
Botsan.prototype.clearData = function clearData(Obj) {
  for (i = 0; i < this.episode_status.length; i++) {
    if ((Obj.torrenturl == null && this.episode_status[i].Episode.title == Obj.title) ||
      (Obj.torrenturl != null && this.episode_status[i].Episode.torrenturl == Obj.torrenturl)) {
      this.episode_status.splice(i, 1);
      break;
    }
  }
}
/**
 * Updates or adds a application console obj
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.0.0
 * @param {Object} Obj
 */
Botsan.prototype.updateAppData = function updateAppData(Obj) {
  var index = -1;
  var counter;
  Obj.time = this.getTime();
  this.application_status.forEach(function (i) {
    if (i.id == Obj.id) {
      i.message = Obj.message;
      i.time = Obj.time;
      index = counter;
    }
    counter++;
  });

  if (index == -1) {

    this.application_status.push(Obj);
    this.application_status.sort(this.compareAppData);
  }
  this.writeData();
}

/**
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.0.0
 * @returns {string}
 */
Botsan.prototype.getTime = function getTime() {
  var d = new Date();
  d.setUTCHours(d.getUTCHours() + 2);
  return d.toISOString().replace(/T/, ' ').replace(/\..+/, '');
}

/**
 * Starts the console
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.0.0
 */
Botsan.prototype.startConsole = function startConsole() {
  var t = this;
  t.writeData();
  setInterval(function () {
    t.writeData();
  }, 5000);
}
/**
 * Outputs the console data.
 * TODO: Change function name to output
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.0.0
 */
Botsan.prototype.writeData = function writeData() {
  var now = new Date().getTime();
  var last_refresh = this.last_refresh;
  if (last_refresh + 200 < now) {
    this.last_refresh = now;
  } else {
    return;
  }

  /*if (this.os.platform() == "win32") {
   process.stdout.write("\u001b[2J\u001b[0;0H");
   }
   else if (this.os.platform() == "linux") {
   process.stdout.write('\033[2J\033[1;1H');
   }*/

  process.stdout.write('\x1Bc'); //TODO: Check if this works on linux

  this.application_status.forEach(function (i) {
    console.log("(" + i.time + ")  " + i.message);
  });
  if (this.application_status.length > 0) {
    console.log();
  }
  this.episode_status.forEach(function (i) {
    var showprogress = "";
    if (i.Status == "Downloading" || i.Status == "Starting Download") {
      showprogress = "(" + i.Progress + "%)";
    }
    var ep = "";
    if (i.Episode.episodeno)
      ep = i.Episode.episodeno;
    if (Array.isArray(i.Status)) {
      i.Status.forEach(function (i2) {
        console.log(i.Episode.parent.title, ep, "-", i2, showprogress);
      });
    } else {
      console.log(i.Episode.parent.title, ep, "-", i.Status, showprogress);
    }


  });

  this.myEmitter.emit('writeData');

}
/**
 * Compares application output obj
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.0.0
 * @param {Object} a
 * @param {Object} b
 * @returns {number}
 */
Botsan.prototype.compareAppData = function compareAppData(a, b) {
  if (a.id < b.id)
    return -1;
  if (a.id > b.id)
    return 1;
  return 0;
}

/**
 * Comapres episode output obj
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.0.0
 * @param {Object} a
 * @param {Object} b
 * @returns {number}
 */
Botsan.prototype.compareEpisodeData = function compareEpisodeData(a, b) {
  if (a.Episode.title < b.Episode.title)
    return -1;
  if (a.Episode.title > b.Episode.title)
    return 1;
  if (a.Episode.episodeno < b.Episode.episodeno)
    return -1;
  if (a.Episode.episodeno > b.Episode.episodeno)
    return 1;
  return 0;
}

/**
 * Logs error and send them to discord
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.1.0
 * @param err
 */
Botsan.prototype.logError = function logError(err) {

  var message = "";

  if (typeof err === 'object') {
    if (err.message) {
      message += `\r\nMessage: ${err.message}`;
    }
    if (err.code) {
      message += `\r\nCode: ${err.code}`;
    }
    if (err.statusCode) {
      message += `\r\nstatusCode: ${err.code}`;
    }
    if (err.stack) {
      message += '\r\nStacktrace:\r\n';
      message += '====================\r\n';
      message += err.stack + "\r\n";
    }
  } else {
    message += err + 'dumpError :: argument is not an object\r\n';
  }

  //Todo:
  //Check size of error log,
  //If it's larger than a certain size,
  //Create a new one.

  this.fs.appendFile('./error.txt', this.getTime() + ":" + message + "\r\n\r\n", function (err) {
    if (err) throw err;

    console.log('The "', err, '" was appended to file!');
  });

  this.sendNotification(message, true);
}
/**
 * Adds a new series to the torrent queue.
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.1.0
 * @param {Object} series   - Anime Object
 * @returns {boolean}
 */
Botsan.prototype.addNewSeries = function addNewSeries(series) {
  if (this.getAnimeById(series.uploadsID))
    return false;
  //TODO: If series has a torrenturl, check all other series if they have a similar torrenturl. If they do, do not allow anime to be added.

  this.anime_list.push(series);
  if (!series.torrenturl) {
    this.nyaa_queue.push(series);
  } else {
    var e = new Episode(null, series.torrenturl, null, series); //Parse the episode number to a integer.
    this.in_torrent_queue.push(e.torrenturl);
    this.torrent_queue.push(e, function () {
      //Remove the episode from the in_queue when done.
      this.in_torrent_queue.splice(in_torrent_queue.indexOf(e.torrenturl), 1);
    });
  }

  this.saveSettings(this.anime_list);
  return true;
}

/**
 * Loads all settings
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.1.0
 */
Botsan.prototype.loadSettings = function loadSettings() {
  if (this.fs.existsSync(this.path.normalize("./savefile.json"))) {
    try {
      this.anime_list = JSON.parse(this.fs.readFileSync('./savefile.json', 'utf8'));
    } catch (e) {
      this.logError(e);
    }
  }
  if (this.fs.existsSync(this.path.normalize("./downloaded.json"))) {
    try {
      this.downloaded_list = JSON.parse(this.fs.readFileSync('./downloaded.json', 'utf8'));
    } catch (e) {
      this.logError(e);
    }
  }

  if (this.fs.existsSync(this.path.normalize("./config.ini"))) {
    this.config = this.ini.parse(this.fs.readFileSync('./config.ini', 'utf-8'));
  } else {
    console.error("No config.ini file found!");
  }
  if (this.fs.existsSync(this.path.normalize("./downloaded.json"))) {
    try {
      this.downloaded_list = JSON.parse(this.fs.readFileSync('./downloaded.json', 'utf8'));
    } catch (e) {
      this.logError(e);
    }
  }
  this.config.paths.downloads = this.path.normalize(this.config.paths.downloads)
  if (!this.fs.existsSync(this.config.paths.downloads)) {
    this.fs.mkdirSync(this.config.paths.downloads);
  }
  this.config.paths.temp = this.path.normalize(this.config.paths.temp)
  if (!this.fs.existsSync(this.config.paths.temp)) {
    this.fs.mkdirSync(this.config.paths.temp);
  }
  if (!this.fs.existsSync('./rays_data')) {
    this.fs.mkdirSync('./rays_data');
  }

  this.config.paths.outputfolder = this.path.normalize(this.path.resolve(this.config.paths.outputfolder))
  if (!this.fs.existsSync(this.config.paths.outputfolder)) {
    this.fs.mkdirSync(this.config.paths.outputfolder);
  }
  this.myEmitter.emit('ready');
}

/**
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.0.0
 * @param {Object[]} anime_list     - Anime obj array list
 */
Botsan.prototype.saveSettings = function saveSettings(anime_list) {
  var outputFilename = this.path.normalize('./savefile.json');

  this.fs.writeFile(outputFilename, JSON.stringify(anime_list, null, 4), function (err) {
    if (err) {
      logError(err);
      console.log(err);
    } else {
    }
  });
}
/**
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.0.0
 * @param {Object[]} downloaded_list
 * @param callback
 */
Botsan.prototype.writeDownloads = function writeDownloads(downloaded_list, callback) {
  var outputFilename = this.path.normalize('./downloaded.json');
  this.fs.writeFile(outputFilename, JSON.stringify(downloaded_list, null, 4), function (err, test) {
    if (err) {
      this.logError(err);
      console.log(err);
    }
    callback();
  });
}
/**
 * Writes the object array to transcodes.json
 * I don't think I'm using this, why's this here?
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.1.0
 * @param {Object[]} transcodes_list  - Object array
 * @param {function} callback         - Callback when done
 */
Botsan.prototype.writeTranscodes = function writeTranscodes(transcodes_list, callback) {
  var outputFilename = this.path.normalize('./transcodes.json');
  this.fs.writeFile(outputFilename, JSON.stringify(transcodes_list, null, 4), function (err) {
    if (err) {
      this.logError(err);
      console.log(err);
    }
    callback();
  });

}
/**
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.0.0
 * @param {string} filename   - Filename
 * @param {string} json       - JSON string
 * @returns {(Object|null)}
 */
Botsan.prototype.getDownloadFromFile = function getDownloadFromFile(filename, json) {
  var data = require(json);
  for (var key in data) {
    if (data[key].filename == filename) {
      return data[key];
    }
  }
  return null;

}
/**
 * Returns a download by matching uploads id and episode number.
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.0.0
 * @param {string} uploadsID  - AnimeFTW Uploads board ID
 * @param {number} epno       - Episode number
 * @returns {(null|Object)}
 */
Botsan.prototype.getDownload = function getDownload(uploadsID, epno) {
  for (var i = 0; i < this.downloaded_list.length; i++) {
    if (this.downloaded_list[i].uploadsID == uploadsID && this.downloaded_list[i].episodeno == epno) {
      return this.downloaded_list[i];
    }
  }
  return null;
}
/**
 * Creates a filename for animeftw
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.0.0
 * @param {string} prefix
 * @param {number} episode
 * @param {number} resolution   - 480, 720 or 1080
 * @returns {(null|string)}
 */
Botsan.prototype.createFilename = function createFilename(prefix, episode, resolution) {
  if (!prefix)
    return null;
  if (!episode)
    return null;
  if (!resolution)
    return null;

  var res = "";
  if (resolution > 480) {
    res = `_${resolution}p`;
  }
  return `${prefix}${res}_${episode}_ns.mp4`;
}

/**
 * Sends notification to Discord.
 * Should be replaced to just update on the uploads board in the future
 * Then the uploads board will notify discord for changes.
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.0.0
 * @param {string} message
 * @param {boolean} error
 * @returns {boolean}       - True on success, false on fail
 */
Botsan.prototype.sendNotification = function sendNotification(message, error) {
  if (this.config === undefined || !this.config.settings.NOTIFICATIONS) {
    return false;
  }
  var channel = "245289486295105546";
  if (error) {
    channel = "245572944598794240";
  }
  var discord = this.discord;
  var operation = this.retry.operation({retries: 2, minTimeout: 3000});
  operation.attempt(function (currentAttempt) {
    discord.sendMessage({
      to: channel,
      message: message
    }, function (err) {
      if (operation.retry(err)) {
        return false;
      }
      return true;
    });
  });


}
/**
 * Function for saving users. Used for the admin placeholder site to
 * track who submits what.
 * @param {Object} users
 */
Botsan.prototype.saveUsers = function saveUsers(users) {
  this.fs.writeFile("./users.json", JSON.stringify(users, null, 4), function (err) {
    if (err) {
      throw err;
    }
  });
}

/**
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.0.0
 * @param {number} id
 * @returns {(null|Object)}
 */
Botsan.prototype.getAnimeById = function getAnimeById(id) {
  for (var key in this.anime_list) {
    if (this.anime_list[key].uploadsID == id) {
      return this.anime_list[key];
    }
  }
  return null;
}

/**
 * This function creates the path except the last segment.
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.1.0
 * @param {string} path
 */
Botsan.prototype.createFoldersForFile = function createFoldersForFile(path) {
  var separated = this.path.normalize(path).split(this.path.sep);
  var pathnow = "";
  //Loop the whole list except the last one.
  for (var i = 0; i < separated.length - 1; i++) {
    var pathnow = this.path.join(pathnow, separated[i]);
    try {
      // Query the entry
      stats = this.fs.lstatSync(pathnow);
    }
    catch (e) {
      if (e.code == 'ENOENT') {
        this.fs.mkdirSync(pathnow);
      }

    }

  }
}
/**
 * Callback function for fs.stat, cleans the downloaded.json array and files.
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.1.0
 * @param {string} file
 * @param {object} download
 * @param {Botsan} botsan
 */
function statCallbackFile(file, download, botsan) {
  //Creates a scope to hold the variable file for fs.stat callback.
  return function (err, stat) {
    if (err) {
      if (err.code == 'ENOENT') {
        //Cleanup will delete it from the downloaded.json file.
        botsan.cleanup_queue.push({
          botsan: botsan,
          file: file,
          download: download
        });
      } else {
        botsan.logError(err);
      }
      return;
    }
    const startDate = botsan.moment(stat.ctime);
    const endDate = botsan.moment();
    const diff = endDate.diff(startDate, 'weeks')
    if (diff > 0) {
      botsan.cleanup_queue.push({
        botsan: botsan,
        file: file,
        download: download
      });
    }
  }
}


/**
 * Loops through the downloaded list and checks if it's time to clean up files.
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.0.1
 * @return {void}
 */
Botsan.prototype.checkCleanup = function checkCleanup() {
  for (let i = 0; i < this.downloaded_list.length; i++) {
    const file = this.path.normalize(`${this.config.paths.downloads}/${this.downloaded_list[i].filename}`);
    this.fs.stat(file, statCallbackFile(file, this.downloaded_list[i], this));
  }
}
/**
 * Logs a string to log.txt
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.0.1
 * @param {string} str
 */
Botsan.prototype.log = function log(str) {
  //Todo:
  //Check size of log,
  //If it's larger than a certain size,
  //Create a new one.
  this.fs.appendFile('./log.txt', str, function (err) {
    if (err) this.logError(err);
  });
  console.log(str);
}

/**
 * Callback for deleting a file
 * @callback deleteFileCallback
 */

/**
 * Deletes a file.
 * @author Hani Mayahi <hani.mayahi94@gmail.com>
 * @since 1.0.1
 * @param {Object} fileObj
 * @param {deleteFileCallback} callback
 */
function deleteFile(fileObj, callback) {
  const index = fileObj.botsan.downloaded_list.indexOf(fileObj.download);
  if (index > -1) {
    fileObj.botsan.downloaded_list.splice(index, 1);
    delete fileObj.download;
    fileObj.botsan.fs.unlink(fileObj.file, function (err) {
      if (err) {
        if (err.code != 'ENOENT') {
          //Only log errors if it's not ENOENT, if the file doesn't exist then just remove it from the downloaded_list
          fileObj.botsan.logError(err);
        }
      }

      fileObj.botsan.writeDownloads(fileObj.botsan.downloaded_list, callback);
    })

  }

}

module.exports = Botsan;
