/**
 * Created by Hani on 2016-11-03.
 */
function Transcoder() {
    this.fs = require('fs');
    this.ffmpeg = require('fluent-ffmpeg');

    //medium preset is normal
    this.options = {bitrate: 0, preset: 'medium', passlog: './transcoding/pass'};
}
//TODO: (IMPORTANT) Add support for multiple resolutions.
//TODO: (IMPORTANT) Add namescheme

Transcoder.prototype.processFile = function processFile(file_in, callback) {
    //TODO: Check video stream, if it can be rewrapped instead of transcoded.
    //TODO: ^Same for audio (More important)
    //TODO: Check for several audio tracks, choose the one most suited. i.e japanese over any other language.
    //TODO: Check for several subtitles tracks, choose the one most suited. i.e english over any other language.
    //TODO: Allow choosing specific language tracks. This will have to be somehow controlled in the Web GUI (Sometimes they're mixed, where english is japanese, and japanese is english)
    //TODO: Send metadata to Web GUI
    //NOTE: Everything above is only suited for finished series. Most airing series only has one audio and subtitle track.
    var videos = [];
    var audios = [];
    var subtitles = [];

    var options = this.options;

    this.ffmpeg.ffprobe(file_in, function(err, metadata){
        //console.dir(metadata);
        for (var i = 0; i < metadata.format.nb_streams; i++) {
            if(metadata.streams[i].codec_type=='video'){
                videos.push(metadata.streams[i]);
            }
            if(metadata.streams[i].codec_type=='audio'){
                audios.push(metadata.streams[i]);
            }
            if(metadata.streams[i].codec_type=='subtitle'){
                //TODO: See above. Otherwise unnecessary right now.
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
            .addOptions(["-pass", "1", "-passlogfile", options.passlog])
            .addOptions(["-preset", options.preset])
            .addOptions(["-t", 120]) //Encode 120 frames only
            .addOptions("-tune animation")
            //.addOptions(["-report"])
            //escape hell for all characters in quote ":()[],"
            //[ has to be spawned to ffmpeg as '['
            .videoFilters({filter: "subtitles", options:`${file_in.replace(/:/g, "\\\\:").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/\[/g, "\'\[\'").replace(/\]/g, "\'\]\'").replace(/,/g, "\\,")}`})
            .on('end', function() {
                //console.log('Pass 1 is finished');
                callback();
                new ffmpeg(file_in)
                    .videoBitrate(options.bitrate)
                    .videoCodec('libx264')
                    .audioBitrate('128k')
                    .audioCodec('aac')
                    .addOptions(["-sn"])
                    .format('mp4')
                    .addOptions(["-pass", "2", "-passlogfile", options.passlog])
                    .addOptions(["-preset", options.preset])
                    .addOptions(["-t", 120])
                    .addOptions("-tune animation")
                    .videoFilters({filter: "subtitles", options:`${file_in.replace(/:/g, "\\\\:").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/\[/g, "\'\[\'").replace(/\]/g, "\'\]\'").replace(/,/g, "\\,")}`})
                    .on('error', function(err) {
                        console.log('an error happened: ' + err.message);
                    })
                    .on('progress', function(progress){
                        printProgress(progress, "Pass (2)");
                    })
                    .on('end', function(){
                        console.log('Pass 2 is finished');
                        callback();
                    })
                    .saveToFile(file_out);

            })
            .on('error', function(err) {
                console.log('an error happened: ' + err.message);
            })
            .on('progress', function(progress){
                printProgress(progress, "Pass (1)");
            })
            .on('start', function(commandLine) {
                console.log('Spawned Ffmpeg with command: ' + commandLine);
            })

            // save to file
            //On linux, use /dev/null
            .save('NUL');
            //.saveToFile(file_out);
    });



}
function printProgress(progress, message){
    if(message)
        process.stdout.write(`${message} \t`);
    if(progress.percent)
        process.stdout.write(`Progress: ${progress.percent}\t`);
    if(progress.frames)
        process.stdout.write(`Frame: ${progress.frames}\t`);
    if(progress.currentFps)
        process.stdout.write(`Fps: ${progress.currentFps}\t`);
    if(progress.targetSize)
        process.stdout.write(`Target size: ${progress.targetSize}\t`);
    if(progress.timemark)
        process.stdout.write(`Timemark: ${progress.timemark}\t`);
    if(progress.currentKbps)
        process.stdout.write(`Current kbps: ${progress.currentKbps}\t`);
    console.log(); //new line
}

module.exports = Transcoder;