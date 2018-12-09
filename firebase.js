const FCM = require('fcm-node')

const TO_REGISTRATION_TOKEN = process.env.TO_REGISTRATION_TOKEN
const FIREBASE_SERVER_KEY = process.env.FIREBASE_SERVER_KEY

const fcm = new FCM(FIREBASE_SERVER_KEY)
fcm.promisifiedSend = (msgText) => new Promise((resolve, reject) => {
  console.log({
    to: TO_REGISTRATION_TOKEN,
    data: {
      content: msgText
    }
  })
  fcm.send({
    to: TO_REGISTRATION_TOKEN,
    data: {
      content: msgText
    }
  }, (error, response) => {
    if(error){
      return reject(error)
    }
    return resolve(response)
  })
})

module.exports = fcm
