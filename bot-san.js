var feed = require("feed-read")
, async = require('async')
  , WebTorrent = require('webtorrent')
  , fs = require('fs')
  , ini = require('ini')
  , spawn = require('child_process').spawn
  , exec = require('child_process').exec
  , path = require('path')
  , colors = require('colors')
  , events = require("events")
  , FClient = require('ftp')
  , domain = require('domain')
  , d = domain.create()
  , os = require('os')
  , EventEmitter = require("events").EventEmitter
  , ee = new EventEmitter()
  , date = new Date()
  , tclient = new WebTorrent();
/* Todo:
 * Episodes are pushed two or three times to finished_episodes when encoding 720/1080p
 * 
 * 
 * 
 * 
 * */
var episode_status = [];
var application_status = [];
var config;
if (fs.existsSync(path.normalize("./config.ini"))) {
  config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'));
}else{
  console.error("No config.ini file found!");
}

/*var CClocation = path.normalize("C:/Users/Hani/Downloads/cc2/CancerCoder.exe");
if (os.platform() == "linux") {
    CClocation = path.normalize("/home/hani/Downloads/CancerCoder-Unix/CancerCoder.exe");   
}

var MonoLocation = path.normalize("/opt/mono/bin/mono");

var outputfolder = path.normalize("C:/Users/Hani/Documents/visual studio 2015/Projects/bot-san/bot-san/encoded");
if (os.platform() == "linux") {
    outputfolder = path.normalize("/home/hani/Downloads/bot-san/encoded");
}
var SIMULTANEOUS_FTP_UPLOADS = 4;
var MAX_SIMULTANEOUS_DOWNLOADS = 10;
var SIMULTANEOUS_NYAA_CHECKS = 4;
var SIMULTANEOUS_ENCODES = 1;*/
var DEBUG = false;





var ftp_queue = async.queue(upload_file, config.settings.SIMULTANEOUS_FTP_UPLOADS);
var in_ftp_queue = []; //Contains the torrenturl of each episode in the list.
//Iterating through the original queues to find episodes didn't work out as well as I'd loved, so I made this as a quickfix.
//I might try to remove these arrays and use the original queues in the future, but to save me headaches now I'm doing it this way.
var nyaa_queue = async.queue(checkNyaa, config.settings.SIMULTANEOUS_NYAA_CHECKS);

//Encodes are in a priority queue, with episode number as a priority. Encodes with lower 
var encode_queue = async.priorityQueue(startEncoding, config.settings.SIMULTANEOUS_ENCODES);
var in_encode_queue = [];
var torrent_queue = async.queue(downloadEpisodes, config.settings.MAX_SIMULTANEOUS_DOWNLOADS);
var in_torrent_queue = [];



var Episode = function (title, torrenturl, episodeno, parent) {
  this.title = title; //The title of the nyaa listing
  this.episodeno = episodeno; // Episode number of the nyaa listing
  this.torrenturl = torrenturl; //Torrent url of the nyaa listing
  this.parent = parent; //Reference to the anime object.
};

