//TODO: Switch parameters to object so the function is more modular
//TODO: All functions related to the anime object goes here
class Anime {
  /**
   * Creates a anime object
   * @author Hani Mayahi <hani.mayahi94@gmail.com>
   * @since 1.1.0
   * @param {string} title                - Anime title
   * @param {string} prefix               - AnimeFTW prefix
   * @param {string} regex                - Regex to match the nyaa entries and
   * group episode number.
   * @param {string} nyaasearch           - Nyaa search field
   * @param {number} nyaauser             - Nyaa user to use search in
   * @param {number} uploadsID            - uploads board ID
   * @param {number} quality              - Quality for the series to be encoded
   * in. Can be 480, 720 or 1080.
   * @param {number[]} finished_episodes  - List of finished episodes (Which
   * will not be encoded again)
   * @param {string} torrenturl           - The url to the torrent
   */
  constructor(title, prefix, regex, nyaasearch, nyaauser,
              uploadsID, quality, finished_episodes, torrenturl) {
    this.title = title;
    this.prefix = prefix;
    this.regex = regex;
    this.uploadsID = uploadsID;
    this.quality = quality;
    this.finished_episodes = [];
    this.finished_encodes = [];
    if (finished_episodes) {
      this.finished_episodes = finished_episodes;
    }
    if (!torrenturl) {
      this.nyaauser = nyaauser;
      this.nyaasearch = nyaasearch;
    } else {
      this.torrenturl = torrenturl;
    }

  };
}

module.exports = Anime;