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

    //These variables are for the console output only. Handled by the functions UpdateData, UpdateAppData and writeData
    this.application_status = [];
    this.episode_status = [];
    this.last_refresh = 0;

}

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

Botsan.prototype.downloaded = function downloaded(uploadsID, filename, episodeno) {
    this.uploadsID = uploadsID; //Uploads board ID, all series are identified by this number.
    //For more info this can be matched from the anime object.
    this.filename = filename; //Filename
    this.episodeno = episodeno; //Episode number
};
Botsan.prototype.transcode = function transcode(uploadsID, filename, episodeno, quality) {
    this.uploadsID = uploadsID; //Uploads board ID, all series are identified by this number.
    //For more info this can be matched from the anime object.
    this.filename = filename; //Filename
    this.episodeno = episodeno; //Episode number
    this.quality = quality; //Quality
};

Botsan.prototype.getDataStatus = function getDataStatus(Obj) {
    for(i=0; i<this.episode_status.length; i++){
        //If there's a torrenturl, then identify the episode by the torrenturl. Otherwise do it by the title, which is used as filename in Fay.js
        //Ray uses the torrenturl, and title is the anime title.
        if((Obj.torrenturl == null && this.episode_status[i].Episode.title == Obj.title) ||
           (Obj.torrenturl != null && this.episode_status[i].Episode.torrenturl == Obj.torrenturl)){
            return this.episode_status[i].Status;
        }
    }
    return null;
}

Botsan.prototype.replaceStrInArr = function replaceStrInArr(array, oldstring, newstring){
    var index = array.indexOf(oldstring);
    if(index>=0){
        array[index] = newstring;
    }
}

Botsan.prototype.removeStrFromArr = function replaceStrInArr(array, string){
    if(!Array.isArray(array))
        return;
    var index = array.indexOf(string);
    if(index>=0){
        array.splice(index, 1);
    }
}

Botsan.prototype.getObjByFilename = function getObjByFilename(arr, filename){
    var found = null;
    for(i=0;i<arr.length;i++){
        if(arr[i].filename==filename){
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
        if(correctEpisode!=null)
            return;

        //If there's a torrenturl, then identify the episode by the torrenturl. Otherwise do it by the title, which is used as filename in Fay.js
        //Ray uses the torrenturl, and title is the anime title.
        if((Obj.torrenturl == null && i.Episode.title == Obj.Episode.title) ||
           (Obj.torrenturl != null && i.Episode.torrenturl == Obj.Episode.torrenturl)){
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
    }, 1000);
}

Botsan.prototype.writeData = function writeData() {
    var now = new Date().getTime();
    var last_refresh = this.last_refresh;
    if(last_refresh+200 < now){
        this.last_refresh = now;
    }else{
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
        if(Array.isArray(i.Status)){
            i.Status.forEach(function(i2){
                console.log(i.Episode.parent.title, i.Episode.episodeno, "-", i2, showprogress);
            });
        }else{
            console.log(i.Episode.parent.title, i.Episode.episodeno, "-", i.Status, showprogress);
        }


    });

}

Botsan.prototype.compareAppData = function compareAppData(a,b){
    if (a.id < b.id)
        return -1;
    if (a.id > b.id)
        return 1;
    return 0;
}

Botsan.prototype.compareEpisodeData = function compareEpisodeData(a,b){
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
            message += '\r\nMessage: ' + err.message;
        }
        if (err.stack) {
            message += '\r\nStacktrace:\r\n';
            message += '====================\r\n';
            message += err.stack + "\r\n";
        }
    } else {
        message += err+'dumpError :: argument is not an object\r\n';
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

Botsan.prototype.writeDownloads = function writeDownloads(downloaded_list, callback){
    var outputFilename = this.path.normalize('./downloaded.json');
    this.fs.writeFile(outputFilename, JSON.stringify(downloaded_list, null, 4), function (err) {
        if (err) {
            this.logError(err);
            console.log(err);
        }
        callback();
    });

}

Botsan.prototype.writeTranscodes = function writeTranscodes(transcodes_list, callback){
    var outputFilename = this.path.normalize('./transcodes.json');
    this.fs.writeFile(outputFilename, JSON.stringify(transcodes_list, null, 4), function (err) {
        if (err) {
            this.logError(err);
            console.log(err);
        }
        callback();
    });

}

Botsan.prototype.getDownloadFromFile = function getDownloadFromFile(filename, json){
    var data = require(json);
    for (var key in data) {
        if(data[key].filename == filename){
            return data[key];
        }
    }
    return null;

}

module.exports = Botsan;
