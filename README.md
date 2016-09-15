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
