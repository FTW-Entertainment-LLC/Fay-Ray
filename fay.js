var bsan = require('./includes/bot-san.js');
var botsan = new bsan(false);
var socket = require('socket.io-client')(`${botsan.config.connection.address}:8888`, {reconnectionDelay: botsan.config.connection.reconnection_delay});
botsan.writeData();
botsan.startConsole();

var DEBUG = false;

//Downloads are in a priority queue, with episode number as a priority. Downloads with lower

var download_queue = botsan.async.priorityQueue(sftpDownload, botsan.config.settings.SIMULTANEOUS_SCP);
var in_download_queue = [];

//Encodes are in a priority queue, with episode number as a priority. Encodes with lower 
var encode_queue = botsan.async.priorityQueue(startEncoding, botsan.config.settings.SIMULTANEOUS_ENCODES);
var in_encode_queue = [];

var ftp_queue = botsan.async.queue(upload_file, botsan.config.settings.SIMULTANEOUS_FTP_UPLOADS);
var in_ftp_queue = []; //Contains the title of each episode in the list.

var scpDefaults = {
    port: 22,
    host: botsan.config.scp.host,
    username: botsan.config.scp.username,
    passphrase: botsan.config.scp.passphrase,
    privateKey: botsan.fs.readFileSync(botsan.path.normalize(botsan.config.scp.privatekey)),
};

//Starts the queue on start, and then once every hour.
//startQueue();

//We start processing the downloaded.json files, they are sent to the encoding queue.
//They're sent to the onDoneDownloading function, just like the episode does when a scp download is finished
//processDownloads();


function onReceiveEncode(episode){

}


/*function startQueue() {
    checkDownloads();
}

function checkDownloads() {
    botsan.updateAppData({message: "Fay: Checking downloads on seedbox... ", id: -1});

    var Client = require('ssh2').Client;
    var conn = new Client();
    conn.on('ready', function () {
        conn.sftp(function (err, sftp) {
            if (err)
                botsan.logError(err);
            sftp.fastGet(`${botsan.config.paths.seedbox}/downloaded.json`, './rays_data/downloaded.json', function (err) {
                if (err)
                    botsan.logError(err);
                sftp.fastGet(`${botsan.config.paths.seedbox}/savefile.json`, './rays_data/ray_savefile.json', function (err) {
                    if (err)
                        botsan.logError(err);
                    botsan.updateAppData({message: "Fay: Got downloads data from Ray", id: -1});
                    conn.end();
                    processRaysDownloads();

                });

            });
        });
    }).connect(scpDefaults);
}*/

//Processes the /rays_data/downloaded.json file
/*function processRaysDownloads() {
    var downloads = [];
    try {
        downloads = JSON.parse(botsan.fs.readFileSync('./rays_data/downloaded.json', 'utf8'));
    } catch (e) {
        botsan.logError(e);
    }
    downloads.forEach(function (download) {
        if (in_download_queue.indexOf(download.filename) >= 0 ||
            in_encode_queue.indexOf(download.filename) >= 0 ||
            botsan.getObjByFilename(botsan.downloaded_list, download.filename) != null) {
            return;
        }

        var anime = getSavefileDataById(download.uploadsID);
        //Check if ray has this anime
        if (anime) {
            //Check if Fay has this anime, otherwise create it from ray.
            var myanime = botsan.getAnimeById(download.uploadsID);
            if (myanime == null) {
                anime.finished_episodes = [];
                botsan.anime_list.push(anime);
                myanime = anime;
                botsan.saveSettings(botsan.anime_list);
            }
            if (botsan.getAnimeById(download.uploadsID)) {
                if (botsan.getAnimeById(download.uploadsID).finished_episodes.indexOf(parseInt(download.episodeno, 10 /*base 10*//*)) != -1) {
                    //Don't continue if this episode has already been uploaded.
                    return;
                }
            }

            var episode = new botsan.Episode(download.filename, null, download.episodeno, myanime);
            in_download_queue.push(episode.title);
            download_queue.push({download: download, episode: episode}, episode.episodeno, function () {
                //Remove it from in_download_queue when done.
                in_download_queue.splice(in_download_queue.indexOf(episode.title), 1);
            });
            botsan.updateData({Episode: episode, Status: "In download queue", Progress: 0});
        }
    });

}*/

