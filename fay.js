var bsan = require('./bot-san.js');
var Client  = require('scp2').Client;
var botsan = new bsan();
botsan.writeData();
//botsan.startConsole();




var config;
if (botsan.fs.existsSync(botsan.path.normalize("./config.ini"))) {
    config = botsan.ini.parse(botsan.fs.readFileSync('./config.ini', 'utf-8'));
}else{
    console.error("No config.ini file found!");
}

var DEBUG = false;

config.paths.downloads = botsan.path.normalize(config.paths.downloads)
if (!botsan.fs.existsSync(config.paths.downloads)) {
    botsan.fs.mkdirSync(config.paths.downloads);
}
if (!botsan.fs.existsSync('./rays_data')) {
    botsan.fs.mkdirSync('./rays_data');
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

//Downloads are in a priority queue, with episode number as a priority. Downloads with lower 
var download_queue = botsan.async.priorityQueue(scpDownload, config.settings.SIMULTANEOUS_SCP);
var in_download_queue = [];

//Encodes are in a priority queue, with episode number as a priority. Encodes with lower 
var encode_queue = botsan.async.priorityQueue(startEncoding, config.settings.SIMULTANEOUS_ENCODES);
var in_encode_queue = [];

var scpDefaults = {
    port: 22,
    host: config.scp.host,
    username: config.scp.username,
    passphrase: config.scp.passphrase,
    privateKey: botsan.fs.readFileSync(botsan.path.normalize(config.scp.privatekey)),
};


//Starts the queue on start, and then once every hour.
startQueue();
processDownloads();
var minutes = 5, the_interval = minutes * 60 * 1000;
setInterval(startQueue, the_interval);

function startQueue() {
    checkDownloads();
}

function checkDownloads(){
    botsan.updateAppData({ message: "Fay: Checking downloads on seedbox... ", id: -1 });

    var scpClient = new Client(scpDefaults);

    scpClient.on('error', function (err) {
        console.log(err);
        botsan.logError(err);
    });

    scpClient.on('connect', function () {
        botsan.updateAppData({ message: "Data scp client status: Connected", id: -2 });
    });
    scpClient.on('close', function () {
        botsan.updateAppData({ message: "Data scp client status: Disconnected", id: -2 });
    });

    scpClient.download(config.paths.seedbox+'/downloaded.json', './rays_data/downloaded.json', function(){
        botsan.updateAppData({ message: "Fay: Got downloads data from Ray", id: -1 });
        scpClient.download(config.paths.seedbox+'/savefile.json', './rays_data/ray_savefile.json', function(){
            botsan.updateAppData({ message: "Fay: Got downloads and savefile data from Ray", id: -1 });
            scpClient.close();
            processRaysDownloads();
        });
    });


}

//Processes the /rays_data/downloaded.json file
function processRaysDownloads(){
    var downloads = require('./rays_data/downloaded.json');
    downloads.forEach(function (download) {
        if(in_download_queue.indexOf(download.filename) >= 0 ||
           downloaded_list.indexOf(download.filename) >= 0 ||
           in_encode_queue.indexOf(download.filename) >= 0){
            return;
        }
        //Todo: Check own downloaded.json file to not download anything downloaded again.
        var anime = getSavefileDataById(download.uploadsID);
        if(anime){
            var episode = new botsan.Episode(download.filename, null, download.episodeno, anime);
            in_download_queue.push(episode.title);
            download_queue.push({ download: download, episode: episode}, episode.episodeno, function () {
                //Remove it from in_download_queue when done.
                in_download_queue.splice(in_download_queue.indexOf(episode.title), 1);
            });
            botsan.updateData({ Episode: episode, Status: "In download queue", Progress: 0 });
        }
    });

}

//Processes the /downloaded.json file, these will be sent to the encoded queue
function processDownloads(){
    downloaded_list.forEach(function (download) {
        if(in_encode_queue.indexOf(download.filename) >= 0){
            return;
        }
        var anime = getSavefileDataById(download.uploadsID);
        if(anime){
            var episode = new botsan.Episode(download.filename, null, download.episodeno, anime);
            onDoneDownloading(episode);
        }
    });

}

function getSavefileDataById(id){
    var data = null;
    try {
        data = JSON.parse(botsan.fs.readFileSync('./rays_data/ray_savefile.json', 'utf8'));
    } catch (e) {
        botsan.logError(e);
        return null;
    }

    for (var key in data) {
        if(data[key].uploadsID == id){
            return data[key];
        }
    }
    return null;

}

function scpDownload(object, callback){
    botsan.updateData({ Episode: object.episode, Status: "Starting Download", Progress: 0 });

    var privScpClient = new Client(scpDefaults);

    privScpClient.download(config.paths.seedbox+'/torrents/'+object.download.filename, config.paths.downloads+'/'+object.download.filename, function(){
        botsan.updateData({ Episode: object.episode, Status: "Download complete", Progress: 0 });
        var downloadedObj = new botsan.downloaded(object.episode.parent.uploadsID, object.download.filename, object.episode.episodeno);
        downloaded_list.push(downloadedObj);
        privScpClient.close();
        //Last procedure, send callback in to the write download function.
        //If this is ever changed, move callback to right place.
        botsan.writeDownloads(downloaded_list, callback);
        
        onDoneDownloading(object.episode);

    });

    //TODO: Track progress when scp adds support for it.
    /*privScpClient.on('transfer', function (bytes, total) {
        botsan.updateData({ Episode: object.episode, Status: "Downloading", Progress: ((bytes/total) * 100).toFixed(2) })
    });*/

    privScpClient.on('connect', function () {
        botsan.updateData({ Episode: object.episode, Status: "Downloading ", Progress: 0 })
    });

    privScpClient.on('error', function (err) {
        console.log(err);
        botsan.logError(err);
    });


}

function onDoneDownloading(Episode) {
    botsan.updateData({ Episode: Episode, Status: "Download Finished", Progress: 0 });
    botsan.fs.readdir(botsan.path.normalize(config.paths.downloads), function (err, files) {
        if (err) {
            logError(err);
            throw (err);
        }
        var index = 0;
        /*Look for the file in the whole torrents folder, then
         * get the index for it, and send it off to the encode queue */
        for (index; index < files.length; index++) {
            if (files[index] == Episode.title) {
                in_encode_queue.push(Episode.title);
                encode_queue.push({ Episode: Episode, index: index }, Episode.episodeno, function () {
                    in_encode_queue.splice(in_encode_queue.indexOf(Episode.title), 1);
                });
                botsan.updateData({ Episode: Episode, Status: "In transcoding queue", Progress: 0 });
                break;
            }

        }
    });
}

//encodeObj
//episode
//fileindex
function startEncoding(encodeObj, callback) {
    //destination, Episode, index
    //Gets the full path

    var folderpath = botsan.path.normalize(botsan.path.resolve(config.paths.torrentfolder));



    botsan.updateData({ Episode: encodeObj.Episode, Status: "Transcoding", Progress: 0 });


    //Write the time
    appendToCC(botsan.getTime() + ":\r\n");
    //Spawn CC through cmd
    var ls = "";
    if (botsan.os.platform() == "win32") {
        ls = botsan.spawn("cmd", ["/c", "start", "/min", botsan.path.normalize(config.paths.CClocation), "SourceFolder:" + folderpath, "OutputFolder:" + botsan.path.normalize(config.paths.outputfolder), "TempFolder:"+config.paths.temp, "Prefix:" + encodeObj.Episode.parent.prefix, "Episode:" + encodeObj.Episode.episodeno, "FileIndex:" + encodeObj.index, "QualityBuff:True", "Resolution:" + encodeObj.Episode.parent.quality , "debug:true"], { detached: true });
        //ls = botsan.spawn("cmd", ["/c"], { detached: true }); //Skip encode
        var line = ["/c", "start", "/min", botsan.path.normalize(config.paths.CClocation), "SourceFolder:" + folderpath, "OutputFolder:" + botsan.path.normalize(config.paths.outputfolder), "TempFolder:"+config.paths.temp, "Prefix:" + encodeObj.Episode.parent.prefix, "Episode:" + encodeObj.Episode.episodeno, "FileIndex:" + encodeObj.index, "QualityBuff:True", "Resolution:" + encodeObj.Episode.parent.quality , "debug:true"].join(" ");
        appendToCC(line);
    }
    //Spawn CC through shell
    else if (botsan.os.platform() == "linux") {

        var line = config.paths.MonoLocation + " " + config.paths.CClocation + " SourceFolder:" + folderpath + " OutputFolder:" + botsan.path.normalize(config.paths.outputfolder) + " TempFolder:"+config.paths.temp+" Prefix:" + encodeObj.Episode.parent.prefix + " Episode:" + encodeObj.Episode.episodeno + " FileIndex:" + encodeObj.index + " Resolution:" + encodeObj.Episode.parent.quality + " ffmpeg:"+config.paths.ffmpeg+" mencoder:"+config.paths.mencoder+" mkvextract:"+config.paths.mkvextract+" mkvmerge:"+config.paths.mkvmerge+" debug:true";
        //Write the line in the cc file.
        appendToCC(line);
        ls = botsan.spawn("sh", ['-c', line], { detached: true }); //Todo: Change to variables
    }
    
    //Todo: watch the files prefix_(quality_)?episodeno_ns.mp4
    //When found, create the transcoded object, add it to the transcoded array and send it to FTP.
    

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

    //Todo: If the process closes with a different code than 0, stop watching files and output error.
    ls.on('close', function (code) {
        botsan.updateData({ Episode: encodeObj.Episode, Status: "Transcode finished", Progress: 0 });
    });

}

function appendToCC(str){
    //Todo:
    //Same as above 
    botsan.fs.appendFile('./cc.txt', str, function (err) {
        if (err) throw err;
    });
}