/**
 * Created by Enic on 2016-11-03.
 */
function Transcoder(botsan) {
    this.ffmpeg = require('fluent-ffmpeg');
    this.botsan = botsan;
    //medium preset is normal
    this.options = {bitrate: 0, preset: 'medium', passlog: './transcoding/pass', width: 854, height: 480};
}
var pass_interval = null;
var lastprogress_frm = null;
var pass = 1;

//TODO: (IMPORTANT) Add support for multiple resolutions.
//TODO: (IMPORTANT) Add namescheme
//TODO: (IMPORTANT) Check if ffmpeg hasn't returned a progress in one minute, it's most likely stuck. Restart
//TODO: (Not important) Support for 4/3 aspect ratio.

Transcoder.prototype.processFile = function processFile(file_in, options, callback) {
    //TODO: Check video stream, if it can be rewrapped instead of transcoded.
    //TODO: ^Same for audio (More important)
    //TODO: Check for several audio tracks, choose the one most suited. i.e japanese over any other language.
    //TODO: Check for several subtitles tracks, choose the one most suited. i.e english over any other language.
    //TODO: Allow choosing specific language tracks. This will have to be somehow controlled in the Web GUI (Sometimes they're mixed, where english is japanese, and japanese is english)
    //NOTE: Everything above is only suited for finished series. Most airing series only has one audio and subtitle track.
    //TODO: Send metadata to Web GUI

    var videos = [];
    var audios = [];
    var subtitles = []; //TODO
    pass = 1;

    this.ffmpeg.ffprobe(file_in, function (err, metadata) {
        //console.dir(metadata);
        for (var i = 0; i < metadata.format.nb_streams; i++) {
            if (metadata.streams[i].codec_type == 'video') {
                videos.push(metadata.streams[i]);
            }
            if (metadata.streams[i].codec_type == 'audio') {
                audios.push(metadata.streams[i]);
            }
            if (metadata.streams[i].codec_type == 'subtitle') {
                //TODO: See above. Otherwise unnecessary right now.
            }
        }

        if (videos.length > 1) {
            console.log("There's more than one video in this stream");
        }

        //Set the bitrate to be used.
        options.bitrate = Math.ceil(options.width * options.height / 678);
        //options.bitrate = metadata.format.bit_rate;
        callback();

    });

}

/*TODO: Replace file_out with episode object.
 Episode object should contain prefix, quality and episode number. The same object in Bot-san works just fine.
 If the quality is 1080, it should make a all 3 qualities. 720p makes two, and 480 makes one.
 There should be an option to only encode one or two qualities.
 TODO: change run() to transcode() and make a new run() function that handles the naming, quality grouping and etc.
 */
Transcoder.prototype.run = function run(source, episode){
    var thisres = 480;
    this.transcode(source, `${botsan.config.outputfolder}/${botsan.createFilename(episode.parent.prefix, episode.episodeno, thisres)}`, thisres, this.options, function(err){
        if(err)
            throw err;
    });
}
Transcoder.prototype.transcode = function transcode(file_in, file_out, quality, options, callback) {
    var ffmpeg = this.ffmpeg;
    //var options = this.options;
    var path = require('path');
    switch (quality) {
        case 1080:
            options.width = 1920;
            options.height = 1080;
            break;
        case 720:
            options.width = 1280;
            options.height = 720;
            break;
        case 480:
            options.width = 854;
            options.height = 480;
            break;
        default:
            callback(new Error('No supported quality value'));
    }
    this.processFile(file_in, options, function () {
        var command = new ffmpeg(file_in)
            .videoBitrate(options.bitrate)
            .videoCodec('libx264')
            .audioBitrate('128k')
            .audioCodec('aac')
            .addOptions(["-sn"])
            .size(`${options.width}x${options.height}`)
            .format('mp4')
            .addOptions(["-passlogfile", options.passlog])
            .addOptions(["-preset", options.preset])
            .addOptions(["-t", 60]) //Encode 120 frames only
            .addOptions("-tune animation")
            //.addOptions(["-report"])
            //escape hell for all characters in quote ":()[],"
            //[ has to be spawned to ffmpeg as '['
            .videoFilters({
                filter: "subtitles",
                options: `${file_in.replace(/:/g, "\\\\:").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/\[/g, "\'\[\'").replace(/\]/g, "\'\]\'").replace(/,/g, "\\,")}`
            })
            .on('error', FFmpegOnError)
            .on('progress', FFmpegOnProgress)
            .on('start', FFmpegOnStart)
            .on('end', function () {
                lastprogress_frm = null;
                clearInterval(pass_interval);
                callback();
            });

        //On linux, use /dev/null
        command.clone()
            .addOptions(["-pass", "1"])
            .on('error', FFmpegOnError)
            .on('progress', FFmpegOnProgress)
            .on('start', FFmpegOnStart)
            .on('end', function () {
                lastprogress_frm = null;
                pass++;
                clearInterval(pass_interval);
                command.addOptions(["-pass", "2"]).save(file_out);
            })
            .save('NUL');

    });

}



function printProgress(progress, message) {
    if (message)
        process.stdout.write(`${message} \t`);
    if (progress.percent)
        process.stdout.write(`Progress: ${Math.floor(progress.percent * 10) / 10}%\t`);
    if (progress.frames)
        process.stdout.write(`Frame: ${progress.frames}\t`);
    if (progress.currentFps)
        process.stdout.write(`Fps: ${progress.currentFps}\t`);
    if (progress.targetSize)
        process.stdout.write(`Target size: ${progress.targetSize}\t`);
    if (progress.timemark)
        process.stdout.write(`Timemark: ${progress.timemark}\t`);
    if (progress.currentKbps)
        process.stdout.write(`Current kbps: ${progress.currentKbps}\t`);
    console.log(); //new line
}

function restartFFmpeg(mylastprogress_frm, lastprogress_frm) {
    if (mylastprogress_frm != null && lastprogress_frm != null) {
        //If both variables are defined, check if they're the same.
        //If they're not, good. If they are, restart ffmpeg.
        if (mylastprogress_frm == lastprogress_frm) {
            console.log("FFmpeg froze, reset!");
            //Experimental
            command.kill();
            clearInterval(pass_interval);
            transcode(file_in, file_out, quality, callback);
            return;

        }
    }

    if (lastprogress_frm != null) {
        mylastprogress_frm = lastprogress_frm;
    }
}

function FFmpegOnError(err) {
    console.log('an error happened: ' + err.message);
}

function FFmpegOnProgress(progress) {
    printProgress(progress, `Pass (${pass})`);
    lastprogress_frm = progress.frames;
}

function FFmpegOnStart(commandLine) {
    console.log('Spawned Ffmpeg with command: ' + commandLine);
    //var mylastprogress_frm = null;
    //pass_interval = setInterval(restartFFmpeg(mylastprogress_frm, lastprogress_frm), 10000);
    //console.log(pass_interval);
}

module.exports = Transcoder;