//TODO: Function processDownloads (run once on startup) and processRaysDownloads(run everytime it downloads from ray) is redundant. Make it non-redundant.

//Processes the /downloaded.json file, these will be sent to the encoded queue
function processDownloads() {
    botsan.downloaded_list.forEach(function (download) {
        if (in_encode_queue.indexOf(download.filename) >= 0) {
            return;
        }
        var anime = getSavefileDataById(download.uploadsID);
        if (anime) {
            var myanime = botsan.getAnimeById(download.uploadsID);
            if (myanime == null) {
                anime.finished_episodes = [];
                botsan.anime_list.push(anime);
                myanime = anime;
                botsan.saveSettings(botsan.anime_list);
            }
            if (myanime.finished_episodes.indexOf(parseInt(download.episodeno, 10 /*base 10*/)) != -1) {
                //Don't continue if this episode has already been uploaded.
                return;
            }
            var episode = new botsan.Episode(download.filename, null, download.episodeno, myanime);
            onDoneDownloading(episode);
        }
    });
}

function getSavefileDataById(id) {
    var data = null;
    try {
        data = JSON.parse(botsan.fs.readFileSync('./rays_data/ray_savefile.json', 'utf8'));
    } catch (e) {
        botsan.logError(e);
        return null;
    }

    for (var key in data) {
        if (data[key].uploadsID == id) {
            return data[key];
        }
    }
    return null;
}

function sftpDownload(object, callback) {
    var Client = require('ssh2').Client;
    var conn = new Client();
    conn.on('ready', function () {
        console.log('Client :: ready');
        conn.sftp(function (err, sftp) {
            if (err)
                botsan.logError(err);
            botsan.updateData({Episode: object.episode, Status: "Downloading ", Progress: 0});
            botsan.createFoldersForFile(`${botsan.config.paths.downloads}/${object.download.filename}`);
            sftp.fastGet(`${botsan.config.paths.seedbox}/torrents/${object.download.filename}`, `${botsan.config.paths.downloads}/${object.download.filename}`, {
                step: function (total_transferred, chunk, total) {
                    botsan.updateData({
                        Episode: object.episode,
                        Status: "Downloading",
                        Progress: Math.floor((total_transferred / total * 100) * 10) / 10
                    })
                }
            }, function (err) {
                if (err)
                    botsan.logError(err);
                botsan.updateData({Episode: object.episode, Status: "Download complete", Progress: 0});
                var downloadedObj = new botsan.downloaded(object.episode.parent.uploadsID, object.download.filename, object.episode.episodeno);
                botsan.downloaded_list.push(downloadedObj);
                conn.end();
                botsan.writeDownloads(botsan.downloaded_list, callback);
                onDoneDownloading(object.episode);
            });
        });
    }).connect(scpDefaults);

}

function onDoneDownloading(Episode) {
    botsan.updateData({Episode: Episode, Status: "Download Finished", Progress: 0});
    var parsedPath = botsan.path.parse(botsan.path.normalize(botsan.path.resolve(botsan.path.join(botsan.config.paths.downloads, Episode.title))));
    botsan.fs.readdir(parsedPath.dir, function (err, files) {
        if (err) {
            botsan.logError(err);
            throw (err);
        }

        files.sort(localeCompare);
        var index = files.indexOf(botsan.path.basename(Episode.title));
        in_encode_queue.push(Episode.title);
        encode_queue.push({Episode: Episode, index: index, dir: parsedPath.dir}, Episode.episodeno, function () {
            in_encode_queue.splice(in_encode_queue.indexOf(Episode.title), 1);
        });
        botsan.updateData({Episode: Episode, Status: "In transcoding queue", Progress: 0});
    });
}
function localeCompare(a, b) {
    return a.localeCompare(b)
};

