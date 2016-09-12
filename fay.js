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

if (botsan.fs.existsSync(botsan.path.normalize("./downloaded.json"))) {
    try {
        downloaded_list = JSON.parse('./downloaded.json');
    } catch (e) {
        downloaded_list = [];
    }

}else{
    downloaded_list = [];
}

//Downloads are in a priority queue, with episode number as a priority. Downloads with lower 
var download_queue = botsan.async.priorityQueue(scpDownload, config.settings.SIMULTANEOUS_SCP);
var in_download_queue = [];
download_queue.drain = function() {
    scpClient.close();
};

//Encodes are in a priority queue, with episode number as a priority. Encodes with lower 
/*var encode_queue = botsan.async.priorityQueue(startEncoding, config.settings.SIMULTANEOUS_ENCODES);
var in_encode_queue = [];*/

var scpDefaults = {
    port: 22,
    host: config.scp.host,
    username: config.scp.username,
    passphrase: config.scp.passphrase,
    privateKey: botsan.fs.readFileSync(botsan.path.normalize(config.scp.privatekey)),
};


//Starts the queue on start, and then once every hour.
startQueue();
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
        botsan.updateAppData({ message: "Data scp client status: Connected \r\n", id: -2 });
    });
    scpClient.on('close', function () {
        botsan.updateAppData({ message: "Data scp client status: Disconnected \r\n", id: -2 });
    });

    scpClient.download(config.paths.seedbox+'/downloaded.json', './rays_data/downloaded.json', function(){
        botsan.updateAppData({ message: "Fay: Got downloads data from Ray", id: -1 });
        scpClient.download(config.paths.seedbox+'/savefile.json', './rays_data/ray_savefile.json', function(){
            botsan.updateAppData({ message: "Fay: Got downloads and savefile data from Ray", id: -1 });
            scpClient.close();
            processDownloads();
        });
    });


}

//Processes the downloaded.json file
function processDownloads(){
    var downloads = require('./rays_data/downloaded.json');
    downloads.forEach(function (download) {
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

function getSavefileDataById(id){
    var data = require('./rays_data/ray_savefile.json');

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
        //Last procedure, send callback in to the write download function.
        //If this is ever changed, move callback to right place.
        botsan.writeDownloads(downloaded_list, callback);
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