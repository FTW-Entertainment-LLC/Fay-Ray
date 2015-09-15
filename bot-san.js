var feed = require("feed-read");
var request = require('request');
var async = require('async');
var WebTorrent = require('webtorrent');
var fs = require('fs');
var spawn = require('child_process').spawn;
var path = require('path');
var colors = require('colors');
var events = require("events");
var FClient = require('ftp');
var async = require("async");
var util = require('util');
var EventEmitter = require("events").EventEmitter;
var ee = new EventEmitter();
var date = new Date();
var tclient = new WebTorrent();


var CClocation = path.normalize("C:/Users/Hani/Downloads/cc2");
var outputfolder = path.normalize("C:/Users/Hani/Documents/visual studio 2015/Projects/bot-san/bot-san/encoded");
var SIMULTANEOUS_FTP_UPLOADS = 4;
var MAX_SIMULTANEOUS_DOWNLOADS = 10;
var SIMULTANEOUS_NYAA_CHECKS = 4;
var SIMULTANEOUS_ENCODES = 1;
var DEBUG = false;

var anime_list = [];
var ftp_queue = async.queue(upload_file, SIMULTANEOUS_FTP_UPLOADS);
var nyaa_queue = async.queue(checkNyaa, SIMULTANEOUS_NYAA_CHECKS);
var encode_queue = async.queue(startEncoding, SIMULTANEOUS_ENCODES);
var torrent_queue = async.queue(downloadEpisodes, MAX_SIMULTANEOUS_DOWNLOADS);

var episode_status = [];

var Episode = function (title, torrenturl, episodeno, parent) {
    this.title = title; //The title of the nyaa listing
    this.episodeno = episodeno; // Episode number of the nyaa listing
    this.torrenturl = torrenturl; //Torrent url of the nyaa listing
    this.parent = parent; //Reference to the anime object.
};

var Anime = function (title, prefix, regex, nyaasearch, nyaauser, uploadsID, episode) {
    this.title = title; //Anime title
    this.prefix = prefix; //AnimeFTW prefix
    this.regex = regex; //Regex to match the nyaa entries and group episode number.
    this.nyaasearch = nyaasearch; //Nyaa search field
    this.nyaauser = nyaauser; //Nyaa user to use search in
    this.uploadsID = uploadsID; // uploads board ID
    this.episode = episode; //Episode number, if starting from the beginning, input 0.
};

var url = 'http://v4.aftw.ftwdevs.com/api/v2?devkey=7bHS-VFxw-GJz4-bEPH&username=fay&password=7tLVkH5DEZvMmSGmebsPU4r8';



/*var a = new Anime("Military!", "military", "\\[Commie\\] Military! - (\\d{2}) \\[.*\\].mkv", "Military%21", 76430, 0, 0);
var b = new Anime("Shimoneta: A Boring World Where the Concept of Dirty Jokes Doesn`t Exist", "shimonetaaboringworldwheretheconceptofdirtyjokesdoesntexist", "\\[Hiryuu\\] Shimoneta to Iu Gainen ga Sonzai Shinai Taikutsu na Sekai - (\\d{2}) \\[720p H264 AAC\\].*.mkv", "Shimoneta+to+Iu+Gainen+ga+Sonzai+Shinai+Taikutsu+na+Sekai", 89764, 0, 0)

anime_list.push(a, b);*/

//Non async functions, shouldn't really matter because I'm doing this operation on boot.
if (!fs.existsSync(path.normalize("./torrents"))) {
    fs.mkdirSync(path.normalize("./torrents"));
}
if (!fs.existsSync(path.normalize("./encoded"))) {
    fs.mkdirSync(path.normalize("./encoded"));
}
if (fs.existsSync(path.normalize("./savefile.json"))) {
    anime_list = require('./savefile.json');
}


var aftwtoken = "";


//Starts the queue on start, and then once every hour.
startQueue();
var minutes = 60, the_interval = minutes * 60 * 1000;
setInterval(function () {
    startQueue();
}, the_interval);


function startQueue() {
    //Todo: Don't queue any series for series/episodes that are in any of these queues:
    //nyaa, encode, torrent, ftp
    anime_list.forEach(function (entry) {

        nyaa_queue.push(entry);
    });
}

var getEpisode = function (ep) {
    if (ep < 10 && ep > 0) {
        return "0" + ep;
    } else if (ep > 10) {
        return ep;
    } else {
        throw new Error('Episode is negative?');
    }
}

