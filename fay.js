const bsan = require('./includes/bot-san.js');
const Episode = require('./models/Episode.js');
const botsan = new bsan(false, true);
const Transcoder = require('./includes/transcoder.js');
const socket = require('socket.io-client')
(`${botsan.config.connection.address}:8888`, {
  reconnectionDelay: botsan.config.connection.reconnection_delay
});
/**
 * This array is used to save a local list of finished episodes in case of
 * disconnect to Ray. On reconnect, it should send everything in this list as
 * finished.
 * @type {Array}
 */
const finished_episodes = [];
botsan.startConsole();

var DEBUG = false;

//Downloads are in a priority queue, with episode number as a priority.
// Downloads with lower

var download_queue = botsan.async.priorityQueue(
  sftpDownload,
  botsan.config.settings.SIMULTANEOUS_SCP
);
var in_download_queue = [];

//Encodes are in a priority queue, with episode number as a priority.
// Encodes with lower
var encode_queue = botsan.async.priorityQueue(
  startEncoding,
  botsan.config.settings.SIMULTANEOUS_ENCODES
);
var in_encode_queue = [];

var ftp_queue = botsan.async.queue(
  upload_file,
  botsan.config.settings.SIMULTANEOUS_FTP_UPLOADS
);
var in_ftp_queue = []; //Contains the title of each episode in the list.

var scpDefaults = {
  port: 22,
  host: botsan.config.scp.host,
  username: botsan.config.scp.username,
  passphrase: botsan.config.scp.passphrase,
  privateKey: botsan.fs.readFileSync(
    botsan.path.normalize(botsan.config.scp.privatekey)
  ),
};

/**
 *
 * @param object
 * @param object.episode - Episode
 * @param object.download - Download
 *
 * @param callback
 */
function sftpDownload(object, callback) {
  object.download.filename = object.download.filename.replace(/\\/g, "/");
  const localFilename = `${botsan.config.paths.downloads}/${object.download.filename}`;

  //TODO: Check if the filesize matches the remote one, if it does then i can
  //remove this development check
  if(botsan.config.settings.DEVELOPMENT && botsan.fs.existsSync(localFilename)){
    onDoneDownloading(object, callback);
    return;
  }
  const Client = require('ssh2').Client;
  const conn = new Client();
  conn.on('ready', function () {
    console.log('Client :: ready');
    conn.sftp(function (err, sftp) {
      if (err)
        botsan.logError(err);
      botsan.updateData({
        Episode: object.episode,
        Status: "Downloading ",
        Progress: 0
      })
      botsan.createFoldersForFile(
        `${botsan.config.paths.downloads}/${object.download.filename}`
      );
      //TODO: Get the download path from seedbox config
      sftp.fastGet(
        `${botsan.config.paths.seedbox}/torrents/${object.download.filename}`,
        localFilename,
        {
          step: function (total_transferred, chunk, total) {
            botsan.updateData({
              Episode: object.episode,
              Status: "Downloading",
              Progress: Math.floor((total_transferred / total * 100) * 10) / 10
            })
          }
        }, function (err){
          if (err) {
            if (err.code == 2) {
              err = new Error(
                `File ${
                  botsan.config.paths.seedbox
                  }/torrents/${
                  object.download.filename
                  } doesn't exist`)
            }
            botsan.logError(err);
          }
          conn.end();
          onDoneDownloading(object, callback)
        });
    });
  }).connect(scpDefaults);

}

function onDoneDownloading(object, callback){
    botsan.updateData({
      Episode: object.episode,
      Status: "Download complete",
      Progress: 0
    });
    let downloadedObj = botsan.getDownload(object.episode.parent.uploadsID, object.episode.episodeno);
    if (!downloadedObj) {
      downloadedObj = new botsan.downloaded(
        object.episode.parent.uploadsID,
        object.download.filename,
        object.episode.episodeno
      );
      botsan.downloaded_list.push(downloadedObj);
    }
    botsan.writeDownloads(botsan.downloaded_list, callback);
    sendToTranscode(object.episode);
}

function sendToTranscode(Episode) {
  botsan.updateData({
    Episode: Episode,
    Status: "Download Finished",
    Progress: 0
  });

  in_encode_queue.push(Episode.title);
  encode_queue.push(Episode, Episode.episodeno, function () {
    in_encode_queue.splice(in_encode_queue.indexOf(Episode.title), 1);
  });
  botsan.updateData({
    Episode: Episode,
    Status: "In transcoding queue",
    Progress: 0
  });
}