//encodeObj
//episode
//fileindex
function startEncoding(encodeObj, callback) {
    //destination, Episode, index
    //Gets the full path

    //TODO: Check that the file really exists

    var encoding_eps = [];

    encoding_eps.push({
        filename: `${encodeObj.Episode.parent.prefix}_${encodeObj.Episode.episodeno}_ns.mp4`,
        quality: 480,
        Episode: encodeObj.Episode
    });

    //>= to match both 720p and 1080p
    if (encodeObj.Episode.parent.quality >= 720) {
        var watchObj = {
            filename: `${encodeObj.Episode.parent.prefix}_720p_${encodeObj.Episode.episodeno}_ns.mp4`,
            quality: 720,
            Episode: encodeObj.Episode
        };
        encoding_eps.push(watchObj);
    }
    if (encodeObj.Episode.parent.quality == 1080) {
        encoding_eps.push({
            filename: `${encodeObj.Episode.parent.prefix}_1080p_${encodeObj.Episode.episodeno}_ns.mp4`,
            quality: 1080,
            Episode: encodeObj.Episode
        });
    }

    //Check if the files exists in the encoded folder before continuing.
    var founds = []

    encoding_eps.forEach(function (i) {
        try {
            if (botsan.fs.statSync(botsan.path.normalize(`${botsan.config.paths.outputfolder}/${i.filename}`)).isFile()) {
                founds.push(1); //This is just a counter.
                sendToFTPQueue(i);
            }
        } catch (err) {
            //If the file doesn't exist, then watch for it.
            encoding_episodes.push(i)
        }

    });

    if (founds.length == encoding_eps.length) {
        //If there's no missing episode, then we don't need to encode.
        //TODO: Only encode the missing resolution.
        callback();
        return;
    }

    botsan.updateData({Episode: encodeObj.Episode, Status: "Transcoding", Progress: 0});


    //Write the time
    appendToCC(`\r\n${botsan.getTime()}:\r\n`);
    //Spawn CC through cmd
    var ls = "";
    if (botsan.os.platform() == "win32") {
        ls = botsan.spawn("cmd", ["/c", "start", "/min", botsan.path.normalize(botsan.config.paths.CClocation), "SourceFolder:" + encodeObj.dir, "OutputFolder:" + botsan.config.paths.outputfolder, "TempFolder:" + botsan.config.paths.temp, "Prefix:" + encodeObj.Episode.parent.prefix, "Episode:" + encodeObj.Episode.episodeno, "FileIndex:" + encodeObj.index, "QualityBuff:True", "Resolution:" + encodeObj.Episode.parent.quality, "debug:true"], {detached: true});
        //ls = botsan.spawn("cmd", ["/c"], { detached: true }); //Skip encode
        var line = ["/c", "start", "/min", botsan.path.normalize(botsan.config.paths.CClocation), "SourceFolder:" + encodeObj.dir, "OutputFolder:" + botsan.config.paths.outputfolder, "TempFolder:" + botsan.config.paths.temp, "Prefix:" + encodeObj.Episode.parent.prefix, "Episode:" + encodeObj.Episode.episodeno, "FileIndex:" + encodeObj.index, "QualityBuff:True", "Resolution:" + encodeObj.Episode.parent.quality, "debug:true"].join(" ");
        appendToCC(line);
    }
    //Spawn CC through shell
    else if (botsan.os.platform() == "linux") {

        var line = botsan.config.paths.MonoLocation + " " + botsan.config.paths.CClocation + " SourceFolder:\"" + encodeObj.dir + "\" OutputFolder:\"" + botsan.config.paths.outputfolder + "\" TempFolder:" + botsan.config.paths.temp + " Prefix:" + encodeObj.Episode.parent.prefix + " Episode:" + encodeObj.Episode.episodeno + " FileIndex:" + encodeObj.index + " Resolution:" + encodeObj.Episode.parent.quality + " ffmpeg:" + botsan.config.paths.ffmpeg + " mencoder:" + botsan.config.paths.mencoder + " mkvextract:" + botsan.config.paths.mkvextract + " mkvmerge:" + botsan.config.paths.mkvmerge + " debug:true";
        //Write the line in the cc file.
        appendToCC(line);
        ls = botsan.spawn("sh", ['-c', line], {detached: true}); //Todo: Change to variables
    }

    //Array so it can display more status for each episodes.
    botsan.updateData({Episode: encodeObj.Episode, Status: ["Transcoding"], Progress: 0});


    ls.stdout.on('data', function (data) {
        if (DEBUG) {
            console.log('stdout: ' + data);
        }
        //appendToCC(data);
    });

    ls.stderr.on('data', function (data) {
        //TODO: Show progress
        console.log('stderr: ' + data);
        //appendToCC(data);
    });
    ls.on('error', function (err) {
        if (err) {
            console.log(err);
            botsan.logError(err);
        }
    });

    //Todo: If the process closes with a different code than 0, stop watching files and output error.
    ls.on('close', function (code) {
        var status = botsan.getDataStatus(encodeObj.Episode);
        botsan.removeStrFromArr(status, "Transcoding");
        botsan.updateData({Episode: encodeObj.Episode, Status: status, Progress: 0});

        callback();
        //All encodes done, callback to tell async we're finished and continue with next episode.
    });

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
        botsan.updateData({Episode: encodedEp.Episode, Status: "In upload queue", Progress: 0});
    }

    in_ftp_queue.push(encodedEp.Episode.title);
    ftp_queue.push(encodedEp, function () {
        in_ftp_queue.splice(in_ftp_queue.indexOf(encodedEp.Episode.title), 1);
        //console.log(`removed ${encodedEp.filename} from upload queue.`);
    });
}

