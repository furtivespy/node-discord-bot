const Bugsnag = require('@bugsnag/js')

class BugsnagLogger {
  constructor (apiKey, releaseStage = 'development') {
    this.logger = require("./Logger.js");
    this.bugsnagClient = Bugsnag.start({
      apiKey: apiKey,
      releaseStage: releaseStage?.trim() || 'development'
    })
  }


  log (content, type = "log") {
    if (type === "error") {
      this.bugsnagClient.notify(content)
      return this.logger.log(content, type)
    } else {
      return this.logger.log(content, type)
    }
  }
  
  error (content) {
    return this.log(content, "error");
  }
  
  warn (content) {
    return this.log(content, "warn");
  }
  
  debug (content) {
    return this.log(content, "debug");
  } 
  
  cmd (content) {
    return this.log(content, "cmd");
  } 
}

module.exports = (key, releaseStage) => { return new BugsnagLogger(key, releaseStage) };