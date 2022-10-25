const SlashCommand = require("../../base/SlashCommand.js");
const { SlashCommandBuilder } = require("@discordjs/builders");
const fetch = require("node-fetch");
const { EmbedBuilder } = require("discord.js");
const RandomColor = require("randomcolor");
const { sample } = require('lodash')

class Wiki extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "random",
      description: "Get a random animal",
      usage: "Use this command to post a random animal",
      enabled: true,
      permLevel: "User",
    });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description)
      .addSubcommand((subcommand) =>
        subcommand
          .setName("bird")
          .setDescription("Get a random bird")
      )
      .addSubcommand((subcommand) => 
        subcommand
          .setName("cat")
          .setDescription("Get a random cat")
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("dog")
          .setDescription("Get a random dog")
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("fox")
          .setDescription("Get a random fox")
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("kangaroo")
          .setDescription("Get a random kangaroo")
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("koala")
          .setDescription("Get a random koala")
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("panda")
          .setDescription("Get a random panda")
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("raccoon")
          .setDescription("Get a random raccoon")
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("otter")
          .setDescription("Get a random otter")
      )
  }

  async execute(interaction) {
    try {
      let theAnimal = interaction.options.getSubcommand();
      await interaction.deferReply()
      
      if (theAnimal == "otter"){
        var otterImages = await super.getGoogleImg("otters", null, Math.floor(Math.random() * 70))
        var anOtter = sample(otterImages)

        const embed = new EmbedBuilder()
          .setTitle("Random Otter")
          .setColor(RandomColor())
          .setImage(anOtter.link)
          .setDescription(sample(otterfacts))

        await interaction.editReply({ embeds: [embed] })

      } else {
        const res = await fetch(`https://some-random-api.ml/animal/${theAnimal}`);
        const data = await res.json()
        const embed = new EmbedBuilder()
          .setTitle(`Random ${theAnimal}`)
          .setImage(data.image)
          .setColor(RandomColor())
          .setDescription(data.fact)
        await interaction.editReply({ embeds: [embed] });
      }
    } catch (e) {
      await interaction.editReply({ content: "Something went wrong!", ephemeral: true });
      this.client.logger.log(e, "error");
    }
  }
}