function checkNyaa(series, callback) {
    var nyaaurl = nyaaUrl(series.nyaasearch, series.nyaauser);
    
    //console.log("Bot-san: I'm now starting operation for:", series.title);
    
    feed(nyaaurl, function (err, articles) {
        if (err) {
            console.log(err);
            throw err;
        }
        articles.reverse(); //Reverse the list, so we get the first episodes before the last.
        articles.forEach(function (article) {
            var pattern = new RegExp(series.regex);
            if (!new RegExp(pattern).test(article.title)) {
                //console.log('Regex pattern is invalid.');
            }
            
            var result = article.title.match(pattern);
            
            if (parseInt(result[1]) <= series.episode) {
                return;
            }
            
            var e = new Episode(article.title, article.link, parseInt(result[1]), series); //Parse the episode number to a integer.

            var nyaaObj = { Episode: e, Status: "Found on Nyaa", Progress: 0 };
            updateData(nyaaObj);
            //Todo: Make sure this entry doesn't already exist in the queue.
            torrent_queue.push(e);
            //var chopped_title = series.title.substring(0, 40);
            //console.log("Bot-san: I found episode", colors.cyan(e.episodeno),"("+chopped_title+")!");
            
        });
        callback();
    });
}
function downloadEpisodes(Episode, callback) {
    tclient.add(Episode.torrenturl, function (torrent) {
        onTorrentAdd(torrent, Episode, callback);
    });
    
}

function onTorrentAdd(torrent, Episode, callback) {
    // Got torrent metadata!
    
    //Go through all the files in the torrent and download the one one I need
    torrent.files.forEach(function ontorrent(file) {
        
        //Todo: Check for video files, we don't need anything else.

        var recievedsize = 0;
        var source = file.createReadStream();
        var destination = fs.createWriteStream(path.normalize("./torrents/" + file.name));
        source.pipe(destination); //Pipes the downloaded data to the destination
        
        //Todo: Delete the data from the default download folder.
        
        source.on('data', function (chunk) {
            recievedsize += chunk.length;
            
            updateData({ Episode: Episode, Status: "Downloading", Progress: Math.floor((recievedsize / file.length) * 100) });

            

            
            
        });
        
        destination.on('finish', function () {

            onDoneDownloading(file, destination, Episode);
            destination.end();
            source.destroy();
            callback();
        });
    });
    
}

function onDoneDownloading(file, destination, Episode, callback) {
    updateData({ Episode: Episode, Status: "Download Finished", Progress: 0 });
    fs.readdir(path.normalize(".\\torrents\\"), function (err, files) {
        if (err) throw(err);
        var index = 0;
        for (index; index < files.length; index++) {
            if (files[index] == file.name) {

                encode_queue.push({ file: file, destination: destination, Episode: Episode, index: index });
                updateData({ Episode: Episode, Status: "on encoding queue", Progress: 0 });
                break;
            }
                            
        }
    });
    
    

                        
}

function startEncoding(encodeObj, callback) {
    //file, destination, Episode, index
    //Gets the full path
    var folderpath = path.normalize(path.dirname(path.resolve(encodeObj.destination.path)));
    
    updateData({ Episode: encodeObj.Episode, Status: "Encoding", Progress: 0 });
    
    
    //Spawn CC through cmd, this will be different on unix.
    var ls = spawn("cmd", ["/c", "start",  "/min", path.normalize(CClocation + "/CancerCoder"), "SourceFolder:" + folderpath, "OutputFolder:" + path.normalize(outputfolder), "TempFolder:C:\\tempfolder", "Prefix:" + encodeObj.Episode.parent.prefix, "Episode:" + encodeObj.Episode.episodeno, "FileIndex:" + encodeObj.index, "QualityBuff:True", "debug:true"], { detached: true });
    
    //var ls = spawn("cmd", ["/c"], { detached: true }); //Skip encode
    

    ls.stdout.on('data', function (data) {
        //console.log('stdout: ' + data);
    });
    
    ls.stderr.on('data', function (data) {
        console.log('stderr: ' + data);
    });
    ls.on('error', function (err) {
        console.log(err);
        throw err;
    });
    ls.on('close', function (code) {
        onCCClose(code, encodeObj.Episode, function (err) {
            if (err) {
                console.log(err);
                throw err;
            }
            callback();
        });
    });

}

