/**
 * Created by Enic on 2016-11-03.
 */
var Transcoder = require('./Transcoder.js');
var Botsan = require('./bot-san.js');
var botsan = new Botsan();
var Transcoder = new Transcoder(botsan);

var source = "C:/Users/Hani/Videos/[MK-Pn8] Sword Art Online II - 01v3 [BD 720p][Hi10][Dual][370C2D66].mkv";

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