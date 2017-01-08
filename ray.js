const Botsan = require('./includes/bot-san.js');
const Episode = require('./models/Episode.js');
const botsan = new Botsan(true, false);
const readChunk = require('read-chunk'); // npm install read-chunk
const fileType = require('file-type');
const array = require('locutus/php/array');
const waitUntil = require('wait-until');
const extend = require('util')._extend;
botsan.startConsole();
const socketiohttp = require('http').createServer().listen(8888, '0.0.0.0');
const io = require('socket.io').listen(socketiohttp);

const DEBUG = false;

if (!botsan.fs.existsSync(botsan.path.normalize(
      botsan.config.paths.downloads))
) {
  botsan.fs.mkdirSync(botsan.path.normalize(botsan.config.paths.downloads));
}

botsan.nyaa_queue = botsan.async.queue(
  checkNyaa,
  botsan.config.settings.SIMULTANEOUS_NYAA_CHECKS
);
botsan.torrent_queue = botsan.async.queue(
  downloadEpisodes,
  botsan.config.settings.SIMULTANEOUS_DOWNLOADS
);
const transcode_queue = botsan.async.priorityQueue(transcodeEpisode, 1);
//Concurrency is changed depending on amount of connected encoding nodes.
let in_transcode_queue = [];
const current_downloaded_articles = [];

const connected_nodes = [];


//Starts the queue on start, and then once every hour.
startQueue();
const minutes = 30, the_interval = minutes * 60 * 1000;
setInterval(startQueue, the_interval);

