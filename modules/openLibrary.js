const fetch = require("node-fetch");
const { EmbedBuilder } = require("discord.js");

async function BookSearch(terms) {
  const query = new URLSearchParams();
  query.set("q", terms);
  const results = await fetch(
    `https://openlibrary.org/search.json?${query.toString()}`,
    {
      headers: {
        accept: "application/json",
        "user-agent": "Bender Discord Bot (bender@furtivespy.com)"
      },
    }
  );
  const books = await results.json();
  return books.docs;
}

async function BookDetails(key){
  const bookResults = await fetch(
    `https://openlibrary.org${key}.json`,
    {
      headers: {
        accept: "application/json",
        "user-agent": "Bender Discord Bot (bender@furtivespy.com)"
      },
    }
  );
  return await bookResults.json();
}

async function GetCombinedBookInfo(terms) {
  const searchResults = await BookSearch(terms);
  
  if (searchResults && searchResults.length > 0) {
    searchItem = searchResults[0];
  } else {
    return null
  }

  const bookData = await BookDetails(searchItem.key)

  return { searchItem, bookData };
}

async function GetBookEmbed(term) {
  const info = await GetCombinedBookInfo(term)
  const links = []
  if (info.searchItem.id_google?.length >0){
    info.searchItem.id_google.slice(0,4).forEach(id => {
      links.push({
        name: "Google Books",
        url: `https://books.google.com/books?id=${id}`
      });
    });
  }
  if (info.searchItem.id_goodreads?.length > 0){
    info.searchItem.id_goodreads.slice(0,3).forEach(id => {
      links.push({
        name: "Goodreads",
        url: `https://www.goodreads.com/book/show/${id}`
      });
    });
  }
  if (info.searchItem.id_librarything?.length > 0){
    links.push({
      name: "LibraryThing",
      url: `https://www.librarything.com/work/${info.searchItem.id_librarything[0]}`
    })
  }
  if (info.searchItem.id_amazon?.length > 0){
    info.searchItem.id_amazon.slice(0,2).forEach(id => {
      links.push({
        name: "Amazon",
        url: `https://www.amazon.com/dp/${id}`
      });
    });
  }
  const embed = new EmbedBuilder()
  embed.setAuthor({
    name: info.searchItem.author_name[0],
    url: `https://openlibrary.org/authors/${info.searchItem.author_key[0]}`,
  })
  embed.setTitle(info.searchItem.title)
  embed.setURL(`https://openlibrary.org${info.searchItem.key}`)
  if (info.bookData.description && info.bookData.description.value) {
    embed.setDescription(info.bookData.description.value)
  } else if (info.bookData.description) {
    embed.setDescription(info.bookData.description)
  }
  embed.setImage(`https://covers.openlibrary.org/b/id/${info.searchItem.cover_i}-L.jpg`)
  embed.setThumbnail(`https://covers.openlibrary.org/b/id/${info.searchItem.cover_i}-L.jpg`)
  embed.setColor("#f58300")
  embed.setFooter({
    text: `First Published in ${info.searchItem.first_publish_year} | Rating: ${Math.floor(info.searchItem.ratings_average * 10) / 10}`,
  })
  if (info.searchItem.first_sentence?.length > 0){
    embed.addFields(
      {
        name: "First Sentence",
        value: info.searchItem.first_sentence.map(sentence => `• ${sentence}`).join('\n').slice(0, 1024),
        inline: false
      },
    );
  }
  if (info.bookData.excerpts?.length > 0){
    embed.addFields(
      {
        name: "Excerpts",
        value: info.bookData.excerpts.map(excerpt => `• ${excerpt.excerpt}`).join('\n').slice(0, 1024),
        inline: false
      },
    );
  }
  if (links.length > 0){
    embed.addFields({
      name: "Links",
      value: links.map(link => `• [${link.name}](${link.url})`).join('\n').slice(0, 1024),
      inline: true
    });
  }
  if (info.bookData.links && info.bookData.links.length > 0){
    embed.addFields({
      name: "More Links",
      value: info.bookData.links.map(link => `• [${link.title}](${link.url})`).join('\n').slice(0, 1024),
      inline: true
    });
  }
 
  return embed
}

module.exports = {GetBookEmbed, GetCombinedBookInfo, BookSearch}