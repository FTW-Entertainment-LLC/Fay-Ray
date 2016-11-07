/**
 * Created by Enic on 2016-11-07.
 */
//For now, the front end gui will be here. It will be very simplistic and only used as a placeholder, since it will be replaced by the uploads board.
function Control(botsan) {
    this.botsan = botsan
    var http = require('http');
    this.json2html = require('node-json2html');
    var fs = require('fs');

    http.createServer(function(request, response) {
        response.writeHeader(200, {"Content-Type": "text/html"});
        fs.readFile('./templates/top.html', 'utf8', function (err,data) {
            if (err) {
                return console.log(err);
            }
            response.write(data);
            fs.readFile('./templates/bottom.html', 'utf8', function (err,data) {
                if (err) {
                    return console.log(err);
                }
                response.write(getAnimeInHtml(botsan.anime_list));
                response.write(data);
                response.end();
            });
        });




    }).listen(8000);
}



function getAnimeInHtml(animelist){
    var transform = {"<>":"ul","html":[
        {"<>":"li","html":"Title: ${title}"},
        {"<>":"li","html":"Prefix: ${prefix}"},
        {"<>":"li","html":"Regex: ${regex}"},
        {"<>":"li","html":"Nyaa Search: ${nyaasearch}"},
        {"<>":"li","html":"Nyaa User: ${nyaauser}"},
        {"<>":"li","html":"Uploads ID: ${uploadsID}"},
        {"<>":"li","html":"Resolution: ${quality}"},
        {"<>":"li","html":"Finished episodes: ${finished_episodes}", "children":function(){
           this.finished_episodes;
        }}
    ]};
    return ( json2html.transform(animelist,transform) );
}



module.exports = Control;