function onCCClose(code, Episode, callback) {
    //console.log('child process exited with code ' + code);
    
    
    if (code == 0) {
        //Check if outputted file exists!
        updateData({ Episode: Episode, Status: "Encode finished", Progress: 0 });
        var filepath = path.resolve("./encoded/" + Episode.parent.prefix + "_" + Episode.episodeno + "_ns.mp4");
        
        fs.exists(filepath, function (exists) { sendToFTP(exists, filepath, Episode); });
        callback();
        
    } else {
        updateData({ Episode: encodeObj.Episode, Status: "File didn't encode properly", Progress: 0 });
        callback(new Error("File didn't encode correctly"));
    }

    
}

function sendToFTP(exists, filepath, Episode, callback) {
    if (exists) {
        //Now we can upload the file!
        
        updateData({ Episode: Episode, Status: "Encoding Queue", Progress: 0 });
        
        ftp_queue.push({ filepath: filepath, Episode: Episode });
        

    } else {
        updateData({ Episode: Episode, Status: "Encode failed: "+filepath+" doesn't exist", Progress: 0 });
    }

    
}

/*request(url, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var response = JSON.parse(body);
            aftwtoken = response.message;
            
           
        } else {
            console.log("Got an error: ", error, ", status code: ", response.statusCode);
        }
        callback();
    });
 
 */


function nyaaUrl(search, user) {
    return "https://www.nyaa.eu/?page=rss&term=" + search + "&user=" + user
}

function upload_file(uplObj, callback) {
    
    var FTPc = new FClient();
    
    FTPc.connect({ host: "zeus.ftwentertainment.com", port: 21, user: "fay@videos.animeftw.tv", password: "T8wX?k4(.0Vv" });
    
    FTPc.on('ready', function () {
        updateData({ Episode: uplObj.Episode, Status: "Uploading to Zeus", Progress: 0 });
        FTPc.binary(function (err) { if (err) throw err; });
        
        
        
        FTPc.list(uplObj.Episode.parent.prefix, function (err, list) {  //Check if the folder exists.
            if (err) {
                console.log(err);
                throw err;
            }
            if (list.length == 0) { //If there's no prefix directory, lets create one.
                FTPc.mkdir(uplObj.Episode.parent.prefix, function (err) {
                    if (err) {
                        console.log(err);
                        if (err.code = 550) {//Directory already exist
                            //Different function created the directory before this one.
                            uploadOp(uplObj, FTPc);
                            return;
                        } else {
                            throw err;
                        }
                        
                    }
                    uploadOp(uplObj, FTPc);
                    
                });
            } else {
                uploadOp(uplObj, FTPc);
            }
        });
    });
    FTPc.on('error', function (err) {
        if (err) {
            if (err.code == 421) {
                //Todo
                //Too many connections
            }
            console.log(err);
            throw err;
        };
    });
    FTPc.on('end', function (err) {
        if (err) throw err;
        if (uplObj.Episode.parent.episode < uplObj.Episode.episodeno) {
            uplObj.Episode.parent.episode = uplObj.Episode.episodeno;
        }
        saveSettings();
        callback();
    });


}

function uploadOp(uplObj, FTPc) {
    FTPc.cwd(uplObj.Episode.parent.prefix, function (err) {
        if (err) throw err;
        var parsed_path = path.parse(uplObj.filepath);
        FTPc.put(uplObj.filepath, parsed_path.base, function (err) {
            if (err) {
                console.log(err);
                throw err;
            }
            updateData({ Episode: uplObj.Episode, Status: "Upload Finished", Progress: 0 });
            FTPc.end();
        });
    });
}


function saveSettings(){
    var outputFilename = path.normalize('./savefile.json');
    
    fs.writeFile(outputFilename, JSON.stringify(anime_list, null, 4), function (err) {
        if (err) {
            console.log(err);
            throw err;
        } else {
        }
    }); 
}


setInterval(function () {
    writeData();
}, 1000);

function updateData(Obj){
    var index = -1;
    var counter;
    episode_status.forEach(function (i) {
        if (i.Episode.torrenturl == Obj.Episode.torrenturl) {
            i.Progress = Obj.Progress;
            i.Status = Obj.Status;
            index = counter;
        }
        counter++;
    });
    
    if (index == -1) {
        episode_status.push(Obj);
    }
}

function writeData(){
    process.stdout.write("\u001b[2J\u001b[0;0H");
    episode_status.forEach(function (i) {
        var chopped_title = i.Episode.parent.title.substring(0, 40);
        var showprogress = "";
        if (i.Status == "Downloading") {
            showprogress = i.Progress + "%";
        }

        console.log(chopped_title, i.Episode.episodeno, "-", i.Status, showprogress);
    });
}