var Anime = function (title, prefix, regex, nyaasearch, nyaauser, uploadsID, episode, quality) {
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

var url = 'http://v4.aftw.ftwdevs.com/api/v2?devkey='+config.api.devkey+'&username='+config.api.username+'&password='+config.api.password;

d.on('error', function (err) {
  console.error(err);
  logError(err);
});

var anime_list = [];

//var a = new Anime("Military!", "military", "\\[Commie\\] Military! - (\\d{2}) \\[.*\\].mkv", "Military%21", 76430, 720, {});
//var b = new Anime("Shimoneta: A Boring World Where the Concept of Dirty Jokes Doesn`t Exist", "shimonetaaboringworldwheretheconceptofdirtyjokesdoesntexist", "\\[Hiryuu\\] Shimoneta to Iu Gainen ga Sonzai Shinai Taikutsu na Sekai - (\\d{2}) \\[720p H264 AAC\\].*.mkv", "Shimoneta+to+Iu+Gainen+ga+Sonzai+Shinai+Taikutsu+na+Sekai", 89764, 0, 0)

//anime_list.push(a);
//saveSettings();

//Todo: Check if files on FTP are the same size as local files.


if (!fs.existsSync(path.normalize(config.paths.torrentfolder))) {
  fs.mkdirSync(path.normalize(config.paths.torrentfolder));
}
if (!fs.existsSync(path.normalize(config.paths.outputfolder))) {
  fs.mkdirSync(path.normalize(config.paths.outputfolder));
}
if (fs.existsSync(path.normalize("./savefile.json"))) {
  anime_list = require('./savefile.json');
}


var aftwtoken = "";

updateAppData({ message: "System running on: " + os.platform(), id: 10101929 });

//Starts the queue on start, and then once every hour.
startQueue();
var minutes = 30, the_interval = minutes * 60 * 1000;
setInterval(startQueue, the_interval);

//drain() a callback that is called when the last item from the queue has returned from the worker.

function startQueue() {
  nyaa_queue.push(anime_list);
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

  feed(nyaaurl, function (err, articles) {

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
          updateAppData({ message: "Bot-san: Regex pattern is invalid for: " + series.title, id: series.uploadsID });
        }
        var result = article.title.match(pattern);

        if (result == null) {
          return;
        }

        if (series.finished_episodes.indexOf(parseInt(result[1], 10 /*base 10*/)) != -1) {
          //Don't continue if this episode has already been uploaded.
          return;
        }

        if (in_torrent_queue.indexOf(article.link) >= 0 || in_encode_queue.indexOf(article.link) >= 0 || in_ftp_queue.indexOf(article.link) >= 0) {
          //Don't continue if the episode is in any of the above lists.
          return;
        }

        found++;
        var e = new Episode(article.title, article.link, parseInt(result[1]), series); //Parse the episode number to a integer.

        updateData({ Episode: e, Status: "In Torrent Queue", Progress: 0 });

        in_torrent_queue.push(e.torrenturl);
        torrent_queue.push(e, function () {
          //Remove the episode from the in_queue when done.
          in_torrent_queue.splice(in_torrent_queue.indexOf(e.torrenturl), 1);
        });

      });
      var foundeps = found;
      if (found > 0) {
        foundeps = colors.green(found);
      }
      updateAppData({ message: "Bot-san: I found " + foundeps + " new episodes for: " + series.title, id: series.uploadsID });
      callback();
    } else {
      callback(new Error("There was nothing in the rss feed."));
    }

  });

}
function downloadEpisodes(Episode, callback) {
  //Don't add the torrent if it's already in the client.
  if (!tclient.get(Episode.torrenturl)) {
    tclient.add(Episode.torrenturl, { path: path.resolve(config.paths.torrentfolder) }, function (torrent) {
      onTorrentAdd(torrent, Episode, callback);
    });
  } else {
    callback();
  }



}

function onTorrentAdd(torrent, Episode, callback) {
  updateData({ Episode: Episode, Status: "Starting Download", Progress: Math.floor(torrent.progress * 100) });
  //Go through all the files in the torrent and download the one one I need
  /*torrent.files.forEach(function ontorrent(file) {

        //Todo: Check for video files, we don't need to download anything else.

    });*/
  torrent.swarm.on('download', function () {

    updateData({ Episode: Episode, Status: "Downloading", Progress: Math.floor(torrent.progress * 100) });

  })
  torrent.on('done', function (err) {
    if (err) {
      console.log(err);
      logError(err);
    }
    torrent.files.forEach(function (file) {
      //Todo: Add only video files
      onDoneDownloading(file, Episode);
    });

    //Todo:
    //Gather knowledge on webtorrent to know if removing a torrent from the client is necessary
    /*tclient.remove(Episode.torrenturl, function (err) {
            if (err) {
                console.log(err);
                logError(err);
            }
        });*/
    callback();
  });


}

