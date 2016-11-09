/**
 * Created by Enic on 2016-11-07.
 */
//For now, the front end gui will be here. It will be very simplistic and only used as a placeholder, since it will be replaced by the uploads board.
//This will later be replaced by all control functionality for Fay and Ray
function Control(botsan) {
    this.botsan = botsan
    var http = require('http');
    var qs = require('querystring');
    this.json2html = require('node-json2html');
    var fs = require('fs');
    var app = http.createServer(handler);
    var io = require('socket.io')(app);
    var password = require('password-hash-and-salt');
    var users = [];
    if (fs.existsSync("./users.json")) {
        users = JSON.parse(fs.readFileSync('./users.json', 'utf8'));
    } else {
        botsan.saveUsers(users);
    }

    app.listen(8000);

    function handler(request, response) {

        if (request.method === "GET") {
            response.writeHeader(200, {"Content-Type": "text/html"});
            if (request.url === '/') {

                fs.readFile('./templates/top.html', 'utf8', function (err, data) {
                    if (err) {
                        return console.log(err);
                    }
                    response.write(data);
                    fs.readFile('./templates/bottom.html', 'utf8', function (err, data) {
                        if (err) {
                            return console.log(err);
                        }
                        response.write(getAnimeInHtml(botsan.anime_list));
                        response.write(data);
                        response.end();
                    });
                });
            } else if (request.url === '/ansi_up.js') {
                fs.readFile('./templates/ansi_up.js', 'utf8', function (err, data) {
                    if (err) {
                        return console.log(err);
                    }
                    response.write(data);
                    response.end();
                });
            }

            else {
                response.writeHead(404, 'Resource Not Found', {'Content-Type': 'text/html'});
                response.end('<!doctype html><html><head><title>404</title></head><body>404: Resource Not Found</body></html>');
            }
        }
        else if (request.method === "POST") {
            if (request.url === '/add') {

                var requestBody = "";
                request.on('data', function (data) {

                    requestBody += data;
                    if (requestBody.length > 1e7) {
                        response.writeHead(413, 'Request Entity Too Large', {'Content-Type': 'text/html'});
                        response.end('<!doctype html><html><head><title>413</title></head><body>413: Request Entity Too Large</body></html>');
                    }
                });
                request.on('end', function () {
                    var formData = qs.parse(requestBody);

                    // Verifying a hash

                    for (var i = 0; i < users.length; i++) {
                        var vrified = false;
                        var user = users[i];
                        password(formData.password).verifyAgainst(user.hash, function (error, verified) {
                            delete formData.password;
                            vrified = verified;
                            if (error) {
                                botsan.logError(error);
                                throw new Error('Something went wrong!');
                            }
                            if (!vrified) {
                                response.writeHead(403, {'Content-Type': 'text/html'});
                                response.end();
                            } else {
                                var missing = false;
                                response.writeHead(200, {'Content-Type': 'text/html'});
                                response.write('<!doctype html><html><head><title>response</title></head><body>');
                                if (!formData.title) {
                                    missing = true;
                                    response.write('Missing title!<br>');
                                }
                                if (!formData.prefix) {
                                    missing = true;
                                    response.write('Missing prefix!<br>');
                                }
                                if (!formData.regex) {
                                    missing = true;
                                    response.write('Missing regex!<br>');
                                }
                                if (!formData.nyaasearch) {
                                    missing = true;
                                    response.write('Missing nyaa search!<br>');
                                }
                                if (!formData.nyaauser) {
                                    missing = true;
                                    response.write('Missing nyaa user id!<br>');
                                }
                                if (!formData.uploadsID) {
                                    missing = true;
                                    response.write('Missing uploads ID!<br>');
                                }
                                if (!formData.quality) {
                                    missing = true;
                                    response.write('Missing resolution!<br>');
                                }

                                if (!missing) {
                                    formData.uploadsID = Number(formData.uploadsID);
                                    formData.quality = Number(formData.quality);
                                    formData.finished_episodes = [];
                                    var anime = new botsan.anime(formData.title, formData.prefix, formData.regex, formData.nyaasearch, formData.nyaauser, formData.uploadsID, formData.quality);
                                    if (botsan.addNewSeries(anime)) {
                                        response.write('Series was added to Ray!<br />' + JSON.stringify(formData));

                                        if (!Array.isArray(user.requested)) {
                                            user.requested = [];
                                        }
                                        user.requested.push(formData.uploadsID);
                                        botsan.saveUsers(users);
                                    } else {
                                        response.write('Series is already in the list');
                                    }

                                    response.end('</body></html>');


                                }

                            }
                        });
                        if (vrified)
                            break;
                    }


                });
            }
        }

        else {
            response.writeHead(404, 'Resource Not Found', {'Content-Type': 'text/html'});
            response.end('<!doctype html><html><head><title>404</title></head><body>404: Resource Not Found</body></html>');
        }

    }

    io.on('connection', function (socket) {
        botsan.myEmitter.on('writeData', () => {
            socket.emit('news', {application_status: botsan.application_status, episode_status: botsan.episode_status});
        });
        socket.on('my other event', function (data) {
            //console.log(data);
        });
    });

}


function getAnimeInHtml(animelist) {
    var transform = {
        "<>": "ul", "html": [
            {"<>": "li", "html": "Title: ${title}"},
            {"<>": "li", "html": "Prefix: ${prefix}"},
            {"<>": "li", "html": "Regex: ${regex}"},
            {"<>": "li", "html": "Nyaa Search: ${nyaasearch}"},
            {"<>": "li", "html": "Nyaa User: ${nyaauser}"},
            {"<>": "li", "html": "Uploads ID: ${uploadsID}"},
            {"<>": "li", "html": "Resolution: ${quality}"},
            {
                "<>": "li", "html": "Finished episodes: ${finished_episodes}", "children": function () {
                this.finished_episodes;
            }
            }
        ]
    };
    return ( json2html.transform(animelist, transform) );
}


module.exports = Control;