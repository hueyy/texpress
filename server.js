const fs = require('fs')
const util = require('util')

const messenger = require('facebook-chat-api')
const express = require('express')
const readline = require('readline')
const morgan = require('morgan')

require('dotenv').config()

const { initMessengerListener, handleSMS } = require('./handleSMS')
const sendOTP = require('./OTP')

const app = express()

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const getApprovalCode = (error) => new Promise(resolve => {
  console.log('Pls approve login on phone')
  rl.on('line', (line) => {
    error.continue(line)
    rl.close()
    resolve()
  })
})

app.use(express.json())
app.use(morgan('dev'))

const loginToMessenger = ({ appState, email, password }) => new Promise((resolve, reject) => {
  let loginObj = { email, password }
  if(appState){
    loginObj = { appState }
  }

  messenger(loginObj, async(error, api) => {
    if(error){
      switch (error.error) {
        case 'login-approval':
          try {
            await getApprovalCode(error)
          } catch (error) {
            return reject(error)
          }
          console.log('resolved login-approval')
          return
        default:
          return reject(error)
      }
    } else {
      console.log('no error')
      return resolve(api)
    }
  })
})

const init = async () => {

  let api
  try {
    let appState = null
    if(fs.existsSync('appstate.json')){
      appState = JSON.parse(fs.readFileSync('appstate.json', 'utf8'))
    }
    api = await loginToMessenger({
      appState,
      email: process.env.FACEBOOK_EMAIL,
      password: process.env.FACEBOOK_PASSWORD
    })
  } catch (error) {
    throw error
  }

  fs.writeFileSync('appstate.json', JSON.stringify(api.getAppState()))

  api.getThreadList = util.promisify(api.getThreadList)
  api.sendMessage = util.promisify(api.sendMessage)
  api.getUserInfo = util.promisify(api.getUserInfo)
  api.markAsRead = util.promisify(api.markAsRead)
  api.sendTypingIndicator = util.promisify(api.sendTypingIndicator)
  
  const threadHistoryPromisified = api.getThreadHistory
  api.getThreadHistory = undefined
  api.getThreadHistory = (threadID, amount) => new Promise((resolve, reject) => {
    threadHistoryPromisified(threadID, amount, undefined, (error, history) => {
      console.log(error, history)
      if(error){
        return reject(error)
      }
      return resolve(history)
    })
  })

  initMessengerListener(api)

  app.post('/sms', handleSMS(api))
  app.post('/otp', sendOTP)

  app.listen(8000, () => console.log('Listening on 8000'))
}

init()
