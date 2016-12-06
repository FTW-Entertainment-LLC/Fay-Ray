/**
 * Created by Enic on 2016-11-03.
 */
"use strict"
function Transcoder(botsan) {
    this.ffmpeg = require('fluent-ffmpeg');
    this.botsan = botsan;
    //medium preset is normal
    this.options = {bitrate: 0, preset: 'medium', passlog: `${botsan.config.paths.temp}/`, width: 854, height: 480, transcoder: this};
    this.episode = null;
    this.transcode_queue = botsan.async.queue(this.transcode_task, 1);
    this.pass_interval = null;
    this.lastprogress_frm = null;
    this.pass = 1;
}

//var transcoder = this;

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
    //subtitles is currently only used to know if it should burn it.
    var subtitles = [];
    this.pass = 1;

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
                subtitles.push(metadata.streams[i]);
            }
        }

        if (videos.length > 1) {
            console.log("There's more than one video in this stream");
        }
        if(subtitles.length==0){
            options.subtitle = false;
        } else {
            options.subtitle = true;
        }

        //Set the bitrate to be used.
        //TODO: FFMPEG can calculate width automatically, so I can remove the width option. However this calculation requires the width. Calculate the width by the aspect ratio from the ffprobe data
        options.bitrate = Math.ceil(options.width * options.height / 678);
        //options.bitrate = metadata.format.bit_rate;
        callback();

    });

}

/*

 */
Transcoder.prototype.getResolutions = function getResolutions(resolution){
    var resolutions = [];
    if(resolution===1080){
        resolutions.push(1080);
    }
    if(resolution>=720){
        resolutions.push(720);
    }
    if(resolution>=480){
        resolutions.push(480);
    }
    return resolutions;
}

/*
 TODO: There should be an option to only encode one or two qualities.
 */
Transcoder.prototype.run = function run(source, episode, callback){
    var resolutions = this.getResolutions(episode.parent.quality);
    this.episode = episode;
    var transcoded_resolutions = [];
    for(var i = 0; i<resolutions.length; i++){
        var task = {transcoder: this, file_in: source, file_out: `${this.botsan.config.paths.temp}/${this.botsan.createFilename(episode.parent.prefix, episode.episodeno, resolutions[i])}`, resolution: resolutions[i]};
        this.transcode_queue.push(task, function(resolution){
            transcoded_resolutions.push(resolution);
            if(transcoded_resolutions.length==resolutions.length){
                //Callback to Fay when all transcodes are finished.
                callback();
            }
        });
    }
}

Transcoder.prototype.transcode = function transcode(file_in, file_out, resolution, options, callback) {
    var ffmpeg = this.ffmpeg;
    var transcoder = this;
    //var options = this.options;
    var path = require('path');
    switch (resolution) {
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
            callback(new Error('No supported resolution value'));
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
            .addOptions(["-passlogfile", options.passlog+options.transcoder.botsan.path.parse(file_out).name])
            .addOptions(["-preset", options.preset])
            //.addOptions(["-t", 10]) //encode number seconds only
            .addOptions("-tune animation")
            .addOptions("-threads 24")
            //.addOptions(["-report"])
            //escape hell for all characters in quote ":()[],"
            //[ has to be spawned to ffmpeg as '['
            .on('error', function(err){transcoder.FFmpegOnError(err)})
            .on('progress', function(p){transcoder.FFmpegOnProgress(p)})
            .on('start', function(cmd){transcoder.FFmpegOnStart(cmd)})
            .on('end', function () {
                this.lastprogress_frm = null;
                clearInterval(this.pass_interval);
                options.transcoder.botsan.fs.rename(file_out, `${options.transcoder.botsan.config.paths.outputfolder}/${options.transcoder.botsan.path.basename(file_out)}`, function(err){
                    if(err)
                        options.transcoder.botsan.logError(err);
                    callback(resolution);
                })
            });
        var nullpath = 'NUL';
        if(options.transcoder.botsan.os.platform() == "linux"){
            nullpath = '/dev/null';
        }
        if(options.subtitle){
            command.videoFilters({
                filter: "subtitles",
                options: `${file_in.replace(/\\/g, "/").replace(/:/g, "\\\\:").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/\[/g, "\'\[\'").replace(/\]/g, "\'\]\'").replace(/,/g, "\\,")}`
            });
        }

        command.clone()
            .addOptions(["-pass", "1"])
            .on('error', function(err){transcoder.FFmpegOnError(err)})
            .on('progress', function(p){transcoder.FFmpegOnProgress(p)})
            .on('start', function(cmd){transcoder.FFmpegOnStart(cmd)})
            .on('end', function () {
                this.lastprogress_frm = null;
                this.pass++;
                clearInterval(this.pass_interval);
                command.addOptions(["-pass", "2"]).save(file_out);
            })
            //On linux, use /dev/null
            .save(nullpath);

    });

}

Transcoder.prototype.transcode_task = function transcode_task(task, callback){
    task.transcoder.transcode(task.file_in, task.file_out, task.resolution, task.transcoder.options, callback);
}

Transcoder.prototype.printProgress = function printProgress(progress, message) {
    var line = "";
    if (message)
        line += `${message} \t`;
    if (progress.percent)
        line += `Progress: ${Math.floor(progress.percent * 10) / 10}%\t`;
    if (progress.frames)
        line += `Frame: ${progress.frames}\t`;
    if (progress.currentFps)
        line += `Fps: ${progress.currentFps}\t`;
    if (progress.targetSize)
        line += `Target size: ${progress.targetSize}\t`;
    if (progress.timemark)
        line += `Timemark: ${progress.timemark}\t`;
    if (progress.currentKbps)
        line += `Current kbps: ${progress.currentKbps}\t`;

    var status = this.botsan.getDataStatus(this.episode);
    if (!Array.isArray(status)) {
        if(status=="Transcoding"){
            status = ["Transcoding: ", line];
        }
    }else {
        if(status.length>=2){
            status[1] = line;
        }
    }
    this.botsan.updateData({Episode: this.episode, Status: status, Progress: 0});
    //console.log(line); //new line
}

function restartFFmpeg(mylastprogress_frm, lastprogress_frm) {
    if (mylastprogress_frm != null && lastprogress_frm != null) {
        //If both variables are defined, check if they're the same.
        //If they're not, good. If they are, restart ffmpeg.
        if (mylastprogress_frm == lastprogress_frm) {
            console.log("FFmpeg froze, reset!");
            //Experimental
            command.kill();
            clearInterval(this.pass_interval);
            transcode(file_in, file_out, resolution, callback);
            return;

        }
    }

    if (lastprogress_frm != null) {
        mylastprogress_frm = lastprogress_frm;
    }
}

Transcoder.prototype.FFmpegOnError = function FFmpegOnError(err) {
    this.botsan.logError(err);
}

Transcoder.prototype.FFmpegOnProgress = function FFmpegOnProgress(progress) {
    this.printProgress(progress, `Pass (${this.pass}) ${this.options.height}p`);
    this.lastprogress_frm = progress.frames;
}

Transcoder.prototype.FFmpegOnStart = function FFmpegOnStart(commandLine) {
    console.log('Spawned Ffmpeg with command: ' + commandLine);
    this.botsan.log(`${commandLine}\r\n\r\n`);
    //var mylastprogress_frm = null;
    //pass_interval = setInterval(restartFFmpeg(mylastprogress_frm, this.lastprogress_frm), 10000);
    //console.log(pass_interval);
}

module.exports = Transcoder;