const _ = require('lodash')

class EmojiAssistant {
    static IndexToEmoji(number) {
        switch (number) {
        case 0:
            return "1️⃣"
        case 1:
            return "2️⃣"
        case 2:
            return "3️⃣"
        case 3:
            return "4️⃣"
        case 4:
            return "5️⃣"
        case 5:
            return "6️⃣"
        case 6:
            return "7️⃣"
        case 7:
            return "8️⃣"
        case 8:
            return "9️⃣"
        case 9:
            return "🔟"
        }
    }

    static EmojiToIndex(emoji) {
        switch (emoji) {
        case "1️⃣":
            return 0 
        case "2️⃣":
            return 1 
        case "3️⃣":
            return 2 
        case "4️⃣":
            return 3 
        case "5️⃣":
            return 4 
        case "6️⃣":
            return 5 
        case "7️⃣":
            return 6 
        case "8️⃣":
            return 7 
        case "9️⃣":
            return 8 
        case "🔟":
            return 9
        }
    }
}

module.exports = EmojiAssistant