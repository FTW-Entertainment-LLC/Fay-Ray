/**
 * Created by Enic on 2016-11-05.
 */
var assert = require('assert');
var bsan = require('../includes/bot-san.js');
var botsan = new bsan();

describe('Module Bot-san', function() {

    describe('Episode()', function() {
        it('should return a episode object with a Title, Episode number, torrent url and a parent reference', function() {
            var ep = new botsan.Episode("Title", "https://www.nyaa.se/?page=download&tid=867606", 1,  null);
            assert.equal(ep.title, "Title");
            assert.equal(ep.episodeno, 1);
            assert.equal(ep.torrenturl, "https://www.nyaa.se/?page=download&tid=867606");
            assert.equal(ep.parent, null);
        });
    });
    describe('Anime()', function() {
        it('should return a anime object with a Title, prefix, regex, nyaasearch, nyaauser, uploadsID, quality, array of finished episodes', function() {
            var anime = new botsan.anime("Love Live! Sunshine!!", "lovelivesunshine", "\\[FFF\\] Love Live! Sunshine!! - (\\d{2})(?:v\\d)?.*.mkv", "Love+Live%21+Sunshine%21%21", 73859, 2570, 720, [2,3,4]);
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

});