
class Episode {
  /**
   * @author Hani Mayahi <hani.mayahi94@gmail.com>
   * @since 1.1.0
   * @param {string} title       - The title of the nyaa listing
   * @param {number} episodeno   - Episode number of the nyaa listing
   * @param {string} torrenturl  - Torrent url of the nyaa listing
   * @param {anime} parent       - Reference to the parent anime object.
   */
  constructor(title, torrenturl, episodeno, parent) {
    this.title = title;
    this.episodeno = episodeno;
    this.torrenturl = torrenturl;
    this.parent = parent;
  };
}

module.exports = Episode;