function startEncoding(Episode, callback) {

  var folderpath = botsan.path.normalize(
    botsan.path.resolve(botsan.config.paths.downloads)
  );
  var source = botsan.path.normalize(`${folderpath}/${Episode.title}`);
  if (!botsan.fs.existsSync(source)) {
    //TODO: Delete it from downloads if it doesn't exist.
    botsan.logError(
      new Error(`File ${source} doesn't exist, removing from downloaded.json`)
    );
    callback();
    return;
  }
  //destination, Episode, index
  //Gets the full path

  var encoding_eps = [];
  var transcoder = new Transcoder(botsan);
  var resolutions = transcoder.getResolutions(Episode.parent.quality);

  for (var i = 0; i < resolutions.length; i++) {
    encoding_eps.push({
      filename: botsan.createFilename(
        Episode.parent.prefix,
        Episode.episodeno,
        resolutions[i]),
      quality: resolutions[i],
      Episode: Episode
    });
  }

  //Check if the files exists in the encoded folder before continuing.
  var founds = 0;

  encoding_eps.forEach(function (i) {
    try {
      if (botsan.fs.statSync(botsan.path.normalize(
          `./${botsan.config.paths.outputfolder}/${i.filename}`
        )).isFile()) {
        founds++;
        sendToFTPQueue(i);
      }
    } catch (err) {
      //If the file doesn't exist, then watch for it.
      encoding_episodes.push(i)
    }

  });

  if (founds == encoding_eps.length) {
    //If there's no missing episode, then we don't need to encode.
    //TODO: Only encode the missing resolution.
    callback();
    return;
  }


  botsan.updateData({Episode: Episode, Status: "Transcoding", Progress: 0});


  transcoder.run(source, Episode, callback);

}

//Object array: [{filename, quality, Episode}]
var encoding_episodes = [];
botsan.fs.watch(botsan.config.paths.outputfolder, function (event, who) {

  if (event === 'rename') {
    for (i = 0; i < encoding_episodes.length; i++) {
      var str = encoding_episodes[i].filename;
      if (encoding_episodes[i].filename === who) {
        var encodedEp = encoding_episodes[i];
        //TODO, add check to not add it again if it's already uploading/uploaded
        //Any change to the file will trigger this function.
        //The file shouldn't change, but just in case it happens.

        //Now we can upload the file!
        sendToFTPQueue(encodedEp);

        break;
      }
    }
  }

});

function sendToFTPQueue(encodedEp) {
  var status = botsan.getDataStatus(encodedEp.Episode);
  if (!Array.isArray(status)) {
    botsan.updateData({
      Episode: encodedEp.Episode,
      Status: "In upload queue",
      Progress: 0
    });
  }

  in_ftp_queue.push(encodedEp.Episode.title);
  ftp_queue.push(encodedEp, function () {
    in_ftp_queue.splice(in_ftp_queue.indexOf(encodedEp.Episode.title), 1);

  });
}

var uploaded_episodes = []; //Array of object uplObj
/*
 uplObj: {filename, quality, Episode}
 */
function upload_file(uplObj, callback) {


  var FTPc = new botsan.FClient();

  FTPc.connect({
    host: botsan.config.ftp.host,
    port: 21,
    user: botsan.config.ftp.user,
    password: botsan.config.ftp.password
  });

  FTPc.on('ready', function () {

    var status = botsan.getDataStatus(uplObj.Episode);
    if (!Array.isArray(status)) {
      status = [];
    }
    status.push(`Uploading ${uplObj.quality}p to Zeus`);
    botsan.updateData({Episode: uplObj.Episode, Status: status, Progress: 0});
    FTPc.binary(function (err) {
      if (err) throw err;
    });

    //Check if the folder exists.
    FTPc.list(uplObj.Episode.parent.prefix, function (err, list) {
      if (err) {
        botsan.logError(err);
        console.log(err);
        throw err;
      }
      if (list.length == 0) { //If there's no prefix directory, lets create one.
        FTPc.mkdir(uplObj.Episode.parent.prefix, function (err) {
          if (err) {
            if (err.code = 550) {//Directory already exist
              //Different function created the directory before this one.
              uploadOp(uplObj, FTPc);
              return;
            } else {
              botsan.logError(err);
              console.log(err);
              throw err;
            }

          } else {
            uploadOp(uplObj, FTPc);
          }
        });
      } else {
        uploadOp(uplObj, FTPc);
      }
    });
  });
  FTPc.on('error', function (err) {
    if (err) {
      botsan.logError(err);
      if (err.code == 421) {
        //Todo
        //Too many connections
      }
      console.log(err);
      throw err;
    }
    ;
  });
  FTPc.on('end', function (err) {
    if (err) {
      botsan.logError(err);
      throw err;
    }


    //TODO: This checks if the highest quality is uploaded, but I need to make
    // it check if all files are uploaded.
    if (uplObj.quality == uplObj.Episode.parent.quality) {
      if (socket.connected) {
        sendDone(uplObj.Episode);
      } else {
        finished_episodes.push(uplObj.Episode);
      }
      botsan.sendNotification(
        `@everyone ${
          uplObj.Episode.parent.title
          } #${
          uplObj.Episode.episodeno
          } was uploaded to Zeus`);
      //botsan.saveAnime();
      setTimeout(function () {
        botsan.clearData(uplObj.Episode);
      }, 3600000); //Clear after 1 hour
    }


    callback();
  });


}
/*
 uplObj: {filename, quality, Episode}
 */
