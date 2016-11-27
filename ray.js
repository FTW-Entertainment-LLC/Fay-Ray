var bsan = require('./includes/bot-san.js');
var botsan = new bsan(true);
const readChunk = require('read-chunk'); // npm install read-chunk
const fileType = require('file-type');
const array = require('locutus/php/array');
const waitUntil = require('wait-until');
const extend = require('util')._extend;
botsan.startConsole();
var socketiohttp = require('http').createServer().listen(8888, '0.0.0.0');
var io = require('socket.io').listen(socketiohttp);

var DEBUG = false;

if (!botsan.fs.existsSync(botsan.path.normalize(botsan.config.paths.torrentfolder))) {
    botsan.fs.mkdirSync(botsan.path.normalize(botsan.config.paths.torrentfolder));
}

botsan.nyaa_queue = botsan.async.queue(checkNyaa, botsan.config.settings.SIMULTANEOUS_NYAA_CHECKS);
botsan.torrent_queue = botsan.async.queue(downloadEpisodes, botsan.config.settings.SIMULTANEOUS_DOWNLOADS);
var transcode_queue = botsan.async.priorityQueue(sendEpisodeToTranscode, 1); //Concurrency is changed depending on amount of connected encoding nodes.
var current_downloaded_articles = [];


//Starts the queue on start, and then once every hour.
startQueue();
var minutes = 30, the_interval = minutes * 60 * 1000;
setInterval(startQueue, the_interval);

function checkNyaa(series, callback) {
    var nyaaurl = nyaaUrl(series.nyaasearch, series.nyaauser);
    var req = botsan.request(nyaaurl)
        , feedparser = new botsan.FeedParser();

    req.on('error', function (error) {
        botsan.logError(error);
    });

    req.on('response', function (res) {
        var stream = this;

        if (res.statusCode != 200) return this.emit('error', new Error('Bad status code'));

        stream.pipe(feedparser);
    });


    feedparser.on('error', function (error) {
        botsan.logError(error);
    });
    var found = 0;
    feedparser.on('readable', function () {
        // This is where the action is!
        var stream = this
            , meta = this.meta // **NOTE** the "meta" is always available in the context of the feedparser instance
            , article;

        while (article = stream.read()) {

            var episode_number = getEpisodeByRegex(series, article.title);

            if (episode_number == null) {
                //No match, quit;
                return;
            }

            if (series.finished_episodes.indexOf(parseInt(episode_number, 10 /*base 10*/)) != -1) {
                //Don't continue if this episode has already been uploaded.
                return;
            }
            if (botsan.in_torrent_queue.indexOf(article.link) >= 0 || current_downloaded_articles.indexOf(article.link) >= 0) {
                //Don't continue if the episode is in any of the above lists.
                //In torrent queue are the torrents waiting to be downloaded, while current_downloaded_articles are all torrents that has been downloaded since the process started
                return;
            }

            found++;

            var e = new botsan.Episode(article.title, article.link, parseInt(episode_number), series); //Parse the episode number to a integer.

            botsan.updateData({Episode: e, Status: "In Torrent Queue", Progress: 0});

            botsan.in_torrent_queue.push(e.torrenturl);
            botsan.torrent_queue.push(e, function () {
                //Remove the episode from the in_queue when done.
                botsan.in_torrent_queue.splice(botsan.in_torrent_queue.indexOf(e.torrenturl), 1);
            });
            var foundeps = found;
            if (found > 0) {
                foundeps = botsan.colors.green(found);
            }
            botsan.updateAppData({
                message: "Ray: I found " + foundeps + " new episodes for: " + series.title,
                id: series.uploadsID
            });
        }
    });
    if (found == 0) {
        botsan.updateAppData({message: "Ray: I found 0 new episodes for: " + series.title, id: series.uploadsID});
    }
    callback();

}

function getEpisodeByRegex(series, string) {
    var pattern = new RegExp(series.regex);
    if (!new RegExp(pattern).test(string)) {
        return null;
    }
    var result = string.match(pattern);
    if (result == null) {
        return null;
    }
    return result[1]; //First group
}

