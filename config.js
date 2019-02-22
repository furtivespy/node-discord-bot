const onChange = require('on-change')
const jsonfile = require('jsonfile')

const configFile = jsonfile.readFileSync("./config.json");

const watchedObj = onChange(configFile, () => {
    jsonfile.writeFileSync("./config.json", watchedObj);
});

module.exports = watchedObj
