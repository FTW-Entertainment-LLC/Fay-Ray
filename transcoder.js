/**
 * Created by Hani on 2016-11-03.
 */
function Transcoder() {
    this.fs = require('fs');
    this.ffmpeg = require('fluent-ffmpeg');

    //medium preset is normal
    this.options = {bitrate: 0, preset: 'veryfast', passlog: './transcoding/pass'};
}
Transcoder.prototype.processFile = function processFile(file_in, callback) {
    var videos = [];
    var audios = [];
    var subtitles = [];


    var options = this.options;

    this.ffmpeg.ffprobe(file_in, function(err, metadata){
        console.dir(metadata);
        for (var i = 0; i < metadata.format.nb_streams; i++) {
            if(metadata.streams[i].codec_type=='video'){
                videos.push(metadata.streams[i]);
            }
            if(metadata.streams[i].codec_type=='audio'){
                audios.push(metadata.streams[i]);
            }
        }

        if(videos.length>1){
            console.log("There's more than one video in this stream");
        }

        //Set the bitrate to be used.
        options.bitrate = Math.ceil(videos[0].width*videos[0].height/678);
        //options.bitrate = metadata.format.bit_rate;
        callback();

    });

}
Transcoder.prototype.run = function run(file_in, file_out, callback) {
    var ffmpeg = this.ffmpeg;
    var options = this.options;
    var path = require('path');
    var jsesc = require('jsesc');
    this.processFile(file_in, function(){
        console.log(options.bitrate, options.preset);
        new ffmpeg(file_in)
            .videoBitrate(options.bitrate)
            .videoCodec('libx264')
            .audioBitrate('128k')
            .audioCodec('aac')
            .addOptions(["-sn"])
            .format('mp4')
            //.addOptions(["-pass", "1", "-passlogfile", options.passlog])
            .addOptions(["-preset", options.preset])
            .addOptions(["-t", 120])
            .addOptions(["-report"])
            //escape hell for :()[]
            .addOptions(["-vf", `subtitles="${file_in.replace(/:/g, "\\\\:").replace(/\(/g, "\\\\(").replace(/\)/g, "\\\\)").replace(/\[/g, "\\'\\[\\'").replace(/\]/g, "\\'\\]\\'")}"`])
            .on('end', function() {
                //console.log('Pass 1 is finished');
                callback();
                /*new ffmpeg(file_in)
                    .videoBitrate(options.bitrate)
                    .videoCodec('libx264')
                    .aspect('16:9')
                    .audioBitrate('128k')
                    .audioCodec('aac')
                    .addOption('-vf', `subtitles="${file_in}"`)
                    .format('mp4')
                    .addOptions(["-pass", "2", "-passlogfile", options.passlog])
                    .addOptions(["-preset", options.preset])
                    .addOptions(["-t", 120])
                    .on('error', function(err) {
                        console.log('an error happened: ' + err.message);
                    })
                    .on('progress', function(progress){
                        console.log(`Pass 2: Processing: ${progress.percent}% done. (${progress.currentFps} fps)`);
                    })
                    .on('end', function(){
                        console.log('Pass 2 is finished');
                        callback();
                    })
                    .saveToFile(file_out);*/

            })
            .on('error', function(err) {
                console.log('an error happened: ' + err.message);
            })
            .on('progress', function(progress){
                console.log(`Pass 1: Processing: ${progress.percent}% done (${progress.currentFps} fps)`);
            })
            .on('start', function(commandLine) {
                console.log('Spawned Ffmpeg with command: ' + commandLine);
            })

            // save to file
            //On linux, use /dev/null
            //.save('NUL');
            .saveToFile(file_out);
    });



}

module.exports = Transcoder;