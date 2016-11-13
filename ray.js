var bsan = require('./includes/bot-san.js');
var botsan = new bsan();
botsan.startConsole();


var config;
if (botsan.fs.existsSync(botsan.path.normalize("./config.ini"))) {
    config = botsan.ini.parse(botsan.fs.readFileSync('./config.ini', 'utf-8'));
}else{
    console.error("No config.ini file found!");
}

var DEBUG = false;

if (!botsan.fs.existsSync(botsan.path.normalize(config.paths.torrentfolder))) {
    botsan.fs.mkdirSync(botsan.path.normalize(config.paths.torrentfolder));
}

var downloaded_list = [];
if (botsan.fs.existsSync(botsan.path.normalize("./downloaded.json"))) {
    try {

        downloaded_list = JSON.parse(botsan.fs.readFileSync('./downloaded.json', 'utf8'));
    } catch (e) {
        botsan.logError(e);
    }
}

botsan.nyaa_queue = botsan.async.queue(checkNyaa, config.settings.SIMULTANEOUS_NYAA_CHECKS);
var torrent_queue = botsan.async.queue(downloadEpisodes, config.settings.SIMULTANEOUS_DOWNLOADS);
var in_torrent_queue = [];
var current_downloaded_articles = [];


//Starts the queue on start, and then once every hour.
startQueue();
var minutes = 30, the_interval = minutes * 60 * 1000;
setInterval(startQueue, the_interval);

function checkNyaa(series, callback){
    var FeedParser = require('feedparser')
        , request = require('request');
    var req = request(nyaaUrl(series.nyaasearch, series.nyaauser))
        , feedparser = new FeedParser();

    req.on('error', function (error) {
        botsan.logError(error);
    });

    req.on('response', function (res) {
        var stream = this;

        if (res.statusCode != 200) return this.emit('error', new Error('Bad status code'));

        stream.pipe(feedparser);
    });


    feedparser.on('error', function(error) {
        logError(error);
    });
    var found = 0;
    feedparser.on('readable', function() {
        // This is where the action is!
        var stream = this
            , meta = this.meta // **NOTE** the "meta" is always available in the context of the feedparser instance
            , article;

        while (article = stream.read()) {
            var pattern = new RegExp(series.regex);
            if (!new RegExp(pattern).test(article.title)) {
                botsan.updateAppData({ message: "Ray: Regex pattern is invalid for: " + series.title, id: series.uploadsID });
                return;
            }
            var result = article.title.match(pattern);
            if (result == null) {
                return;
            }
            if (series.finished_episodes.indexOf(parseInt(result[1], 10 /*base 10*/)) != -1) {
                //Don't continue if this episode has already been uploaded.
                return;
            }
            if (in_torrent_queue.indexOf(article.link) >= 0 || current_downloaded_articles.indexOf(article.link) >= 0) {
                //Don't continue if the episode is in any of the above lists.
                //In torrent queue are the torrents waiting to be downloaded, while current_downloaded_articles are all torrents that has been downloaded since the process started
                return;
            }

            found++;

            var e = new botsan.Episode(article.title, article.link, parseInt(result[1]), series); //Parse the episode number to a integer.

            botsan.updateData({ Episode: e, Status: "In Torrent Queue", Progress: 0 });

            in_torrent_queue.push(e.torrenturl);
            torrent_queue.push(e, function () {
                //Remove the episode from the in_queue when done.
                in_torrent_queue.splice(in_torrent_queue.indexOf(e.torrenturl), 1);
            });
            var foundeps = found;
            if (found > 0) {
                foundeps = botsan.colors.green(found);
            }
            botsan.updateAppData({ message: "Ray: I found " + foundeps + " new episodes for: " + series.title, id: series.uploadsID });
        }
    });
    callback();

}

function startQueue() {
    botsan.nyaa_queue.push(botsan.anime_list);
}

function nyaaUrl(search, user) {
    return "https://www.nyaa.eu/?page=rss&term=" + search + "&user=" + user
}


function downloadEpisodes(Episode, callback) {
    //Don't add the torrent if it's already in the client.
    if (!botsan.tclient.get(Episode.torrenturl)) {
        botsan.tclient.add(Episode.torrenturl, { path: botsan.path.resolve(config.paths.torrentfolder) }, function (torrent) {
            onTorrentAdd(torrent, Episode, callback);
        });
    } else{
        callback();
    }
}

function onTorrentAdd(torrent, Episode, callback) {
    botsan.updateData({ Episode: Episode, Status: "Starting Download", Progress: Math.floor(torrent.progress * 100) });
    /*torrent.files.forEach(function ontorrent(file) {

        //Todo: Check for video files, we don't need to download anything else.

    });*/
    var finished = false;
    torrent.on('error', function(){
        //console.log(err);
        botsan.logError(err);
        callback();
    });

    torrent.on('download', function () {
        if(!finished)
            botsan.updateData({ Episode: Episode, Status: "Downloading", Progress: Math.floor(torrent.progress * 100) });

    })

    torrent.on('done', function (err) {
        if (err) {
            //console.log(err);
            botsan.logError(err);
        }
        finished = true;
        torrent.files.forEach(function (file) {
            //Todo: Add only video files
            onDoneDownloading(file, Episode, callback);
        });

        //Todo:
        //Gather knowledge on webtorrent to know if removing a torrent from the client is necessary
        /*tclient.remove(Episode.torrenturl, function (err) {
            if (err) {
                console.log(err);
                botsan.logError(err);
            }
        });*/
    });


}

function onDoneDownloading(file, Episode, callback) {
    botsan.updateData({ Episode: Episode, Status: "Download Finished", Progress: 0 });
    botsan.fs.readdir(botsan.path.normalize(config.paths.torrentfolder), function (err, files) {
        if (err) {
            botsan.logError(err);
            callback();
            throw (err);
        }
        var downloadedObj = new botsan.downloaded(Episode.parent.uploadsID, file.name, Episode.episodeno);
        current_downloaded_articles.push(Episode.torrenturl);
        Episode.parent.finished_episodes.push(Episode.episodeno);

        Episode.parent.finished_episodes.sort(function(a, b){return a - b});
        //numeric sort

        var push = true;
        for(i=0;i<downloaded_list.length;i++){
            var dwnld = downloaded_list[i];

            if(dwnld.uploadsID == downloadedObj.uploadsID && dwnld.episodeno == downloadedObj.episodeno){
                push=false;
                break;
            }
        }

        if(push)
            downloaded_list.push(downloadedObj);

        botsan.writeDownloads(downloaded_list, callback);
        botsan.saveSettings(botsan.anime_list);
        botsan.updateData({ Episode: Episode, Status: "Waiting to be pulled by Fay", Progress: 0 });

        setTimeout(function(){
            botsan.clearData(Episode);
        }, 3600000); //Clear after 1 hour
    });
}