const fetch = require('node-fetch');
const _ = require('lodash');
const BASE_URL = 'https://api.urbandictionary.com/v0';

class UrbanDictionary {
    static async search(searchTerm){
         try {
            let query = new URLSearchParams()
            query.set("term", searchTerm)
            var res = await fetch(`${BASE_URL}/define?${query.toString()}`);
            var searchResults = await res.json();
            if (searchResults.list.length === 0) return [];
            var exactMatches = _.filter(searchResults.list, d => d.word.toLowerCase() === searchTerm.toLowerCase());
            if (exactMatches.length === 0) return searchResults.list;
            return exactMatches;
         } catch (error) {
             console.log(error);
         }
     }

     static async randomSearch(){
        try {
           var res = await fetch(`${BASE_URL}/random`);
           var searchResults = await res.json();
           return searchResults.list;
        } catch (error) {
            console.log(error);
        }
    }

    static async top(searchTerm){
        var fullList = await this.search(searchTerm);
        var sorted = fullList.sort((a, b) => (b.thumbs_up - b.thumbs_down) - (a.thumbs_up - a.thumbs_down));
        return sorted[0];
    }

    static async random(searchTerm = null){
        if (!searchTerm) {
            var randos = await this.randomSearch();
            return randos[0];
        } else {
            var results = await this.search(searchTerm);
            return _.sample(results);
        }
    }
}

module.exports = UrbanDictionary