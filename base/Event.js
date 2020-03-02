const qs = require( 'querystring' )
const fetch = require('node-fetch')

class Event {
    constructor(client, {
      name = null,
      eventType = "",
      qualifier = "",
      description = "No description provided.",
      category = "Miscellaneous",
      usage = "No usage provided.",
      enabled = true,
      guildOnly = false,
      showHelp = false,
      permLevel = "User"
    }) {
      this.client = client;
      this.conf = { enabled, guildOnly, permLevel, showHelp };
      this.help = { name, eventType, qualifier, description, category, usage };
    }

    pause(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    async getGoogleImg(searchTerm, isGif, start=1, safeSearch = true){
      var params = {
        q:  searchTerm,
        safe: (safeSearch) ? 'high' : 'off',
        cx: this.client.config.google_cxid,
        key: this.client.config.google_key,
        searchType: 'image',
        start: start
      }
      if (isGif) params.fileType = 'gif';
      var url = 'https://www.googleapis.com/customsearch/v1/?' + qs.stringify( params );
      return await fetch(url).then(res => res.json()).then(json => {
        return json.items
      })
    }
  }
  module.exports = Event;