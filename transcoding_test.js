/**
 * Created by Enic on 2016-11-03.
 */
var Transcoder = require('./includes/transcoder.js');
var Botsan = require('./includes/bot-san.js');
var Anime = require('./models/Anime.js');
var Episode = require('./models/Episode.js');
var botsan = new Botsan();
var transcoder = new Transcoder(botsan);

var source = "C:/Users/Hani/Videos/[HorribleSubs] Berserk - 01 [1080p].mkv";
var anime = new Anime("Berserk", "berserk", "regex", "berserk", 0, 0, 1080);
var episode = new Episode("[HorribleSubs] Berserk - 01 [1080p].mkv", "http://nyaa.se", 1, anime);

transcoder.run(source, episode, function(err){
    if(err)
        throw err;
    console.log("ep finished")
});

/*Transcoder.transcode('C:/Users/Hani/Videos/[HorribleSubs] Berserk - 01 [1080p].mkv', 'C:/Users/Hani/Videos/berserk_1080p_1_ns.mp4', 1080, Transcoder.options, function(err){
    //TODO: Fix simultaneous encodes
    if(err)
        throw err;
    Transcoder.transcode('C:/Users/Hani/Videos/[HorribleSubs] Berserk - 01 [1080p].mkv', 'C:/Users/Hani/Videos/berserk_720p_1_ns.mp4', 720, Transcoder.options, function(err){
        if(err)
            throw err;
        Transcoder.transcode('C:/Users/Hani/Videos/[HorribleSubs] Berserk - 01 [1080p].mkv', 'C:/Users/Hani/Videos/berserk_1_ns.mp4', 480, Transcoder.options, function(err){
            if(err)
                throw err;
        });
    });
});*/

/*Transcoder.transcode(source, 'C:/Users/Hani/Videos/sao_720p_1_ns.mp4', 720, Transcoder.options, function(err){
    if(err)
        throw err;
    Transcoder.transcode(source, 'C:/Users/Hani/Videos/sao_1_ns.mp4', 480, Transcoder.options, function(err){
        if(err)
            throw err;
    });
});*/