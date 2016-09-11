function Botsan() {
    this.feed = require("feed-read");
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
    this.date = new Date();
    this.tclient = new this.WebTorrent();
    this.application_status = [];
    this.episode_status = [];
}

Botsan.prototype.foo = function foo() {
    console.log(this.bar);
};
Botsan.prototype.Episode = function Episode(title, torrenturl, episodeno, parent) {
    this.title = title; //The title of the nyaa listing
    this.episodeno = episodeno; // Episode number of the nyaa listing
    this.torrenturl = torrenturl; //Torrent url of the nyaa listing
    this.parent = parent; //Reference to the anime object.
};

Botsan.prototype.anime = function anime(title, prefix, regex, nyaasearch, nyaauser, uploadsID, episode, quality) {
    this.title = title; //Anime title
    this.prefix = prefix; //AnimeFTW prefix
    this.regex = regex; //Regex to match the nyaa entries and group episode number.
    this.nyaasearch = nyaasearch; //Nyaa search field
    this.nyaauser = nyaauser; //Nyaa user to use search in
    this.uploadsID = uploadsID; // uploads board ID
    //this.episode = episode; //Episode number, if starting from the beginning, input 0.
    this.quality = quality; //Quality for the series to be encoded in. Can be 480, 720 or 1080.
    this.finished_episodes = []; //Change episode to use a list, to keep track which episodes are done.
};

Botsan.prototype.downloaded = function downloaded(uploadsID, filename, episodeno, torrenturl) {
    this.uploadsID = uploadsID; //Uploads board ID, all series are identified by this number.
    //For more info this can be matched from the anime object.
    this.filename = filename; //Filename
    this.episodeno = episodeno; //Episode number
};

Botsan.prototype.updateData = function updateData(Obj) {
    var index = -1;
    var counter;
    Obj.time = new Date().toISOString();
    this.episode_status.forEach(function (i) {
        if (i.Episode.torrenturl == Obj.Episode.torrenturl) {
            i.Progress = Obj.Progress;
            i.Status = Obj.Status;
            index = counter;
        }
        counter++;
    });

    if (index == -1) {
        this.episode_status.push(Obj);
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
    }
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
    }, 1000);
}

Botsan.prototype.writeData = function writeData() {
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
        console.log(i.Episode.parent.title, i.Episode.episodeno, "-", i.Status, showprogress);
    });

}

Botsan.prototype.logError = function logError(err) {

    var message = "";

    if (typeof err === 'object') {
        if (err.message) {
            message += '\r\nMessage: ' + err.message;
        }
        if (err.stack) {
            message += '\r\nStacktrace:\r\n';
            message += '====================\r\n';
            message += err.stack + "\r\n";
        }
    } else {
        message += 'dumpError :: argument is not an object\r\n';
    }

    //Todo:
    //Check size of error log,
    //If it's larger than a certain size,
    //Create a new one.

    this.fs.appendFile('./error.txt', this.getTime() + ":" + message + "\r\n\r\n", function (err) {
        if (err) throw err;

        console.log('The "', err, '" was appended to file!');
    });
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

module.exports = Botsan;