function uploadOp(uplObj, FTPc) {
  FTPc.cwd(uplObj.Episode.parent.prefix, function (err) {
    if (err) {
      botsan.logError(err);
      console.log(err);
    }
    FTPc.put(botsan.path.resolve(
      `${botsan.config.paths.outputfolder}/${uplObj.filename}`
    ), uplObj.filename, function (err) {
      if (err) {
        botsan.logError(err);
        console.log(err);
      }

      var status = botsan.getDataStatus(uplObj.Episode);
      botsan.replaceStrInArr(
        status,
        `Uploading ${uplObj.quality}p to Zeus`,
        `${uplObj.quality}p upload Finished`
      );
      botsan.updateData({Episode: uplObj.Episode, Status: status, Progress: 0});

      FTPc.end();
    });
  });
}


socket.on('connect_timeout', function () {
  botsan.updateAppData({message: "Couldn't connect to Ray", id: -2});
});

socket.on('reconnect_attempt', function (num) {
  botsan.updateAppData({message: `Reconnecting attempt ${num}`, id: -2});
});

socket.on('connect', function () {
  const length = finished_episodes.length;
  for (i = 0; i < length; i++) {
    const ep = finished_episodes.shift();
    sendDone(ep);
  }
  botsan.updateAppData({message: "Connected to Ray", id: -2});
  const n = botsan.getShortHostname();
  /**
   *
   * @type {{name, queuelength: *, maxdl: Number, maxtcode: Number, reserved: Array}}
   * @propery Episode[] reserved - The episodes this node is currently working on.
   */
  const idObj = {
    name: n,
    queuelength: encode_queue.length() + download_queue.length(),
    maxdl: parseInt(botsan.config.settings.SIMULTANEOUS_SCP),
    maxtcode: parseInt(botsan.config.settings.SIMULTANEOUS_ENCODES),
    reserved: []
  }
  socket.emit('identification', idObj);
  //TODO: Emit this only when changed.
  setInterval(function () {
    var enc_length = encode_queue.running() + encode_queue.length();
    var dwl_length = download_queue.running() + download_queue.length();
    socket.emit('queuelength', enc_length + dwl_length);
  }, 1000);
});

socket.on('episode', function onReceiveEncode(data) {
  const episode = data.episode;
  const download = data.download;
  const parent = botsan.getAnimeById(episode.parent);
  if (!parent) {
    socket.emit('getAnime', episode.parent);
    socket.on('Anime', function (anime) {
      episode.parent = anime;
      Download(episode, download);
    });
  } else {
    episode.parent = parent;
    Download(episode, download);
  }
});

function sendDone(episode) {
  const ep = Object.assign({}, episode);
  ep.parent = ep.parent.uploadsID;
  socket.emit('done', ep);
}


function Download(episode, download) {
  botsan.updateData({
    Episode: episode,
    Status: "Received",
    Progress: 0
  });
  download_queue.push({
    download: download,
    episode: episode
  }, episode.episodeno, function () {
    //Remove it from in_download_queue when done.
    in_download_queue.splice(in_download_queue.indexOf(episode.title), 1);
  });
}

socket.on('disconnect', function () {
  botsan.updateAppData({message: "Disconnected from Ray", id: -2});
});

socket.on('error', function (err) {
  if (err) {
    botsan.logError(err);
  }
});