const otterfacts = [
  "The scientific name for sea otters is *Enhydra lutris kenyoni*.", 
  "The sea otter is the largest member of the Mustelidae, or weasel family, and the only one which lives almost entirely in the water.", 
  "Sea otters can live up to 25 years of age, although the average lifespan is 10 to 12 years.", 
  "Although the sea otter is the smallest marine mammal, the average adult can be as large as 5 feet in length and weigh up to 70 lbs.", 
  "The average length of an adult female is 4 feet and average weight is 60 lbs.", 
  "At birth, sea otters weigh approximately 5 lbs and are 10 inches in length.", 
  "Sea otter fur ranges from brown to almost black with guard hairs that may be silver, light brown, or black.", 
  "As a sea otter ages, their hands and necks will lighten until almost white.", 
  "Sea otter fur is the finest of any mammal, consisting of 850,000 to 1 million hairs per square inch.", 
  "Sea otters are social animals who may float together in groups of less than 10 to more than 100, called rafts.", 
  "Otters usually swim on their backs but have been known to swim on their stomachs while traveling.", 
  "Sea otters have long flat tails and since the majority of their time is spent in the water, webbed hind feet which are perfect for swimming.", 
  "Retractable claws on a sea otter’s front paws allow the sea otter to grab food.", 
  "Sea otters have round heads, small eyes, and visible ears.", 
  "Sea otters are coastal, shallow water dwellers. Their habitat consists of two areas in these waters: the ocean floor where they find their food, and the ocean surface where they eat, groom, rest and social interactions occur.", 
  "Sea otters mainly eat benthic invertebrates such as clams, mussels, urchins, crabs, and fish. They must dive to capture their food, sometimes up to 250 feet.", 
  "Sea otters use “tools” such as a rock to open their hard-shelled prey.", 
  "Adult sea otters can eat 25 to 30 percent of their body weight per day in order to stay warm.", 
  "A sea otter becomes sexually mature at 3 to 6 years. A female’s pregnancy usually lasts 5 to 8 months and can have one pup per year.", 
  "Sea otter predators include humans, sharks, bears, eagles (on pups), and killer whales.", 
  "The sea otter spends most of its time in the water but, in some locations, comes ashore to sleep or rest.", 
  "Sea otters have webbed feet, water-repellent fur to keep them dry and warm, and nostrils and ears that close in the water.", 
  "Sea otters often float at the water's surface, lying on their backs in a posture of serene repose. They sleep this way, often gathered in groups.", 
  "Sea otters are the only otters to give birth in the water. Mothers nurture their young while floating on their backs. They hold infants on their chests to nurse them, and quickly teach them to swim and hunt.", 
  "Sea otters are meticulously clean. After eating, they wash themselves in the ocean, cleaning their coat with their teeth and paws.", 
  "Sea otters were hunted for their fur to the point of near extinction. Early in the 20th century only 1,000 to 2,000 animals remained. Today, 100,000 to 150,000 sea otters are protected by law.",
  "Thirteen different species of otter exist around the globe. The U.S. is home to two species: the sea otter and the North American river otter. River otters are much smaller -- averaging 10-30 pounds -- with a cylindrical body and small head. Sea otters weigh more -- around 45-90 pounds -- with large, furry faces.",
  "Otters are part of the Mustelidae family, which is a family of carnivorous mammals that includes skunks, weasels, wolverines and badgers. The sea otter is the largest member of the weasel family, yet the smallest marine mammal in North America.",
  "Approximately 90 percent of the world’s sea otters live in coastal Alaska. Many live in the waters surrounding public lands including Kodiak National Wildlife Refuge, Kenai Fjords National Park and Glacier Bay National Park. Southern sea otters range along the mainland coastline of California from San Mateo County to Santa Barbara County, and San Nicolas Island.",
  "Sea otters eat 25 percent of their body weight in food every day.",
  "Sea otters’ diet includes sea urchins, crabs, mussels, and clams, which they’re known to crack open with a rock and eat while floating in the water. To find food, sea otters may occasionally dive as deep as 250 feet and will use their sensitive whiskers to locate small prey inside crevices or their strong forepaws to dig for clams.",
  "Unlike most other marine mammals, otters lack a blubber layer. Instead they depend on their dense, water-resistant fur to provide insulation.",
  "To keep warm, sea otters spend a large portion of their days grooming and conditioning their fur. This traps air and heat next to their skin.",
  "An otter pup’s fur is so dense that it can’t dive underwater until it gets its adult fur. This comes in handy when mothers leave their pups safely floating on the water’s surface while they forage for food.",
  "Southern sea otters breed and pup year-round, while northern sea otter pups in Alaska are usually born in the spring. A newborn pup needs constant attention and will stay with its mother for six months until it develops survival skills.",
  "An otter’s lung capacity is 2.5 times greater than that of similar-sized land mammals. Sea otters have been known to stay submerged for more than 5 minutes at a time. River otters, however, can hold their breath for up to 8 minutes. The increased time underwater improves otters’ opportunity to sense prey and forage for food.",
  "The otter is one of the few mammals that use tools. A sea otter’s tool of choice: typically a rock that can be used as a hammer or anvil to break open hard-shelled prey. Ever wonder where otters actually store these tools for safe keeping? They have a loose patch of skin under their armpit to store both the food they’ve foraged and their rock to crack it open.",
  "A group of resting otters is called a raft. Otters love to rest in groups. Researchers have seen concentrations of over 1,000 otters floating together. To keep from drifting away from each other, sea otters will wrap themselves up in seaweed, forming something that resembles a raft."
]

module.exports = Wiki;
