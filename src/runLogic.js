const InitClient = require('initai-node')

module.exports = function runLogic(eventData) {
  return new Promise((resolve) => {
    const client = InitClient.create(eventData, {succeed: resolve})

    // Add your custom logic here!
    client.addTextResponse('Responding from `runLogic.js`!')
    client.done()
  })
}