function onDoneDownloading(file, Episode) {
  updateData({ Episode: Episode, Status: "Download Finished", Progress: 0 });
  fs.readdir(path.normalize(config.paths.torrentfolder), function (err, files) {
    if (err) {
      logError(err);
      throw (err);
    }
    var index = 0;
    /*Look for the file in the whole torrents folder, then
         * get the index for it, and send it off to the encode queue */
    for (index; index < files.length; index++) {
      if (files[index] == file.name) {
        in_encode_queue.push(Episode.torrenturl);
        encode_queue.push({ file: file, Episode: Episode, index: index }, Episode.episodeno, function () {
          in_encode_queue.splice(in_encode_queue.indexOf(Episode.torrenturl), 1);
        });
        updateData({ Episode: Episode, Status: "In Encoding Queue", Progress: 0 });
        break;
      }

    }
  });
}
function startEncoding(encodeObj, callback) {
  //destination, Episode, index
  //Gets the full path

  var folderpath = path.normalize(path.resolve(config.paths.torrentfolder));



  updateData({ Episode: encodeObj.Episode, Status: "Encoding", Progress: 0 });


  //Write the time
  appendToCC(getTime() + ":\r\n");
  //Spawn CC through cmd
  var ls = "";
  if (os.platform() == "win32") {
    ls = spawn("cmd", ["/c", "start", "/min", path.normalize(config.paths.CClocation), "SourceFolder:" + folderpath, "OutputFolder:" + path.normalize(outputfolder), "TempFolder:C:\\tempfolder", "Prefix:" + encodeObj.Episode.parent.prefix, "Episode:" + encodeObj.Episode.episodeno, "FileIndex:" + encodeObj.index, "QualityBuff:True", "Resolution:" + encodeObj.Episode.parent.quality , "debug:true"], { detached: true });
    //ls = spawn("cmd", ["/c"], { detached: true }); //Skip encode
  }
  //Spawn CC through shell
  else if (os.platform() == "linux") {

    var line = config.paths.MonoLocation + " " + config.paths.CClocation + " SourceFolder:" + folderpath + " OutputFolder:" + path.normalize(outputfolder) + " TempFolder:/home/temp Prefix:" + encodeObj.Episode.parent.prefix + " Episode:" + encodeObj.Episode.episodeno + " FileIndex:" + encodeObj.index + " Resolution:" + encodeObj.Episode.parent.quality + " ffmpeg:"+config.paths.ffmpeg+" mencoder:"+config.paths.mencoder+" mkvextract:"+config.paths.mkvextract+" mkvmerge:"+config.paths.mkvmerge+" debug:true";
    //Write the line in the cc file.
    appendToCC(line);
    ls = spawn("sh", ['-c', line], { detached: true }); //Todo: Change to variables
  }

  ls.stdout.on('data', function (data) {
    if (DEBUG) {
      console.log('stdout: ' + data);
    }
    appendToCC(data);
  });

  ls.stderr.on('data', function (data) {
    console.log('stderr: ' + data);
    appendToCC(data);
  });
  ls.on('error', function (err) {
    if (err) {
      console.log(err);
      logError(err);
    }
  });

  ls.on('close', function (code) {
    onCCClose(code, encodeObj.Episode, function (err) {
      if (err) {
        logError(err);
        console.log(err);
        throw err;
      }
      appendToCC("\r\n\r\n");
      callback();
    });
  });

}

if (process.platform === "win32") {
  var rl = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.on("SIGINT", function () {
    process.emit("SIGINT");
  });
}

process.on('SIGINT', function () {
  if (process.platform === "win32") {
    spawn("taskkill", ["/im", "CancerCoder.exe", '/f', '/t']);
  }
  process.exit();
})
function onCCClose(code, Episode, callback) {
  //console.log('child process exited with code ' + code);

  if (code == 0) {
    //Check if outputted file(s) exists!
    updateData({ Episode: Episode, Status: "Encode finished", Progress: 0 });
    var filepaths = [];
    filepaths.push(path.resolve(config.paths.outputfolder + Episode.parent.prefix + "_" + Episode.episodeno + "_ns.mp4"));
    if (Episode.parent.quality >= 720) {
      filepaths.push(path.resolve(config.paths.outputfolder + Episode.parent.prefix + "_720p_" + Episode.episodeno + "_ns.mp4"));
    }
    if (Episode.parent.quality == 1080) {
      filepaths.push(path.resolve(config.paths.outputfolder + Episode.parent.prefix + "_1080p_" + Episode.episodeno + "_ns.mp4"));
    }

    filepaths.forEach(function (i) {
      fs.exists(i, function (exists) { sendToFTP(exists, i, Episode); });
    });
    callback();

  } else {
    updateData({ Episode: encodeObj.Episode, Status: "Episode didn't encode properly", Progress: 0 });
    callback(new Error("Episode didn't encode correctly"));
  }


}