function startQueue() {
    for (var i = 0; i < botsan.anime_list.length; i++) {
        if (!botsan.anime_list[i].torrenturl) {
            botsan.nyaa_queue.push(botsan.anime_list[i]);
        } else {
            if (botsan.anime_list[i].finished)
                continue;
            if (botsan.in_torrent_queue.indexOf(botsan.anime_list[i].torrenturl) >= 0) {
                continue;
            }
            var e = new botsan.Episode(null, botsan.anime_list[i].torrenturl, null, botsan.anime_list[i]); //Parse the episode number to a integer.
            botsan.in_torrent_queue.push(e.torrenturl);
            botsan.torrent_queue.push(e, function () {
                //Remove the episode from the in_queue when done.
                botsan.in_torrent_queue.splice(botsan.in_torrent_queue.indexOf(e.torrenturl), 1);
            });
            botsan.updateData({Episode: e, Status: "In Torrent Queue", Progress: 0});
        }
        //if(botsan.anime_list[i].finished_episodes.length>botsan.anime_list[i].finished_encodes.length){
        //The encodes list is smaller than the finished(downloads in Ray) list.
        //get difference
        var diff = array.array_diff(botsan.anime_list[i].finished_episodes, botsan.anime_list[i].finished_encodes);
        for (var j in diff) {
            var download = botsan.getDownload(botsan.anime_list[i].uploadsID, parseInt(diff[j]));
            if (!download)
                continue;
            var episode = new botsan.Episode(download.filename, null, parseInt(diff[j]), botsan.anime_list[i]);
            transcode_queue.push(episode, 0, onTranscodeFinish);
        }
        //}
    }
}

function nyaaUrl(search, user) {
    return "https://www.nyaa.eu/?page=rss&term=" + search + "&user=" + user
}


function downloadEpisodes(Episode, callback) {
    //Don't add the torrent if it's already in the client.
    if (!botsan.tclient.get(Episode.torrenturl)) {
        botsan.tclient.add(Episode.torrenturl, {path: botsan.path.resolve(botsan.config.paths.torrentfolder)}, function (torrent) {
            onTorrentAdd(torrent, Episode, callback);
        });
    } else {
        callback();
    }
}

