/**
 * Created by Enic on 2016-11-05.
 */
var assert = require('assert');
var bsan = require('../includes/bot-san.js');
var Anime = require('../models/Anime.js');
var Episode = require('../models/Episode.js');
var botsan = new bsan();
var anime = new Anime("Love Live! Sunshine!!", "lovelivesunshine", "\\[FFF\\] Love Live! Sunshine!! - (\\d{2})(?:v\\d)?.*.mkv", "Love+Live%21+Sunshine%21%21", 73859, 2570, 720, [2,3,4]);
var ep = new Episode("Title", "https://www.nyaa.se/?page=download&tid=867606", 1,  anime);
describe('Module Bot-san', function() {

    describe('Episode()', function() {
        it('should return a episode object with a Title, Episode number, torrent url and a parent reference', function() {

            assert.equal(ep.title, "Title");
            assert.equal(ep.episodeno, 1);
            assert.equal(ep.torrenturl, "https://www.nyaa.se/?page=download&tid=867606");
            assert.equal(ep.parent, anime);
        });
    });
    describe('Anime()', function() {
        it('should return a anime object with a Title, prefix, regex, nyaasearch, nyaauser, uploadsID, quality, array of finished episodes', function() {
            assert.equal(anime.title, "Love Live! Sunshine!!");
            assert.equal(anime.prefix, "lovelivesunshine");
            assert.equal(anime.regex, "\\[FFF\\] Love Live! Sunshine!! - (\\d{2})(?:v\\d)?.*.mkv");
            assert.equal(anime.nyaasearch, "Love+Live%21+Sunshine%21%21");
            assert.equal(anime.nyaauser, 73859);
            assert.equal(anime.uploadsID, 2570);
            assert.equal(anime.quality, 720);
            assert.deepEqual(anime.finished_episodes, [2,3,4]);
        });
    });
    describe('createFilename()', function() {
        it('should return null when the values are not present', function(){
            assert.equal(botsan.createFilename(), null);
        });
        it('should return null when only one value is present', function(){
            assert.equal(botsan.createFilename("lovelivesunshine"), null);
            assert.equal(botsan.createFilename(null, 1), null);
            assert.equal(botsan.createFilename(null, null, 480), null);
        });
        it('should return a valid filename', function(){
            assert.equal(botsan.createFilename("lovelivesunshine", 1, 480), "lovelivesunshine_1_ns.mp4");
            assert.equal(botsan.createFilename("lovelivesunshine", 4, 720), "lovelivesunshine_720p_4_ns.mp4");
            assert.equal(botsan.createFilename("lovelivesunshine", 12, 1080), "lovelivesunshine_1080p_12_ns.mp4");
        });
    });

    describe('sendNotification()', function() {
        it('should return false when config NOTIFICATIONS is set to false', function(){
            assert.equal(botsan.sendNotification("Test"), false);
        });

    });

    describe('updateData()', function() {
        botsan.last_refresh = new Date().getTime(); //Don't console.log
        var currentlength = botsan.episode_status.length;
        var index = botsan.updateData({ Episode: ep, Status: "In Torrent Queue", Progress: 0 });
        it('should add the object in botsan.episode_status', function(){
            assert.equal(botsan.episode_status.length, currentlength+1);
        });
        it('should return the index number of the new object (0 in this case)', function(){
            assert.equal(index, 0);
        });

    });



});