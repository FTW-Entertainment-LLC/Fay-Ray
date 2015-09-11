var sleep = require('sleep');
var feed = require("feed-read");
var request = require('request');
var async = require('async');
var WebTorrent = require('webtorrent');
var fs = require('fs');
var spawn = require('child_process').spawn;
var path = require('path');
var colors = require('colors');
var date = new Date();

var rewrite = "\033[0G"; //Windows
//var rewrite = "\r"; //Linux
var CClocation = path.normalize("C:/Users/Hani/Downloads/cc2");
var outputfolder = path.normalize("C:/Users/Hani/Documents/visual studio 2015/Projects/bot-san/bot-san/encoded");



//Non async functions, shouldn't really matter because I'm doing this operation on boot.
if (!fs.existsSync(path.normalize("./torrents"))) {
    fs.mkdirSync(path.normalize("./torrents"));
}
if (!fs.existsSync(path.normalize("./encoded"))) {
    fs.mkdirSync(path.normalize("./encoded"));
}
var tclient = new WebTorrent();


var pattern = new RegExp(/\[Chihiro\]_Monster_Musume_no_Iru_Nichijou_-_(\d{2})_\[720p_Hi10P_AAC\]/);
var anime_title = "Monster Musume: Everyday Life with Monster Girls";
var anime_prefix = "monstermusume";

var Episode = function (title, name, torrenturl, episodeno) {
    this.title = title;
    this.name = name;
    this.episodeno = episodeno;
    this.torrenturl = torrenturl;
};


var episodes = [];
var running = true;
var requested_episode = 1;


var gatherEpisodes = function (nyaa, callback) {
    feed(nyaa, function (err, articles) {
        if (err) {
            console.log(err);
            throw err;
        }
        articles.forEach(function (article) {
            if (!new RegExp(pattern).test(article.title)) {
                console.log('Regex pattern is invalid.');
            }
            
            var result = article.title.match(pattern);
            var e = new Episode(article.title, anime_title, article.link, parseInt(result[1])); //Parse the episode number to a integer.
            episodes.push(e);
        });
        callback();
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

function onGatherEp(err) {
    if (err) { throw err; return 0; };
    
    if (episodes.length > 0) {
        episodes.forEach(forEveryEpisode);
        
    } else {
        console.log(colors.red("Bot-san: I'm sorry sempai, I couldn't find episode " + requested_episode + " for \"" + anime_title + "\" :("));
    }
}
function forEveryEpisode(entry) {
    console.log("Bot-san: I found episode " + colors.cyan(entry.episodeno) + "!");
    
    tclient.add(entry.torrenturl, function (torrent) {
        onTorrentAdd(torrent, entry);
    });
}

function onTorrentAdd(torrent, entry) {
    // Got torrent metadata!
    console.log("Bot-san: I'm downloading \"" + entry.name.cyan + "\" episode", colors.cyan(entry.episodeno));
    
    //Go through all the files in the torrent and download the one one I need
    torrent.files.forEach(function ontorrent(file) {
        
        //Todo: Check for video files, we don't need anything else.
        

        console.log("Bot-san: The name of the file I'm downloading is:", file.name.cyan);
        var recievedsize = 0;
        var source = file.createReadStream();
        var destination = fs.createWriteStream(path.normalize("./torrents/" + file.name));
        source.pipe(destination); //Pipe the downloaded data to the destination
        
        //Todo: Delete the data from the default download folder.
        
        source.on('data', function (chunk) {
            recievedsize += chunk.length;
            process.stdout.write("Download progress: " + colors.green(Math.floor((recievedsize / file.length) * 100)) + "%" + rewrite);
        });
        
        destination.on('finish', function () {
            onDoneDownloading(file, destination, entry);
        });
    });
}

function onDoneDownloading(file, destination, entry) {
    console.log("Bot-san: Sempai! I'm done downloading".green, file.name.cyan);
    
    //Using sync because I don't need async.
    var files = fs.readdirSync(".\\torrents\\");
    var index = 0;
    for (index; index < files.length; index++) {
        if (files[index] == file.name) {
            break;
        }
                            
    }
    
    //Gets the full path, also normalized
    var folderpath = path.normalize(path.dirname(path.resolve(destination.path)));
    
    console.log("Bot-san: I'll now try to encode the file.");
    
    
    //Spawn CC through cmd, this will be different on unix.
    var ls = spawn("cmd", ["/c", path.normalize(CClocation+"/CancerCoder"), "SourceFolder:" + folderpath, "OutputFolder:" + path.normalize(outputfolder), "TempFolder:C:\\tempfolder", "Prefix:" + anime_prefix, "Episode:" + entry.episodeno, "FileIndex:" + index, "QualityBuff:True", "debug:true"], { detached: true });
    
    
    //Logging these to console might be pointless, enable them through a debug macro and log these to files instead.
    ls.stdout.on('data', function (data) {
        console.log('stdout: ' + data);
    });
    
    ls.stderr.on('data', function (data) {
        console.log('stderr: ' + data);
    });
    ls.on('error', function (err) {
        throw err;
    });
    ls.on('close', function (code) {
        onCCClose(code, entry);
    });

                        
}

function onCCClose(code, episode) {
    console.log('child process exited with code ' + code);
    
    
    if (code == 0) {
        //Check if outputted file exists!
        var filepath = path.normalize("./encoded/" + anime_prefix + "_" + episode.episodeno + "_ns.mp4");
        console.log(filepath);
        if (fs.existsSync(filepath)) {
            console.log("Bot-san: The file exists in", filepath.cyan);
        } else {
            console.log("Bot-san: I'm sorry sempai, something went wrong. The file doesn't exist.");
        }
    }
}
gatherEpisodes("https://www.nyaa.eu/?page=rss&term=monster+musume+" + getEpisode(requested_episode) + "&user=68115", onGatherEp);
