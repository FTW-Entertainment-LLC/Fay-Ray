var bsan = require('./bot-san.js');
var Client  = require('scp2').Client;
var botsan = new bsan();
botsan.startConsole();




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

if (botsan.fs.existsSync(botsan.path.normalize("./savefile.json"))) {
    anime_list = require('./savefile.json');
}

//Downloads are in a priority queue, with episode number as a priority. Downloads with lower 
var download_queue = botsan.async.priorityQueue(scpDownload, config.settings.SIMULTANEOUS_SCP);
var in_download_queue = [];

//Encodes are in a priority queue, with episode number as a priority. Encodes with lower 
/*var encode_queue = botsan.async.priorityQueue(startEncoding, config.settings.SIMULTANEOUS_ENCODES);
var in_encode_queue = [];*/

var scpClient = new Client({
    port: 22,
    host: config.scp.host,
    username: config.scp.username,
    passphrase: config.scp.passphrase,
    privateKey: botsan.fs.readFileSync(config.scp.privatekey),
});

scpClient.on('error', function (err) {
    console.log(err);
    botsan.logError(err);
});


//Starts the queue on start, and then once every hour.
startQueue();
var minutes = 5, the_interval = minutes * 60 * 1000;
setInterval(startQueue, the_interval);

function startQueue() {
    checkDownloads();
}

function checkDownloads(){
    botsan.updateAppData({ message: "Fay: Checking downloads on seedbox... ", id: -1 });
    scpClient.download(config.paths.seedbox+'/downloaded.json', 'downloaded.json', function(){
        botsan.updateAppData({ message: "Fay: Got downloads data from Ray", id: -1 });
        scpClient.download(config.paths.seedbox+'/savefile.json', 'ray_savefile.json', function(){
            botsan.updateAppData({ message: "Fay: Got downloads and savefile data from Ray", id: -1 });
            processDownloads();
        });
    });


}

//Processes the downloaded.json file
function processDownloads(){
    var downloads = require('./downloaded.json');
    for (var key in downloads) {
        var anime = getSavefileDataById(downloads[key].uploadsID);
        if(anime){
            var episode = new botsan.Episode(downloads[key].filename, null, downloads[key].episodeno, anime);
            in_download_queue.push(episode.title);
            download_queue.push({ download: downloads[key], episode: episode}, episode.episodeno, function () {
                //Remove it from in_download_queue when done.
                in_download_queue.splice(in_download_queue.indexOf(episode.title), 1);
                botsan.updateData({ Episode: episode, Status: "Finished Download", Progress: 0 });
            });
            botsan.updateData({ Episode: episode, Status: "In downloading queue", Progress: 0 });
            console.log("Added ep: "+episode.episodeno)
        }
    }

}

function getSavefileDataById(id){
    var data = require('./ray_savefile.json');

    for (var key in data) {
        if(data[key].uploadsID == id){
            return data[key];
        }
    }
    return null;

}

function scpDownload(object, callback){
    botsan.updateData({ Episode: object.episode, Status: "Starting download", Progress: 0 });
    callback();
}