function onTorrentAdd(torrent, Episode, callback) {
    botsan.updateData({Episode: Episode, Status: "Starting Download", Progress: Math.floor(torrent.progress * 100)});
    /*torrent.files.forEach(function ontorrent(file) {

     //Todo: Check for video files, we don't need to download anything else.

     });*/
    var finished = false;
    torrent.on('error', function () {
        //console.log(err);
        botsan.logError(err);
        callback();
    });

    torrent.on('download', function () {
        if (!finished)
            botsan.updateData({Episode: Episode, Status: "Downloading", Progress: Math.floor(torrent.progress * 100)});

    })

    torrent.on('done', function (err) {
        if (err) {
            //console.log(err);
            botsan.logError(err);
        }
        finished = true;
        var last_episode = null;
        for (var i = 0; i < torrent.files.length; i++) {
            const buffer = readChunk.sync(botsan.path.normalize(`${botsan.config.paths.torrentfolder}/${torrent.files[i].path}`), 0, 262);
            const filetype = fileType(buffer);
            if (filetype.mime.substring(0, 5) != "video") {
                continue;
            }

            var thisEp = Episode;
            if (Episode.parent.torrenturl) {
                //If it's a batch torrent identified by torrenturl in the anime object, then we only send the files that match the regex.
                var ep_num = getEpisodeByRegex(Episode.parent, torrent.files[i].name);
                if (!ep_num)
                    continue;
                if (Episode.parent.finished_episodes.indexOf(parseInt(ep_num, 10 /*base 10*/)) != -1) {
                    //Don't continue if this episode has already been uploaded.
                    continue;
                }
                //null torrenturl because we don't want to ID the episodes by torrenturl which is done in some functions.
                //If there's no torrenturl, then it's identified by the episode title
                thisEp = new botsan.Episode(torrent.files[i].path, null, parseInt(ep_num), Episode.parent);
                last_episode = thisEp.title;


            }

            onDoneDownloading(torrent.files[i], thisEp, function (file) {
                if (last_episode == file.path) {
                    if (Episode.parent.torrenturl) {
                        Episode.parent.finished = true;
                        botsan.saveSettings(botsan.anime_list);
                    }
                    callback();
                }

            });
        }

        botsan.clearData(Episode);

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
    botsan.updateData({Episode: Episode, Status: "Download Finished", Progress: 0});
    botsan.fs.readdir(botsan.path.normalize(botsan.config.paths.torrentfolder), function (err, files) {
        if (err) {
            botsan.logError(err);
            callback();
            throw (err);
        }
        var downloadedObj = new botsan.downloaded(Episode.parent.uploadsID, file.path, Episode.episodeno);
        current_downloaded_articles.push(Episode.torrenturl);
        Episode.parent.finished_episodes.push(Episode.episodeno);

        Episode.parent.finished_episodes.sort(function (a, b) {
            return a - b
        });
        //numeric sort

        var push = true;
        for (i = 0; i < botsan.downloaded_list.length; i++) {
            var dwnld = botsan.downloaded_list[i];

            if (dwnld.uploadsID == downloadedObj.uploadsID && dwnld.episodeno == downloadedObj.episodeno) {
                push = false;
                break;
            }
        }

        if (push)
            botsan.downloaded_list.push(downloadedObj);

        botsan.writeDownloads(botsan.downloaded_list, function () {
            botsan.saveSettings(botsan.anime_list);
            botsan.updateData({Episode: Episode, Status: "Waiting to be pulled by Fay", Progress: 0});

            setTimeout(function () {
                botsan.clearData(Episode);
            }, 3600000); //Clear after 1 hour

            transcode_queue.push(Episode, 0, onTranscodeFinish);
            callback(file);
        });

    });
}

function onTranscodeFinish() {

}

var connected_nodes = [];
//TODO: Come up with logic to recover from a restart to remember which encoding nodes are encoding
//TODO: Fay should wait for Ray to come online if it's offline and it has finished some transcodes.
//TODO: Then report them to Ray as soon as it can.
function sendEpisodeToTranscode(episode, callback) {
    //Will callback when receive socket.io finished event

    waitUntil(1000, Infinity, function condition() {
        return checkFreeRemoteNode();
    }, function done(result) {
        console.log("Free remote node!");
        var freenode = getLowestQueuedNode();
        var data = extend({}, episode);
        data.parent = episode.parent.uploadsID;
        freenode.socket.emit('episode', { data });
        freenode.socket.on('queuelength', function (data) {
            obj.queuelength = data;
        });

        //Event to emit callback from finished episode handler from Fay
    });
}

function checkFreeRemoteNode() {
    if (getLowestQueuedNode() != null) {
        return true;
    } else {
        return false;
    }
}

function getLowestQueuedNode() {
    var freeEncNode = -1;

    for (var i = 0; i < connected_nodes.length; i++) {
        if (connected_nodes[i].queuelength > freeEncNode && connected_nodes[i].queuelength < (connected_nodes[i].maxdl + connected_nodes[i].maxtcode)) {
            freeEncNode = i;
        }
    }
    if (freeEncNode >= 0) {
        return connected_nodes[freeEncNode];
    } else {
        return null;
    }
}


function showConnections() {
    var string = "";
    for (var i = 0; i < connected_nodes.length; i++) {
        string += connected_nodes[i].name + ", ";
    }
    if (connected_nodes.length <= 0) {
        transcode_queue.pause();
    } else {
        if (transcode_queue.paused)
            transcode_queue.resume();
        //TODO: Change to use the config of the remote nodes
        transcode_queue.concurrency = botsan.config.settings.SIMULTANEOUS_ENCODES * connected_nodes.length;
    }

    botsan.updateAppData({message: "Ray: Connected nodes: " + string, id: -1});
}

io.on('connection', function (socket) {
    var obj = null;
    socket.on('identification', function (data) {
        obj = data;
        obj.socket = socket;
        connected_nodes.push(obj);
        showConnections();
    });
    socket.on('queuelength', function (data) {
        obj.queuelength = data;
    });
    socket.on('disconnect', function () {
        connected_nodes.splice(connected_nodes.indexOf(obj), 1);
        showConnections();
    });
});