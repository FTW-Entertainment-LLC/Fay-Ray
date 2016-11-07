/**
 * Created by Enic on 2016-11-07.
 * Used to create a new user and password.
 * node password [user] [password]
 */
var password = require('password-hash-and-salt');
var fs = require('fs');
var users = [];

if (fs.existsSync("./users.json")) {
    users = JSON.parse(fs.readFileSync('./users.json', 'utf8'));
}else{
    saveUsers();
}

if(process.argv[2] && process.argv[3]){
    password(process.argv[3]).hash(function(error, hash) {
        if(error)
            throw new Error('Something went wrong!');

        // Store hash (incl. algorithm, iterations, and salt)
        users.push({"username": process.argv[2], "hash": hash});

        saveUsers();
    });
}

function saveUsers(){
    fs.writeFile("./users.json", JSON.stringify(users, null, 4), function (err) {
        if (err) {
            throw err;
        }
    });
}