function appendToCC(str) {
    //Todo:
    //Check size of error log,
    //If it's larger than a certain size,
    //Create a new one.
    botsan.fs.appendFile('./cc.txt', str, function (err) {
        if (err) throw err;
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


        FTPc.list(uplObj.Episode.parent.prefix, function (err, list) {  //Check if the folder exists.
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


        //This checks if the highest quality is uploaded, but I need to make it check if all files are uploaded. TODO
        if (uplObj.quality == uplObj.Episode.parent.quality) {
            botsan.sendNotification(`@everyone ${uplObj.Episode.parent.title} #${uplObj.Episode.episodeno} was uploaded to Zeus`);
            uplObj.Episode.parent.finished_episodes.push(uplObj.Episode.episodeno);
            uplObj.Episode.parent.finished_episodes.sort(function (a, b) {
                return a - b
            });
            botsan.saveSettings(botsan.anime_list);
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
        FTPc.put(botsan.path.resolve(`${botsan.config.paths.outputfolder}/${uplObj.filename}`), uplObj.filename, function (err) {
            if (err) {
                botsan.logError(err);
                console.log(err);
            }

            var status = botsan.getDataStatus(uplObj.Episode);
            botsan.replaceStrInArr(status, `Uploading ${uplObj.quality}p to Zeus`, `${uplObj.quality}p upload Finished`);
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
    botsan.updateAppData({message: "Connected to Ray", id: -2});
    socket.emit('identification', {
        name: botsan.os.hostname(),
        queuelength: encode_queue.length() + download_queue.length(),
        maxdl: botsan.config.settings.SIMULTANEOUS_SCP,
        maxtcode: botsan.config.settings.SIMULTANEOUS_ENCODES
    });
    //TODO: Emit this only when changed.
    setInterval(function () {
        socket.emit('queuelength', encode_queue.length() + download_queue.length());
    }, 1000);
});

socket.on('episode', function (data) {
    var parent = botsan.getAnimeById(data.data.parent);
    if(!parent){
        socket.emit('getAnime', data.data.parent);
    }
});

socket.on('disconnect', function () {
    botsan.updateAppData({message: "Disconnected from Ray", id: -2});
});

socket.on('error', function (err) {
    if (err) {
        botsan.logError(err);
    }
});