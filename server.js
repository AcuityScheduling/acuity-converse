const express = require('express')
const bodyParser = require('body-parser')
const runLogic = require('./src/runLogic')
const sendLogicResult = require('./src/sendLogicResult')

const app = express()
const {PORT = 3022} = process.env

app.use(bodyParser.json())

app.post('/', ({body: {event_type, data}, hostname}, res) => {
  console.log(`[${hostname}]: "${event_type}" webhook received from Init.ai`)

  if (event_type === 'LogicInvocation') {
    runLogic(data).then(sendLogicResult(data.payload))
      .catch((error) => {console.log('[ERROR]:\n', error)})
  }

  res.sendStatus(200)
})

app.listen(PORT, () => console.log(`Webhook server is running on port ${PORT}!`))
