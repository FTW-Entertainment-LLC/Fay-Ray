var bsan = require('./bot-san.js');
var botsan = new bsan();
//botsan.startConsole();
botsan.writeData();


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

if (botsan.fs.existsSync(botsan.path.normalize("./savefile.json"))) {
    anime_list = require('./savefile.json');
}

var downloaded_list = [];
if (botsan.fs.existsSync(botsan.path.normalize("./downloaded.json"))) {
    try {

        downloaded_list = JSON.parse(botsan.fs.readFileSync('./downloaded.json', 'utf8'));
    } catch (e) {
        botsan.logError(e);
    }
}

var nyaa_queue = botsan.async.queue(checkNyaa, config.settings.SIMULTANEOUS_NYAA_CHECKS);
var torrent_queue = botsan.async.queue(downloadEpisodes, config.settings.SIMULTANEOUS_DOWNLOADS);
var in_torrent_queue = [];
var current_downloaded_articles = [];


//Starts the queue on start, and then once every hour.
startQueue();
var minutes = 30, the_interval = minutes * 60 * 1000;
setInterval(startQueue, the_interval);


function checkNyaa(series, callback) {
    var nyaaurl = nyaaUrl(series.nyaasearch, series.nyaauser);
    botsan.feed(nyaaurl, function (err, articles) {

        if (err) {
            console.log(err);
            logError(err);
        }

        var found = 0;
        if (articles) {
            articles.reverse(); //Reverse the list, so we get the first episodes before the last.
            articles.forEach(function (article) {
                var pattern = new RegExp(series.regex);
                if (!new RegExp(pattern).test(article.title)) {
                    botsan.updateAppData({ message: "Bot-san: Regex pattern is invalid for: " + series.title, id: series.uploadsID });
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

            });
            var foundeps = found;
            if (found > 0) {
                foundeps = botsan.colors.green(found);
            }
            botsan.updateAppData({ message: "Ray: I found " + foundeps + " new episodes for: " + series.title, id: series.uploadsID });
        } else {
            botsan.updateAppData({ message: "Ray: I found no artciles for: " + series.title, id: series.uploadsID });
        }
        callback();
        
    });
}


function startQueue() {
    nyaa_queue.push(anime_list);
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
    //Go through all the files in the torrent and download the one one I need
    /*torrent.files.forEach(function ontorrent(file) {

        //Todo: Check for video files, we don't need to download anything else.

    });*/
    var finished = false;
    torrent.on('error', function(){
        console.log(err);
        logError(err);
        callback();
    });

    torrent.on('download', function () {
        if(!finished)
            botsan.updateData({ Episode: Episode, Status: "Downloading", Progress: Math.floor(torrent.progress * 100) });

    })

    torrent.on('done', function (err) {
        if (err) {
            console.log(err);
            logError(err);
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
                logError(err);
            }
        });*/
    });


}

function onDoneDownloading(file, Episode, callback) {
    botsan.updateData({ Episode: Episode, Status: "Download Finished", Progress: 0 });
    botsan.fs.readdir(botsan.path.normalize(config.paths.torrentfolder), function (err, files) {
        if (err) {
            logError(err);
            callback();
            throw (err);
        }
        var index = 0;
        /*Look for the file in the whole torrents folder, then
         * get the index for it, and send it off to the encode queue */
        for (index; index < files.length; index++) {
            if (files[index] == file.name) {
                var downloadedObj = new botsan.downloaded(Episode.parent.uploadsID, file.name, Episode.episodeno);
                current_downloaded_articles.push(Episode.torrenturl);
                Episode.parent.finished_episodes.push(Episode.episodeno);
                
                Episode.parent.finished_episodes.sort(function(a, b){return a - b});
                //numeric sort
                
                downloaded_list.push(downloadedObj);
                botsan.writeDownloads(downloaded_list, callback);
                botsan.saveSettings(anime_list);
                botsan.updateData({ Episode: Episode, Status: "Waiting to be pulled by Fay", Progress: 0 });
                break;
            }

        }
    });
}