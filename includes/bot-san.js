function Botsan() {
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
    this.os = require('os');
    this.retry = require('retry');
    this.date = new Date();
    this.tclient = new this.WebTorrent();
    this.nyaa_queue = null;

    const EventEmitter = require('events');
    class MyEmitter extends EventEmitter {
    }
    this.myEmitter = new MyEmitter();

    //Discord
    var Discord = require('discord.io');
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

    var Control = require('./control.js');
    var control = new Control(this);
}

Botsan.prototype.Episode = function Episode(title, torrenturl, episodeno, parent) {
    this.title = title; //The title of the nyaa listing
    this.episodeno = episodeno; // Episode number of the nyaa listing
    this.torrenturl = torrenturl; //Torrent url of the nyaa listing
    this.parent = parent; //Reference to the anime object.
};

Botsan.prototype.anime = function anime(title, prefix, regex, nyaasearch, nyaauser, uploadsID, quality, finished_episodes) {
    this.title = title; //Anime title
    this.prefix = prefix; //AnimeFTW prefix
    this.regex = regex; //Regex to match the nyaa entries and group episode number.
    this.nyaasearch = nyaasearch; //Nyaa search field
    this.nyaauser = nyaauser; //Nyaa user to use search in
    this.uploadsID = uploadsID; // uploads board ID
    this.quality = quality; //Quality for the series to be encoded in. Can be 480, 720 or 1080.
    this.finished_episodes = [];
    if (finished_episodes) {
        this.finished_episodes = finished_episodes;
    }

};

Botsan.prototype.downloaded = function downloaded(uploadsID, filename, episodeno) {
    this.uploadsID = uploadsID; //Uploads board ID, all series are identified by this number.
    //For more info this can be matched from the anime object.
    this.filename = filename; //Filename
    this.episodeno = episodeno; //Episode number
};

//TODO: Check if this is used? Otherwise remove. Looks like old code that's remained.
Botsan.prototype.transcode = function transcode(uploadsID, filename, episodeno, quality) {
    this.uploadsID = uploadsID; //Uploads board ID, all series are identified by this number.
    //For more info this can be matched from the anime object.
    this.filename = filename; //Filename
    this.episodeno = episodeno; //Episode number
    this.quality = quality; //Quality
};

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

Botsan.prototype.replaceStrInArr = function replaceStrInArr(array, oldstring, newstring) {
    var index = array.indexOf(oldstring);
    if (index >= 0) {
        array[index] = newstring;
    }
}

Botsan.prototype.removeStrFromArr = function replaceStrInArr(array, string) {
    if (!Array.isArray(array))
        return;
    var index = array.indexOf(string);
    if (index >= 0) {
        array.splice(index, 1);
    }
}

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

Botsan.prototype.updateData = function updateData(Obj) {
    var index = -1;
    var counter;
    Obj.time = new Date().toISOString();
    var correctEpisode = null;
    this.episode_status.forEach(function (i) {
        if (correctEpisode != null)
            return false;

        //If there's a torrenturl, then identify the episode by the torrenturl. Otherwise do it by the title, which is used as filename in Fay.js
        //Ray uses the torrenturl, and title is the anime title.
        if ((Obj.torrenturl == null && i.Episode.title == Obj.Episode.title) ||
            (Obj.torrenturl != null && i.Episode.torrenturl == Obj.Episode.torrenturl)) {
            i.Progress = Obj.Progress;
            i.Status = Obj.Status;
            index = counter;
            correctEpisode = i;
        }

        counter++;
    });


    if (index == -1) {
        this.episode_status.push(Obj);

        this.episode_status.sort(this.compareEpisodeData);
    }
    this.writeData();
    return true;
}

Botsan.prototype.clearData = function clearData(Obj) {
    for (i = 0; i < this.episode_status.length; i++) {
        if ((Obj.torrenturl == null && this.episode_status[i].Episode.title == Obj.title) ||
            (Obj.torrenturl != null && this.episode_status[i].Episode.torrenturl == Obj.torrenturl)) {
            this.episode_status.splice(i, 1);
            break;
        }
    }
}

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

