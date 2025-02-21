const fetch = require("node-fetch");

class SlashCommand {
    constructor(client, {
      name = null,
      description = "No description provided.",
      usage = "No usage provided.",
      enabled = true,
      permLevel = "User"
    }) {
      this.client = client;
      this.conf = { enabled, permLevel };
      this.help = { name, description, usage };
    }

    pause(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    async getGoogleImg(searchTerm, isGif, start=1, safeSearch = true){
      let query = new URLSearchParams()
      query.set("key", this.client.config.google_key)
      query.set("cx", this.client.config.google_cxid)
      query.set("searchType", "image")
      query.set("q", searchTerm)
      query.set("start", start)
      query.set("safe", (safeSearch) ? 'high' : 'off')      
      if (isGif) query.set("fileType",'gif');
      else query.set("fileType",'jpg,png,webp,gif')

      let res = await fetch(`https://www.googleapis.com/customsearch/v1?${query.toString()}`)
      let json = await res.json()
      return json.items
    }
    
    async getRandomGoogleImg(searchTerm, isGif, safeSearch = true){
      let results = await this.getGoogleImg(searchTerm, isGif, Math.floor(Math.random() * 25), safeSearch)
      return results[Math.floor(Math.random() * results.length)]
    }
  }
  module.exports = SlashCommand;