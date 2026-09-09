import onChange from 'on-change';
import jsonfile from 'jsonfile';
const configFileName = process.env.IS_ON_FLY ? "/data/config.json" : "./config.json";

const configFile = jsonfile.readFileSync(configFileName);

const watchedObj = onChange(configFile, () => {
    jsonfile.writeFileSync(configFileName, watchedObj);
});

export default watchedObj