function checkNyaa(series, callback) {
  const nyaaurl = nyaaUrl(series.nyaasearch, series.nyaauser);
  const req = botsan.request(nyaaurl)
    , feedparser = new botsan.FeedParser();

  req.on('error', function (error) {
    botsan.logError(error);
  });

  req.on('response', function (res) {
    const stream = this;

    if (res.statusCode != 200) return this.emit('error', new Error(`Bad status code: ${res.statusCode} (${nyaaurl})`));

    stream.pipe(feedparser);
  });


  feedparser.on('error', function (error) {
    botsan.logError(error);
  });
  let found = 0;
  feedparser.on('readable', function () {
    // This is where the action is!
    let stream = this
      , meta = this.meta // **NOTE** the "meta" is always available in the context of the feedparser instance
      , article;

    while (article = stream.read()) {

      const episode_number = getEpisodeByRegex(series, article.title);

      if (episode_number == null) {
        //No match, quit;
        return;
      }

      if (series.finished_episodes.indexOf(
        parseInt(episode_number, 10 /*base 10*/)) != -1)
      {
        //Don't continue if this episode has already been uploaded.
        return;
      }
      if (botsan.in_torrent_queue.indexOf(article.link) >= 0 ||
        current_downloaded_articles.indexOf(article.link) >= 0 ||
        in_transcode_queue.indexOf(article.title) >= 0)
      {
        //Don't continue if the episode is in any of the above lists.
        //In torrent queue are the torrents waiting to be downloaded, while current_downloaded_articles are all torrents that has been downloaded since the process started
        return;
      }

      found++;

      const e = new Episode(article.title, article.link, parseInt(episode_number), series); //Parse the episode number to a integer.

      botsan.updateData({Episode: e, Status: "In Torrent Queue", Progress: 0});

      botsan.in_torrent_queue.push(e.torrenturl);
      botsan.torrent_queue.push(e, function () {
        //Remove the episode from the in_queue when done.
        botsan.in_torrent_queue.splice(botsan.in_torrent_queue.indexOf(e.torrenturl), 1);
      });
      let foundeps = found;
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
    botsan.updateAppData({
      message: "Ray: I found 0 new episodes for: " + series.title,
      id: series.uploadsID
    });
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
  for (let i = 0; i < botsan.anime_list.length; i++) {
    const diff = array.array_diff(botsan.anime_list[i].finished_episodes, botsan.anime_list[i].finished_encodes);
    if (!botsan.anime_list[i].torrenturl) {
      botsan.nyaa_queue.push(botsan.anime_list[i]);
    } else {
      if (botsan.anime_list[i].finished && !diff)
        continue;
      if (botsan.in_torrent_queue.indexOf(botsan.anime_list[i].torrenturl) >= 0)
      {
        continue;
      }
      const e = new Episode(
        null,
        botsan.anime_list[i].torrenturl,
        null,
        botsan.anime_list[i]
      ); //Parse the episode number to a integer.
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





    for (const j in diff) {
      const download = botsan.getDownload(botsan.anime_list[i].uploadsID, parseInt(diff[j]));
      if (!download)
        continue;
      const episode = new Episode(download.filename, null, parseInt(diff[j]), botsan.anime_list[i]);
      botsan.updateData({
        Episode: episode,
        Status: "In send queue",
        Progress: 0
      });
      transcode_queue.push({
        episode: episode,
        download: download
      }, 0, onTranscodeFinish);
    }
    //}
  }
}

function nyaaUrl(search, user) {
  return "https://www.nyaa.eu/?page=rss&term=" + search + "&user=" + user
}


function downloadEpisodes(episode, callback) {
  //Don't add the torrent if it's already in the client.
  if (!botsan.tclient.get(episode.torrenturl)) {
    botsan.tclient.add(episode.torrenturl, {path: botsan.path.resolve(botsan.config.paths.downloads)}, function (torrent) {
      onTorrentAdd(torrent, episode, callback);
    });
  } else {
    callback();
  }
}

function onTorrentAdd(torrent, episode, callback) {
  botsan.updateData({
    Episode: episode,
    Status: "Starting Download",
    Progress: Math.floor(torrent.progress * 100)
  });
  /*torrent.files.forEach(function ontorrent(file) {

   //Todo: Check for video files, we don't need to download anything else.

   });*/
  let finished = false;
  torrent.on('error', function () {
    //console.log(err);
    botsan.logError(err);
    callback();
  });

  torrent.on('download', function () {
    if (!finished)
      botsan.updateData({
        Episode: episode,
        Status: "Downloading",
        Progress: Math.floor(torrent.progress * 100)
      });

  })

  torrent.on('done', function (err) {
    if (err) {
      //console.log(err);
      botsan.logError(err);
    }
    finished = true;
    let last_episode = null;
    for (i = 0; i < torrent.files.length; i++) {
      const buffer = readChunk.sync(botsan.path.normalize(`${botsan.config.paths.downloads}/${torrent.files[i].path}`), 0, 262);
      const filetype = fileType(buffer);
      if (filetype.mime.substring(0, 5) != "video") {
        continue;
      }

      let thisEp = episode;
      if (episode.parent.torrenturl) {
        //If it's a batch torrent identified by torrenturl in the anime object,
        // then we only send the files that match the regex.
        var ep_num = getEpisodeByRegex(episode.parent, torrent.files[i].name);
        if (!ep_num)
          continue;
        if (episode.parent.finished_episodes.indexOf(parseInt(ep_num, 10 /*base 10*/)) != -1) {
          //Don't continue if this episode has already been uploaded.
          continue;
        }
        if(in_transcode_queue.indexOf(torrent.files[i].path) >= 0) {
          continue
        }

        //null torrenturl because we don't want to ID the episodes by torrenturl which is done in some functions.
        //If there's no torrenturl, then it's identified by the episode title
        thisEp = new Episode(torrent.files[i].path, null, parseInt(ep_num), episode.parent);
        last_episode = thisEp.title;


      }

      onDoneDownloading(torrent.files[i], thisEp, function (file) {
        if (last_episode == file.path) {
          if (episode.parent.torrenturl) {
            episode.parent.finished = true;
            botsan.saveAnime();
          }
        }
      });
    }

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

function onDoneDownloading(file, episode, callback) {
  botsan.updateData({
    Episode: episode,
    Status: "Download Finished",
    Progress: 0
  });
  botsan.fs.readdir(botsan.path.normalize(botsan.config.paths.downloads), function (err, files) {
    if (err) {
      botsan.logError(err);
      callback();
      throw (err);
    }
    var downloadedObj = new botsan.downloaded(episode.parent.uploadsID, file.path, episode.episodeno);
    current_downloaded_articles.push(episode.torrenturl);
    episode.parent.finished_episodes.push(episode.episodeno);

    episode.parent.finished_episodes.sort(function (a, b) {
      return a - b
    });
    //numeric sort

    var download = botsan.getDownload(downloadedObj.uploadsID, downloadedObj.episodeno);

    if (download == null)
      botsan.downloaded_list.push(downloadedObj);

    botsan.writeDownloads(botsan.downloaded_list, function afterDownload() {
      botsan.saveAnime();
      botsan.updateData({
        Episode: episode,
        Status: "Waiting for an available transcoding node",
        Progress: 0
      });
      transcode_queue.push({
        episode: episode,
        download: downloadedObj
      }, 0, onTranscodeFinish);
      callback(file);
    });
  });
}


/**
 * Emitted when a transcode is finished from a Fay node
 * TODO: Save it in
 */
function onTranscodeFinish() {

}
/**
 * Sends a episode to Fay when there's a available spot.
 * @param {Object} obj
 * @param callback
 */
function transcodeEpisode(obj, callback) {
  //Will callback when receive socket.io finished event
  const episode = obj.episode;
  const download = obj.download;
  botsan.updateData({
    Episode: episode,
    Status: "Waiting to send to Transcoding node",
    Progress: 0
  });
  waitUntil(1000, Infinity, function condition() {
    return getLowestQueuedNode();
  }, function done(result) {
    const freenode = result;
    //Copy the episode object, modify it before sending to Fay.
    const data = {};
    data.episode = Object.assign({}, episode);
    data.episode.parent = episode.parent.uploadsID;
    data.download = download;
    freenode.socket.emit('episode', data);
    freenode.reserved.push(episode);
    in_transcode_queue.push(episode);


    botsan.updateData({
      Episode: episode,
      Status: `Sent to ${freenode.name}`,
      Progress: 0
    });

    freenode.socket.on('queuelength', function (data) {
      const obj = {};
      obj.queuelength = data;
    });

    callback();

    //Event to emit callback from finished episode handler from Fay
  });
}

/**
 * Gets the Fay that has the lowest amount of queued transcodes.
 * Will return null when all nodes exceed download and transcode limit.
 * @returns {null|Object}
 */
function getLowestQueuedNode() {
  let freeEncNode = 0;
  let found = false;

  for (var i = 0; i < connected_nodes.length; i++) {
    if (
      connected_nodes[i].queuelength <=
      connected_nodes[freeEncNode].queuelength &&
      connected_nodes[i].queuelength <
      (connected_nodes[i].maxdl + connected_nodes[i].maxtcode)
    ) {
      freeEncNode = i;
      found = true;
    }
  }
  if (found) {
    connected_nodes[freeEncNode].queuelength++;
    return connected_nodes[freeEncNode];
  } else {
    return false;
  }
}

/**
 * Shows all connections, also pauses the transcode queue when there's no
 * connected Fays
 */
function showConnections() {
  const nodes_name = connected_nodes.map(function (elem) {
    return elem.name;
  }).join();
  if (connected_nodes.length <= 0) {
    transcode_queue.pause();
  } else {
    if (transcode_queue.paused)
      transcode_queue.resume();
    //TODO: Change to use the config of the remote nodes
    transcode_queue.concurrency = botsan.config.settings.SIMULTANEOUS_ENCODES *
      connected_nodes.length;
  }

  botsan.updateAppData({
    message: "Ray: Connected nodes: " + nodes_name,
    id: -1
  });
}

io.on('connection', function (socket) {
  let obj = null;
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
    const length = obj.reserved.length;
    for (i = 0; i < length; i++) {
      const episode = obj.reserved.shift();
      //Requeue
      botsan.updateData({
        Episode: episode,
        Status: `Disconnected from Transcoding node - requeueing`,
        Progress: 0
      });
      const download = botsan.getDownload(
        episode.parent.uploadsID,
        episode.episodeno
      );
      transcode_queue.push({
        episode: episode,
        download: download
      }, 0, onTranscodeFinish);
    }
    showConnections();
  });

  socket.on('getAnime', function (id) {
    const getAnime = botsan.getAnimeById(id);
    // Make a copy, modify it and send it away.
    const anime = Object.assign({}, getAnime);
    delete anime.finished_episodes;
    delete anime.finished_encodes;
    socket.emit('Anime', anime);
  });
  socket.on('done', function (episode) {
    if (!isNaN(episode.parent)) {
      episode.parent = botsan.getAnimeById(episode.parent);
      if (episode.parent.finished_encodes.indexOf(episode.episodeno) < 0) {
        episode.parent.finished_encodes.push(episode.episodeno);
        episode.parent.finished_encodes.sort(function (a, b) {
          return a - b
        });
      }
      //remove from reserved.
      if (obj && obj.reserved) {
        const res_index = obj.reserved.findIndex(o => o.title === episode.title);
        if(res_index>=0)
          obj.reserved.splice(res_index, 1);
        const in_index = in_transcode_queue.findIndex(o => o.title === episode.title);
        if(in_index>=0)
          in_transcode_queue.splice(in_index, 1);
      }
      botsan.updateData({
        Episode: episode,
        Status: `Done`,
        Progress: 0
      });

      setTimeout(function () {
        botsan.clearData(episode);
      }, 900000); //Clear after 15 min
      botsan.saveAnime();
    }
  });
});