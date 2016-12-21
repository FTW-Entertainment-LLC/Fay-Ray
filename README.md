# Fay & Ray
Fay & Ray are the autonomous bots for AnimeFTW. The bots will download, encode and upload episodes to AnimeFTW as they get released to the nyaa feed. The only human interaction needed is to QC the episodes the bots uploads, which we will have an interface for. If they are proven to be very accurate, they could eventually be adding episodes all on their own.

## Fay
Fay is the who takes care of most of the tasks except downloading. Fay will fetch all episodes that are downloaded from Ray, encode them and upload them to 
the video server.

## Ray
Ray is the one who will listen to a rss feed, and download series & episodes.

## How to use
1. Clone or download the repository.
2. Run `npm install` to install the dependencies.
3. Setup the config.ini file and place it in the root folder. See example folder.
4. Setup Ray's savefile, see example folder.
5. Run `node Fay` or `node Ray` (Fay may need root privileges due to CancerCoder)

## Contributing
We don't have anyone else working on this at the moment, but hey we might get some more devs in the future.
### Code Contributions
Just make sure you're not working on something someone else is, see the issues for who's assigned.
Assign yourself to a issue before you start working on it.

Make sure to create tests for every new function you make. (See the test folder)

#### Coding style:
As of 2016-12-18 I use this coding style:


http://nodeguide.com/style.html

With some exceptions, when declaring variables, use `let` and `const` instead of `var`

Older code does however not use this style and has to be accommodated to ASAP.
### Running tests
To run the tests, make sure you have the npm dependencies installed. (run `npm install`)

```sh
npm test
```