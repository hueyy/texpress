const _ = require('lodash')
const fcm = require('./firebase')

const sendOTP = async (req, res) => {
  let otp = ''
  for(let i = 0; i < 6; i++){
    otp += `${_.random(0, 9)}`
  }
  await fcm.promisifiedSend(`Your OTP is ${otp}`)
  res.json({ success: true, otp })
}

module.exports = sendOTP
