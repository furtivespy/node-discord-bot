const Command = require('../../base/Command.js')
const _ = require('lodash')


const rules = [
    { Num: 1, Rule: "Once you have their money, you never give it back."},
    { Num: 2, Rule: "The best deal is the one that brings the most profit."},
    { Num: 3, Rule: "Never pay more for an acquisition than you have to."},
    { Num: 6, Rule: "Never allow family to stand in the way of opportunity."},
    { Num: 7, Rule: "Keep your ears open."},
    { Num: 8, Rule: "Small print leads to large risk."},
    { Num: 9, Rule: "Opportunity plus instinct equals profit."},
    { Num: 10, Rule: "Greed is eternal."},
    { Num: 13, Rule: "Anything worth doing is worth doing for money."},
    { Num: 16, Rule: "A deal is a deal... until a better one comes along."},
    { Num: 17, Rule: "A contract is a contract is a contract... but only between Ferengi."},
    { Num: 18, Rule: "A Ferengi without profit is no Ferengi at all."},
    { Num: 19, Rule: "Satisfaction is not guaranteed."},
    { Num: 21, Rule: "Never place friendship above profit."},
    { Num: 22, Rule: "A wise man can hear profit in the wind."},
    { Num: 27, Rule: "There is nothing more dangerous than an honest businessman"},
    { Num: 28, Rule: "Whisper your way to success."},
    { Num: 31, Rule: "Never make fun of a Ferengi's mother."},
    { Num: 33, Rule: "It never hurts to suck up to the boss."},
    { Num: 34, Rule: "War is good for business."},
    { Num: 35, Rule: "Peace is good for business."},
    { Num: 40, Rule: "She can touch your lobes, but never your latinum."},
    { Num: 41, Rule: "Profit is its own reward."},
    { Num: 44, Rule: "Never confuse wisdom with luck."},
    { Num: 47, Rule: "Never trust a man wearing a better suit than your own."},
    { Num: 48, Rule: "The bigger the smile, the sharper the knife."},
    { Num: 52, Rule: "Never ask when you can take."},
    { Num: 57, Rule: "Good customers are as rare as latinum. Treasure them."},
    { Num: 58, Rule: "There is no substitute for success."},
    { Num: 59, Rule: "Free advice is seldom cheap."},
    { Num: 60, Rule: "Keep your lies consistent."},
    { Num: 62, Rule: "The riskier the road, the greater the profit."},
    { Num: 65, Rule: "Win or lose, there's always Hupyrian beetle snuff."},
    { Num: 75, Rule: "Home is where the heart is, but the stars are made of latinum."},
    { Num: 76, Rule: "Every once in a while, declare peace. It confuses the hell out of your enemies."},
    { Num: 79, Rule: "Beware of the Vulcan greed for knowledge."},
    { Num: 82, Rule: "The flimsier the product, the higher the price."},
    { Num: 85, Rule: "Never let the competition know what you're thinking."},
    { Num: 89, Rule: "Ask not what your profits can do for you, but what you can do for your profits."},
    { Num: 94, Rule: "Females and finances don't mix."},
    { Num: 97, Rule: "Enough ... is never enough."},
    { Num: 98, Rule: "Every man has his price."},
    { Num: 99, Rule: "Trust is the biggest liability of all."},
    { Num: 102, Rule: "Nature decays, but latinum lasts forever."},
    { Num: 103, Rule: "Sleep can interfere with your lust for latinum."},
    { Num: 104, Rule: "Faith moves mountains ... of inventory."},
    { Num: 106, Rule: "There is no honor in poverty."},
    { Num: 109, Rule: "Dignity and an empty sack is worth the sack."},
    { Num: 111, Rule: "Treat people in your debt like family... exploit them."},
    { Num: 112, Rule: "Never have sex with the boss's sister."},
    { Num: 113, Rule: "Always have sex with the boss."},
    { Num: 121, Rule: "Everything is for sale, even friendship."},
    { Num: 123, Rule: "Even a blind man can recognize the glow of latinum."},
    { Num: 125, Rule: "You can't make a deal if you're dead."},
    { Num: 139, Rule: "Wives serve, brothers inherit."},
    { Num: 141, Rule: "Only fools pay retail."},
    { Num: 144, Rule: "There's nothing wrong with charity... as long as it winds up in your pocket."},
    { Num: 162, Rule: "Even in the worst of times, someone turns a profit."},
    { Num: 168, Rule: "Whisper your way to success."},
    { Num: 177, Rule: "Know your enemies... but do business with them always."},
    { Num: 181, Rule: "Not even dishonesty can tarnish the shine of profit."},
    { Num: 189, Rule: "Let others keep their reputation. You keep their latinum."},
    { Num: 190, Rule: "Hear all, trust nothing."},
    { Num: 192, Rule: "Never cheat a Klingon ... unless you can get away with it."},
    { Num: 194, Rule: "It's always good to know about new customers before they walk in your door."},
    { Num: 202, Rule: "The justification for profit is profit."},
    { Num: 203, Rule: "New customers are like razor-toothed gree worms. They can be succulent, but sometimes they bite back."},
    { Num: 208, Rule: "Sometimes the only thing more dangerous than the question is an answer."},
    { Num: 211, Rule: "Employees are the rungs on the ladder of success. Don't hesitate to step on them."},
    { Num: 214, Rule: "Never begin a negotiation on an empty stomach."},
    { Num: 217, Rule: "You can't free a fish from water."},
    { Num: 218, Rule: "Always know what you're buying."},
    { Num: 223, Rule: "Beware the man who doesn't make time for oo-mox."},
    { Num: 229, Rule: "Latinum lasts longer than lust."},
    { Num: 236, Rule: "You can't buy fate."},
    { Num: 239, Rule: "Never be afraid to mislabel a product."},
    { Num: 242, Rule: "More is good. All is better."},
    { Num: 255, Rule: "A wife is a luxury ... a smart accountant a necessity."},
    { Num: 261, Rule: "A wealthy man can afford anything except a conscience."},
    { Num: 266, Rule: "When in doubt, lie."},
    { Num: 263, Rule: "Never let doubt interfere with your lust for latinum."},
    { Num: 284, Rule: "Deep down, everyone's a Ferengi."},
    { Num: 285, Rule: "No good deed ever goes unpunished."},
  ]

const keywords = [
    "ferengi",
    "money",
    "profit",
    "discount",
    "sale",
    "latinum",
    "cash"
]

class Ferengi extends Command {
    constructor(client){
        super(client, {
            name: "ferengi",
            description: "Bot responds W/ Rule of Acquisition when there is money talk",
            category: "Fun",
            usage: "If certain words are used in chat, the bot will give a Rule of Acquision to keep the business talk going",
            enabled: true,
            guildOnly: true,
            allMessages: true,
            showHelp: false,
            aliases: [],
            permLevel: "User"
          })
    }

    async run (message, args, level) {
        try {
            if (!message.command) {
                var words = message.content.trim().toLowerCase().split(/ +/g)
                if(_.intersection(keywords, words).length === 0) return
            }
            var randoRule = _.sample(rules)
            var ferengiImage = _.sample(await super.getGoogleImg("ferengi"))
            message.channel.send({embed: {
                title: `Ferengi Rule of Acquisition #${randoRule.Num}`,
                description: randoRule.Rule,
                color: 2903556,
                thumbnail: { url: (ferengiImage) ? ferengiImage.link : "" }
            }} )
        } catch (e) {
            this.client.logger.log(e,'error')
        }
    }
}

module.exports = Ferengi