Botsan.prototype.getTime = function getTime() {
    var d = new Date();
    d.setUTCHours(d.getUTCHours() + 2);
    return d.toISOString().replace(/T/, ' ').replace(/\..+/, '');
}

Botsan.prototype.startConsole = function startConsole() {
    var t = this;
    setInterval(function () {
        t.writeData();
    }, 5000);
}

Botsan.prototype.writeData = function writeData() {
    var now = new Date().getTime();
    var last_refresh = this.last_refresh;
    if (last_refresh + 200 < now) {
        this.last_refresh = now;
    } else {
        return;
    }

    if (this.os.platform() == "win32") {
        process.stdout.write("\u001b[2J\u001b[0;0H");
    }
    else if (this.os.platform() == "linux") {
        process.stdout.write('\033[2J\033[1;1H');
    }

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
        if (Array.isArray(i.Status)) {
            i.Status.forEach(function (i2) {
                console.log(i.Episode.parent.title, i.Episode.episodeno, "-", i2, showprogress);
            });
        } else {
            console.log(i.Episode.parent.title, i.Episode.episodeno, "-", i.Status, showprogress);
        }


    });

    this.myEmitter.emit('writeData');

}

Botsan.prototype.compareAppData = function compareAppData(a, b) {
    if (a.id < b.id)
        return -1;
    if (a.id > b.id)
        return 1;
    return 0;
}

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

Botsan.prototype.addNewSeries = function addNewSeries(series) {
    if (this.getAnimeById(series.uploadsID))
        return false;

    this.anime_list.push(series);
    this.nyaa_queue.push(series);
    this.saveSettings(this.anime_list);
    return true;
}

Botsan.prototype.loadSettings = function loadSettings() {
    if (this.fs.existsSync(this.path.normalize("./savefile.json"))) {
        try {
            this.anime_list = JSON.parse(this.fs.readFileSync('./savefile.json', 'utf8'));
        } catch (e) {
            this.logError(e);
        }
    }
    if (this.fs.existsSync(this.path.normalize("./config.ini"))) {
        this.config = this.ini.parse(this.fs.readFileSync('./config.ini', 'utf-8'));
    } else {
        console.error("No config.ini file found!");
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

    this.config.paths.outputfolder = this.path.normalize(this.config.paths.outputfolder)
    if (!this.fs.existsSync(this.config.paths.outputfolder)) {
        this.fs.mkdirSync(this.config.paths.outputfolder);
    }
}

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

Botsan.prototype.writeDownloads = function writeDownloads(downloaded_list, callback) {
    var outputFilename = this.path.normalize('./downloaded.json');
    this.fs.writeFile(outputFilename, JSON.stringify(downloaded_list, null, 4), function (err) {
        if (err) {
            this.logError(err);
            console.log(err);
        }
        callback();
    });

}

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

Botsan.prototype.getDownloadFromFile = function getDownloadFromFile(filename, json) {
    var data = require(json);
    for (var key in data) {
        if (data[key].filename == filename) {
            return data[key];
        }
    }
    return null;

}

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

Botsan.prototype.sendNotification = function sendNotification(message, error) {
    if(!this.config.settings.NOTIFICATIONS){
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
                return;
            }
            return true;
        });
    });


}

Botsan.prototype.saveUsers = function saveUsers(users) {
    this.fs.writeFile("./users.json", JSON.stringify(users, null, 4), function (err) {
        if (err) {
            throw err;
        }
    });
}

Botsan.prototype.getAnimeById = function getAnimeById(id) {
    for (var key in this.anime_list) {
        if (this.anime_list[key].uploadsID == id) {
            return this.anime_list[key];
        }
    }
    return null;
}

module.exports = Botsan;