function sendToFTP(exists, filepath, Episode) {
  if (exists) {
    //Now we can upload the file!
    updateData({ Episode: Episode, Status: "Uploading Queue", Progress: 0 });

    in_ftp_queue.push(Episode.torrenturl);
    ftp_queue.push({ filepath: filepath, Episode: Episode }, function () {
      in_ftp_queue.splice(in_ftp_queue.indexOf(Episode.torrenturl), 1);
    });
  } else {
    updateData({ Episode: Episode, Status: "Encode failed: " + filepath + " doesn't exist", Progress: 0 });
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

  FTPc.connect({ host: config.ftp.host, port: 21, user: config.ftp.user, password: config.ftp.password });

  FTPc.on('ready', function () {
    updateData({ Episode: uplObj.Episode, Status: "Uploading to Zeus", Progress: 0 });
    FTPc.binary(function (err) { if (err) throw err; });



    FTPc.list(uplObj.Episode.parent.prefix, function (err, list) {  //Check if the folder exists.
      if (err) {
        logError(err);
        console.log(err);
        throw err;
      }
      if (list.length == 0) { //If there's no prefix directory, lets create one.
        FTPc.mkdir(uplObj.Episode.parent.prefix, function (err) {
          if (err) {
            logError(err);
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
      logError(err);
      if (err.code == 421) {
        //Todo
        //Too many connections
      }
      console.log(err);
      throw err;
    };
  });
  FTPc.on('end', function (err) {
    if (err) {
      logError(err);
      throw err;
    }

    //Check series quality, and if all of them are uploaded, then do this operation: 

    updateAppData({ message: uploadObj, id: 10101930 });
    uplObj.Episode.parent.finished_episodes.push(uplObj.Episode.episodeno);

    saveSettings();
    callback();
  });


}

function uploadOp(uplObj, FTPc) {
  FTPc.cwd(uplObj.Episode.parent.prefix, function (err) {
    if (err) {
      logError(err);
      console.log(err);
    }
    var parsed_path = path.parse(uplObj.filepath);
    FTPc.put(uplObj.filepath, parsed_path.base, function (err) {
      if (err) {
        logError(err);
        console.log(err);
      }
      updateData({ Episode: uplObj.Episode, Status: "Upload Finished", Progress: 0 });
      FTPc.end();
    });
  });
}


function saveSettings() {
  var outputFilename = path.normalize('./savefile.json');

  fs.writeFile(outputFilename, JSON.stringify(anime_list, null, 4), function (err) {
    if (err) {
      logError(err);
      console.log(err);
    } else {
    }
  });
}

function updateData(Obj) {
  var index = -1;
  var counter;
  Obj.time = new Date().toISOString();
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
function updateAppData(Obj) {
  var index = -1;
  var counter;
  Obj.time = getTime();
  application_status.forEach(function (i) {
    if (i.id == Obj.id) {
      i.message = Obj.message;
      i.time = Obj.time;
      index = counter;
    }
    counter++;
  });

  if (index == -1) {

    application_status.push(Obj);
  }
}

setInterval(function () {
  writeData();
}, 1000);
function writeData() {
  if (os.platform() == "win32") {
    process.stdout.write("\u001b[2J\u001b[0;0H");
  }
  else if (os.platform() == "linux") {
    process.stdout.write('\033[2J\033[1;1H');
  }

  application_status.forEach(function (i) {

    console.log("(" + i.time + ")  " + i.message);
  });
  if (application_status.length > 0) {
    console.log();
  }
  episode_status.forEach(function (i) {
    var showprogress = "";
    if (i.Status == "Downloading" || i.Status == "Starting Download") {
      showprogress = "(" + i.Progress + "%)";
    }
    console.log(i.Episode.parent.title, i.Episode.episodeno, "-", i.Status, showprogress);
  });

}

function getTime() {
  var d = new Date();
  d.setUTCHours(d.getUTCHours() + 2);
  return d.toISOString().replace(/T/, ' ').replace(/\..+/, '');
}

function logError(err) {

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

  fs.appendFile('./error.txt', getTime() + ":" + message + "\r\n\r\n", function (err) {
    if (err) throw err;

    console.log('The "', err, '" was appended to file!');
  });
}

function appendToCC(str){
  //Todo:
  //Same as above 
  fs.appendFile('./cc.txt', str, function (err) {
    if (err) throw err;
  });
}